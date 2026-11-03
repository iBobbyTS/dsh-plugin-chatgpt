/** Codex-only quota credentials. Independent of ChatGPT direct-token authorization. */
import { constants, openSync, closeSync, readFileSync, readSync, fstatSync, lstatSync, realpathSync, mkdirSync, writeFileSync, fsyncSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, join, isAbsolute, resolve } from 'node:path'
import { homedir } from 'node:os'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'

const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
const TOKEN_URL = 'https://auth.openai.com/oauth/token'
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const MAX_BYTES = 1024 * 1024
const TIMEOUT_MS = 15_000

type Json = Record<string, unknown>
export type QuotaStatus = 'ok' | 'not-configured' | 'unauthorized' | 'rate-limited' | 'unavailable' | 'invalid-response'
export interface CodexWindow { id: string, label?: string, usedPercent: number, windowSeconds?: number, resetsAt?: number }
export interface CodexSnapshot {
  observedAt: number
  accounts: { id: string, label?: string, plan?: string, status: QuotaStatus, reason?: string, retryAt?: number, windows: CodexWindow[] }[]
}
/** Structural implementation of Usage Stats quota protocol v1; no runtime dependency. */
export interface QuotaSource {
  protocolVersion: 1
  id: string
  displayName: string
  providerRoutes: string[]
  revision(): string
  read(options: { signal: AbortSignal }): Promise<CodexSnapshot>
}
export interface QuotaRegistry { protocolVersion: 1, register(source: QuotaSource): () => void }
export interface CodexQuotaView {
  path?: string
  defaultPath: string
  allowRefresh: boolean
  label: string
  snapshot?: CodexSnapshot
  error?: string
}
interface Selection { path?: string, allowRefresh: boolean, label: string, salt: string }
interface Document { raw: string, hash: string, json: Json, tokens: Json, accessToken: string, refreshToken?: string, accountId?: string, identity: string }
class QuotaError extends Error {
  readonly status: QuotaStatus
  readonly reason: string
  constructor(status: QuotaStatus, reason: string) { super(reason); this.status = status; this.reason = reason }
}
const object = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const string = (value: unknown): string | undefined => typeof value === 'string' && value.length > 0 ? value : undefined
const hash = (value: string): string => createHash('sha256').update(value).digest('hex')
const safeLabel = (value: unknown): string => typeof value === 'string' && value.length <= 80 && !/[\x00-\x1f]/.test(value) ? value.trim() : ''
function jwt(token: unknown): Json {
  try {
    const value: unknown = JSON.parse(Buffer.from(String(token).split('.')[1] ?? '', 'base64url').toString())
    return object(value) ? value : {}
  } catch { return {} }
}
function readDocument(path: string): Document {
  let fd: number | undefined
  try {
    // Disallow aliases/symlink replacement and special files. Bound reads even if a writer grows the file.
    if (realpathSync(path) !== path || lstatSync(path).isSymbolicLink()) throw new Error('alias')
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES || (process.getuid && stat.uid !== process.getuid())) throw new Error('unsafe file')
    const bytes = Buffer.alloc(stat.size + 1)
    let length = 0
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null)
      if (count === 0) break
      length += count
    }
    if (length > stat.size) throw new Error('file changed during read')
    const raw = bytes.subarray(0, length).toString('utf8')
    let json: unknown
    try { json = JSON.parse(raw) } catch { throw new QuotaError('invalid-response', 'invalid-auth-file') }
    if (!object(json)) throw new QuotaError('invalid-response', 'invalid-auth-file')
    if (json['auth_mode'] !== 'chatgpt') throw new QuotaError('invalid-response', 'unsupported-auth-mode')
    const tokens = json['tokens']
    if (!object(tokens) || !string(tokens['access_token'])) throw new QuotaError('invalid-response', 'invalid-auth-file')
    const accessToken = tokens['access_token'] as string
    const claims = jwt(tokens['id_token'])
    const accessClaims = jwt(accessToken)
    const authClaims = accessClaims['https://api.openai.com/auth']
    const accountId = string(tokens['account_id']) ?? (object(authClaims) ? string(authClaims['chatgpt_account_id']) : undefined)
    const identity = accountId ?? string(claims['sub']) ?? string(accessClaims['sub'])
    // Without any identity claim, token changes invalidate caches rather than mixing anonymous accounts.
    return { raw, hash: hash(raw), json, tokens, accessToken,
      ...(string(tokens['refresh_token']) ? { refreshToken: tokens['refresh_token'] as string } : {}),
      ...(accountId ? { accountId } : {}), identity: identity ?? hash(accessToken) }
  } catch (error) {
    if (error instanceof QuotaError) throw error
    throw new QuotaError('unavailable', 'file-unavailable')
  } finally { if (fd !== undefined) closeSync(fd) }
}

