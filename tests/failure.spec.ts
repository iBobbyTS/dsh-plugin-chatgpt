import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeFailureCode } from '../src/api/failure.ts'
import { ApiError } from '../src/api/client.ts'
import { BlockTranslator } from '../src/convert/blocks.ts'

describe('DSH recovery classification', () => {
  it('maps context exhaustion into the compaction handler', () => {
    assert.equal(normalizeFailureCode('context_length_exceeded', 'input too long'), 'CONTEXT_WINDOW_EXCEEDED')
    assert.equal(normalizeFailureCode('unknown_error', 'context length exceeded'), 'CONTEXT_WINDOW_EXCEEDED')
    assert.equal(normalizeFailureCode('invalid_request_error', 'request too large for the model context window', 400), 'CONTEXT_WINDOW_EXCEEDED')
    assert.equal(normalizeFailureCode('invalid_request_error', 'unsupported temperature', 400), 'invalid_request_error')
  })
  it('distinguishes quota exhaustion from transient failures', () => {
    assert.equal(normalizeFailureCode('subscription_sharing_usage_limit_exceeded', 'plan exhausted', 429), 'QUOTA')
    assert.equal(normalizeFailureCode('subscription_sharing_usage_unavailable', 'try later', 503), 'SERVER')
    assert.equal(normalizeFailureCode('subscription_sharing_user_unavailable', 'try later'), 'SERVER')
    assert.equal(normalizeFailureCode('server_is_overloaded', 'overloaded'), 'SERVER')
    assert.equal(normalizeFailureCode('rate_limit_exceeded', 'retry', 429), 'RATE_LIMIT')
    assert.equal(normalizeFailureCode('http_503', 'gateway error', 503), 'SERVER')
    assert.equal(normalizeFailureCode('http_504', 'gateway timeout', 504), 'TIMEOUT')
    assert.equal(new ApiError('limit', 'subscription_sharing_usage_limit_exceeded', 429).planUsage, true)
  })
  it('reports no action as EMPTY_RESPONSE instead of successful stop', () => {
    assert.deepEqual(new BlockTranslator().push({ kind: 'completed' }), [
      { type: 'finish', reason: { kind: 'error', failure: {
        code: 'EMPTY_RESPONSE', message: 'the model completed without an answer or executable tool call',
      } } },
    ])
  })
  it('treats reasoning-only completions as empty actionable responses', () => {
    const t = new BlockTranslator()
    t.push({ kind: 'reasoning', delta: 'internal deliberation' })
    const last = t.push({ kind: 'completed' }).at(-1)
    assert.equal(last?.type === 'finish' && last.reason.kind === 'error' && last.reason.failure.code, 'EMPTY_RESPONSE')
  })
  it('respects incomplete reasons instead of treating all of them as output limits', () => {
    const end = (reason: string) => new BlockTranslator().push({ kind: 'incomplete', reason }).at(-1)
    assert.deepEqual(end('max_output_tokens'), { type: 'finish', reason: { kind: 'max-tokens' } })
    assert.deepEqual(end('content_filter'), { type: 'finish', reason: { kind: 'error', failure: {
      code: 'CONTENT_FILTER', message: 'the provider returned an incomplete response (content_filter)',
    } } })
    assert.deepEqual(end('steered'), { type: 'finish', reason: { kind: 'error', failure: {
      code: 'INCOMPLETE_RESPONSE', message: 'the provider returned an incomplete response (steered)',
    } } })
  })
  it('classifies in-band temporary failure for retry', () => {
    const last = new BlockTranslator().push({ kind: 'failed',
      code: 'subscription_sharing_usage_unavailable', message: 'try later', terminal: true }).at(-1)
    assert.deepEqual(last, { type: 'finish', reason: { kind: 'error', failure: { code: 'SERVER', message: 'try later' } } })
  })
})
