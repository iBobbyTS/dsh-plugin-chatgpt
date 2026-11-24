/** Redacted, bounded Host-only evidence collected at the actual HTTP boundary. */
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, constants, fchmodSync, fstatSync, mkdirSync, openSync, renameSync, lstatSync, unlinkSync, writeSync } from 'node:fs'
import { join } from 'node:path'

const MAX_PREFIXES = 8192
const MAX_BASELINES = 32
const MAX_BYTES = 8 * 1024 * 1024
const BACKUPS = 3
const sha = (text: string): string => createHash('sha256').update(text).digest('hex')
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
function count(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 }
function identifier(value: unknown, kind: 'req' | 'resp'): Record<string, string> | null {
  if (typeof value !== 'string') return null
  const valid = new RegExp(`^${kind}_[a-zA-Z0-9_-]{1,160}$`).test(value)
    || kind === 'req' && /^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/.test(value)
  return { sha256: sha(value), ...valid ? { value } : {} }
}
const TYPES = new Set(['cache_hit', 'cache_miss', 'comparison_response_not_found', 'unavailable'])
const REASONS = new Set(['model_changed', 'prompt_cache_key_changed', 'service_tier_changed', 'tools_changed',
  'text_format_changed', 'reasoning_effort_changed', 'verbosity_changed', 'context_compacted', 'input_changed'])
const TIERS = new Set(['auto', 'default', 'flex', 'priority', 'scale'])
function cacheDiagnostic(value: unknown): Record<string, unknown> | null {
  const v = object(value)
  if (v === undefined) return null
  const result: Record<string, unknown> = {}
  for (const [key, allowed] of [['type', TYPES], ['reason', REASONS]] as const) {
    const field = v[key]
    if (typeof field === 'string') {
      if (allowed.has(field)) result[key] = field
      else result[`${key}_sha256`] = sha(field)
    }
  }
  for (const key of ['comparison_reusable_tokens', 'cache_missed_tokens']) {
    if (count(v[key]) || v[key] === null) result[key] = v[key]
  }
  return result
}
function usageOf(value: unknown): Record<string, number | null> | null {
  const v = object(value)
  if (v === undefined) return null
  const result: Record<string, number | null> = {}
  const fields = { input_tokens: v['input_tokens'], output_tokens: v['output_tokens'], total_tokens: v['total_tokens'],
    cached_tokens: object(v['input_tokens_details'])?.['cached_tokens'],
    cache_write_tokens: object(v['input_tokens_details'])?.['cache_write_tokens'],
    reasoning_tokens: object(v['output_tokens_details'])?.['reasoning_tokens'] }
  for (const [key, field] of Object.entries(fields)) if (count(field) || field === null) result[key] = field
  return result
}

export type DiagnosticOutcome = 'completed' | 'failed' | 'incomplete' | 'http_error' | 'transport_error'
  | 'aborted' | 'cancelled' | 'empty_stream' | 'stream_ended_early' | 'timeout'
export interface DiagnosticContext {
  callId: string
  attempt: number
  provider: string
  sessionId?: string
  purpose?: string
  authorizationScope?: string
  capabilityFallback: boolean
}
interface Fingerprint {
  attemptId: string
  sequence: number
  inputCount: number
  inputSha256: string
  prefixes: string[]
  settingsSha256: string
  toolsSha256: string
  reasoningSha256: string
  cacheKeySha256: string | null
}
export interface DiagnosticAttempt {
  response(response: Response): void
  payload(payload: string): void
  end(outcome: DiagnosticOutcome): void
}

/** No prompts, outputs, credentials, URLs, tool schemas, or arbitrary server strings reach the writer. */
export class RequestDiagnostics {
  private readonly file: string
  private readonly baselines = new Map<string, Fingerprint>()
  private sequence = 0
  private warned = false
  constructor(private readonly directory: string, private readonly enabled: () => boolean = () => true) {
    this.file = join(directory, 'request-diagnostics.jsonl')
  }

  private warn(): void {
    if (this.warned) return
    this.warned = true
    console.warn('chatgpt: redacted request diagnostics could not be written; inference continues')
  }

