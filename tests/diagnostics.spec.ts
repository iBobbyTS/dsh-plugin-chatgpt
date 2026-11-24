import { it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RequestDiagnostics, type DiagnosticContext } from '../src/diagnostics.ts'
import { streamTurn, type StreamTurnOptions } from '../src/api/client.ts'
import { ChatGptAdapter, type HarnessMessage } from '../src/adapter.ts'
import type { ChatGptAuth } from '../src/auth/manager.ts'
import type { ResponsesBody } from '../src/convert/request.ts'

const directories: string[] = []
function directory(): string { const path = mkdtempSync(join(tmpdir(), 'chatgpt-diagnostics-')); directories.push(path); return path }
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }) })
const digest = (text: string): string => createHash('sha256').update(text).digest('hex')
const context: DiagnosticContext = { callId: 'call', attempt: 1, sessionId: 'session-5dc0a675-7ed8-4715-8e9f-cd5c2803de62',
  provider: 'chatgpt', authorizationScope: 'private-scope', purpose: 'agent', capabilityFallback: false }
function records(path: string): Record<string, unknown>[] {
  return readFileSync(join(path, 'request-diagnostics.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
}
function frame(event: object): string { return `data: ${JSON.stringify(event)}\n\n` }
const output = [{ type: 'message', id: 'msg_public', role: 'assistant', content: [{ type: 'output_text', text: 'TOP_SECRET_OUTPUT' }] }]
const completed = (id = 'resp_public') => frame({ type: 'response.completed', response: { id, output } })
const body: ResponsesBody = { model: 'gpt-6.2-sol', stream: true, store: false, prompt_cache_key: 'TOP_SECRET_CACHE_KEY',
  reasoning: { effort: 'medium', summary: 'concise' },
  input: [{ type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'TOP_SECRET_PROMPT' }] },
    { type: 'reasoning', encrypted_content: 'TOP_SECRET_CIPHERTEXT', summary: [] }],
  tools: [{ type: 'function', name: 'private_tool', description: 'TOP_SECRET_SCHEMA', parameters: { type: 'object', properties: {} } }],
}
async function drain(options: StreamTurnOptions): Promise<void> { for await (const event of streamTurn(options)) void event }

it('fingerprints the serialized wire body and captures only allowed server evidence, with no content or credentials', async t => {
  const path = directory(), recorder = new RequestDiagnostics(path)
  let sent = ''
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    sent = String(init.body)
    return new Response(frame({ type: 'response.created', response: { id: 'resp_public', instructions: 'TOP_SECRET_SERVER_PROMPT' } })
      + frame({ type: 'response.completed', response: { id: 'resp_public', output, service_tier: 'default',
        system_fingerprint: 'TOP_SECRET_SYSTEM_FINGERPRINT',
        usage: { input_tokens: 1000, output_tokens: 5, total_tokens: 1005,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0, private: 'TOP_SECRET_USAGE' } },
        prompt_cache_diagnostics: { type: 'cache_miss', reason: 'tools_changed', comparison_reusable_tokens: 900,
          cache_missed_tokens: 900, detail: 'TOP_SECRET_DIAGNOSTIC' } } }),
    { headers: { 'content-type': 'text/event-stream', 'x-request-id': 'req_public', 'set-cookie': 'TOP_SECRET_COOKIE' } })
  })
  await drain({ accessToken: 'TOP_SECRET_TOKEN', preparedBody: body, request: { model: 'different', messages: [] },
    endpoints: { baseUrl: 'https://TOP_SECRET_HOST/path' }, diagnostics: { recorder, context } })
  const rows = records(path), request = rows[0], end = rows.at(-1)
  assert.equal(request?.wireBodySha256, digest(sent), 'fingerprint must describe the actual prepared body')
  assert.equal(request?.inputSha256, digest(JSON.stringify(body.input)))
  assert.deepEqual(request?.prefixSha256, body.input.map((_, i) => digest(JSON.stringify(body.input.slice(0, i + 1)))))
  assert.equal(request?.promptCacheKeySha256, digest('TOP_SECRET_CACHE_KEY'))
  assert.equal(request?.sessionHeaderSha256, request?.promptCacheKeySha256)
  assert.deepEqual(end?.requestId, { value: 'req_public', sha256: digest('req_public') })
  assert.deepEqual(end?.responseId, { value: 'resp_public', sha256: digest('resp_public') })
  assert.deepEqual(end?.usage, { input_tokens: 1000, output_tokens: 5, total_tokens: 1005, cached_tokens: 0, cache_write_tokens: 0 })
  assert.deepEqual(end?.promptCacheDiagnostics, { type: 'cache_miss', reason: 'tools_changed', comparison_reusable_tokens: 900, cache_missed_tokens: 900 })
  assert.equal(end?.outcome, 'completed')
  assert.equal(end?.serviceTier, 'default')
  assert.doesNotMatch(readFileSync(join(path, 'request-diagnostics.jsonl'), 'utf8'), /TOP_SECRET|private_tool|authorization:|Bearer/)
  assert.equal(statSync(join(path, 'request-diagnostics.jsonl')).mode & 0o777, 0o600)
})

