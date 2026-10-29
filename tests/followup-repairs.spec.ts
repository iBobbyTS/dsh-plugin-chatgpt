import assert from 'node:assert/strict'
import { it } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { unlinkSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { ChatGptAuth } from '../src/auth/manager.ts'
import { ChatGptAdapter } from '../src/adapter.ts'
import type { ChatGptCredential } from '../src/auth/credential.ts'

const grant: ChatGptCredential = { subject: 'one', clientId: 'synthetic', accessToken: 'old', refreshToken: 'old', savedAt: 1,
  expiresAt: Date.now() + 3600000, scopes: ['chatgpt.tokens.use.direct'] }
const options = (stateDir: string) => ({ stateDir, agentNameHint: 'Test' })

it('automatic completion catches storage and notification errors without killing Node', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'completion-'))
  try {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { writeFileSync, unlinkSync } from 'node:fs';
      import { ChatGptAuth } from ${JSON.stringify(new URL('../src/auth/manager.ts', import.meta.url).href)};
      import { ChatGptSession } from ${JSON.stringify(new URL('../src/session.ts', import.meta.url).href)};
      const auth = new ChatGptAuth(${JSON.stringify(options(dir))});
      let complete;
      auth.begin = async () => ({ authorizationUrl: 'synthetic', redirectUri: 'synthetic',
        result: new Promise(resolve => complete = resolve), submit: async () => {}, cancel() {} });
      const session = new ChatGptSession(auth, { listModels: async () => [], forgetListing() {} },
        { onRosterChanged() { throw new Error('notification failed') } });
      await session.begin();
      writeFileSync(auth.storePath + '.lock', 'other owner', { flag: 'wx' });
      complete(${JSON.stringify(grant)});
      await new Promise(resolve => setTimeout(resolve, 60));
      let state = await session.status();
      assert.equal(state.pending, undefined);
      assert.equal(state.signedIn, false);
      assert.match(state.error, /credentials are being updated/);
      unlinkSync(auth.storePath + '.lock');
      await session.begin(); complete(${JSON.stringify(grant)});
      await new Promise(resolve => setTimeout(resolve, 60));
      state = await session.status();
      assert.equal(state.pending, undefined);
      assert.match(state.error, /notification failed/);
    `], { encoding: 'utf8', timeout: 5000 })
    assert.equal(child.status, 0, child.stderr)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

it('retains a successful rotation across a real other-process storage lock, even after caller cancellation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rotation-persist-'))
  const original = globalThis.fetch
  const auth = new ChatGptAuth(options(dir))
  auth.adopt(grant)
  const controller = new AbortController()
  let calls = 0
  let holder: ReturnType<typeof spawn> | undefined
  try {
    globalThis.fetch = async (_url, init) => {
      calls++
      assert.equal(new URLSearchParams(String(init?.body)).get('refresh_token'), calls === 1 ? 'old' : 'new')
      if (calls === 1) {
        holder = spawn(process.execPath, ['--input-type=module', '-e', `
          import { writeFileSync, unlinkSync } from 'node:fs';
          writeFileSync(process.argv[1], 'other-process', { flag: 'wx' });
          process.send('locked');
          process.on('message', () => { unlinkSync(process.argv[1]); process.exit(0) });
        `, auth.storePath + '.lock'], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
        await once(holder, 'message')
      }
      return Response.json({ access_token: 'fresh', refresh_token: calls === 1 ? 'new' : 'newer', expires_in: 3600 })
    }
    const rotating = auth.renew(controller.signal)
    // The network response has succeeded and its replacement is awaiting commit.
    while (holder === undefined || !holder.connected) await delay(5)
    await delay(60)
    controller.abort()
    const concurrent = auth.renew()
    assert.equal(calls, 1)
    const exited = once(holder, 'exit')
    holder.send('release')
    await exited
    assert.equal((await rotating).refreshToken, 'new')
    assert.equal((await concurrent).refreshToken, 'new')
    assert.equal(auth.active()?.refreshToken, 'new')
    await auth.renew()
    assert.equal(calls, 2)
    assert.equal(auth.active()?.refreshToken, 'newer')
  } finally {
    holder?.kill()
    globalThis.fetch = original
    await rm(dir, { recursive: true, force: true })
  }
})

for (const action of ['remove', 'replace'] as const) it(`does not resurrect an authorization ${action}d during rotation`, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rotation-change-'))
  const original = globalThis.fetch
  const auth = new ChatGptAuth(options(dir))
  auth.adopt(grant)
  try {
    globalThis.fetch = async () => {
      await writeFile(auth.storePath + '.lock', 'other owner', { flag: 'wx' })
      setTimeout(() => {
        unlinkSync(auth.storePath + '.lock')
        if (action === 'remove') auth.signOut()
        // Identical tokens still represent a different authorization namespace.
        else auth.adopt(grant)
      }, 60)
      return Response.json({ access_token: 'new', refresh_token: 'new', expires_in: 3600 })
    }
    await assert.rejects(auth.renew(), /authorization changed or was removed/)
    assert.equal(auth.active()?.refreshToken, action === 'remove' ? undefined : 'old')
  } finally { globalThis.fetch = original; await rm(dir, { recursive: true, force: true }) }
})

for (const switchAccount of [false, true]) it(`rejects a late catalog after ${switchAccount ? 'account switch' : 'sign-out'}`, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catalog-generation-'))
  const original = globalThis.fetch
  const auth = new ChatGptAuth(options(dir))
  auth.adopt(grant)
  const adapter = new ChatGptAdapter({ auth, includeUnlisted: false })
  let release!: () => void
  let entered!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  try {
    let calls = 0
    globalThis.fetch = async () => {
      calls++
      if (calls === 1) { entered(); await gate }
      return Response.json({ models: [{ slug: 'gpt-6-sol', display_name: calls === 1 ? 'Account A' : 'Account B', context_window: calls === 1 ? 872000 : 272000 }] })
    }
    const old = adapter.listModels()
    await started
    // Subsequent requests now belong to B; the suspended A response stays A.
    globalThis.fetch = async () => Response.json({ models: [{ slug: 'gpt-6-sol', display_name: 'Account B', context_window: 272000 }] })
    if (switchAccount) {
      auth.adopt({ ...grant, subject: 'two' })
      // Also prove account identity guards cache reads without explicit invalidation.
      const b = await adapter.listModels()
      assert.equal(b[0]?.name, 'Account B')
    } else { auth.signOut(); adapter.forgetListing(); assert.deepEqual(await adapter.listModels(), []) }
    release()
    assert.deepEqual(await old, [])
    const latest = await adapter.listModels()
    if (switchAccount) assert.equal(latest[0]?.name, 'Account B')
    else assert.deepEqual(latest, [])
  } finally { release?.(); globalThis.fetch = original; await rm(dir, { recursive: true, force: true }) }
})

for (const partial of [false, true]) it(`classifies ${partial ? 'partial' : 'empty'} nonterminal EOF as TRANSPORT and preserves diagnostics`, async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response(partial ? 'data: {"type":"response.output_text.delta","delta":"hello"}\n\n' : '')
    const auth = { active: () => grant, usable: async () => grant } as unknown as ChatGptAuth
    const adapter = new ChatGptAdapter({ auth })
    await assert.rejects(async () => {
      for await (const _ of adapter.stream('chatgpt', { provider: 'chatgpt', model: 'm', messages: [] })) { /* drain */ }
    }, (error: any) => error.code === 'TRANSPORT' && error.cause?.code === 'stream_ended_early')
    globalThis.fetch = async () => Response.json({ error: { code: 'invalid_request_error', message: 'bad request' } }, { status: 400 })
    await assert.rejects(async () => {
      for await (const _ of adapter.stream('chatgpt', { provider: 'chatgpt', model: 'm', messages: [] })) { /* drain */ }
    }, (error: any) => error.code === 'invalid_request_error')
  } finally { globalThis.fetch = original }
})

for (const stage of ['discovery-headers', 'discovery-body', 'revoke-headers', 'revoke-body'] as const) {
  it(`bounds logout through hung ${stage} and clears local credentials`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'logout-deadline-'))
    let requested!: () => void
    const entered = new Promise<void>(resolve => { requested = resolve })
    const server = createServer((_request, response) => {
      requested()
      if (stage.endsWith('body')) {
        response.writeHead(stage === 'revoke-body' ? 503 : 200, { 'content-type': 'application/json' })
        response.write('{')
      }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const url = `http://127.0.0.1:${address.port}`
    const auth = new ChatGptAuth({ ...options(dir), endpoints: stage.startsWith('discovery') ? { discoveryUrl: url } : { revocationEndpoint: url } })
    auth.adopt(grant)
    try {
      const started = Date.now()
      const signingOut = auth.revoke(undefined, { timeoutMs: 100 })
      await entered
      const result = await signingOut
      assert.equal(result.confirmed, false)
      assert.match(result.reason ?? '', /timed out/)
      assert.equal(auth.active(), undefined)
      assert.ok(Date.now() - started < 1500)
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
      await rm(dir, { recursive: true, force: true })
    }
  })
}

it('cancelling revocation stops retries and still signs out locally', async () => {
  const original = globalThis.fetch
  const dir = await mkdtemp(join(tmpdir(), 'logout-cancel-'))
  const auth = new ChatGptAuth({ ...options(dir), endpoints: { revocationEndpoint: 'http://127.0.0.1:1/synthetic' } })
  auth.adopt(grant)
  const controller = new AbortController()
  let requests = 0
  try {
    globalThis.fetch = async (_url, init) => {
      requests++
      assert.ok(init?.signal)
      controller.abort(new Error('user cancelled logout'))
      return new Response('busy', { status: 503 })
    }
    const result = await auth.revoke(undefined, { signal: controller.signal })
    assert.equal(result.confirmed, false)
    assert.match(result.reason ?? '', /cancelled/)
    assert.equal(auth.active(), undefined)
    await delay(30)
    assert.equal(requests, 1)
    assert.equal((await auth.revoke()).confirmed, true)
  } finally { globalThis.fetch = original; await rm(dir, { recursive: true, force: true }) }
})
