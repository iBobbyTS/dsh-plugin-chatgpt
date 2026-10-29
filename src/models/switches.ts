/**
 * The per-installation record of how the human reshaped the roster: which
 * models are switched off, and which carry a hand-set display name.
 *
 * Both are statements about what the selector should offer and show, in the
 * same vocabulary the roster uses: exact model ids. The record lives beside the
 * grant in the state directory, owner-only, because it is preference rather
 * than credential but belongs to this installation the same way.
 *
 * The file is small and whole-file: one edit rewrites it under the same
 * advisory lock the credential uses, so a CLI process and the host cannot
 * interleave a read-modify-write into a lost update.
 *
 * @module dsh-plugin-chatgpt/models/switches
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { withCredentialFileLock } from '../auth/file-lock.ts'

/** File name inside the installation's state directory. */
const OVERRIDES_FILENAME = 'models.json'

/** One roster model as the provider card's model list shows it. */
export interface ModelSwitchView {
  /** The model id, exactly as the roster and a request would carry it. */
  id: string
  /** Display name from the roster entry, before any hand-set override. */
  defaultName: string
  /** The name the selector shows: the hand-set override, else the roster's. */
  name: string
  /** Whether the human switched this model off. */
  disabled: boolean
}

/** The hand-set reshaping of the roster, as the file stores it. */
export interface ModelOverridesFile {
  /** Exact model ids switched off, in no significant order. */
  disabled: readonly string[]
  /** Model id → display name the selector should show instead of the roster's. */
  names: Readonly<Record<string, string>>
}

/** Where the overrides file lives inside one installation's state directory. */
function overridesPath(stateDir: string): string {
  return join(stateDir, OVERRIDES_FILENAME)
}

/**
 * Whether one parsed overrides record has the stored shape.
 * @param parsed - the JSON the file contained.
 * @returns the record when valid, so the reader needs one cast total.
 */
function isOverridesFile(parsed: unknown): parsed is ModelOverridesFile {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false
  const { disabled, names } = parsed as { disabled?: unknown, names?: unknown }
  if (!Array.isArray(disabled) || disabled.some(id => typeof id !== 'string')) return false
  if (names === undefined) return true
  if (typeof names !== 'object' || names === null || Array.isArray(names)) return false
  return Object.values(names).every(name => typeof name === 'string' && name.trim().length > 0)
}

/**
 * Read the roster overrides.
 *
 * A missing file is no overrides rather than a failure: the first edit on a
 * fresh installation reads one, and a state directory that predates the file
 * (or that only ever carried the original `disabled`-only shape) has none.
 *
 * @param stateDir - the installation's state directory.
 * @returns the stored overrides, with `names` empty when the file carries none.
 * @throws When the file exists but is neither valid JSON nor the expected
 * shape, naming the file and the fix, because silently ignoring it would make
 * an edit appear to work and then come back.
 */
export async function readModelOverrides(stateDir: string): Promise<ModelOverridesFile> {
  let text: string
  try {
    text = await readFile(overridesPath(stateDir), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { disabled: [], names: {} }
    throw error
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`chatgpt: ${OVERRIDES_FILENAME} is not valid JSON; delete it to reset model switches and names`)
  }
  if (!isOverridesFile(parsed)) {
    throw new Error(`chatgpt: ${OVERRIDES_FILENAME} is malformed; delete it to reset model switches and names`)
  }
  return { disabled: parsed.disabled, names: parsed.names ?? {} }
}

/**
 * Persist the roster overrides, replacing the file wholesale.
 *
 * @param stateDir - the installation's state directory, created when absent.
 * @param overrides - every switch and name override to store.
 */
export async function writeModelOverrides(stateDir: string, overrides: ModelOverridesFile): Promise<void> {
  await mkdir(stateDir, { recursive: true, mode: 0o700 })
  const path = overridesPath(stateDir)
  await withCredentialFileLock(path, async () => {
    const temp = `${path}.tmp-${process.pid.toString()}`
    const body = { disabled: [...overrides.disabled], names: { ...overrides.names } }
    await writeFile(temp, `${JSON.stringify(body, undefined, 2)}\n`, { mode: 0o600 })
    await rename(temp, path)
  })
}
