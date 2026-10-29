import { it } from 'node:test'
import assert from 'node:assert/strict'
import { readWithIdleTimeout } from '../src/api/client.ts'

it('converts an idle SSE connection into a DSH TIMEOUT error', async () => {
  const reader = new ReadableStream<Uint8Array>({ start() {} }).getReader()
  try {
    await assert.rejects(readWithIdleTimeout(reader, 10), (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === 'TIMEOUT')
  } finally {
    await reader.cancel()
  }
})
