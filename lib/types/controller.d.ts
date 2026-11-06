import type { Context } from '@deepseek-ai/cordis';
/**
 * The browser's way into the sign-in flow.
 *
 * A sign-in cannot happen in the browser: it needs a listener on the machine the
 * account is being authorized for, and it ends with credentials that must never
 * reach a page. So the page asks the host to start an attempt and shows what the
 * host reports back — the authorization URL, the loopback address the browser
 * will return to, and, once it is done, the account's display facts.
 *
 * The token is the one thing this surface never carries. Everything here is
 * either an instruction for the human or a fact about the account.
 *
 * This file is only the transport. The state machine lives in
 * {@link ChatGptSession}, which is testable without a gateway.
 *
 * @module dsh-plugin-chatgpt/controller
 */
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { ChatGptSession, ChatGptSignOutOutcome, ChatGptStatusView } from './session.ts';
import type { ModelSwitchView } from './models/switches.ts';
import type { CodexQuota, CodexQuotaView } from './codex-quota.ts';
export type { ChatGptPendingView, ChatGptSignOutOutcome, ChatGptStatusView } from './session.ts';
export type { ModelSwitchView } from './models/switches.ts';
/** Remote owner of the ChatGPT sign-in and account surface. */
export declare class ChatGptController extends TypertRemoteService {
    private readonly codexQuota?;
    private readonly session;
    /**
     * @param ctx - the plugin context.
     * @param session - the state machine this service carries.
     */
    constructor(ctx: Context, session: ChatGptSession, codexQuota?: CodexQuota | undefined);
    /** Read the independent Codex monitor configuration; never returns tokens. */
    codexQuotaStatus(): CodexQuotaView;
    /** Human authorization only: select a Host file and grant optional refresh/writeback. */
    selectCodexQuota(path: string, allowRefresh: boolean, label: string): CodexQuotaView;
    /** Stop monitoring without deleting or revoking the Codex authorization. */
    clearCodexQuota(): CodexQuotaView;
    /** Query only the selected monitor. No login or model-account switching. */
    refreshCodexQuota(): Promise<CodexQuotaView>;
    /**
     * Read the current account and attempt state.
     * @returns what the card should render.
     */
    status(): Promise<ChatGptStatusView>;
    /**
     * Open a sign-in attempt and answer with the URL to visit.
     * @returns the state, now carrying a pending attempt.
     */
    begin(): Promise<ChatGptStatusView>;
    /**
     * Finish the open attempt from a pasted redirect URL or code.
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
     * End one account's session, revoking it at the server before clearing it here.
     * @param subject - the account to end; defaults to the active one.
     * @returns the state, and whether the server confirmed the revocation.
     */
    signOut(subject?: string): Promise<ChatGptSignOutOutcome>;
    /**
     * Every roster model and whether the human switched it off.
     * @returns one row per roster model, roster order.
     */
    modelSwitches(): Promise<readonly ModelSwitchView[]>;
    /**
     * Switch one roster model on or off; the selector reloads what it offers.
     * @param model - the exact model id on the current roster.
     * @param disabled - whether the selector should stop offering the model.
     * @returns the switch list after the change is persisted.
     */
    setModelDisabled(model: string, disabled: boolean): Promise<readonly ModelSwitchView[]>;
    /**
     * Set one roster model's display name, or restore the roster's own; the
     * selector reloads what it shows.
     * @param model - the exact model id on the current roster.
     * @param name - the display name to store; `undefined` or blank removes the
     * override.
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
}
//# sourceMappingURL=controller.d.ts.map