import { createReplay, mergeReasoningBlocks, outputBlock, outputMatchesBlock } from "./replay.js";
import { normalizeFailureCode } from "../api/failure.js";
// src/convert/blocks.ts
var BlockTranslator = class {
	states = [];
	emitted = [];
	display = [];
	byIndex = /* @__PURE__ */ new Map();
	byId = /* @__PURE__ */ new Map();
	byCall = /* @__PURE__ */ new Map();
	anonymous;
	hasAnonymous = false;
	replayable = true;
	terminal = false;
	context;
	constructor(context) {
		this.context = context;
	}
	find(identity, callId) {
		const identified = identity.itemId === void 0 ? void 0 : this.byId.get(identity.itemId);
		const called = callId === void 0 ? void 0 : this.byCall.get(callId);
		const indexed = identity.index === void 0 ? void 0 : this.byIndex.get(identity.index);
		if (identified !== void 0) return identified;
		if (called !== void 0) return called;
		return indexed !== void 0 && identity.itemId !== void 0 && indexed.itemId !== void 0 && indexed.itemId !== identity.itemId ? void 0 : indexed;
	}
	bind(state, identity) {
		if (identity.itemId !== void 0 && state.itemId === void 0) {
			state.itemId = identity.itemId;
			this.byId.set(identity.itemId, state);
		}
		if (identity.index !== void 0) {
			const indexed = this.byIndex.get(identity.index);
			if (indexed !== void 0 && indexed !== state || state.wireIndex !== void 0 && state.wireIndex !== identity.index) this.replayable = false;
			else {
				state.wireIndex = identity.index;
				this.byIndex.set(identity.index, state);
			}
		}
	}
	open(block, identity) {
		const state = {
			block,
			closed: false,
			pending: []
		};
		this.states.push(state);
		this.bind(state, identity);
		if (block.type === "tool-call") this.byCall.set(block.id, state);
		if (identity.index === void 0 && identity.itemId === void 0 && block.type !== "tool-call") {
			this.hasAnonymous = true;
			this.anonymous = state;
		}
		return state;
	}
	close(state) {
		if (state.closed) return;
		state.closed = true;
		state.pending.push({
			type: "block-end",
			index: -1,
			block: { ...state.block }
		});
	}
	/** A gap is buffered so a late earlier item can still precede it in DSH's first-seen order. */
	flush(force = false) {
		let ordered;
		if (this.hasAnonymous) ordered = this.states;
		else if (force) ordered = this.states.every((state) => state.wireIndex !== void 0) ? [...this.states].sort((a, b) => a.wireIndex - b.wireIndex) : this.states;
		else {
			ordered = [];
			if (this.states.some((state) => state.wireIndex === void 0)) return [];
			for (let index = 0; this.byIndex.has(index); index++) ordered.push(this.byIndex.get(index));
		}
		for (const state of ordered) if (state.localIndex === void 0) {
			state.localIndex = this.emitted.length;
			this.emitted.push(state);
			const last = this.display.at(-1);
			if (state.block.type === "reasoning" && last?.states[0]?.block.type === "reasoning") last.states.push(state);
			else this.display.push({
				states: [state],
				started: false,
				closed: false,
				text: ""
			});
		}
		const chunks = [];
		for (const [index, group] of this.display.entries()) {
			if (group.closed) continue;
			const first = group.states[0];
			if (!group.started) {
				group.started = true;
				chunks.push({
					type: "block-start",
					index,
					blockType: first.block.type
				});
			}
			if (first.block.type !== "reasoning") {
				for (const chunk of first.pending.splice(0)) chunks.push({
					...chunk,
					index
				});
				group.closed = first.closed;
				continue;
			}
			const ready = [];
			for (const state of group.states) {
				ready.push(state.block);
				state.pending.length = 0;
				if (!state.closed) break;
			}
			const block = mergeReasoningBlocks(ready)[0];
			if (block.text.startsWith(group.text)) {
				const delta = block.text.slice(group.text.length);
				if (delta) chunks.push({
					type: "reasoning-delta",
					index,
					text: delta
				});
				group.text = block.text;
			}
			if (group.states.every((state) => state.closed) && (force || index < this.display.length - 1)) {
				group.closed = true;
				chunks.push({
					type: "block-end",
					index,
					block
				});
			} else break;
		}
		return chunks;
	}
	fits(state, item) {
		const block = outputBlock(item);
		if (block.type !== state.block.type) return false;
		if (state.closed || block.type === "reasoning" && block.text.length === 0) return outputMatchesBlock(item, state.block);
		if (block.type === "tool-call" && state.block.type === "tool-call") return block.id === state.block.id && block.name === state.block.name && block.arguments.startsWith(state.block.arguments);
		return block.type !== "tool-call" && state.block.type !== "tool-call" && block.text.startsWith(state.block.text);
	}
	finishItem(state, item) {
		const block = outputBlock(item);
		if (state.block.type !== block.type) {
			this.replayable = false;
			return;
		}
		if (!state.closed) {
			if (!(block.type === "reasoning" && block.text.length === 0)) state.block = block;
			this.close(state);
		}
		if (outputMatchesBlock(item, state.block)) state.native = item;
		else this.replayable = false;
	}
	item(identity, item, done) {
		const block = outputBlock(item);
		let state = this.find(identity, block.type === "tool-call" ? block.id : void 0);
		if (state === void 0 && done) {
			const candidates = this.states.filter((s) => !s.closed && s.itemId === void 0 && s.wireIndex === void 0 && this.fits(s, item));
			if (candidates.length === 1) state = candidates[0];
		}
		if (state === void 0) state = this.open(block.type === "tool-call" ? {
			...block,
			arguments: ""
		} : {
			...block,
			text: ""
		}, identity);
		else this.bind(state, identity);
		if (state.block.type !== block.type) {
			this.replayable = false;
			return;
		}
		if (done) this.finishItem(state, item);
	}
	append(kind, delta, identity) {
		const identified = identity.index !== void 0 || identity.itemId !== void 0;
		let state = identified ? this.find(identity) : this.anonymous;
		if (state === void 0 || !identified && (state.closed || state.block.type !== kind)) {
			if (!identified && state !== void 0) this.close(state);
			state = this.open({
				type: kind,
				text: ""
			}, identity);
		} else this.bind(state, identity);
		if (!identified) this.anonymous = state;
		if (state.closed) return;
		if (state.block.type !== kind) {
			this.replayable = false;
			return;
		}
		if (kind === "reasoning" && identity.summaryIndex !== void 0) {
			if (state.summaryIndex !== void 0 && state.summaryIndex !== identity.summaryIndex && state.block.text.length > 0) delta = "\n\n" + delta;
			state.summaryIndex = identity.summaryIndex;
		}
		state.block.text += delta;
		state.pending.push({
			type: kind === "text" ? "text-delta" : "reasoning-delta",
			index: -1,
			text: delta
		});
	}
	/** Positions may introduce missing items only after the snapshot agrees with every known identity. */
	completeSnapshot(output) {
		const ids = output.map((item) => typeof item["id"] === "string" ? item["id"] : void 0).filter((id) => id !== void 0);
		if (new Set(ids).size !== ids.length) return false;
		if (this.states.some((state) => state.wireIndex === void 0)) return false;
		return this.states.every((state) => {
			const callId = state.block.type === "tool-call" ? state.block.id : void 0;
			const index = state.itemId !== void 0 ? output.findIndex((item) => item["id"] === state.itemId) : callId !== void 0 ? output.findIndex((item) => item.type === "function_call" && item["call_id"] === callId) : state.wireIndex;
			return index !== void 0 && index >= 0 && output[index] !== void 0 && (state.wireIndex === void 0 || state.wireIndex === index) && (state.localIndex === void 0 || state.localIndex === index) && this.fits(state, output[index]);
		});
	}
	snapshot(output) {
		if (!output?.length) return;
		if (this.completeSnapshot(output)) {
			if (this.states.some((state) => state.itemId === void 0 && state.block.type !== "tool-call")) this.replayable = false;
			output.forEach((item, index) => this.item({
				index,
				...typeof item["id"] === "string" ? { itemId: item["id"] } : {}
			}, item, true));
			return;
		}
		for (const item of output) {
			const state = typeof item["id"] === "string" ? this.byId.get(item["id"]) : item.type === "function_call" ? this.byCall.get(String(item["call_id"])) : void 0;
			if (state === void 0 || state.block.type !== outputBlock(item).type) {
				this.replayable = false;
				continue;
			}
			if (state.native?.type === "reasoning" && item.type === "reasoning") {
				if (!state.native["encrypted_content"] && typeof item["encrypted_content"] === "string") state.native = {
					...state.native,
					encrypted_content: item["encrypted_content"]
				};
			} else if (!this.fits(state, item)) this.replayable = false;
			else if (state.native === void 0) this.finishItem(state, item);
		}
	}
	push(event) {
		if (this.terminal) return [];
		switch (event.kind) {
			case "text":
				this.append("text", event.delta, event);
				break;
			case "reasoning":
				this.append("reasoning", event.delta, event);
				break;
			case "itemStart":
				this.item(event, event.item, false);
				break;
			case "itemEnd":
				this.item(event, event.item, true);
				break;
			case "toolCallStart": {
				if (this.anonymous !== void 0) this.close(this.anonymous);
				this.anonymous = void 0;
				const state = this.find(event, event.callId);
				if (state === void 0) this.open({
					type: "tool-call",
					id: event.callId,
					name: event.name,
					arguments: ""
				}, event);
				else this.bind(state, event);
				break;
			}
			case "toolCallDelta":
			case "toolCallEnd": {
				const state = this.find(event);
				if (state === void 0 || state.closed || state.block.type !== "tool-call") break;
				this.bind(state, event);
				if (event.kind === "toolCallDelta") {
					state.block.arguments += event.delta;
					state.pending.push({
						type: "tool-call-delta",
						index: -1,
						id: state.block.id,
						name: state.block.name,
						argumentsDelta: event.delta
					});
				} else {
					state.block.arguments = event.arguments;
					this.close(state);
				}
				break;
			}
			case "completed": {
				this.snapshot(event.output);
				const chunks = this.endAll();
				const output = this.emitted.map((state) => state.native);
				const replayState = this.context === void 0 || !this.replayable || output.some((item) => item === void 0) ? void 0 : createReplay(this.context, output, this.emitted.map((state) => state.block));
				if (event.usage !== void 0) chunks.push({
					type: "usage",
					usage: event.usage
				});
				const hasToolCalls = this.emitted.some((state) => state.block.type === "tool-call" && state.block.name.length > 0);
				const hasAnswer = this.emitted.some((state) => state.block.type === "text" && state.block.text.trim().length > 0);
				chunks.push({
					type: "finish",
					reason: !hasToolCalls && !hasAnswer ? {
						kind: "error",
						failure: {
							code: "EMPTY_RESPONSE",
							message: "the model completed without an answer or executable tool call"
						}
					} : { kind: hasToolCalls ? "tool-calls" : "stop" },
					...!hasToolCalls && !hasAnswer || replayState === void 0 ? {} : { replayState }
				});
				this.terminal = true;
				return chunks;
			}
			case "incomplete":
			case "failed": {
				this.terminal = true;
				const reason = event.kind === "incomplete" ? event.reason === "max_output_tokens" ? { kind: "max-tokens" } : {
					kind: "error",
					failure: {
						code: event.reason === "content_filter" ? "CONTENT_FILTER" : "INCOMPLETE_RESPONSE",
						message: `the provider returned an incomplete response (${event.reason})`
					}
				} : {
					kind: "error",
					failure: {
						message: event.message,
						code: normalizeFailureCode(event.code, event.message)
					}
				};
				return [
					...this.endAll(),
					...event.usage === void 0 ? [] : [{
						type: "usage",
						usage: event.usage
					}],
					{
						type: "finish",
						reason
					}
				];
			}
		}
		return this.flush();
	}
	/** Preserve all received display content when a stream terminates or is interrupted. */
	endAll() {
		this.states.forEach((state) => this.close(state));
		return this.flush(true);
	}
};
export { BlockTranslator };

//# sourceMappingURL=blocks.js.map