it('compares compact with the last completed agent prefix, isolates identities and keeps missing counters unknown', () => {
  const path = directory(), recorder = new RequestDiagnostics(path)
  const first = recorder.begin(JSON.stringify(body), body.prompt_cache_key, 'endpoint', context)
  assert.ok(first)
  first.end('completed')
  const nextBody = { ...body, input: [...body.input, { type: 'message', role: 'user', content: 'summary instruction' }] }
  const next = recorder.begin(JSON.stringify(nextBody), body.prompt_cache_key, 'endpoint', { ...context, purpose: 'compaction', attempt: 2 })
  assert.ok(next)
  next.payload(frame({}).slice(6)) // malformed/irrelevant metadata never enters the log
  next.payload(JSON.stringify({ type: 'response.completed', response: { usage: { input_tokens: 1200 } } }))
  next.end('completed'); next.end('failed')
  const rs = records(path), requests = rs.filter(r => r.phase === 'request')
  assert.deepEqual(requests[1]?.comparison, { previousAttemptId: requests[0]?.attemptId, matchingPrefixItems: 2,
    previousInputPreserved: true, toolsEqual: true, reasoningEqual: true, settingsEqual: true, cacheKeyEqual: true })
  assert.deepEqual(rs.at(-1)?.usage, { input_tokens: 1200 })
  assert.equal(rs.at(-1)?.promptCacheDiagnosticsPresent, false)
  assert.equal(rs.at(-1)?.requestId, null)
  for (const change of [{ sessionId: 'fork' }, { authorizationScope: 'other-account' }, { provider: 'another-route' }, { purpose: 'title' }]) {
    recorder.begin(JSON.stringify(body), body.prompt_cache_key, 'endpoint', { ...context, ...change })?.end('completed')
    assert.equal(records(path).filter(r => r.phase === 'request').at(-1)?.comparison, null)
  }
})

it('marks real prefix/settings differences and hashes unfamiliar server strings', () => {
  const path = directory(), recorder = new RequestDiagnostics(path)
  recorder.begin(JSON.stringify(body), body.prompt_cache_key, 'endpoint', context)?.end('completed')
  const next = recorder.begin(JSON.stringify({ ...body, input: [{ type: 'message', content: 'changed' }], tools: [],
    reasoning: { effort: 'high' }, prompt_cache_key: 'other-key' }), 'other-key', 'endpoint', context)
  next?.response(new Response('', { headers: { 'x-request-id': 'TOP_SECRET_INVALID_ID' } }))
  next?.payload(JSON.stringify({ response: { id: 'TOP_SECRET_RESPONSE_ID', service_tier: 'TOP_SECRET_TIER',
    prompt_cache_diagnostics: { type: 'TOP_SECRET_TYPE', reason: 'TOP_SECRET_REASON', cache_missed_tokens: -1 } } }))
  next?.end('failed')
  const comparison = records(path).filter(r => r.phase === 'request').at(-1)?.comparison as Record<string, unknown>
  assert.equal(comparison.previousInputPreserved, false); assert.equal(comparison.matchingPrefixItems, 0)
  assert.equal(comparison.toolsEqual, false); assert.equal(comparison.reasoningEqual, false); assert.equal(comparison.cacheKeyEqual, false)
  assert.doesNotMatch(readFileSync(join(path, 'request-diagnostics.jsonl'), 'utf8'), /TOP_SECRET/)
})

