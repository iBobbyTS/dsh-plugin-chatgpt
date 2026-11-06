interface Jwk {
    kid?: string;
    alg?: string;
    kty?: string;
    [key: string]: unknown;
}
/**
 * Require an issuer-signed token with a recognised asymmetric algorithm.
 * The callback separately validates audience, issuer, expiry, nonce, and subject.
 */
export declare function verifyOpenAiIdTokenSignature(token: string, getKeys?: () => Promise<readonly Jwk[]>): Promise<void>;
export {};
//# sourceMappingURL=verify-id-token.d.ts.map