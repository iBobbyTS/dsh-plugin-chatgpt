import { outputItem, outputItems } from "../convert/replay.js";
// src/api/events.ts
/**
* Reading the Responses API event stream.
*
* The stream, not the HTTP status, is where this endpoint reports most
* outcomes. A request that was accepted can still fail partway through — a plan
* usage limit is delivered as `response.failed` *after* text has already
* streamed, because the server only learns the account's remaining allowance
* when it starts billing the turn. So a consumer that treats "HTTP 200" as
* success will show a half-written answer as a finished one.
*
* The one success terminal is `response.completed`. `response.incomplete` is
* not a success, and neither is a stream that simply ends: both mean the turn
* did not finish, and treating an early close as completion is how a truncated
* answer becomes a plausible-looking wrong one.
*
* This module decodes the wire form into typed events and knows nothing about
* any harness's own vocabulary, so it can be tested against captured frames.
*
* @module dsh-plugin-chatgpt-subscription/api/events
*/
/**
* Plan-usage failures the caller must answer differently from a generic error.
*
* `limitExceeded` means the account's allowance is spent: retrying the same
* request cannot help, and the honest response is to tell the human to check
* their ChatGPT usage rather than to back off and try again.
* `unavailable` means the plan could not be spent at all right now, which is
* worth a bounded retry.
*/
const USAGE_CODES = /* @__PURE__ */ new Set(["subscription_sharing_usage_limit_exceeded", "subscription_sharing_usage_unavailable"]);
/** Whether a failure code describes the account's plan rather than the request. */
function isPlanUsageCode(code) {
	return USAGE_CODES.has(code);
}
/** Where a user reviews and limits each app's use of their ChatGPT plan. */
const USAGE_SETTINGS_URL = "https://chatgpt.com/settings/usage";
/**
* The action a plan-usage failure calls for, in the words the documentation
* prescribes.
*
* The distinction matters because the two codes look alike and are not: an
* exhausted allowance is a stop that the human resolves in their own ChatGPT
* settings, while an unavailable one is worth retrying. Saying "try again" to a
* spent allowance, or "check your usage" to a blip, sends the user the wrong way.
*
* @param code - the endpoint's error code.
* @returns guidance to append to the failure message, or `undefined`.
*/
function recoveryHint(code) {
	if (code === "subscription_sharing_usage_limit_exceeded") return `This account has no ChatGPT plan allowance left for app inference right now, or an app-specific limit applies; the returned code does not say which. Review usage at ${USAGE_SETTINGS_URL} to see both the plan and this app's limit. No reset time can be read from the code itself, so waiting is the only option unless an API key or another provider is available in the meantime.`;
	if (code === "subscription_sharing_usage_unavailable") return "The plan usage could not be checked; retrying shortly is reasonable.";
	if (code === "subscription_sharing_user_not_eligible") return "This user, workspace, or policy cannot spend a ChatGPT plan on inference; check the ChatGPT account and workspace policy.";
}
/** Read a nested object without assuming the wire shape. */
function record(value) {
	return typeof value === "object" && value !== null ? value : void 0;
}
/** Read a string field, or `undefined`. */
function str(value) {
	return typeof value === "string" ? value : void 0;
}
/** Read a number field, or `undefined`. */
function num(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
/** Missing indexes are unknown, never an alias for item zero. */
function identityOf(event) {
	const value = num(event["output_index"]);
	const index = value !== void 0 && Number.isSafeInteger(value) && value >= 0 ? value : void 0;
	const itemId = str(record(event["item"])?.["id"]) ?? str(event["item_id"]);
	return {
		...index === void 0 ? {} : { index },
		...itemId === void 0 || itemId.length === 0 ? {} : { itemId }
	};
}
/** Read token usage from a response object, however much of it is present. */
function usageOf(response) {
	const usage = record(response?.["usage"]);
	if (usage === void 0) return void 0;
	const input = num(usage["input_tokens"]);
	const output = num(usage["output_tokens"]);
	const total = num(usage["total_tokens"]);
	if (input === void 0 && output === void 0 && total === void 0) return void 0;
	const details = record(usage["input_tokens_details"]);
	const cached = num(details?.["cached_tokens"]);
	const written = num(details?.["cache_write_tokens"]);
	const reasoning = num(record(usage["output_tokens_details"])?.["reasoning_tokens"]);
	const cacheRead = cached === void 0 || cached < 0 ? void 0 : cached;
	const cacheWrite = written === void 0 || written < 0 ? void 0 : written;
	const uncachedInput = input === void 0 ? void 0 : Math.max(0, input - (cacheRead ?? 0) - (cacheWrite ?? 0));
	return {
		...uncachedInput === void 0 ? {} : { inputTokens: uncachedInput },
		...output === void 0 ? {} : { outputTokens: output },
		...total === void 0 ? {} : { totalTokens: total },
		...cacheRead === void 0 ? {} : { cacheReadTokens: cacheRead },
		...cacheWrite === void 0 ? {} : { cacheWriteTokens: cacheWrite },
		...reasoning === void 0 || !Number.isSafeInteger(reasoning) || reasoning < 0 || output === void 0 || reasoning > output ? {} : { reasoningTokens: reasoning }
	};
}
/**
* Frames that report something happened without carrying anything to show.
*
* They are not errors, and they are not unknown: a consumer has nothing to do
* with them. Reporting them as unrecognised would bury a genuine protocol
* addition in lifecycle noise, which is exactly the signal this decoder's
* `unknown` case exists to preserve.
*/
const LIFECYCLE_TYPES = /* @__PURE__ */ new Set([
	"response.created",
	"response.queued",
	"response.in_progress",
	"response.content_part.added",
	"response.content_part.done",
	"response.output_text.done",
	"response.reasoning_summary_part.added",
	"response.reasoning_summary_part.done",
	"response.reasoning_summary_text.done",
	"response.reasoning_text.done"
]);
/**
* Decode one SSE `data` payload into an event, or `undefined` for frames this
* plugin deliberately ignores.
*
* Ignored frames are the ones that carry no incremental content — lifecycle
* markers such as `response.created` or `response.in_progress`. They are not
* errors; the caller simply has nothing to show for them.
*
* @param payload - the JSON text of one `data:` line.
* @returns the decoded event, or `undefined` when the frame says nothing.
*/
function decodeEvent(payload) {
	let parsed;
	try {
		parsed = JSON.parse(payload);
	} catch {
		return {
			kind: "unknown",
			type: "unparsable"
		};
	}
	const event = record(parsed);
	const type = str(event?.["type"]);
	if (event === void 0 || type === void 0) return {
		kind: "unknown",
		type: "unrecognised"
	};
	if (LIFECYCLE_TYPES.has(type)) return void 0;
	switch (type) {
		case "response.output_text.delta":
		case "response.refusal.delta": {
			const delta = str(event["delta"]) ?? "";
			return delta.length === 0 ? void 0 : {
				kind: "text",
				delta,
				...identityOf(event)
			};
		}
		case "response.reasoning_summary_text.delta":
		case "response.reasoning_text.delta": {
			const delta = str(event["delta"]) ?? "";
			return delta.length === 0 ? void 0 : {
				kind: "reasoning",
				delta,
				...identityOf(event),
				...typeof event["summary_index"] === "number" && Number.isSafeInteger(event["summary_index"]) && event["summary_index"] >= 0 ? { summaryIndex: event["summary_index"] } : {}
			};
		}
		case "response.output_item.added": {
			const item = record(event["item"]);
			const identity = identityOf(event);
			if (str(item?.["type"]) !== "function_call") {
				const native = outputItem(item);
				return native === void 0 ? void 0 : {
					kind: "itemStart",
					...identity,
					item: native
				};
			}
			const callId = str(item?.["call_id"]) ?? str(item?.["id"]);
			if (!callId) return {
				kind: "unknown",
				type: "function_call_without_identity"
			};
			return {
				kind: "toolCallStart",
				...identity,
				callId,
				name: str(item?.["name"]) ?? ""
			};
		}
		case "response.output_item.done": {
			const item = outputItem(event["item"]);
			return item === void 0 ? void 0 : {
				kind: "itemEnd",
				...identityOf(event),
				item
			};
		}
		case "response.function_call_arguments.delta": {
			const delta = str(event["delta"]) ?? "";
			return delta.length === 0 ? void 0 : {
				kind: "toolCallDelta",
				...identityOf(event),
				delta
			};
		}
		case "response.function_call_arguments.done": return {
			kind: "toolCallEnd",
			...identityOf(event),
			arguments: str(event["arguments"]) ?? ""
		};
		case "response.completed": {
			const response = record(event["response"]);
			const id = str(response?.["id"]);
			const usage = usageOf(response);
			const output = outputItems(response?.["output"]);
			return {
				kind: "completed",
				...id === void 0 ? {} : { responseId: id },
				...usage === void 0 ? {} : { usage },
				...output === void 0 ? {} : { output }
			};
		}
		case "response.incomplete": {
			const response = record(event["response"]);
			const details = record(response?.["incomplete_details"]);
			const usage = usageOf(response);
			return {
				kind: "incomplete",
				reason: str(details?.["reason"]) ?? "unknown",
				...usage === void 0 ? {} : { usage }
			};
		}
		case "response.failed":
		case "error": {
			const source = type === "error" ? event : record(event["response"]);
			const error = type === "error" ? record(event["error"]) ?? event : record(source?.["error"]) ?? {};
			const code = str(error["code"]) ?? str(error["type"]) ?? "unknown_error";
			const reported = str(error["message"]) ?? "the response failed without a message";
			const hint = recoveryHint(code);
			const usage = usageOf(source);
			return {
				kind: "failed",
				code,
				message: hint === void 0 ? reported : `${reported} ${hint}`,
				terminal: isPlanUsageCode(code) || code !== "server_error",
				...usage === void 0 ? {} : { usage }
			};
		}
		default: return {
			kind: "unknown",
			type
		};
	}
}
/**
* Split a byte stream into SSE `data` payloads.
*
* Server-sent events are separated by a blank line and may be split across
* chunks at any byte, so framing is stateful: the trailing partial frame is
* held until the next chunk completes it. `[DONE]` is not part of this
* endpoint's vocabulary and is reported as a payload only if it really appears.
*
* @returns a push function and a flush function; both return whole payloads.
*/
function createSseDecoder() {
	let line = "";
	let lines = [];
	let afterCr = false;
	const endLine = (frames) => {
		if (line.length === 0) {
			if (lines.length > 0) frames.push(lines.join("\n"));
			lines = [];
		} else if (line.startsWith("data:")) lines.push(line.slice(5).trimStart());
		line = "";
	};
	return {
		push(chunk) {
			const frames = [];
			for (const char of chunk) {
				if (afterCr) {
					afterCr = false;
					if (char === "\n") continue;
				}
				if (char === "\r") {
					endLine(frames);
					afterCr = true;
				} else if (char === "\n") endLine(frames);
				else line += char;
			}
			return frames;
		},
		flush() {
			const frames = [];
			if (line.length > 0) endLine(frames);
			if (lines.length > 0) frames.push(lines.join("\n"));
			line = "";
			lines = [];
			afterCr = false;
			return frames;
		}
	};
}
export { USAGE_SETTINGS_URL, createSseDecoder, decodeEvent, isPlanUsageCode };

//# sourceMappingURL=events.js.map