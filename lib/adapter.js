import { ApiError, listModels, streamTurn } from "./api/client.js";
import { BlockTranslator } from "./convert/blocks.js";
import { prepareResponsesRequest } from "./convert/request.js";
import { readReasoningReplay } from "./convert/reasoning.js";
import { accountScope, replayOutput, sessionCacheKey } from "./convert/replay.js";
import { withCredentialFileLock } from "./auth/file-lock.js";
import "./auth/protocol.js";
import { describableModels, describeModel, effortLabel } from "./models/describe.js";
import { ROUTE_MAX_CONTEXT_WINDOW, SERVED_MODELS, servedRecord } from "./models/served.js";
import { readModelOverrides, writeModelOverrides } from "./models/switches.js";
import { defaultContextWindow, isContextWindow } from "./models/context.js";
import { RefreshRefusedError } from "./auth/refresh.js";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
// src/adapter.ts
/**
* The harness-facing adapter for a ChatGPT plan.
*
* This is the only module that knows both vocabularies. Everything below it —
* the sign-in protocol, the request translation, the block numbering — is
* deliberately independent of the harness so it can be tested without mounting
* one; everything above it is the harness, which knows nothing about OpenAI's
* stream format.
*
* Three behaviours here are policy rather than plumbing:
*
* - **Not being signed in is not an error.** The catalog is empty and the
*   provider reports itself unconfigured, because a route with no account is a
*   route waiting for one, not a broken route. Failing here would make the
*   model selector unusable before the first sign-in.
* - **A listing failure is not fatal to a call.** The model list is a
*   convenience for the selector; a request naming a model directly is served
*   with metadata from the catalog. Losing the listing must not lose the turn.
* - **Model metadata is cached briefly.** The listing is a network call, and the
*   selector may ask for it more than once per interaction. The cache is short
*   because an account's entitlement can change under it, and a stale list is
*   how a user is offered a model they can no longer call.
*
* @module dsh-plugin-chatgpt/adapter
*/
/**
* Whether a thrown value already carries a usable code.
*
* A property check rather than `instanceof`: the harness may resolve a second
* copy of this package, and an error thrown by one copy is not an instance of
* the other's class.
*/
function isCodedError(error) {
	return error instanceof Error && typeof error.code === "string";
}
/** Build one coded error for a refusal this adapter makes itself. */
function coded(message, code) {
	const error = new Error(message);
	error.code = code;
	return error;
}
/**
* Whether a failure reads as a dropped connection rather than a decision.
*
* The wording is the built-in pi-ai adapter's, including undici's bare
* `terminated` — what a mid-stream socket drop looks like once the real
* SocketError has been flattened away — because a transient failure has to be
* told apart from a refusal here: one is worth retrying, the other is not.
*
* @param message - the failure's text.
* @returns whether it reads as transport.
*/
function isTransportFailure(message) {
	return /\b(?:network|connection|socket|fetch)\b|\bECONN[A-Z]+\b|\bterminated\b|premature close/i.test(message) || /\btime(?:d)?\s*out\b|timeout/i.test(message) || /\b5\d\d\b/.test(message) || /\b429\b|rate.?limit/i.test(message);
}
/** How long a model listing is reused before the account is asked again. */
const LISTING_TTL_MS = 6e4;
/** Longest hand-set display name accepted for one model. */
const MAX_MODEL_NAME_LENGTH = 200;
/** Preserve roles, blocks and tool results in the host's conversational order. */
function toNeutralRequest(request, scope) {
	const context = scope === void 0 ? void 0 : {
		provider: request.provider,
		model: request.model,
		scope
	};
	const messages = request.messages.map((message) => {
		const source = typeof message.source === "object" && message.source !== null ? message.source : void 0;
		const replay = message.role === "assistant" && source?.["kind"] === "model" && source["provider"] === request.provider && source["model"] === request.model ? replayOutput(source["replayState"], message.content, context) : void 0;
		const replayState = source?.["replayState"];
		const reasoningReplay = replay === void 0 ? void 0 : readReasoningReplay(replayState?.response?.reasoningReplay);
		const content = [];
		for (const block of message.content) if (block.type === "text" && typeof block["text"] === "string") content.push({
			type: "text",
			text: block["text"]
		});
		else if (block.type === "image" && typeof block["url"] === "string") content.push({
			type: "image",
			url: block["url"]
		});
		else if (block.type === "tool-call") {
			const call = block;
			content.push({
				type: "tool-call",
				id: call.id,
				name: call.name,
				arguments: call.arguments
			});
		}
		return {
			role: message.role,
			content,
			...message.toolCallId === void 0 ? {} : { toolCallId: message.toolCallId },
			...message.isError === void 0 ? {} : { isError: message.isError },
			...replay === void 0 ? {} : { replay },
			...reasoningReplay === void 0 ? {} : { reasoningReplay },
			...replay !== void 0 && replayState?.response?.reasoningUpdatesUnsupported === true ? { reasoningUpdatesUnsupported: true } : {}
		};
	});
	const cacheKey = scope === void 0 ? void 0 : sessionCacheKey(scope, request.provider, request.sessionId, request.purpose);
	return {
		model: request.model,
		messages,
		...request.system === void 0 ? {} : { system: request.system },
		...request.tools?.length ? { tools: request.tools } : {},
		...request.reasoningEffort === void 0 ? {} : { reasoningEffort: request.reasoningEffort },
		...cacheKey === void 0 ? {} : { cacheKey }
	};
}
/**
* Run one authenticated call, renewing the grant once if the endpoint refuses it.
*
* A stored token can be refused while it still looks valid locally: the endpoint
* answers `token_expired` for a grant it invalidated server-side, and authorization
* can change under a live session — an account upgrade, a workspace switch. A
* local clock comparison cannot see either, so the endpoint's refusal is what
* triggers a renewal, and the call is attempted twice at most.
*
* @param usable - mints a token from the stored grant, refreshing if it looks stale.
* @param renew - exchanges the grant for a new one regardless of local expiry.
* @param call - the authenticated call, given a token.
* @returns what the call produced.
* @throws the second attempt's failure, or the first one when a renewal was not the answer.
*/
async function withFreshGrant(usable, renew, call) {
	const credential = await usable();
	try {
		return await call(credential);
	} catch (error) {
		if (!isCodedError(error) || error.status !== 401 && !(error.status === 403 && (error.code === "token_expired" || error.code === "invalid_token"))) throw error;
		return await call(await renew(credential));
	}
}
/**
* Classify a failure from getting a usable credential.
*
* "Not signed in" is one specific condition — this installation has no account, or
* its grant was refused for good — and it must not be reported for a dropped
* connection. Reporting a network blip as a missing credential sends the human to
* sign in again over something a retry repairs, so a transport failure carries the
* code the retry policy acts on instead.
*
* @param auth - the credential owner, asked whether any account is stored.
* @param error - whatever the credential step or the first read threw.
* @returns the coded failure to report.
*/
function credentialFailure(auth, error) {
	const message = error instanceof Error ? error.message : String(error);
	if (auth.active() === void 0) return coded(message, "chatgpt_not_signed_in");
	if (error instanceof RefreshRefusedError) return error.terminal ? coded(`the ChatGPT grant was refused and needs a new sign-in: ${message}`, "chatgpt_not_signed_in") : coded(`the ChatGPT grant could not be renewed right now: ${message}`, "TRANSPORT");
	return isTransportFailure(message) ? coded(`the ChatGPT request could not reach the service: ${message}`, "TRANSPORT") : coded(`the ChatGPT request could not be prepared: ${message}`, "chatgpt_request_failed");
}
/**
* A failure this plugin itself decided on, in the coded shape its layers share.
*
* `ApiError` normalizes the codes it carries for endpoint-failure taxonomy, so a
* plugin-level refusal that must keep its exact code travels in this shape
* instead — the host boundary passes a coded error through unchanged.
*
* @param message - what the human reads.
* @param code - the stable machine code, kept verbatim.
* @returns the coded error to throw.
*/
function pluginCodedError(message, code) {
	const error = new Error(message);
	Object.assign(error, { code });
	return error;
}
/**
* Map a thrown credential/listing error to the failure the harness sees.
*
* `RefreshRefusedError` carries a `code` of its own (`CHATGPT_REFRESH_REFUSED`),
* so a generic coded-error passthrough would let it escape before
* {@link credentialFailure} can translate a dead grant into
* `chatgpt_not_signed_in`. Genuine API refusals keep their own code.
*
* @param auth - the credential owner, asked whether any account is stored.
* @param error - whatever the credential step or the first read threw.
* @returns the coded failure to report.
*/
function codedCredentialFailure(auth, error) {
	if (isCodedError(error) && error.code === "stream_ended_early") return Object.assign(new Error(error.message, { cause: error }), { code: "TRANSPORT" });
	if (error instanceof RefreshRefusedError) return credentialFailure(auth, error);
	return isCodedError(error) ? error : credentialFailure(auth, error);
}
/** Describe a model and its selected compaction budget in the host's vocabulary. */
function toHarnessResolved(provider, model, contextWindow) {
	return {
		provider,
		id: model.id,
		name: model.name,
		inputModalities: model.input,
		context: { contextWindow },
		systemPromptUpdate: "in-history",
		...model.maxTokens === void 0 ? {} : { defaultMaxTokens: Math.min(model.maxTokens, Math.floor(contextWindow / 2)) },
		...model.reasoningEfforts === void 0 ? {} : { reasoning: {
			efforts: model.reasoningEfforts,
			...model.defaultReasoningEffort === void 0 ? {} : { defaultEffort: model.defaultReasoningEffort }
		} }
	};
}
/**
* Serves one harness provider route from a ChatGPT plan.
*
* The route name is supplied by the composition rather than fixed here, so the
* same adapter can serve a private route alongside the built-in provider or
* replace its name, without this module deciding.
*/
var ChatGptAdapter = class {
	auth;
	baseUrl;
	displayName;
	includeUnlisted;
	contextWindowLimit;
	modelContextWindowLimits;
	streamIdleTimeoutMs;
	now;
	onListingRecovered;
	stateDir;
	onModelSwitchesChanged;
	listingGeneration = 0;
	listing;
	/** Whether the most recent listing attempt failed, so the next success can announce it. */
	listingFailed = false;
	/**
	* @param options - the credential owner and endpoint policy.
	*/
	constructor(options) {
		this.auth = options.auth;
		this.baseUrl = options.baseUrl;
		this.displayName = options.displayName ?? "ChatGPT";
		this.includeUnlisted = options.includeUnlisted ?? true;
		this.contextWindowLimit = options.contextWindowLimit;
		this.modelContextWindowLimits = options.modelContextWindowLimits;
		this.streamIdleTimeoutMs = options.streamIdleTimeoutMs;
		this.now = options.now ?? (() => Date.now());
		this.onListingRecovered = options.onListingRecovered;
		this.stateDir = options.stateDir;
		this.onModelSwitchesChanged = options.onModelSwitchesChanged;
	}
	/** The provider row this adapter describes. */
	providerInfo(provider) {
		return {
			id: provider,
			name: this.displayName
		};
	}
	/**
	* The models the selector should offer, in the server's order.
	*
	* The roster this account produced, minus the models the human switched off,
	* with each hand-set display name applied. A switched-off model is hidden
	* from the offering only: a request that names it directly still reaches the
	* endpoint and gets its own answer, exactly as the roster itself has never
	* been an allowlist. A renamed model keeps its id — the name is what the
	* picker shows, never what a request carries.
	*
	* @returns the describable, switched-on models under their display names.
	*/
	async listModels() {
		const [models, overrides] = await Promise.all([this.rosterModels(), this.modelOverrides()]);
		return (overrides.disabled.size === 0 ? models : models.filter((model) => !overrides.disabled.has(model.id))).map((model) => ({
			...model,
			name: overrides.names.get(model.id) ?? model.name,
			contextWindow: overrides.contextWindows.get(model.id) ?? this.configuredContextWindow(model.id)
		}));
	}
	/**
	* Every roster model with its switch and display-name state, for the provider
	* card.
	*
	* The roster is the same one the selector's offering comes from, so a switch
	* list and a selector can never disagree about what exists — only about which
	* entries are offered and what each is called.
	*
	* @returns one row per roster model, roster order.
	*/
	async modelSwitches() {
		const [models, overrides] = await Promise.all([this.rosterModels(), this.modelOverrides()]);
		return models.map((model) => {
			const name = overrides.names.get(model.id);
			return {
				id: model.id,
				defaultName: model.name,
				name: name ?? model.name,
				disabled: overrides.disabled.has(model.id),
				contextWindow: overrides.contextWindows.get(model.id) ?? this.configuredContextWindow(model.id),
				defaultContextWindow: this.configuredContextWindow(model.id)
			};
		});
	}
	/**
	* Switch one roster model on or off and answer the resulting switch list.
	*
	* @param id - the exact model id, which must be on the current roster.
	* @param disabled - whether the selector should stop offering the model.
	* @returns the switch list after the change is persisted.
	* @throws {CodedError} `chatgpt_unknown_model` when the id is not on the
	* roster, so a stale card cannot switch a model the account no longer serves.
	*/
	async setModelDisabled(id, disabled) {
		return this.changeModels(() => this.setModelDisabledUnlocked(id, disabled));
	}
	async setModelDisabledUnlocked(id, disabled) {
		await this.requireSwitchable(id);
		const overrides = await this.storedOverrides();
		if (disabled) overrides.disabled.add(id);
		else overrides.disabled.delete(id);
		return await this.commitOverrides(overrides);
	}
	/**
	* Set one roster model's display name, or restore the roster's own.
	*
	* The name is display vocabulary only: the selector shows it, while requests
	* keep carrying the id, so a rename can never break a call the way a renamed
	* allowlist entry would.
	*
	* @param id - the exact model id, which must be on the current roster.
	* @param name - the display name to store; `undefined` or blank restores the
	* roster's own name by removing the override.
	* @returns the switch list after the change is persisted.
	* @throws {CodedError} `chatgpt_unknown_model` when the id is not on the
	* roster, `chatgpt_invalid_model_switch` when the name is longer than the
	* accepted bound.
	*/
	async setModelName(id, name) {
		return this.changeModels(() => this.setModelNameUnlocked(id, name));
	}
	async setModelNameUnlocked(id, name) {
		await this.requireSwitchable(id);
		const trimmed = name?.trim() ?? "";
		if (trimmed.length > MAX_MODEL_NAME_LENGTH) throw pluginCodedError(`a model display name is limited to ${String(MAX_MODEL_NAME_LENGTH)} characters`, "chatgpt_invalid_model_switch");
		const overrides = await this.storedOverrides();
		if (trimmed.length === 0) overrides.names.delete(id);
		else overrides.names.set(id, trimmed);
		return await this.commitOverrides(overrides);
	}
	/** Persist one fixed context choice and notify the host to resolve the model again. */
	async setModelContextWindow(id, contextWindow) {
		return this.changeModels(async () => {
			await this.requireSwitchable(id);
			if (!isContextWindow(contextWindow)) throw pluginCodedError("context window must be 1M, 800k, 500k or 300k", "chatgpt_invalid_model_switch");
			const overrides = await this.storedOverrides();
			overrides.contextWindows.set(id, contextWindow);
			return this.commitOverrides(overrides);
		});
	}
	/**
	* Clear model switches, display names and context choices.
	*
	* @returns the switch list after the reset is persisted.
	* @throws {CodedError} `chatgpt_switches_unavailable` when no state directory
	* is configured, since the reset could not be remembered.
	*/
	async resetModels() {
		return this.changeModels(() => this.resetModelsUnlocked());
	}
	async resetModelsUnlocked() {
		if (this.stateDir === void 0) throw pluginCodedError("model switches need the installation state directory", "chatgpt_switches_unavailable");
		const overrides = await this.storedOverrides();
		if (overrides.disabled.size === 0 && overrides.names.size === 0 && overrides.contextWindows.size === 0) return await this.modelSwitches();
		overrides.disabled.clear();
		overrides.names.clear();
		overrides.contextWindows.clear();
		return await this.commitOverrides(overrides);
	}
	/**
	* The gates every override write shares: a place to persist, and a model the
	* roster actually carries.
	*
	* @param id - the exact model id a stale card may have named.
	* @throws {CodedError} `chatgpt_switches_unavailable`, then
	* `chatgpt_invalid_model_switch`, then `chatgpt_unknown_model`.
	*/
	async requireSwitchable(id) {
		if (this.stateDir === void 0) throw pluginCodedError("model switches need the installation state directory", "chatgpt_switches_unavailable");
		if (id.length === 0) throw pluginCodedError("a model id is required", "chatgpt_invalid_model_switch");
		if (!(await this.rosterModels()).some((model) => model.id === id)) throw pluginCodedError(`the roster has no model ${id}`, "chatgpt_unknown_model");
	}
	async changeModels(task) {
		if (this.stateDir === void 0) throw pluginCodedError("model switches need the installation state directory", "chatgpt_switches_unavailable");
		await mkdir(this.stateDir, {
			recursive: true,
			mode: 448
		});
		return withCredentialFileLock(join(this.stateDir, "models-operation"), task);
	}
	/** The persisted overrides as a mutable working copy. */
	async storedOverrides() {
		const file = this.stateDir === void 0 ? {
			disabled: [],
			names: {}
		} : await readModelOverrides(this.stateDir);
		return {
			disabled: new Set(file.disabled),
			names: new Map(Object.entries(file.names)),
			contextWindows: new Map(Object.entries(file.contextWindows ?? {}))
		};
	}
	/**
	* Persist the working copy, announce it, and answer the fresh switch list.
	* @param overrides - the overrides to store.
	* @returns the switch list as the persisted state now reads.
	*/
	async commitOverrides(overrides) {
		const stateDir = this.stateDir;
		if (stateDir === void 0) throw pluginCodedError("model switches need the installation state directory", "chatgpt_switches_unavailable");
		const file = {
			disabled: [...overrides.disabled],
			names: Object.fromEntries(overrides.names),
			...overrides.contextWindows.size === 0 ? {} : { contextWindows: Object.fromEntries(overrides.contextWindows) }
		};
		await writeModelOverrides(stateDir, file);
		try {
			this.onModelSwitchesChanged?.();
		} catch {}
		return await this.modelSwitches();
	}
	/**
	* The models this account advertises, in the server's order.
	*
	* This is a *roster for display*, not an allowlist. The endpoint lists what it
	* wants a picker to show, and it serves models that are absent from that list:
	* asked directly, it answers under the requested id and reports having done so.
	* Gating a call on membership here would refuse models the account can really
	* use — a mistake this plugin made once and should not make again.
	*
	* What the harness offers is therefore the roster; what a call may reach is
	* whatever the endpoint accepts, and its own error is the answer for a model
	* that does not exist.
	*
	* An account that is not signed in has no roster, which is an empty catalog
	* rather than a failure: the route exists and is waiting for a sign-in.
	*
	* @returns the describable models, before any switches are applied.
	*/
	async rosterModels() {
		const namespace = this.auth.active()?.replayNamespace;
		const generation = this.listingGeneration;
		const cached = this.listing;
		if (cached !== void 0 && cached.namespace === namespace && this.auth.active() !== void 0 && this.now() - cached.at < LISTING_TTL_MS) return cached.models;
		if (this.auth.active() === void 0) return [];
		let listed;
		try {
			listed = await withFreshGrant(() => this.auth.usable(), (credential) => this.auth.renewFor(credential), (credential) => listModels(credential.accessToken, ...this.baseUrl === void 0 ? [] : [{ baseUrl: this.baseUrl }]));
		} catch (error) {
			if (generation !== this.listingGeneration || this.auth.active()?.replayNamespace !== namespace) return [];
			this.listingFailed = true;
			throw codedCredentialFailure(this.auth, error);
		}
		if (generation !== this.listingGeneration || this.auth.active()?.replayNamespace !== namespace || this.auth.active() === void 0) return [];
		const models = this.rosterOf(listed);
		this.listing = {
			namespace,
			at: this.now(),
			models
		};
		if (this.listingFailed) {
			this.listingFailed = false;
			try {
				this.onListingRecovered?.();
			} catch {}
		}
		return models;
	}
	/**
	* The roster the selector offers: what the account advertises, plus the models
	* measured to work on this route that the listing leaves out.
	*
	* The listing is a curated selection, not an inventory. It omits models this
	* route serves — asked for by id, they answer — so a roster built from it alone
	* hides models the account paid for. The extra ids come from
	* {@link SERVED_MODELS}, which records when they were measured, because no
	* endpoint states them.
	*
	* A model the listing marks hidden is not offered: hidden is a deliberate
	* instruction about what a picker should show, and it is a different statement
	* from leaving a model unmentioned.
	*
	* @param listed - every entry the account's listing returned.
	* @returns the models to offer, listing order first.
	*/
	rosterOf(listed) {
		const advertised = describableModels(listed).map((model) => this.withMeasurement(model));
		const present = new Set(listed.map((model) => model.slug));
		const extras = this.includeUnlisted ? SERVED_MODELS.filter((entry) => !entry.advertised && !present.has(entry.id)).map((entry) => {
			const described = describeModel({ slug: entry.id });
			return {
				...described,
				maxContextWindow: ROUTE_MAX_CONTEXT_WINDOW,
				maxTokens: described.maxTokens ?? 128e3,
				metadataSource: "measured"
			};
		}) : [];
		return [...advertised, ...extras];
	}
	/**
	* Overlay the measured facts about one model.
	*
	* The listing describes capacity and the endpoint accepts requests, but its
	* reasoning-level list is not reliable — it advertised a level the API refuses.
	* Where a measurement exists it wins, because the cost of offering a rejected
	* level is a failed turn.
	*/
	withMeasurement(model) {
		const record = servedRecord(model.id);
		if (record === void 0) return model;
		const efforts = record.reasoningEfforts.map((effort) => ({
			id: effort,
			name: effortLabel(effort)
		}));
		const preferred = record.reasoningEfforts.includes("medium") ? "medium" : void 0;
		return {
			...model,
			reasoningEfforts: efforts,
			...preferred === void 0 ? model.defaultReasoningEffort === void 0 ? {} : { defaultReasoningEffort: model.defaultReasoningEffort } : { defaultReasoningEffort: preferred }
		};
	}
	/**
	* The stored roster overrides, or empty when they cannot live anywhere. Read
	* per call rather than cached, so an edit made in one DSH process is seen by
	* the next listing in another.
	*/
	async modelOverrides() {
		return this.storedOverrides();
	}
	/** Configured budgets remain readable even when absent from the fixed UI choices. */
	configuredContextWindow(model) {
		const overrides = typeof this.modelContextWindowLimits === "function" ? this.modelContextWindowLimits() : this.modelContextWindowLimits;
		if (overrides !== void 0 && (overrides === null || typeof overrides !== "object" || Array.isArray(overrides))) throw new Error("modelContextWindowLimits must be an object keyed by exact model ID");
		const modelLimit = overrides !== void 0 && Object.hasOwn(overrides, model) ? overrides[model] : void 0;
		const limit = modelLimit !== void 0 ? modelLimit : typeof this.contextWindowLimit === "function" ? this.contextWindowLimit() : this.contextWindowLimit;
		if (limit !== void 0 && (!Number.isSafeInteger(limit) || limit < 1024)) {
			const setting = modelLimit === void 0 ? "contextWindowLimit" : `modelContextWindowLimits[${JSON.stringify(model)}]`;
			throw new Error(`${setting} must be a safe integer of at least 1024 tokens`);
		}
		return limit ?? defaultContextWindow(model);
	}
	/** Drop the cached listing, so the next question re-asks the account. */
	forgetListing() {
		this.listingGeneration += 1;
		this.listing = void 0;
	}
	/**
	* Everything known about one model.
	*
	* The listing is consulted first so an account-specific display name wins,
	* and the bundled catalog answers for a model the listing has not been asked
	* about — a direct call must not depend on a listing having happened.
	*
	* @param provider - the route.
	* @param model - the exact model id.
	* @returns the model's metadata.
	*/
	async resolveModel(provider, model) {
		const described = (await this.rosterModels().catch(() => [])).find((entry) => entry.id === model) ?? describableModels([{ slug: model }])[0];
		/* c8 ignore next -- describableModels always answers for a non-empty slug */
		if (described === void 0) throw new Error(`no model named "${model}"`);
		return toHarnessResolved(provider, described, (await this.modelOverrides()).contextWindows.get(model) ?? this.configuredContextWindow(model));
	}
	/**
	* Stream one turn.
	*
	* A credential that cannot be refreshed is reported as an authentication
	* failure rather than retried, because the recovery is a new sign-in and no
	* amount of retrying produces one.
	*
	* @param provider - the route (unused; one grant serves the account).
	* @param request - the harness request.
	* @returns the chunks for one assistant turn.
	*/
	async *stream(provider, request) {
		let translator;
		let events;
		let primed;
		try {
			({events, primed, translator} = await withFreshGrant(() => this.auth.usable(request.signal), (credential) => this.auth.renewFor(credential, request.signal), async (credential) => {
				const scope = accountScope(this.baseUrl ?? "https://api.openai.com/v1", credential);
				const neutral = toNeutralRequest(request, scope);
				const initialPrepared = prepareResponsesRequest(neutral);
				const start = async (unsupported) => {
					const prepared = unsupported ? prepareResponsesRequest({
						...neutral,
						reasoningUpdatesUnsupported: true
					}) : initialPrepared;
					const translator = new BlockTranslator(scope === void 0 ? void 0 : {
						provider: request.provider,
						model: request.model,
						scope,
						...prepared.reasoningReplay === void 0 ? {} : { reasoningReplay: prepared.reasoningReplay },
						...prepared.reasoningUpdatesUnsupported === void 0 ? {} : { reasoningUpdatesUnsupported: true }
					});
					const idleTimeoutMs = typeof this.streamIdleTimeoutMs === "function" ? this.streamIdleTimeoutMs() : this.streamIdleTimeoutMs;
					const started = streamTurn({
						accessToken: credential.accessToken,
						request: neutral,
						preparedBody: prepared.body,
						...idleTimeoutMs === void 0 ? {} : { idleTimeoutMs },
						...this.baseUrl === void 0 ? {} : { endpoints: { baseUrl: this.baseUrl } },
						...request.signal === void 0 ? {} : { signal: request.signal }
					});
					return {
						events: started,
						primed: await started.next(),
						translator
					};
				};
				try {
					return await start();
				} catch (error) {
					if (!(error instanceof ApiError) || error.code !== "subscription_sharing_unsupported_capability" || !/unsupported input items/i.test(error.message) || !initialPrepared.body.input.some((item) => item.type === "configuration_update")) throw error;
					return await start(true);
				}
			}));
		} catch (error) {
			if (isCodedError(error) && (error.status === 401 || error.status === 403)) this.forgetListing();
			throw codedCredentialFailure(this.auth, error);
		}
		try {
			for (let step = primed; !step.done; step = await events.next()) for (const chunk of translator.push(step.value)) yield chunk;
		} catch (error) {
			if (isCodedError(error) && (error.status === 401 || error.status === 403)) this.forgetListing();
			for (const chunk of translator.endAll()) yield chunk;
			if (isCodedError(error)) throw codedCredentialFailure(this.auth, error);
			const message = error instanceof Error ? error.message : String(error);
			throw isTransportFailure(message) ? coded(`the ChatGPT response was cut short: ${message}`, "TRANSPORT") : coded(message, "chatgpt_request_failed");
		} finally {
			await events.return(void 0);
		}
	}
};
export { ChatGptAdapter, isCodedError, toNeutralRequest };

//# sourceMappingURL=adapter.js.map