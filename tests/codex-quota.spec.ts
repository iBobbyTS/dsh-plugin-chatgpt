import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, statSync, readdirSync, chmodSync, symlinkSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { CodexQuota, parseCodexQuota } from '../src/codex-quota.ts'

const root = resolve('.agent-work/tmp/codex-quota-tests')
mkdirSync(root, { recursive: true })
const directories: string[] = []
afterEach(() => {
  for (const dir of directories.splice(0)) {
    assert.ok(dir.startsWith(`${root}/`))
    chmodSync(dir, 0o700)
    rmSync(dir, { recursive: true, force: true })
  }
})
const at = 1_800_000_000_000
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const quota = { plan_type: 'plus', rate_limit: { primary_window: { used_percent: 20, reset_after_seconds: 600, limit_window_seconds: 18000 }, secondary_window: { used_percent: 45, reset_at: at / 1000 + 3600, limit_window_seconds: 604800 } } }
function fixture(fetchImpl: typeof fetch = async () => response(quota)) {
  const dir = mkdtempSync(join(root, 'case-')); directories.push(dir)
  const auth = join(dir, 'auth.json')
  const document = { auth_mode: 'chatgpt', extra: { preserve: true }, tokens: { access_token: 'access-old', refresh_token: 'refresh-old', account_id: 'real-account-secret', id_token: 'id-old', extra: 'preserve' } }
  writeFileSync(auth, JSON.stringify(document), { mode: 0o600 })
  const state = join(dir, 'state')
  const owner = new CodexQuota(state, fetchImpl, () => at)
  return { dir, auth, document, state, owner }
}
const read = (owner: CodexQuota) => owner.read({ signal: new AbortController().signal })

describe('Codex quota file ownership and parsing', () => {
  it('is opt-in, does not read default credentials before selection', async () => {
    let calls = 0
    const { owner } = fixture(async () => { calls++; return response(quota) })
    assert.deepEqual(await read(owner), { observedAt: at, accounts: [] }); assert.equal(calls, 0)
    assert.equal(owner.view().allowRefresh, false)
  })
  it('sends only selected Codex credentials to the fixed endpoint, no redirects, and projects two windows', async () => {
    const calls: [string, RequestInit | undefined][] = []
    const { owner, auth } = fixture(async (url, init) => { calls.push([String(url), init]); return response(quota) })
    owner.select(auth, false, '工作账号')
    const result = await read(owner)
    assert.equal(result.accounts[0]?.status, 'ok'); assert.equal(result.accounts[0]?.windows.length, 2)
    assert.deepEqual(result.accounts[0]?.windows.map(w => w.usedPercent), [20, 45])
    assert.equal(result.accounts[0]?.windows[0]?.resetsAt, at + 600000)
    assert.equal(result.accounts[0]?.label, '工作账号')
    assert.equal(calls[0]?.[0], 'https://chatgpt.com/backend-api/wham/usage')
    assert.equal(calls[0]?.[1]?.redirect, 'manual')
    assert.equal((calls[0]?.[1]?.headers as Record<string, string>)['ChatGPT-Account-Id'], 'real-account-secret')
    assert.ok(!JSON.stringify(result).includes('real-account-secret'))
    assert.ok(!JSON.stringify(owner.view()).includes('access-old'))
  })
  it('persists path/consent only, survives owner reload, and clear never deletes credentials', () => {
    const { owner, auth, state, document } = fixture()
    owner.select(auth, true, 'personal')
    const restored = new CodexQuota(state)
    assert.equal(restored.view().path, auth); assert.equal(restored.view().allowRefresh, true)
    assert.ok(!readFileSync(join(state, 'codex-quota.json'), 'utf8').includes('refresh-old'))
    restored.clear(); assert.equal(new CodexQuota(state).view().path, undefined)
    assert.deepEqual(JSON.parse(readFileSync(auth, 'utf8')), document)
  })
  it('rejects non-ChatGPT credentials, aliases and malformed files without reflecting content', () => {
    const { owner, auth, dir, document } = fixture()
    const alias = join(dir, 'alias.json'); symlinkSync(auth, alias)
    assert.throws(() => owner.select(alias, true, ''), /file-unavailable/)
    writeFileSync(auth, 'sensitive-broken-json'); assert.throws(() => owner.select(auth, true, ''), /^Error: invalid-auth-file$/)
    writeFileSync(auth, JSON.stringify({ ...document, auth_mode: 'apikey' })); assert.throws(() => owner.select(auth, true, ''), /unsupported-auth-mode/)
  })
  it('never invents zero on missing/invalid percentages, and secondary need not be weekly', () => {
    for (const percent of [undefined, NaN, Infinity, -1, 101, '50']) assert.throws(() => parseCodexQuota({ rate_limit: { primary_window: { used_percent: percent } } }, at))
    const windows = parseCodexQuota({ rate_limit: { secondary_window: { used_percent: 0, limit_window_seconds: 86400 } } }, at)
    assert.equal(windows[0]?.windowSeconds, 86400); assert.equal(windows[0]?.usedPercent, 0)
  })
  it('does not refresh 403 or 429, or a 401 without writeback consent', async () => {
    for (const status of [401, 403, 429]) {
      let calls = 0
      const { owner, auth } = fixture(async () => { calls++; return response({}, status) })
      owner.select(auth, status !== 401, '')
      const result = await read(owner)
      assert.equal(calls, 1); assert.equal(result.accounts[0]?.status, status === 429 ? 'rate-limited' : 'unauthorized')
      assert.deepEqual(result.accounts[0]?.windows, [])
    }
  })
})

