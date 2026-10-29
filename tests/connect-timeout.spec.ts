import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { streamTurn } from '../src/api/client.ts'

it('aborts a request whose server never sends response headers', async () => {
  const server = createServer(() => { /* leave the request pending */ })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  if (addr === null || typeof addr === 'string') throw new Error('missing server port')
  try {
    await assert.rejects(async () => {
      for await (const _ of streamTurn({
        accessToken: 'test',
        request: { model: 'test', messages: [{ role: 'user', content: 'ping' }] },
        endpoints: { baseUrl: `http://127.0.0.1:${addr.port}` },
        idleTimeoutMs: 50,
      })) { /* no events expected */ }
    }, (e: unknown) => e instanceof Error && 'code' in e && e.code === 'TIMEOUT')
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()))
  }
})

it('also times out an error response whose body stalls after headers', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(503, { 'content-type': 'application/json' })
    response.flushHeaders()
    response.write('{')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  if (addr === null || typeof addr === 'string') throw new Error('missing server port')
  try {
    await assert.rejects(streamTurn({ accessToken: 'test',
      request: { model: 'test', messages: [] },
      endpoints: { baseUrl: `http://127.0.0.1:${addr.port}` }, idleTimeoutMs: 50,
    }).next(), (e: unknown) => e instanceof Error && 'code' in e && e.code === 'TIMEOUT')
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()))
  }
})