  private write(event: Record<string, unknown>): boolean {
    try {
      if (!this.enabled()) { this.baselines.clear(); return false }
      mkdirSync(this.directory, { recursive: true, mode: 0o700 })
      const line = Buffer.from(JSON.stringify({ version: 1, time: new Date().toISOString(), ...event }) + '\n')
      if (line.length > MAX_BYTES) return false
      let size = 0
      try {
        const file = lstatSync(this.file)
        if (!file.isFile()) throw new Error('diagnostics target is not a regular file')
        size = file.size
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      if (size + line.length > MAX_BYTES) {
        try { unlinkSync(`${this.file}.${BACKUPS}`) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
        for (let i = BACKUPS - 1; i >= 0; i--) {
          try { renameSync(i === 0 ? this.file : `${this.file}.${i}`, `${this.file}.${i + 1}`) }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
        }
      }
      const fd = openSync(this.file, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600)
      try {
        if (!fstatSync(fd).isFile()) throw new Error('diagnostics target is not a regular file')
        fchmodSync(fd, 0o600)
        let offset = 0
        while (offset < line.length) {
          const written = writeSync(fd, line, offset)
          if (written <= 0) throw new Error('diagnostics write made no progress')
          offset += written
        }
      } finally { closeSync(fd) }
      return true
    } catch { this.warn(); return false }
  }

  /** serializedBody and sessionHeader are the exact values passed to fetch, after every fallback. */
  begin(serializedBody: string, sessionHeader: string | undefined, endpoint: string, context: DiagnosticContext): DiagnosticAttempt | undefined {
    try {
      if (!this.enabled()) { this.baselines.clear(); return undefined }
      const body = object(JSON.parse(serializedBody))
      if (body === undefined || !Array.isArray(body['input'])) return undefined
      const input = body['input']
      const prefixes: string[] = []
      const hash = createHash('sha256').update('[')
      for (let i = 0; i < input.length; i++) {
        if (i > 0) hash.update(',')
        hash.update(JSON.stringify(input[i]))
        if (i < MAX_PREFIXES) prefixes.push(hash.copy().update(']').digest('hex'))
      }
      const { input: _input, tools, reasoning, prompt_cache_key: key, ...settings } = body
      const fingerprint: Fingerprint = { attemptId: randomUUID(), sequence: ++this.sequence, inputCount: input.length,
        inputSha256: hash.update(']').digest('hex'), prefixes,
        toolsSha256: sha(JSON.stringify(tools ?? null)), reasoningSha256: sha(JSON.stringify(reasoning ?? null)),
        settingsSha256: sha(JSON.stringify(settings)), cacheKeySha256: typeof key === 'string' ? sha(key) : null }
      const sessionHash = context.sessionId === undefined ? null : sha(context.sessionId)
      const providerHash = sha(context.provider)
      const purpose = context.purpose ?? 'agent'
      const purposeGroup = purpose === 'compaction' ? 'agent' : purpose
      const scopeHash = context.authorizationScope === undefined ? null : sha(context.authorizationScope)
      const group = sessionHash === null || scopeHash === null ? undefined : JSON.stringify([sessionHash, scopeHash, providerHash, purposeGroup])
      const previous = group === undefined ? undefined : this.baselines.get(group)
      let matching = 0
      while (previous !== undefined && matching < previous.prefixes.length && matching < prefixes.length
        && previous.prefixes[matching] === prefixes[matching]) matching++
      const previousInputPreserved = previous === undefined ? null : previous.inputCount > MAX_PREFIXES ? null
        : matching === previous.inputCount
      const id = { callId: context.callId, attempt: context.attempt, attemptId: fingerprint.attemptId }
      const recorded = this.write({ ...id, phase: 'request', sessionId: context.sessionId !== undefined
        && /^(?:session-)?[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(context.sessionId) ? context.sessionId : null,
        sessionSha256: sessionHash, providerSha256: providerHash, authorizationScopeSha256: scopeHash,
        purpose: purpose === 'agent' || purpose === 'compaction' ? purpose : 'other', purposeSha256: sha(purpose),
        capabilityFallback: context.capabilityFallback, endpointSha256: sha(endpoint),
        model: typeof body['model'] === 'string' && /^gpt-[a-zA-Z0-9._-]{1,100}$/.test(body['model']) ? body['model'] : null,
        modelSha256: sha(JSON.stringify(body['model'] ?? null)), wireBodySha256: sha(serializedBody),
        inputCount: fingerprint.inputCount, inputSha256: fingerprint.inputSha256,
        prefixSha256: prefixes, prefixesTruncated: input.length > MAX_PREFIXES,
        toolsSha256: fingerprint.toolsSha256, reasoningSha256: fingerprint.reasoningSha256,
        settingsSha256: fingerprint.settingsSha256, promptCacheKeySha256: fingerprint.cacheKeySha256,
        sessionHeaderSha256: sessionHeader === undefined ? null : sha(sessionHeader),
        comparison: previous === undefined ? null : { previousAttemptId: previous.attemptId,
          matchingPrefixItems: matching, previousInputPreserved,
          toolsEqual: previous.toolsSha256 === fingerprint.toolsSha256,
          reasoningEqual: previous.reasoningSha256 === fingerprint.reasoningSha256,
          settingsEqual: previous.settingsSha256 === fingerprint.settingsSha256,
          cacheKeyEqual: previous.cacheKeySha256 === fingerprint.cacheKeySha256 } })
      if (!recorded) return undefined
      let ended = false
      let requestId: Record<string, string> | null = null
      let responseId: Record<string, string> | null = null
      let responseModel: string | null = null
      let responseModelSha256: string | null = null
      let serviceTier: string | null = null
      let systemFingerprint: string | null = null
      let usage: Record<string, number | null> | null = null
      let cache: Record<string, unknown> | null = null
      let cachePresent = false
      let cacheSource: string | null = null
      return {
        response: response => {
          requestId = identifier(response.headers.get('x-request-id'), 'req')
          this.write({ ...id, phase: 'response', status: response.status, requestId })
        },
        payload: payload => {
          try {
            if (!/"(?:response|prompt_cache_diagnostics|usage)"\s*:/.test(payload)) return
            const event = object(JSON.parse(payload))
            const response = object(event?.['response']) ?? event
            if (response === undefined) return
            responseId = identifier(response['id'], 'resp') ?? responseId
            const model = response['model']
            if (typeof model === 'string') {
              responseModelSha256 = sha(JSON.stringify(model))
              responseModel = /^gpt-[a-zA-Z0-9._-]{1,100}$/.test(model) ? model : null
            }
            const tier = response['service_tier']
            if (typeof tier === 'string' && TIERS.has(tier)) serviceTier = tier
            if (typeof response['system_fingerprint'] === 'string') systemFingerprint = sha(response['system_fingerprint'])
            usage = usageOf(response['usage']) ?? usage
            if (Object.hasOwn(response, 'prompt_cache_diagnostics')) {
              cachePresent = true
              const type = event?.['type']
              cacheSource = typeof type === 'string' && new Set(['response.created', 'response.in_progress', 'response.completed', 'response.failed', 'response.incomplete']).has(type) ? type : 'other'
              cache = cacheDiagnostic(response['prompt_cache_diagnostics'])
            }
          } catch { /* Malformed frames remain the stream decoder's responsibility. */ }
        },
        end: outcome => {
          if (ended) return
          ended = true
          const recorded = this.write({ ...id, phase: 'end', outcome, requestId, responseId, responseModel, responseModelSha256, serviceTier,
            systemFingerprintSha256: systemFingerprint, usage,
            promptCacheDiagnosticsPresent: cachePresent, promptCacheDiagnosticsEvent: cacheSource, promptCacheDiagnostics: cache })
          // This records a wire terminal, not a claim that host output validation succeeded.
          if (recorded && outcome === 'completed' && group !== undefined && fingerprint.sequence > (this.baselines.get(group)?.sequence ?? -1)) {
            this.baselines.delete(group)
            this.baselines.set(group, fingerprint)
            while (this.baselines.size > MAX_BASELINES) this.baselines.delete(this.baselines.keys().next().value as string)
          }
        },
      }
    } catch { this.warn(); return undefined }
  }
}
