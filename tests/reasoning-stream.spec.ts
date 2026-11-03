import { it } from 'node:test'
import assert from 'node:assert/strict'
import { BlockTranslator, type AdapterChunk } from '../src/convert/blocks.ts'
import { decodeEvent } from '../src/api/events.ts'
import { createReplay, replayOutput, type OutputItem, type ReplayBlock } from '../src/convert/replay.ts'
import { toNeutralRequest } from '../src/adapter.ts'
import { toResponsesBody } from '../src/convert/request.ts'

const context = { provider: 'chatgpt', model: 'gpt-6.1-sol', scope: 'test' }
const reasoning = (id: string, text: string): OutputItem => ({ type: 'reasoning', id,
  summary: text ? [{ type: 'summary_text', text }] : [], encrypted_content: `opaque-${id}` })
const answer: OutputItem = { type: 'message', id: 'msg', role: 'assistant', content: [{ type: 'output_text', text: 'Answer' }] }
function wire(translator: BlockTranslator, payload: object): AdapterChunk[] {
  const event = decodeEvent(JSON.stringify(payload))
  return event === undefined ? [] : translator.push(event)
}
function done(translator: BlockTranslator, index: number, item: OutputItem): AdapterChunk[] {
  return wire(translator, { type: 'response.output_item.done', output_index: index, item })
}
function delta(translator: BlockTranslator, index: number, text: string, summaryIndex = 0): AdapterChunk[] {
  return wire(translator, { type: 'response.reasoning_summary_text.delta', output_index: index, summary_index: summaryIndex, delta: text })
}

it('streams successive summaries into one open block and closes it before the answer starts', () => {
  const translator = new BlockTranslator(context)
  assert.deepEqual(delta(translator, 0, 'Look at '), [
    { type: 'block-start', index: 0, blockType: 'reasoning' },
    { type: 'reasoning-delta', index: 0, text: 'Look at ' },
  ])
  assert.deepEqual(delta(translator, 0, 'file'), [{ type: 'reasoning-delta', index: 0, text: 'file' }])
  assert.deepEqual(done(translator, 0, reasoning('rs1', 'Look at file')), [])
  assert.deepEqual(wire(translator, { type: 'response.reasoning_summary_text.done', text: 'Look at file' }), [])
  assert.deepEqual(wire(translator, { type: 'response.in_progress' }), [])
  assert.deepEqual(delta(translator, 1, 'Now I think'), [{ type: 'reasoning-delta', index: 0, text: '\nNow I think' }])
  assert.deepEqual(done(translator, 1, reasoning('rs2', 'Now I think')), [])
  assert.deepEqual(wire(translator, { type: 'response.output_item.added', output_index: 2, item: { ...answer, content: [] } }), [
    { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'Look at file\nNow I think' } },
    { type: 'block-start', index: 1, blockType: 'text' },
  ])
  assert.deepEqual(wire(translator, { type: 'response.output_text.delta', output_index: 2, delta: 'Answer' }), [
    { type: 'text-delta', index: 1, text: 'Answer' },
  ])
})

it('separates summary parts within an item without splitting token deltas', () => {
  const translator = new BlockTranslator(context)
  const chunks = [...delta(translator, 0, 'First'), ...delta(translator, 0, ' part'),
    ...delta(translator, 0, 'Second', 1), ...delta(translator, 0, ' part', 1)]
  assert.equal(chunks.filter(c => c.type === 'reasoning-delta').map(c => c.text).join(''), 'First part\n\nSecond part')
  assert.deepEqual(translator.endAll(), [{ type: 'block-end', index: 0, block: { type: 'reasoning', text: 'First part\n\nSecond part' } }])
})

it('matches streamed summary-part separators to the native completed item for replay', () => {
  const translator = new BlockTranslator(context)
  const item: OutputItem = { ...reasoning('rs1', ''), summary: [
    { type: 'summary_text', text: 'First' }, { type: 'summary_text', text: 'Second' },
  ] }
  const chunks = [...delta(translator, 0, 'First'), ...delta(translator, 0, 'Second', 1),
    ...done(translator, 0, item), ...done(translator, 1, answer),
    ...translator.push({ kind: 'completed', output: [item, answer] })]
  const content = chunks.filter(c => c.type === 'block-end').map(c => c.block)
  assert.deepEqual(content[0], { type: 'reasoning', text: 'First\n\nSecond' })
  const finish = chunks.find(c => c.type === 'finish')
  assert.ok(finish?.replayState)
  assert.deepEqual(replayOutput(finish.replayState, content, context), [item, answer])
})

