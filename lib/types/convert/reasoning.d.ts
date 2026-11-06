import type { InputItem } from './request.ts';
export interface ReasoningReplay {
    /** null means the initial request omitted reasoning.effort. */
    baseEffort: string | null;
    effort: string;
    inputCount: number;
    inputHash: string;
    updates: {
        index: number;
        effort: string;
    }[];
}
/** Restrict updates to the documented standard GPT-6 model family. */
export declare function supportsReasoningUpdates(model: string): boolean;
/** Validate adapter-private metadata read from a durable session. */
export declare function readReasoningReplay(value: unknown): ReasoningReplay | undefined;
/** Restore updates only when the recorded request still precedes its assistant unchanged. */
export declare function prepareReasoning(raw: InputItem[], selected: string | undefined, previous: {
    state: ReasoningReplay;
    assistantOffset: number;
} | undefined, assistantEnd: number): {
    input: InputItem[];
    effort: string | undefined;
    state: ReasoningReplay;
};
//# sourceMappingURL=reasoning.d.ts.map