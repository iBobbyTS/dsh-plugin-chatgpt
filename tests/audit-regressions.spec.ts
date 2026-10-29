import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChatGptAuth } from '../src/auth/manager.ts'
import { ChatGptAdapter } from '../src/adapter.ts'
import { decodeEvent } from '../src/api/events.ts'
import { toResponsesBody } from '../src/convert/request.ts'

it('keeps images in ordered tool outputs', () => {
  const body = toResponsesBody({ model: 'm', messages: [{ role: 'tool', toolCallId: 'c', content: [
    { type: 'text', text: 'screenshot' }, { type: 'image', url: 'data:image/png;base64,AQID' },
  ] }] })
  assert.deepEqual(body.input[0]?.output, [{ type: 'input_text', text: 'screenshot' }, { type: 'input_image', image_url: 'data:image/png;base64,AQID' }])
})
it('preserves standard top-level SSE diagnostics', () => {
  const event = decodeEvent(JSON.stringify({ type: 'error', code: 'rate_limit_exceeded', message: 'retry later' }))
  assert.ok(event?.kind === 'failed')
  assert.equal(event.code, 'rate_limit_exceeded')
  assert.equal(event.message, 'retry later')
})
it('closes the HTTP body when its consumer returns early', async () => {
  const original = globalThis.fetch
  let cancelled = 0
  globalThis.fetch = async () => new Response(new ReadableStream({ start(c) {
    c.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"hello"}\n\n'))
  }, cancel() { cancelled++ } }))
  try {
    const auth = { usable: async () => ({ accessToken: 'test' }), active: () => ({}) } as unknown as ChatGptAuth
    const iterator = new ChatGptAdapter({ auth }).stream('chatgpt', { provider: 'chatgpt', model: 'm', messages: [] })
    await iterator.next(); await iterator.return()
    assert.equal(cancelled, 1)
  } finally { globalThis.fetch = original }
})
it('preserves rotated credentials and concurrent model settings', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'siwc-regression-'))
  const original = globalThis.fetch
  try {
    const a = new ChatGptAuth({ stateDir, agentNameHint: 'Test' })
    a.adopt({ subject: 's', clientId: 'test', accessToken: 'old', refreshToken: 'old', savedAt: 1, expiresAt: Date.now()+3600000, scopes: ['chatgpt.tokens.use.direct'] })
    const b = new ChatGptAuth({ stateDir, agentNameHint: 'Test' }); b.active()
    globalThis.fetch = async () => Response.json({ access_token: 'new', refresh_token: 'new', expires_in: 3600 })
    await a.renew(); b.activate('s')
    assert.equal(a.active()?.refreshToken, 'new')
    globalThis.fetch = async () => Response.json({ models: [
      { slug: 'gpt-6-sol', visibility: 'hide' },
      { slug: 'gpt-6-astra', visibility: 'list', context_window: 872000, input_modalities: ['text'] },
      { slug: 'gpt-6.1-terra', visibility: 'list' },
    ] })
    const adapter = new ChatGptAdapter({ auth: a, stateDir })
    assert.equal((await adapter.listModels()).some(m => m.id === 'gpt-6-sol'), false)
    const before = await adapter.resolveModel('chatgpt', 'gpt-6-astra')
    await Promise.all([adapter.setModelDisabled('gpt-6-astra', true), adapter.setModelDisabled('gpt-6.1-terra', true)])
    const after = await adapter.resolveModel('chatgpt', 'gpt-6-astra')
    assert.deepEqual(after.context, before.context)
    assert.deepEqual(after.inputModalities, before.inputModalities)
    const stored = JSON.parse(await readFile(join(stateDir, 'models.json'), 'utf8'))
    assert.deepEqual(new Set(stored.disabled), new Set(['gpt-6-astra','gpt-6.1-terra']))
  } finally { globalThis.fetch = original; await rm(stateDir, { recursive: true, force: true }) }
})