describe('Codex refresh rotation and atomic persistence', () => {
  it('refreshes a 401 once, writes all returned tokens atomically and preserves unknown fields', async () => {
    let calls = 0
    const { owner, auth, dir, document } = fixture(async (url, init) => {
      calls++
      if (String(url).includes('/oauth/token')) {
        assert.equal(init?.redirect, 'manual')
        const body = JSON.parse(init?.body as string)
        assert.deepEqual(body, { grant_type: 'refresh_token', refresh_token: 'refresh-old', client_id: 'app_EMoamEEZ73f0CkXaXp7hrann' })
        return response({ access_token: 'access-new', refresh_token: 'refresh-new', id_token: 'id-new' })
      }
      return (init?.headers as Record<string, string>)['authorization'] === 'Bearer access-new' ? response(quota) : response({}, 401)
    })
    owner.select(auth, true, '')
    const inode = statSync(auth).ino
    const result = await read(owner)
    assert.equal(result.accounts[0]?.status, 'ok'); assert.equal(calls, 3)
    const stored = JSON.parse(readFileSync(auth, 'utf8'))
    assert.equal(stored.tokens.refresh_token, 'refresh-new'); assert.equal(stored.tokens.access_token, 'access-new'); assert.equal(stored.tokens.id_token, 'id-new')
    assert.deepEqual(stored.extra, document.extra); assert.equal(stored.tokens.extra, 'preserve'); assert.equal(stored.tokens.account_id, document.tokens.account_id)
    assert.equal(statSync(auth).mode & 0o777, 0o600); assert.notEqual(statSync(auth).ino, inode)
    assert.ok(readdirSync(dir).every(name => !name.endsWith('.tmp') && !name.endsWith('.lock')))
  })
  it('retains the refresh/id token when omitted by the response', async () => {
    const { owner, auth } = fixture(async (url, init) => String(url).includes('/oauth/token')
      ? response({ access_token: 'access-new' })
      : (init?.headers as Record<string, string>)['authorization'] === 'Bearer access-new' ? response(quota) : response({}, 401))
    owner.select(auth, true, ''); assert.equal((await read(owner)).accounts[0]?.status, 'ok')
    const stored = JSON.parse(readFileSync(auth, 'utf8')); assert.equal(stored.tokens.refresh_token, 'refresh-old'); assert.equal(stored.tokens.id_token, 'id-old')
  })
  it('refreshes near-expiry JWT proactively, before querying quota', async () => {
    const calls: string[] = []
    const { owner, auth, document } = fixture(async url => { calls.push(String(url)); return String(url).includes('/oauth/token') ? response({ access_token: 'fresh' }) : response(quota) })
    document.tokens.access_token = `header.${Buffer.from(JSON.stringify({ exp: at / 1000 + 10 })).toString('base64url')}.sig`
    writeFileSync(auth, JSON.stringify(document)); owner.select(auth, true, '')
    assert.equal((await read(owner)).accounts[0]?.status, 'ok'); assert.ok(calls[0]?.includes('/oauth/token')); assert.equal(calls.length, 2)
  })
  it('single-flights concurrent calls and shares rotation across plugin instances', async () => {
    let refreshes = 0
    const fetchImpl: typeof fetch = async (url, init) => {
      if (String(url).includes('/oauth/token')) { refreshes++; await new Promise(resolve => setTimeout(resolve, 30)); return response({ access_token: 'new', refresh_token: 'rotated' }) }
      return (init?.headers as Record<string, string>)['authorization'] === 'Bearer new' ? response(quota) : response({}, 401)
    }
    const { owner, auth, state } = fixture(fetchImpl); owner.select(auth, true, '')
    const other = new CodexQuota(state, fetchImpl, () => at)
    const results = await Promise.all([read(owner), read(owner), read(other)])
    assert.ok(results.every(result => result.accounts[0]?.status === 'ok')); assert.equal(refreshes, 1)
  })
  it('re-reads after lock acquisition and uses an external rotation instead of refreshing old tokens', async () => {
    let refreshes = 0
    const { owner, auth, document } = fixture(async (url, init) => {
      if (String(url).includes('/oauth/token')) { refreshes++; return response({}) }
      return (init?.headers as Record<string, string>)['authorization'] === 'Bearer external' ? response(quota) : response({}, 401)
    })
    owner.select(auth, true, '')
    const lock = `${auth}.dsh-refresh.lock`; writeFileSync(lock, '', { mode: 0o600 })
    const reading = read(owner)
    setTimeout(() => { writeFileSync(auth, JSON.stringify({ ...document, tokens: { ...document.tokens, access_token: 'external', refresh_token: 'external-refresh' } })); rmSync(lock) }, 20)
    assert.equal((await reading).accounts[0]?.status, 'ok'); assert.equal(refreshes, 0)
  })
  it('never overwrites a file externally changed during refresh', async () => {
    let auth = ''; let external = ''
    const fixtureData = fixture(async url => {
      if (String(url).includes('/oauth/token')) { writeFileSync(auth, external); return response({ access_token: 'rotated', refresh_token: 'rotated-refresh' }) }
      return response({}, 401)
    })
    auth = fixtureData.auth
    external = JSON.stringify({ ...fixtureData.document, tokens: { ...fixtureData.document.tokens, access_token: 'external' } })
    fixtureData.owner.select(auth, true, '')
    const result = await read(fixtureData.owner)
    assert.equal(result.accounts[0]?.reason, 'credential-conflict'); assert.equal(readFileSync(auth, 'utf8'), external)
  })
  it('holds rotated results on persistence failure and retries only disk write, never old refresh', async () => {
    let dir = ''; let refreshes = 0
    const data = fixture(async (url, init) => {
      if (String(url).includes('/oauth/token')) { refreshes++; chmodSync(dir, 0o500); return response({ access_token: 'new', refresh_token: 'rotated' }) }
      return (init?.headers as Record<string, string>)['authorization'] === 'Bearer new' ? response(quota) : response({}, 401)
    })
    dir = data.dir; data.owner.select(data.auth, true, '')
    try { assert.equal((await read(data.owner)).accounts[0]?.reason, 'persistence-failed') } finally { chmodSync(dir, 0o700) }
    assert.equal((await read(data.owner)).accounts[0]?.status, 'ok'); assert.equal(refreshes, 1)
    assert.equal(JSON.parse(readFileSync(data.auth, 'utf8')).tokens.refresh_token, 'rotated')
  })
  it('does not replay a refresh token after an ambiguous exchange or unreadable success', async () => {
    for (const failure of ['transport', 'invalid-success']) {
      let refreshes = 0
      const { owner, auth } = fixture(async url => {
        if (String(url).includes('/oauth/token')) { refreshes++; if (failure === 'transport') throw new Error('private upstream detail'); return response({ refresh_token: 'rotated-but-no-access' }) }
        return response({}, 401)
      })
      owner.select(auth, true, '')
      const first = await read(owner); assert.ok(['unavailable', 'invalid-response'].includes(first.accounts[0]?.status ?? ''))
      assert.equal((await read(owner)).accounts[0]?.reason, 'reauth-required'); assert.equal(refreshes, 1)
      assert.ok(!JSON.stringify(owner.view()).includes('private upstream detail'))
    }
  })
  it('does not refresh-loop after token refusal or a repeated usage 401', async () => {
    for (const refused of [true, false]) {
      let refreshes = 0
      const { owner, auth } = fixture(async url => String(url).includes('/oauth/token')
        ? (refreshes++, response(refused ? {} : { access_token: 'new', refresh_token: 'rotated' }, refused ? 400 : 200)) : response({}, 401))
      owner.select(auth, true, ''); assert.equal((await read(owner)).accounts[0]?.status, 'unauthorized')
      assert.equal(refreshes, 1)
      if (refused) { await read(owner); assert.equal(refreshes, 1) }
    }
  })
  it('persists a successful rotation even after the requesting consumer cancels', async () => {
    let finish: ((value: Response) => void) | undefined
    let started: (() => void) | undefined
    const begun = new Promise<void>(resolve => { started = resolve })
    const { owner, auth } = fixture(async url => {
      if (String(url).includes('/oauth/token')) { started?.(); return await new Promise<Response>(resolve => { finish = resolve }) }
      return response({}, 401)
    })
    owner.select(auth, true, '')
    const controller = new AbortController(); const reading = owner.read({ signal: controller.signal }); const rejection = assert.rejects(reading)
    await begun; controller.abort(); finish?.(response({ access_token: 'new', refresh_token: 'rotated' }))
    await rejection
    assert.equal(JSON.parse(readFileSync(auth, 'utf8')).tokens.refresh_token, 'rotated')
  })
  it('does not refresh or write after the user stops monitoring during a pending usage request', async () => {
    let finish: ((value: Response) => void) | undefined
    let refreshes = 0
    const { owner, auth, document } = fixture(async url => {
      if (String(url).includes('/oauth/token')) { refreshes++; return response({ access_token: 'not-authorized' }) }
      return await new Promise<Response>(resolve => { finish = resolve })
    })
    owner.select(auth, true, '')
    const reading = read(owner); const rejected = assert.rejects(reading)
    owner.clear(); finish?.(response({}, 401)); await rejected
    assert.equal(refreshes, 0); assert.deepEqual(JSON.parse(readFileSync(auth, 'utf8')), document)
  })
  it('hides the last UI snapshot when an external writer switches accounts', async () => {
    const { owner, auth, document } = fixture()
    owner.select(auth, false, ''); await read(owner)
    assert.ok(owner.view().snapshot)
    writeFileSync(auth, JSON.stringify({ ...document, tokens: { ...document.tokens, account_id: 'other-account' } }))
    assert.equal(owner.view().snapshot, undefined)
  })
  it('recovers a conflict only after the external new credential is verified, without overwriting it', async () => {
    let auth = ''; let external = ''; let refreshes = 0
    const data = fixture(async (url, init) => {
      if (String(url).includes('/oauth/token')) { refreshes++; writeFileSync(auth, external); return response({ access_token: 'rotated', refresh_token: 'rotated-refresh' }) }
      return (init?.headers as Record<string, string>)['authorization'] === 'Bearer external' ? response(quota) : response({}, 401)
    })
    auth = data.auth; external = JSON.stringify({ ...data.document, tokens: { ...data.document.tokens, access_token: 'external' } })
    data.owner.select(auth, true, '')
    assert.equal((await read(data.owner)).accounts[0]?.reason, 'credential-conflict')
    assert.equal((await read(data.owner)).accounts[0]?.status, 'ok')
    assert.equal(refreshes, 1); assert.equal(readFileSync(auth, 'utf8'), external)
    assert.doesNotThrow(() => data.owner.clear())
  })
  it('invalidates a late old-account result after the user selects a new file', async () => {
    let finish: ((value: Response) => void) | undefined
    const old = fixture(async () => await new Promise<Response>(resolve => { finish = resolve }))
    const next = fixture()
    old.owner.select(old.auth, false, '')
    const reading = read(old.owner); const rejected = assert.rejects(reading, /binding-changed|aborted/i)
    old.owner.select(next.auth, false, 'new')
    finish?.(response(quota)); await rejected
    assert.equal(old.owner.view().snapshot, undefined)
  })
})
