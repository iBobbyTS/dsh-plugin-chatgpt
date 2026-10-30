/** Fixed context budgets shared by the model card and host validation. */
export const CONTEXT_WINDOWS = [1000000, 800000, 500000, 300000] as const

export type ContextWindow = typeof CONTEXT_WINDOWS[number]

/** Whether an untrusted setting is one of the model page's choices. */
export function isContextWindow(value: unknown): value is ContextWindow {
  return CONTEXT_WINDOWS.some(choice => choice === value)
}

/** Defaults follow the stable model ID, independent of editable display names. */
export function defaultContextWindow(model: string): ContextWindow {
  const id = model.toLowerCase()
  if (id.includes('astra') || id.includes('sol')) return 1000000
  if (id.includes('terra')) return 500000
  if (id.includes('luna')) return 300000
  return 1000000
}

/** Descending fixed choices plus a read-only current value from configuration. */
export function contextWindowOptions(current: number): readonly { value: number, label: string, disabled: boolean }[] {
  const values: number[] = [...CONTEXT_WINDOWS]
  if (!isContextWindow(current)) values.push(current)
  return values.sort((a, b) => b - a).map(value => ({
    value,
    label: isContextWindow(value) ? value === 1000000 ? '1M' : `${value / 1000}k` : String(value),
    disabled: !isContextWindow(value),
  }))
}
