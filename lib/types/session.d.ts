/**
 * The sign-in session: one open attempt, and the account facts around it.
 *
 * This is the logic the browser card drives, kept apart from the Remote
 * decorators that carry it, because the interesting parts are the state
 * transitions — one attempt at a time, a refused paste leaving the attempt open,
 * a completed sign-in invalidating the roster the previous account produced — and
 * those are worth testing without a gateway in the way.
 *
 * @module dsh-plugin-chatgpt/session
 */
import { type ChatGptAdapter } from './adapter.ts';
import type { ChatGptAuth } from './auth/manager.ts';
import type { ModelSwitchView } from './models/switches.ts';
/** An attempt the page can finish. */
export interface ChatGptPendingView {
    /** Where to send the browser. */
    url: string;
    /** The loopback address the browser returns to; only this exact address is accepted. */
    redirectUri: string;
}
/** Everything the sign-in card may show. */
/** What a sign-out achieved, when it did not achieve everything. */
export interface ChatGptSignOutOutcome {
    /** The state after signing out locally. */
    status: ChatGptStatusView;
    /**
     * Whether the server confirmed the grant is no longer usable. `false` means
     * the credential is gone from this machine but may still be live elsewhere,
     * which the human is told rather than left to assume.
     */
    revocationConfirmed: boolean;
    /** Why the server did not confirm, when it did not. */
    revocationError?: string;
}
export interface ChatGptStatusView {
    /** Whether an account is authorized and may spend its plan. */
    signedIn: boolean;
    /** Whether a grant exists but plan usage was not authorized. */
    planUsageDenied: boolean;
    /** The active account's email, when the ID token carried one. */
    email?: string;
    /** The active account's ChatGPT plan, when known. */
    plan?: string;
    /** When the active access token stops being usable, epoch milliseconds. */
    expiresAt?: number;
    /** Every authorized account, for a future account switcher. */
    accounts: {
        subject: string;
        email?: string;
        active: boolean;
    }[];
    /**
     * Whether the stored grant can no longer be refreshed, so only a new sign-in
     * restores plan usage.
     *
     * `signedIn` describes what is stored, not whether the server still honors it;
     * a terminal refresh refusal is the one case where the two disagree, and this
     * flag makes the card say "sign in again" rather than showing a green tag over
     * a dead grant.
     */
    needsSignIn?: boolean;
    /** The attempt awaiting the browser, when one is open. */
    pending?: ChatGptPendingView;
    /**
     * What the account can serve right now.
     *
     * The card reports this rather than promising a list of its own: the models a
     * selector shows come from the Host catalog, so a count here is the honest
     * statement, and a listing that fails says so instead of looking empty.
     */
    roster?: {
        count: number;
        error?: string;
    };
    /** Why the last attempt failed, until another one starts. */
    error?: string;
}
/** What a session tells its owner when the models it can serve change. */
export interface ChatGptSessionOptions {
    /**
     * Called after the roster changes.
     *
     * A model selector caches the Host catalog and reloads it only when the Host says
     * something changed. Signing in turns an empty roster into a full one, so without
     * this the selector keeps a list built before the account existed — the models
     * are being served and simply never appear.
     */
    onRosterChanged?: () => void;
}
/**
 * Owns the one open sign-in attempt and projects the account state for a page.
 *
 * One attempt at a time per instance: two live loopback listeners for the same
 * account would race for the same callback, and the loser would report a state
 * mismatch the human could do nothing about.
 */
export declare class ChatGptSession {
    private readonly auth;
    private readonly adapter;
    private readonly onRosterChanged;
    private pending;
    private lastError;
    private completing;
    /**
     * @param auth - the credential owner this session drives.
     * @param adapter - the provider adapter, told to re-ask the account after a change.
     * @param options - what to announce when the roster changes.
     */
    constructor(auth: ChatGptAuth, adapter: ChatGptAdapter, options?: ChatGptSessionOptions);
    /** What the card should render now, including what the account can serve. */
    status(): Promise<ChatGptStatusView>;
    /**
     * The roster, or why it could not be read.
     *
     * A listing failure is reported as a fact about the account rather than thrown:
     * the card is about the account, and a count it cannot read is still something
     * the human needs to see. The listing is cached by the adapter, so asking often
     * costs nothing.
     *
     * @returns the count, or the failure in place of it, plus whether the failure
     * means the stored grant must be replaced by a new sign-in.
     */
    private roster;
    /**
     * Open an attempt and answer with the URL to visit.
     * @returns the state, now carrying a pending attempt.
     */
    begin(): Promise<ChatGptStatusView>;
    /**
     * Finish the open attempt from a pasted redirect URL or code.
     *
     * A malformed value is reported as this attempt's error and leaves the attempt
     * open, so a mistyped paste can be corrected without starting over.
     *
     * @param value - the full redirect URL, or the code itself.
     * @returns the state after the exchange settles.
     */
    submit(value: string): Promise<ChatGptStatusView>;
    /**
     * Abandon the open attempt.
     * @returns the state with no pending attempt.
     */
    cancel(): Promise<ChatGptStatusView>;
    /**
     * End one account's session, at the server first and locally second.
     * @param subject - the account to end; defaults to the active one.
     * @returns the state, and whether the server confirmed the revocation.
     */
    signOut(subject?: string): Promise<ChatGptSignOutOutcome>;
    /**
     * Every roster model with its switch state, for the card's model list.
     *
     * Delegated rather than duplicated: the roster and its switches have one
     * owner, and the card must not be able to see a list the selector was not
     * built from.
     *
     * @returns one row per roster model, roster order.
     */
    modelSwitches(): Promise<readonly ModelSwitchView[]>;
    /**
     * Switch one roster model on or off.
     *
     * @param model - the exact model id on the current roster.
     * @param disabled - whether the selector should stop offering the model.
     * @returns the switch list after the change is persisted.
     */
    setModelDisabled(model: string, disabled: boolean): Promise<readonly ModelSwitchView[]>;
    /**
     * Set one roster model's display name, or restore the roster's own.
     *
     * @param model - the exact model id on the current roster.
     * @param name - the display name the selector should show; `undefined` or
     * blank removes the override.
     * @returns the switch list after the change is persisted.
     */
    setModelName(model: string, name?: string): Promise<readonly ModelSwitchView[]>;
    /** Set one model's context budget to a fixed model-page choice. */
    setModelContextWindow(model: string, contextWindow: number): Promise<readonly ModelSwitchView[]>;
    /**
     * Clear model switches, display names and context choices.
     * @returns the switch list after the reset is persisted.
     */
    resetModels(): Promise<readonly ModelSwitchView[]>;
    /** Wait for an in-flight exchange to settle, within one answer's patience. */
    private settle;
    /** Abandon the open attempt, if any. */
    private cancelPending;
}
//# sourceMappingURL=session.d.ts.map