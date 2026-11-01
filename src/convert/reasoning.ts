/** Durable configuration updates bound to the exact Responses input prefix. */
import { createHash } from 'node:crypto'
import type { InputItem } from './request.ts'

export interface ReasoningReplay {
  /** null means the initial request omitted reasoning.effort. */
  baseEffort: string | null
  effort: string
  inputCount: number
  inputHash: string
  updates: { index: number, effort: string }[]
}

const efforts = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

/** Restrict updates to the documented standard GPT-6 model family. */
export function supportsReasoningUpdates(model: string): boolean {
  return /^gpt-6(?:\.\d+)?-(?:astra|sol|terra|luna)(?:-\d{4}-\d{2}-\d{2})?$/.test(model)
}

/** Validate adapter-private metadata read from a durable session. */
export function readReasoningReplay(value: unknown): ReasoningReplay | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const v = value as Record<string, unknown>
  if (v['baseEffort'] !== null && (typeof v['baseEffort'] !== 'string' || !efforts.has(v['baseEffort']))) return undefined
  if (typeof v['effort'] !== 'string' || !efforts.has(v['effort'])
    || typeof v['inputCount'] !== 'number' || !Number.isSafeInteger(v['inputCount']) || v['inputCount'] < 0
    || typeof v['inputHash'] !== 'string' || !/^[a-f0-9]{64}$/.test(v['inputHash'])
    || !Array.isArray(v['updates'])) return undefined
  const updates: ReasoningReplay['updates'] = []
  for (const item of v['updates']) {
    if (item === null || typeof item !== 'object') return undefined
    const u = item as Record<string, unknown>
    if (typeof u['index'] !== 'number' || !Number.isSafeInteger(u['index']) || u['index'] < 0
      || u['index'] >= v['inputCount'] || typeof u['effort'] !== 'string' || !efforts.has(u['effort'])
      || updates.length > 0 && u['index'] <= updates[updates.length - 1]!.index + 1) return undefined
    updates.push({ index: u['index'], effort: u['effort'] })
  }
  if (v['effort'] !== (updates.at(-1)?.effort ?? v['baseEffort'] ?? 'medium')) return undefined
  return { baseEffort: v['baseEffort'] as string | null, effort: v['effort'],
    inputCount: v['inputCount'], inputHash: v['inputHash'], updates }
}

function hash(input: readonly InputItem[]): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

function update(effort: string): InputItem {
  return { type: 'configuration_update', reasoning: { effort } }
}

/** Restore updates only when the recorded request still precedes its assistant unchanged. */
export function prepareReasoning(
  raw: InputItem[], selected: string | undefined,
  previous: { state: ReasoningReplay, assistantOffset: number } | undefined,
  assistantEnd: number,
): { input: InputItem[], effort: string | undefined, state: ReasoningReplay } {
  let input = raw.slice()
  let baseEffort = selected ?? null
  let effective = selected ?? 'medium'
  let updates: ReasoningReplay['updates'] = []
  if (previous !== undefined) {
    const saved = previous.state
    const candidate = raw.slice()
    for (const u of saved.updates) candidate.splice(u.index, 0, update(u.effort))
    if (saved.inputCount === previous.assistantOffset + saved.updates.length
      && hash(candidate.slice(0, saved.inputCount)) === saved.inputHash) {
      input = candidate
      baseEffort = saved.baseEffort
      effective = saved.effort
      updates = saved.updates.slice()
    }
  }
  const desired = selected ?? 'medium'
  if (desired !== effective) {
    // A follow-up gets its update before the next user. A tool continuation
    // has no new user message, so append the update after its tool results.
    const nextUser = input.findIndex((item, index) => index >= assistantEnd + updates.length && item['role'] === 'user')
    const index = nextUser < 0 ? input.length : nextUser
    input.splice(index, 0, update(desired))
    updates.push({ index, effort: desired })
  }
  return { input, effort: baseEffort ?? undefined, state: {
    baseEffort, effort: desired, inputCount: input.length, inputHash: hash(input), updates,
  } }
}
