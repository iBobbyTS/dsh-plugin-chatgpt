import { isReplayNamespace } from "../auth/credential.js";
import { createHash } from "node:crypto";
// src/convert/replay.ts
/**
* Native Responses history carried through DSH's adapter-private ReplayEnvelope.
* Transcript edits, pruning, route/model switches and account changes invalidate
* native replay; durable visible content remains authoritative.
*/
function record(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
/** Validate complete supported items while retaining native IDs, phases and opaque state. */
function outputItem(value) {
	const item = record(value);
	if (item === void 0) return void 0;
	if (item["id"] !== void 0 && typeof item["id"] !== "string") return void 0;
	switch (item["type"]) {
		case "message":
			if (item["role"] !== "assistant" || !Array.isArray(item["content"])) return void 0;
			if (!item["content"].every((part) => {
				const p = record(part);
				return p?.["type"] === "output_text" && typeof p["text"] === "string" || p?.["type"] === "refusal" && typeof p["refusal"] === "string";
			})) return void 0;
			break;
		case "reasoning":
			if (item["summary"] !== void 0 && (!Array.isArray(item["summary"]) || !item["summary"].every((part) => {
				const p = record(part);
				return p?.["type"] === "summary_text" && typeof p["text"] === "string";
			}))) return void 0;
			if (item["content"] !== void 0 && (!Array.isArray(item["content"]) || !item["content"].every((part) => {
				const p = record(part);
				return p?.["type"] === "reasoning_text" && typeof p["text"] === "string";
			}))) return void 0;
			if (item["encrypted_content"] != null && typeof item["encrypted_content"] !== "string") return void 0;
			break;
		case "function_call":
			if ([
				"call_id",
				"name",
				"arguments"
			].some((key) => typeof item[key] !== "string")) return void 0;
			break;
		default: return;
	}
	return structuredClone(item);
}
function outputItems(value) {
	if (!Array.isArray(value)) return void 0;
	const items = value.map(outputItem);
	return items.every((item) => item !== void 0) ? items : void 0;
}
/** Per-item content for native replay validation, before consecutive summaries are grouped for display. */
function outputBlock(item) {
	if (item.type === "function_call") return {
		type: "tool-call",
		id: String(item["call_id"]),
		name: String(item["name"]),
		arguments: String(item["arguments"])
	};
	const summary = (item[item.type === "message" ? "content" : "summary"] ?? []).map((part) => String(part["text"] ?? part["refusal"] ?? "")).join(item.type === "reasoning" ? "\n\n" : "");
	const reasoningContent = item["content"] ?? [];
	const text = summary || (item.type === "reasoning" ? reasoningContent.map((part) => String(part["text"] ?? "")).join("\n\n") : "");
	return {
		type: item.type === "message" ? "text" : "reasoning",
		text
	};
}
/** A reasoning summary can arrive only as deltas, separately from its opaque done item. */
function outputMatchesBlock(item, block) {
	const native = outputBlock(item);
	return item.type === "reasoning" && native.type === "reasoning" && native.text.length === 0 && block.type === "reasoning" && typeof block["text"] === "string" || fingerprint(native) === fingerprint(block);
}
/** Ignore host-only annotations; bind replay to every visible block's content. */
function fingerprint(block) {
	const content = block.type === "tool-call" ? [
		block.type,
		block["id"],
		block["name"],
		block["arguments"]
	] : [block.type, block["text"]];
	return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
/** With store:false, partial reasoning cannot accompany native items linked to its ID. */
function hasCompleteReasoning(output) {
	return output.every((item) => item.type !== "reasoning" || typeof item["id"] === "string" && item["id"].length > 0 && typeof item["encrypted_content"] === "string" && item["encrypted_content"].length > 0);
}
/** Display consecutive native reasoning items as one block, retaining empty items in native history. */
function mergeReasoningBlocks(blocks) {
	const merged = [];
	for (const block of blocks) {
		const last = merged.at(-1);
		if (block.type === "reasoning" && last?.type === "reasoning") {
			if (block.text) last.text += (last.text ? "\n" : "") + block.text;
		} else merged.push({ ...block });
	}
	return merged;
}
function createReplay(context, output, blocks) {
	if (output.length !== blocks.length || !hasCompleteReasoning(output)) return void 0;
	if (output.some((item, index) => !outputMatchesBlock(item, blocks[index]))) return void 0;
	const visible = mergeReasoningBlocks(blocks);
	const grouped = visible.length !== blocks.length;
	return {
		response: {
			kind: "chatgpt-responses",
			version: grouped ? 2 : 1,
			...context,
			blockCount: visible.length,
			output: structuredClone(output),
			...grouped ? { itemBlocks: structuredClone(blocks) } : {}
		},
		blocks: visible.map((block) => ({ fingerprint: fingerprint(block) }))
	};
}
function replayOutput(value, blocks, context) {
	if (context === void 0) return void 0;
	const envelope = record(value);
	const response = record(envelope?.["response"]);
	const metadata = envelope?.["blocks"];
	if (response?.["kind"] !== "chatgpt-responses" || response["version"] !== 1 && response["version"] !== 2 || response["provider"] !== context.provider || response["model"] !== context.model || response["scope"] !== context.scope || response["blockCount"] !== blocks.length || !Array.isArray(metadata) || metadata.length !== blocks.length) return void 0;
	if (blocks.some((block, index) => record(metadata[index])?.["fingerprint"] !== fingerprint(block))) return void 0;
	const output = outputItems(response["output"]);
	if (output === void 0 || !hasCompleteReasoning(output)) return void 0;
	if (response["version"] === 2) {
		const itemBlocks = response["itemBlocks"];
		if (!Array.isArray(itemBlocks) || itemBlocks.length !== output.length || output.some((item, index) => {
			const block = record(itemBlocks[index]);
			return block === void 0 || typeof block["type"] !== "string" || !outputMatchesBlock(item, block);
		})) return void 0;
		const visible = mergeReasoningBlocks(itemBlocks);
		if (visible.length !== blocks.length || visible.some((block, index) => fingerprint(block) !== fingerprint(blocks[index]))) return void 0;
	} else if (output.length !== blocks.length || output.some((item, index) => !outputMatchesBlock(item, blocks[index]))) return void 0;
	return output;
}
/** Never derive native replay identity from optional or synthetic subject/email fields. */
function accountScope(endpoint, credential) {
	if (!isReplayNamespace(credential.replayNamespace) || typeof credential.clientId !== "string" || credential.clientId.trim().length === 0) return void 0;
	return createHash("sha256").update(JSON.stringify([
		"authorization-v1",
		endpoint.replace(/\/+$/, ""),
		credential.clientId,
		credential.replayNamespace
	])).digest("hex");
}
/** Sessionless calls use implicit caching without a global shared key. */
function sessionCacheKey(scope, provider, sessionId, purpose) {
	if (!sessionId) return void 0;
	return createHash("sha256").update(JSON.stringify([
		scope,
		provider,
		sessionId,
		purpose ?? "agent"
	])).digest("hex");
}
export { accountScope, createReplay, mergeReasoningBlocks, outputBlock, outputItem, outputItems, outputMatchesBlock, replayOutput, sessionCacheKey };

//# sourceMappingURL=replay.js.map