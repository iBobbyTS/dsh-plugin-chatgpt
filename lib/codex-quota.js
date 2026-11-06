import { createHash, createHmac, randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
// src/codex-quota.ts
/** Codex-only quota credentials. Independent of ChatGPT direct-token authorization. */
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const MAX_BYTES = 1048576;
const TIMEOUT_MS = 15e3;
var QuotaError = class extends Error {
	status;
	reason;
	constructor(status, reason) {
		super(reason);
		this.status = status;
		this.reason = reason;
	}
};
const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const string = (value) => typeof value === "string" && value.length > 0 ? value : void 0;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const safeLabel = (value) => typeof value === "string" && value.length <= 80 && !/[\x00-\x1f]/.test(value) ? value.trim() : "";
function jwt(token) {
	try {
		const value = JSON.parse(Buffer.from(String(token).split(".")[1] ?? "", "base64url").toString());
		return object(value) ? value : {};
	} catch {
		return {};
	}
}
function readDocument(path) {
	let fd;
	try {
		if (realpathSync(path) !== path || lstatSync(path).isSymbolicLink()) throw new Error("alias");
		fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
		const stat = fstatSync(fd);
		if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES || process.getuid && stat.uid !== process.getuid()) throw new Error("unsafe file");
		const bytes = Buffer.alloc(stat.size + 1);
		let length = 0;
		while (length < bytes.length) {
			const count = readSync(fd, bytes, length, bytes.length - length, null);
			if (count === 0) break;
			length += count;
		}
		if (length > stat.size) throw new Error("file changed during read");
		const raw = bytes.subarray(0, length).toString("utf8");
		let json;
		try {
			json = JSON.parse(raw);
		} catch {
			throw new QuotaError("invalid-response", "invalid-auth-file");
		}
		if (!object(json)) throw new QuotaError("invalid-response", "invalid-auth-file");
		if (json["auth_mode"] !== "chatgpt") throw new QuotaError("invalid-response", "unsupported-auth-mode");
		const tokens = json["tokens"];
		if (!object(tokens) || !string(tokens["access_token"])) throw new QuotaError("invalid-response", "invalid-auth-file");
		const accessToken = tokens["access_token"];
		const claims = jwt(tokens["id_token"]);
		const accessClaims = jwt(accessToken);
		const authClaims = accessClaims["https://api.openai.com/auth"];
		const accountId = string(tokens["account_id"]) ?? (object(authClaims) ? string(authClaims["chatgpt_account_id"]) : void 0);
		const identity = accountId ?? string(claims["sub"]) ?? string(accessClaims["sub"]);
		return {
			raw,
			hash: hash(raw),
			json,
			tokens,
			accessToken,
			...string(tokens["refresh_token"]) ? { refreshToken: tokens["refresh_token"] } : {},
			...accountId ? { accountId } : {},
			identity: identity ?? hash(accessToken)
		};
	} catch (error) {
		if (error instanceof QuotaError) throw error;
		throw new QuotaError("unavailable", "file-unavailable");
	} finally {
		if (fd !== void 0) closeSync(fd);
	}
}
/** Same-filesystem replacement, private temporary file, durable data before rename. */
function atomicWrite(path, data, expectedHash) {
	const parent = dirname(path);
	const temporary = join(parent, `.dsh-codex-${randomUUID()}.tmp`);
	let fd;
	try {
		fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 384);
		writeFileSync(fd, data, "utf8");
		fsyncSync(fd);
		closeSync(fd);
		fd = void 0;
		if (realpathSync(parent) !== parent) throw new QuotaError("unavailable", "credential-conflict");
		if (expectedHash !== void 0 && readDocument(path).hash !== expectedHash) throw new QuotaError("unavailable", "credential-conflict");
		renameSync(temporary, path);
		const directory = openSync(parent, constants.O_RDONLY);
		try {
			fsyncSync(directory);
		} finally {
			closeSync(directory);
		}
	} catch (error) {
		if (error instanceof QuotaError) throw error;
		throw new QuotaError("unavailable", "persistence-failed");
	} finally {
		if (fd !== void 0) closeSync(fd);
		try {
			unlinkSync(temporary);
		} catch {}
	}
}
const rotations = /* @__PURE__ */ new Map();
const pendingWrites = /* @__PURE__ */ new Map();
const refused = /* @__PURE__ */ new Map();
const releasedLocks = /* @__PURE__ */ new Map();
function recoverReleasedLock(path) {
	const owned = releasedLocks.get(path);
	if (!owned) return;
	try {
		const current = lstatSync(path);
		if (!current.isSymbolicLink() && current.ino === owned.ino && current.dev === owned.dev) unlinkSync(path);
		releasedLocks.delete(path);
	} catch (error) {
		if (error.code === "ENOENT") releasedLocks.delete(path);
	}
}
async function jsonResponse(response) {
	if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new QuotaError("invalid-response", "invalid-auth-file");
	if (!response.body) throw new QuotaError("invalid-response", "invalid-auth-file");
	const reader = response.body.getReader();
	let bytes = 0;
	const chunks = [];
	try {
		for (;;) {
			const part = await reader.read();
			if (part.done) break;
			bytes += part.value.byteLength;
			if (bytes > MAX_BYTES) throw new QuotaError("invalid-response", "invalid-auth-file");
			chunks.push(part.value);
		}
		const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		if (!object(value)) throw new Error("shape");
		return value;
	} catch (error) {
		if (error instanceof QuotaError) throw error;
		throw new QuotaError("invalid-response", "invalid-auth-file");
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}
function persistPending(path) {
	const pending = pendingWrites.get(path);
	if (!pending) return void 0;
	const latest = readDocument(path);
	if (latest.hash === pending.after) {
		pendingWrites.delete(path);
		return latest;
	}
	if (latest.hash !== pending.before) throw new QuotaError("unavailable", "credential-conflict");
	atomicWrite(path, pending.data, pending.before);
	pendingWrites.delete(path);
	return readDocument(path);
}
async function rotate(path, original, fetchImpl, signal) {
	const existing = rotations.get(path);
	if (existing) return existing;
	const task = (async () => {
		const lockPath = `${path}.dsh-refresh.lock`;
		let lock;
		const deadline = Date.now() + 2e4;
		try {
			for (;;) {
				signal.throwIfAborted();
				recoverReleasedLock(lockPath);
				try {
					lock = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 384);
					break;
				} catch (error) {
					if (error.code !== "EEXIST") throw new QuotaError("unavailable", "file-unavailable");
					if (Date.now() >= deadline) throw new QuotaError("unavailable", "refresh-busy");
					await new Promise((resolve) => setTimeout(resolve, 50));
				}
			}
			const persisted = persistPending(path);
			if (persisted) return persisted;
			const current = readDocument(path);
			if (current.hash !== original.hash) return current;
			if (!current.refreshToken || refused.get(path) === hash(current.refreshToken)) throw new QuotaError("unauthorized", "reauth-required");
			signal.throwIfAborted();
			const response = await fetchImpl(TOKEN_URL, {
				method: "POST",
				redirect: "manual",
				signal: AbortSignal.timeout(TIMEOUT_MS),
				headers: {
					"content-type": "application/json",
					accept: "application/json"
				},
				body: JSON.stringify({
					grant_type: "refresh_token",
					refresh_token: current.refreshToken,
					client_id: CLIENT_ID
				})
			}).catch(() => {
				refused.set(path, hash(current.refreshToken));
				throw new QuotaError("unavailable", "reauth-required");
			});
			if (!response.ok) {
				await response.body?.cancel().catch(() => {});
				const latest = readDocument(path);
				if (latest.hash !== current.hash) return latest;
				if ([
					400,
					401,
					403
				].includes(response.status)) {
					refused.set(path, hash(current.refreshToken));
					throw new QuotaError("unauthorized", "reauth-required");
				}
				throw new QuotaError(response.status === 429 ? "rate-limited" : "unavailable", "reauth-required");
			}
			let body;
			try {
				body = await jsonResponse(response);
				if (!string(body["access_token"]) || body["refresh_token"] !== void 0 && !string(body["refresh_token"]) || body["id_token"] !== void 0 && !string(body["id_token"])) throw new QuotaError("invalid-response", "invalid-auth-file");
			} catch (error) {
				refused.set(path, hash(current.refreshToken));
				throw error;
			}
			const tokens = {
				...current.tokens,
				access_token: body["access_token"],
				...string(body["refresh_token"]) ? { refresh_token: body["refresh_token"] } : {},
				...string(body["id_token"]) ? { id_token: body["id_token"] } : {}
			};
			const data = `${JSON.stringify({
				...current.json,
				tokens,
				last_refresh: (/* @__PURE__ */ new Date()).toISOString()
			}, null, 2)}\n`;
			pendingWrites.set(path, {
				before: current.hash,
				after: hash(data),
				data
			});
			return persistPending(path);
		} finally {
			if (lock !== void 0) {
				const stat = fstatSync(lock);
				closeSync(lock);
				releasedLocks.set(lockPath, {
					ino: stat.ino,
					dev: stat.dev
				});
				recoverReleasedLock(lockPath);
			}
		}
	})();
	rotations.set(path, task);
	try {
		return await task;
	} finally {
		if (rotations.get(path) === task) rotations.delete(path);
	}
}
function parseCodexQuota(body, at) {
	const limit = body["rate_limit"];
	if (!object(limit)) throw new QuotaError("invalid-response", "invalid-auth-file");
	const windows = [];
	for (const [field, id] of [["primary_window", "primary"], ["secondary_window", "secondary"]]) {
		const value = limit[field];
		if (value === void 0 || value === null) continue;
		if (!object(value)) throw new QuotaError("invalid-response", "invalid-auth-file");
		const percent = value["used_percent"];
		if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100) throw new QuotaError("invalid-response", "invalid-auth-file");
		const seconds = value["limit_window_seconds"];
		const reset = value["reset_at"];
		const after = value["reset_after_seconds"];
		const validSeconds = typeof seconds === "number" && Number.isSafeInteger(seconds) && seconds > 0;
		let resetsAt;
		if (reset !== void 0 && reset !== null) {
			if (typeof reset !== "number" || !Number.isSafeInteger(reset) || reset < 0 || reset > 864e10) throw new QuotaError("invalid-response", "invalid-auth-file");
			resetsAt = reset * 1e3;
		} else if (after !== void 0 && after !== null) {
			if (typeof after !== "number" || !Number.isSafeInteger(after) || after < 0 || after > 31622400) throw new QuotaError("invalid-response", "invalid-auth-file");
			resetsAt = at + after * 1e3;
		}
		if (seconds !== void 0 && !validSeconds) throw new QuotaError("invalid-response", "invalid-auth-file");
		windows.push({
			id,
			usedPercent: percent,
			label: validSeconds ? `${seconds / 3600}h` : id === "primary" ? "Primary" : "Secondary",
			...validSeconds ? { windowSeconds: seconds } : {},
			...resetsAt === void 0 ? {} : { resetsAt }
		});
	}
	if (!windows.length) throw new QuotaError("invalid-response", "invalid-auth-file");
	return windows;
}
/** Shared registration path used by the plugin and real-Cordis lifecycle tests. */
function registerCodexQuota(ctx, quota, route) {
	ctx.effect(() => () => quota.dispose());
	ctx.inject(["usageQuota"], (child) => {
		const registry = child.get("usageQuota");
		if (registry?.protocolVersion === 1) child.effect(() => registry.register(quota.source(route)));
	});
}
var CodexQuota = class {
	selection;
	selectionPath;
	controller = new AbortController();
	selectionController = new AbortController();
	last;
	lastRevision;
	lastError;
	epoch = 0;
	flight;
	fetchImpl;
	now;
	constructor(stateDir, fetchImpl = fetch, now = Date.now) {
		this.fetchImpl = fetchImpl;
		this.now = now;
		this.selectionPath = join(stateDir, "codex-quota.json");
		this.selection = {
			allowRefresh: false,
			label: "",
			salt: randomUUID()
		};
		try {
			const raw = JSON.parse(readFileSync(this.selectionPath, "utf8"));
			if (object(raw) && typeof raw["salt"] === "string") this.selection = {
				salt: raw["salt"],
				allowRefresh: raw["allowRefresh"] === true,
				label: safeLabel(raw["label"]),
				...typeof raw["path"] === "string" && isAbsolute(raw["path"]) ? { path: raw["path"] } : {}
			};
		} catch {}
	}
	view() {
		const snapshot = this.lastRevision === this.revision() ? this.last : void 0;
		return {
			...this.selection.path ? { path: this.selection.path } : {},
			defaultPath: join(homedir(), ".codex", "auth.json"),
			allowRefresh: this.selection.allowRefresh,
			label: this.selection.label,
			...snapshot ? { snapshot } : {},
			...this.lastError ? { error: this.lastError } : {}
		};
	}
	/** Human-only authorization: selecting also explicitly grants optional refresh/writeback. */
	select(path, allowRefresh, label) {
		if (typeof path !== "string" || typeof allowRefresh !== "boolean" || typeof label !== "string") throw new Error("invalid-selection");
		const expanded = path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
		if (!isAbsolute(expanded)) throw new Error("absolute-host-path-required");
		const target = resolve(expanded);
		readDocument(target);
		if (this.selection.path && pendingWrites.has(this.selection.path)) throw new Error("persistence-failed");
		if (this.selection.path && rotations.has(this.selection.path)) throw new Error("refresh-busy");
		const next = {
			path: target,
			allowRefresh,
			label: safeLabel(label),
			salt: this.selection.salt
		};
		this.save(next);
		this.selectionController.abort();
		this.selectionController = new AbortController();
		this.epoch += 1;
		this.last = void 0;
		this.lastError = void 0;
		return this.view();
	}
	clear() {
		if (this.selection.path && (pendingWrites.has(this.selection.path) || rotations.has(this.selection.path))) throw new Error("refresh-busy");
		this.save({
			allowRefresh: false,
			label: "",
			salt: this.selection.salt
		});
		this.selectionController.abort();
		this.selectionController = new AbortController();
		this.epoch += 1;
		this.last = void 0;
		this.lastError = void 0;
		return this.view();
	}
	save(next) {
		mkdirSync(dirname(this.selectionPath), {
			recursive: true,
			mode: 448
		});
		atomicWrite(this.selectionPath, `${JSON.stringify(next)}\n`);
		this.selection = next;
	}
	revision() {
		const selection = this.selection;
		let identity = "unconfigured";
		if (selection.path) try {
			identity = readDocument(selection.path).identity;
		} catch {
			identity = "unreadable";
		}
		return createHmac("sha256", selection.salt).update(JSON.stringify({
			...selection,
			identity,
			epoch: this.epoch
		})).digest("hex");
	}
	source(route) {
		return {
			protocolVersion: 1,
			id: `${route}.codex`,
			displayName: "Codex quota (independent monitoring account)",
			providerRoutes: [route],
			revision: () => this.revision(),
			read: (options) => this.read(options)
		};
	}
	dispose() {
		this.controller.abort();
		this.epoch += 1;
	}
	async read({ signal }) {
		if (this.flight?.epoch === this.epoch) return this.flight.promise;
		const epoch = this.epoch;
		const revision = this.revision();
		const selection = { ...this.selection };
		const promise = this.query(selection, AbortSignal.any([
			signal,
			this.controller.signal,
			this.selectionController.signal
		])).then((snapshot) => {
			signal.throwIfAborted();
			if (this.epoch !== epoch || this.revision() !== revision) throw new Error("quota-binding-changed");
			this.last = snapshot;
			this.lastRevision = revision;
			this.lastError = snapshot.accounts.find((account) => account.reason)?.reason;
			return snapshot;
		});
		this.flight = {
			epoch,
			promise
		};
		try {
			return await promise;
		} finally {
			if (this.flight?.promise === promise) this.flight = void 0;
		}
	}
	async refresh() {
		const epoch = this.epoch;
		try {
			await this.read({ signal: this.controller.signal });
		} catch {
			if (this.epoch === epoch) this.lastError = "quota-unavailable";
		}
		return this.view();
	}
	async query(selection, signal) {
		signal.throwIfAborted();
		if (!selection.path) return {
			observedAt: this.now(),
			accounts: []
		};
		let document;
		try {
			document = readDocument(selection.path);
			const pending = pendingWrites.get(selection.path);
			const externalConflict = pending !== void 0 && document.hash !== pending.before && document.hash !== pending.after;
			if (pending && !externalConflict) document = await rotate(selection.path, document, this.fetchImpl, signal);
			const expiry = jwt(document.accessToken)["exp"];
			let refreshed = false;
			if (!externalConflict && typeof expiry === "number" && expiry * 1e3 <= this.now() + 6e4 && selection.allowRefresh) {
				document = await rotate(selection.path, document, this.fetchImpl, signal);
				refreshed = true;
			}
			const requestUsage = (current) => this.fetchImpl(USAGE_URL, {
				method: "GET",
				redirect: "manual",
				signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
				headers: {
					authorization: `Bearer ${current.accessToken}`,
					accept: "application/json",
					"user-agent": "codex-cli",
					"cache-control": "no-cache",
					...current.accountId ? { "ChatGPT-Account-Id": current.accountId } : {}
				}
			});
			let response = await requestUsage(document);
			if (response.status === 401 && selection.allowRefresh && !refreshed && !externalConflict) {
				await response.body?.cancel().catch(() => {});
				document = await rotate(selection.path, document, this.fetchImpl, signal);
				response = await requestUsage(document);
			}
			if (!response.ok) {
				await response.body?.cancel().catch(() => {});
				throw new QuotaError(response.status === 401 || response.status === 403 ? "unauthorized" : response.status === 429 ? "rate-limited" : "unavailable", response.status === 401 ? "reauth-required" : "quota-unavailable");
			}
			const body = await jsonResponse(response);
			const at = this.now();
			const windows = parseCodexQuota(body, at);
			if (externalConflict && pendingWrites.get(selection.path) === pending && readDocument(selection.path).hash === document.hash) pendingWrites.delete(selection.path);
			const plan = body["plan_type"];
			return {
				observedAt: at,
				accounts: [{
					id: this.accountId(selection, document.identity),
					label: selection.label || "Codex（独立监控账号）",
					status: "ok",
					...typeof plan === "string" && /^[a-z][a-z0-9_-]{0,31}$/.test(plan) && plan !== document.accessToken && plan !== document.refreshToken ? { plan } : {},
					windows
				}]
			};
		} catch (error) {
			signal.throwIfAborted();
			const failure = error instanceof QuotaError ? error : new QuotaError("unavailable", "quota-unavailable");
			return {
				observedAt: this.now(),
				accounts: [{
					id: this.accountId(selection, document?.identity ?? "unknown"),
					label: selection.label || "Codex（独立监控账号）",
					status: failure.status,
					reason: failure.reason,
					windows: []
				}]
			};
		}
	}
	accountId(selection, identity) {
		return `codex-${createHmac("sha256", selection.salt).update(identity).digest("hex").slice(0, 24)}`;
	}
};
export { CodexQuota, parseCodexQuota, registerCodexQuota };

//# sourceMappingURL=codex-quota.js.map