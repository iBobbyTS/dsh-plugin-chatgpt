import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";
// src/diagnostics.ts
/** Redacted, bounded Host-only evidence collected at the actual HTTP boundary. */
const MAX_PREFIXES = 8192;
const MAX_BASELINES = 32;
const MAX_BYTES = 8388608;
const BACKUPS = 3;
const sha = (text) => createHash("sha256").update(text).digest("hex");
function object(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function count(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function identifier(value, kind) {
	if (typeof value !== "string") return null;
	const valid = new RegExp(`^${kind}_[a-zA-Z0-9_-]{1,160}$`).test(value) || kind === "req" && /^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/.test(value);
	return {
		sha256: sha(value),
		...valid ? { value } : {}
	};
}
const TYPES = /* @__PURE__ */ new Set([
	"cache_hit",
	"cache_miss",
	"comparison_response_not_found",
	"unavailable"
]);
const REASONS = /* @__PURE__ */ new Set([
	"model_changed",
	"prompt_cache_key_changed",
	"service_tier_changed",
	"tools_changed",
	"text_format_changed",
	"reasoning_effort_changed",
	"verbosity_changed",
	"context_compacted",
	"input_changed"
]);
const TIERS = /* @__PURE__ */ new Set([
	"auto",
	"default",
	"flex",
	"priority",
	"scale"
]);
function cacheDiagnostic(value) {
	const v = object(value);
	if (v === void 0) return null;
	const result = {};
	for (const [key, allowed] of [["type", TYPES], ["reason", REASONS]]) {
		const field = v[key];
		if (typeof field === "string") {
			if (allowed.has(field)) result[key] = field;
			else result[`${key}_sha256`] = sha(field);
		}
	}
	for (const key of ["comparison_reusable_tokens", "cache_missed_tokens"]) if (count(v[key]) || v[key] === null) result[key] = v[key];
	return result;
}
function usageOf(value) {
	const v = object(value);
	if (v === void 0) return null;
	const result = {};
	const fields = {
		input_tokens: v["input_tokens"],
		output_tokens: v["output_tokens"],
		total_tokens: v["total_tokens"],
		cached_tokens: object(v["input_tokens_details"])?.["cached_tokens"],
		cache_write_tokens: object(v["input_tokens_details"])?.["cache_write_tokens"],
		reasoning_tokens: object(v["output_tokens_details"])?.["reasoning_tokens"]
	};
	for (const [key, field] of Object.entries(fields)) if (count(field) || field === null) result[key] = field;
	return result;
}
/** No prompts, outputs, credentials, URLs, tool schemas, or arbitrary server strings reach the writer. */
var RequestDiagnostics = class {
	directory;
	enabled;
	file;
	baselines = /* @__PURE__ */ new Map();
	sequence = 0;
	warned = false;
	constructor(directory, enabled = () => true) {
		this.directory = directory;
		this.enabled = enabled;
		this.file = join(directory, "request-diagnostics.jsonl");
	}
	warn() {
		if (this.warned) return;
		this.warned = true;
		console.warn("chatgpt: redacted request diagnostics could not be written; inference continues");
	}
	write(event) {
		try {
			if (!this.enabled()) {
				this.baselines.clear();
				return false;
			}
			mkdirSync(this.directory, {
				recursive: true,
				mode: 448
			});
			const line = Buffer.from(JSON.stringify({
				version: 1,
				time: (/* @__PURE__ */ new Date()).toISOString(),
				...event
			}) + "\n");
			if (line.length > MAX_BYTES) return false;
			let size = 0;
			try {
				const file = lstatSync(this.file);
				if (!file.isFile()) throw new Error("diagnostics target is not a regular file");
				size = file.size;
			} catch (error) {
				if (error.code !== "ENOENT") throw error;
			}
			if (size + line.length > MAX_BYTES) {
				try {
					unlinkSync(`${this.file}.${BACKUPS}`);
				} catch (error) {
					if (error.code !== "ENOENT") throw error;
				}
				for (let i = 2; i >= 0; i--) try {
					renameSync(i === 0 ? this.file : `${this.file}.${i}`, `${this.file}.${i + 1}`);
				} catch (error) {
					if (error.code !== "ENOENT") throw error;
				}
			}
			const fd = openSync(this.file, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK, 384);
			try {
				if (!fstatSync(fd).isFile()) throw new Error("diagnostics target is not a regular file");
				fchmodSync(fd, 384);
				let offset = 0;
				while (offset < line.length) {
					const written = writeSync(fd, line, offset);
					if (written <= 0) throw new Error("diagnostics write made no progress");
					offset += written;
				}
			} finally {
				closeSync(fd);
			}
			return true;
		} catch {
			this.warn();
			return false;
		}
	}
	/** serializedBody and sessionHeader are the exact values passed to fetch, after every fallback. */
	begin(serializedBody, sessionHeader, endpoint, context) {
		try {
			if (!this.enabled()) {
				this.baselines.clear();
				return;
			}
			const body = object(JSON.parse(serializedBody));
			if (body === void 0 || !Array.isArray(body["input"])) return void 0;
			const input = body["input"];
			const prefixes = [];
			const hash = createHash("sha256").update("[");
			for (let i = 0; i < input.length; i++) {
				if (i > 0) hash.update(",");
				hash.update(JSON.stringify(input[i]));
				if (i < MAX_PREFIXES) prefixes.push(hash.copy().update("]").digest("hex"));
			}
			const { input: _input, tools, reasoning, prompt_cache_key: key, ...settings } = body;
			const fingerprint = {
				attemptId: randomUUID(),
				sequence: ++this.sequence,
				inputCount: input.length,
				inputSha256: hash.update("]").digest("hex"),
				prefixes,
				toolsSha256: sha(JSON.stringify(tools ?? null)),
				reasoningSha256: sha(JSON.stringify(reasoning ?? null)),
				settingsSha256: sha(JSON.stringify(settings)),
				cacheKeySha256: typeof key === "string" ? sha(key) : null
			};
			const sessionHash = context.sessionId === void 0 ? null : sha(context.sessionId);
			const providerHash = sha(context.provider);
			const purpose = context.purpose ?? "agent";
			const purposeGroup = purpose === "compaction" ? "agent" : purpose;
			const scopeHash = context.authorizationScope === void 0 ? null : sha(context.authorizationScope);
			const group = sessionHash === null || scopeHash === null ? void 0 : JSON.stringify([
				sessionHash,
				scopeHash,
				providerHash,
				purposeGroup
			]);
			const previous = group === void 0 ? void 0 : this.baselines.get(group);
			let matching = 0;
			while (previous !== void 0 && matching < previous.prefixes.length && matching < prefixes.length && previous.prefixes[matching] === prefixes[matching]) matching++;
			const previousInputPreserved = previous === void 0 ? null : previous.inputCount > MAX_PREFIXES ? null : matching === previous.inputCount;
			const id = {
				callId: context.callId,
				attempt: context.attempt,
				attemptId: fingerprint.attemptId
			};
			if (!this.write({
				...id,
				phase: "request",
				sessionId: context.sessionId !== void 0 && /^(?:session-)?[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(context.sessionId) ? context.sessionId : null,
				sessionSha256: sessionHash,
				providerSha256: providerHash,
				authorizationScopeSha256: scopeHash,
				purpose: purpose === "agent" || purpose === "compaction" ? purpose : "other",
				purposeSha256: sha(purpose),
				capabilityFallback: context.capabilityFallback,
				endpointSha256: sha(endpoint),
				model: typeof body["model"] === "string" && /^gpt-[a-zA-Z0-9._-]{1,100}$/.test(body["model"]) ? body["model"] : null,
				modelSha256: sha(JSON.stringify(body["model"] ?? null)),
				wireBodySha256: sha(serializedBody),
				inputCount: fingerprint.inputCount,
				inputSha256: fingerprint.inputSha256,
				prefixSha256: prefixes,
				prefixesTruncated: input.length > MAX_PREFIXES,
				toolsSha256: fingerprint.toolsSha256,
				reasoningSha256: fingerprint.reasoningSha256,
				settingsSha256: fingerprint.settingsSha256,
				promptCacheKeySha256: fingerprint.cacheKeySha256,
				sessionHeaderSha256: sessionHeader === void 0 ? null : sha(sessionHeader),
				comparison: previous === void 0 ? null : {
					previousAttemptId: previous.attemptId,
					matchingPrefixItems: matching,
					previousInputPreserved,
					toolsEqual: previous.toolsSha256 === fingerprint.toolsSha256,
					reasoningEqual: previous.reasoningSha256 === fingerprint.reasoningSha256,
					settingsEqual: previous.settingsSha256 === fingerprint.settingsSha256,
					cacheKeyEqual: previous.cacheKeySha256 === fingerprint.cacheKeySha256
				}
			})) return void 0;
			let ended = false;
			let requestId = null;
			let responseId = null;
			let responseModel = null;
			let responseModelSha256 = null;
			let serviceTier = null;
			let systemFingerprint = null;
			let usage = null;
			let cache = null;
			let cachePresent = false;
			let cacheSource = null;
			return {
				response: (response) => {
					requestId = identifier(response.headers.get("x-request-id"), "req");
					this.write({
						...id,
						phase: "response",
						status: response.status,
						requestId
					});
				},
				payload: (payload) => {
					try {
						if (!/"(?:response|prompt_cache_diagnostics|usage)"\s*:/.test(payload)) return;
						const event = object(JSON.parse(payload));
						const response = object(event?.["response"]) ?? event;
						if (response === void 0) return;
						responseId = identifier(response["id"], "resp") ?? responseId;
						const model = response["model"];
						if (typeof model === "string") {
							responseModelSha256 = sha(JSON.stringify(model));
							responseModel = /^gpt-[a-zA-Z0-9._-]{1,100}$/.test(model) ? model : null;
						}
						const tier = response["service_tier"];
						if (typeof tier === "string" && TIERS.has(tier)) serviceTier = tier;
						if (typeof response["system_fingerprint"] === "string") systemFingerprint = sha(response["system_fingerprint"]);
						usage = usageOf(response["usage"]) ?? usage;
						if (Object.hasOwn(response, "prompt_cache_diagnostics")) {
							cachePresent = true;
							const type = event?.["type"];
							cacheSource = typeof type === "string" && (/* @__PURE__ */ new Set([
								"response.created",
								"response.in_progress",
								"response.completed",
								"response.failed",
								"response.incomplete"
							])).has(type) ? type : "other";
							cache = cacheDiagnostic(response["prompt_cache_diagnostics"]);
						}
					} catch {}
				},
				end: (outcome) => {
					if (ended) return;
					ended = true;
					if (this.write({
						...id,
						phase: "end",
						outcome,
						requestId,
						responseId,
						responseModel,
						responseModelSha256,
						serviceTier,
						systemFingerprintSha256: systemFingerprint,
						usage,
						promptCacheDiagnosticsPresent: cachePresent,
						promptCacheDiagnosticsEvent: cacheSource,
						promptCacheDiagnostics: cache
					}) && outcome === "completed" && group !== void 0 && fingerprint.sequence > (this.baselines.get(group)?.sequence ?? -1)) {
						this.baselines.delete(group);
						this.baselines.set(group, fingerprint);
						while (this.baselines.size > MAX_BASELINES) this.baselines.delete(this.baselines.keys().next().value);
					}
				}
			};
		} catch {
			this.warn();
			return;
		}
	}
};
export { RequestDiagnostics };

//# sourceMappingURL=diagnostics.js.map