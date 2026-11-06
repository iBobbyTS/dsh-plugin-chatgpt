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
const REMOTE_SERVICE_KEY = "chatgptController";
/** The wire namespace both halves address this surface by. */
const REMOTE_NAMESPACE = "chatgpt";
export { REMOTE_METHODS, REMOTE_NAMESPACE, REMOTE_SERVICE_KEY };

//# sourceMappingURL=remote-methods.js.map