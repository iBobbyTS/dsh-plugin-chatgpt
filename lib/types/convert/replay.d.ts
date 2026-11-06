import { type ChatGptCredential } from '../auth/credential.ts';
import type { ReasoningReplay } from './reasoning.ts';
export type OutputItem = Record<string, unknown> & {
    type: 'message' | 'reasoning' | 'function_call';
};
export type ReplayBlock = {
    type: 'text' | 'reasoning';
    text: string;
} | {
    type: 'tool-call';
    id: string;
    name: string;
    arguments: string;
};
export interface ReplayContext {
    provider: string;
    model: string;
    /** Hash of endpoint, client registration and local authorization namespace. */
    scope: string;
    reasoningReplay?: ReasoningReplay;
    reasoningUpdatesUnsupported?: true;
}
export interface ReplayEnvelope {
    response: {
        kind: 'chatgpt-responses';
        version: 1 | 2;
        itemBlocks?: ReplayBlock[];
        provider: string;
        model: string;
        scope: string;
        blockCount: number;
        output: OutputItem[];
        reasoningReplay?: ReasoningReplay;
        reasoningUpdatesUnsupported?: true;
    };
    blocks: {
        fingerprint: string;
    }[];
}
/** Validate complete supported items while retaining native IDs, phases and opaque state. */
export declare function outputItem(value: unknown): OutputItem | undefined;
export declare function outputItems(value: unknown): OutputItem[] | undefined;
/** Per-item content for native replay validation, before consecutive summaries are grouped for display. */
export declare function outputBlock(item: OutputItem): ReplayBlock;
/** A reasoning summary can arrive only as deltas, separately from its opaque done item. */
export declare function outputMatchesBlock(item: OutputItem, block: {
    type: string;
    [key: string]: unknown;
}): boolean;
/** Display consecutive native reasoning items as one block, retaining empty items in native history. */
export declare function mergeReasoningBlocks(blocks: readonly ReplayBlock[]): ReplayBlock[];
export declare function createReplay(context: ReplayContext, output: OutputItem[], blocks: ReplayBlock[]): ReplayEnvelope | undefined;
export declare function replayOutput(value: unknown, blocks: readonly {
    type: string;
    [key: string]: unknown;
}[], context: ReplayContext | undefined): OutputItem[] | undefined;
/** Never derive native replay identity from optional or synthetic subject/email fields. */
export declare function accountScope(endpoint: string, credential: Pick<ChatGptCredential, 'clientId' | 'replayNamespace'>): string | undefined;
/** Sessionless calls use implicit caching without a global shared key. */
export declare function sessionCacheKey(scope: string, provider: string, sessionId?: string, purpose?: string): string | undefined;
//# sourceMappingURL=replay.d.ts.map