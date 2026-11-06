/**
 * An ordered conversation for the public SIWC Responses route. Moving tool
 * results behind later messages breaks conversation semantics and cache reuse.
 */
import { DIRECT_TOKEN_SCOPE } from '../auth/protocol.ts';
import type { OutputItem } from './replay.ts';
import { type ReasoningReplay } from './reasoning.ts';
export declare const STORE = false;
export declare const STREAM = true;
/** Cache options remain disabled pending route-specific validation. */
export declare const REFUSED_FIELDS: readonly ["background", "conversation", "max_output_tokens", "max_tool_calls", "metadata", "moderation", "multi_agent", "prompt", "previous_response_id", "prompt_cache_breakpoint", "prompt_cache_options", "prompt_cache_retention", "safety_identifier", "temperature", "top_logprobs", "top_p", "truncation", "user"];
export interface TextPart {
    type: 'text';
    text: string;
}
export interface ImagePart {
    type: 'image';
    url: string;
}
export interface ToolCallPart {
    type: 'tool-call';
    id: string;
    name: string;
    arguments: string;
}
export type InputPart = TextPart | ImagePart | ToolCallPart;
export interface NeutralMessage {
    role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
    content: string | readonly InputPart[];
    toolCallId?: string;
    isError?: boolean;
    /** Validated native items from this assistant message's durable state. */
    replay?: readonly OutputItem[];
    reasoningReplay?: ReasoningReplay;
    reasoningUpdatesUnsupported?: true;
}
export interface NeutralTool {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}
export interface NeutralRequest {
    /** Explicit subscription-route refusal, retained with the next successful response. */
    reasoningUpdatesUnsupported?: true;
    model: string;
    messages: readonly NeutralMessage[];
    /** Used when history has no leading system/developer instruction. */
    system?: string;
    tools?: readonly NeutralTool[];
    reasoningEffort?: string;
    maxTokens?: number;
    cacheKey?: string;
}
export type InputItem = Record<string, unknown> & {
    type: string;
};
export interface ResponsesBody {
    model: string;
    input: InputItem[];
    stream: typeof STREAM;
    store: typeof STORE;
    prompt_cache_key?: string;
    include?: ['reasoning.encrypted_content'];
    tools?: readonly {
        type: 'function';
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    }[];
    reasoning?: {
        effort: string;
        summary: 'concise';
    };
}
/** Preserve message and assistant-block order; instruction roles stay in place. */
export declare function toResponsesBody(request: NeutralRequest): ResponsesBody;
/** Build the wire request and the configuration snapshot saved with its response. */
export declare function prepareResponsesRequest(request: NeutralRequest): {
    body: ResponsesBody;
    reasoningReplay?: ReasoningReplay;
    reasoningUpdatesUnsupported?: true;
};
export { DIRECT_TOKEN_SCOPE };
//# sourceMappingURL=request.d.ts.map