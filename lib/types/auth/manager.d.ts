/**
 * The one place that owns this installation's ChatGPT credential state.
 *
 * Two concerns meet here and nowhere else: which account is active, and whether
 * its access token is still usable. The active account is persisted locally;
 * refreshes share one in-flight promise per authorization, because callers must
 * never refresh the same grant twice —
 * a refresh rotates the refresh token, so a second refresh using the old one is
 * refused and would look like a dead credential rather than a race.
 *
 * The remote surface reads account *facts* from here (email, plan, expiry) and
 * never a token.
 *
 * @module dsh-plugin-chatgpt-subscription/auth/manager
 */
import { type SignInAttempt, type SignInOptions } from './sign-in.ts';
import { RefreshRefusedError } from './refresh.ts';
import { type ChatGptCredential } from './credential.ts';
import { type RevocationResult, type RevokeOptions } from './revoke.ts';
/** What the UI may know about this installation's ChatGPT access. */
export interface ChatGptStatus {
    /** Whether at least one account is authorized and can spend its plan. */
    signedIn: boolean;
    /** Whether a grant exists but the plan-usage scope was not granted. */
    planUsageDenied: boolean;
    /** The active account's email, when known. */
    email?: string;
    /** The active account's ChatGPT plan name, when known. */
    plan?: string;
    /** When the active access token stops being usable, epoch milliseconds. */
    expiresAt?: number;
    /** Local account keys (normally ID-token subjects), never used as replay identities. */
    accounts: {
        subject: string;
        email?: string;
        active: boolean;
    }[];
}
/** Options for {@link ChatGptAuth}. */
export interface ChatGptAuthOptions {
    /** The directory this installation's state lives in. */
    stateDir: string;
    /** The app name the human sees on the consent screen. */
    agentNameHint: string;
    /** Endpoint overrides (tests). */
    endpoints?: {
        authorizeUrl?: string;
        tokenUrl?: string;
        preferredPort?: number;
        /** Test-only signature verifier for synthetic issuer fixtures. */
        verifyIdTokenSignature?: SignInOptions['verifyIdTokenSignature'];
        /** Override the revocation endpoint. */
        revocationEndpoint?: string;
        /** Override the discovery document that names the revocation endpoint. */
        discoveryUrl?: string;
    };
}
/**
 * Owns the stored grants, one active account, and the sign-in attempts in
 * flight.
 */
export declare class ChatGptAuth {
    private readonly file;
    private readonly options;
    private document;
    private readonly refreshing;
    /**
     * @param options - where state lives and what to call this app.
     */
    constructor(options: ChatGptAuthOptions);
    /** The absolute path of the credential file, for diagnostics. */
    get storePath(): string;
    private mutationLocked;
    /** Serialize short storage transactions separately from the network refresh lock.
     * Synchronous callers fail promptly on contention instead of blocking the event loop. */
    private mutate;
    /** Wait for short cross-process transactions without blocking their event loop.
     * After rotation succeeds, retain that result here until it is committed: the
     * old refresh token has already been consumed and must never be exchanged again. */
    private mutateAsync;
    /** Load lazily so a plugin that is never used never touches the disk. */
    private load;
    /** The persisted host id, minted on first use. */
    hostId(): string;
    /** Persist a complete document. */
    private save;
    /** The active grant, or `undefined` when nothing usable is stored. */
    active(): ChatGptCredential | undefined;
    /**
     * The active grant with a usable access token, refreshing first when needed.
     *
     * @param signal - cancellation for the refresh.
     * @returns the usable credential.
     * @throws {RefreshRefusedError} when the grant can no longer be refreshed.
     */
    usable(signal?: AbortSignal): Promise<ChatGptCredential>;
    /**
     * Mint a new access token from the stored grant, once, for concurrent callers.
     *
     * Rotation is single-use — the refresh token is replaced by the exchange — so
     * two callers refreshing at once would have the second present a token the
     * first already spent, and the endpoint reports that as a dead grant rather
     * than as a race.
     */
    private rotate;
    /**
     * Exchange the stored grant for a new one, whatever the local expiry says.
     *
     * A token can be refused while it still looks valid: the endpoint answers
     * `token_expired` for a grant it has invalidated server-side, and a local clock
     * comparison cannot see that. Authorization can also change under a live
     * session — an account upgrade, a workspace switch — which retires tokens the
     * local expiry still considers good. This is the method a caller uses when the
     * endpoint has just told it the token is no good.
     *
     * @param signal - cancellation for the exchange.
     * @returns the rotated credential.
     */
    renew(signal?: AbortSignal): Promise<ChatGptCredential>;
    /** Refresh under a cross-process file lock; another process may have rotated this grant first. */
    private runRefresh;
    /** Force refresh the exact authorization that received an HTTP token refusal. */
    renewFor(credential: ChatGptCredential, signal?: AbortSignal): Promise<ChatGptCredential>;
    /**
     * Begin a sign-in. A registration already stored for this installation is
     * reused, which is what keeps the issued client id stable across sign-ins.
     *
     * @returns the attempt, already listening for its callback.
     */
    /**
     * The registration to reuse when no credential is active.
     *
     * With one account this is that account's client, so signing out and back in
     * returns to the same registration instead of registering a second client. With
     * several, the most recently confirmed one is offered and the browser's account
     * selector still decides; the returned ID token is validated against the client
     * the attempt used, as always.
     */
    private retainedRegistration;
    begin(): Promise<SignInAttempt>;
    /**
     * Store a completed grant and make it the active account.
     *
     * @param credential - what the sign-in produced.
     * @returns the local account key the grant was filed under.
     */
    adopt(credential: ChatGptCredential): string;
    private adoptUnlocked;
    /** Make an already-authorized account active. */
    activate(subject: string): void;
    private activateUnlocked;
    /**
     * End one account's session at the server, then forget it locally.
     *
     * Local removal alone would leave the grant redeemable at OpenAI, and nothing
     * would tell the account that this installation let go. The revocation is
     * attempted first; local state is cleared either way, because a user who asked
     * to sign out must end up signed out here even when the server cannot be
     * reached — but the outcome says which of the two happened.
     *
     * @param subject - the account to end; defaults to the active one.
     * @param options - endpoint overrides and cancellation.
     * @returns whether the server confirmed the revocation.
     */
    revoke(subject?: string, options?: RevokeOptions): Promise<RevocationResult>;
    /** Forget one account, or every account when no subject is named. */
    signOut(subject?: string): void;
    private signOutUnlocked;
    /** Account facts for the settings surface. */
    status(): ChatGptStatus;
}
export { RefreshRefusedError };
//# sourceMappingURL=manager.d.ts.map