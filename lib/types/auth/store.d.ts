/**
 * Where one installation's ChatGPT grants live.
 *
 * This is credential state, not configuration, so it has its own rules: the
 * file is written atomically (a torn write would lose a working grant and force
 * a fresh browser sign-in), it is owner-only, and it never carries anything the
 * request path does not read. Tokens are stored as opaque strings and are never
 * logged, echoed into an error, or exposed over the plugin's remote surface —
 * the UI sees account facts, never a bearer token.
 *
 * Grants are keyed by the account subject rather than by installation, because
 * one installation can legitimately hold several ChatGPT accounts (work and
 * personal) and each has its own issued client id, its own refresh token, and
 * its own plan. Keying by subject is what lets an account be switched without
 * discarding the other.
 *
 * @module dsh-plugin-chatgpt-subscription/auth/store
 */
import type { ChatGptCredential } from './credential.ts';
/** The persisted document. */
export interface ChatGptStoreDocument {
    /** Format version, so a future change can migrate rather than guess. */
    version: 1;
    /** The stable `urn:uuid:` host id this installation registers as. */
    hostId: string;
    /** Grants by account subject. */
    accounts: Record<string, ChatGptCredential>;
    /** The subject whose grant the request path uses; absent when no account is active. */
    active?: string;
    /**
     * The issued client each account registered, kept after signing out.
     *
     * A client registration belongs to the account, not to the session: the
     * documentation is explicit that signing out retains the account/client mapping
     * and that signing back in with a saved account "does not create a new client".
     * Dropping this with the credential would make every sign-out followed by a
     * sign-in register again, and each registration is another app row in the
     * account's ChatGPT settings.
     */
    registrations?: Record<string, ChatGptRegistration>;
}
/** What a sign-in registered, retained independently of the credential. */
export interface ChatGptRegistration {
    /** The issued `oaiapp_…` id this account registered. */
    clientId: string;
    /** The account's email, used as `login_hint` on a later sign-in. */
    email?: string;
    /** When this registration was last confirmed, for choosing the most recent. */
    at: number;
}
/** An empty document for a fresh installation. */
export declare function emptyDocument(hostId: string): ChatGptStoreDocument;
/** Read one document, tolerating absence and rejecting corruption loudly. */
export declare function readDocument(file: string): ChatGptStoreDocument | undefined;
/**
 * Write one document atomically and owner-only.
 *
 * The rename is what makes it atomic: a reader either sees the previous file or
 * the complete new one, never a half-written grant.
 *
 * @param file - the target path.
 * @param document - the complete document to store.
 */
export declare function writeDocument(file: string, document: ChatGptStoreDocument): void;
//# sourceMappingURL=store.d.ts.map