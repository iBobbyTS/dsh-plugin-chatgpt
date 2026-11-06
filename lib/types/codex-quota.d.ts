import type { Context } from '@deepseek-ai/cordis';
type Json = Record<string, unknown>;
export type { QuotaStatus, CodexWindow, CodexSnapshot, QuotaSource, QuotaRegistry, CodexQuotaView } from './quota-protocol.ts';
import type { CodexWindow, CodexSnapshot, QuotaSource, CodexQuotaView } from './quota-protocol.ts';
export declare function parseCodexQuota(body: Json, at: number): CodexWindow[];
/** Shared registration path used by the plugin and real-Cordis lifecycle tests. */
export declare function registerCodexQuota(ctx: Context, quota: CodexQuota, route: string): void;
export declare class CodexQuota {
    private selection;
    private readonly selectionPath;
    private readonly controller;
    private selectionController;
    private last;
    private lastRevision;
    private lastError;
    private epoch;
    private flight;
    private readonly fetchImpl;
    private readonly now;
    constructor(stateDir: string, fetchImpl?: typeof fetch, now?: () => number);
    view(): CodexQuotaView;
    /** Human-only authorization: selecting also explicitly grants optional refresh/writeback. */
    select(path: string, allowRefresh: boolean, label: string): CodexQuotaView;
    clear(): CodexQuotaView;
    private save;
    revision(): string;
    source(route: string): QuotaSource;
    dispose(): void;
    read({ signal }: {
        signal: AbortSignal;
    }): Promise<CodexSnapshot>;
    refresh(): Promise<CodexQuotaView>;
    private query;
    private accountId;
}
//# sourceMappingURL=codex-quota.d.ts.map