it('honors live opt-out, bounds fingerprints/rotation and does not follow diagnostic file symlinks', () => {
  const path = directory(); let enabled = false
  const recorder = new RequestDiagnostics(path, () => enabled)
  assert.equal(recorder.begin(JSON.stringify(body), undefined, 'endpoint', context), undefined)
  assert.deepEqual(readdirSync(path), [])
  enabled = true
  const log = join(path, 'request-diagnostics.jsonl')
  writeFileSync(log, Buffer.alloc(8 * 1024 * 1024))
  recorder.begin(JSON.stringify(body), undefined, 'endpoint', context)?.end('completed')
  assert.ok(statSync(`${log}.1`).size > 0)
  const attempt = recorder.begin(JSON.stringify({ ...body, input: Array.from({ length: 8193 }, () => ({ type: 'message', content: 'x' })) }), undefined, 'endpoint', context)
  attempt?.end('completed')
  const r = records(path).filter(r => r.phase === 'request').at(-1)
  assert.equal((r?.prefixSha256 as unknown[]).length, 8192); assert.equal(r?.prefixesTruncated, true)
  const target = join(path, 'sentinel'); writeFileSync(target, 'unchanged')
  const other = directory(); symlinkSync(target, join(other, 'request-diagnostics.jsonl'))
  const bad = new RequestDiagnostics(other)
  assert.doesNotThrow(() => bad.begin(JSON.stringify(body), undefined, 'endpoint', context)?.end('completed'))
  assert.equal(readFileSync(target, 'utf8'), 'unchanged')
})

it('records HTTP failures, missing bodies, interrupted streams and cancellation without claiming completion', async t => {
  const path = directory(), recorder = new RequestDiagnostics(path)
  const replies = [new Response('{"error":{"message":"TOP_SECRET_ERROR"}}', { status: 400, headers: { 'x-request-id': 'req_error' } }),
    new Response(null), new Response(frame({ type: 'response.output_text.delta', output_index: 0, delta: 'TOP_SECRET_PARTIAL' })),
    new Response(frame({ type: 'response.output_text.delta', output_index: 0, delta: 'text' }) + completed())]
  t.mock.method(globalThis, 'fetch', async () => replies.shift())
  const options = { accessToken: 'secret', preparedBody: body, request: { model: 'm', messages: [] }, diagnostics: { recorder, context } }
  for (let i = 0; i < 3; i++) await assert.rejects(drain(options))
  const stream = streamTurn(options); await stream.next(); await stream.return(undefined)
  assert.deepEqual(records(path).filter(r => r.phase === 'end').map(r => r.outcome), ['http_error', 'empty_stream', 'stream_ended_early', 'cancelled'])
  assert.doesNotMatch(readFileSync(join(path, 'request-diagnostics.jsonl'), 'utf8'), /TOP_SECRET/)
})

