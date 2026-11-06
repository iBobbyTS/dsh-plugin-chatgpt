/** Fixed context budgets shared by the model card and host validation. */
export declare const CONTEXT_WINDOWS: readonly [1000000, 800000, 500000, 300000];
export type ContextWindow = typeof CONTEXT_WINDOWS[number];
/** Whether an untrusted setting is one of the model page's choices. */
export declare function isContextWindow(value: unknown): value is ContextWindow;
/** Defaults follow the stable model ID, independent of editable display names. */
export declare function defaultContextWindow(model: string): ContextWindow;
/** Descending fixed choices plus a read-only current value from configuration. */
export declare function contextWindowOptions(current: number): readonly {
    value: number;
    label: string;
    disabled: boolean;
}[];
//# sourceMappingURL=context.d.ts.map