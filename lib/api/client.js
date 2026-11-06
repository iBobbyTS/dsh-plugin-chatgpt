import "../auth/protocol.js";
import { createSseDecoder, decodeEvent, isPlanUsageCode } from "./events.js";
import { toResponsesBody } from "../convert/request.js";
import { normalizeFailureCode } from "./failure.js";
// src/api/client.ts
/**
* Calling the OpenAI API with a ChatGPT plan grant.
*
* Two calls matter here: what this account may use, and running one turn
* against it. Both send the same bearer token — the plan-usage grant is the
* credential for listing *and* inference, which is why a listing failure and an
* inference failure usually mean the same thing.
*
* A non-2xx response is turned into an error carrying the endpoint's own code,
* because the code is what tells the caller whether to retry, re-authorize, or
* report that the plan cannot be spent: `subscription_sharing_usage_limit_exceeded`
* and `invalid_api_key` call for three different answers.
*
* @module dsh-plugin-chatgpt/client
*/
/** The reason a call failed, in the endpoint's own terms. */
var ApiError = class extends Error {
	/** Stable code, when the endpoint supplied one. */
	code;
	/** HTTP status, when the failure was a response rather than a transport fault. */
	status;
	/** Whether the account's plan is the thing refusing, so the human is told to check usage. */
	planUsage;
	/**
	* @param message - what the endpoint reported.
	* @param code - the endpoint's own error code.
	* @param status - HTTP status, when there was one.
	*/
	constructor(message, code, status) {
		super(message);
		this.name = "ApiError";
		this.code = normalizeFailureCode(code, message, status);
		this.planUsage = isPlanUsageCode(code);
		if (status !== void 0) this.status = status;
	}
};
/** Pull a code and message out of an error body without assuming its shape. */
function errorOf(body, status) {
	try {
		const parsed = JSON.parse(body);
		if (typeof parsed === "object" && parsed !== null) {
			const record = parsed;
			const nested = typeof record["error"] === "object" && record["error"] !== null ? record["error"] : record;
			const code = typeof nested["code"] === "string" ? nested["code"] : typeof nested["type"] === "string" ? nested["type"] : `http_${status}`;
			return new ApiError(typeof nested["message"] === "string" ? nested["message"] : body, code, status);
		}
	} catch {}
	return new ApiError(body.length > 0 ? body : `the request failed with status ${status}`, `http_${status}`, status);
}
/** Build the headers every call carries. */
function headersFor(accessToken, cacheKey) {
	return {
		authorization: `Bearer ${accessToken}`,
		"content-type": "application/json",
		accept: "application/json",
		...cacheKey === void 0 ? {} : { session_id: cacheKey }
	};
}
/** The base URL to call, without a trailing slash. */
function baseOf(endpoints) {
	return (endpoints?.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
}
/**
* List the models this account may use.
*
* The listing is the authority on entitlement, so nothing here filters by a
* local list of known models: a model the account can call is offered even when
* this plugin has no metadata for it.
*
* @param accessToken - the plan-usage grant's access token.
* @param endpoints - endpoint override (tests, gateways).
* @param signal - cancellation.
* @returns every listed model, in the server's order.
*/
async function listModels(accessToken, endpoints, signal) {
	const response = await fetch(`${baseOf(endpoints)}/models`, {
		headers: {
			authorization: `Bearer ${accessToken}`,
			accept: "application/json"
		},
		...signal === void 0 ? {} : { signal }
	});
	if (!response.ok) throw errorOf(await response.text().catch(() => ""), response.status);
	const parsed = await response.json();
	const entries = typeof parsed === "object" && parsed !== null ? parsed["models"] : void 0;
	if (!Array.isArray(entries)) return [];
	const models = [];
	for (const entry of entries) {
		if (typeof entry !== "object" || entry === null) continue;
		const record = entry;
		const slug = record["slug"] ?? record["id"];
		if (typeof slug !== "string" || slug.length === 0) continue;
		const displayName = record["display_name"];
		const visibility = record["visibility"];
		const description = record["description"];
		models.push({
			slug,
			...typeof displayName === "string" ? { displayName } : {},
			...typeof visibility === "string" ? { visibility } : {},
			...typeof description === "string" ? { description } : {},
			...typeof record["context_window"] === "number" ? { contextWindow: record["context_window"] } : {},
			...typeof record["max_context_window"] === "number" ? { maxContextWindow: record["max_context_window"] } : {},
			...Array.isArray(record["input_modalities"]) ? { inputModalities: record["input_modalities"].filter((value) => typeof value === "string") } : {},
			...typeof record["default_reasoning_level"] === "string" ? { defaultReasoningLevel: record["default_reasoning_level"] } : {},
			...Array.isArray(record["supported_reasoning_levels"]) ? { reasoningLevels: record["supported_reasoning_levels"].flatMap((level) => {
				if (typeof level !== "object" || level === null) return [];
				const effort = level["effort"];
				if (typeof effort !== "string") return [];
				const detail = level["description"];
				return [{
					effort,
					...typeof detail === "string" ? { description: detail } : {}
				}];
			}) } : {}
		});
	}
	return models;
}
/** Read a chunk with an idle deadline instead of waiting forever on a live socket. */
async function readWithIdleTimeout(reader, timeoutMs) {
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error("invalid stream idle timeout");
	let timer;
	try {
		return await Promise.race([reader.read(), new Promise((_, reject) => {
			timer = setTimeout(() => reject(new ApiError("ChatGPT response stream idle timeout", "TIMEOUT")), timeoutMs);
		})]);
	} finally {
		if (timer !== void 0) clearTimeout(timer);
	}
}
/**
* Run one turn and yield its events as they arrive.
*
* The stream is consumed to its terminal event. A stream that ends without one
* is reported as a failure rather than as a finished turn: the server can close
* a connection mid-answer, and treating that close as completion is how a
* truncated answer becomes a plausible-looking wrong one.
*
* @param options - the grant, the request, and cancellation.
* @returns the decoded events, in order, ending with a terminal one.
*/
async function* streamTurn(options) {
	const body = options.preparedBody ?? toResponsesBody(options.request);
	const idleTimeoutMs = options.idleTimeoutMs ?? 3e5;
	if (!Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs <= 0) throw new Error("invalid stream idle timeout");
	const connectTimeout = new AbortController();
	const connectSignal = options.signal === void 0 ? connectTimeout.signal : AbortSignal.any([options.signal, connectTimeout.signal]);
	const deadline = setTimeout(() => {
		connectTimeout.abort(new ApiError("ChatGPT response headers timed out", "TIMEOUT"));
	}, idleTimeoutMs);
	let response;
	try {
		response = await fetch(`${baseOf(options.endpoints)}/responses`, {
			method: "POST",
			headers: headersFor(options.accessToken, body.prompt_cache_key),
			body: JSON.stringify(body),
			signal: connectSignal
		});
	} finally {
		clearTimeout(deadline);
	}
	if (!response.ok) {
		const errorDeadline = setTimeout(() => connectTimeout.abort(new ApiError("ChatGPT error response body timed out", "TIMEOUT")), idleTimeoutMs);
		try {
			throw errorOf(await response.text(), response.status);
		} catch (error) {
			if (connectTimeout.signal.aborted) throw connectTimeout.signal.reason;
			throw error;
		} finally {
			clearTimeout(errorDeadline);
		}
	}
	if (response.body === null) throw new ApiError("the endpoint returned no response body", "empty_stream", response.status);
	const decoder = createSseDecoder();
	const reader = response.body.getReader();
	const text = new TextDecoder();
	let terminal = false;
	try {
		while (!terminal) {
			const { done, value } = await readWithIdleTimeout(reader, idleTimeoutMs);
			const payloads = done === true ? decoder.flush() : decoder.push(text.decode(value, { stream: true }));
			for (const payload of payloads) {
				const event = decodeEvent(payload);
				if (event === void 0) continue;
				yield event;
				if (event.kind === "completed" || event.kind === "failed" || event.kind === "incomplete") {
					terminal = true;
					break;
				}
			}
			if (done === true) break;
		}
	} finally {
		await reader.cancel().catch(() => void 0);
	}
	if (!terminal) throw new ApiError("the response stream ended without a terminal event, so the turn did not finish", "stream_ended_early");
}
export { ApiError, listModels, readWithIdleTimeout, streamTurn };

//# sourceMappingURL=client.js.map