/** Exercise the real DSH default-materialization path, not only the neutral serializer. */
import { it } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { BlockAssembler, createUserMessage, ReasoningEffortId, type GenerateOptions, type RequestMessage } from '@deepseek-ai/dsh-llm'
import { ChatGptAdapter, type CompactionSelection } from '../src/adapter.ts'
import { HarnessAdapter } from '../src/index.ts'
import type { ChatGptAuth } from '../src/auth/manager.ts'
import type { ResponsesBody } from '../src/convert/request.ts'
import { readReasoningReplay } from '../src/convert/reasoning.ts'

declare module '@deepseek-ai/dsh-llm' { interface LlmRequestPurposeMap { compaction: true } }

const route = { provider: 'chatgpt', model: 'gpt-6.2-sol' }
const sessionId = 'session-current-selection' as NonNullable<GenerateOptions['sessionId']>
const user = () => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Next' }] })

for (const rejectUpdates of [false, true]) {
  for (const scenario of [
    { name: 'medium → high → compact', dialogue: ['medium', 'medium', 'high', 'high'], current: 'high' },
    { name: 'medium → high → select medium → compact without another dialogue', dialogue: ['medium', 'medium', 'high', 'high'], current: 'medium' },
    { name: 'medium → compact', dialogue: ['medium', 'medium'], current: 'medium' },
  ]) {
    it(`${scenario.name}; configuration updates ${rejectUpdates ? 'refused' : 'accepted'}`, async t => {
      const posted: ResponsesBody[] = []
      t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
        if (String(url).endsWith('/models')) return new Response(JSON.stringify({ models: [{ slug: route.model,
          default_reasoning_level: 'low', supported_reasoning_levels: ['low', 'medium', 'high'].map(effort => ({ effort })) }] }))
        const body = JSON.parse(String(init?.body)) as ResponsesBody
        posted.push(body)
        if (rejectUpdates && body.input.some(item => item.type === 'configuration_update')) {
          return new Response(JSON.stringify({ error: { code: 'subscription_sharing_unsupported_capability', message: 'Remove unsupported input items' } }), { status: 400 })
        }
        return new Response(`data: ${JSON.stringify({ type: 'response.completed', response: { output: [{
          type: 'message', id: `msg_${posted.length}`, role: 'assistant', content: [{ type: 'output_text', text: 'OK' }],
        }] } })}\n\n`)
      })
      let current: CompactionSelection = { ...route, reasoningEffort: 'medium' }
      const seenSessions: string[] = []
      const credential = { accessToken: 'synthetic', clientId: 'client', replayNamespace: 'cf5a7f74-6069-4dfa-bd1c-df7d2e76f278' }
      const auth = { active: () => credential, usable: async () => credential } as unknown as ChatGptAuth
      const inner = new ChatGptAdapter({ auth, readCompactionSelection: id => {
        seenSessions.push(id)
        return id === sessionId ? current : undefined
      } })
      const ctx = new Context()
      await ctx.plugin(LlmRuntime)
      const dispose = ctx.llm.registerAdapter([route.provider], new HarnessAdapter(inner, route.provider))
      let messages: RequestMessage[] = [user()]
      try {
        for (const effort of scenario.dialogue) {
          current = { ...route, reasoningEffort: effort }
          const assembler = new BlockAssembler()
          for await (const chunk of ctx.llm.stream({ ...route, sessionId, reasoningEffort: ReasoningEffortId(effort), messages })) assembler.push(chunk)
          assert.equal(assembler.finish?.kind, 'stop', JSON.stringify(assembler.finish))
          assert.ok(assembler.replayState)
          messages = [...messages, assembler.message({ ...route, replayState: assembler.replayState }), user()]
        }
        const before = posted.at(-1); assert.ok(before)
        current = { ...route, reasoningEffort: scenario.current }
        assert.equal((await ctx.llm.resolveCallConfig(route)).reasoningEffort, 'low', 'real host must inject the conflicting model default')
        const compactStart = posted.length
        const assembler = new BlockAssembler()
        for await (const chunk of ctx.llm.stream({ ...route, sessionId, purpose: 'compaction', messages })) assembler.push(chunk)
        assert.equal(assembler.finish?.kind, 'stop', JSON.stringify(assembler.finish))
        const replay = assembler.replayState as { response?: { reasoningReplay?: unknown } } | undefined
        assert.equal(readReasoningReplay(replay?.response?.reasoningReplay)?.effort, scenario.current)
        assert.deepEqual(seenSessions, [sessionId], 'only compact reads the current selection by actual session ID')
        const actual = posted.at(-1); assert.ok(actual)
        assert.equal(actual.input.some(item => item.type === 'configuration_update' && (item['reasoning'] as { effort?: string })?.effort === 'low'), false)
        if (rejectUpdates) assert.equal(actual.reasoning?.effort, scenario.current)
        if (scenario.current === scenario.dialogue.at(-1)) {
          assert.deepEqual(actual.input.slice(0, before.input.length), before.input)
          assert.deepEqual(actual.reasoning, before.reasoning)
          assert.equal(posted.length, compactStart + 1, 'same effort must not trigger a capability probe or fallback')
        }
      } finally { dispose() }
    })
  }
}

