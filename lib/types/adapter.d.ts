/**
 * The harness-facing adapter for a ChatGPT plan.
 *
 * This is the only module that knows both vocabularies. Everything below it —
 * the sign-in protocol, the request translation, the block numbering — is
 * deliberately independent of the harness so it can be tested without mounting
 * one; everything above it is the harness, which knows nothing about OpenAI's
 * stream format.
 *
 * Three behaviours here are policy rather than plumbing:
 *
 * - **Not being signed in is not an error.** The catalog is empty and the
 *   provider reports itself unconfigured, because a route with no account is a
 *   route waiting for one, not a broken route. Failing here would make the
 *   model selector unusable before the first sign-in.
 * - **A listing failure is not fatal to a call.** The model list is a
 *   convenience for the selector; a request naming a model directly is served
 *   with metadata from the catalog. Losing the listing must not lose the turn.
 * - **Model metadata is cached briefly.** The listing is a network call, and the
 *   selector may ask for it more than once per interaction. The cache is short
 *   because an account's entitlement can change under it, and a stale list is
 *   how a user is offered a model they can no longer call.
 *
 * @module dsh-plugin-chatgpt/adapter
 */
import { type AdapterChunk } from './convert/blocks.ts';
import { type NeutralRequest } from './convert/request.ts';
import { type DescribedModel } from './models/describe.ts';
import { type ModelSwitchView } from './models/switches.ts';
import type { ChatGptAuth } from './auth/manager.ts';
/**
 * A failure that already carries a machine-readable code.
 *
 * This shape is what the plugin's own layers raise: the client sets a `code` off
 * the endpoint's answer, and the adapter sets one for its own refusals. The host
 * boundary translates it into the harness's error class, because that class
 * belongs to the host — naming it here would make this module unusable outside a
 * mounted harness, including in its own tests.
 */
export interface CodedError extends Error {
    /** Stable machine code, from the endpoint or from this plugin. */
    code: string;
    /** HTTP status, when the failure was a response rather than a transport fault. */
    status?: number;
    /** Whether the account's plan is what refused. */
    planUsage?: boolean;
}
/**
 * Whether a thrown value already carries a usable code.
 *
 * A property check rather than `instanceof`: the harness may resolve a second
 * copy of this package, and an error thrown by one copy is not an instance of
 * the other's class.
 */
export declare function isCodedError(error: unknown): error is CodedError;
/** What the adapter needs from the world around it. */
export interface ChatGptAdapterOptions {
    /** The credential owner this adapter asks for a usable grant. */
    auth: ChatGptAuth;
    /** API base URL override (tests, gateways). */
    baseUrl?: string;
    /** Display name for the provider row. */
    displayName?: string;
    /**
     * Offer the models measured to work on this route that the account's listing
     * omits. Defaults to true: the listing demonstrably leaves out models this
     * route serves, and hiding them hides capability the account already has.
     */
    includeUnlisted?: boolean;
    /** Explicit DSH context budget takes precedence over catalog metadata; absent uses model-ID defaults. */
    contextWindowLimit?: number | (() => number | undefined);
    /** Exact model IDs mapped to context budgets, taking precedence over the global budget. */
    modelContextWindowLimits?: Readonly<Record<string, number>> | (() => Readonly<Record<string, number>> | undefined);
    /** Maximum idle time waiting for a streaming SSE chunk, in ms. */
    streamIdleTimeoutMs?: number | (() => number | undefined);
    /** Clock, so the listing cache can be tested. */
    now?: () => number;
    /**
     * Called when a listing succeeds after one or more failures.
     *
     * The harness's model selector caches its own catalog; when a provider failure
     * is cached, its in-menu Retry can re-read that cache instead of asking the
     * provider again. The plugin turns this callback into
     * `llm/adapters-updated`, so a roster that recovers replaces the stale failure
     * without a window reload.
     */
    onListingRecovered?: () => void;
    /**
     * The installation's state directory, where the roster overrides record
     * (switches and display names) lives.
     *
     * Optional so tests that never touch overrides can omit it; the override
     * methods fail loudly when it is absent rather than pretending to remember
     * edits.
     */
    stateDir?: string;
    /**
     * Called after a roster override is persisted.
     *
     * The selector rebuilds its catalog only when the Host says something changed,
     * so a toggle that hid or restored a model — or a rename it should display —
     * would otherwise not appear until a reload. The plugin turns this into
     * `llm/adapters-updated`, exactly as a roster change does.
     */
    onModelSwitchesChanged?: () => void;
}
/** One model as the harness reads a listing. */
export interface HarnessModelInfo {
    provider: string;
    id: string;
    name: string;
    inputModalities: readonly ('text' | 'image')[];
}
/** Everything the harness may know about one model. */
export interface HarnessResolvedModel extends HarnessModelInfo {
    context: {
        contextWindow: number;
    };
    defaultMaxTokens?: number;
    systemPromptUpdate?: 'in-history';
    reasoning?: {
        efforts: readonly {
            id: string;
            name: string;
            description?: string;
        }[];
        defaultEffort?: string;
    };
}
/** One request as the harness states it, reduced to what this adapter reads. */
export interface HarnessRequest {
    provider: string;
    model: string;
    messages: readonly HarnessMessage[];
    system?: string;
    tools?: readonly {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    }[];
    reasoningEffort?: string;
    signal?: AbortSignal;
    sessionId?: string;
    purpose?: string;
}
/** One message as the harness states it. */
export interface HarnessMessage {
    role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
    content: readonly HarnessBlock[];
    /** Present on a tool-role message: the call it answers. */
    toolCallId?: string;
    isError?: boolean;
    source?: unknown;
}
/** One content block as the harness states it. */
export type HarnessBlock = {
    type: 'text';
    text: string;
} | {
    type: 'reasoning';
    text: string;
} | {
    type: 'tool-call';
    id: string;
    name: string;
    arguments: string;
} | {
    type: string;
    [key: string]: unknown;
};
/** Preserve roles, blocks and tool results in the host's conversational order. */
export declare function toNeutralRequest(request: HarnessRequest, scope?: string): NeutralRequest;
/**
 * Serves one harness provider route from a ChatGPT plan.
 *
 * The route name is supplied by the composition rather than fixed here, so the
 * same adapter can serve a private route alongside the built-in provider or
 * replace its name, without this module deciding.
 */
