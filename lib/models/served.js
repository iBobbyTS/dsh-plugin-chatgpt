// src/models/served.ts
/**
* Models measured to be servable through ChatGPT plan usage.
*
* The account's own listing is the first source for a roster, but it is not a
* complete one: it advertises five of the models this route serves and omits
* several others that answer normally when asked for by id. Measured on a live
* Plus subscription, asking for `gpt-6-sol`, `gpt-6-luna`, or `gpt-6.1-sol` was
* answered under the requested id with `response.completed`, while the listing
* mentioned none of them.
*
* The bundled catalog is not a roster source either. It carries forty-five
* OpenAI model ids drawn from the API-key surface, and thirty-six of them are
* refused on this route — every `gpt-4*`, every `o1`/`o3`/`o4`, the coding and
* realtime variants, and `gpt-5` through `gpt-5.4`. Offering them would populate
* the selector with models that cannot answer.
*
* So this is the intersection that matters: the newest families, which are what
* this route is for. It is measurement, not inference, and the date it was
* measured is recorded so a reader knows how old the evidence is.
*
* @module dsh-plugin-chatgpt/models/served
*/
/**
* The day the original list was measured against a live subscription. Entries
* added later carry their own {@link ServedModel.measuredOn}; re-measure with
* `scripts/probe-served-models.mjs` when the roster looks stale.
*/
const SERVED_MEASURED_ON = "2026-10-04";
/**
* Models this route served on the measurement date, in family order.
*
* Every id here was verified to complete a turn. The listing advertises most of
* them; the ones it omits are marked, because that omission is the finding that
* made this list necessary.
*/
const SERVED_MODELS = [
	{
		id: "gpt-6-astra",
		advertised: true,
		reasoningEfforts: [
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		]
	},
	{
		id: "gpt-6-sol",
		advertised: false,
		reasoningEfforts: [
			"none",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		]
	},
	{
		id: "gpt-6-luna",
		advertised: false,
		reasoningEfforts: [
			"none",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		]
	},
	{
		id: "gpt-6.1-sol",
		advertised: false,
		reasoningEfforts: [
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		]
	},
	{
		id: "gpt-6.1-terra",
		advertised: true,
		measuredOn: "2026-10-27",
		reasoningEfforts: [
			"none",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		]
	},
	{
		id: "gpt-5.6-sol",
		advertised: true,
		reasoningEfforts: [
			"none",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		]
	},
	{
		id: "gpt-5.6-terra",
		advertised: true,
		reasoningEfforts: [
			"none",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		]
	},
	{
		id: "gpt-5.6-luna",
		advertised: true,
		reasoningEfforts: [
			"none",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		]
	},
	{
		id: "gpt-5.5",
		advertised: true,
		reasoningEfforts: [
			"none",
			"low",
			"medium",
			"high",
			"xhigh"
		]
	}
];
/**
* The largest configurable context budget the account's listing advertised
* for this generation on the measurement date, in tokens.
*
* This is catalog metadata, not an independently tested maximum request size.
* Explicit context overrides in this plugin take precedence over it, following
* Pi's override behavior rather than Codex's catalog clamping.
*
* Listed models use live metadata. This historical value is retained only as
* metadata for measured models omitted from the account catalog; their default
* context budget comes from the bundled model description.
*/
const ROUTE_MAX_CONTEXT_WINDOW = 872e3;
/**
* The largest output the published specification allows for this generation,
* matching the bundled catalog.
*/
const ROUTE_MAX_OUTPUT_TOKENS = 128e3;
/** Whether an id was measured as servable on this route. */
function isServed(id) {
	return SERVED_MODELS.some((entry) => entry.id === id);
}
/** The measurement recorded for one model, when there is one. */
function servedRecord(id) {
	return SERVED_MODELS.find((entry) => entry.id === id);
}
export { ROUTE_MAX_CONTEXT_WINDOW, ROUTE_MAX_OUTPUT_TOKENS, SERVED_MEASURED_ON, SERVED_MODELS, isServed, servedRecord };

//# sourceMappingURL=served.js.map