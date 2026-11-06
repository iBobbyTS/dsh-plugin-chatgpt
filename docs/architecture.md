# Architecture

[AGENTS](https://github.com/iBobbyTS/dsh-plugin-chatgpt/blob/main/AGENTS.md) owns development constraints. This document describes the provider implementation; [authentication/models](auth-and-models.md) covers user configuration.

## Understand the implementation

| Source | Responsibility |
|---|---|
| `cordis.patch.yml` | The layer: one inserted row naming the route and the state directory. |
| `src/index.ts` | The plugin entry: owns the adapter instance and registers the route. |
| `src/auth/protocol.ts` | The exact endpoints, scopes, and loopback rules of the published flow. |
| `src/auth/sign-in.ts` | Authorization: loopback listener and pasted redirect URL, raced. |
| `src/auth/manager.ts` | Stored grants, the active account, and single-flight refresh. |
| `src/auth/store.ts` | Atomic, owner-only credential storage. |
| `src/api/events.ts` | Decoding the Responses event stream and its failure modes. |
| `src/convert/request.ts` | Harness request to Responses body, including the fields the route refuses. |
| `src/convert/harness.ts` | DSH request boundary, including session identity and replay metadata. |
| `src/convert/replay.ts` | Validated native output and DSH replay envelopes, scoped to an account and model. |
| `src/convert/blocks.ts` | Wire events to the harness's numbered content blocks. |
| `src/api/client.ts` | The two HTTP calls: list models, run one turn. |
| `src/models/describe.ts` | Availability and capacities, preferring what the account reports over the bundled catalog. |
| `src/adapter.ts` | The harness-facing half of the provider contract. |

Three rules the code enforces rather than documents:

- A request never carries `temperature`, `max_output_tokens`, `top_p`, `truncation`, or the other fields the plan-usage route refuses. They are named in `REFUSED_FIELDS` so they cannot be reintroduced by accident.
- `response.completed` is the only successful terminal. A stream that ends without one is an error, because a truncated answer that reads as finished is worse than a visible failure.
- **Account metadata is read at run time.** The plugin requests `GET /v1/models` with the selected account's grant. The bundled catalog fills missing metadata, and the dated measured list can add unlisted models. Model availability and context capacity are separate from the context budget reported to DSH.




## Model Experience

This bundle inserts one provider row, and that row's plugin owns all of its model-facing behaviour; the layer itself contributes no prompt, tool, or context of its own.

### Request context and condition

#### What the model sees

For every turn routed to `chatgpt`, the adapter preserves the order of messages, assistant blocks, tool calls, and results. System and developer instructions become developer messages at their original positions. DSH is told to append system-prompt updates in history. Native assistant output, including encrypted reasoning, is retained in DSH's `replayState` and replayed for the same authorization, route, and model when the saved content is unchanged.

#### Token effect

Variable. Visible context comes from DSH. Replaying encrypted reasoning can also contribute input tokens; a readable reasoning summary is not a substitute. The adapter does not truncate history: DSH owns compaction using the reported context budget. Output reservations are kept below that budget, but this route does not accept an output-token cap.

#### KV Cache effect

The adapter preserves reusable prefixes and opaque reasoning across tool turns and session restore. A bounded hash of the local authorization namespace, client registration, endpoint, provider, session ID, and call purpose supplies both `prompt_cache_key` and the `session_id` header; token refresh does not change it. Reauthorization gets a fresh namespace; legacy grants acquire one on first load. Sessionless calls omit these identifiers. OpenAI handles cache routing automatically on GPT-5.6 and later; a key is not a cache-hit guarantee. The SIWC route requires `store: false` and full HTTP history; response storage and prompt caching are separate. Cache retention/options remain omitted, as in Pi's public SIWC path, pending model-and-route-specific validation. See the [official caching guide](https://developers.openai.com/api/docs/guides/prompt-caching) and [reasoning replay guidance](https://developers.openai.com/api/docs/guides/reasoning#preserve-reasoning-without-stored-responses).

On standard GPT-6 family models, the adapter attempts reasoning-effort changes using native `configuration_update` items while preserving the initial request-level setting. Updates survive session restore and forks; edited or compacted prefixes establish a new baseline. If the subscription route explicitly refuses those input items, the adapter retries once using request-level effort and remembers that limitation in the session. The current SIWC route rejected configuration updates in a live check on 2026-10-31, so effort changes on that route still may lose cache reuse. Other models keep request-level changes. See [route validation and replay details](cache-replay.md#reasoning-effort-changes).


## Host/client integration

- **Every Config field is `volatile()`, and that is load-bearing** — the harness builds a plugin's settings form from its volatile fields alone, and a plugin with none gets no settings namespace. The Models page renders a provider row only for a row whose namespace exists, so a schema without a volatile field leaves the route, and the card that rides it, impossible to display. Volatile fields are read through `.get()` at the point of use rather than captured as values.

- **The Client half mounts its own Remote namespace** — a bundled third-party plugin cannot reach `ctx.remote.<namespace>` on its own: the Gateway installs a namespace only from a contribution of generated descriptors, and the package carrying those for the shipped API packages is generated at build time from a fixed list of workspace packages. Nothing generates one for an out-of-tree package, and the generator is not published, so this plugin mounts the contribution itself from `src/remote-methods.ts`. A test reads the controller's source and fails when the two lists drift, because a method added on one side only would fail at the moment a user clicks.

- **Signing in announces the new roster to the browser** — a model selector caches the Host catalog and reloads it only when the Host says something changed, so a plugin that fills an empty roster at sign-in time has to publish `llm/adapters-updated`. Without it the models are served and never appear in the selector, which looks exactly like a broken provider. The account card reports how many models the account offers, or why the listing could not be read.

- **Cache statistics are measured, not predicted** — the percentage is `cacheReadTokens / (inputTokens + cacheReadTokens + cacheWriteTokens)` using provider-reported counters. Earlier versions reordered tool history and dropped native reasoning; their low hit rates do not establish an inherent SIWC limit. Prefix-preservation tests do not measure live cache hits. Compare fixed-model, fixed-effort runs after warm-up, recording cache reads/writes, total input, latency, and quota impact.
