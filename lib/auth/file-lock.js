import { open, stat, unlink } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
// src/auth/file-lock.ts
/** Cross-process advisory lock for one OAuth refresh-token rotation. */
const LOCK_WAIT_MS = 2e4;
const LOCK_STALE_MS = 12e4;
const POLL_MS = 75;
/** Exclusively serialize the read → refresh → write transaction across DSH processes. */
async function withCredentialFileLock(credentialPath, task, signal) {
	const lockFile = `${credentialPath}.lock`;
	const started = Date.now();
	for (;;) {
		signal?.throwIfAborted();
		try {
			const handle = await open(lockFile, "wx", 384);
			try {
				await handle.writeFile(String(process.pid));
				return await task();
			} finally {
				await handle.close();
				await unlink(lockFile).catch(() => void 0);
			}
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
		}
		try {
			const info = await stat(lockFile);
			if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
				await unlink(lockFile).catch(() => void 0);
				continue;
			}
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
		if (Date.now() - started > LOCK_WAIT_MS) throw new Error("timed out waiting for another DSH process to finish ChatGPT token refresh");
		await setTimeout(POLL_MS, void 0, { signal });
	}
}
export { withCredentialFileLock };

//# sourceMappingURL=file-lock.js.map