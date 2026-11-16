import { it } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import type { ChatGptAuth } from '../src/auth/manager.ts'
import assert from 'node:assert/strict'
import { createDeveloperMessage, createUserMessage, projectToolUpdates, type GenerateOptions, type ToolHistory } from '@deepseek-ai/dsh-llm'
import { requestOf } from '../src/convert/harness.ts'
import { ChatGptAdapter, toNeutralRequest } from '../src/adapter.ts'
import { toResponsesBody } from '../src/convert/request.ts'

const read = { name: 'read', description: 'Read', parameters: { type: 'object', properties: {} } }
const write = { name: 'write', description: 'Write', parameters: { type: 'object', properties: {} } }
const update = (content: Parameters<typeof createDeveloperMessage>[0]['content']) => createDeveloperMessage({ source: { kind: 'user' }, content })
function harness(messages: GenerateOptions['messages'], history?: ToolHistory) {
  const tools = [read, write]
  const projected = projectToolUpdates(messages, tools, 'in-history', history)
  return requestOf({ provider: 'chatgpt', model: 'gpt-6.1-sol',
    messages: [...projected.messages], ...projected.tools === undefined ? {} : { tools: [...projected.tools] }, ...history === undefined ? {} : { toolHistory: history },
  })
}
function body(messages: GenerateOptions['messages'], history?: ToolHistory) {
  return toResponsesBody(toNeutralRequest(harness(messages, history)))
}

it('preserves native addition positions and earlier declarations through DSH projection, removal and reactivation', () => {
  const first = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'First' }] })
  const added = update([{ type: 'text', text: 'Before' }, { type: 'tool-addition', toolName: 'write' }, { type: 'text', text: 'After' }])
  const removed = update([{ type: 'tool-removal', toolName: 'write' }])
  const restored = update([{ type: 'tool-addition', toolName: 'write' }])
  const initial = body([first], { tools: [read], updates: [] })
  const history: ToolHistory = { tools: [read], updates: [{ messageId: added.id, additions: [write] }] }
  const next = body([first, added], history)
  assert.deepEqual(next.tools, initial.tools)
  assert.deepEqual(next.input.slice(0, initial.input.length), initial.input)
  assert.deepEqual(next.input[2], { type: 'additional_tools', role: 'developer', tools: [{ type: 'function', ...write }] })
  assert.deepEqual(next.input[1]?.content, [{ type: 'input_text', text: 'Before' }])
  assert.deepEqual(next.input[3]?.content, [{ type: 'input_text', text: 'After' }])
  const final = body([first, added, removed, restored], { tools: [read], updates: [
    ...history.updates, { messageId: removed.id, additions: [] }, { messageId: restored.id, additions: [write] },
  ] })
  assert.deepEqual(final.input.slice(0, next.input.length), next.input)
  assert.equal(final.input.filter(item => item.type === 'additional_tools').length, 1)
  assert.match(JSON.stringify(final.input.at(-2)), /no longer available/)
  assert.match(JSON.stringify(final.input.at(-1)), /available again/)
  assert.deepEqual(JSON.parse(JSON.stringify(final)), final)
})

it('uses the current complete declarations when an auxiliary prefix omits historical tool updates', () => {
  const added = update([{ type: 'tool-addition', toolName: 'write' }])
  const messages = [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Summary' }] })]
  const result = body(messages, { tools: [read], updates: [{ messageId: added.id, additions: [write] }] })
  assert.deepEqual(result.tools?.map(tool => tool.name), ['read', 'write'])
  assert.ok(result.input.every(item => item.type !== 'additional_tools'))
})

it('does not expose initially deferred tools before their activation and rejects unresolved additions', () => {
  const added = update([{ type: 'tool-addition', toolName: 'write' }])
  const result = body([added], { tools: [{ ...write, deferLoading: true }], updates: [{ messageId: added.id, additions: [write] }] })
  assert.equal(result.tools, undefined)
  assert.equal(result.input[0]?.type, 'additional_tools')
  assert.throws(() => requestOf({ provider: 'chatgpt', model: 'm', messages: [added] }), /matching DSH tool history/)
  assert.throws(() => requestOf({ provider: 'chatgpt', model: 'm', messages: [added], toolHistory: { tools: [], updates: [{ messageId: added.id, additions: [] }] } }), /no declaration/)
})

it('sends additional_tools and developer removals through the HTTP adapter without changing baseline tools', async () => {
  const requests: ReturnType<typeof toResponsesBody>[] = []
  const server = createServer(async (request, response) => {
    let raw = ''
    for await (const chunk of request) raw += chunk
    requests.push(JSON.parse(raw))
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end(`data: ${JSON.stringify({ type: 'response.completed', response: { output: [{
      type: 'message', id: 'msg', role: 'assistant', content: [{ type: 'output_text', text: 'OK' }],
    }] } })}\n\n`)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const auth = { usable: async () => ({ accessToken: 'synthetic', clientId: 'synthetic', replayNamespace: 'cf5a7f74-6069-4dfa-bd1c-df7d2e76f278' }) } as unknown as ChatGptAuth
  const adapter = new ChatGptAdapter({ auth, baseUrl: `http://127.0.0.1:${address.port}` })
  const first = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'First' }] })
  const added = update([{ type: 'tool-addition', toolName: 'write' }])
  const removed = update([{ type: 'tool-removal', toolName: 'read' }])
  try {
    for await (const _ of adapter.stream('chatgpt', harness([first], { tools: [read], updates: [] }))) void _
    const second = harness([first, added, removed], { tools: [read], updates: [
      { messageId: added.id, additions: [write] }, { messageId: removed.id, additions: [] },
    ] })
    for await (const _ of adapter.stream('chatgpt', second)) void _
    assert.deepEqual(requests[1]?.tools, requests[0]?.tools)
    assert.deepEqual(requests[1]?.input[1], { type: 'additional_tools', role: 'developer', tools: [{ type: 'function', ...write }] })
    assert.equal(requests[1]?.input[2]?.role, 'developer')
    assert.match(JSON.stringify(requests[1]?.input[2]), /read.*no longer available/)
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
