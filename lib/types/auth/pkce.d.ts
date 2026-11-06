/**
 * PKCE and the random values one authorization attempt needs.
 *
 * Every value is generated per attempt and never reused: `state` binds the
 * callback to the attempt that started it, `nonce` binds the returned ID token
 * to the same attempt, and the PKCE verifier is what makes a stolen
 * authorization code useless without it. A reused verifier would let one
 * intercepted code be exchanged twice.
 *
 * @module dsh-plugin-chatgpt-subscription/auth/pkce
 */
/** A PKCE verifier and the S256 challenge derived from it. */
export interface PkcePair {
    /** The secret kept locally until code exchange. */
    verifier: string;
    /** The base64url SHA-256 digest sent in the authorization request. */
    challenge: string;
}
/** A fresh unguessable value, base64url encoded. */
export declare function randomValue(bytes?: number): string;
/**
 * Generate one PKCE verifier and its S256 challenge.
 *
 * @returns the pair to split across the authorization request and the exchange.
 */
export declare function generatePkce(): PkcePair;
//# sourceMappingURL=pkce.d.ts.map