/** Same-filesystem replacement, private temporary file, durable data before rename. */
function atomicWrite(path: string, data: string, expectedHash?: string): void {
  const parent = dirname(path)
  const temporary = join(parent, `.dsh-codex-${randomUUID()}.tmp`)
  let fd: number | undefined
  try {
    fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    writeFileSync(fd, data, 'utf8')
    fsyncSync(fd)
    closeSync(fd); fd = undefined
    if (realpathSync(parent) !== parent) throw new QuotaError('unavailable', 'credential-conflict')
    if (expectedHash !== undefined && readDocument(path).hash !== expectedHash) throw new QuotaError('unavailable', 'credential-conflict')
    renameSync(temporary, path)
    const directory = openSync(parent, constants.O_RDONLY)
    try { fsyncSync(directory) } finally { closeSync(directory) }
  } catch (error) {
    if (error instanceof QuotaError) throw error
    throw new QuotaError('unavailable', 'persistence-failed')
  } finally {
    if (fd !== undefined) closeSync(fd)
    try { unlinkSync(temporary) } catch { /* absent after successful rename */ }
  }
}

interface Pending { before: string, after: string, data: string }
// Process-wide: multiple plugin instances must not independently spend the same token.
const rotations = new Map<string, Promise<Document>>()
const pendingWrites = new Map<string, Pending>()
const refused = new Map<string, string>()
// Only recover locks whose inode this process acquired and has already released.
// Never age-delete an arbitrary sidecar: another process may still own it.
const releasedLocks = new Map<string, { ino: number, dev: number }>()
function recoverReleasedLock(path: string): void {
  const owned = releasedLocks.get(path)
  if (!owned) return
  try {
    const current = lstatSync(path)
    if (!current.isSymbolicLink() && current.ino === owned.ino && current.dev === owned.dev) unlinkSync(path)
    releasedLocks.delete(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') releasedLocks.delete(path)
  }
}

async function jsonResponse(response: Response): Promise<Json> {
  const length = Number(response.headers.get('content-length'))
  if (length > MAX_BYTES) throw new QuotaError('invalid-response', 'invalid-auth-file')
  if (!response.body) throw new QuotaError('invalid-response', 'invalid-auth-file')
  const reader = response.body.getReader()
  let bytes = 0
  const chunks: Uint8Array[] = []
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > MAX_BYTES) throw new QuotaError('invalid-response', 'invalid-auth-file')
      chunks.push(part.value)
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!object(value)) throw new Error('shape')
    return value
  } catch (error) {
    if (error instanceof QuotaError) throw error
    throw new QuotaError('invalid-response', 'invalid-auth-file')
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

function persistPending(path: string): Document | undefined {
  const pending = pendingWrites.get(path)
  if (!pending) return undefined
  const latest = readDocument(path)
  // A rename may already have succeeded while directory fsync failed.
  if (latest.hash === pending.after) { pendingWrites.delete(path); return latest }
  if (latest.hash !== pending.before) throw new QuotaError('unavailable', 'credential-conflict')
  atomicWrite(path, pending.data, pending.before)
  pendingWrites.delete(path)
  return readDocument(path)
}

async function rotate(path: string, original: Document, fetchImpl: typeof fetch, signal: AbortSignal): Promise<Document> {
  const existing = rotations.get(path)
  if (existing) return existing
  const task = (async () => {
    const lockPath = `${path}.dsh-refresh.lock`
    let lock: number | undefined
    const deadline = Date.now() + 20_000
    try {
      for (;;) {
        signal.throwIfAborted()
        recoverReleasedLock(lockPath)
        try { lock = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); break } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new QuotaError('unavailable', 'file-unavailable')
          if (Date.now() >= deadline) throw new QuotaError('unavailable', 'refresh-busy')
          await new Promise<void>(resolve => setTimeout(resolve, 50))
        }
      }
      const persisted = persistPending(path)
      if (persisted) return persisted
      const current = readDocument(path)
      if (current.hash !== original.hash) return current
      if (!current.refreshToken || refused.get(path) === hash(current.refreshToken)) throw new QuotaError('unauthorized', 'reauth-required')
      signal.throwIfAborted()
      // Once dispatched, finish persisting any rotation even if the quota caller cancels.
      // A consumer cancellation must not discard an already-consumed refresh token.
      const response = await fetchImpl(TOKEN_URL, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: current.refreshToken, client_id: CLIENT_ID })
      }).catch(() => {
        // Transport failure is ambiguous: the server may have rotated already.
        refused.set(path, hash(current.refreshToken!))
        throw new QuotaError('unavailable', 'reauth-required')
      })
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        const latest = readDocument(path)
        if (latest.hash !== current.hash) return latest
        if ([400, 401, 403].includes(response.status)) { refused.set(path, hash(current.refreshToken)); throw new QuotaError('unauthorized', 'reauth-required') }
        throw new QuotaError(response.status === 429 ? 'rate-limited' : 'unavailable', 'reauth-required')
      }
      let body: Json
      try {
        body = await jsonResponse(response)
        if (!string(body['access_token']) || (body['refresh_token'] !== undefined && !string(body['refresh_token'])) || (body['id_token'] !== undefined && !string(body['id_token']))) throw new QuotaError('invalid-response', 'invalid-auth-file')
      } catch (error) {
        // A successful HTTP exchange may already have consumed the old token.
        // An unreadable rotation is not permission to submit it again.
        refused.set(path, hash(current.refreshToken))
        throw error
      }
      const tokens = { ...current.tokens, access_token: body['access_token'],
        ...(string(body['refresh_token']) ? { refresh_token: body['refresh_token'] } : {}),
        ...(string(body['id_token']) ? { id_token: body['id_token'] } : {}) }
      const data = `${JSON.stringify({ ...current.json, tokens, last_refresh: new Date().toISOString() }, null, 2)}\n`
      pendingWrites.set(path, { before: current.hash, after: hash(data), data })
      return persistPending(path)!
    } finally {
      if (lock !== undefined) {
        const stat = fstatSync(lock)
        closeSync(lock)
        releasedLocks.set(lockPath, { ino: stat.ino, dev: stat.dev })
        recoverReleasedLock(lockPath)
      }
    }
  })()
  rotations.set(path, task)
  try { return await task } finally { if (rotations.get(path) === task) rotations.delete(path) }
}