it('defaults on for the adapter and separates actual auth-renewal attempts under one call ID', async t => {
  const path = directory(); let n = 0
  const sent: string[] = []
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    sent.push(String(init.body))
    return ++n === 1 ? new Response('{"error":{"code":"token_expired","message":"expired"}}', { status: 401, headers: { 'x-request-id': 'req_expired' } })
      : new Response(completed(), { headers: { 'x-request-id': 'req_renewed' } })
  })
  const credential = { accessToken: 'TOP_SECRET_CREDENTIAL', clientId: 'client', replayNamespace: 'cf5a7f74-6069-4dfa-bd1c-df7d2e76f278' }
  const auth = { usable: async () => credential, renewFor: async () => ({ ...credential, accessToken: 'TOP_SECRET_RENEWED' }) } as unknown as ChatGptAuth
  const adapter = new ChatGptAdapter({ auth, stateDir: path })
  for await (const event of adapter.stream('chatgpt', { provider: 'chatgpt', model: 'gpt-6.2-sol', sessionId: context.sessionId as string, messages: [{ role: 'user', content: [{ type: 'text', text: 'TOP_SECRET_REQUEST' }] }] })) void event
  const rs = records(path), requests = rs.filter(r => r.phase === 'request')
  assert.equal(requests.length, 2); assert.equal(requests[0]?.callId, requests[1]?.callId)
  assert.notEqual(requests[0]?.attemptId, requests[1]?.attemptId)
  assert.deepEqual(requests.map(r => r.attempt), [1, 2])
  assert.deepEqual(requests.map(r => r.wireBodySha256), sent.map(digest))
  assert.deepEqual(rs.filter(r => r.phase === 'end').map(r => r.outcome), ['http_error', 'completed'])
  assert.doesNotMatch(readFileSync(join(path, 'request-diagnostics.jsonl'), 'utf8'), /TOP_SECRET/)
})

it('captures the actual capability fallback body and compact can compare against its successful result', async t => {
  const path = directory(), sent: ResponsesBody[] = []
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const b = JSON.parse(String(init.body)) as ResponsesBody; sent.push(b)
    return b.input.some(i => i.type === 'configuration_update')
      ? new Response('{"error":{"code":"subscription_sharing_unsupported_capability","message":"Remove unsupported input items"}}', { status: 400 })
      : new Response(completed(`resp_${sent.length}`))
  })
  const credential = { accessToken: 'secret', clientId: 'client', replayNamespace: 'cf5a7f74-6069-4dfa-bd1c-df7d2e76f278' }
  const adapter = new ChatGptAdapter({ auth: { usable: async () => credential } as unknown as ChatGptAuth, stateDir: path })
  let messages: HarnessMessage[] = [{ role: 'user', content: [{ type: 'text', text: 'First' }] }]
  for (const reasoningEffort of ['low', 'high']) {
    const chunks = []
    for await (const chunk of adapter.stream('chatgpt', { provider: 'chatgpt', model: 'gpt-6.2-sol', sessionId: context.sessionId as string, reasoningEffort, messages })) chunks.push(chunk)
    const finish = chunks.findLast(c => c.type === 'finish'); assert.ok(finish?.replayState)
    messages = [...messages, { role: 'assistant', content: chunks.filter(c => c.type === 'block-end').map(c => c.block),
      source: { kind: 'model', provider: 'chatgpt', model: 'gpt-6.2-sol', replayState: finish.replayState } }, { role: 'user', content: [{ type: 'text', text: 'Next' }] }]
  }
  for await (const chunk of adapter.stream('chatgpt', { provider: 'chatgpt', model: 'gpt-6.2-sol', sessionId: context.sessionId as string, purpose: 'compaction', messages })) void chunk
  const requests = records(path).filter(r => r.phase === 'request')
  assert.equal(requests.length, 4)
  assert.deepEqual(requests.map(r => r.wireBodySha256), sent.map(b => digest(JSON.stringify(b))))
  assert.deepEqual(requests.map(r => r.capabilityFallback), [false, false, true, false])
  assert.equal(requests[1]?.callId, requests[2]?.callId)
  assert.notEqual(requests[1]?.wireBodySha256, requests[2]?.wireBodySha256)
  assert.equal((requests[3]?.comparison as Record<string, unknown>).previousAttemptId, requests[2]?.attemptId)
  assert.equal((requests[3]?.comparison as Record<string, unknown>).previousInputPreserved, true)
})

