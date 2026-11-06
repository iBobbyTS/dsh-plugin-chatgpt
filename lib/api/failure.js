import * as llm from "@deepseek-ai/dsh-llm";
// src/api/failure.ts
/** Map provider-specific failures to DSH recovery codes without hiding upstream messages. */
const classifiers = llm;
/** DSH retry and compaction extensions match stable codes, not provider-specific prose. */
function normalizeFailureCode(code, message, status) {
	const wire = code.toLowerCase();
	const detail = `${code} ${message}`;
	if (wire === "subscription_sharing_usage_limit_exceeded") return "QUOTA";
	if (wire === "subscription_sharing_usage_unavailable" || wire === "subscription_sharing_user_unavailable") return "SERVER";
	if (classifiers.isContextWindowExceededError?.(detail) || /context[\s_-]*(?:length|window)[\s_-]*(?:exceeded|overflow|limit)/i.test(detail) || /(?:request|prompt|input) (?:is )?too (?:large|long) for (?:the )?(?:model )?context/i.test(detail)) return "CONTEXT_WINDOW_EXCEEDED";
	if (classifiers.isQuotaExceededError?.(detail) || /(?:insufficient[_ -]+quota|quota[_ -]+exceeded|usage[_ -]+limit[_ -]+(?:exceeded|reached))/i.test(detail)) return "QUOTA";
	if (wire === "rate_limit_exceeded" || wire === "too_many_requests" || status === 429) return "RATE_LIMIT";
	if (wire === "timeout" || wire === "request_timeout" || status === 408 || status === 504) return "TIMEOUT";
	if (wire === "server_error" || wire === "internal_server_error" || wire === "server_is_overloaded" || wire === "service_unavailable" || status !== void 0 && status >= 500) return "SERVER";
	return code;
}
export { normalizeFailureCode };

//# sourceMappingURL=failure.js.map