# Authentication and models

[Install this fork](../README.md). The account flow and model settings below apply after loading its built checkout.

### Sign in

Open **Settings → Models**. The plugin owns a **ChatGPT** row, and the card on that row offers **Sign in with ChatGPT**. The card shows the authorization URL and selects it for copying, accepts the final redirect URL pasted back when the browser cannot reach the loopback address, and afterwards reports the account — its plan, the token's next refresh, and how many models it offers — with a **Sign out** button. No token reaches the page.

Signing out revokes the renewable session at the authorization server before clearing it locally, and says so when the server did not confirm.

Optional **Codex quota monitoring** is configured independently in the same card. Select a Host auth-file path and explicitly grant refresh/writeback if desired; it never changes the inference account. With a compatible Usage Stats plugin, sanitized quota windows are shared through the optional Host protocol. See [Codex quota setup and safety limits](codex-quota.md).

![The ChatGPT row on the Models page, where the account signs in](../assets/screenshot-2-models-page.png)

A headless harness drives the same session object with no browser at all:

```js
import { ChatGptAuth } from 'dsh-plugin-chatgpt/auth'

const auth = new ChatGptAuth({
  stateDir: `${process.env.DSH_HOME ?? `${process.env.HOME}/.dsh`}/chatgpt-subscription`,
  agentNameHint: 'DeepSeek Harness',
})

const attempt = await auth.begin()
console.log('Open this URL in your browser:\n' + attempt.authorizationUrl)

// The browser redirects to the loopback listener this attempt bound. If the
// redirect cannot reach it — a headless host, or a blocked popup — paste the
// final URL back instead.
// await attempt.submit('<the full redirect URL from your browser>')

const credential = await attempt.result
auth.adopt(credential)
```

The grant is stored owner-only under `stateDir`. `attempt.submit()` rejects a malformed or mismatched value and leaves the attempt open, so a mistyped paste can be corrected.


<a id="what-you-get"></a>
## What you get

One provider route, listed in **Settings → Models** like any built-in provider, with the model roster, context windows, and reasoning levels the account is entitled to. Selecting a model there is what puts it in the model selector; no separate picker is involved.

Default model names and placeholders first match the full slug pattern `gpt-{number}-{letters}` (including decimal versions): `gpt-5.6-sol` becomes `GPT 5.6 Sol`, and `gpt-6-astra` becomes `GPT 6 Astra`. Other slugs keep their account or catalog names. Saved display-name overrides still take precedence.

Set each model’s context window in **Settings → Models → ChatGPT → Models**. Each row offers four choices: **1M**, **800k**, **500k**, and **300k** (decimal tokens). Changes are saved on this installation and take effect the next time DSH resolves that model.

Without an explicit config budget, defaults match the stable model ID, ignoring case: IDs containing `astra` or `sol` use **1M**, `terra` uses **500k**, and `luna` uses **300k**. All other IDs use **1M**. Editing a display name does not change this rule. **Restore defaults** clears saved model-page choices, switches, and names; context then follows config or the model-ID default.

Saved model-page choices override `modelContextWindowLimits`, then `contextWindowLimit`, then the model-ID default. A config budget outside the four choices remains visible as its exact numeric value in descending order, but its dropdown option is disabled. After selecting a fixed choice, the custom value cannot be selected again from the dropdown. Budgets are not clamped to account-catalog metadata; they do not change service-side request limits or Codex settings. DSH still reserves space for output and compaction.

![The model picker listing the account's own models under a ChatGPT group](../assets/screenshot-3-model-picker.png)

The share of the plan this installation may spend is set per app, in ChatGPT settings:

![The ChatGPT app's share of the plan, set per app in ChatGPT settings](../assets/screenshot-4-app-limits.png)


## Known Limitations and Deferred Work

- **Existing histories remain usable** — older sessions have no encrypted replay state to recover. Their visible messages and tools are replayed in order. Edited, pruned, foreign, malformed, or incompatible replay metadata falls back to visible history without reintroducing discarded content. This integration requires a DSH host supporting `finish.replayState` and `systemPromptUpdate: "in-history"`; see [the replay design and validation plan](cache-replay.md).

- **One account at a time in the UI** — the host keeps every authorized account separate and can sign one out by subject, but the card shows and switches only the active account, so adding a second one means signing out first.
- **Images are sent through DSH attachments** — retained DSH image references are loaded as verified bytes and sent to vision-capable models as `input_image` data URLs, retaining their position in the conversation. Images intentionally offloaded by DSH remain placeholders. Requests fail explicitly if the attachment service is missing, rather than pretending the model saw the image. DSH converts file attachments into read-only path handles before calling the adapter; files are not uploaded natively through this route.
- **The plan-usage route is in preview** — computer use, Code Interpreter, file search, hosted MCP, image generation, and `tool_search` are refused upstream regardless of what this plugin sends, and `multi_agent`, `temperature`, and `max_output_tokens` are among fifteen fields that must be omitted.
- **The roster mixes two sources with different authority** — the account's listing supplies advertised models with the endpoint's own metadata; the models this route measurably serves but the listing omits are added from `src/models/served.ts`, dated by when they were measured. A listing that changes under a stale measurement will show extras that no longer answer, and `includeUnlisted: false` narrows the roster to the account's own answer.
- **One installation, one host id** — the host id is scoped to the state directory. Two profiles sharing one directory are one installation to OpenAI; two directories are two, and each is consented separately.
- **`agent_name_hint` is a constant** — it defaults to `DeepSeek Harness` and can be overridden per profile, but it is what a human reads on the consent screen and what OpenAI records as this app's identity, so changing it changes how existing grants are attributed.

- **Context growth has a configurable budget** — choose 1M, 800k, 500k, or 300k per model on the Models page. Model-ID defaults and saved choices determine the budget reported to DSH; DSH controls the compaction trigger and headroom. This is a context budget, not a hard spending limit or a cache-hit target.

- **Signing out is two things, and the card says which happened** — the renewable session is revoked at the authorization server before the credential is cleared here, because a grant deleted locally may still be live elsewhere. When the server cannot be reached the sign-out still completes locally, and the outcome says the remote revocation was not confirmed. An exhausted allowance names ChatGPT's own usage page and says that the code identifies neither the cause nor a reset time: the plan's shared usage and an app-specific limit are both possible, which is why a plan that looks well within its limits on the site and a refusal can both be true.

- **Each installation registers its own client** — ChatGPT settings lists one app row per registration, named by `agent_name_hint`, and this plugin keeps the account/client mapping after signing out so the next sign-in on the same installation reuses its row instead of adding another. A second state directory is a second installation to OpenAI, and registers separately; deleting a state directory is what forgets one.

See [usage accounting and unresolved protocol limits](usage-accounting.md) for missing cache details and malformed counters. A missing cache bucket does not establish zero usage; the current fallback cannot guarantee an exact uncached-input breakdown.
