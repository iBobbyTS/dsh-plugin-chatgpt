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
import { type OutputItem } from '../convert/replay.ts';
export interface WireIdentity {
    index?: number;
    itemId?: string;
}
/** One decoded stream event worth surfacing. */
export type ResponsesEvent = ({
    kind: 'text';
    delta: string;
} & WireIdentity) | ({
    kind: 'reasoning';
    delta: string;
    summaryIndex?: number;
} & WireIdentity) | ({
    kind: 'itemStart' | 'itemEnd';
    item: OutputItem;
} & WireIdentity) | ({
    kind: 'toolCallStart';
    callId: string;
    name: string;
} & WireIdentity) | ({
    kind: 'toolCallDelta';
    delta: string;
} & WireIdentity) | ({
    kind: 'toolCallEnd';
    arguments: string;
} & WireIdentity) | {
    kind: 'completed';
    responseId?: string;
    usage?: ResponsesUsage;
    output?: OutputItem[];
} | {
    kind: 'incomplete';
    reason: string;
    usage?: ResponsesUsage;
} | {
    kind: 'failed';
    code: string;
    message: string;
    terminal: boolean;
    usage?: ResponsesUsage;
} | {
    kind: 'unknown';
    type: string;
};
/**
 * Token accounting one completed response may report.
 *
 * The fields are the harness's, not the wire's, because the two disagree in a way
 * that silently corrupts a total: OpenAI folds cached input into `input_tokens`,
 * while the harness counts disjoint buckets and sums them. Reporting the wire
 * value unchanged would bill the cached tokens twice.
 */
export interface ResponsesUsage {
    /** Input tokens the account was not billed a cache read for. */
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
}
/** Whether a failure code describes the account's plan rather than the request. */
export declare function isPlanUsageCode(code: string): boolean;
/** Where a user reviews and limits each app's use of their ChatGPT plan. */
export declare const USAGE_SETTINGS_URL = "https://chatgpt.com/settings/usage";
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
export declare function decodeEvent(payload: string): ResponsesEvent | undefined;
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
export declare function createSseDecoder(): {
    push(chunk: string): string[];
    flush(): string[];
};
//# sourceMappingURL=events.d.ts.map