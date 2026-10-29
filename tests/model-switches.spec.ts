/**
 * Model overrides: the persisted switches and display names, and the adapter
 * behavior they drive — the selector's offering shrinks and shows the given
 * names, while a direct call is untouched by either.
 */
import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChatGptAdapter, isCodedError } from '../src/adapter.ts'
import { ChatGptAuth } from '../src/auth/manager.ts'
import { writeDocument, emptyDocument } from '../src/auth/store.ts'
import { readModelOverrides, writeModelOverrides } from '../src/models/switches.ts'

const servers: Server[] = []
const dirs: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve())
    server.closeAllConnections()
  })))
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

/** A fresh state directory with a live (unexpired) grant already stored. */
async function signedIn(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'chatgpt-switches-'))
  dirs.push(dir)
  writeDocument(join(dir, 'chatgpt-auth.json'), {
    ...emptyDocument('urn:uuid:x'),
    accounts: {
      'subject-1': {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3600_000,
        clientId: 'oaiapp_issued',
        scopes: ['chatgpt.tokens.use.direct'],
        subject: 'subject-1',
        email: 'me@example.com',
        savedAt: Date.now(),
      },
    },
    active: 'subject-1',
  })
  return dir
}

/** An endpoint serving a fixed two-model listing. */
async function endpoint(): Promise<string> {
  const server = createServer((request, response) => {
    const path = request.url ?? '/'
    if (path.startsWith('/models')) {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        models: [
          { slug: 'gpt-6-astra', display_name: 'GPT-6 Astra', visibility: 'list' },
          { slug: 'gpt-6.1-terra', display_name: 'GPT-6.1 Terra', visibility: 'list' },
        ],
      }))
      return
    }
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end()
  })
  servers.push(server)
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('endpoint bound no port')
  return `http://127.0.0.1:${address.port}`
}

/** An adapter over the given state directory whose roster is the fixed listing. */
function adapterFor(stateDir: string, url: string): ChatGptAdapter {
  return new ChatGptAdapter({
    auth: new ChatGptAuth({ stateDir, agentNameHint: 'DeepSeek Harness' }),
    baseUrl: url,
    stateDir,
    // The fixed listing is the whole roster; the measured extras only add ids a
    // test would then have to name.
    includeUnlisted: false,
  })
}

describe('the overrides file', () => {
  it('reads an absent file as no overrides', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chatgpt-switches-'))
    dirs.push(dir)
    assert.deepEqual(await readModelOverrides(dir), { disabled: [], names: {} })
  })

  it('round-trips switches and names through the file it writes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chatgpt-switches-'))
    dirs.push(dir)
    await writeModelOverrides(dir, { disabled: ['gpt-6-astra'], names: { 'gpt-6.1-terra': 'Terra' } })
    assert.deepEqual(await readModelOverrides(dir), {
      disabled: ['gpt-6-astra'],
      names: { 'gpt-6.1-terra': 'Terra' },
    })
    await writeModelOverrides(dir, { disabled: [], names: {} })
    assert.deepEqual(await readModelOverrides(dir), { disabled: [], names: {} })
  })

  it('reads the original switches-only shape as empty names', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chatgpt-switches-'))
    dirs.push(dir)
    await writeFile(join(dir, 'models.json'), '{"disabled": ["gpt-6-astra"]}', 'utf8')
    assert.deepEqual(await readModelOverrides(dir), { disabled: ['gpt-6-astra'], names: {} })
  })

  it('fails loudly on a malformed file instead of ignoring it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chatgpt-switches-'))
    dirs.push(dir)
    await writeFile(join(dir, 'models.json'), '{"disabled": "gpt-6-astra"}', 'utf8')
    await assert.rejects(readModelOverrides(dir), /models\.json/)
  })

  it('fails loudly on a name override that is not a usable name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chatgpt-switches-'))
    dirs.push(dir)
    await writeFile(join(dir, 'models.json'), '{"disabled": [], "names": {"gpt-6-astra": "  "}}', 'utf8')
    await assert.rejects(readModelOverrides(dir), /models\.json/)
  })
})

