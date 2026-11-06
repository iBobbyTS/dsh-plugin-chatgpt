/**
 * Minting a fresh access token from a stored grant.
 *
 * Refresh is the operation that makes a subscription usable over time, and it
 * has one hard rule: the client id sent here must be the *issued* one, because
 * it is what the registration is filed under, and a refresh token is only
 * redeemable by the registration that received it. `scope` is deliberately
 * omitted — the granted scopes are fixed at authorization and re-requesting
 * them is not how the endpoint is used.
 *
 * A refused refresh is terminal, not retryable. `invalid_grant` and its
 * relatives mean the grant is gone; retrying the same refresh token cannot
 * succeed, and the recovery is a new sign-in. Callers must therefore treat a
 * rejection here as "this credential is dead" rather than as a transient
 * network fault.
 *
 * @module dsh-plugin-chatgpt-subscription/auth/refresh
 */
import type { ChatGptCredential } from './credential.ts';
/** A refresh that will not succeed until the human signs in again. */
export declare class RefreshRefusedError extends Error {
    /** Stable code for callers that branch on the reason. */
    readonly code = "CHATGPT_REFRESH_REFUSED";
    /** Whether a new sign-in is required before this account can be used again. */
    readonly terminal: boolean;
    /**
     * @param message - what the endpoint reported.
     * @param terminal - whether a new sign-in is required.
     */
    constructor(message: string, terminal: boolean);
}
/** Options for {@link refreshCredential}. */
export interface RefreshOptions {
    /** Override the token endpoint (tests). */
    tokenUrl?: string;
    /** Cancellation. */
    signal?: AbortSignal;
}
/**
 * Exchange a stored refresh token for a fresh credential.
 *
 * @param credential - the stored grant; its `clientId` is the issued one.
 * @param options - endpoint override and cancellation.
 * @returns the rotated credential, ready to store.
 * @throws {RefreshRefusedError} when the endpoint refused the grant.
 */
export declare function refreshCredential(credential: ChatGptCredential, options?: RefreshOptions): Promise<ChatGptCredential>;
//# sourceMappingURL=refresh.d.ts.map