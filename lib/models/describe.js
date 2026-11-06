import catalog from "./catalog.json" with { type: "json" };
// src/models/describe.ts
/**
* Describing the models an account may use.
*
* Two facts come from two different places and neither source has both. The
* subscription endpoint is authoritative about *availability* — it answers what
* this exact account on this exact plan may call right now — but it describes a
* model with a slug and a display name and nothing else. The bundled catalog
* knows capacities and reasoning spellings but cannot know what a given account
* is entitled to.
*
* So availability always comes from the account, and metadata is filled in from
* the catalog by exact id. A model the catalog has never heard of is not
* dropped: it is still callable, and a plausible default beats refusing to show
* a model the account can demonstrably use. The unknown case is where the
* shipped `catalog.json` earns its keep, and a model that stays unknown is
* visible as exactly that.
*
* @module dsh-plugin-chatgpt/models/describe
*/
const CATALOG = catalog;
/**
* Capacities assumed when the catalog does not describe a model.
*
* Deliberately conservative and deliberately visible: a model reported with
* `metadataSource: 'fallback'` is one the UI cannot describe precisely, which is
* a truthful thing to show rather than a silently invented number.
*/
const FALLBACK = {
	contextWindow: 128e3,
	maxTokens: 16384,
	input: ["text"]
};
/**
* How a reasoning effort is spelled for a human.

/** How a reasoning effort is spelled for a human. */
const EFFORT_LABELS = {
	off: "Off",
	none: "Off",
	minimal: "Minimal",
	low: "Low",
	medium: "Medium",
	high: "High",
	xhigh: "Extra high",
	max: "Max",
	ultra: "Ultra"
};
/** The escalation order efforts are offered in when nothing else orders them. */
const EFFORT_ORDER = [
	"off",
	"none",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
	"ultra"
];
/**
* Label one reasoning effort, falling back to its own wire spelling.
* @param effort - the `reasoning.effort` value.
* @returns the text a selector shows.
*/
function effortLabel(effort) {
	return EFFORT_LABELS[effort] ?? effort;
}
/** Order efforts by the canonical escalation, keeping any unknown ones at the end. */
function ordered(efforts) {
	const rank = (id) => {
		const at = EFFORT_ORDER.indexOf(id);
		return at === -1 ? EFFORT_ORDER.length : at;
	};
	return [...efforts].sort((left, right) => rank(left.id) - rank(right.id));
}
/**
* The reasoning efforts a model accepts.
*
* The bundled catalog's per-model map is treated as the authority, and the
* account's listing is intersected with it. That ordering is not a preference: on
* a live account the listing advertised `ultra` for `gpt-6-astra`, and the API
* answered a request carrying it with `400 invalid_value` — while its error text
* enumerated exactly the set the catalog already had. A listing entry is
* advisory; a level the model rejects fails the whole request.
*
* When the listing names levels the catalog does not describe at all, the
* intersection would hide a level that may well be real. That is the safer
* mistake: a missing choice costs a selection, an invalid one costs the turn.
*
* @param listed - what the account's listing reported.
* @param entry - the bundled catalog's entry, when it has one.
* @returns the efforts to offer, in escalation order.
*/
function effortsOf(listed, entry) {
	const fromCatalog = acceptedByCatalog(entry);
	const fromListing = (listed.reasoningLevels ?? []).filter((level) => level.effort.length > 0).map((level) => ({
		id: level.effort,
		name: effortLabel(level.effort),
		...level.description === void 0 ? {} : { description: level.description }
	}));
	if (fromCatalog === void 0) return ordered(fromListing);
	if (fromListing.length === 0) return ordered(fromCatalog);
	const accepted = new Set(fromCatalog.map((effort) => effort.id));
	const checked = fromListing.filter((effort) => accepted.has(effort.id));
	return ordered(checked.length > 0 ? checked : fromCatalog);
}
/**
* The efforts the bundled catalog says a model accepts, or `undefined` when the
* catalog does not describe the model.
*/
function acceptedByCatalog(entry) {
	if (entry === void 0) return void 0;
	if (!entry.reasoning) return [];
	const map = entry.thinkingLevelMap;
	if (map === void 0) return void 0;
	const efforts = [];
	for (const level of EFFORT_ORDER) {
		const wire = map[level];
		if (wire === null || wire === void 0) continue;
		efforts.push({
			id: wire,
			name: effortLabel(level)
		});
	}
	return efforts;
}
/** The effort used when a request names none. */
function defaultEffortOf(listed, efforts) {
	if (listed.defaultReasoningLevel !== void 0 && efforts.some((effort) => effort.id === listed.defaultReasoningLevel)) return listed.defaultReasoningLevel;
	const medium = efforts.find((effort) => effort.id === "medium");
	if (medium !== void 0) return medium.id;
	return efforts[Math.floor(efforts.length / 2)]?.id;
}
/** The modalities a model accepts, preferring what the endpoint declared. */
function inputOf(listed, entry) {
	const declared = listed.inputModalities ?? entry?.input;
	if (declared === void 0 || declared.length === 0) return [...FALLBACK.input];
	const kept = declared.filter((value) => value === "text" || value === "image");
	return kept.length === 0 ? [...FALLBACK.input] : kept;
}
/**
* Describe one listed model.
*
* Metadata comes from the endpoint that listed it whenever the endpoint supplied
* it, and from the bundled catalog otherwise. The catalog is a fallback, not the
* primary source: treating it as primary would let a stale snapshot override the
* live description of a model the account is actually entitled to.
*
* @param listed - what the account's listing reported.
* @returns everything the harness needs to offer and call the model.
*/
function describeModel(listed) {
	const entry = CATALOG[listed.slug];
	const match = /^gpt-(\d+(?:\.\d+)?)-([a-zA-Z]+)$/.exec(listed.slug);
	const suffix = match?.[2];
	const name = suffix === void 0 ? listed.displayName ?? entry?.name ?? listed.slug : `GPT ${match?.[1]} ${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`;
	const describedByEndpoint = listed.contextWindow !== void 0 || listed.reasoningLevels !== void 0 && listed.reasoningLevels.length > 0 || listed.inputModalities !== void 0;
	const efforts = effortsOf(listed, entry);
	const defaultEffort = defaultEffortOf(listed, efforts);
	const contextWindow = listed.contextWindow ?? entry?.contextWindow ?? FALLBACK.contextWindow;
	const maxTokens = entry?.maxTokens;
	return {
		id: listed.slug,
		name,
		contextWindow,
		...listed.maxContextWindow === void 0 ? {} : { maxContextWindow: listed.maxContextWindow },
		...maxTokens === void 0 ? {} : { maxTokens },
		...listed.description === void 0 ? {} : { description: listed.description },
		input: inputOf(listed, entry),
		...efforts.length === 0 ? {} : { reasoningEfforts: efforts },
		...defaultEffort === void 0 ? {} : { defaultReasoningEffort: defaultEffort },
		metadataSource: describedByEndpoint ? "endpoint" : entry === void 0 ? "fallback" : "catalog"
	};
}
/**
* Keep only the entries meant for display, preserving the server's order.
*
* The order is the server's ranking of what this account should reach for
* first, so it is worth preserving rather than imposing an alphabetical one.
*
* @param listed - every entry the listing returned.
* @returns the describable models, in the order the server gave.
*/
function describableModels(listed) {
	return listed.filter((model) => model.visibility === void 0 || model.visibility === "list").filter((model) => model.slug.length > 0).map(describeModel);
}
export { describableModels, describeModel, effortLabel };

//# sourceMappingURL=describe.js.map