describe('model switches on the adapter', () => {
  it('hides a switched-off model from the offering, not from a direct call', async () => {
    const stateDir = await signedIn()
    const adapter = adapterFor(stateDir, await endpoint())
    assert.deepEqual((await adapter.listModels()).map(model => model.id), ['gpt-6-astra', 'gpt-6.1-terra'])

    await adapter.setModelDisabled('gpt-6-astra', true)

    assert.deepEqual((await adapter.listModels()).map(model => model.id), ['gpt-6.1-terra'])
    // The listing is not an allowlist, and a switch is the same statement about
    // the offering rather than the route: naming the model directly still resolves.
    const resolved = await adapter.resolveModel('chatgpt', 'gpt-6-astra')
    assert.equal(resolved.id, 'gpt-6-astra')
  })

  it('persists the switch where a second process reads it', async () => {
    const stateDir = await signedIn()
    const url = await endpoint()
    const first = adapterFor(stateDir, url)
    await first.setModelDisabled('gpt-6-astra', true)

    const second = adapterFor(stateDir, url)
    const rows = await second.modelSwitches()
    assert.deepEqual(
      rows.map(row => [row.id, row.disabled] as const),
      [['gpt-6-astra', true], ['gpt-6.1-terra', false]],
    )
    const stored = JSON.parse(await readFile(join(stateDir, 'models.json'), 'utf8')) as {
      disabled: string[]
      names: Record<string, string>
    }
    assert.deepEqual(stored.disabled, ['gpt-6-astra'])
    assert.deepEqual(stored.names, {})
  })

  it('restores a model that is switched back on', async () => {
    const stateDir = await signedIn()
    const adapter = adapterFor(stateDir, await endpoint())
    await adapter.setModelDisabled('gpt-6-astra', true)
    await adapter.setModelDisabled('gpt-6-astra', false)
    assert.deepEqual((await adapter.listModels()).map(model => model.id), ['gpt-6-astra', 'gpt-6.1-terra'])
  })

  it('announces a switch so the selector can rebuild its offering', async () => {
    const stateDir = await signedIn()
    const announced: string[] = []
    const adapter = new ChatGptAdapter({
      auth: new ChatGptAuth({ stateDir, agentNameHint: 'DeepSeek Harness' }),
      baseUrl: await endpoint(),
      stateDir,
      includeUnlisted: false,
      onModelSwitchesChanged: () => { announced.push('changed') },
    })
    await adapter.listModels()

    await adapter.setModelDisabled('gpt-6.1-terra', true)

    assert.deepEqual(announced, ['changed'])
  })

  it('refuses a model the roster does not carry', async () => {
    const stateDir = await signedIn()
    const adapter = adapterFor(stateDir, await endpoint())
    await adapter.listModels()

    await assert.rejects(
      adapter.setModelDisabled('gpt-4', true),
      (error: unknown) => isCodedError(error) && error.code === 'chatgpt_unknown_model',
    )
    // A refused switch persists nothing.
    assert.deepEqual(await readModelOverrides(stateDir), { disabled: [], names: {} })
  })
})