it('closes the reasoning block before a tool and starts a new reasoning block after the tool', () => {
  const translator = new BlockTranslator(context)
  delta(translator, 0, 'Plan')
  done(translator, 0, reasoning('rs1', 'Plan'))
  assert.deepEqual(translator.push({ kind: 'toolCallStart', index: 1, callId: 'call', name: 'read' }), [
    { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'Plan' } },
    { type: 'block-start', index: 1, blockType: 'tool-call' },
  ])
  translator.push({ kind: 'toolCallEnd', index: 1, arguments: '{}' })
  assert.deepEqual(delta(translator, 2, 'Check'), [
    { type: 'block-start', index: 2, blockType: 'reasoning' },
    { type: 'reasoning-delta', index: 2, text: 'Check' },
  ])
})

it('waits for an interleaved earlier reasoning item before displaying later content', () => {
  const translator = new BlockTranslator(context)
  delta(translator, 0, 'First')
  assert.deepEqual(delta(translator, 1, 'Second'), [])
  done(translator, 1, reasoning('rs2', 'Second'))
  assert.deepEqual(done(translator, 2, answer), [])
  const chunks = done(translator, 0, reasoning('rs1', 'First complete'))
  assert.deepEqual(chunks.slice(0, 3), [
    { type: 'reasoning-delta', index: 0, text: ' complete\nSecond' },
    { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'First complete\nSecond' } },
    { type: 'block-start', index: 1, blockType: 'text' },
  ])
})

it('closes anonymous reasoning at a content transition without waiting for response completion', () => {
  for (const next of [{ kind: 'text' as const, delta: 'Answer' }, { kind: 'toolCallStart' as const, callId: 'c', name: 'read' }]) {
    const translator = new BlockTranslator()
    translator.push({ kind: 'reasoning', delta: 'Plan' })
    assert.deepEqual(translator.push(next)[0], { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'Plan' } })
  }
})

it('closes merged reasoning exactly once on failure, truncation, completion or stream interruption', () => {
  for (const terminal of [undefined, { kind: 'completed' as const }, { kind: 'incomplete' as const, reason: 'max_output_tokens' },
    { kind: 'failed' as const, code: 'server_error', message: 'lost', terminal: false }]) {
    const translator = new BlockTranslator(context)
    delta(translator, 0, 'First')
    done(translator, 0, reasoning('rs1', 'First'))
    delta(translator, 1, 'Second')
    const chunks = terminal === undefined ? translator.endAll() : translator.push(terminal)
    assert.deepEqual(chunks.filter(c => c.type === 'block-end'), [
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'First\nSecond' } },
    ])
    assert.deepEqual(translator.endAll(), [])
    if (terminal !== undefined) assert.equal(chunks.at(-1)?.type, 'finish')
  }
})

it('round-trips merged and empty reasoning items through JSON and the next public request', () => {
  const translator = new BlockTranslator(context)
  const output = [reasoning('rs1', 'First'), reasoning('empty', ''), reasoning('rs2', 'Second'), answer]
  const chunks = output.flatMap((item, index) => done(translator, index, item))
  chunks.push(...translator.push({ kind: 'completed', output }))
  const content = chunks.filter(c => c.type === 'block-end').map(c => c.block)
  assert.deepEqual(content, [{ type: 'reasoning', text: 'First\nSecond' }, { type: 'text', text: 'Answer' }])
  const finish = chunks.find(c => c.type === 'finish')
  assert.ok(finish?.replayState)
  assert.equal(finish.replayState.response.version, 2)
  const saved = JSON.parse(JSON.stringify(finish.replayState))
  assert.deepEqual(replayOutput(saved, content, context), output)
  const request = toNeutralRequest({ provider: context.provider, model: context.model,
    messages: [{ role: 'assistant', content, source: { kind: 'model', ...context, replayState: saved } }],
  }, context.scope)
  assert.deepEqual(toResponsesBody(request).input, output)
  assert.equal(replayOutput(saved, [{ type: 'reasoning', text: 'Edited' }, content[1]!], context), undefined)
  for (const mutate of [
    (value: typeof saved) => { value.response.itemBlocks.pop() },
    (value: typeof saved) => { value.response.itemBlocks[0].text = 'Changed' },
    (value: typeof saved) => { delete value.response.output[0].encrypted_content },
    (value: typeof saved) => { value.response.itemBlocks[0] = null },
  ]) {
    const invalid = structuredClone(saved)
    mutate(invalid)
    assert.equal(replayOutput(invalid, content, context), undefined)
  }
})

it('continues to read version 1 histories with separate consecutive reasoning blocks', () => {
  const output = [reasoning('rs1', 'First'), reasoning('rs2', 'Second'), answer]
  const blocks: ReplayBlock[] = [{ type: 'reasoning', text: 'First' }, { type: 'reasoning', text: 'Second' }, { type: 'text', text: 'Answer' }]
  // Build the legacy fingerprints using individually unmerged envelopes.
  const legacy = { response: { kind: 'chatgpt-responses', version: 1, ...context, blockCount: 3, output },
    blocks: output.flatMap((item, i) => createReplay(context, [item], [blocks[i]!])!.blocks) }
  assert.deepEqual(replayOutput(JSON.parse(JSON.stringify(legacy)), blocks, context), output)
})
