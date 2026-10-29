import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ChatGptAuth } from '../src/auth/manager.ts'
import { startTokenServer } from './helpers.ts'

describe('cross-process refresh coordination', () => {
  const closers: Array<() => Promise<void>> = []
  const dirs: string[] = []
  afterEach(async () => {
    await Promise.all(closers.splice(0).map(close => close()))
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })
  it('does not reuse a rotated refresh token across two auth managers', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'chatgpt-lock-'))
    dirs.push(stateDir)
    const token = await startTokenServer({ body: {
      access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 3600,
      scope: 'chatgpt.tokens.use.direct',
    } })
    closers.push(token.close)
    const options = { stateDir, agentNameHint: 'Test', endpoints: { tokenUrl: token.url } }
    const first = new ChatGptAuth(options)
    first.adopt({ accessToken: 'old-access', refreshToken: 'old-refresh',
      clientId: 'oaiapp_test', scopes: ['chatgpt.tokens.use.direct'],
      expiresAt: Date.now() + 3600000, savedAt: Date.now(), subject: 'one' })
    const second = new ChatGptAuth(options)
    const [a, b] = await Promise.all([first.renew(), second.renew()])
    assert.equal(a.refreshToken, 'rotated-refresh')
    assert.equal(b.refreshToken, 'rotated-refresh')
    assert.equal(token.requests.length, 1)
  })
})
