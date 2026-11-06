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
/** Defaults follow the stable model ID, independent of editable display names. */
function defaultContextWindow(model) {
	const id = model.toLowerCase();
	if (id.includes("astra") || id.includes("sol")) return 1e6;
	if (id.includes("terra")) return 5e5;
	if (id.includes("luna")) return 3e5;
	return 1e6;
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
export { CONTEXT_WINDOWS, contextWindowOptions, defaultContextWindow, isContextWindow };

//# sourceMappingURL=context.js.map