import { createHash, randomBytes } from "node:crypto";
// src/auth/pkce.ts
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
/** A fresh unguessable value, base64url encoded. */
function randomValue(bytes = 32) {
	return randomBytes(bytes).toString("base64url");
}
/**
* Generate one PKCE verifier and its S256 challenge.
*
* @returns the pair to split across the authorization request and the exchange.
*/
function generatePkce() {
	const verifier = randomValue(32);
	return {
		verifier,
		challenge: createHash("sha256").update(verifier).digest("base64url")
	};
}
export { generatePkce, randomValue };

//# sourceMappingURL=pkce.js.map