import { ensureHostId } from "./host-id.js";
import { beginSignIn } from "./sign-in.js";
import { RefreshRefusedError, refreshCredential } from "./refresh.js";
import { withCredentialFileLock } from "./file-lock.js";
import { emptyDocument, readDocument, writeDocument } from "./store.js";
import { canSpendPlan, isFresh, isReplayNamespace } from "./credential.js";
import { revokeGrant } from "./revoke.js";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { closeSync, mkdirSync, openSync, statSync, unlinkSync } from "node:fs";
// src/auth/manager.ts
/**
* The one place that owns this installation's ChatGPT credential state.
*
* Two concerns meet here and nowhere else: which account is active, and whether
* its access token is still usable. The active account is persisted locally;
* refreshes share one in-flight promise per authorization, because callers must
* never refresh the same grant twice —
* a refresh rotates the refresh token, so a second refresh using the old one is
* refused and would look like a dead credential rather than a race.
*
* The remote surface reads account *facts* from here (email, plan, expiry) and
* never a token.
*
* @module dsh-plugin-chatgpt-subscription/auth/manager
*/
var StorageBusyError = class extends Error {};
/**
* Owns the stored grants, one active account, and the sign-in attempts in
* flight.
*/
var ChatGptAuth = class {
	file;
	options;
	document;
	refreshing = /* @__PURE__ */ new Map();
	/**
	* @param options - where state lives and what to call this app.
	*/
	constructor(options) {
		this.options = options;
		this.file = join(options.stateDir, "chatgpt-auth.json");
	}
	/** The absolute path of the credential file, for diagnostics. */
	get storePath() {
		return this.file;
	}
	mutationLocked = false;
	/** Serialize short storage transactions separately from the network refresh lock.
	* Synchronous callers fail promptly on contention instead of blocking the event loop. */
	mutate(task) {
		if (this.mutationLocked) return task();
		mkdirSync(dirname(this.file), {
			recursive: true,
			mode: 448
		});
		const lock = `${this.file}.lock`;
		let handle;
		try {
			handle = openSync(lock, "wx", 384);
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
			try {
				if (Date.now() - statSync(lock).mtimeMs > 12e4) unlinkSync(lock);
			} catch (staleError) {
				if (staleError.code !== "ENOENT") throw staleError;
			}
			try {
				handle = openSync(lock, "wx", 384);
			} catch (retryError) {
				if (retryError.code !== "EEXIST") throw retryError;
				throw new StorageBusyError("ChatGPT credentials are being updated; retry the account operation shortly");
			}
		}
		this.mutationLocked = true;
		try {
			return task();
		} finally {
			this.mutationLocked = false;
			closeSync(handle);
			unlinkSync(lock);
		}
	}
	/** Wait for short cross-process transactions without blocking their event loop.
	* After rotation succeeds, retain that result here until it is committed: the
	* old refresh token has already been consumed and must never be exchanged again. */
	async mutateAsync(task, signal) {
		for (;;) {
			signal?.throwIfAborted();
			try {
				return this.mutate(task);
			} catch (error) {
				if (!(error instanceof StorageBusyError)) throw error;
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
		}
	}
	/** Load lazily so a plugin that is never used never touches the disk. */
	load() {
		this.document = readDocument(this.file);
		if (this.document !== void 0) {
			const accounts = { ...this.document.accounts };
			let changed = false;
			for (const [key, credential] of Object.entries(accounts)) {
				if (credential === null || typeof credential !== "object") continue;
				if (isReplayNamespace(credential.replayNamespace)) continue;
				accounts[key] = {
					...credential,
					replayNamespace: randomUUID()
				};
				changed = true;
			}
			if (changed) return this.mutate(() => {
				const latest = readDocument(this.file) ?? emptyDocument(this.hostId());
				const upgraded = Object.fromEntries(Object.entries(latest.accounts).map(([key, value]) => [key, isReplayNamespace(value.replayNamespace) ? value : {
					...value,
					replayNamespace: randomUUID()
				}]));
				this.save({
					...latest,
					accounts: upgraded
				});
				return this.document;
			});
		}
		return this.document ?? emptyDocument(this.hostId());
	}
	/** The persisted host id, minted on first use. */
	hostId() {
		return ensureHostId({ file: join(dirname(this.file), "chatgpt-host-id") });
	}
	/** Persist a complete document. */
	save(document) {
		writeDocument(this.file, document);
		this.document = document;
	}
	/** The active grant, or `undefined` when nothing usable is stored. */
	active() {
		const document = this.load();
		const subject = document.active;
		if (subject === void 0) return void 0;
		return document.accounts[subject];
	}
	/**
	* The active grant with a usable access token, refreshing first when needed.
	*
	* @param signal - cancellation for the refresh.
	* @returns the usable credential.
	* @throws {RefreshRefusedError} when the grant can no longer be refreshed.
	*/
	async usable(signal) {
		const current = this.active();
		if (current === void 0) throw new Error("no ChatGPT account is signed in; run a sign-in first");
		if (!canSpendPlan(current)) throw new Error("ChatGPT plan usage is disabled; authorize plan usage before inference");
		if (isFresh(current)) return current;
		return this.rotate(current, signal);
	}
	/**
	* Mint a new access token from the stored grant, once, for concurrent callers.
	*
	* Rotation is single-use — the refresh token is replaced by the exchange — so
	* two callers refreshing at once would have the second present a token the
	* first already spent, and the endpoint reports that as a dead grant rather
	* than as a race.
	*/
	rotate(current, signal) {
		const namespace = current.replayNamespace;
		if (!isReplayNamespace(namespace)) throw new Error("the stored credential has no replay namespace");
		const pending = this.refreshing.get(namespace);
		if (pending !== void 0) return pending;
		const rotation = this.runRefresh(current, signal).finally(() => {
			this.refreshing.delete(namespace);
		});
		this.refreshing.set(namespace, rotation);
		return rotation;
	}
	/**
	* Exchange the stored grant for a new one, whatever the local expiry says.
	*
	* A token can be refused while it still looks valid: the endpoint answers
	* `token_expired` for a grant it has invalidated server-side, and a local clock
	* comparison cannot see that. Authorization can also change under a live
	* session — an account upgrade, a workspace switch — which retires tokens the
	* local expiry still considers good. This is the method a caller uses when the
	* endpoint has just told it the token is no good.
	*
	* @param signal - cancellation for the exchange.
	* @returns the rotated credential.
	*/
	async renew(signal) {
		const current = this.active();
		if (current === void 0) throw new Error("no ChatGPT account is signed in; run a sign-in first");
		return this.rotate(current, signal);
	}
	/** Refresh under a cross-process file lock; another process may have rotated this grant first. */
	async runRefresh(current, signal) {
		return withCredentialFileLock(`${this.file}.refresh`, async () => {
			const document = await this.mutateAsync(() => readDocument(this.file), signal);
			const key = Object.entries(document?.accounts ?? {}).find(([, stored]) => stored.replayNamespace === current.replayNamespace)?.[0];
			if (document === void 0 || key === void 0) throw new Error("the authorization was removed before refresh");
			const latest = document.accounts[key];
			if (latest.refreshToken !== current.refreshToken) {
				this.document = document;
				return latest;
			}
			const timeout = AbortSignal.timeout(3e4);
			const refreshSignal = signal === void 0 ? timeout : AbortSignal.any([signal, timeout]);
			const rotated = await refreshCredential(latest, {
				...this.options.endpoints?.tokenUrl === void 0 ? {} : { tokenUrl: this.options.endpoints.tokenUrl },
				signal: refreshSignal
			});
			await this.mutateAsync(() => {
				const reloaded = readDocument(this.file);
				if (reloaded === void 0 || reloaded.accounts[key]?.refreshToken !== latest.refreshToken || reloaded.accounts[key]?.replayNamespace !== latest.replayNamespace) throw new Error("the authorization changed or was removed during refresh");
				this.save({
					...reloaded,
					accounts: {
						...reloaded.accounts,
						[key]: rotated
					}
				});
			});
			return rotated;
		}, signal);
	}
	/** Force refresh the exact authorization that received an HTTP token refusal. */
	renewFor(credential, signal) {
		return this.rotate(credential, signal);
	}
	/**
	* Begin a sign-in. A registration already stored for this installation is
	* reused, which is what keeps the issued client id stable across sign-ins.
	*
	* @returns the attempt, already listening for its callback.
	*/
	/**
	* The registration to reuse when no credential is active.
	*
	* With one account this is that account's client, so signing out and back in
	* returns to the same registration instead of registering a second client. With
	* several, the most recently confirmed one is offered and the browser's account
	* selector still decides; the returned ID token is validated against the client
	* the attempt used, as always.
	*/
	retainedRegistration() {
		const registrations = this.load().registrations ?? {};
		let best;
		for (const registration of Object.values(registrations)) if (best === void 0 || registration.at > best.at) best = registration;
		return best;
	}
	async begin() {
		const stored = this.active();
		const retained = stored === void 0 ? this.retainedRegistration() : void 0;
		const existing = stored ?? (retained === void 0 ? void 0 : {
			clientId: retained.clientId,
			email: retained.email
		});
		const attemptOptions = {
			agentHostId: this.hostId(),
			agentNameHint: this.options.agentNameHint,
			...this.options.endpoints?.authorizeUrl === void 0 ? {} : { authorizeUrl: this.options.endpoints.authorizeUrl },
			...this.options.endpoints?.tokenUrl === void 0 ? {} : { tokenUrl: this.options.endpoints.tokenUrl },
			...this.options.endpoints?.preferredPort === void 0 ? {} : { preferredPort: this.options.endpoints.preferredPort },
			...this.options.endpoints?.verifyIdTokenSignature === void 0 ? {} : { verifyIdTokenSignature: this.options.endpoints.verifyIdTokenSignature },
			...existing === void 0 ? {} : { registration: {
				clientId: existing.clientId,
				...stored?.subject === void 0 ? {} : { expectedSubject: stored.subject },
				...existing.email === void 0 ? {} : { loginHint: existing.email }
			} }
		};
		return beginSignIn(attemptOptions);
	}
	/**
	* Store a completed grant and make it the active account.
	*
	* @param credential - what the sign-in produced.
	* @returns the local account key the grant was filed under.
	*/
	adopt(credential) {
		return this.mutate(() => this.adoptUnlocked(credential));
	}
	adoptUnlocked(credential) {
		const document = this.load();
		const { subject, replayNamespace: _suppliedNamespace, ...rest } = credential;
		const identity = typeof subject === "string" && subject.trim().length > 0 ? subject : void 0;
		const key = identity ?? `account-${randomUUID()}`;
		const stored = {
			...rest,
			...identity === void 0 ? {} : { subject: identity },
			replayNamespace: randomUUID()
		};
		this.save({
			...document,
			accounts: {
				...document.accounts,
				[key]: stored
			},
			registrations: {
				...document.registrations ?? {},
				[key]: {
					clientId: credential.clientId,
					at: Date.now(),
					...credential.email === void 0 ? {} : { email: credential.email }
				}
			},
			active: key
		});
		return key;
	}
	/** Make an already-authorized account active. */
	activate(subject) {
		return this.mutate(() => this.activateUnlocked(subject));
	}
	activateUnlocked(subject) {
		const document = this.load();
		if (document.accounts[subject] === void 0) throw new Error(`no stored ChatGPT account is filed under ${subject}`);
		this.save({
			...document,
			active: subject
		});
	}
	/**
	* End one account's session at the server, then forget it locally.
	*
	* Local removal alone would leave the grant redeemable at OpenAI, and nothing
	* would tell the account that this installation let go. The revocation is
	* attempted first; local state is cleared either way, because a user who asked
	* to sign out must end up signed out here even when the server cannot be
	* reached — but the outcome says which of the two happened.
	*
	* @param subject - the account to end; defaults to the active one.
	* @param options - endpoint overrides and cancellation.
	* @returns whether the server confirmed the revocation.
	*/
	async revoke(subject, options = {}) {
		const document = this.load();
		const target = subject ?? document.active;
		const credential = target === void 0 ? void 0 : document.accounts[target];
		if (target === void 0) return { confirmed: true };
		if (credential === void 0) {
			this.signOut(target);
			return {
				confirmed: false,
				reason: `no stored ChatGPT account is filed under ${target}`
			};
		}
		const result = await revokeGrant(credential, {
			...this.options.endpoints?.revocationEndpoint === void 0 ? {} : { revocationEndpoint: this.options.endpoints.revocationEndpoint },
			...this.options.endpoints?.discoveryUrl === void 0 ? {} : { discoveryUrl: this.options.endpoints.discoveryUrl },
			...options
		});
		this.signOut(target);
		return result;
	}
	/** Forget one account, or every account when no subject is named. */
	signOut(subject) {
		return this.mutate(() => this.signOutUnlocked(subject));
	}
	signOutUnlocked(subject) {
		const document = this.load();
		if (subject === void 0) {
			const { active: _cleared, ...rest } = document;
			this.save({
				...rest,
				accounts: {}
			});
			return;
		}
		const accounts = { ...document.accounts };
		delete accounts[subject];
		const nextActive = document.active === subject ? Object.keys(accounts)[0] : document.active;
		this.save({
			...document,
			accounts,
			...nextActive === void 0 ? { active: void 0 } : { active: nextActive }
		});
	}
	/** Account facts for the settings surface. */
	status() {
		const document = this.load();
		const active = this.active();
		const entries = Object.entries(document.accounts);
		return {
			signedIn: active !== void 0 && canSpendPlan(active),
			planUsageDenied: active !== void 0 && !canSpendPlan(active),
			...active?.email === void 0 ? {} : { email: active.email },
			...active?.planType === void 0 ? {} : { plan: active.planType },
			...active === void 0 ? {} : { expiresAt: active.expiresAt },
			accounts: entries.map(([subject, credential]) => ({
				subject,
				...credential.email === void 0 ? {} : { email: credential.email },
				active: subject === document.active
			}))
		};
	}
};
export { ChatGptAuth, RefreshRefusedError };

//# sourceMappingURL=manager.js.map