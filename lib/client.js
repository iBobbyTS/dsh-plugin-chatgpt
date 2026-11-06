window.__ModuleLoader__.load({
	id: "dsh-plugin-chatgpt",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		// \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react = require("react");
		react = __toESM(react, 1);
		let react_jsx_runtime = require("react/jsx-runtime");
		// src/remote-methods.ts
		/**
		* Every method the card may call.
		*
		* Order is the declaration order on the controller, which nothing depends on, but
		* keeping it the same makes the two lists easy to compare by eye as well as by
		* test.
		*/
		const REMOTE_METHODS = [
			{
				method: "codexQuotaStatus",
				parameters: []
			},
			{
				method: "selectCodexQuota",
				parameters: [
					{ wire: "path" },
					{ wire: "allowRefresh" },
					{ wire: "label" }
				]
			},
			{
				method: "clearCodexQuota",
				parameters: []
			},
			{
				method: "refreshCodexQuota",
				parameters: []
			},
			{
				method: "status",
				parameters: []
			},
			{
				method: "begin",
				parameters: []
			},
			{
				method: "submit",
				parameters: [{ wire: "value" }]
			},
			{
				method: "cancel",
				parameters: []
			},
			{
				method: "signOut",
				parameters: [{
					wire: "subject",
					optional: true
				}]
			},
			{
				method: "modelSwitches",
				parameters: []
			},
			{
				method: "setModelDisabled",
				parameters: [{ wire: "model" }, { wire: "disabled" }]
			},
			{
				method: "setModelName",
				parameters: [{ wire: "model" }, {
					wire: "name",
					optional: true
				}]
			},
			{
				method: "setModelContextWindow",
				parameters: [{ wire: "model" }, { wire: "contextWindow" }]
			},
			{
				method: "resetModels",
				parameters: []
			}
		];
		/** The Cordis service key the controller registers, and the descriptor's service field. */
		const REMOTE_SERVICE_KEY$1 = "chatgptController";
		/** The wire namespace both halves address this surface by. */
		const REMOTE_NAMESPACE = "chatgpt";
		// src/client/remote.ts
		/**
		* Mounting this plugin's own Client Remote namespace.
		*
		* The Gateway installs a client namespace from a contribution of generated
		* descriptors, and the package carrying those for the shipped API packages is
		* generated at build time from a fixed list of workspace packages. Nothing
		* generates one for an out-of-tree plugin, so the card would find no
		* `ctx.remote.chatgpt` however long it waited. This mounts the missing piece.
		*
		* Two validators read these descriptors and they ask for different things, which
		* is the whole difficulty of hand-writing them: the Gateway requires a `strict`
		* codec on every parameter and never calls it, while the Typert registry requires
		* that a `strict` codec also name a type symbol and provide a `create()` factory,
		* accepting `src-json` as an alternative that needs neither. Parameters satisfy
		* the first with the second's demands attached; the result is `src-json`, which
		* both accept. The codec bodies never run on this side — the declared names are
		* what the Host matches on.
		*
		* @module dsh-plugin-chatgpt/client/remote
		*/
		/** The package name the mount is attributed to, as the Gateway records it. */
		const PACKAGE = "dsh-plugin-chatgpt";
		/** How the Host receives a result this side does not need to decode. */
		const RESULT_CODEC = { mode: "src-json" };
		/**
		* A codec both validators accept, for one argument.
		*
		* `create` is never invoked on this side — the Gateway builds calls from the
		* declared wire names and sends JSON — so it returns a permissive parser rather
		* than a false claim about a schema this plugin has no way to express.
		*
		* @param typeSymbol - the name the registry records for this argument's type.
		* @returns the codec.
		*/
		function parameterCodec(typeSymbol) {
			return {
				mode: "strict",
				typeSymbol,
				create: () => ({ parse: (value) => value })
			};
		}
		/**
		* The contribution this plugin mounts.
		* @returns the descriptors, one per exposed method.
		*/
		function remoteContribution() {
			return {
				package: PACKAGE,
				descriptors: REMOTE_METHODS.map(({ method, parameters }) => ({
					id: `${PACKAGE}#${REMOTE_NAMESPACE}/${method}`,
					service: REMOTE_SERVICE_KEY$1,
					namespace: REMOTE_NAMESPACE,
					method,
					invocation: { kind: "direct" },
					parameters: parameters.map(({ wire, optional }) => ({
						name: wire,
						wire,
						source: "json",
						codec: parameterCodec(`${PACKAGE}#${REMOTE_NAMESPACE}/${method}:${wire}`),
						...optional === true ? { acceptsUndefined: true } : {}
					})),
					result: RESULT_CODEC,
					sourceLocation: {
						file: "src/controller.ts",
						line: 1,
						column: 1
					}
				}))
			};
		}
		// src/client/result.ts
		/**
		* Unwrap a Remote result, turning a refusal into a thrown error.
		*
		* The card's handlers already report a throw as the account error, so a refused
		* call reaches the human rather than being mistaken for a state.
		*
		* @param result - the envelope the namespace method resolved to.
		* @returns the value it carries.
		* @throws When the call was refused, naming the Host's code and message.
		*/
		function unwrap(result) {
			if (result.ok) return result.value;
			const { code, message } = result.error ?? {};
			if (message === void 0 || message.length === 0) return refuse(code);
			throw new Error(code === void 0 || code.length === 0 ? message : `${code}: ${message}`);
		}
		/**
		* The error for a refusal that carried no message of its own.
		* @param code - the Host's code, when it sent one.
		* @returns never; always throws.
		*/
		function refuse(code) {
			throw new Error(code === void 0 || code.length === 0 ? "the ChatGPT service refused the request" : `the ChatGPT service refused the request (${code})`);
		}
		// src/models/context.ts
		/** Fixed context budgets shared by the model card and host validation. */
		const CONTEXT_WINDOWS = [
			1e6,
			8e5,
			5e5,
			3e5
		];
		/** Whether an untrusted setting is one of the model page's choices. */
		function isContextWindow(value) {
			return CONTEXT_WINDOWS.some((choice) => choice === value);
		}
		/** Descending fixed choices plus a read-only current value from configuration. */
		function contextWindowOptions(current) {
			const values = [...CONTEXT_WINDOWS];
			if (!isContextWindow(current)) values.push(current);
			return values.sort((a, b) => b - a).map((value) => ({
				value,
				label: isContextWindow(value) ? value === 1e6 ? "1M" : `${value / 1e3}k` : String(value),
				disabled: !isContextWindow(value)
			}));
		}
		// src/client/styles.ts
		/**
		* The card's stylesheet, injected as one `<style>` element per registration.
		*
		* The bundle is a CJS artifact with no CSS pipeline, and the host row it rides
		* is styled by the Models page's own CSS modules, whose class names are hashed.
		* Everything below therefore addresses stable seams only:
		*
		* - our own `dsh-chatgpt-*` classes, and
		* - the slot anchor's `data-slot` attribute, which the slot renderer documents
		*   as the stable addressable wrapper, and
		* - substring matches on the page's local class names (`editor`, `rowName`),
		*   which survive hash changes but would need revisiting if the page renamed
		*   those classes outright.
		*
		* The layout contract with the row: collapsed, the card occupies no layout, so
		* the row is the harness's own one-line head; opened through the row's 编辑
		* button, the page mounts its unknown-namespace editor body inside the row, and
		* that mount is what makes the card visible while the page's own editor body —
		* a hint plus Apply/Cancel this card replaces — is hidden.
		*
		* @module dsh-plugin-chatgpt/client/styles
		*/
		/** The whole sheet, kept in one template so the injection stays atomic. */
		const CARD_STYLES = `
[data-codex-quota] .dsh-chatgpt-models-body { display: flex; flex-direction: column; gap: 10px; }
[data-codex-quota] label { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; }
[data-codex-quota] button {
  font: inherit; font-size: 12px; padding: 6px 10px; border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1); cursor: pointer;
}
[data-codex-quota] button:disabled { opacity: .5; cursor: default; }
[data-codex-quota] button:focus-visible, [data-codex-quota] input:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
[data-codex-quota] .dsh-chatgpt-actions { flex-wrap: wrap; }

/* Collapsed by default: the harness row already renders the one-line head
   (name, status dot, actions), so the card must add no second line. */
.dsh-chatgpt-card { display: none; }

/* The row's editor mount is the plugin-visible spelling of "编辑 opened".
   When it exists, the card becomes the row's editor body. */
li:has(> div[data-slot="settings.models.provider-card"] .dsh-chatgpt-card):has(> div[class*="editor"]) .dsh-chatgpt-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* The page's unknown-namespace editor body (a managed-elsewhere hint plus
   Apply/Cancel) carries nothing this card does not; the card replaces it. */
li:has(> div[data-slot="settings.models.provider-card"] .dsh-chatgpt-card) > div[class*="editor"] {
  display: none !important;
}

/* Sign-in dot beside the row title, mirroring the page's credential dots.
   Green: signed in and usable. Amber: signed in, but plan usage is not
   authorized. Red: signed out, or the stored grant must be replaced. */
li:has([data-chatgpt-signin="in"]) span[class*="rowName"]::after,
li:has([data-chatgpt-signin="warn"]) span[class*="rowName"]::after,
li:has([data-chatgpt-signin="out"]) span[class*="rowName"]::after {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-left: 6px;
  border-radius: 50%;
  vertical-align: middle;
}
li:has([data-chatgpt-signin="in"]) span[class*="rowName"]::after {
  background: var(--dsw-alias-state-success-primary);
}
li:has([data-chatgpt-signin="warn"]) span[class*="rowName"]::after {
  background: var(--dsw-alias-state-warn-primary);
}
li:has([data-chatgpt-signin="out"]) span[class*="rowName"]::after {
  background: var(--dsw-alias-state-error-primary);
}

/* Account facts, in the page's field-label voice. */
.dsh-chatgpt-facts { display: flex; flex-direction: column; gap: 2px; }
.dsh-chatgpt-fact {
  display: flex;
  gap: 10px;
  align-items: baseline;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
}
.dsh-chatgpt-factlabel {
  flex: none;
  min-width: 5rem;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

/* The model list rides the page's collapsed-details pattern: hidden until the
   summary is expanded, so the editor opens on the account facts alone. */
.dsh-chatgpt-models {
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  padding-top: 10px;
}
.dsh-chatgpt-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  padding: 2px 4px;
  margin-left: -4px;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
  list-style: none;
}
.dsh-chatgpt-summary::-webkit-details-marker { display: none; }
.dsh-chatgpt-summary::before {
  content: '';
  width: 5px;
  height: 5px;
  border-right: 1.5px solid currentcolor;
  border-bottom: 1.5px solid currentcolor;
  transform: rotate(-45deg) translate(-1px, -1px);
  transition: transform 120ms ease;
}
.dsh-chatgpt-models[open] > .dsh-chatgpt-summary::before {
  transform: rotate(45deg) translate(-1px, -1px);
}
.dsh-chatgpt-summary:hover { color: var(--dsw-alias-label-primary); }
.dsh-chatgpt-summary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
}

.dsh-chatgpt-models-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
}
.dsh-chatgpt-models-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dsh-chatgpt-meta {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-chatgpt-restore {
  flex: none;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.dsh-chatgpt-restore:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-chatgpt-restore:disabled { opacity: 0.4; cursor: default; }
.dsh-chatgpt-restore:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
}

/* One model: editable display name, the slug it names, and the offering
   switch — the page's own model-row grid, one column narrower. */
.dsh-chatgpt-model {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 76px auto;
  align-items: center;
  gap: 6px;
}
.dsh-chatgpt-nameinput, .dsh-chatgpt-contextselect {
  box-sizing: border-box;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}
.dsh-chatgpt-nameinput:focus, .dsh-chatgpt-contextselect:focus {
  outline: none;
  border-color: var(--dsw-alias-state-business-primary);
}
.dsh-chatgpt-nameinput::placeholder { color: var(--dsw-alias-label-dimmed); }
.dsh-chatgpt-slug {
  font-family: var(--ds-font-family-code);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 540px) {
  .dsh-chatgpt-model { grid-template-columns: minmax(0, 1fr) 76px auto; }
  .dsh-chatgpt-nameinput { grid-column: 1; grid-row: 1; }
  .dsh-chatgpt-slug { grid-column: 1; grid-row: 2; }
  .dsh-chatgpt-contextselect { grid-column: 2; grid-row: 1 / 3; }
  .dsh-chatgpt-model > :last-child { grid-column: 3; grid-row: 1 / 3; }
}

.dsh-chatgpt-actions { display: flex; gap: 8px; }
.dsh-chatgpt-urlrow { display: flex; gap: 8px; align-items: center; }
.dsh-chatgpt-urlinput {
  flex: 1;
  min-width: 0;
  font-family: var(--ds-font-family-code);
  font-size: 12px;
  line-height: 18px;
  padding: 6px 8px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}
.dsh-chatgpt-urlinput:focus { outline: none; border-color: var(--dsw-alias-state-business-primary); }

.dsh-chatgpt-note {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-chatgpt-error {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-error-primary);
}

@media (prefers-reduced-motion: reduce) {
  .dsh-chatgpt-summary::before { transition: none; }
}
`;
		/**
		* Install the sheet and answer its disposer.
		*
		* Each registration installs its own element, so overlapping registrations
		* (a re-apply before the previous fiber unwinds) dispose independently instead
		* of fighting over one shared node.
		*
		* @returns the disposer that removes this installation's element.
		*/
		function installCardStyles() {
			if (typeof document === "undefined") return () => {};
			const element = document.createElement("style");
			element.dataset.dshPluginChatgpt = "card-styles";
			element.textContent = CARD_STYLES;
			document.head.appendChild(element);
			return () => {
				element.remove();
			};
		}
		// src/client/autosave.ts
		/** Debounced, serialized writes. Only the newest draft may update UI status. */
		function createAutosave(write, report, delay = 600) {
			let timer;
			let pending;
			let version = 0;
			let running;
			let ready = false;
			const drain = () => {
				if (running) return running.then(() => ready && pending ? drain() : void 0);
				if (!ready || !pending) return Promise.resolve();
				const entry = pending;
				pending = void 0;
				ready = false;
				report("saving");
				running = (async () => {
					try {
						await write(entry.value);
						if (entry.version === version) report("saved");
					} catch (error) {
						if (entry.version === version) report("error", error);
					}
				})().finally(() => {
					running = void 0;
				});
				return running.then(() => ready && pending ? drain() : void 0);
			};
			const flush = () => {
				clearTimeout(timer);
				timer = void 0;
				ready = true;
				return drain();
			};
			return {
				schedule(value, immediate = false) {
					pending = {
						value,
						version: ++version
					};
					ready = false;
					clearTimeout(timer);
					report("waiting");
					if (immediate) flush();
					else timer = setTimeout(() => {
						flush();
					}, delay);
				},
				flush,
				/** Discard only writes that have not started (e.g. stopping a monitor). */
				cancel() {
					clearTimeout(timer);
					pending = void 0;
					ready = false;
					version += 1;
				}
			};
		}
		// src/client/codex-quota.tsx
		const MESSAGES = {
			"reauth-required": "请在 Codex 重新登录，再重试查询。",
			"credential-conflict": "授权文件被其他程序更新，未覆盖。请重试或重新登录 Codex。",
			"persistence-failed": "刷新结果尚未落盘；请恢复文件写权限并重试，不要重复登录或切换文件。",
			"refresh-busy": "凭据刷新正在进行或锁文件尚未释放，请稍后重试。",
			"invalid-auth-file": "授权文件或上游额度响应格式无效。",
			"unsupported-auth-mode": "仅支持 auth_mode 为 chatgpt 的 Codex 授权文件。",
			"file-unavailable": "无法读取授权文件：请检查路径、所有者及权限，不支持符号链接。",
			"quota-unavailable": "额度查询暂不可用，请稍后重试。",
			"absolute-host-path-required": "请输入运行 DSH 的主机上的绝对路径。"
		};
		/** User-only file authorization. The browser never reads or uploads auth.json contents. */
		function CodexQuotaCard({ remote }) {
			const [view, setView] = (0, react.useState)();
			const [draft, setDraft] = (0, react.useState)({
				path: "",
				label: "",
				allowRefresh: false
			});
			const draftRef = (0, react.useRef)(draft);
			const [busy, setBusy] = (0, react.useState)(false);
			const [saveState, setSaveState] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)();
			const autosave = (0, react.useRef)();
			const failed = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				let mounted = true;
				const saver = createAutosave(async (next) => {
					const result = unwrap(await (await remote()).selectCodexQuota(next.path.trim(), next.allowRefresh, next.label));
					if (mounted) setView(result);
				}, (state, failure) => {
					if (!mounted) return;
					failed.current = state === "error";
					setSaveState(state);
					const message = failure instanceof Error ? failure.message : "";
					setError(state === "error" ? Object.hasOwn(MESSAGES, message) ? message : "quota-unavailable" : void 0);
				});
				autosave.current = saver;
				remote().then((api) => api.codexQuotaStatus()).then((result) => {
					const next = unwrap(result);
					if (!mounted) return;
					const initial = {
						path: next.path ?? "",
						label: next.label,
						allowRefresh: next.allowRefresh
					};
					setView(next);
					setDraft(initial);
					draftRef.current = initial;
				}).catch(() => {
					if (mounted) setError("quota-unavailable");
				});
				return () => {
					mounted = false;
					saver.flush();
				};
			}, [remote]);
			const change = (patch, immediate = false) => {
				const next = {
					...draftRef.current,
					...patch
				};
				draftRef.current = next;
				setDraft(next);
				if (next.path.trim()) autosave.current?.schedule(next, immediate);
				else {
					autosave.current?.cancel();
					setSaveState("");
					setError("absolute-host-path-required");
				}
			};
			const flush = () => {
				if (failed.current && draftRef.current.path.trim()) autosave.current?.schedule(draftRef.current, true);
				else autosave.current?.flush();
			};
			const act = async (clear) => {
				setBusy(true);
				try {
					if (clear) autosave.current?.cancel();
					await autosave.current?.flush();
					if (!clear && failed.current) return;
					const api = await remote();
					const next = unwrap(await (clear ? api.clearCodexQuota() : api.refreshCodexQuota()));
					setView(next);
					setError(void 0);
					if (clear) {
						const empty = {
							path: "",
							label: next.label,
							allowRefresh: next.allowRefresh
						};
						draftRef.current = empty;
						setDraft(empty);
						setSaveState("");
					}
				} catch (failure) {
					const message = failure instanceof Error ? failure.message : "";
					setError(Object.hasOwn(MESSAGES, message) ? message : "quota-unavailable");
				} finally {
					setBusy(false);
				}
			};
			const reason = error ?? view?.error;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: "dsh-chatgpt-models",
				"data-codex-quota": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", {
					className: "dsh-chatgpt-summary",
					children: "Codex 剩余额度（独立监控账号）"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-chatgpt-models-body",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-chatgpt-note",
							children: "指定运行 DSH 的主机上的 Codex 授权文件；不会上传文件内容，不改变上面的 ChatGPT 调用账号。设置自动保存，文本停止输入 600ms 或离开输入框时保存；勾选授权立即生效。ChatGPT 后端额度接口可能发生变化。"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["授权文件路径", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "dsh-chatgpt-urlinput",
							"aria-label": "Codex auth.json Host 路径",
							value: draft.path,
							disabled: busy || !view,
							onChange: (event) => change({ path: event.target.value }),
							onBlur: flush,
							placeholder: "~/.codex/auth.json",
							style: {
								width: "100%",
								boxSizing: "border-box"
							}
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: busy || !view,
							onClick: () => change({ path: view?.defaultPath ?? "" }, true),
							children: "填入默认路径"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["监控账号昵称", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "dsh-chatgpt-urlinput",
							"aria-label": "Codex 监控账号昵称",
							value: draft.label,
							maxLength: 80,
							disabled: busy || !view,
							onChange: (event) => change({ label: event.target.value }),
							onBlur: flush
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							style: { display: "block" },
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: draft.allowRefresh,
								disabled: busy || !view,
								onChange: (event) => change({ allowRefresh: event.target.checked }, true)
							}), "允许使用 refresh_token 刷新，并原子写回此文件（与 Codex 共享；不保证非协作进程的并发刷新无冲突）"]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-chatgpt-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: busy || !view?.path || !draft.path.trim(),
								onClick: () => {
									act(false);
								},
								children: "查询额度"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: busy || !view?.path,
								onClick: () => {
									act(true);
								},
								children: "停止监控"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							role: "status",
							children: saveState === "waiting" ? "等待自动保存…" : saveState === "saving" ? "正在自动保存…" : saveState === "saved" ? "已自动保存" : saveState === "error" ? "自动保存失败；修改设置或重新离开输入框可重试。" : ""
						}),
						reason ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-chatgpt-error",
							role: "alert",
							children: MESSAGES[reason] ?? "额度暂不可用。"
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							"aria-live": "polite",
							children: [
								busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "正在处理…" }) : null,
								view?.snapshot?.accounts.map((account) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
									account.label,
									" · ",
									account.plan ?? "Codex",
									" · ",
									account.status
								] }), account.windows.map((window) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
									window.label ?? window.id,
									"：剩余 ",
									(100 - window.usedPercent).toFixed(1),
									"%",
									window.resetsAt === void 0 ? "" : ` · 重置 ${new Date(window.resetsAt).toLocaleString()}`
								] }, window.id))] }, account.id)),
								view?.snapshot ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: "dsh-chatgpt-note",
									children: [
										"观测时间：",
										new Date(view.snapshot.observedAt).toLocaleString(),
										"。这是账号窗口额度，不是本会话 token 余额。"
									]
								}) : null
							]
						})
					]
				})]
			});
		}
		// src/client/index.tsx
		/**
		* The ChatGPT card on the Models page.
		*
		* It rides the provider row's extension area, and it borrows the row's own
		* chrome: the harness renders the one-line head (provider name, status dot,
		* actions) and opens its editor when the human presses 编辑. The card stays
		* out of layout until that editor exists — the collapsed row is the harness's
		* line alone — and then serves as the editor's body: the account facts, the
		* model list behind a collapsed disclosure, and the sign-out action. The
		* page's own editor body for this namespace (a managed-elsewhere hint plus
		* Apply/Cancel) is hidden; the card replaces it. The seams this relies on and
		* their fallback behavior are documented in ./styles.ts, which owns the CSS.
		*
		* The Host owns every part of the flow that touches a credential. A sign-in needs
		* a listener on this machine and ends with tokens that must never reach a page, so
		* the card only asks the Host to start an attempt and reports what comes back.
		* Nothing here holds a token, and nothing here could leak one.
		*
		* @module dsh-plugin-chatgpt/client
		*/
		/** The namespace this plugin's provider row is registered under. */
		const SETTINGS_NS = "chatgpt";
		/**
		* How long the card waits for the Remote namespace before calling it unreachable.
		*
		* The namespace map arrives with the connection rather than with the bundle, so a
		* card can mount before its own namespace exists. Failing at that moment would
		* report a broken plugin for a race that resolves by itself.
		*/
		const REMOTE_WAIT_MS = 15e3;
		/** How often the card looks for the namespace while waiting. */
		const REMOTE_POLL_MS = 250;
		/** The Cordis service key the Gateway installs this plugin's namespace under. */
		const REMOTE_SERVICE_KEY = `remote.${REMOTE_NAMESPACE}`;
		/**
		* The Remote namespace for this plugin, or `undefined` before it is installed.
		*
		* Read two ways that both matter:
		*
		* - Through `ctx.get`, not `ctx.remote.<namespace>`. The accessor form demands a
		*   declared dependency on the namespace, and this plugin is the thing that
		*   installs it: injecting it would mean waiting for a service this plugin creates
		*   itself, which never settles.
		* - On every call, not once when the bundle loads. The namespace arrives with the
		*   mount and the connection, so a card that resolved it once would keep the empty
		*   answer it got at load for as long as the window lives.
		*
		* @param ctx - the browser plugin context.
		* @returns the namespace, once it is usable.
		*/
		function remoteNow(ctx) {
			const namespace = ctx.get(REMOTE_SERVICE_KEY);
			return typeof namespace?.status === "function" ? namespace : void 0;
		}
		/**
		* Wait for the Remote namespace to arrive.
		* @param ctx - the browser plugin context.
		* @returns the namespace.
		* @throws When it never arrives, naming the action that fixes it.
		*/
		async function waitForRemote(ctx) {
			const deadline = Date.now() + REMOTE_WAIT_MS;
			for (;;) {
				const namespace = remoteNow(ctx);
				if (namespace !== void 0) return namespace;
				if (Date.now() >= deadline) throw new Error("the ChatGPT service is not reachable from this window; reload the window and try again");
				await new Promise((resolve) => {
					setTimeout(resolve, REMOTE_POLL_MS);
				});
			}
		}
		/** Services this plugin consumes from the page. */
		const inject = ["slots", "remote"];
		/**
		* Register the card.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			ctx.effect(() => installCardStyles());
			const mounting = ctx.remote.$mount(remoteContribution()).then(() => void 0, (error) => error instanceof Error ? error.message : String(error));
			ctx.slots.inject("settings.models.provider-card", () => ctx.slots.register({
				name: "settings.models.provider-card",
				key: SETTINGS_NS
			}, () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChatGptCard, {
				ctx,
				mounting
			})));
		}
		/**
		* The card itself.
		* @param props.ctx - the browser plugin context carrying the Remote namespace.
		* @param props.mounting - why mounting the Remote namespace failed, when it did.
		*/
		function ChatGptCard({ ctx, mounting }) {
			const [status, setStatus] = (0, react.useState)(void 0);
			const [pasted, setPasted] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			/** Set when signing out worked locally but the server did not confirm it. */
			const [revocationNote, setRevocationNote] = (0, react.useState)(void 0);
			/** The roster's switch rows, once an account is being shown. */
			const [switches, setSwitches] = (0, react.useState)(void 0);
			/** Why the switch list could not be read or written, until the next attempt. */
			const [switchesError, setSwitchesError] = (0, react.useState)(void 0);
			/** The write in flight, so the rows it touches wait. */
			const [pendingWrite, setPendingWrite] = (0, react.useState)(void 0);
			/** Hand-edited display names not yet committed, keyed by model id. */
			const [nameDrafts, setNameDrafts] = (0, react.useState)({});
			/**
			* The card's write queue.
			*
			* One gesture can start two writes — leaving a name field commits it, and the
			* same click then lands on a switch. Each write is a Host-side read-modify-write
			* over one file, so overlapping requests could interleave into a lost update;
			* chaining them keeps the second's read after the first's write.
			*/
			const writeQueue = (0, react.useRef)(Promise.resolve());
			const urlRef = (0, react.useRef)(null);
			const refresh = (0, react.useCallback)(async () => {
				try {
					const refused = await mounting;
					if (refused !== void 0) throw new Error(`the sign-in service could not be mounted: ${refused}`);
					const remote = await waitForRemote(ctx);
					setStatus(unwrap(await remote.status()));
				} catch (error) {
					setStatus({
						signedIn: false,
						planUsageDenied: false,
						accounts: [],
						error: error instanceof Error ? error.message : String(error)
					});
				}
			}, [ctx, mounting]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			(0, react.useEffect)(() => {
				if (status?.pending === void 0) return;
				const timer = setInterval(() => {
					refresh();
				}, 2e3);
				return () => {
					clearInterval(timer);
				};
			}, [status?.pending, refresh]);
			const accountShown = status !== void 0 && status.needsSignIn !== true && (status.signedIn || status.planUsageDenied);
			(0, react.useEffect)(() => {
				if (!accountShown) {
					setSwitches(void 0);
					setSwitchesError(void 0);
					return;
				}
				let cancelled = false;
				(async () => {
					try {
						const rows = unwrap(await (await waitForRemote(ctx)).modelSwitches());
						if (!cancelled) {
							setSwitches(rows);
							setSwitchesError(void 0);
						}
					} catch (error) {
						if (!cancelled) setSwitchesError(error instanceof Error ? error.message : String(error));
					}
				})();
				return () => {
					cancelled = true;
				};
			}, [
				ctx,
				accountShown,
				status?.roster?.count
			]);
			/**
			* Run one roster write and adopt the switch list the Host answers with.
			*
			* Writes are chained on {@link writeQueue} — one gesture can legitimately
			* start two (leaving a name field commits it, the same click lands on a
			* switch) — so nothing here may disable controls to keep writes apart: the
			* queue already does, and disabling is what made the next focus target drop
			* the click and the list visibly dim while a write was in flight.
			*
			* @param pending - the write to mark in flight, for the row that owns it.
			* @param write - the Remote call, answering the fresh switch list.
			* @param onSuccess - runs with the fresh list once it is adopted; name drafts
			* reconcile against it so committed text stays on screen until this moment.
			*/
			const writeSwitches = (0, react.useCallback)(async (pending, write, onSuccess) => {
				const run = writeQueue.current.then(async () => {
					setPendingWrite(pending);
					try {
						const rows = unwrap(await write(await waitForRemote(ctx)));
						setSwitches(rows);
						onSuccess?.(rows);
						setSwitchesError(void 0);
					} catch (error) {
						setSwitchesError(error instanceof Error ? error.message : String(error));
					} finally {
						setPendingWrite(void 0);
					}
				});
				writeQueue.current = run.then(() => void 0, () => void 0);
				return await run;
			}, [ctx]);
			/** Write one toggle; the selector rebuilds its offering on the Host's announcement. */
			const toggle = (0, react.useCallback)((model, offered) => {
				writeSwitches({
					kind: "model",
					id: model
				}, (remote) => remote.setModelDisabled(model, !offered));
			}, [writeSwitches]);
			/**
			* Commit one display name; blank restores the roster's own.
			*
			* The draft stays until the write lands, so the field never flashes empty
			* mid-round-trip, and it survives a failure for the user to retry.
			*/
			const renameModel = (0, react.useCallback)((model, name) => {
				writeSwitches({
					kind: "model",
					id: model
				}, (remote) => remote.setModelName(model, name), (rows) => {
					setNameDrafts((previous) => {
						const next = {};
						for (const [id, draft] of Object.entries(previous)) {
							const row = rows.find((entry) => entry.id === id);
							if (row === void 0) continue;
							const trimmed = draft.trim();
							if (trimmed === row.name) continue;
							if (trimmed.length === 0 && row.name === row.defaultName) continue;
							next[id] = draft;
						}
						return next;
					});
				});
			}, [writeSwitches]);
			/** Clear every switch and name override; drafts drop when the reset lands. */
			const resetAll = (0, react.useCallback)(() => {
				writeSwitches({ kind: "reset" }, (remote) => remote.resetModels(), () => {
					setNameDrafts({});
				});
			}, [writeSwitches]);
			const act = (0, react.useCallback)(async (operation) => {
				setBusy(true);
				try {
					const remote = await waitForRemote(ctx);
					setStatus(unwrap(await operation(remote)));
				} catch (error) {
					setStatus((previous) => ({
						signedIn: false,
						planUsageDenied: false,
						accounts: [],
						...previous,
						error: error instanceof Error ? error.message : String(error)
					}));
				} finally {
					setBusy(false);
				}
			}, [ctx]);
			const quotaRemote = (0, react.useCallback)(async () => {
				if (await mounting !== void 0) throw new Error("quota-unavailable");
				return await waitForRemote(ctx);
			}, [ctx, mounting]);
			if (status === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-chatgpt-card",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dsh-chatgpt-note",
					children: "Contacting the ChatGPT service…"
				})
			});
			const pending = status.pending;
			const activeSubject = status.accounts.find((entry) => entry.active)?.subject;
			const needsSignIn = status.needsSignIn === true;
			const showsAccount = accountShown;
			const signInState = needsSignIn ? "out" : status.signedIn ? status.planUsageDenied ? "warn" : "in" : "out";
			const accountLabel = [status.email ?? activeSubject ?? "unknown", status.plan].filter((part) => part !== void 0 && part.length > 0).join(" · ");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-chatgpt-card",
				"data-chatgpt-signin": signInState,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexQuotaCard, { remote: quotaRemote }),
					status.error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-chatgpt-error",
						children: status.error
					}),
					revocationNote === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-chatgpt-note",
						children: revocationNote
					}),
					showsAccount ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-chatgpt-facts",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-chatgpt-fact",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-chatgpt-factlabel",
									children: "Account"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: accountLabel })]
							}), status.expiresAt === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-chatgpt-fact",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-chatgpt-factlabel",
									children: "Token"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: `refreshes automatically (valid to ${new Date(status.expiresAt).toLocaleTimeString()})` })]
							})]
						}),
						status.planUsageDenied ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-chatgpt-note",
							children: "Authorize plan usage to use this account."
						}) : null,
						switchesError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-chatgpt-error",
							children: switchesError
						}),
						switches === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
							className: "dsh-chatgpt-models",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", {
								className: "dsh-chatgpt-summary",
								children: "Models"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-chatgpt-models-body",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dsh-chatgpt-models-head",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "dsh-chatgpt-meta",
										children: `${String(switches.length)} models · a switch only changes what the selector offers; a name is display-only`
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dsh-chatgpt-restore",
										disabled: switches.every((row) => !row.disabled && row.name === row.defaultName && row.contextWindow === row.defaultContextWindow),
										onClick: resetAll,
										children: "Restore defaults"
									})]
								}), switches.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NameRow, {
									model,
									saving: pendingWrite?.kind === "model" && pendingWrite.id === model.id,
									draft: nameDrafts[model.id],
									onDraft: (value) => {
										setNameDrafts((previous) => ({
											...previous,
											[model.id]: value
										}));
									},
									onDropDraft: () => {
										setNameDrafts((previous) => {
											const next = { ...previous };
											delete next[model.id];
											return next;
										});
									},
									onToggle: (offered) => {
										toggle(model.id, offered);
									},
									onRename: (name) => {
										renameModel(model.id, name);
									},
									onContextWindow: (value) => {
										writeSwitches({
											kind: "model",
											id: model.id
										}, (remote) => remote.setModelContextWindow(model.id, value));
									}
								}, model.id))]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-chatgpt-actions",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								disabled: busy,
								onClick: () => {
									act(async (remote) => {
										const result = await remote.signOut(activeSubject);
										if (!result.ok) return result;
										const outcome = result.value;
										setRevocationNote(outcome.revocationConfirmed ? void 0 : `Signed out on this machine, but the server did not confirm the revocation${outcome.revocationError === void 0 ? "" : ` (${outcome.revocationError})`}. Disconnect the app in ChatGPT settings to be sure.`);
										return {
											ok: true,
											value: outcome.status
										};
									});
								},
								children: "Sign out"
							})
						})
					] }) : pending === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						needsSignIn ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-chatgpt-error",
							children: "The stored ChatGPT grant was refused and cannot be refreshed. Sign in again to restore plan usage; the model selector will reload the account's models."
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-chatgpt-note",
							children: "Use your ChatGPT subscription instead of an API key. Signing in authorizes this installation to spend your plan on model calls; the token stays on this machine."
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-chatgpt-actions",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								disabled: busy,
								onClick: () => {
									act((remote) => remote.begin());
								},
								children: "Sign in with ChatGPT"
							})
						})
					] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: "dsh-chatgpt-note",
							children: [
								"Open the authorization page. When the browser returns to",
								" ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: pending.redirectUri }),
								", this card finishes on its own."
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-chatgpt-urlrow",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								ref: urlRef,
								readOnly: true,
								value: pending.url,
								"aria-label": "Authorization URL",
								onFocus: (event) => {
									event.currentTarget.select();
								},
								className: "dsh-chatgpt-urlinput"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								size: "sm",
								onClick: () => {
									window.open(pending.url, "_blank", "noopener");
									urlRef.current?.select();
								},
								children: "Open"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-chatgpt-note",
							children: "If the browser cannot reach that address, paste the final URL it landed on instead."
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-chatgpt-urlrow",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									value: pasted,
									placeholder: pending.redirectUri,
									onChange: (event) => {
										setPasted(event.target.value);
									},
									style: {
										flex: 1,
										minWidth: 0
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									disabled: busy || pasted.trim().length === 0,
									onClick: () => {
										act(async (remote) => {
											const next = await remote.submit(pasted.trim());
											setPasted("");
											return next;
										});
									},
									children: "Finish"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "ghost",
									disabled: busy,
									onClick: () => {
										act((remote) => remote.cancel());
									},
									children: "Cancel"
								})
							]
						})
					] })
				]
			});
		}
		/**
		* One model row: the display name under edit, the slug it names, and the switch.
		*
		* The name commits on blur or Enter; Escape drops the draft. An empty commit
		* restores the roster's own name, which is what the placeholder shows while no
		* override is set. Nothing here is disabled by a write elsewhere on the card:
		* writes are serialized by the card's queue, and a disabled control is what
		* ate the next focus and dimmed the list mid-save. Only this row's own switch
		* waits for its own write, so a double-click cannot queue two toggles.
		*/
		function NameRow(props) {
			const { model } = props;
			const commit = () => {
				const draft = props.draft;
				if (draft === void 0) return;
				const trimmed = draft.trim();
				if (trimmed === model.name) {
					props.onDropDraft();
					return;
				}
				if (trimmed.length === 0 && model.name === model.defaultName) {
					props.onDropDraft();
					return;
				}
				props.onRename(trimmed.length === 0 ? void 0 : trimmed);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-chatgpt-model",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "text",
						className: "dsh-chatgpt-nameinput",
						value: props.draft ?? (model.name === model.defaultName ? "" : model.name),
						placeholder: model.defaultName,
						"aria-label": `Display name for ${model.id}`,
						onChange: (event) => {
							props.onDraft(event.target.value);
						},
						onBlur: commit,
						onKeyDown: (event) => {
							if (event.key === "Enter") commit();
							if (event.key === "Escape") props.onDropDraft();
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-chatgpt-slug",
						title: model.id,
						children: model.id
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
						className: "dsh-chatgpt-contextselect",
						"aria-label": `Context window for ${model.id}`,
						title: "Context window",
						value: model.contextWindow,
						disabled: props.saving,
						onChange: (event) => {
							props.onContextWindow(Number(event.currentTarget.value));
						},
						children: contextWindowOptions(model.contextWindow).map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: option.value,
							disabled: option.disabled,
							children: option.label
						}, option.value))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
						checked: !model.disabled,
						onChange: (offered) => {
							props.onToggle(offered);
						},
						label: `Offer ${model.id} in the model selector`,
						disabled: props.saving,
						title: props.saving ? "Saving…" : void 0
					})
				]
			});
		}
		exports.ChatGptCard = ChatGptCard;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map