it('snapshots the current selection once; later changes apply to the next compact', async t => {
  const posted: ResponsesBody[] = []
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    posted.push(JSON.parse(String(init.body)))
    return new Response(`data: ${JSON.stringify({ type: 'response.completed', response: { output: [{
      type: 'message', id: 'msg_snapshot', role: 'assistant', content: [{ type: 'output_text', text: 'OK' }],
    }] } })}\n\n`)
  })
  const credential = { accessToken: 'synthetic', clientId: 'client', replayNamespace: 'cf5a7f74-6069-4dfa-bd1c-df7d2e76f278' }
  const current: CompactionSelection = { ...route, reasoningEffort: 'high' }
  const inner = new ChatGptAdapter({ auth: { usable: async () => credential } as unknown as ChatGptAuth,
    readCompactionSelection: () => current })
  let release = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  t.mock.method(inner, 'resolveModel', async () => {
    await gate
    return { ...route, id: route.model, name: 'Test', inputModalities: ['text'], context: { contextWindow: 1000000 },
      reasoning: { defaultEffort: 'low', efforts: ['low', 'medium', 'high'].map(id => ({ id, name: id })) } }
  })
  const request = { ...route, sessionId, purpose: 'compaction', reasoningEffort: 'low', messages: [] }
  const original = JSON.stringify(request)
  const stream = inner.stream(route.provider, request)
  const pending = stream.next()
  current.reasoningEffort = 'medium'
  release()
  await pending
  for await (const chunk of stream) void chunk
  assert.equal(posted[0]?.reasoning?.effort, 'high')
  for await (const chunk of inner.stream(route.provider, request)) void chunk
  assert.equal(posted[1]?.reasoning?.effort, 'medium')
  assert.equal(JSON.stringify(request), original, 'do not rewrite the host-owned request')
})

it('rejects an unsupported current choice before HTTP and does not borrow another route selection', async t => {
  const posted: ResponsesBody[] = []
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    posted.push(JSON.parse(String(init.body)))
    return new Response(`data: ${JSON.stringify({ type: 'response.completed', response: { output: [{
      type: 'message', id: 'msg_scope', role: 'assistant', content: [{ type: 'output_text', text: 'OK' }],
    }] } })}\n\n`)
  })
  const credential = { accessToken: 'synthetic', clientId: 'client', replayNamespace: 'cf5a7f74-6069-4dfa-bd1c-df7d2e76f278' }
  let current: CompactionSelection = { ...route, reasoningEffort: 'high' }
  const inner = new ChatGptAdapter({ auth: { usable: async () => credential } as unknown as ChatGptAuth,
    readCompactionSelection: () => current })
  t.mock.method(inner, 'resolveModel', async () => ({ ...route, id: route.model, name: 'Test', inputModalities: ['text'],
    context: { contextWindow: 1000000 }, reasoning: { defaultEffort: 'low', efforts: [{ id: 'low', name: 'Low' }] } }))
  const request = { ...route, sessionId, purpose: 'compaction', reasoningEffort: 'low', messages: [] }
  await assert.rejects(async () => { for await (const chunk of inner.stream(route.provider, request)) void chunk },
    { code: 'UNSUPPORTED_REASONING_EFFORT' })
  assert.equal(posted.length, 0)
  current = { provider: 'other-route', model: route.model, reasoningEffort: 'high' }
  for await (const chunk of inner.stream(route.provider, request)) void chunk
  assert.equal(posted[0]?.reasoning?.effort, 'low')
})
