/** Cross-process advisory lock for one OAuth refresh-token rotation. */
import { open, stat, unlink } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

const LOCK_WAIT_MS = 20_000
const LOCK_STALE_MS = 120_000
const POLL_MS = 75

/** Exclusively serialize the read → refresh → write transaction across DSH processes. */
export async function withCredentialFileLock<T>(
  credentialPath: string,
  task: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const lockFile = `${credentialPath}.lock`
  const started = Date.now()
  for (;;) {
    signal?.throwIfAborted()
    try {
      const handle = await open(lockFile, 'wx', 0o600)
      try {
        await handle.writeFile(String(process.pid))
        return await task()
      } finally {
        await handle.close()
        await unlink(lockFile).catch(() => undefined)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    // A crashed process may have left the lock. Never steal a normal 30s refresh.
    try {
      const info = await stat(lockFile)
      if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
        await unlink(lockFile).catch(() => undefined)
        continue
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (Date.now() - started > LOCK_WAIT_MS) {
      throw new Error('timed out waiting for another DSH process to finish ChatGPT token refresh')
    }
    await delay(POLL_MS, undefined, { signal })
  }
}
