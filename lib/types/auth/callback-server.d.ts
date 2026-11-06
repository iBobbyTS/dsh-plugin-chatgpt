/**
 * The loopback callback listener one authorization attempt owns.
 *
 * The browser's redirect has to land somewhere, and where it lands is part of
 * what the server verifies: the scheme, host, and path are fixed, only the port
 * may vary. So the exact port this listener actually bound is what the
 * authorization request must carry — which is why the URI is derived from the
 * bound address rather than from the requested one.
 *
 * A port already in use is not an error. Another harness, the Codex CLI, or a
 * half-finished earlier attempt may hold the preferred one, and a fresh
 * ephemeral port is just as valid, so the preferred port is a preference and
 * never a requirement. Only a caller that cannot accept any port would need
 * this to fail.
 *
 * Spare connections are closed explicitly on teardown. A browser opens
 * speculative connections ahead of time; one that has not sent a request yet
 * stays attached to this listener, and a later attempt's callback could be
 * delivered over it — to a listener whose `state` no longer matches, which
 * would reject a perfectly good callback and leave the new attempt waiting.
 *
 * @module dsh-plugin-chatgpt-subscription/auth/callback-server
 */
/** What one callback delivered, before the state check is applied. */
export interface CallbackQuery {
    /** The authorization code, absent when the human declined. */
    code?: string;
    /** The `state` the browser echoed back. */
    state?: string;
    /** The issued client id, present on a first-time registration. */
    clientId?: string;
    /** An OAuth error code, present when the human declined or the request was refused. */
    error?: string;
}
/** A listener bound to one attempt, with the URI that must be sent. */
export interface CallbackListener {
    /** The exact `redirect_uri` this attempt must use in both requests. */
    readonly redirectUri: string;
    /** The port actually bound. */
    readonly port: number;
    /** Resolves with the first callback that arrives, or rejects on listener failure. */
    readonly received: Promise<CallbackQuery>;
    /** Stop listening and drop spare connections. Safe to call more than once. */
    close(): void;
}
/**
 * Start the listener for one authorization attempt.
 *
 * @param preferredPort - the port to try first; the OS picks one when it is busy.
 * @returns the listener, already bound, with the URI the attempt must use.
 */
export declare function startCallbackListener(preferredPort?: number): Promise<CallbackListener>;
//# sourceMappingURL=callback-server.d.ts.map