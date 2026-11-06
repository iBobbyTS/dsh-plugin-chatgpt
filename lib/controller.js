import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
// src/controller.ts
/**
* The browser's way into the sign-in flow.
*
* A sign-in cannot happen in the browser: it needs a listener on the machine the
* account is being authorized for, and it ends with credentials that must never
* reach a page. So the page asks the host to start an attempt and shows what the
* host reports back — the authorization URL, the loopback address the browser
* will return to, and, once it is done, the account's display facts.
*
* The token is the one thing this surface never carries. Everything here is
* either an instruction for the human or a fact about the account.
*
* This file is only the transport. The state machine lives in
* {@link ChatGptSession}, which is testable without a gateway.
*
* @module dsh-plugin-chatgpt/controller
*/
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) {
			if (kind === "field") initializers.unshift(_);
			else descriptor[key] = _;
		}
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/** Remote owner of the ChatGPT sign-in and account surface. */
let ChatGptController = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _codexQuotaStatus_decorators;
	let _selectCodexQuota_decorators;
	let _clearCodexQuota_decorators;
	let _refreshCodexQuota_decorators;
	let _status_decorators;
	let _begin_decorators;
	let _submit_decorators;
	let _cancel_decorators;
	let _signOut_decorators;
	let _modelSwitches_decorators;
	let _setModelDisabled_decorators;
	let _setModelName_decorators;
	let _setModelContextWindow_decorators;
	let _resetModels_decorators;
	return class ChatGptController extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_codexQuotaStatus_decorators = [Remote];
			_selectCodexQuota_decorators = [Remote];
			_clearCodexQuota_decorators = [Remote];
			_refreshCodexQuota_decorators = [Remote];
			_status_decorators = [Remote];
			_begin_decorators = [Remote];
			_submit_decorators = [Remote];
			_cancel_decorators = [Remote];
			_signOut_decorators = [Remote];
			_modelSwitches_decorators = [Remote];
			_setModelDisabled_decorators = [Remote];
			_setModelName_decorators = [Remote];
			_setModelContextWindow_decorators = [Remote];
			_resetModels_decorators = [Remote];
			__esDecorate(this, null, _codexQuotaStatus_decorators, {
				kind: "method",
				name: "codexQuotaStatus",
				static: false,
				private: false,
				access: {
					has: (obj) => "codexQuotaStatus" in obj,
					get: (obj) => obj.codexQuotaStatus
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _selectCodexQuota_decorators, {
				kind: "method",
				name: "selectCodexQuota",
				static: false,
				private: false,
				access: {
					has: (obj) => "selectCodexQuota" in obj,
					get: (obj) => obj.selectCodexQuota
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _clearCodexQuota_decorators, {
				kind: "method",
				name: "clearCodexQuota",
				static: false,
				private: false,
				access: {
					has: (obj) => "clearCodexQuota" in obj,
					get: (obj) => obj.clearCodexQuota
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _refreshCodexQuota_decorators, {
				kind: "method",
				name: "refreshCodexQuota",
				static: false,
				private: false,
				access: {
					has: (obj) => "refreshCodexQuota" in obj,
					get: (obj) => obj.refreshCodexQuota
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _status_decorators, {
				kind: "method",
				name: "status",
				static: false,
				private: false,
				access: {
					has: (obj) => "status" in obj,
					get: (obj) => obj.status
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _begin_decorators, {
				kind: "method",
				name: "begin",
				static: false,
				private: false,
				access: {
					has: (obj) => "begin" in obj,
					get: (obj) => obj.begin
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _submit_decorators, {
				kind: "method",
				name: "submit",
				static: false,
				private: false,
				access: {
					has: (obj) => "submit" in obj,
					get: (obj) => obj.submit
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _cancel_decorators, {
				kind: "method",
				name: "cancel",
				static: false,
				private: false,
				access: {
					has: (obj) => "cancel" in obj,
					get: (obj) => obj.cancel
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _signOut_decorators, {
				kind: "method",
				name: "signOut",
				static: false,
				private: false,
				access: {
					has: (obj) => "signOut" in obj,
					get: (obj) => obj.signOut
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _modelSwitches_decorators, {
				kind: "method",
				name: "modelSwitches",
				static: false,
				private: false,
				access: {
					has: (obj) => "modelSwitches" in obj,
					get: (obj) => obj.modelSwitches
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _setModelDisabled_decorators, {
				kind: "method",
				name: "setModelDisabled",
				static: false,
				private: false,
				access: {
					has: (obj) => "setModelDisabled" in obj,
					get: (obj) => obj.setModelDisabled
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _setModelName_decorators, {
				kind: "method",
				name: "setModelName",
				static: false,
				private: false,
				access: {
					has: (obj) => "setModelName" in obj,
					get: (obj) => obj.setModelName
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _setModelContextWindow_decorators, {
				kind: "method",
				name: "setModelContextWindow",
				static: false,
				private: false,
				access: {
					has: (obj) => "setModelContextWindow" in obj,
					get: (obj) => obj.setModelContextWindow
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _resetModels_decorators, {
				kind: "method",
				name: "resetModels",
				static: false,
				private: false,
				access: {
					has: (obj) => "resetModels" in obj,
					get: (obj) => obj.resetModels
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		codexQuota = __runInitializers(this, _instanceExtraInitializers);
		session;
		/**
		* @param ctx - the plugin context.
		* @param session - the state machine this service carries.
		*/
		constructor(ctx, session, codexQuota) {
			super(ctx, "chatgptController", { namespace: "chatgpt" });
			this.codexQuota = codexQuota;
			this.session = session;
		}
		/** Read the independent Codex monitor configuration; never returns tokens. */
		codexQuotaStatus() {
			if (!this.codexQuota) throw new Error("Codex quota is unavailable");
			return this.codexQuota.view();
		}
		/** Human authorization only: select a Host file and grant optional refresh/writeback. */
		selectCodexQuota(path, allowRefresh, label) {
			if (!this.codexQuota) throw new Error("Codex quota is unavailable");
			return this.codexQuota.select(path, allowRefresh, label);
		}
		/** Stop monitoring without deleting or revoking the Codex authorization. */
		clearCodexQuota() {
			if (!this.codexQuota) throw new Error("Codex quota is unavailable");
			return this.codexQuota.clear();
		}
		/** Query only the selected monitor. No login or model-account switching. */
		async refreshCodexQuota() {
			if (!this.codexQuota) throw new Error("Codex quota is unavailable");
			return await this.codexQuota.refresh();
		}
		/**
		* Read the current account and attempt state.
		* @returns what the card should render.
		*/
		async status() {
			return await this.session.status();
		}
		/**
		* Open a sign-in attempt and answer with the URL to visit.
		* @returns the state, now carrying a pending attempt.
		*/
		async begin() {
			return await this.session.begin();
		}
		/**
		* Finish the open attempt from a pasted redirect URL or code.
		* @param value - the full redirect URL, or the code itself.
		* @returns the state after the exchange settles.
		*/
		async submit(value) {
			return await this.session.submit(value);
		}
		/**
		* Abandon the open attempt.
		* @returns the state with no pending attempt.
		*/
		async cancel() {
			return await this.session.cancel();
		}
		/**
		* End one account's session, revoking it at the server before clearing it here.
		* @param subject - the account to end; defaults to the active one.
		* @returns the state, and whether the server confirmed the revocation.
		*/
		async signOut(subject) {
			return await this.session.signOut(subject);
		}
		/**
		* Every roster model and whether the human switched it off.
		* @returns one row per roster model, roster order.
		*/
		async modelSwitches() {
			return await this.session.modelSwitches();
		}
		/**
		* Switch one roster model on or off; the selector reloads what it offers.
		* @param model - the exact model id on the current roster.
		* @param disabled - whether the selector should stop offering the model.
		* @returns the switch list after the change is persisted.
		*/
		async setModelDisabled(model, disabled) {
			return await this.session.setModelDisabled(model, disabled);
		}
		/**
		* Set one roster model's display name, or restore the roster's own; the
		* selector reloads what it shows.
		* @param model - the exact model id on the current roster.
		* @param name - the display name to store; `undefined` or blank removes the
		* override.
		* @returns the switch list after the change is persisted.
		*/
		async setModelName(model, name) {
			return await this.session.setModelName(model, name);
		}
		/** Set one model's context budget to a fixed model-page choice. */
		async setModelContextWindow(model, contextWindow) {
			return await this.session.setModelContextWindow(model, contextWindow);
		}
		/**
		* Clear model switches, display names and context choices.
		* @returns the switch list after the reset is persisted.
		*/
		async resetModels() {
			return await this.session.resetModels();
		}
	};
})();
export { ChatGptController };

//# sourceMappingURL=controller.js.map