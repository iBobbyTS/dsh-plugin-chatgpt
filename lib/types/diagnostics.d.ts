export type DiagnosticOutcome = 'completed' | 'failed' | 'incomplete' | 'http_error' | 'transport_error' | 'aborted' | 'cancelled' | 'empty_stream' | 'stream_ended_early' | 'timeout';
export interface DiagnosticContext {
    callId: string;
    attempt: number;
    provider: string;
    sessionId?: string;
    purpose?: string;
    authorizationScope?: string;
    capabilityFallback: boolean;
}
export interface DiagnosticAttempt {
    response(response: Response): void;
    payload(payload: string): void;
    end(outcome: DiagnosticOutcome): void;
}
/** No prompts, outputs, credentials, URLs, tool schemas, or arbitrary server strings reach the writer. */
export declare class RequestDiagnostics {
    private readonly directory;
    private readonly enabled;
    private readonly file;
    private readonly baselines;
    private sequence;
    private warned;
    constructor(directory: string, enabled?: () => boolean);
    private warn;
    private write;
    /** serializedBody and sessionHeader are the exact values passed to fetch, after every fallback. */
    begin(serializedBody: string, sessionHeader: string | undefined, endpoint: string, context: DiagnosticContext): DiagnosticAttempt | undefined;
}
//# sourceMappingURL=diagnostics.d.ts.map