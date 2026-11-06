/**
 * Describing the models an account may use.
 *
 * Two facts come from two different places and neither source has both. The
 * subscription endpoint is authoritative about *availability* — it answers what
 * this exact account on this exact plan may call right now — but it describes a
 * model with a slug and a display name and nothing else. The bundled catalog
 * knows capacities and reasoning spellings but cannot know what a given account
 * is entitled to.
 *
 * So availability always comes from the account, and metadata is filled in from
 * the catalog by exact id. A model the catalog has never heard of is not
 * dropped: it is still callable, and a plausible default beats refusing to show
 * a model the account can demonstrably use. The unknown case is where the
 * shipped `catalog.json` earns its keep, and a model that stays unknown is
 * visible as exactly that.
 *
 * @module dsh-plugin-chatgpt/models/describe
 */
/**
 * One model entry as the account's listing describes it.
 *
 * The endpoint returns far more than the published documentation suggests — it
 * describes capacities, reasoning levels, and modalities itself. Those fields
 * are optional here because a listing from another implementation of the same
 * shape may omit them, not because this endpoint does.
 */
export interface ListedModel {
    /** The value to pass as `model` on a request. */
    slug: string;
    /** Human-readable name for selectors. */
    displayName?: string;
    /** The server's `visibility` field; only `list` is meant for display. */
    visibility?: string;
    /** One-line description from the endpoint. */
    description?: string;
    /** Context capacity the endpoint reports for this model. */
    contextWindow?: number;
    /** The largest context the model can be extended to, when it says. */
    maxContextWindow?: number;
    /** Accepted request modalities. */
    inputModalities?: readonly string[];
    /** The effort a request that names none is given. */
    defaultReasoningLevel?: string;
    /** The reasoning efforts the model accepts, in the endpoint's order. */
    reasoningLevels?: readonly {
        effort: string;
        description?: string;
    }[];
}
/** A model the adapter can serve, with everything the harness needs to offer it. */
export interface DescribedModel {
    id: string;
    name: string;
    contextWindow: number;
    /** Catalog maximum metadata; this plugin does not clamp explicit context overrides to it. */
    maxContextWindow?: number;
    /** Output cap, known only from the bundled catalog. */
    maxTokens?: number;
    /** One-line description from the endpoint. */
    description?: string;
    input: readonly ('text' | 'image')[];
    /** Selectable reasoning efforts, adapter-preferred order; absent when the model does not reason. */
    reasoningEfforts?: readonly {
        id: string;
        name: string;
    }[];
    /** The effort a request omits an explicit choice for. */
    defaultReasoningEffort?: string;
    /**
     * Where this description came from: the endpoint itself, a measurement of what
     * this route serves, the bundled catalog, or a conservative default.
     */
    metadataSource: 'endpoint' | 'measured' | 'catalog' | 'fallback';
}
/**
 * Label one reasoning effort, falling back to its own wire spelling.
 * @param effort - the `reasoning.effort` value.
 * @returns the text a selector shows.
 */
export declare function effortLabel(effort: string): string;
/**
 * Describe one listed model.
 *
 * Metadata comes from the endpoint that listed it whenever the endpoint supplied
 * it, and from the bundled catalog otherwise. The catalog is a fallback, not the
 * primary source: treating it as primary would let a stale snapshot override the
 * live description of a model the account is actually entitled to.
 *
 * @param listed - what the account's listing reported.
 * @returns everything the harness needs to offer and call the model.
 */
export declare function describeModel(listed: ListedModel): DescribedModel;
/**
 * Keep only the entries meant for display, preserving the server's order.
 *
 * The order is the server's ranking of what this account should reach for
 * first, so it is worth preserving rather than imposing an alphabetical one.
 *
 * @param listed - every entry the listing returned.
 * @returns the describable models, in the order the server gave.
 */
export declare function describableModels(listed: readonly ListedModel[]): DescribedModel[];
//# sourceMappingURL=describe.d.ts.map