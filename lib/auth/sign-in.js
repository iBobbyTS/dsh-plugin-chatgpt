import { CALLBACK_HOST, CALLBACK_PATH, DYNAMIC_CLIENT_ID, EXPIRY_MARGIN_MS, RESOURCE, SCOPE } from "./protocol.js";
import { generatePkce, randomValue } from "./pkce.js";
import { verifyOpenAiIdTokenSignature } from "./verify-id-token.js";
import { startCallbackListener } from "./callback-server.js";
// src/auth/sign-in.ts
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
/** Parse a full redirect URL, an absolute URL carrying a code, or a bare code. */
function parseSubmitted(value, expectedRedirectUri) {
	const trimmed = value.trim();
	if (trimmed.length === 0) throw new Error("paste the full redirect URL from the browser, or the code itself");
	if (!trimmed.includes("://") && !trimmed.includes("code=") && !trimmed.includes("?")) return {
		code: trimmed,
		clientId: ""
	};
	let url;
	try {
		url = new URL(trimmed);
	} catch {
		throw new Error("that does not look like a URL; paste the full redirect URL from the browser");
	}
	const expected = new URL(expectedRedirectUri);
	if (url.origin !== expected.origin || url.pathname !== expected.pathname) throw new Error(`the pasted URL must start with ${expectedRedirectUri}`);
	const error = url.searchParams.get("error");
	if (error !== null && error !== "") throw new Error(`ChatGPT declined the authorization: ${error}`);
	const code = url.searchParams.get("code");
	if (code === null || code === "") throw new Error("the pasted URL carries no authorization code");
	return {
		code,
		clientId: url.searchParams.get("client_id")?.trim() ?? ""
	};
}
/** Decode claims after the caller has verified the token signature against the issuer JWKS. */
function decodeJwtPayload(token) {
	const parts = token.split(".");
	if (parts.length !== 3) return void 0;
	try {
		const payload = parts[1] ?? "";
		return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
	} catch {
		return;
	}
}
/** A required non-empty string field, or a named failure. */
function requireString(value, field) {
	if (typeof value !== "string" || value.trim().length === 0) throw new Error(`the token response is missing ${field}`);
	return value;
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
function validateIdToken(token, expectedAudience, expectedNonce) {
	const claims = decodeJwtPayload(token);
	if (claims === void 0) throw new Error("the ID token is not a readable JWT");
	const issuer = claims.iss;
	if (issuer !== "https://auth.openai.com") throw new Error(`the ID token came from an unexpected issuer: ${String(issuer)}`);
	if (!(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(expectedAudience)) throw new Error("the ID token is addressed to a different client than this installation registered");
	if (claims.nonce !== expectedNonce) throw new Error("the ID token carries a different nonce than this sign-in attempt");
	const issuedAt = claims.iat;
	if (typeof issuedAt !== "number" || !Number.isFinite(issuedAt) || issuedAt * 1e3 > Date.now() + 5e3) throw new Error("the ID token has a missing or invalid issued-at time");
	const expiry = claims.exp;
	if (typeof expiry !== "number" || !Number.isFinite(expiry) || expiry * 1e3 <= Date.now()) throw new Error("the ID token is already expired");
	const subject = requireString(claims.sub, "sub");
	const profile = claims["https://api.openai.com/profile"];
	const auth = claims["https://api.openai.com/auth"];
	const email = typeof profile === "object" && profile !== null ? profile["email"] : void 0;
	const planType = typeof auth === "object" && auth !== null ? auth["chatgpt_plan_type"] : void 0;
	return {
		subject,
		...typeof email === "string" && email.length > 0 ? { email } : {},
		...typeof planType === "string" && planType.length > 0 ? { planType } : {}
	};
}
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
async function beginSignIn(options) {
	const preferredPort = options.preferredPort ?? 1455;
	const listener = await startCallbackListener(preferredPort);
	options.onListening?.(listener.redirectUri);
	const pkce = generatePkce();
	const state = randomValue(32);
	const nonce = randomValue(32);
	const url = new URL(options.authorizeUrl ?? "https://auth.openai.com/api/accounts/authorize");
	const registration = options.registration;
	const params = registration === void 0 ? {
		client_id: DYNAMIC_CLIENT_ID,
		agent_name_hint: options.agentNameHint,
		ext_agent_host_id: options.agentHostId
	} : {
		client_id: registration.clientId,
		ext_agent_host_id: options.agentHostId
	};
	url.search = new URLSearchParams({
		...params,
		...registration?.idTokenHint === void 0 ? {} : { id_token_hint: registration.idTokenHint },
		...registration?.loginHint === void 0 ? {} : { login_hint: registration.loginHint },
		response_type: "code",
		redirect_uri: listener.redirectUri,
		resource: RESOURCE,
		scope: SCOPE,
		state,
		code_challenge: pkce.challenge,
		code_challenge_method: "S256",
		nonce
	}).toString();
	let settled = false;
	let cancelled = false;
	const exchange = new AbortController();
	let timer;
	let resolveResult;
	let rejectResult;
	const result = new Promise((resolve, reject) => {
		resolveResult = resolve;
		rejectResult = reject;
	});
	const finish = () => {
		settled = true;
		if (timer !== void 0) clearTimeout(timer);
		listener.close();
	};
	/** Validate one callback and exchange its code for a stored-ready credential. */
	const complete = async (callback) => {
		const clientId = callback.clientId.length > 0 ? callback.clientId : options.registration?.clientId ?? "";
		if (clientId.length === 0) throw new Error("the authorization callback returned no issued client id; a first-time registration must issue one, and the dynamic entry point is not a registration");
		const response = await fetch(options.tokenUrl ?? "https://auth.openai.com/api/accounts/oauth/token", {
			method: "POST",
			signal: AbortSignal.any([exchange.signal, AbortSignal.timeout(3e4)]),
			headers: {
				accept: "application/json",
				"content-type": "application/x-www-form-urlencoded"
			},
			body: new URLSearchParams({
				grant_type: "authorization_code",
				client_id: clientId,
				code: callback.code,
				code_verifier: pkce.verifier,
				redirect_uri: listener.redirectUri,
				resource: RESOURCE
			})
		});
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`the token exchange failed (${response.status}): ${body || response.statusText}`);
		}
		const token = await response.json();
		const access = requireString(token.access_token, "access_token");
		const refresh = requireString(token.refresh_token, "refresh_token");
		const idToken = requireString(token.id_token, "id_token");
		const granted = requireString(token.scope, "scope").split(/\s+/).filter(Boolean);
		const expiresIn = token.expires_in;
		if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) throw new Error("the token response carries no usable expires_in");
		await (options.verifyIdTokenSignature ?? verifyOpenAiIdTokenSignature)(idToken);
		const identity = validateIdToken(idToken, clientId, nonce);
		if (options.registration?.expectedSubject !== void 0 && identity.subject !== options.registration.expectedSubject) throw new Error("the returning ChatGPT authorization has a different account identity");
		if (cancelled) return;
		resolveResult({
			accessToken: access,
			refreshToken: refresh,
			expiresAt: Date.now() + expiresIn * 1e3 - EXPIRY_MARGIN_MS,
			clientId,
			scopes: granted,
			subject: identity.subject,
			...identity.email === void 0 ? {} : { email: identity.email },
			...identity.planType === void 0 ? {} : { planType: identity.planType },
			savedAt: Date.now()
		});
	};
	listener.received.then(async (query) => {
		if (settled) return;
		finish();
		try {
			if (query.error !== void 0) throw new Error(`ChatGPT declined the authorization: ${query.error}`);
			if (query.state !== state) throw new Error("the callback state does not match this sign-in attempt");
			if (query.code === void 0 || query.code === "") throw new Error("the callback carried no authorization code");
			await complete({
				code: query.code,
				clientId: query.clientId ?? ""
			});
		} catch (error) {
			rejectResult(error instanceof Error ? error : new Error(String(error)));
		}
	}).catch((error) => {
		if (settled) return;
		finish();
		rejectResult(error instanceof Error ? error : new Error(String(error)));
	});
	timer = setTimeout(() => {
		if (settled) return;
		finish();
		rejectResult(/* @__PURE__ */ new Error("the sign-in attempt timed out before the browser returned"));
	}, options.timeoutMs ?? 9e5);
	timer.unref?.();
	return {
		authorizationUrl: url.toString(),
		redirectUri: listener.redirectUri,
		result,
		/**
		* Accept a pasted value.
		*
		* A malformed paste rejects this call and nothing else: the human mistyped,
		* and the attempt — plus the browser callback still in flight — stays
		* alive so they can correct it. Only a value that parses and matches this
		* attempt's state is consumed.
		*/
		async submit(value) {
			if (settled) throw new Error("this sign-in attempt has already finished");
			const callback = parseSubmitted(value, listener.redirectUri);
			const stateInPaste = stateOfSubmission(value);
			if (stateInPaste !== void 0 && stateInPaste !== state) throw new Error("the pasted callback state does not match this sign-in attempt");
			finish();
			try {
				await complete(callback);
			} catch (error) {
				rejectResult(error instanceof Error ? error : new Error(String(error)));
			}
		},
		cancel(reason = "the sign-in attempt was cancelled") {
			cancelled = true;
			exchange.abort(new Error(reason));
			finish();
			rejectResult(new Error(reason));
		}
	};
}
/** Read the `state` a pasted value carries, when it carries one at all. */
function stateOfSubmission(value) {
	const trimmed = value.trim();
	if (!trimmed.includes("://") && !trimmed.includes("?")) return void 0;
	try {
		return new URL(trimmed).searchParams.get("state") ?? void 0;
	} catch {
		return;
	}
}
/** The callback host and path this module expects. */
const CALLBACK_SHAPE = {
	host: CALLBACK_HOST,
	path: CALLBACK_PATH
};
export { CALLBACK_SHAPE, beginSignIn, validateIdToken };

//# sourceMappingURL=sign-in.js.map