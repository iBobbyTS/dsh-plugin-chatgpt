import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
// src/auth/host-id.ts
/**
* This installation's stable agent-host identity.
*
* OpenAI's registration flow separates the *client* (what the human authorized,
* identified by the issued `client_id`) from the *host* (where the app runs,
* identified by `ext_agent_host_id`). One account's client can be reused across
* several hosts — a laptop and a self-hosted VM — and each must present its own
* host id, so the value has to be minted per installation and then never
* change: an id that changed per launch would read as a new host every time.
*
* The documentation prefers a JWK thumbprint URI and explicitly supports a
* UUID. This module uses the UUID: the harness already mints per-home UUIDs for
* its own installation identity, so a plain UUID keeps this plugin's state
* legible and inspectable rather than introducing key material for a value that
* is not a credential.
*
* @module dsh-plugin-chatgpt-subscription/auth/host-id
*/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Read a valid persisted id, or `undefined` when absent or corrupt. */
function read(file) {
	let text;
	try {
		text = readFileSync(file, "utf8");
	} catch {
		return;
	}
	const value = text.trim();
	return UUID_PATTERN.test(value) ? value.toLowerCase() : void 0;
}
/**
* Return the persisted host id, minting and storing one on first use.
*
* The id is rendered as `urn:uuid:<id>` because that is the accepted
* `ext_agent_host_id` spelling; the file keeps the bare UUID so it stays
* readable and hand-replaceable.
*
* Persistence is best-effort: a read-only home still yields a usable id for
* this run, because a sign-in that would otherwise work must not be blocked by
* the inability to remember it.
*
* @param options - where the id lives, and the generation seam.
* @returns the `urn:uuid:` form to send as `ext_agent_host_id`.
*/
function ensureHostId(options) {
	let id = read(options.file);
	if (id === void 0) {
		id = (options.randomUUID ?? randomUUID)().toLowerCase();
		options.onMinted?.(id);
		try {
			mkdirSync(dirname(options.file), { recursive: true });
			try {
				writeFileSync(options.file, `${id}\n`, {
					encoding: "utf8",
					flag: "wx",
					mode: 384
				});
			} catch {
				id = read(options.file) ?? id;
			}
		} catch {}
	}
	return `urn:uuid:${id}`;
}
export { ensureHostId };

//# sourceMappingURL=host-id.js.map