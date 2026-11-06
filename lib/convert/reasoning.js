import { createHash } from "node:crypto";
// src/convert/reasoning.ts
/** Durable configuration updates bound to the exact Responses input prefix. */
const efforts = /* @__PURE__ */ new Set([
	"none",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
]);
/** Restrict updates to the documented standard GPT-6 model family. */
function supportsReasoningUpdates(model) {
	return /^gpt-6(?:\.\d+)?-(?:astra|sol|terra|luna)(?:-\d{4}-\d{2}-\d{2})?$/.test(model);
}
/** Validate adapter-private metadata read from a durable session. */
function readReasoningReplay(value) {
	if (value === null || typeof value !== "object") return void 0;
	const v = value;
	if (v["baseEffort"] !== null && (typeof v["baseEffort"] !== "string" || !efforts.has(v["baseEffort"]))) return void 0;
	if (typeof v["effort"] !== "string" || !efforts.has(v["effort"]) || typeof v["inputCount"] !== "number" || !Number.isSafeInteger(v["inputCount"]) || v["inputCount"] < 0 || typeof v["inputHash"] !== "string" || !/^[a-f0-9]{64}$/.test(v["inputHash"]) || !Array.isArray(v["updates"])) return void 0;
	const updates = [];
	for (const item of v["updates"]) {
		if (item === null || typeof item !== "object") return void 0;
		const u = item;
		if (typeof u["index"] !== "number" || !Number.isSafeInteger(u["index"]) || u["index"] < 0 || u["index"] >= v["inputCount"] || typeof u["effort"] !== "string" || !efforts.has(u["effort"]) || updates.length > 0 && u["index"] <= updates[updates.length - 1].index + 1) return void 0;
		updates.push({
			index: u["index"],
			effort: u["effort"]
		});
	}
	if (v["effort"] !== (updates.at(-1)?.effort ?? v["baseEffort"] ?? "medium")) return void 0;
	return {
		baseEffort: v["baseEffort"],
		effort: v["effort"],
		inputCount: v["inputCount"],
		inputHash: v["inputHash"],
		updates
	};
}
function hash(input) {
	return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
function update(effort) {
	return {
		type: "configuration_update",
		reasoning: { effort }
	};
}
/** Restore updates only when the recorded request still precedes its assistant unchanged. */
function prepareReasoning(raw, selected, previous, assistantEnd) {
	let input = raw.slice();
	let baseEffort = selected ?? null;
	let effective = selected ?? "medium";
	let updates = [];
	if (previous !== void 0) {
		const saved = previous.state;
		const candidate = raw.slice();
		for (const u of saved.updates) candidate.splice(u.index, 0, update(u.effort));
		if (saved.inputCount === previous.assistantOffset + saved.updates.length && hash(candidate.slice(0, saved.inputCount)) === saved.inputHash) {
			input = candidate;
			baseEffort = saved.baseEffort;
			effective = saved.effort;
			updates = saved.updates.slice();
		}
	}
	const desired = selected ?? "medium";
	if (desired !== effective) {
		const nextUser = input.findIndex((item, index) => index >= assistantEnd + updates.length && item["role"] === "user");
		const index = nextUser < 0 ? input.length : nextUser;
		input.splice(index, 0, update(desired));
		updates.push({
			index,
			effort: desired
		});
	}
	return {
		input,
		effort: baseEffort ?? void 0,
		state: {
			baseEffort,
			effort: desired,
			inputCount: input.length,
			inputHash: hash(input),
			updates
		}
	};
}
export { prepareReasoning, readReasoningReplay, supportsReasoningUpdates };

//# sourceMappingURL=reasoning.js.map