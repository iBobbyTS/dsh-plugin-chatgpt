import { it } from 'node:test'
import assert from 'node:assert/strict'
import { toNeutralRequest, type HarnessRequest } from '../src/adapter.ts'
import { prepareResponsesRequest } from '../src/convert/request.ts'
import { createReplay, sessionCacheKey } from '../src/convert/replay.ts'

it('shares only agent/compaction routing identity and inherits effort only from a verified same-route prefix', () => {
  const scope = 'test-scope'
  const request: HarnessRequest = { provider: 'chatgpt', model: 'gpt-6.1-sol', sessionId: 'session', reasoningEffort: 'xhigh',
    messages: [{ role: 'system', content: [{ type: 'text', text: 'Stable' }] }, { role: 'user', content: [{ type: 'text', text: 'First' }] }],
  }
  const first = prepareResponsesRequest(toNeutralRequest(request, scope))
  assert.ok(first.reasoningReplay)
  const blocks = [{ type: 'text' as const, text: 'Answer' }]
  const replay = createReplay({ provider: request.provider, model: request.model, scope, reasoningReplay: first.reasoningReplay },
    [{ type: 'message', id: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Answer' }] }], blocks)
  assert.ok(replay)
  const { reasoningEffort: _effort, ...withoutEffort } = request
  const compact: HarnessRequest = { ...withoutEffort, purpose: 'compaction', messages: [
    ...request.messages, { role: 'assistant', content: blocks, source: { kind: 'model', provider: request.provider, model: request.model, replayState: replay } },
    { role: 'user', content: [{ type: 'text', text: 'Summarize' }] },
  ] }
  const next = prepareResponsesRequest(toNeutralRequest(compact, scope))
  assert.deepEqual(next.body.input.slice(0, first.body.input.length), first.body.input)
  assert.deepEqual(next.body.reasoning, first.body.reasoning)
  assert.equal(next.body.prompt_cache_key, first.body.prompt_cache_key)
  assert.equal(next.body.input.some(item => item.type === 'configuration_update'), false)
  assert.equal(next.reasoningReplay?.effort, 'xhigh')
  const explicit = prepareResponsesRequest(toNeutralRequest({ ...compact, reasoningEffort: 'low' }, scope))
  assert.equal(explicit.reasoningReplay?.effort, 'low')
  assert.ok(explicit.body.input.some(item => item.type === 'configuration_update'))
  const edited = { ...compact, messages: [{ role: 'system' as const, content: [{ type: 'text', text: 'Changed' }] }, ...compact.messages.slice(1)] }
  assert.equal(prepareResponsesRequest(toNeutralRequest(edited, scope)).body.reasoning, undefined)
  assert.equal(prepareResponsesRequest(toNeutralRequest(compact, 'other-account')).body.reasoning, undefined)
  assert.equal(prepareResponsesRequest(toNeutralRequest({ ...compact, model: 'gpt-6-astra' }, scope)).body.reasoning, undefined)
  const { purpose: _purpose, ...ordinary } = compact
  const normal = prepareResponsesRequest(toNeutralRequest(ordinary, scope))
  assert.equal(normal.reasoningReplay?.effort, 'medium', 'ordinary omitted effort keeps its prior meaning')
  assert.notEqual(sessionCacheKey(scope, 'chatgpt', 'session', 'session-title'), next.body.prompt_cache_key)
  assert.notEqual(sessionCacheKey(scope, 'chatgpt', 'fork', 'compaction'), next.body.prompt_cache_key)
  assert.equal(sessionCacheKey(scope, 'chatgpt', undefined, 'compaction'), undefined)
})
