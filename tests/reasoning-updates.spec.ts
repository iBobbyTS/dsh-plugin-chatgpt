/** Persist configuration updates through the public adapter and real HTTP serialization. */
import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { ChatGptAdapter, toNeutralRequest, type HarnessMessage, type HarnessRequest } from '../src/adapter.ts'
import type { ChatGptAuth } from '../src/auth/manager.ts'
import { toResponsesBody, prepareResponsesRequest } from '../src/convert/request.ts'
import { readReasoningReplay } from '../src/convert/reasoning.ts'
import type { AdapterChunk } from '../src/convert/blocks.ts'
import { required } from './helpers.ts'

const user = (text: string): HarnessMessage => ({ role: 'user', content: [{ type: 'text', text }] })
const tool: HarnessMessage = { role: 'tool', toolCallId: 'call_test', content: [{ type: 'text', text: 'result' }] }

it('keeps the initial effort and every historical update through restore, tools, forks and switching back', async () => {
  const bodies: ReturnType<typeof toResponsesBody>[] = []
  const server = createServer(async (request, response) => {
    let raw = ''
    for await (const chunk of request) raw += chunk
    bodies.push(JSON.parse(raw))
    const n = bodies.length
    const output = [{ type: 'function_call', id: `fc_${n}`, call_id: 'call_test', name: 'read', arguments: '{}' }]
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end(`data: ${JSON.stringify({ type: 'response.completed', response: { output } })}\n\n`)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const credential = { accessToken: 'synthetic', clientId: 'client', replayNamespace: 'cf5a7f74-6069-4dfa-bd1c-df7d2e76f278' }
  const auth = { usable: async () => credential } as unknown as ChatGptAuth
  const options = { auth, baseUrl: `http://127.0.0.1:${address.port}` }
  let request: HarnessRequest = { provider: 'chatgpt', model: 'gpt-6.1-sol', sessionId: 'session',
    reasoningEffort: 'xhigh', messages: [user('first')],
    tools: [{ name: 'read', description: 'read', parameters: { type: 'object', properties: {} } }],
  }
  async function send(): Promise<HarnessMessage> {
    const chunks: AdapterChunk[] = []
    // Each call uses a fresh instance, just like a restored session after restart.
    for await (const chunk of new ChatGptAdapter(options).stream(request.provider, request)) chunks.push(chunk)
    const finish = chunks.findLast(chunk => chunk.type === 'finish')
    assert.ok(finish?.replayState?.response.reasoningReplay)
    return JSON.parse(JSON.stringify({ role: 'assistant',
      content: chunks.filter(chunk => chunk.type === 'block-end').map(chunk => chunk.block),
      source: { kind: 'model', provider: request.provider, model: request.model, replayState: finish.replayState },
    }))
  }
  try {
    const first = await send()
    request = { ...request, reasoningEffort: 'medium', messages: [...request.messages, first, tool, user('next')] }
    const second = await send()
    const updates = (index: number) => required(bodies[index]).input.filter(item => item.type === 'configuration_update')
    assert.deepEqual(updates(0), [])
    assert.deepEqual(updates(1), [{ type: 'configuration_update', reasoning: { effort: 'medium' } }])
    const body1 = required(bodies[1])
    assert.equal(body1.input.at(-2)?.type, 'configuration_update')
    assert.equal(body1.input.at(-1)?.role, 'user')
    request = { ...request, messages: [...request.messages, second, tool] }
    const third = await send()
    assert.deepEqual(updates(2), updates(1))
    request = { ...request, sessionId: 'fork-session', reasoningEffort: 'high', messages: [...request.messages, third, tool] }
    const fourth = await send()
    assert.equal(required(bodies[3]).input.at(-1)?.type, 'configuration_update')
    request = { ...request, reasoningEffort: 'xhigh', messages: [...request.messages, fourth, tool, user('back')] }
    const fifth = await send()
    assert.deepEqual(updates(4).map(item => item.reasoning), [{ effort: 'medium' }, { effort: 'high' }, { effort: 'xhigh' }])
    for (let index = 1; index < bodies.length; index++) {
      const previous = required(bodies[index - 1])
      const current = required(bodies[index])
      assert.deepEqual(current.input.slice(0, previous.input.length), previous.input)
      assert.deepEqual(current.reasoning, { effort: 'xhigh', summary: 'concise' })
      assert.deepEqual(current.tools, previous.tools)
      assert.ok(current.input.every((item, i) => item.type !== 'configuration_update' || current.input[i + 1]?.type !== 'configuration_update'))
    }
    assert.equal(required(bodies[0]).prompt_cache_key, required(bodies[2]).prompt_cache_key)
    assert.notEqual(required(bodies[2]).prompt_cache_key, required(bodies[3]).prompt_cache_key)
    // Edited prefixes, missing messages, account/model switches and malformed
    // metadata must not resurrect configurations tied to a different history.
    const history = [...request.messages, fifth, tool, user('after')]
    const neutral = toNeutralRequest({ ...request, messages: history }, required(bodies[0]).prompt_cache_key) // foreign scope
    assert.ok(toResponsesBody(neutral).input.every(item => item.type !== 'configuration_update'))
    for (const messages of [history.slice(1), [user('edited'), ...history.slice(1)]]) {
      request = { ...request, reasoningEffort: 'low', messages }
      await send()
      assert.deepEqual(updates(bodies.length - 1), [])
      assert.equal(bodies.at(-1)?.reasoning?.effort, 'low')
    }
    request = { ...request, model: 'gpt-6-astra', reasoningEffort: 'high', messages: history }
    await send()
    assert.deepEqual(updates(bodies.length - 1), [])
    assert.equal(bodies.at(-1)?.reasoning?.effort, 'high')
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

it('keeps legacy and unsupported histories usable and preserves an omitted initial effort', () => {
  const first = prepareResponsesRequest({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: 'first' }] })
  assert.equal(first.body.reasoning, undefined)
  const messages = [{ role: 'user' as const, content: 'first' }, {
    role: 'assistant' as const, content: 'answer', reasoningReplay: required(first.reasoningReplay),
  }, { role: 'user' as const, content: 'next' }]
  const next = prepareResponsesRequest({ model: 'gpt-6.1-sol', reasoningEffort: 'high', messages })
  assert.equal(next.body.reasoning, undefined)
  assert.equal(next.body.input[2]?.type, 'configuration_update')
  assert.equal(next.reasoningReplay?.effort, 'high')
  for (const model of ['gpt-5.5', 'gpt-5.6-sol', 'gpt-6-astra-pro', 'unknown']) {
    const body = toResponsesBody({ model, messages, reasoningEffort: 'low' })
    assert.equal(body.reasoning?.effort, 'low')
    assert.ok(body.input.every(item => item.type !== 'configuration_update'))
  }
  const legacy = toResponsesBody({ model: 'gpt-6.1-sol', messages: messages.map(({ role, content }) => ({ role, content })), reasoningEffort: 'low' })
  assert.equal(legacy.reasoning?.effort, 'low')
  assert.ok(legacy.input.every(item => item.type !== 'configuration_update'))
  assert.equal(readReasoningReplay(null), undefined)
  for (const patch of [{ inputHash: 'bad' }, { updates: [{ index: -1, effort: 'high' }] },
    { baseEffort: {} }, { effort: 'ultra' }, { effort: 'low' }, { inputCount: 1.5 }]) {
    assert.equal(readReasoningReplay({ ...first.reasoningReplay, ...patch }), undefined)
  }
})

it('falls back once on an explicit SIWC input capability refusal and remembers it after JSON restore', async () => {
  const bodies: ReturnType<typeof toResponsesBody>[] = []
  let refusalCode = 'subscription_sharing_unsupported_capability'
  let refusalMessage = 'Remove unsupported input items or use an API key instead.'
  let firstAssistant: HarnessMessage | undefined
  const server = createServer(async (request, response) => {
    let raw = ''
    for await (const chunk of request) raw += chunk
    const body: ReturnType<typeof toResponsesBody> = JSON.parse(raw)
    bodies.push(body)
    if (body.input.some(item => item.type === 'configuration_update')) {
      response.writeHead(400, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: { code: refusalCode, message: refusalMessage } }))
      return
    }
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end(`data: ${JSON.stringify({ type: 'response.completed', response: { output: [{
      type: 'message', id: `msg_${bodies.length}`, role: 'assistant', content: [{ type: 'output_text', text: 'OK', annotations: [] }],
    }] } })}\n\n`)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const credential = { accessToken: 'synthetic', clientId: 'client', replayNamespace: 'cf5a7f74-6069-4dfa-bd1c-df7d2e76f278' }
  const options = { auth: { usable: async () => credential } as unknown as ChatGptAuth,
    baseUrl: `http://127.0.0.1:${address.port}` }
  let messages: HarnessMessage[] = [user('first')]
  try {
    for (const reasoningEffort of ['low', 'medium', 'high']) {
      const chunks: AdapterChunk[] = []
      for await (const chunk of new ChatGptAdapter(options).stream('chatgpt', {
        provider: 'chatgpt', model: 'gpt-6.1-sol', sessionId: 's', reasoningEffort, messages,
      })) chunks.push(chunk)
      const finish = chunks.findLast(c => c.type === 'finish')
      assert.equal(finish?.reason.kind, 'stop')
      assert.ok(finish?.replayState)
      if (reasoningEffort !== 'low') {
        assert.equal(finish.replayState.response.reasoningUpdatesUnsupported, true)
        assert.equal(finish.replayState.response.reasoningReplay, undefined)
      }
      const assistant: HarnessMessage = JSON.parse(JSON.stringify({ role: 'assistant',
        content: chunks.filter(c => c.type === 'block-end').map(c => c.block),
        source: { kind: 'model', provider: 'chatgpt', model: 'gpt-6.1-sol', replayState: finish.replayState },
      }))
      if (reasoningEffort === 'low') firstAssistant = assistant
      messages = [...messages, assistant, user('next')]
    }
    assert.equal(bodies.length, 4, 'only the first switch probes the unsupported capability')
    assert.deepEqual(bodies.map(b => b.reasoning?.effort), ['low', 'low', 'medium', 'high'])
    assert.deepEqual(bodies.map(b => b.input.filter(i => i.type === 'configuration_update').length), [0, 1, 0, 0])
    assert.ok(required(bodies[3]).input.some(i => i.id === 'msg_3'), 'fallback retains native output replay')
    for (const [code, message] of [
      ['invalid_request_error', 'Remove unsupported input items.'],
      ['subscription_sharing_unsupported_capability', 'Hosted tool capability is unavailable.'],
      ['insufficient_quota', 'Quota exceeded.'],
    ]) {
      refusalCode = required(code)
      refusalMessage = required(message)
      const count: number = bodies.length
      await assert.rejects(async () => {
        for await (const chunk of new ChatGptAdapter(options).stream('chatgpt', {
          provider: 'chatgpt', model: 'gpt-6.1-sol', reasoningEffort: 'medium',
          messages: [user('first'), required(firstAssistant), user('next')],
        })) void chunk
      })
      assert.equal(bodies.length, count + 1, 'unrelated refusals must not trigger fallback')
    }
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
