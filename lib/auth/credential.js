// src/auth/credential.ts
/** Whether the stored grant includes the plan-usage scope. */
function canSpendPlan(credential) {
	return credential.scopes.includes("chatgpt.tokens.use.direct");
}
/** Whether the access token still has useful life left. */
function isFresh(credential, now = Date.now()) {
	return credential.expiresAt > now;
}
/** Check a local replay UUID's shape; positional account labels and emails do not qualify. */
function isReplayNamespace(value) {
	return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
export { canSpendPlan, isFresh, isReplayNamespace };

//# sourceMappingURL=credential.js.map