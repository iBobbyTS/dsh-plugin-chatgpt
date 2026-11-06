import { EXPIRY_MARGIN_MS, RESOURCE } from "./protocol.js";
// src/auth/refresh.ts
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
/** Refresh errors the caller must not retry with the same token. */
const TERMINAL_CODES = /* @__PURE__ */ new Set([
	"invalid_grant",
	"invalid_refresh_token",
	"token_expired",
	"refresh_token_expired",
	"refresh_token_invalidated",
	"refresh_token_reused"
]);
/** A refresh that will not succeed until the human signs in again. */
var RefreshRefusedError = class extends Error {
	/** Stable code for callers that branch on the reason. */
	code = "CHATGPT_REFRESH_REFUSED";
	/** Whether a new sign-in is required before this account can be used again. */
	terminal;
	/**
	* @param message - what the endpoint reported.
	* @param terminal - whether a new sign-in is required.
	*/
	constructor(message, terminal) {
		super(message);
		this.name = "RefreshRefusedError";
		this.terminal = terminal;
	}
};
/**
* Exchange a stored refresh token for a fresh credential.
*
* @param credential - the stored grant; its `clientId` is the issued one.
* @param options - endpoint override and cancellation.
* @returns the rotated credential, ready to store.
* @throws {RefreshRefusedError} when the endpoint refused the grant.
*/
async function refreshCredential(credential, options = {}) {
	const response = await fetch(options.tokenUrl ?? "https://auth.openai.com/api/accounts/oauth/token", {
		method: "POST",
		headers: {
			accept: "application/json",
			"content-type": "application/x-www-form-urlencoded"
		},
		body: new URLSearchParams({
			grant_type: "refresh_token",
			client_id: credential.clientId,
			refresh_token: credential.refreshToken,
			resource: RESOURCE
		}),
		...options.signal === void 0 ? {} : { signal: options.signal }
	});
	if (!response.ok) {
		const body = await response.text().catch(() => "");
		const code = errorCodeOf(body);
		throw new RefreshRefusedError(`the ChatGPT token refresh was refused (${response.status}): ${body || response.statusText}`, code !== void 0 && TERMINAL_CODES.has(code));
	}
	const token = await response.json();
	const access = token["access_token"];
	const refresh = token["refresh_token"];
	const expiresIn = token["expires_in"];
	const scope = token["scope"];
	if (typeof access !== "string" || access.length === 0) throw new RefreshRefusedError("the refresh response carries no access token", false);
	if (typeof refresh !== "string" || refresh.length === 0) throw new RefreshRefusedError("the refresh response carries no replacement refresh token", false);
	if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) throw new RefreshRefusedError("the refresh response carries no usable expires_in", false);
	const scopes = typeof scope === "string" && scope.trim().length > 0 ? scope.trim().split(/\s+/).filter(Boolean) : credential.scopes;
	return {
		...credential,
		accessToken: access,
		refreshToken: refresh,
		expiresAt: Date.now() + expiresIn * 1e3 - EXPIRY_MARGIN_MS,
		scopes,
		savedAt: Date.now()
	};
}
/** Pull `error` out of a JSON error body without assuming its shape. */
function errorCodeOf(body) {
	try {
		const parsed = JSON.parse(body);
		if (typeof parsed === "object" && parsed !== null) {
			const error = parsed["error"];
			if (typeof error === "string") return error;
			if (typeof error === "object" && error !== null) {
				const code = error["code"];
				if (typeof code === "string") return code;
				const type = error["type"];
				if (typeof type === "string") return type;
			}
			const code = parsed["code"];
			if (typeof code === "string") return code;
		}
	} catch {}
}
export { RefreshRefusedError, refreshCredential };

//# sourceMappingURL=refresh.js.map