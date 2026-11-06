import { DIRECT_TOKEN_SCOPE } from "../auth/protocol.js";
import { prepareReasoning, supportsReasoningUpdates } from "./reasoning.js";
// src/convert/request.ts
const STORE = false;
const STREAM = true;
/** Cache options remain disabled pending route-specific validation. */
const REFUSED_FIELDS = [
	"background",
	"conversation",
	"max_output_tokens",
	"max_tool_calls",
	"metadata",
	"moderation",
	"multi_agent",
	"prompt",
	"previous_response_id",
	"prompt_cache_breakpoint",
	"prompt_cache_options",
	"prompt_cache_retention",
	"safety_identifier",
	"temperature",
	"top_logprobs",
	"top_p",
	"truncation",
	"user"
];
function textOf(content) {
	return typeof content === "string" ? content : content.filter((part) => part.type === "text").map((part) => part.text).join("");
}
/** Preserve message and assistant-block order; instruction roles stay in place. */
function toResponsesBody(request) {
	return prepareResponsesRequest(request).body;
}
/** Build the wire request and the configuration snapshot saved with its response. */
function prepareResponsesRequest(request) {
	const input = [];
	let previous;
	let assistantEnd = 0;
	let unsupported = false;
	const leadingRole = request.messages[0]?.role;
	if (request.system && leadingRole !== "system") input.push({
		type: "message",
		role: "developer",
		content: [{
			type: "input_text",
			text: request.system
		}]
	});
	for (const message of request.messages) {
		if (message.role === "assistant") {
			unsupported = message.reasoningUpdatesUnsupported === true;
			previous = message.reasoningReplay === void 0 ? void 0 : {
				state: message.reasoningReplay,
				assistantOffset: input.length
			};
		}
		if (message.role === "assistant" && message.replay !== void 0) {
			input.push(...structuredClone(message.replay).map((item) => item.type === "reasoning" && item["summary"] === void 0 ? {
				...item,
				summary: []
			} : item));
			assistantEnd = input.length;
			continue;
		}
		if (message.role === "tool") {
			if (message.toolCallId === void 0) continue;
			const output = typeof message.content !== "string" && message.content.some((part) => part.type === "image") ? message.content.flatMap((part) => part.type === "text" ? [{
				type: "input_text",
				text: message.isError ? `Error: ${part.text}` : part.text
			}] : part.type === "image" ? [{
				type: "input_image",
				image_url: part.url
			}] : []) : textOf(message.content);
			input.push({
				type: "function_call_output",
				call_id: message.toolCallId,
				output: message.isError && typeof output === "string" ? `Error: ${output}` : output
			});
			continue;
		}
		const role = message.role === "system" ? "developer" : message.role;
		const parts = typeof message.content === "string" ? [{
			type: "text",
			text: message.content
		}] : message.content;
		let content = [];
		const flush = () => {
			if (content.length > 0) input.push({
				type: "message",
				role,
				content
			});
			content = [];
		};
		for (const part of parts) if (part.type === "tool-call") {
			if (role !== "assistant") continue;
			flush();
			input.push({
				type: "function_call",
				call_id: part.id,
				name: part.name,
				arguments: part.arguments
			});
		} else if (part.type === "text") {
			if (part.text.length > 0) content.push({
				type: role === "assistant" ? "output_text" : "input_text",
				text: part.text
			});
		} else if (role === "user") content.push({
			type: "input_image",
			image_url: part.url
		});
		flush();
		if (message.role === "assistant") assistantEnd = input.length;
	}
	unsupported ||= request.reasoningUpdatesUnsupported === true;
	const prepared = !unsupported && supportsReasoningUpdates(request.model) ? prepareReasoning(input, request.reasoningEffort, previous, assistantEnd) : void 0;
	const effort = prepared === void 0 ? request.reasoningEffort : prepared.effort;
	return {
		body: {
			model: request.model,
			input: prepared?.input ?? input,
			stream: true,
			store: false,
			...request.cacheKey === void 0 ? {} : { prompt_cache_key: request.cacheKey },
			...request.tools?.length ? { tools: request.tools.map((tool) => ({
				type: "function",
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters
			})) } : {},
			...effort === void 0 ? {} : {
				reasoning: {
					effort,
					summary: "concise"
				},
				include: ["reasoning.encrypted_content"]
			}
		},
		...prepared === void 0 ? {} : { reasoningReplay: prepared.state },
		...unsupported ? { reasoningUpdatesUnsupported: true } : {}
	};
}
export { DIRECT_TOKEN_SCOPE, REFUSED_FIELDS, STORE, STREAM, prepareResponsesRequest, toResponsesBody };

//# sourceMappingURL=request.js.map