export declare class ChatGptAdapter {
    private readonly auth;
    private readonly baseUrl;
    private readonly displayName;
    private readonly includeUnlisted;
    private readonly contextWindowLimit;
    private readonly modelContextWindowLimits;
    private readonly streamIdleTimeoutMs;
    private readonly now;
    private readonly onListingRecovered;
    private readonly stateDir;
    private readonly onModelSwitchesChanged;
    private listingGeneration;
    private listing;
    /** Whether the most recent listing attempt failed, so the next success can announce it. */
    private listingFailed;
    /**
     * @param options - the credential owner and endpoint policy.
     */
    constructor(options: ChatGptAdapterOptions);
    /** The provider row this adapter describes. */
    providerInfo(provider: string): {
        id: string;
        name: string;
    };
    /**
     * The models the selector should offer, in the server's order.
     *
     * The roster this account produced, minus the models the human switched off,
     * with each hand-set display name applied. A switched-off model is hidden
     * from the offering only: a request that names it directly still reaches the
     * endpoint and gets its own answer, exactly as the roster itself has never
     * been an allowlist. A renamed model keeps its id — the name is what the
     * picker shows, never what a request carries.
     *
     * @returns the describable, switched-on models under their display names.
     */
    listModels(): Promise<readonly DescribedModel[]>;
    /**
     * Every roster model with its switch and display-name state, for the provider
     * card.
     *
     * The roster is the same one the selector's offering comes from, so a switch
     * list and a selector can never disagree about what exists — only about which
     * entries are offered and what each is called.
     *
     * @returns one row per roster model, roster order.
     */
    modelSwitches(): Promise<readonly ModelSwitchView[]>;
    /**
     * Switch one roster model on or off and answer the resulting switch list.
     *
     * @param id - the exact model id, which must be on the current roster.
     * @param disabled - whether the selector should stop offering the model.
     * @returns the switch list after the change is persisted.
     * @throws {CodedError} `chatgpt_unknown_model` when the id is not on the
     * roster, so a stale card cannot switch a model the account no longer serves.
     */
    setModelDisabled(id: string, disabled: boolean): Promise<readonly ModelSwitchView[]>;
    private setModelDisabledUnlocked;
    /**
     * Set one roster model's display name, or restore the roster's own.
     *
     * The name is display vocabulary only: the selector shows it, while requests
     * keep carrying the id, so a rename can never break a call the way a renamed
     * allowlist entry would.
     *
     * @param id - the exact model id, which must be on the current roster.
     * @param name - the display name to store; `undefined` or blank restores the
     * roster's own name by removing the override.
     * @returns the switch list after the change is persisted.
     * @throws {CodedError} `chatgpt_unknown_model` when the id is not on the
     * roster, `chatgpt_invalid_model_switch` when the name is longer than the
     * accepted bound.
     */
    setModelName(id: string, name: string | undefined): Promise<readonly ModelSwitchView[]>;
    private setModelNameUnlocked;
    /** Persist one fixed context choice and notify the host to resolve the model again. */
    setModelContextWindow(id: string, contextWindow: number): Promise<readonly ModelSwitchView[]>;
    /**
     * Clear model switches, display names and context choices.
     *
     * @returns the switch list after the reset is persisted.
     * @throws {CodedError} `chatgpt_switches_unavailable` when no state directory
     * is configured, since the reset could not be remembered.
     */
    resetModels(): Promise<readonly ModelSwitchView[]>;
    private resetModelsUnlocked;
    /**
     * The gates every override write shares: a place to persist, and a model the
     * roster actually carries.
     *
     * @param id - the exact model id a stale card may have named.
     * @throws {CodedError} `chatgpt_switches_unavailable`, then
     * `chatgpt_invalid_model_switch`, then `chatgpt_unknown_model`.
     */
    private requireSwitchable;
    private changeModels;
    /** The persisted overrides as a mutable working copy. */
    private storedOverrides;
    /**
     * Persist the working copy, announce it, and answer the fresh switch list.
     * @param overrides - the overrides to store.
     * @returns the switch list as the persisted state now reads.
     */
    private commitOverrides;
    /**
     * The models this account advertises, in the server's order.
     *
     * This is a *roster for display*, not an allowlist. The endpoint lists what it
     * wants a picker to show, and it serves models that are absent from that list:
     * asked directly, it answers under the requested id and reports having done so.
     * Gating a call on membership here would refuse models the account can really
     * use — a mistake this plugin made once and should not make again.
     *
     * What the harness offers is therefore the roster; what a call may reach is
     * whatever the endpoint accepts, and its own error is the answer for a model
     * that does not exist.
     *
     * An account that is not signed in has no roster, which is an empty catalog
     * rather than a failure: the route exists and is waiting for a sign-in.
     *
     * @returns the describable models, before any switches are applied.
     */
    private rosterModels;
    /**
     * The roster the selector offers: what the account advertises, plus the models
     * measured to work on this route that the listing leaves out.
     *
     * The listing is a curated selection, not an inventory. It omits models this
     * route serves — asked for by id, they answer — so a roster built from it alone
     * hides models the account paid for. The extra ids come from
     * {@link SERVED_MODELS}, which records when they were measured, because no
     * endpoint states them.
     *
     * A model the listing marks hidden is not offered: hidden is a deliberate
     * instruction about what a picker should show, and it is a different statement
     * from leaving a model unmentioned.
     *
     * @param listed - every entry the account's listing returned.
     * @returns the models to offer, listing order first.
     */
    private rosterOf;
    /**
     * Overlay the measured facts about one model.
     *
     * The listing describes capacity and the endpoint accepts requests, but its
     * reasoning-level list is not reliable — it advertised a level the API refuses.
     * Where a measurement exists it wins, because the cost of offering a rejected
     * level is a failed turn.
     */
    private withMeasurement;
    /**
     * The stored roster overrides, or empty when they cannot live anywhere. Read
     * per call rather than cached, so an edit made in one DSH process is seen by
     * the next listing in another.
     */
    private modelOverrides;
    /** Configured budgets remain readable even when absent from the fixed UI choices. */
    private configuredContextWindow;
    /** Drop the cached listing, so the next question re-asks the account. */
    forgetListing(): void;
    /**
     * Everything known about one model.
     *
     * The listing is consulted first so an account-specific display name wins,
     * and the bundled catalog answers for a model the listing has not been asked
     * about — a direct call must not depend on a listing having happened.
     *
     * @param provider - the route.
     * @param model - the exact model id.
     * @returns the model's metadata.
     */
    resolveModel(provider: string, model: string): Promise<HarnessResolvedModel>;
    /**
     * Stream one turn.
     *
     * A credential that cannot be refreshed is reported as an authentication
     * failure rather than retried, because the recovery is a new sign-in and no
     * amount of retrying produces one.
     *
     * @param provider - the route (unused; one grant serves the account).
     * @param request - the harness request.
     * @returns the chunks for one assistant turn.
     */
    stream(provider: string, request: HarnessRequest): AsyncGenerator<AdapterChunk, void, undefined>;
}
//# sourceMappingURL=adapter.d.ts.map