export function parseCodexQuota(body: Json, at: number): CodexWindow[] {
  const limit = body['rate_limit']
  if (!object(limit)) throw new QuotaError('invalid-response', 'invalid-auth-file')
  const windows: CodexWindow[] = []
  for (const [field, id] of [['primary_window', 'primary'], ['secondary_window', 'secondary']] as const) {
    const value = limit[field]
    if (value === undefined || value === null) continue
    if (!object(value)) throw new QuotaError('invalid-response', 'invalid-auth-file')
    const percent = value['used_percent']
    if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) throw new QuotaError('invalid-response', 'invalid-auth-file')
    const seconds = value['limit_window_seconds']
    const reset = value['reset_at']
    const after = value['reset_after_seconds']
    const validSeconds = typeof seconds === 'number' && Number.isSafeInteger(seconds) && seconds > 0
    let resetsAt: number | undefined
    if (reset !== undefined && reset !== null) {
      if (typeof reset !== 'number' || !Number.isSafeInteger(reset) || reset < 0 || reset > 8_640_000_000_000) throw new QuotaError('invalid-response', 'invalid-auth-file')
      resetsAt = reset * 1000
    } else if (after !== undefined && after !== null) {
      if (typeof after !== 'number' || !Number.isSafeInteger(after) || after < 0 || after > 366 * 86400) throw new QuotaError('invalid-response', 'invalid-auth-file')
      resetsAt = at + after * 1000
    }
    if (seconds !== undefined && !validSeconds) throw new QuotaError('invalid-response', 'invalid-auth-file')
    windows.push({ id, usedPercent: percent, label: validSeconds ? `${seconds / 3600}h` : id === 'primary' ? 'Primary' : 'Secondary',
      ...(validSeconds ? { windowSeconds: seconds as number } : {}), ...(resetsAt === undefined ? {} : { resetsAt }) })
  }
  if (!windows.length) throw new QuotaError('invalid-response', 'invalid-auth-file')
  return windows
}

