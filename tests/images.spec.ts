import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { requestOfWithImages } from '../src/convert/harness.ts'
import { toNeutralRequest } from '../src/adapter.ts'
import { toResponsesBody } from '../src/convert/request.ts'

function options(offloaded = false): GenerateOptions {
  return { provider: 'chatgpt', model: 'vision',
    messages: [{ id: 'image-test', source: { kind: 'user' }, role: 'user', content: [
      { type: 'text', text: 'inspect' },
      { type: 'image', attachment: { attachmentId: 'test', mediaType: 'image/png', bytes: 3, width: 1, height: 1 }, ...offloaded ? { offloaded: true as const } : {} },
      { type: 'text', text: 'done' },
    ] }] } as unknown as GenerateOptions
}
describe('DSH attachment projection', () => {
  it('sends actual image bytes to Responses in their original position', async () => {
    const request = await requestOfWithImages(options(), async () => ({
      data: Uint8Array.from([1, 2, 3]), ref: { mediaType: 'image/png' },
    }))
    const body = toResponsesBody(toNeutralRequest(request))
    assert.deepEqual(body.input[0]?.content, [
      { type: 'input_text', text: 'inspect' },
      { type: 'input_image', image_url: 'data:image/png;base64,AQID' },
      { type: 'input_text', text: 'done' },
    ])
  })
  it('rejects retained images when no attachment service exists', async () => {
    await assert.rejects(requestOfWithImages(options()), /needs the DSH attachment store/)
  })
  it('respects host image offloading instead of reintroducing removed bytes', async () => {
    let reads = 0
    const request = await requestOfWithImages(options(true), async () => {
      reads += 1
      throw new Error('offloaded image should not be read')
    })
    assert.equal(reads, 0)
    assert.equal(request.messages[0]?.content[1]?.type, 'text')
  })
})
