/** Public quota and browser view types. No Host or browser runtime dependencies. */
export type QuotaStatus = 'ok' | 'not-configured' | 'unauthorized' | 'rate-limited' | 'unavailable' | 'invalid-response'
export interface CodexWindow { id: string, label?: string, usedPercent: number, windowSeconds?: number, resetsAt?: number }
export interface CodexSnapshot {
  observedAt: number
  accounts: { id: string, label?: string, plan?: string, status: QuotaStatus, reason?: string, retryAt?: number, windows: CodexWindow[] }[]
}
/** Structural implementation of Usage Stats quota protocol v1; no runtime dependency. */
export interface QuotaSource {
  protocolVersion: 1
  id: string
  displayName: string
  providerRoutes: string[]
  revision(): string
  read(options: { signal: AbortSignal }): Promise<CodexSnapshot>
}
export interface QuotaRegistry { protocolVersion: 1, register(source: QuotaSource): () => void }
export interface CodexQuotaView {
  path?: string
  defaultPath: string
  allowRefresh: boolean
  label: string
  snapshot?: CodexSnapshot
  error?: string
}
