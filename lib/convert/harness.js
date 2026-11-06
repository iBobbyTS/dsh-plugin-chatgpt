import * as llm from "@deepseek-ai/dsh-llm";
// src/convert/harness.ts
/** Translate one harness request into what the adapter reads. */
function requestOf(options) {
	const messages = options.messages.map((message) => {
		const blocks = message.content.map((block) => {
			if (block.type === "tool-call") {
				const call = block;
				return {
					type: "tool-call",
					id: String(call.id),
					name: call.name,
					arguments: call.arguments
				};
			}
			if (block.type === "image") return {
				type: "text",
				text: "[image omitted: not yet supported]"
			};
			if (block.type === "file") return {
				type: "text",
				text: "[file omitted: not yet supported]"
			};
			if (block.type === "text" || block.type === "reasoning") return {
				type: block.type,
				text: block.text
			};
			return {
				type: "text",
				text: ""
			};
		});
		const tool = message.role === "tool" ? message : void 0;
		return {
			role: message.role,
			source: message.source,
			content: blocks,
			...tool?.toolCallId === void 0 ? {} : { toolCallId: String(tool.toolCallId) },
			...tool?.isError === true ? { isError: true } : {}
		};
	});
	return {
		provider: options.provider,
		model: options.model,
		messages,
		...options.sessionId === void 0 ? {} : { sessionId: String(options.sessionId) },
		...options.purpose === void 0 ? {} : { purpose: options.purpose },
		...options.system === void 0 ? {} : { system: options.system },
		...options.reasoningEffort === void 0 ? {} : { reasoningEffort: String(options.reasoningEffort) },
		...options.tools === void 0 ? {} : { tools: options.tools.map((tool) => ({
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters
		})) },
		...options.signal === void 0 ? {} : { signal: options.signal }
	};
}
/** Resolve durable DSH image references to SIWC input_image data URLs, preserving block order. */
async function requestOfWithImages(options, readImage) {
	const request = requestOf(options);
	if (!options.messages.some((message) => message.content.some((block) => block.type === "image"))) return request;
	const messages = await Promise.all(options.messages.map(async (message, messageIndex) => ({
		...request.messages[messageIndex],
		content: await Promise.all(message.content.map(async (block, blockIndex) => {
			if (block.type !== "image") return request.messages[messageIndex].content[blockIndex];
			if (block.offloaded === true) {
				const attachmentId = block.attachment.attachmentId;
				const hostFormat = llm.offloadedImageText;
				return {
					type: "text",
					text: hostFormat?.(block.attachment) ?? `[image offloaded by DSH to fit model input limits: ${attachmentId}]`
				};
			}
			if (readImage === void 0) throw new Error("ChatGPT vision input needs the DSH attachment store; image content was not sent");
			options.signal?.throwIfAborted();
			const stored = await readImage(block.attachment, options.signal);
			options.signal?.throwIfAborted();
			if (!/^image\/(png|jpeg|webp|gif)$/.test(stored.ref.mediaType) || stored.data.length === 0) throw new Error("ChatGPT vision input: unsupported or empty image attachment");
			return {
				type: "image",
				url: `data:${stored.ref.mediaType};base64,${Buffer.from(stored.data).toString("base64")}`
			};
		}))
	})));
	return {
		...request,
		messages
	};
}
export { requestOf, requestOfWithImages };

//# sourceMappingURL=harness.js.map