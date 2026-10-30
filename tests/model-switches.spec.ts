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
import { contextWindowOptions } from '../src/models/context.ts'
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
      ['gpt-6-astra', 'GPT 6 Astra'],
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
      [['gpt-6-astra', 'GPT 6 Astra', 'GPT 6 Astra'], ['gpt-6.1-terra', 'GPT 6.1 Terra', 'Terra 9']],
    )
  })

  it('restores the roster name when the override is cleared', async () => {
    const stateDir = await signedIn()
    const url = await endpoint()
    const adapter = adapterFor(stateDir, url)
    await adapter.setModelName('gpt-6.1-terra', 'Terra 9')
    await adapter.setModelName('gpt-6.1-terra', undefined)

    const rows = await adapter.modelSwitches()
    assert.equal(rows.find(row => row.id === 'gpt-6.1-terra')?.name, 'GPT 6.1 Terra')
    const stored = JSON.parse(await readFile(join(stateDir, 'models.json'), 'utf8')) as { names: Record<string, string> }
    assert.deepEqual(stored.names, {})
  })

  it('treats a blank name as clearing the override', async () => {
    const stateDir = await signedIn()
    const adapter = adapterFor(stateDir, await endpoint())
    await adapter.setModelName('gpt-6.1-terra', 'Terra 9')
    await adapter.setModelName('gpt-6.1-terra', '   ')

    const rows = await adapter.modelSwitches()
    assert.equal(rows.find(row => row.id === 'gpt-6.1-terra')?.name, 'GPT 6.1 Terra')
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
      ['gpt-6-astra', 'GPT 6 Astra', false],
      ['gpt-6.1-terra', 'GPT 6.1 Terra', false],
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

describe('model context windows', () => {
  it('uses name defaults consistently in the page, offering and resolved model', async () => {
    const adapter = adapterFor(await signedIn(), await endpoint())
    const rows = await adapter.modelSwitches()
    assert.deepEqual(rows.map(row => [row.id, row.contextWindow]), [
      ['gpt-6-astra', 1000000], ['gpt-6.1-terra', 500000],
    ])
    for (const row of rows) {
      assert.equal((await adapter.listModels()).find(model => model.id === row.id)?.contextWindow, row.contextWindow)
      assert.equal((await adapter.resolveModel('chatgpt', row.id)).context.contextWindow, row.contextWindow)
    }
    // Editable names must not change the stable model-ID default.
    await adapter.setModelName('gpt-6.1-terra', 'Astra')
    assert.equal((await adapter.resolveModel('chatgpt', 'gpt-6.1-terra')).context.contextWindow, 500000)
  })

  it('persists every choice across adapters and catalog refreshes without clamping', async () => {
    const stateDir = await signedIn()
    const url = await endpoint()
    let notifications = 0
    const first = new ChatGptAdapter({
      auth: new ChatGptAuth({ stateDir, agentNameHint: 'DeepSeek Harness' }), stateDir, baseUrl: url, includeUnlisted: false,
      onModelSwitchesChanged: () => { notifications++ },
    })
    const second = adapterFor(stateDir, url)
    for (const value of [1000000, 800000, 500000, 300000]) {
      const rows = await first.setModelContextWindow('gpt-6-astra', value)
      assert.equal(rows.find(row => row.id === 'gpt-6-astra')?.contextWindow, value)
      second.forgetListing()
      assert.equal((await second.resolveModel('chatgpt', 'gpt-6-astra')).context.contextWindow, value)
      assert.equal((await second.listModels()).find(row => row.id === 'gpt-6-astra')?.contextWindow, value)
    }
    assert.equal(notifications, 4)
  })

  it('keeps concurrent context, name and switch writes, then resets them together', async () => {
    const stateDir = await signedIn()
    const url = await endpoint()
    const first = adapterFor(stateDir, url)
    const second = adapterFor(stateDir, url)
    await Promise.all([
      first.setModelContextWindow('gpt-6-astra', 800000),
      second.setModelName('gpt-6-astra', 'Custom'),
      second.setModelDisabled('gpt-6-astra', true),
    ])
    const row = (await first.modelSwitches()).find(row => row.id === 'gpt-6-astra')
    assert.equal(row?.contextWindow, 800000)
    assert.equal(row?.name, 'Custom')
    assert.equal(row?.disabled, true)
    assert.equal((await first.resolveModel('chatgpt', 'gpt-6-astra')).context.contextWindow, 800000)
    await first.resetModels()
    assert.deepEqual(await readModelOverrides(stateDir), { disabled: [], names: {} })
    assert.equal((await second.resolveModel('chatgpt', 'gpt-6-astra')).context.contextWindow, 1000000)
  })

  it('rejects non-choice values and unknown models without changing the file', async () => {
    const stateDir = await signedIn()
    const adapter = adapterFor(stateDir, await endpoint())
    await adapter.setModelContextWindow('gpt-6-astra', 800000)
    const before = await readFile(join(stateDir, 'models.json'), 'utf8')
    for (const value of [0, -1, 1024, 800001, 500000.5, NaN, Infinity, '800000', null]) {
      await assert.rejects(adapter.setModelContextWindow('gpt-6-astra', value as number),
        error => isCodedError(error) && error.code === 'chatgpt_invalid_model_switch')
    }
    await assert.rejects(adapter.setModelContextWindow('missing', 500000),
      error => isCodedError(error) && error.code === 'chatgpt_unknown_model')
    assert.equal(await readFile(join(stateDir, 'models.json'), 'utf8'), before)
  })

  it('validates persisted context choices even in a legacy file without names', async () => {
    const stateDir = await signedIn()
    for (const contextWindows of [{ model: 272000 }, [], null, { model: '800000' }]) {
      await writeFile(join(stateDir, 'models.json'), JSON.stringify({ disabled: [], contextWindows }))
      await assert.rejects(readModelOverrides(stateDir), /models.json/)
    }
    await writeFile(join(stateDir, 'models.json'), JSON.stringify({ disabled: [], contextWindows: { model: 800000 } }))
    assert.deepEqual(await readModelOverrides(stateDir), { disabled: [], names: {}, contextWindows: { model: 800000 } })
  })
})


describe('configured context values on the model page', () => {
  it('shows custom config until a fixed selection overrides it, and reset restores config', async () => {
    const stateDir = await signedIn()
    const modelLimits = { 'gpt-6-astra': 750000 }
    const adapter = new ChatGptAdapter({
      auth: new ChatGptAuth({ stateDir, agentNameHint: 'DeepSeek Harness' }),
      stateDir, baseUrl: await endpoint(), includeUnlisted: false,
      contextWindowLimit: 650000, modelContextWindowLimits: () => modelLimits,
    })
    let rows = await adapter.modelSwitches()
    assert.equal(rows[0]?.contextWindow, 750000)
    assert.equal(rows[0]?.defaultContextWindow, 750000)
    assert.equal(rows[1]?.contextWindow, 650000)
    await adapter.setModelContextWindow('gpt-6-astra', 800000)
    modelLimits['gpt-6-astra'] = 720000
    assert.equal((await adapter.resolveModel('chatgpt', 'gpt-6-astra')).context.contextWindow, 800000)
    rows = await adapter.modelSwitches()
    assert.equal(rows[0]?.contextWindow, 800000)
    assert.equal(rows[0]?.defaultContextWindow, 720000)
    await adapter.resetModels()
    assert.equal((await adapter.resolveModel('chatgpt', 'gpt-6-astra')).context.contextWindow, 720000)
  })

  it('sorts arbitrary current config values into descending disabled options without duplicates', () => {
    for (const current of [2000000, 900000, 750000, 400000, 1024]) {
      const options = contextWindowOptions(current)
      assert.deepEqual(options.map(option => option.value), [1000000, 800000, 500000, 300000, current].sort((a,b) => b-a))
      assert.deepEqual(options.filter(option => option.disabled), [{value: current, label: String(current), disabled: true}])
    }
    const fixed = contextWindowOptions(800000)
    assert.equal(fixed.length, 4)
    assert.ok(fixed.every(option => !option.disabled))
  })
})


it('uses the formatted slug as the placeholder default without rewriting a saved display name', async () => {
  const stateDir = await signedIn()
  const url = await endpoint()
  const adapter = adapterFor(stateDir, url)
  let row = (await adapter.modelSwitches()).find(row => row.id === 'gpt-6-astra')
  assert.equal(row?.defaultName, 'GPT 6 Astra')
  assert.equal(row?.name, 'GPT 6 Astra')
  await adapter.setModelName('gpt-6-astra', 'My Astra')
  const restored = adapterFor(stateDir, url)
  row = (await restored.modelSwitches()).find(row => row.id === 'gpt-6-astra')
  assert.equal(row?.defaultName, 'GPT 6 Astra')
  assert.equal(row?.name, 'My Astra')
  assert.equal((await restored.listModels()).find(row => row.id === 'gpt-6-astra')?.name, 'My Astra')
  await restored.setModelName('gpt-6-astra', undefined)
  assert.equal((await restored.modelSwitches()).find(row => row.id === 'gpt-6-astra')?.name, 'GPT 6 Astra')
})
