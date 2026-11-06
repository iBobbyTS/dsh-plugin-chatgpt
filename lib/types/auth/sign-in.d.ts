/**
 * "Sign in with ChatGPT" for one installation.
 *
 * The flow has two halves that race: the browser redirect lands on a loopback
 * listener, and the human can paste the final redirect URL instead. Whichever
 * arrives first wins, because both are legitimate — a headless host has no
 * browser to redirect into, and a normal host has a browser whose redirect may
 * be intercepted by an extension or a different profile. Both paths converge
 * on one callback shape, so the state check, the code exchange, and the grant
 * validation are written once.
 *
 * What is deliberately strict:
 *
 * - The `state` echoed back must equal the one sent, or the attempt is refused.
 *   Without this, any page could hand this host a code for somebody else's
 *   registration.
 * - A first-time registration callback must carry an issued client id. The
 *   dynamic entry point is not a registration, and saving it would produce a
 *   credential that cannot be refreshed.
 * - The granted scopes must include the plan-usage scope. A valid ID token
 *   alone authorizes identity only, so a deployment that authorized identity
 *   and declined plan usage must be reported as such rather than as success.
 *
 * @module dsh-plugin-chatgpt-subscription/auth/sign-in
 */
import type { ChatGptCredential } from './credential.ts';
/** One attempt's worth of state, and the two ways it can be completed. */
export interface SignInAttempt {
    /** Where to send the browser. */
    readonly authorizationUrl: string;
    /** The exact callback URI this attempt accepts; only the port may differ from other attempts. */
    readonly redirectUri: string;
    /**
     * Complete the attempt from a pasted value: the full redirect URL, an
     * absolute URL string carrying `code`, or a bare authorization code.
     * Rejects on a malformed or mismatched value while leaving the attempt open.
     * @param value - what the human pasted.
     */
    submit(value: string): Promise<void>;
    /** Abandon the attempt; the pending promise rejects. */
    cancel(reason?: string): void;
    /** Settles when the browser redirect or a successful paste produced a credential. */
    readonly result: Promise<ChatGptCredential>;
}
/** Hooks the host uses to narrate one attempt. */
export interface SignInOptions {
    /** A stable, per-installation host identifier, sent as `ext_agent_host_id`. */
    agentHostId: string;
    /** The app's name as the human will see it on the consent screen. Sent only on a first-time registration. */
    agentNameHint: string;
    /**
     * Reuse an existing registration instead of registering again. When the
     * caller has a previously issued client id for this account, sending it (with
     * an `id_token_hint`) skips the registration step entirely.
     */
    registration?: {
        clientId: string;
        /** A returning live credential must retain its verified account identity. */
        expectedSubject?: string;
        idTokenHint?: string;
        loginHint?: string;
    };
    /** The port to try first; the OS picks one when it is busy. */
    preferredPort?: number;
    /** Override the authorize endpoint (tests). */
    authorizeUrl?: string;
    /** Override the token endpoint (tests). */
    tokenUrl?: string;
    /** How long to wait for a callback before giving up. */
    timeoutMs?: number;
    /** Test-only injection: production defaults to OpenAI JWKS signature verification. */
    verifyIdTokenSignature?: (token: string) => Promise<void>;
    /** Called once the listener is bound, with the URI the human's browser will return to. */
    onListening?: (redirectUri: string) => void;
}
/**
 * Check the claims this flow depends on.
 *
 * The sign-in exchange verifies the JWKS signature before calling this
 * claims validator. Do not use this function alone to trust an unverified JWT.
 *
 * @param token - the ID token from the token response.
 * @param expectedAudience - the issued client id the token must be addressed to.
 * @param expectedNonce - the nonce this attempt generated.
 * @returns the account identity and display facts.
 */
export declare function validateIdToken(token: string, expectedAudience: string, expectedNonce: string): {
    subject: string;
    email?: string;
    planType?: string;
};
/**
 * Begin one authorization attempt.
 *
 * The listener is bound before the URL is built, so the URI handed out is the
 * one that will really be listening — a port chosen optimistically would fail
 * at code exchange, after the human had already approved.
 *
 * @param options - the installation's host id, its name, and any reusable registration.
 * @returns the attempt, already listening.
 */
export declare function beginSignIn(options: SignInOptions): Promise<SignInAttempt>;
/** The callback host and path this module expects. */
export declare const CALLBACK_SHAPE: {
    host: string;
    path: string;
};
//# sourceMappingURL=sign-in.d.ts.map