/** Verify an OpenAI-issued OIDC ID token using issuer discovery and its JWKS. */
import { createPublicKey, verify as verifySignature } from 'node:crypto'

interface Jwk { kid?: string; alg?: string; kty?: string; [key: string]: unknown }

async function issuerKeys(): Promise<readonly Jwk[]> {
  const discovery = await fetch('https://auth.openai.com/.well-known/openid-configuration', {
    signal: AbortSignal.timeout(10_000),
  })
  if (!discovery.ok) throw new Error('OpenAI OIDC discovery failed')
  const metadata = await discovery.json() as { issuer?: string, jwks_uri?: string }
  if (metadata.issuer !== 'https://auth.openai.com' || typeof metadata.jwks_uri !== 'string') {
    throw new Error('OpenAI OIDC discovery returned an unexpected issuer or JWKS endpoint')
  }
  const jwksUri = new URL(metadata.jwks_uri)
  if (jwksUri.protocol !== 'https:' || jwksUri.hostname !== 'auth.openai.com') {
    throw new Error('OpenAI OIDC discovery returned an untrusted JWKS host')
  }
  const keysResponse = await fetch(jwksUri, { signal: AbortSignal.timeout(10_000) })
  if (!keysResponse.ok) throw new Error('OpenAI JWKS fetch failed')
  const jwks = await keysResponse.json() as { keys?: Jwk[] }
  if (!Array.isArray(jwks.keys)) throw new Error('OpenAI JWKS is missing its keys')
  return jwks.keys
}

/**
 * Require an issuer-signed token with a recognised asymmetric algorithm.
 * The callback separately validates audience, issuer, expiry, nonce, and subject.
 */
export async function verifyOpenAiIdTokenSignature(
  token: string,
  getKeys: () => Promise<readonly Jwk[]> = issuerKeys,
): Promise<void> {
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some(part => part.length === 0)) throw new Error('the ID token is not a signed JWT')
  let header: { alg?: string, kid?: string }
  try {
    header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8')) as typeof header
  } catch {
    throw new Error('the ID token has an invalid JWT header')
  }
  if (header.alg !== 'RS256' && header.alg !== 'ES256') {
    throw new Error('the ID token uses an unsupported signature algorithm')
  }
  if (typeof header.kid !== 'string' || header.kid.length === 0) {
    throw new Error('the ID token has no key identifier')
  }
  const keys = await getKeys()
  const matching = keys.filter(key => key.kid === header.kid
    && (key.alg === undefined || key.alg === header.alg)
    && key.kty === (header.alg === 'RS256' ? 'RSA' : 'EC'))
  if (matching.length !== 1) throw new Error('the ID token signing key was not uniquely found in OpenAI JWKS')
  let valid = false
  try {
    const key = createPublicKey({ key: matching[0] as JsonWebKey, format: 'jwk' })
    const signed = Buffer.from(`${parts[0]}.${parts[1]}`)
    const signature = Buffer.from(parts[2]!, 'base64url')
    valid = header.alg === 'RS256'
      ? verifySignature('RSA-SHA256', signed, key, signature)
      : verifySignature('sha256', signed, { key, dsaEncoding: 'ieee-p1363' }, signature)
  } catch {
    valid = false
  }
  if (!valid) throw new Error('the ID token signature is invalid')
}
