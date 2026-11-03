import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAutosave } from '../src/client/autosave.ts'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

test('autosave does not write on initialization; debounces and flushes the latest draft', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const writes: string[] = []
  const states: string[] = []
  const saver = createAutosave<string>(async value => { writes.push(value) }, state => states.push(state))
  assert.deepEqual(writes, [])
  saver.schedule('a'); t.mock.timers.tick(300)
  saver.schedule('ab'); t.mock.timers.tick(599)
  assert.deepEqual(writes, [])
  t.mock.timers.tick(1)
  await saver.flush()
  assert.deepEqual(writes, ['ab'])
  assert.equal(states.at(-1), 'saved')
  saver.schedule('abc')
  await saver.flush()
  t.mock.timers.tick(1000)
  assert.deepEqual(writes, ['ab', 'abc'])
})

test('autosave serializes requests and never marks an old write saved over a newer draft', async () => {
  const gate = deferred()
  const writes: string[] = [], states: string[] = []
  const saver = createAutosave<string>(async value => {
    writes.push(value)
    if (value === 'first') await gate.promise
  }, state => states.push(state))
  saver.schedule('first', true)
  saver.schedule('second', true)
  saver.schedule('latest', true)
  assert.deepEqual(writes, ['first'])
  const flushed = saver.flush()
  gate.resolve(); await flushed
  assert.deepEqual(writes, ['first', 'latest'])
  assert.equal(states.filter(state => state === 'saved').length, 1)
})

test('autosave reports failures without poisoning subsequent retry', async () => {
  let attempts = 0
  const states: string[] = []
  const saver = createAutosave<string>(async () => {
    if (++attempts === 1) throw new Error('write denied')
  }, state => states.push(state))
  saver.schedule('draft'); await saver.flush()
  assert.equal(states.at(-1), 'error')
  saver.schedule('draft'); await saver.flush()
  assert.equal(states.at(-1), 'saved')
  assert.equal(attempts, 2)
})

test('cancel discards unsent edits and waits for an already dispatched write', async () => {
  const gate = deferred(), writes: string[] = [], states: string[] = []
  const saver = createAutosave<string>(async value => { writes.push(value); await gate.promise }, state => states.push(state))
  saver.schedule('discard'); saver.cancel(); await saver.flush()
  assert.deepEqual(writes, [])
  saver.schedule('started', true)
  saver.schedule('discard-too'); saver.cancel()
  const done = saver.flush(); gate.resolve(); await done
  assert.deepEqual(writes, ['started'])
  assert.ok(!states.includes('saved'))
})
