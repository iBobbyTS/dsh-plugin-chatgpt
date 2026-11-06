import { ChatGptAdapter, isCodedError } from "./adapter.js";
import { ChatGptAuth } from "./auth/manager.js";
import { ChatGptController } from "./controller.js";
import { ChatGptSession } from "./session.js";
import { CodexQuota, registerCodexQuota } from "./codex-quota.js";
import { requestOfWithImages } from "./convert/harness.js";
import { LlmAdapter, LlmError } from "@deepseek-ai/dsh-llm";
import z from "@deepseek-ai/schemastery";
// src/index.ts
/**
* The bundle's plugin entry point.
*
* A bundle is a configuration layer, so this module exists to do the two things
* a layer cannot: own a live adapter instance, and register the provider route
* that instance serves.
*
* The route name is configuration rather than a constant. The built-in pi-ai
* plugin already serves a route literally named `openai`, and the registry
* refuses a second registration of one name outright — so a plugin that reserved
* that name could not be installed beside the built-in provider. A private name
* works in both compositions, and one key lets an operator move it.
*
* @module dsh-plugin-chatgpt
*/
/**
* Route and endpoint policy for one installation.
*
* This is a schema rather than a bare interface for two reasons. It validates
* what the profile supplies, and a declared schema is what gives this plugin a
* settings namespace: the Models page derives its namespace map from plugins that
* declare one, and renders a provider row only for a row whose namespace exists.
* A plugin with config but no schema therefore has a route the page cannot show.
*/
const Config = z.object({
	/** Provider route this plugin serves. */
	provider: z.string().required().volatile(),
	/** Display name for the provider row and the account card. */
	displayName: z.string().volatile(),
	/** Directory this installation's ChatGPT state lives in. */
	stateDir: z.string().required().volatile(),
	/** API base URL override; defaults to the documented resource. */
	baseUrl: z.string().volatile(),
	/** Explicit context budget used as-is; absent uses model-ID defaults. */
	contextWindowLimit: z.number().step(1).min(1024).volatile(),
	/** Exact model IDs with budgets that override the global context budget. */
	modelContextWindowLimits: z.dict(z.number().step(1).min(1024)).volatile(),
	/** SSE idle deadline; default 300000 ms. */
	streamIdleTimeoutMs: z.number().step(1).min(1e3).volatile()
});
/** What this plugin calls itself in diagnostics. */
const name = "chatgpt";
/**
* The settings namespace this plugin's provider row belongs to, and the key its
* browser card registers under.
*
* The Models page dispatches a card's extension area by the row's settings
* namespace, so the two halves have to agree on one string. Keeping it beside the
* route it describes is what makes that agreement visible.
*/
const SETTINGS_NS = "chatgpt";
/**
* The name a human reads on the consent screen, and this app's identity at OpenAI.
*
* Separate from the display name on purpose: renaming the row in the UI must not
* change what an already-granted client id was registered as, because the issued
* client id is bound to the identity the human consented to.
*/
const AGENT_NAME_HINT = "DeepSeek Harness";
/**
* The services this plugin needs before it can register anything.
*
* Cordis resolves injected services before `apply` runs, and reading `ctx.llm`
* without declaring it throws rather than answering undefined. The registry is
* the whole dependency: with no registry there is no route to own.
*/
const inject = ["llm"];
/**
* Give one thrown value the harness's error taxonomy.
*
* The harness classifies a provider failure by reading `code` and any status off
* the thrown error, and reports anything else as a bare `UNKNOWN` — so a coded
* error from this plugin's own layers is translated here, at the one boundary
* that already depends on the host.
*
* @param error - whatever a lower layer threw.
* @param fallbackCode - the code to use when the error carries none.
* @returns the error to throw onward.
*/
function asHostError(error, fallbackCode) {
	if (error instanceof LlmError) return error;
	if (isCodedError(error)) return new LlmError(error.message, error.code, error.status === void 0 ? {} : { status: error.status });
	return new LlmError(error instanceof Error ? error.message : String(error), fallbackCode);
}
/**
* The harness's adapter contract over the plan adapter.
*
* The wrapping is mechanical: it renames the vocabulary and adapts the two
* asynchronous shapes. Every decision lives below it, which is why the class
* carries no policy of its own.
*/
var HarnessAdapter = class extends LlmAdapter {
	readImage;
	inner;
	route;
	/**
	* @param inner - the adapter that talks to the API.
	* @param route - the provider route this instance serves.
	*/
	constructor(inner, route, readImage) {
		super();
		this.readImage = readImage;
		this.inner = inner;
		this.route = route;
	}
	providerInfo(provider) {
		return this.inner.providerInfo(provider);
	}
	async listModels(provider) {
		try {
			return (await this.inner.listModels()).map((model) => ({
				provider: this.route,
				id: model.id,
				name: model.name
			}));
		} catch (error) {
			throw asHostError(error, "chatgpt_listing_failed");
		}
	}
	async resolveModel(provider, model) {
		return await this.inner.resolveModel(provider, model);
	}
	async *stream(options) {
		try {
			const request = await requestOfWithImages(options, this.readImage);
			const chunks = this.inner.stream(options.provider, request);
			for await (const chunk of chunks) yield chunk;
		} catch (error) {
			throw asHostError(error, "chatgpt_request_failed");
		}
	}
};
/**
* Register the ChatGPT provider route.
*
* The route goes into the harness's own registry, so the provider reaches every
* consumer — the model selector, the settings page, and the agent loop — exactly
* as a built-in provider does.
*
* @param ctx - the plugin context.
* @param config - the installation's route and state location.
*/
function apply(ctx, config) {
	ctx.inject(["settings"], (child) => {
		child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
	});
	const route = config.provider.get() ?? "chatgpt";
	const stateDir = config.stateDir.get();
	if (stateDir === void 0 || stateDir.length === 0) throw new Error("chatgpt: a state directory is required, so credentials have somewhere to live");
	const displayName = config.displayName.get() ?? "ChatGPT";
	const baseUrl = config.baseUrl.get() ?? "";
	const auth = new ChatGptAuth({
		stateDir,
		agentNameHint: AGENT_NAME_HINT
	});
	const inner = new ChatGptAdapter({
		auth,
		displayName,
		stateDir,
		contextWindowLimit: () => config.contextWindowLimit.get(),
		modelContextWindowLimits: () => config.modelContextWindowLimits.get(),
		streamIdleTimeoutMs: () => config.streamIdleTimeoutMs.get(),
		onListingRecovered: () => {
			ctx.emit("llm/adapters-updated");
		},
		onModelSwitchesChanged: () => {
			ctx.emit("llm/adapters-updated");
		},
		...baseUrl.length === 0 ? {} : { baseUrl }
	});
	const adapter = new HarnessAdapter(inner, route, async (ref, signal) => {
		const attachments = ctx.get("attachments");
		if (attachments === void 0) throw new LlmError("ChatGPT vision input requires the DSH attachment store", "UNSUPPORTED");
		return attachments.readImage(ref, signal);
	});
	const handle = ctx.llm.registerAdapter([route], adapter);
	ctx.effect(() => () => {
		handle();
	});
	const providerEntry = {
		provider: route,
		displayName,
		settingsNs: SETTINGS_NS,
		settingsPath: [],
		nativeAuth: {
			env: [],
			oauth: true
		}
	};
	const directory = ctx.llm.registerConfigurableProviders([providerEntry]);
	ctx.effect(() => () => {
		directory();
	});
	const session = new ChatGptSession(auth, inner, { onRosterChanged: () => {
		ctx.emit("llm/adapters-updated");
	} });
	const codexQuota = new CodexQuota(stateDir);
	registerCodexQuota(ctx, codexQuota, route);
	new ChatGptController(ctx, session, codexQuota);
}
export { AGENT_NAME_HINT, Config, HarnessAdapter, SETTINGS_NS, apply, inject, name };

//# sourceMappingURL=index.js.map