/** Shared registration path used by the plugin and real-Cordis lifecycle tests. */
export function registerCodexQuota(ctx: Context, quota: CodexQuota, route: string): void {
  ctx.effect(() => () => quota.dispose())
  ctx.inject(['usageQuota'], child => {
    const registry = child.get('usageQuota') as QuotaRegistry | undefined
    if (registry?.protocolVersion === 1) child.effect(() => registry.register(quota.source(route)))
  })
}

export class CodexQuota {
  private selection: Selection
  private readonly selectionPath: string
  private readonly controller = new AbortController()
  private selectionController = new AbortController()
  private last: CodexSnapshot | undefined
  private lastRevision: string | undefined
  private lastError: string | undefined
  private epoch = 0
  private flight: { epoch: number, promise: Promise<CodexSnapshot> } | undefined
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  constructor(stateDir: string, fetchImpl: typeof fetch = fetch, now: () => number = Date.now) {
    this.fetchImpl = fetchImpl; this.now = now
    this.selectionPath = join(stateDir, 'codex-quota.json')
    this.selection = { allowRefresh: false, label: '', salt: randomUUID() }
    try {
      const raw: unknown = JSON.parse(readFileSync(this.selectionPath, 'utf8'))
      if (object(raw) && typeof raw['salt'] === 'string') this.selection = {
        salt: raw['salt'], allowRefresh: raw['allowRefresh'] === true, label: safeLabel(raw['label']),
        ...(typeof raw['path'] === 'string' && isAbsolute(raw['path']) ? { path: raw['path'] } : {}) }
    } catch { /* no selection, or corrupt state: require explicit selection again */ }
  }
  view(): CodexQuotaView {
    const snapshot = this.lastRevision === this.revision() ? this.last : undefined
    return { ...(this.selection.path ? { path: this.selection.path } : {}), defaultPath: join(homedir(), '.codex', 'auth.json'),
      allowRefresh: this.selection.allowRefresh, label: this.selection.label,
      ...(snapshot ? { snapshot } : {}), ...(this.lastError ? { error: this.lastError } : {}) }
  }
  /** Human-only authorization: selecting also explicitly grants optional refresh/writeback. */
  select(path: string, allowRefresh: boolean, label: string): CodexQuotaView {
    if (typeof path !== 'string' || typeof allowRefresh !== 'boolean' || typeof label !== 'string') throw new Error('invalid-selection')
    const expanded = path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
    if (!isAbsolute(expanded)) throw new Error('absolute-host-path-required')
    const target = resolve(expanded)
    readDocument(target)
    if (this.selection.path && pendingWrites.has(this.selection.path)) throw new Error('persistence-failed')
    if (this.selection.path && rotations.has(this.selection.path)) throw new Error('refresh-busy')
    const next = { path: target, allowRefresh, label: safeLabel(label), salt: this.selection.salt }
    this.save(next)
    this.selectionController.abort(); this.selectionController = new AbortController()
    this.epoch += 1; this.last = undefined; this.lastError = undefined
    return this.view()
  }
  clear(): CodexQuotaView {
    if (this.selection.path && (pendingWrites.has(this.selection.path) || rotations.has(this.selection.path))) throw new Error('refresh-busy')
    this.save({ allowRefresh: false, label: '', salt: this.selection.salt })
    this.selectionController.abort(); this.selectionController = new AbortController()
    this.epoch += 1; this.last = undefined; this.lastError = undefined
    return this.view()
  }
  private save(next: Selection): void {
    mkdirSync(dirname(this.selectionPath), { recursive: true, mode: 0o700 })
    atomicWrite(this.selectionPath, `${JSON.stringify(next)}\n`)
    this.selection = next
  }
  revision(): string {
    const selection = this.selection
    let identity = 'unconfigured'
    if (selection.path) {
      try { identity = readDocument(selection.path).identity } catch { identity = 'unreadable' }
    }
    return createHmac('sha256', selection.salt).update(JSON.stringify({ ...selection, identity, epoch: this.epoch })).digest('hex')
  }
  source(route: string): QuotaSource {
    return { protocolVersion: 1, id: `${route}.codex`, displayName: 'Codex quota (independent monitoring account)', providerRoutes: [route],
      revision: () => this.revision(), read: options => this.read(options) }
  }
  dispose(): void { this.controller.abort(); this.epoch += 1 }
  async read({ signal }: { signal: AbortSignal }): Promise<CodexSnapshot> {
    if (this.flight?.epoch === this.epoch) return this.flight.promise
    const epoch = this.epoch
    const revision = this.revision()
    const selection = { ...this.selection }
    const promise = this.query(selection, AbortSignal.any([signal, this.controller.signal, this.selectionController.signal])).then(snapshot => {
      signal.throwIfAborted()
      if (this.epoch !== epoch || this.revision() !== revision) throw new Error('quota-binding-changed')
      this.last = snapshot
      this.lastRevision = revision
      this.lastError = snapshot.accounts.find(account => account.reason)?.reason
      return snapshot
    })
    this.flight = { epoch, promise }
    try { return await promise } finally { if (this.flight?.promise === promise) this.flight = undefined }
  }
  async refresh(): Promise<CodexQuotaView> {
    const epoch = this.epoch
    try { await this.read({ signal: this.controller.signal }) } catch { if (this.epoch === epoch) this.lastError = 'quota-unavailable' }
    return this.view()
  }
  private async query(selection: Selection, signal: AbortSignal): Promise<CodexSnapshot> {
    signal.throwIfAborted()
    if (!selection.path) return { observedAt: this.now(), accounts: [] }
    let document: Document | undefined
    try {
      document = readDocument(selection.path)
      const pending = pendingWrites.get(selection.path)
      // A non-cooperating writer won the conflict. Validate its current credential
      // without refreshing it before relinquishing our uncommitted rotation.
      const externalConflict = pending !== undefined && document.hash !== pending.before && document.hash !== pending.after
      if (pending && !externalConflict) document = await rotate(selection.path, document, this.fetchImpl, signal)
      const expiry = jwt(document.accessToken)['exp']
      let refreshed = false
      if (!externalConflict && typeof expiry === 'number' && expiry * 1000 <= this.now() + 60_000 && selection.allowRefresh) {
        document = await rotate(selection.path, document, this.fetchImpl, signal)
        refreshed = true
      }
      const requestUsage = (current: Document) => this.fetchImpl(USAGE_URL, {
        method: 'GET', redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
        headers: { authorization: `Bearer ${current.accessToken}`, accept: 'application/json', 'user-agent': 'codex-cli', 'cache-control': 'no-cache',
          ...(current.accountId ? { 'ChatGPT-Account-Id': current.accountId } : {}) }
      })
      let response = await requestUsage(document)
      if (response.status === 401 && selection.allowRefresh && !refreshed && !externalConflict) {
        await response.body?.cancel().catch(() => {})
        document = await rotate(selection.path, document, this.fetchImpl, signal)
        response = await requestUsage(document)
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        throw new QuotaError(response.status === 401 || response.status === 403 ? 'unauthorized' : response.status === 429 ? 'rate-limited' : 'unavailable', response.status === 401 ? 'reauth-required' : 'quota-unavailable')
      }
      const body = await jsonResponse(response)
      const at = this.now()
      const windows = parseCodexQuota(body, at)
      if (externalConflict && pendingWrites.get(selection.path) === pending && readDocument(selection.path).hash === document.hash) pendingWrites.delete(selection.path)
      const plan = body['plan_type']
      return { observedAt: at, accounts: [{ id: this.accountId(selection, document.identity), label: selection.label || 'Codex（独立监控账号）',
        status: 'ok', ...(typeof plan === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(plan) && plan !== document.accessToken && plan !== document.refreshToken ? { plan } : {}), windows }] }
    } catch (error) {
      signal.throwIfAborted()
      const failure = error instanceof QuotaError ? error : new QuotaError('unavailable', 'quota-unavailable')
      return { observedAt: this.now(), accounts: [{ id: this.accountId(selection, document?.identity ?? 'unknown'), label: selection.label || 'Codex（独立监控账号）', status: failure.status, reason: failure.reason, windows: [] }] }
    }
  }
  private accountId(selection: Selection, identity: string): string { return `codex-${createHmac('sha256', selection.salt).update(identity).digest('hex').slice(0, 24)}` }
}
