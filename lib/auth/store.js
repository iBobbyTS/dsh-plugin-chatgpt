import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
// src/auth/store.ts
/**
* Where one installation's ChatGPT grants live.
*
* This is credential state, not configuration, so it has its own rules: the
* file is written atomically (a torn write would lose a working grant and force
* a fresh browser sign-in), it is owner-only, and it never carries anything the
* request path does not read. Tokens are stored as opaque strings and are never
* logged, echoed into an error, or exposed over the plugin's remote surface —
* the UI sees account facts, never a bearer token.
*
* Grants are keyed by the account subject rather than by installation, because
* one installation can legitimately hold several ChatGPT accounts (work and
* personal) and each has its own issued client id, its own refresh token, and
* its own plan. Keying by subject is what lets an account be switched without
* discarding the other.
*
* @module dsh-plugin-chatgpt-subscription/auth/store
*/
/** An empty document for a fresh installation. */
function emptyDocument(hostId) {
	return {
		version: 1,
		hostId,
		accounts: {},
		registrations: {}
	};
}
/** Read one document, tolerating absence and rejecting corruption loudly. */
function readDocument(file) {
	let text;
	try {
		text = readFileSync(file, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return void 0;
		throw error;
	}
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error(`the ChatGPT credential file at ${file} is not valid JSON; delete it and sign in again`);
	}
	if (typeof parsed !== "object" || parsed === null) throw new Error(`the ChatGPT credential file at ${file} does not hold an object; delete it and sign in again`);
	const document = parsed;
	if (document.version !== 1 || typeof document.hostId !== "string" || typeof document.accounts !== "object" || document.accounts === null) throw new Error(`the ChatGPT credential file at ${file} has an unrecognised shape; delete it and sign in again`);
	return {
		version: 1,
		hostId: document.hostId,
		accounts: document.accounts,
		registrations: registrationsOf(document.registrations),
		...typeof document.active === "string" ? { active: document.active } : {}
	};
}
/**
* Read the retained registrations, dropping anything not shaped like one.
*
* A registration is a convenience for the next sign-in rather than a credential,
* so a damaged entry is discarded instead of refusing a document whose grants are
* perfectly usable.
*
* @param value - whatever the file held under `registrations`.
* @returns the entries worth keeping.
*/
function registrationsOf(value) {
	if (typeof value !== "object" || value === null) return {};
	const kept = {};
	for (const [subject, entry] of Object.entries(value)) {
		if (typeof entry !== "object" || entry === null) continue;
		const candidate = entry;
		if (typeof candidate.clientId !== "string" || candidate.clientId.length === 0) continue;
		kept[subject] = {
			clientId: candidate.clientId,
			at: typeof candidate.at === "number" ? candidate.at : 0,
			...typeof candidate.email === "string" ? { email: candidate.email } : {}
		};
	}
	return kept;
}
/**
* Write one document atomically and owner-only.
*
* The rename is what makes it atomic: a reader either sees the previous file or
* the complete new one, never a half-written grant.
*
* @param file - the target path.
* @param document - the complete document to store.
*/
function writeDocument(file, document) {
	mkdirSync(dirname(file), {
		recursive: true,
		mode: 448
	});
	const temporary = `${file}.${randomUUID()}.tmp`;
	writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, {
		encoding: "utf8",
		mode: 384
	});
	try {
		renameSync(temporary, file);
	} catch (error) {
		rmSync(temporary, { force: true });
		throw error;
	}
}
export { emptyDocument, readDocument, writeDocument };

//# sourceMappingURL=store.js.map