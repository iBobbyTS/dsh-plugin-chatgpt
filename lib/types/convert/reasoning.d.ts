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
} | undefined, assistantEnd: number, inherit?: boolean): {
    input: InputItem[];
    effort: string | undefined;
    state: ReasoningReplay;
};
/** Record the actual request even after a route refuses configuration updates. */
export declare function prepareReasoningWithoutUpdates(input: InputItem[], selected: string | undefined, previous: {
    state: ReasoningReplay;
    assistantOffset: number;
} | undefined, inherit: boolean): {
    input: InputItem[];
    effort: string | undefined;
    state: ReasoningReplay;
};
//# sourceMappingURL=reasoning.d.ts.map