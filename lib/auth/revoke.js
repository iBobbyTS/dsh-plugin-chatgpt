// src/auth/revoke.ts
/** Where the authorization server describes its endpoints. */
const DISCOVERY_URL = "https://auth.openai.com/.well-known/openid-configuration";
/** The revocation endpoint observed for this server, used only when discovery fails. */
const FALLBACK_REVOCATION_ENDPOINT = "https://auth.openai.com/api/accounts/oauth/revoke";
/** How many times a transient revocation failure is retried before giving up. */
const MAX_ATTEMPTS = 3;
/** Base delay between revocation attempts, doubled per attempt. */
const BASE_BACKOFF_MS = 250;
/** Discovery is stable for a process, so it is read once. */
let discovered;
/**
* The revocation endpoint, from discovery when possible.
*
* @param options - endpoint overrides.
* @returns the endpoint to post to.
*/
async function revocationEndpoint(options) {
	options.signal?.throwIfAborted();
	if (options.revocationEndpoint !== void 0) return options.revocationEndpoint;
	if (discovered !== void 0) return discovered;
	try {
		const response = await fetch(options.discoveryUrl ?? "https://auth.openai.com/.well-known/openid-configuration", {
			headers: { accept: "application/json" },
			...options.signal === void 0 ? {} : { signal: options.signal }
		});
		if (response.ok) {
			const endpoint = (await response.json())["revocation_endpoint"];
			if (typeof endpoint === "string" && endpoint.length > 0) {
				discovered = endpoint;
				return endpoint;
			}
		}
	} catch {}
	return FALLBACK_REVOCATION_ENDPOINT;
}
/** Wait before one retry, without holding an aborted attempt open. */
function backoff(attempt, signal) {
	return new Promise((resolve, reject) => {
		const done = () => {
			signal?.removeEventListener("abort", aborted);
			resolve();
		};
		const timer = setTimeout(done, BASE_BACKOFF_MS * 2 ** attempt);
		const aborted = () => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", aborted);
			reject(/* @__PURE__ */ new Error("revocation was cancelled"));
		};
		if (signal?.aborted) aborted();
		else signal?.addEventListener("abort", aborted, { once: true });
	});
}
/**
* Revoke one grant's renewable session.
*
* A 5xx or a transport failure is retried, because the refresh token is still
* available while the caller has not cleared it. Any other refusal is reported
* as unconfirmed rather than retried: repeating it would not change the answer.
*
* @param credential - the grant to revoke.
* @param options - endpoint overrides and cancellation.
* @returns whether the server confirmed the revocation.
*/
async function performRevocation(credential, options = {}) {
	const endpoint = await revocationEndpoint(options);
	let lastReason = "the revocation request did not complete";
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
		if (options.signal?.aborted) return {
			confirmed: false,
			reason: String(options.signal.reason)
		};
		if (attempt > 0) try {
			await backoff(attempt - 1, options.signal);
		} catch (error) {
			return {
				confirmed: false,
				reason: error instanceof Error ? error.message : String(error)
			};
		}
		try {
			const response = await fetch(endpoint, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					accept: "application/json"
				},
				body: new URLSearchParams({
					token: credential.refreshToken,
					token_type_hint: "refresh_token",
					client_id: credential.clientId
				}),
				...options.signal === void 0 ? {} : { signal: options.signal }
			});
			if (response.ok) return { confirmed: true };
			const body = await response.text().catch(() => "");
			lastReason = `the server refused the revocation (${response.status})${body.length > 0 ? `: ${body.slice(0, 200)}` : ""}`;
			if (response.status < 500) return {
				confirmed: false,
				reason: lastReason
			};
		} catch (error) {
			lastReason = error instanceof Error ? error.message : String(error);
		}
	}
	return {
		confirmed: false,
		reason: lastReason
	};
}
/** Bound the complete remote flow, including discovery and response bodies. */
async function revokeGrant(credential, options = {}) {
	const controller = new AbortController();
	const signal = options.signal === void 0 ? controller.signal : AbortSignal.any([controller.signal, options.signal]);
	let timer;
	let onAbort;
	try {
		const interrupted = new Promise((resolve) => {
			onAbort = () => resolve({
				confirmed: false,
				reason: String(signal.reason ?? "revocation was cancelled")
			});
			if (signal.aborted) onAbort();
			else signal.addEventListener("abort", onAbort, { once: true });
			timer = setTimeout(() => controller.abort(/* @__PURE__ */ new Error("revocation timed out")), options.timeoutMs ?? 1e4);
		});
		return await Promise.race([interrupted, performRevocation(credential, {
			...options,
			signal
		}).catch((error) => ({
			confirmed: false,
			reason: String(error)
		}))]);
	} finally {
		if (timer !== void 0) clearTimeout(timer);
		if (onAbort !== void 0) signal.removeEventListener("abort", onAbort);
	}
}
export { DISCOVERY_URL, FALLBACK_REVOCATION_ENDPOINT, revokeGrant };

//# sourceMappingURL=revoke.js.map