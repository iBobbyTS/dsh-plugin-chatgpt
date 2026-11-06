/**
 * Ending a grant at the server, not just on this machine.
 *
 * Deleting a credential locally leaves it live at OpenAI: the refresh token stays
 * redeemable, and nothing tells the account that this installation gave up
 * access. Signing out therefore has to revoke the renewable session first and
 * clear local state second, and it has to report honestly when only the second
 * part happened — a user who is told "signed out" while the grant still works
 * elsewhere has been misled.
 *
 * The endpoint is not hard-coded. It is read from the authorization server's
 * discovery document, which is where the protocol says to find it; the known
 * value is only a fallback for the case where discovery is unreachable, because a
 * sign-out that cannot even find the endpoint should still try the documented one
 * rather than silently skip revocation.
 *
 * @module dsh-plugin-chatgpt/auth/revoke
 */
import type { ChatGptCredential } from './credential.ts';
/** Where the authorization server describes its endpoints. */
export declare const DISCOVERY_URL = "https://auth.openai.com/.well-known/openid-configuration";
/** The revocation endpoint observed for this server, used only when discovery fails. */
export declare const FALLBACK_REVOCATION_ENDPOINT = "https://auth.openai.com/api/accounts/oauth/revoke";
/** What a sign-out attempt achieved. */
export interface RevocationResult {
    /** Whether the server confirmed the grant is no longer usable. */
    confirmed: boolean;
    /** Why it was not confirmed, for the human. */
    reason?: string;
}
/** Options for {@link revokeGrant}. */
export interface RevokeOptions {
    /** Override the discovery document (tests). */
    discoveryUrl?: string;
    /** Override the revocation endpoint (tests). */
    revocationEndpoint?: string;
    /** Deadline for discovery, requests, bodies, and retries together (default 10s). */
    timeoutMs?: number;
    /** Cancellation. */
    signal?: AbortSignal;
}
/** Bound the complete remote flow, including discovery and response bodies. */
export declare function revokeGrant(credential: ChatGptCredential, options?: RevokeOptions): Promise<RevocationResult>;
//# sourceMappingURL=revoke.d.ts.map