import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { verifyOpenAiIdTokenSignature } from '../src/auth/verify-id-token.ts'
import { validateIdToken } from '../src/auth/sign-in.ts'
import { idTokenClaims, jwt } from './helpers.ts'

describe('OpenAI ID-token signature verification', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'key-test', alg: 'RS256' }
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-test' })).toString('base64url')
  function token(payload: string): string {
    const encoded = Buffer.from(payload).toString('base64url')
    const body = `${header}.${encoded}`
    return `${body}.${sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url')}`
  }
  const keys = async () => [jwk]
  it('accepts valid RSA-SHA256 signatures', async () => {
    await verifyOpenAiIdTokenSignature(token('{"sub":"test"}'), keys)
  })
  it('rejects JWT payload tampering', async () => {
    const original = token('{"sub":"test"}').split('.')
    const forged = `${original[0]}.${Buffer.from('{"sub":"other"}').toString('base64url')}.${original[2]}`
    await assert.rejects(verifyOpenAiIdTokenSignature(forged, keys), /signature is invalid/)
  })
  it('rejects the none algorithm and unrelated JWKS keys', async () => {
    const unsigned = `${Buffer.from('{"alg":"none","kid":"key-test"}').toString('base64url')}.e30.e30`
    await assert.rejects(verifyOpenAiIdTokenSignature(unsigned, keys), /unsupported signature algorithm/)
    await assert.rejects(verifyOpenAiIdTokenSignature(token('{"sub":"test"}'), async () => []), /not uniquely found/)
  })
})

it('requires issued-at and expiration claims before trusting even signed-in identity', () => {
  const claims = idTokenClaims({ clientId: 'oaiapp_test', nonce: 'nonce' })
  const missingIat = { ...claims }
  delete missingIat['iat']
  assert.throws(() => validateIdToken(jwt(missingIat), 'oaiapp_test', 'nonce'), /issued-at/)
  const missingExp = { ...claims }
  delete missingExp['exp']
  assert.throws(() => validateIdToken(jwt(missingExp), 'oaiapp_test', 'nonce'), /expired/)
})