it('keeps failed/incomplete wire terminals distinct and records a transport abort honestly', async t => {
  const path = directory(), recorder = new RequestDiagnostics(path)
  const options = { accessToken: 'secret', preparedBody: body, request: { model: 'm', messages: [] }, diagnostics: { recorder, context } }
  const replies = [new Response(frame({ type: 'response.failed', response: { id: 'resp_failure', error: { code: 'server_error', message: 'TOP_SECRET_ERROR' }, usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 } } } })),
    new Response(frame({ type: 'response.incomplete', response: { id: 'resp_incomplete', incomplete_details: { reason: 'max_output_tokens' } } }))]
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    if (replies.length) return replies.shift()
    const signal = init.signal
    return await new Promise((_resolve, reject) => {
      if (signal?.aborted) reject(signal.reason)
      else signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  })
  await drain(options); await drain(options)
  const abort = new AbortController(); abort.abort(new Error('TOP_SECRET_ABORT'))
  await assert.rejects(drain({ ...options, signal: abort.signal }))
  await assert.rejects(drain({ ...options, idleTimeoutMs: 5 }))
  const ends = records(path).filter(r => r.phase === 'end')
  assert.deepEqual(ends.map(r => r.outcome), ['failed', 'incomplete', 'aborted', 'timeout'])
  assert.deepEqual(ends[0]?.usage, { input_tokens: 100, cached_tokens: 0 })
  assert.equal(ends[1]?.usage, null)
  assert.doesNotMatch(readFileSync(join(path, 'request-diagnostics.jsonl'), 'utf8'), /TOP_SECRET/)
})

it('does not regress the baseline on out-of-order completion and never claims a capped prefix is proven', () => {
  const path = directory(), recorder = new RequestDiagnostics(path)
  const earlier = recorder.begin(JSON.stringify(body), body.prompt_cache_key, 'endpoint', context)
  const later = recorder.begin(JSON.stringify({ ...body, input: [...body.input, { type: 'message', content: 'later' }] }), body.prompt_cache_key, 'endpoint', context)
  later?.end('completed'); earlier?.end('completed')
  recorder.begin(JSON.stringify(body), body.prompt_cache_key, 'endpoint', context)?.end('completed')
  let requests = records(path).filter(r => r.phase === 'request')
  assert.equal((requests[2]?.comparison as Record<string, unknown>).previousAttemptId, requests[1]?.attemptId)
  recorder.begin(JSON.stringify({ ...body, input: Array.from({ length: 8193 }, () => ({ type: 'message', content: 'x' })) }), undefined, 'endpoint', context)?.end('completed')
  recorder.begin(JSON.stringify(body), undefined, 'endpoint', context)?.end('completed')
  requests = records(path).filter(r => r.phase === 'request')
  assert.equal((requests.at(-1)?.comparison as Record<string, unknown>).previousInputPreserved, null)
})

it('reads the adapter opt-out live and stops even in-flight writes when disabled', async t => {
  const path = directory(); let enabled = false
  t.mock.method(globalThis, 'fetch', async () => new Response(completed()))
  const credential = { accessToken: 'secret', clientId: 'client', replayNamespace: 'cf5a7f74-6069-4dfa-bd1c-df7d2e76f278' }
  const adapter = new ChatGptAdapter({ auth: { usable: async () => credential } as unknown as ChatGptAuth, stateDir: path, requestDiagnostics: () => enabled })
  const request = { provider: 'chatgpt', model: 'gpt-6.2-sol', messages: [] }
  for await (const chunk of adapter.stream('chatgpt', request)) void chunk
  assert.deepEqual(readdirSync(path), [])
  enabled = true
  for await (const chunk of adapter.stream('chatgpt', request)) void chunk
  assert.equal(records(path).length, 3)
  const recorder = new RequestDiagnostics(path, () => enabled)
  const attempt = recorder.begin(JSON.stringify(body), body.prompt_cache_key, 'endpoint', context)
  assert.ok(attempt)
  enabled = false
  attempt.response(new Response('', { headers: { 'x-request-id': 'req_hidden' } }))
  attempt.end('completed')
  assert.equal(records(path).length, 4, 'in-flight completion must respect opt-out')
  enabled = true
  recorder.begin(JSON.stringify(body), undefined, 'endpoint', context)?.end('completed')
  assert.equal(records(path).filter(r => r.phase === 'request').at(-1)?.comparison, null)
})
