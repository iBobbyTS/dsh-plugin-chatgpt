/**
 * The bundle's plugin entry point.
 *
 * A bundle is a configuration layer, so this module exists to do the two things
 * a layer cannot: own a live adapter instance, and register the provider route
 * that instance serves.
 *
 * The route name is configuration rather than a constant. The built-in pi-ai
 * plugin already serves a route literally named `openai`, and the registry
 * refuses a second registration of one name outright — so a plugin that reserved
 * that name could not be installed beside the built-in provider. A private name
 * works in both compositions, and one key lets an operator move it.
 *
 * @module dsh-plugin-chatgpt
 */
import z from '@deepseek-ai/schemastery';
import type { Volatile } from '@deepseek-ai/cordis';
import type { Context } from '@deepseek-ai/cordis';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, StreamChunk, LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm';
import { ChatGptAdapter } from './adapter.ts';
import { type ReadImage } from './convert/harness.ts';
/**
 * Route and endpoint policy for one installation.
 *
 * This is a schema rather than a bare interface for two reasons. It validates
 * what the profile supplies, and a declared schema is what gives this plugin a
 * settings namespace: the Models page derives its namespace map from plugins that
 * declare one, and renders a provider row only for a row whose namespace exists.
 * A plugin with config but no schema therefore has a route the page cannot show.
 */
export declare const Config: z<Record<string, unknown>, Config>;
/** The configuration one installation supplies, as the harness resolves it. */
export type Config = {
    provider: Volatile<string>;
    displayName: Volatile<string | undefined>;
    stateDir: Volatile<string>;
    baseUrl: Volatile<string | undefined>;
    contextWindowLimit: Volatile<number | undefined>;
    modelContextWindowLimits: Volatile<Record<string, number> | undefined>;
    streamIdleTimeoutMs: Volatile<number | undefined>;
};
/** What this plugin calls itself in diagnostics. */
export declare const name = "chatgpt";
/**
 * The settings namespace this plugin's provider row belongs to, and the key its
 * browser card registers under.
 *
 * The Models page dispatches a card's extension area by the row's settings
 * namespace, so the two halves have to agree on one string. Keeping it beside the
 * route it describes is what makes that agreement visible.
 */
export declare const SETTINGS_NS = "chatgpt";
/**
 * The name a human reads on the consent screen, and this app's identity at OpenAI.
 *
 * Separate from the display name on purpose: renaming the row in the UI must not
 * change what an already-granted client id was registered as, because the issued
 * client id is bound to the identity the human consented to.
 */
export declare const AGENT_NAME_HINT = "DeepSeek Harness";
/**
 * The services this plugin needs before it can register anything.
 *
 * Cordis resolves injected services before `apply` runs, and reading `ctx.llm`
 * without declaring it throws rather than answering undefined. The registry is
 * the whole dependency: with no registry there is no route to own.
 */
export declare const inject: string[];
/**
 * The harness's adapter contract over the plan adapter.
 *
 * The wrapping is mechanical: it renames the vocabulary and adapts the two
 * asynchronous shapes. Every decision lives below it, which is why the class
 * carries no policy of its own.
 */
export declare class HarnessAdapter extends LlmAdapter {
    private readonly readImage?;
    private readonly inner;
    private readonly route;
    /**
     * @param inner - the adapter that talks to the API.
     * @param route - the provider route this instance serves.
     */
    constructor(inner: ChatGptAdapter, route: string, readImage?: ReadImage | undefined);
    providerInfo(provider: string): {
        id: string;
        name: string;
    };
    listModels(provider: string): Promise<readonly {
        provider: string;
        id: string;
        name: string;
    }[]>;
    resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo>;
    stream(options: GenerateOptions<string>): AsyncGenerator<StreamChunk, void, undefined>;
}
/**
 * Register the ChatGPT provider route.
 *
 * The route goes into the harness's own registry, so the provider reaches every
 * consumer — the model selector, the settings page, and the agent loop — exactly
 * as a built-in provider does.
 *
 * @param ctx - the plugin context.
 * @param config - the installation's route and state location.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map