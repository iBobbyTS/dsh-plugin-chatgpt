/** Map provider-specific failures to DSH recovery codes without hiding upstream messages. */
import { isContextWindowExceededError, isQuotaExceededError } from '@deepseek-ai/dsh-llm'

/** DSH retry and compaction extensions match stable codes, not provider-specific prose. */
export function normalizeFailureCode(code: string, message: string, status?: number): string {
  const wire = code.toLowerCase()
  const detail = `${code} ${message}`
  if (wire === 'subscription_sharing_usage_limit_exceeded') return 'QUOTA'
  if (wire === 'subscription_sharing_usage_unavailable' || wire === 'subscription_sharing_user_unavailable') return 'SERVER'
  if (isContextWindowExceededError(detail) || wire === 'context_length_exceeded') return 'CONTEXT_WINDOW_EXCEEDED'
  if (isQuotaExceededError(detail) || wire === 'insufficient_quota') return 'QUOTA'
  if (wire === 'rate_limit_exceeded' || wire === 'too_many_requests' || status === 429) return 'RATE_LIMIT'
  if (wire === 'timeout' || wire === 'request_timeout' || status === 408 || status === 504) return 'TIMEOUT'
  if (wire === 'server_error' || wire === 'internal_server_error' || wire === 'server_is_overloaded' || wire === 'service_unavailable'
    || status !== undefined && status >= 500) return 'SERVER'
  return code
}
