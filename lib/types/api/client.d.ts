import type { ReadableStreamReadResult } from 'node:stream/web';
import { type ResponsesEvent } from './events.ts';
import { type NeutralRequest, type ResponsesBody } from '../convert/request.ts';
import type { ListedModel } from '../models/describe.ts';
/** Endpoints this client talks to. */
export interface ClientEndpoints {
    /** Base URL of the API; defaults to the documented resource. */
    baseUrl?: string;
}
/** The reason a call failed, in the endpoint's own terms. */
export declare class ApiError extends Error {
    /** Stable code, when the endpoint supplied one. */
    readonly code: string;
    /** HTTP status, when the failure was a response rather than a transport fault. */
    status?: number;
    /** Whether the account's plan is the thing refusing, so the human is told to check usage. */
    readonly planUsage: boolean;
    /**
     * @param message - what the endpoint reported.
     * @param code - the endpoint's own error code.
     * @param status - HTTP status, when there was one.
     */
    constructor(message: string, code: string, status?: number);
}
/**
 * List the models this account may use.
 *
 * The listing is the authority on entitlement, so nothing here filters by a
 * local list of known models: a model the account can call is offered even when
 * this plugin has no metadata for it.
 *
 * @param accessToken - the plan-usage grant's access token.
 * @param endpoints - endpoint override (tests, gateways).
 * @param signal - cancellation.
 * @returns every listed model, in the server's order.
 */
export declare function listModels(accessToken: string, endpoints?: ClientEndpoints, signal?: AbortSignal): Promise<ListedModel[]>;
/** Options for one streaming turn. */
export interface StreamTurnOptions {
    /** Adapter-prepared body paired with its durable configuration snapshot. */
    preparedBody?: ResponsesBody;
    accessToken: string;
    request: NeutralRequest;
    endpoints?: ClientEndpoints;
    signal?: AbortSignal;
    idleTimeoutMs?: number;
}
/** Read a chunk with an idle deadline instead of waiting forever on a live socket. */
export declare function readWithIdleTimeout(reader: ReadableStreamDefaultReader<Uint8Array>, timeoutMs: number): Promise<ReadableStreamReadResult<Uint8Array>>;
/**
 * Run one turn and yield its events as they arrive.
 *
 * The stream is consumed to its terminal event. A stream that ends without one
 * is reported as a failure rather than as a finished turn: the server can close
 * a connection mid-answer, and treating that close as completion is how a
 * truncated answer becomes a plausible-looking wrong one.
 *
 * @param options - the grant, the request, and cancellation.
 * @returns the decoded events, in order, ending with a terminal one.
 */
export declare function streamTurn(options: StreamTurnOptions): AsyncGenerator<ResponsesEvent, void, undefined>;
//# sourceMappingURL=client.d.ts.map