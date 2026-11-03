/** Debounced, serialized writes. Only the newest draft may update UI status. */
export function createAutosave<T>(write: (value: T) => Promise<void>, report: (state: 'waiting' | 'saving' | 'saved' | 'error', error?: unknown) => void, delay = 600) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: { value: T, version: number } | undefined
  let version = 0
  let running: Promise<void> | undefined
  let ready = false
  const drain = (): Promise<void> => {
    if (running) return running.then(() => ready && pending ? drain() : undefined)
    if (!ready || !pending) return Promise.resolve()
    const entry = pending
    pending = undefined
    ready = false
    report('saving')
    running = (async () => {
      try {
        await write(entry.value)
        if (entry.version === version) report('saved')
      } catch (error) {
        if (entry.version === version) report('error', error)
      }
    })().finally(() => { running = undefined })
    return running.then(() => ready && pending ? drain() : undefined)
  }
  const flush = (): Promise<void> => {
    clearTimeout(timer)
    timer = undefined
    ready = true
    return drain()
  }
  return {
    schedule(value: T, immediate = false): void {
      pending = { value, version: ++version }
      ready = false
      clearTimeout(timer)
      report('waiting')
      if (immediate) void flush()
      else timer = setTimeout(() => { void flush() }, delay)
    },
    flush,
    /** Discard only writes that have not started (e.g. stopping a monitor). */
    cancel(): void {
      clearTimeout(timer)
      pending = undefined
      ready = false
      version += 1
    },
  }
}