describe('model display names on the adapter', () => {
  it('shows the hand-set name in the offering while requests keep the id', async () => {
    const stateDir = await signedIn()
    const adapter = adapterFor(stateDir, await endpoint())

    const rows = await adapter.setModelName('gpt-6.1-terra', '  Terra 9  ')
    assert.equal(rows.find(row => row.id === 'gpt-6.1-terra')?.name, 'Terra 9')

    const offered = await adapter.listModels()
    assert.deepEqual(offered.map(model => [model.id, model.name] as const), [
      ['gpt-6-astra', 'GPT-6 Astra'],
      ['gpt-6.1-terra', 'Terra 9'],
    ])
    // The name is display vocabulary: a direct call resolves the same model.
    const resolved = await adapter.resolveModel('chatgpt', 'gpt-6.1-terra')
    assert.equal(resolved.id, 'gpt-6.1-terra')
  })

  it('reports both the roster name and the override side by side', async () => {
    const stateDir = await signedIn()
    const adapter = adapterFor(stateDir, await endpoint())
    await adapter.setModelName('gpt-6.1-terra', 'Terra 9')

    const rows = await adapter.modelSwitches()
    assert.deepEqual(
      rows.map(row => [row.id, row.defaultName, row.name] as const),
      [['gpt-6-astra', 'GPT-6 Astra', 'GPT-6 Astra'], ['gpt-6.1-terra', 'GPT-6.1 Terra', 'Terra 9']],
    )
  })

  it('restores the roster name when the override is cleared', async () => {
    const stateDir = await signedIn()
    const url = await endpoint()
    const adapter = adapterFor(stateDir, url)
    await adapter.setModelName('gpt-6.1-terra', 'Terra 9')
    await adapter.setModelName('gpt-6.1-terra', undefined)

    const rows = await adapter.modelSwitches()
    assert.equal(rows.find(row => row.id === 'gpt-6.1-terra')?.name, 'GPT-6.1 Terra')
    const stored = JSON.parse(await readFile(join(stateDir, 'models.json'), 'utf8')) as { names: Record<string, string> }
    assert.deepEqual(stored.names, {})
  })

  it('treats a blank name as clearing the override', async () => {
    const stateDir = await signedIn()
    const adapter = adapterFor(stateDir, await endpoint())
    await adapter.setModelName('gpt-6.1-terra', 'Terra 9')
    await adapter.setModelName('gpt-6.1-terra', '   ')

    const rows = await adapter.modelSwitches()
    assert.equal(rows.find(row => row.id === 'gpt-6.1-terra')?.name, 'GPT-6.1 Terra')
  })

  it('refuses a name the same way it refuses a switch on an unknown model', async () => {
    const stateDir = await signedIn()
    const adapter = adapterFor(stateDir, await endpoint())
    await adapter.listModels()

    await assert.rejects(
      adapter.setModelName('gpt-4', 'Whatever'),
      (error: unknown) => isCodedError(error) && error.code === 'chatgpt_unknown_model',
    )
    await assert.rejects(
      adapter.setModelName('gpt-6-astra', 'x'.repeat(201)),
      (error: unknown) => isCodedError(error) && error.code === 'chatgpt_invalid_model_switch',
    )
    assert.deepEqual(await readModelOverrides(stateDir), { disabled: [], names: {} })
  })

  it('resetModels restores every switch and name at once', async () => {
    const stateDir = await signedIn()
    const url = await endpoint()
    const first = adapterFor(stateDir, url)
    await first.setModelDisabled('gpt-6-astra', true)
    await first.setModelName('gpt-6.1-terra', 'Terra 9')

    const announced: string[] = []
    const second = new ChatGptAdapter({
      auth: new ChatGptAuth({ stateDir, agentNameHint: 'DeepSeek Harness' }),
      baseUrl: url,
      stateDir,
      includeUnlisted: false,
      onModelSwitchesChanged: () => { announced.push('changed') },
    })
    const rows = await second.resetModels()

    assert.deepEqual(rows.map(row => [row.id, row.name, row.disabled] as const), [
      ['gpt-6-astra', 'GPT-6 Astra', false],
      ['gpt-6.1-terra', 'GPT-6.1 Terra', false],
    ])
    assert.deepEqual(announced, ['changed'])
    assert.deepEqual(await readModelOverrides(stateDir), { disabled: [], names: {} })
  })

  it('keeps switches and names in one file without losing either', async () => {
    const stateDir = await signedIn()
    const adapter = adapterFor(stateDir, await endpoint())
    await adapter.setModelDisabled('gpt-6-astra', true)
    // A name write must carry the switch with it: the file is whole-file.
    await adapter.setModelName('gpt-6.1-terra', 'Terra 9')

    const rows = await adapter.modelSwitches()
    assert.equal(rows.find(row => row.id === 'gpt-6-astra')?.disabled, true)
    assert.equal(rows.find(row => row.id === 'gpt-6.1-terra')?.name, 'Terra 9')
  })
})
