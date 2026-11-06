import { isCodedError } from "./adapter.js";
// src/session.ts
/**
* The sign-in session: one open attempt, and the account facts around it.
*
* This is the logic the browser card drives, kept apart from the Remote
* decorators that carry it, because the interesting parts are the state
* transitions — one attempt at a time, a refused paste leaving the attempt open,
* a completed sign-in invalidating the roster the previous account produced — and
* those are worth testing without a gateway in the way.
*
* @module dsh-plugin-chatgpt/session
*/
/** How long `submit` waits for the token exchange before answering. */
const SUBMIT_TIMEOUT_MS = 3e4;
/**
* Owns the one open sign-in attempt and projects the account state for a page.
*
* One attempt at a time per instance: two live loopback listeners for the same
* account would race for the same callback, and the loser would report a state
* mismatch the human could do nothing about.
*/
var ChatGptSession = class {
	auth;
	adapter;
	onRosterChanged;
	pending;
	lastError;
	completing;
	/**
	* @param auth - the credential owner this session drives.
	* @param adapter - the provider adapter, told to re-ask the account after a change.
	* @param options - what to announce when the roster changes.
	*/
	constructor(auth, adapter, options = {}) {
		this.auth = auth;
		this.adapter = adapter;
		this.onRosterChanged = options.onRosterChanged ?? (() => {});
	}
	/** What the card should render now, including what the account can serve. */
	async status() {
		const status = this.auth.status();
		const pending = this.pending;
		const roster = await this.roster();
		const needsSignIn = roster.needsSignIn === true;
		return {
			...status,
			...needsSignIn ? {
				signedIn: false,
				needsSignIn: true
			} : {},
			roster,
			...pending === void 0 ? {} : { pending: {
				url: pending.authorizationUrl,
				redirectUri: pending.redirectUri
			} },
			...this.lastError === void 0 ? {} : { error: this.lastError }
		};
	}
	/**
	* The roster, or why it could not be read.
	*
	* A listing failure is reported as a fact about the account rather than thrown:
	* the card is about the account, and a count it cannot read is still something
	* the human needs to see. The listing is cached by the adapter, so asking often
	* costs nothing.
	*
	* @returns the count, or the failure in place of it, plus whether the failure
	* means the stored grant must be replaced by a new sign-in.
	*/
	async roster() {
		try {
			return { count: (await this.adapter.listModels()).length };
		} catch (error) {
			const needsSignIn = isCodedError(error) && error.code === "chatgpt_not_signed_in";
			return {
				count: 0,
				error: error instanceof Error ? error.message : String(error),
				...needsSignIn ? { needsSignIn: true } : {}
			};
		}
	}
	/**
	* Open an attempt and answer with the URL to visit.
	* @returns the state, now carrying a pending attempt.
	*/
	async begin() {
		this.cancelPending();
		this.lastError = void 0;
		try {
			const attempt = await this.auth.begin();
			this.pending = attempt;
			this.completing = attempt.result.then((credential) => {
				if (this.pending !== attempt) return;
				this.auth.adopt(credential);
				this.adapter.forgetListing();
				this.onRosterChanged();
				this.pending = void 0;
			}).catch((error) => {
				if (this.pending !== attempt) return;
				this.lastError = error instanceof Error ? error.message : String(error);
				this.pending = void 0;
			});
		} catch (error) {
			this.lastError = error instanceof Error ? error.message : String(error);
		}
		return await this.status();
	}
	/**
	* Finish the open attempt from a pasted redirect URL or code.
	*
	* A malformed value is reported as this attempt's error and leaves the attempt
	* open, so a mistyped paste can be corrected without starting over.
	*
	* @param value - the full redirect URL, or the code itself.
	* @returns the state after the exchange settles.
	*/
	async submit(value) {
		const attempt = this.pending;
		if (attempt === void 0) {
			this.lastError = "no sign-in attempt is open; start one first";
			return await this.status();
		}
		try {
			await attempt.submit(value);
		} catch (error) {
			this.lastError = error instanceof Error ? error.message : String(error);
			return await this.status();
		}
		await this.settle();
		return await this.status();
	}
	/**
	* Abandon the open attempt.
	* @returns the state with no pending attempt.
	*/
	async cancel() {
		this.cancelPending();
		return await this.status();
	}
	/**
	* End one account's session, at the server first and locally second.
	* @param subject - the account to end; defaults to the active one.
	* @returns the state, and whether the server confirmed the revocation.
	*/
	async signOut(subject) {
		this.cancelPending();
		const result = await this.auth.revoke(subject);
		this.adapter.forgetListing();
		this.onRosterChanged();
		return {
			status: await this.status(),
			revocationConfirmed: result.confirmed,
			...result.reason === void 0 ? {} : { revocationError: result.reason }
		};
	}
	/**
	* Every roster model with its switch state, for the card's model list.
	*
	* Delegated rather than duplicated: the roster and its switches have one
	* owner, and the card must not be able to see a list the selector was not
	* built from.
	*
	* @returns one row per roster model, roster order.
	*/
	async modelSwitches() {
		return await this.adapter.modelSwitches();
	}
	/**
	* Switch one roster model on or off.
	*
	* @param model - the exact model id on the current roster.
	* @param disabled - whether the selector should stop offering the model.
	* @returns the switch list after the change is persisted.
	*/
	async setModelDisabled(model, disabled) {
		return await this.adapter.setModelDisabled(model, disabled);
	}
	/**
	* Set one roster model's display name, or restore the roster's own.
	*
	* @param model - the exact model id on the current roster.
	* @param name - the display name the selector should show; `undefined` or
	* blank removes the override.
	* @returns the switch list after the change is persisted.
	*/
	async setModelName(model, name) {
		return await this.adapter.setModelName(model, name);
	}
	/** Set one model's context budget to a fixed model-page choice. */
	async setModelContextWindow(model, contextWindow) {
		return await this.adapter.setModelContextWindow(model, contextWindow);
	}
	/**
	* Clear model switches, display names and context choices.
	* @returns the switch list after the reset is persisted.
	*/
	async resetModels() {
		return await this.adapter.resetModels();
	}
	/** Wait for an in-flight exchange to settle, within one answer's patience. */
	async settle() {
		const completing = this.completing;
		if (completing === void 0) return;
		let timer;
		try {
			await Promise.race([completing, new Promise((resolve) => {
				timer = setTimeout(resolve, SUBMIT_TIMEOUT_MS);
			})]);
		} finally {
			if (timer !== void 0) clearTimeout(timer);
		}
	}
	/** Abandon the open attempt, if any. */
	cancelPending() {
		const attempt = this.pending;
		this.pending = void 0;
		this.completing = void 0;
		attempt?.cancel("superseded by a new sign-in attempt");
	}
};
export { ChatGptSession };

//# sourceMappingURL=session.js.map