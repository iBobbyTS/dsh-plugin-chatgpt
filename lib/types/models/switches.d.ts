/**
 * The per-installation record of how the human reshaped the roster: which
 * models are switched off, and which carry a hand-set display name.
 *
 * Both are statements about what the selector should offer and show, in the
 * same vocabulary the roster uses: exact model ids. The record lives beside the
 * grant in the state directory, owner-only, because it is preference rather
 * than credential but belongs to this installation the same way.
 *
 * The file is small and whole-file: one edit rewrites it under the same
 * advisory lock the credential uses, so a CLI process and the host cannot
 * interleave a read-modify-write into a lost update.
 *
 * @module dsh-plugin-chatgpt/models/switches
 */
import { type ContextWindow } from './context.ts';
export type { ModelSwitchView } from './view.ts';
/** The hand-set reshaping of the roster, as the file stores it. */
export interface ModelOverridesFile {
    /** Exact model ids switched off, in no significant order. */
    disabled: readonly string[];
    /** Model id → display name the selector should show instead of the roster's. */
    names: Readonly<Record<string, string>>;
    /** Optional for compatibility with installations predating the model picker. */
    contextWindows?: Readonly<Record<string, ContextWindow>>;
}
/**
 * Read the roster overrides.
 *
 * A missing file is no overrides rather than a failure: the first edit on a
 * fresh installation reads one, and a state directory that predates the file
 * (or that only ever carried the original `disabled`-only shape) has none.
 *
 * @param stateDir - the installation's state directory.
 * @returns the stored overrides, with `names` empty when the file carries none.
 * @throws When the file exists but is neither valid JSON nor the expected
 * shape, naming the file and the fix, because silently ignoring it would make
 * an edit appear to work and then come back.
 */
export declare function readModelOverrides(stateDir: string): Promise<ModelOverridesFile>;
/**
 * Persist the roster overrides, replacing the file wholesale.
 *
 * @param stateDir - the installation's state directory, created when absent.
 * @param overrides - every switch and name override to store.
 */
export declare function writeModelOverrides(stateDir: string, overrides: ModelOverridesFile): Promise<void>;
//# sourceMappingURL=switches.d.ts.map