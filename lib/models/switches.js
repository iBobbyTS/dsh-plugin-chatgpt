import { withCredentialFileLock } from "../auth/file-lock.js";
import { isContextWindow } from "./context.js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
// src/models/switches.ts
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
/** File name inside the installation's state directory. */
const OVERRIDES_FILENAME = "models.json";
/** Where the overrides file lives inside one installation's state directory. */
function overridesPath(stateDir) {
	return join(stateDir, OVERRIDES_FILENAME);
}
/**
* Whether one parsed overrides record has the stored shape.
* @param parsed - the JSON the file contained.
* @returns the record when valid, so the reader needs one cast total.
*/
function isOverridesFile(parsed) {
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
	const { disabled, names, contextWindows } = parsed;
	if (!Array.isArray(disabled) || disabled.some((id) => typeof id !== "string")) return false;
	if (names !== void 0 && (typeof names !== "object" || names === null || Array.isArray(names) || !Object.values(names).every((name) => typeof name === "string" && name.trim().length > 0))) return false;
	return contextWindows === void 0 || typeof contextWindows === "object" && contextWindows !== null && !Array.isArray(contextWindows) && Object.values(contextWindows).every(isContextWindow);
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
async function readModelOverrides(stateDir) {
	let text;
	try {
		text = await readFile(overridesPath(stateDir), "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return {
			disabled: [],
			names: {}
		};
		throw error;
	}
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error(`chatgpt: ${OVERRIDES_FILENAME} is not valid JSON; delete it to reset model switches and names`);
	}
	if (!isOverridesFile(parsed)) throw new Error(`chatgpt: ${OVERRIDES_FILENAME} is malformed; delete it to reset model switches and names`);
	return {
		disabled: parsed.disabled,
		names: parsed.names ?? {},
		...parsed.contextWindows === void 0 ? {} : { contextWindows: parsed.contextWindows }
	};
}
/**
* Persist the roster overrides, replacing the file wholesale.
*
* @param stateDir - the installation's state directory, created when absent.
* @param overrides - every switch and name override to store.
*/
async function writeModelOverrides(stateDir, overrides) {
	await mkdir(stateDir, {
		recursive: true,
		mode: 448
	});
	const path = overridesPath(stateDir);
	await withCredentialFileLock(path, async () => {
		const temp = `${path}.tmp-${process.pid.toString()}`;
		const body = {
			disabled: [...overrides.disabled],
			names: { ...overrides.names },
			...overrides.contextWindows === void 0 ? {} : { contextWindows: { ...overrides.contextWindows } }
		};
		await writeFile(temp, `${JSON.stringify(body, void 0, 2)}\n`, { mode: 384 });
		await rename(temp, path);
	});
}
export { readModelOverrides, writeModelOverrides };

//# sourceMappingURL=switches.js.map