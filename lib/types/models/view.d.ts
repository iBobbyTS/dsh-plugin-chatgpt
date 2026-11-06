/** One roster model as the provider card's model list shows it. */
export interface ModelSwitchView {
    /** The model id, exactly as the roster and a request would carry it. */
    id: string;
    /** Display name from the roster entry, before any hand-set override. */
    defaultName: string;
    /** The name the selector shows: the hand-set override, else the roster's. */
    name: string;
    /** Whether the human switched this model off. */
    disabled: boolean;
    /** Effective context budget selected on the model page. */
    contextWindow: number;
    /** Budget restored when the saved model-page choice is cleared. */
    defaultContextWindow: number;
}
//# sourceMappingURL=view.d.ts.map