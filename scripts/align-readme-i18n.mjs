/**
 * Regenerate `docs/README.zh.md` from `README.md`, keeping the two pages line-for-line
 * equal.
 *
 * The bilingual convention here is not "translate the prose". The English and
 * Chinese pages must match frontmatter key order, headings, blank lines,
 * paragraphs, list items, tables, code fences, and total physical line count one
 * to one. A translation pass cannot guarantee that by itself: a paragraph is one
 * physical line whatever its language, so a hand-wrapped translation silently
 * changes the count.
 *
 * The mapping is therefore **one English line to one Chinese line**, held in a
 * flat table below. A line with no entry must be structural — a fence, a
 * heading, a table rule, an anchor, or blank. Anything else is reported as a gap
 * rather than passed through, because English leaking into the Chinese page is
 * the one failure nothing else would catch.
 *
 *   node scripts/align-readme-i18n.mjs           # rewrite docs/README.zh.md
 *   node scripts/align-readme-i18n.mjs --check   # fail if the pair drifted
 *
 * @module dsh-plugin-chatgpt/scripts/align-readme-i18n
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const englishPath = join(here, '..', 'README.md')
const chinesePath = join(here, '..', 'docs', 'README.zh.md')

/** Chinese text for each English line that carries prose, keyed exactly. */
const LINE_TRANSLATIONS = {
  "Optional **Codex quota monitoring** is configured independently in the same card. Select a Host auth-file path and explicitly grant refresh/writeback if desired; it never changes the inference account. With a compatible Usage Stats plugin, sanitized quota windows are shared through the optional Host protocol. See [Codex quota setup and safety limits](docs/codex-quota.md).":
    "同一卡片可独立配置 **Codex 剩余额度监控**：选择 Host 授权文件路径，并按需明确允许刷新与原子写回；它不会改变模型调用账号。启用兼容的 Usage Stats 后，通过可选 Host 协议共享脱敏额度窗口。详见 [Codex 额度设置与安全限制](codex-quota.md)。",
  "On standard GPT-6 family models, the adapter attempts reasoning-effort changes using native `configuration_update` items while preserving the initial request-level setting. Updates survive session restore and forks; edited or compacted prefixes establish a new baseline. If the subscription route explicitly refuses those input items, the adapter retries once using request-level effort and remembers that limitation in the session. The current SIWC route rejected configuration updates in a live check on 2026-10-31, so effort changes on that route still may lose cache reuse. Other models keep request-level changes. See [route validation and replay details](docs/cache-replay.md#reasoning-effort-changes).":
    "GPT-6 系列模型在 standard 模式下，适配器会尝试通过原生 `configuration_update` 切换推理深度，保留首次请求的顶层设置。切换记录支持恢复会话和 fork；历史前缀被编辑或压缩后重新建立基线。如果订阅路由明确拒绝此类输入项，适配器会使用请求级深度重试一次，并在会话中记住该限制。2026-10-31 的线上检查中，当前 SIWC 路由拒绝了配置更新，因此该路由切换深度仍可能丢失缓存复用。其他模型继续使用请求级切换。参见[路由验证与回放细节](cache-replay.md#reasoning-effort-changes)。",
  "English | [中文](docs/README.zh.md)":
    "[English](../README.md) | 中文",
  "Adds one DeepSeek Harness provider route, `chatgpt`, that answers model calls from a signed-in ChatGPT subscription rather than an API key. Signing in uses OpenAI's published *Sign in with ChatGPT* flow, so the account's own plan pays for inference. The route is named `chatgpt` and not `openai` because the built-in pi-ai plugin already owns that name. Models, their context windows, and their reasoning levels come from your account's own listing, so the roster follows your plan rather than a hard-coded list.":
    "为 DeepSeek Harness 增加一个 provider 路由 `chatgpt`，它用已登录的 ChatGPT 订阅而不是 API key 来应答模型调用。登录采用 OpenAI 公布的 *Sign in with ChatGPT* 流程，因此由账号自己的套餐为推理付费。路由命名为 `chatgpt` 而非 `openai`，因为内置的 pi-ai 插件已经占用了后者。模型及其上下文窗口与推理级别都来自你自己账号的列表，因此可选范围跟着套餐走，而不是一份写死的清单。",
  "![Connect DeepSeek Harness to ChatGPT](assets/screenshot-1-connect.png)":
    "![把 DeepSeek Harness 接入 ChatGPT](../assets/screenshot-1-connect.png)",
  "- [Use this package](#use-this-package)":
    "- [使用本包](#use-this-package)",
  "- [What you get](#what-you-get)":
    "- [你会得到什么](#what-you-get)",
  "- [Understand the implementation](#understand-the-implementation)":
    "- [实现说明](#understand-the-implementation)",
  "- [Further Exploration](#further-exploration)":
    "- [延伸阅读](#further-exploration)",
  "- [Model Experience](#model-experience)":
    "- [模型体验](#model-experience)",
  "- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)":
    "- [已知限制与待办](#known-limitations-and-deferred-work)",
  "- [Dev Note](#dev-note)":
    "- [开发者说明](#dev-note)",
  "## Use this package":
    "## 使用本包",
  "### Install into a profile":
    "### 安装到 profile",
  "The whole install is one line:":
    "安装就是一行：",
  "Restart the harness afterwards: a profile is composed at startup. Removing it:":
    "装完重启 harness：profile 在启动时组合。卸载：",
  "The package is on npm, so the registry is the whole install and no build step is involved:":
    "该包已在 npm 上，因此从 registry 安装就是全部步骤，不涉及任何构建：",
  "Installing from a repository URL instead builds from source, and pnpm refuses a git dependency's build scripts until they are allowlisted: `add https://github.com/ckanner/dsh-plugin-chatgpt` fails with `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` until `dsh-plugin-chatgpt` is approved under `onlyBuiltDependencies` in the profile's `pnpm-workspace.yaml`.":
    "改从仓库地址安装则会从源码构建，而 pnpm 在构建脚本被允许之前会拒绝 git 依赖：`add https://github.com/ckanner/dsh-plugin-chatgpt` 会以 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` 失败，直到在 profile 的 `pnpm-workspace.yaml` 里把 `dsh-plugin-chatgpt` 加进 `onlyBuiltDependencies`。",
  "The package declares `dsh.bundle`, so adding it appends the bundle to the profile's `dsh.profile.bundles` and inserts its row into the composition. Verify the layer without booting:":
    "本包声明了 `dsh.bundle`，因此添加它会把该 bundle 追加到 profile 的 `dsh.profile.bundles`，并把它的行插入到组合中。可以不启动就检查这一层：",
  "A package installing without a `dsh.bundle` declaration activates no layer; `dsh plugin` warns instead.":
    "没有声明 `dsh.bundle` 的包不会激活任何层，`dsh plugin` 只会给出警告。",
  "### Sign in":
    "### 登录",
  "Open **Settings → Models**. The plugin owns a **ChatGPT** row, and the card on that row offers **Sign in with ChatGPT**. The card shows the authorization URL and selects it for copying, accepts the final redirect URL pasted back when the browser cannot reach the loopback address, and afterwards reports the account — its plan, the token's next refresh, and how many models it offers — with a **Sign out** button. No token reaches the page.":
    "打开**设置 → 模型**。本插件拥有一行 **ChatGPT**，该行的卡片提供 **Sign in with ChatGPT**。卡片会显示授权 URL 并支持选中复制；当浏览器无法访问回环地址时，可以粘贴最终的回调 URL；完成后卡片报告该账号——套餐、token 下次刷新时间、以及它提供多少个模型——并提供 **Sign out** 按钮。任何 token 都不会到达页面。",
  "Signing out revokes the renewable session at the authorization server before clearing it locally, and says so when the server did not confirm.":
    "退出登录会先在授权服务器撤销可再生会话，再清除本地凭据；若服务器未能确认，卡片会如实说明。",
  "![The ChatGPT row on the Models page, where the account signs in](assets/screenshot-2-models-page.png)":
    "![模型页上的 ChatGPT 行，账号从这里登录](../assets/screenshot-2-models-page.png)",
  "A headless harness drives the same session object with no browser at all:":
    "无头 harness 不需要浏览器，可以直接驱动同一个会话对象：",
  "The grant is stored owner-only under `stateDir`. `attempt.submit()` rejects a malformed or mismatched value and leaves the attempt open, so a mistyped paste can be corrected.":
    "授权凭据以仅属主可读的权限存放在 `stateDir` 下。`attempt.submit()` 对格式错误或不匹配的值会拒绝，并让本次尝试保持存活，所以粘贴错了可以改正重试。",
  "## What you get":
    "## 你会得到什么",
  "One provider route, listed in **Settings → Models** like any built-in provider, with the model roster, context windows, and reasoning levels the account is entitled to. Selecting a model there is what puts it in the model selector; no separate picker is involved.":
    "一个 provider 路由，像内置 provider 一样出现在 **设置 → 模型** 里，带有该账号有权使用的模型清单、上下文窗口和推理级别。在那里选中某个模型，就是把它放进模型选择器的方式，不涉及任何单独的挑选界面。",
  "Default model names and placeholders first match the full slug pattern `gpt-{number}-{letters}` (including decimal versions): `gpt-5.6-sol` becomes `GPT 5.6 Sol`, and `gpt-6-astra` becomes `GPT 6 Astra`. Other slugs keep their account or catalog names. Saved display-name overrides still take precedence.":
    "默认模型名和 placeholder 优先匹配完整 slug 格式 `gpt-{数字}-{字母}`（支持小数版本号）：`gpt-5.6-sol` 显示为 `GPT 5.6 Sol`，`gpt-6-astra` 显示为 `GPT 6 Astra`。其他 slug 继续使用账号或目录中的名称；手动保存的显示名仍优先。",
  "Set each model’s context window in **Settings → Models → ChatGPT → Models**. Each row offers four choices: **1M**, **800k**, **500k**, and **300k** (decimal tokens). Changes are saved on this installation and take effect the next time DSH resolves that model.":
    "在**设置 → 模型 → ChatGPT → Models** 中配置每个模型的上下文窗口。每行提供四个选项：**1M**、**800k**、**500k** 和 **300k**（十进制 token 数）。修改保存在本机，在 DSH 下次解析该模型时生效。",
  "Without an explicit config budget, defaults match the stable model ID, ignoring case: IDs containing `astra` or `sol` use **1M**, `terra` uses **500k**, and `luna` uses **300k**. All other IDs use **1M**. Editing a display name does not change this rule. **Restore defaults** clears saved model-page choices, switches, and names; context then follows config or the model-ID default.":
    "没有显式 config 预算时，默认值按模型 ID 匹配，不区分大小写：包含 `astra` 或 `sol` 的模型使用 **1M**，包含 `terra` 的使用 **500k**，包含 `luna` 的使用 **300k**，其余模型使用 **1M**。修改显示名不会影响此规则。**Restore defaults** 会清除模型页面保存的选择、开关和显示名；上下文恢复为 config 预算或模型 ID 默认值。",
  "Saved model-page choices override `modelContextWindowLimits`, then `contextWindowLimit`, then the model-ID default. A config budget outside the four choices remains visible as its exact numeric value in descending order, but its dropdown option is disabled. After selecting a fixed choice, the custom value cannot be selected again from the dropdown. Budgets are not clamped to account-catalog metadata; they do not change service-side request limits or Codex settings. DSH still reserves space for output and compaction.":
    "模型页面保存的选择优先于 `modelContextWindowLimits`，其次是 `contextWindowLimit`，最后是模型 ID 默认值。config 中不属于四个选项的预算仍按原始数值显示，并按从大到小的顺序排列，但该下拉选项禁用。选择固定选项后，不能再从下拉框选回自定义值。预算不按账号目录元数据缩小，不会改变服务端请求限制或 Codex 设置；DSH 仍会为输出和压缩预留空间。",
  "![The model picker listing the account's own models under a ChatGPT group](assets/screenshot-3-model-picker.png)":
    "![模型选择器里，账号自己的模型列在 ChatGPT 分组下](../assets/screenshot-3-model-picker.png)",
  "The share of the plan this installation may spend is set per app, in ChatGPT settings:":
    "这个安装可以花掉的套餐份额是在 ChatGPT 设置里按应用单独设定的：",
  "![The ChatGPT app's share of the plan, set per app in ChatGPT settings](assets/screenshot-4-app-limits.png)":
    "![该应用在套餐中的额度占比，在 ChatGPT 设置里逐应用设置](../assets/screenshot-4-app-limits.png)",
  "## Understand the implementation":
    "## 实现说明",
  "<summary>Implementation internals — click to expand</summary>":
    "<summary>实现细节 — 点击展开</summary>",
  "| Source | Responsibility |":
    "| 源码 | 职责 |",
  "| `cordis.patch.yml` | The layer: one inserted row naming the route and the state directory. |":
    "| `cordis.patch.yml` | 配置层：插入一行，指明路由与状态目录。 |",
  "| `src/index.ts` | The plugin entry: owns the adapter instance and registers the route. |":
    "| `src/index.ts` | 插件入口：持有适配器实例并注册路由。 |",
  "| `src/auth/protocol.ts` | The exact endpoints, scopes, and loopback rules of the published flow. |":
    "| `src/auth/protocol.ts` | 所公布流程的精确端点、scope 与 loopback 规则。 |",
  "| `src/auth/sign-in.ts` | Authorization: loopback listener and pasted redirect URL, raced. |":
    "| `src/auth/sign-in.ts` | 授权：loopback 监听与粘贴重定向 URL，两条路径并行竞争。 |",
  "| `src/auth/manager.ts` | Stored grants, the active account, and single-flight refresh. |":
    "| `src/auth/manager.ts` | 已存凭据、当前账号，以及单飞刷新。 |",
  "| `src/auth/store.ts` | Atomic, owner-only credential storage. |":
    "| `src/auth/store.ts` | 原子写、仅属主可读的凭据存储。 |",
  "| `src/api/events.ts` | Decoding the Responses event stream and its failure modes. |":
    "| `src/api/events.ts` | 解码 Responses 事件流及其失败形态。 |",
  "| `src/convert/request.ts` | Harness request to Responses body, including the fields the route refuses. |":
    "| `src/convert/request.ts` | Harness 请求转 Responses 请求体，含该路由拒收的字段。 |",
  "| `src/convert/harness.ts` | DSH request boundary, including session identity and replay metadata. |":
    "| `src/convert/harness.ts` | DSH 请求边界，含会话身份与回放元数据。 |",
  "| `src/convert/replay.ts` | Validated native output and DSH replay envelopes, scoped to an account and model. |":
    "| `src/convert/replay.ts` | 原生输出校验及限定账号和模型的 DSH 回放封装。 |",
  "| `src/convert/blocks.ts` | Wire events to the harness's numbered content blocks. |":
    "| `src/convert/blocks.ts` | 线上事件转 Harness 的编号内容块。 |",
  "| `src/api/client.ts` | The two HTTP calls: list models, run one turn. |":
    "| `src/api/client.ts` | 两次 HTTP 调用：列出模型、跑一轮。 |",
  "| `src/models/describe.ts` | Availability and capacities, preferring what the account reports over the bundled catalog. |":
    "| `src/models/describe.ts` | 可用性与容量，优先采用账号所报的值而非内置目录。 |",
  "| `src/adapter.ts` | The harness-facing half of the provider contract. |":
    "| `src/adapter.ts` | provider 契约面向 Harness 的那一半。 |",
  "Three rules the code enforces rather than documents:":
    "代码强制而非仅记录的三条规则：",
  "- A request never carries `temperature`, `max_output_tokens`, `top_p`, `truncation`, or the other fields the plan-usage route refuses. They are named in `REFUSED_FIELDS` so they cannot be reintroduced by accident.":
    "- 请求绝不携带 `temperature`、`max_output_tokens`、`top_p`、`truncation` 等套餐额度路由拒收的字段。它们被显式列在 `REFUSED_FIELDS` 中，因此不会被误加回来。",
  "- `response.completed` is the only successful terminal. A stream that ends without one is an error, because a truncated answer that reads as finished is worse than a visible failure.":
    "- `response.completed` 是唯一成功的终态。没有它就以结束的流算作错误，因为「被截断却看起来已完成」的回答比一个可见的失败更糟。",
  "- **Account metadata is read at run time.** The plugin requests `GET /v1/models` with the selected account's grant. The bundled catalog fills missing metadata, and the dated measured list can add unlisted models. Model availability and context capacity are separate from the context budget reported to DSH.":
    "- **运行时读取账号元数据。** 插件使用当前账号的授权请求 `GET /v1/models`。内置目录补充缺失的描述，带测量日期的清单可加入未列出的模型。模型可用性、容量和报告给 DSH 的上下文预算是不同的概念。",
  "## Further Exploration":
    "## 延伸阅读",
  "- [Sign in with ChatGPT: OSS token sharing](https://developers.openai.com/siwc/token-sharing-open-source) — the published flow this implements.":
    "- [Sign in with ChatGPT: OSS token sharing](https://developers.openai.com/siwc/token-sharing-open-source) — 本包所实现的公开流程。",
  "- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) — the listing and request constraints.":
    "- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) — 列表与请求约束。",
  "- [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) — the capabilities this route does not have yet.":
    "- [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) — 该路由目前尚不具备的能力。",
  "## Model Experience":
    "## 模型体验",
  "This bundle inserts one provider row, and that row's plugin owns all of its model-facing behaviour; the layer itself contributes no prompt, tool, or context of its own.":
    "本 bundle 只插入一行 provider，该行的插件拥有全部面向模型的行为；配置层本身不贡献任何 prompt、工具或上下文。",
  "### Request context and condition":
    "### 请求上下文与条件",
  "#### What the model sees":
    "#### 模型能看到什么",
  "For every turn routed to `chatgpt`, the adapter preserves the order of messages, assistant blocks, tool calls, and results. System and developer instructions become developer messages at their original positions. DSH is told to append system-prompt updates in history. Native assistant output, including encrypted reasoning, is retained in DSH's `replayState` and replayed for the same authorization, route, and model when the saved content is unchanged.":
    "每轮发往 `chatgpt` 的请求都保留消息、助手内容块、工具调用及结果的原始顺序。system 与 developer 指令在原位置作为 developer 消息发送，并向 DSH 声明在历史中追加系统提示更新。助手的原生输出（含加密推理）通过 DSH 的 `replayState` 保存；授权、路由、模型一致且内容未变化时，完整回放这些数据。",
  "#### Token effect":
    "#### Token 影响",
  "Variable. Visible context comes from DSH. Replaying encrypted reasoning can also contribute input tokens; a readable reasoning summary is not a substitute. The adapter does not truncate history: DSH owns compaction using the reported context budget. Output reservations are kept below that budget, but this route does not accept an output-token cap.":
    "可变。可见上下文来自 DSH；回放加密推理也可能计入输入 token，可读的思考摘要不能替代它。适配器不自行截断历史，由 DSH 按报告的上下文预算执行压缩。输出预留保持低于该预算，但这条路由不接受输出 token 上限。",
  "#### KV Cache effect":
    "#### KV Cache 影响",
  "The adapter preserves reusable prefixes and opaque reasoning across tool turns and session restore. A bounded hash of the local authorization namespace, client registration, endpoint, provider, session ID, and call purpose supplies both `prompt_cache_key` and the `session_id` header; token refresh does not change it. Reauthorization gets a fresh namespace; legacy grants acquire one on first load. Sessionless calls omit these identifiers. OpenAI handles cache routing automatically on GPT-5.6 and later; a key is not a cache-hit guarantee. The SIWC route requires `store: false` and full HTTP history; response storage and prompt caching are separate. Cache retention/options remain omitted, as in Pi's public SIWC path, pending model-and-route-specific validation. See the [official caching guide](https://developers.openai.com/api/docs/guides/prompt-caching) and [reasoning replay guidance](https://developers.openai.com/api/docs/guides/reasoning#preserve-reasoning-without-stored-responses).":
    "适配器在多轮工具调用和会话恢复中保留可复用前缀及不透明推理状态。本地授权命名空间、client 注册、端点、provider、会话 ID 和调用用途的固定长度哈希同时用于 `prompt_cache_key` 与 `session_id` 请求头；刷新 token 不改变它。重新授权会生成新命名空间，旧凭据在首次读取时补齐；无会话 ID 的调用则省略两者。GPT-5.6 及以后由 OpenAI 自动处理缓存路由，key 不保证命中。SIWC 要求 `store: false` 并在 HTTP 请求中携带完整历史，响应存储与提示词缓存是两件事。与 Pi 的公共 SIWC 路线一样，这里继续省略缓存保留期与 options，等待按模型和路由验证。参见[官方缓存指南](https://developers.openai.com/api/docs/guides/prompt-caching)及[推理回放说明](https://developers.openai.com/api/docs/guides/reasoning#preserve-reasoning-without-stored-responses)。",
  "## Known Limitations and Deferred Work":
    "## 已知限制与待办",
  "- **Existing histories remain usable** — older sessions have no encrypted replay state to recover. Their visible messages and tools are replayed in order. Edited, pruned, foreign, malformed, or incompatible replay metadata falls back to visible history without reintroducing discarded content. This integration requires a DSH host supporting `finish.replayState` and `systemPromptUpdate: \"in-history\"`; see [the replay design and validation plan](docs/cache-replay.md).":
    "- **已有历史仍可使用** — 旧会话缺失的加密回放数据无法恢复，但可见消息和工具记录会按顺序回放。对于被编辑、裁剪、来自其他适配器、格式错误或不兼容的元数据，会退回可见历史，避免重新引入已丢弃内容。此集成要求 DSH 宿主支持 `finish.replayState` 和 `systemPromptUpdate: \"in-history\"`；参见[回放设计与验证方案](cache-replay.md)。",
  "- **One account at a time in the UI** — the host keeps every authorized account separate and can sign one out by subject, but the card shows and switches only the active account, so adding a second one means signing out first.":
    "- **UI 一次只展示一个账号** — 宿主为每个已授权账号分别保存，并可按 subject 退出其中任一个，但卡片只显示与切换当前账号，因此添加第二个账号需要先退出当前账号。",
  "- **Images are sent through DSH attachments** — retained DSH image references are loaded as verified bytes and sent to vision-capable models as `input_image` data URLs, retaining their position in the conversation. Images intentionally offloaded by DSH remain placeholders. Requests fail explicitly if the attachment service is missing, rather than pretending the model saw the image. DSH converts file attachments into read-only path handles before calling the adapter; files are not uploaded natively through this route.":
    "- **图片通过 DSH 附件服务发送** — 对于未被卸载的图片引用，适配器读取已验证的图片字节，按原有消息顺序生成 `input_image` Data URL。DSH 已主动卸载的图片仍保留占位文本。缺少附件服务时会明确报错，不会假装模型看到了图片。文件附件由 DSH 在进入适配器前转换为可只读访问的文件句柄；此路线不会直接上传原生文件。",
  "- **The plan-usage route is in preview** — computer use, Code Interpreter, file search, hosted MCP, image generation, and `tool_search` are refused upstream regardless of what this plugin sends, and `multi_agent`, `temperature`, and `max_output_tokens` are among fifteen fields that must be omitted.":
    "- **套餐额度路由仍处于 preview** — computer use、Code Interpreter、file search、hosted MCP、图像生成与 `tool_search` 无论本插件发送什么都会被上游拒绝；而 `multi_agent`、`temperature` 和 `max_output_tokens` 属于必须省略的十五个字段之列。",
  "- **The roster mixes two sources with different authority** — the account's listing supplies advertised models with the endpoint's own metadata; the models this route measurably serves but the listing omits are added from `src/models/served.ts`, dated by when they were measured. A listing that changes under a stale measurement will show extras that no longer answer, and `includeUnlisted: false` narrows the roster to the account's own answer.":
    "- **名单混合了两个权威性不同的来源** — 账号的列表提供「被宣传的」模型，并附带接口自己的元数据；实测可用但列表未提及的模型来自 `src/models/served.ts`，并记录测量日期。若列表在测量过期后发生变化，会显示出已经不再应答的额外模型；`includeUnlisted: false` 可把名单收窄为账号自己的回答。",
  "- **One installation, one host id** — the host id is scoped to the state directory. Two profiles sharing one directory are one installation to OpenAI; two directories are two, and each is consented separately.":
    "- **一个安装对应一个 host id** — host id 以状态目录为作用域。两个 profile 共用一个目录，对 OpenAI 而言就是一个安装；两个目录就是两个，各自需要单独授权。",
  "- **`agent_name_hint` is a constant** — it defaults to `DeepSeek Harness` and can be overridden per profile, but it is what a human reads on the consent screen and what OpenAI records as this app's identity, so changing it changes how existing grants are attributed.":
    "- **`agent_name_hint` 是常量** — 默认 `DeepSeek Harness`，可按 profile 覆盖；但它是人类在授权页上读到的名字，也是 OpenAI 记录的此应用身份，因此改动它会改变既有授权凭据的归属。",
  "- **Context growth has a configurable budget** — choose 1M, 800k, 500k, or 300k per model on the Models page. Model-ID defaults and saved choices determine the budget reported to DSH; DSH controls the compaction trigger and headroom. This is a context budget, not a hard spending limit or a cache-hit target.":
    "- **上下文增长受可配置预算约束** — 在模型页面为每个模型选择 1M、800k、500k 或 300k。模型 ID 默认规则和保存的选择决定传给 DSH 的预算；压缩触发点和预留空间由 DSH 控制。这是上下文预算，不是消费硬上限或缓存命中目标。",
  "- **Signing out is two things, and the card says which happened** — the renewable session is revoked at the authorization server before the credential is cleared here, because a grant deleted locally may still be live elsewhere. When the server cannot be reached the sign-out still completes locally, and the outcome says the remote revocation was not confirmed. An exhausted allowance names ChatGPT's own usage page and says that the code identifies neither the cause nor a reset time: the plan's shared usage and an app-specific limit are both possible, which is why a plan that looks well within its limits on the site and a refusal can both be true.":
    "- **退出登录是两件事，卡片会说明发生了哪一件** — 可再生会话会先在授权服务器撤销，再清除本机凭据，因为本地删除的授权凭据可能在别处仍然有效。服务器无法送达时，本地登出仍然完成，而结果会明确说明远端撤销未被确认。额度耗尽时会指向 ChatGPT 自己的用量页面，并说明该错误码既不指明原因、也不给出重置时间：套餐的共享用量与应用级限制都可能是原因，因此网站上看起来远未接近上限的套餐与一次拒绝可以同时为真。",
  "- **Every Config field is `volatile()`, and that is load-bearing** — the harness builds a plugin's settings form from its volatile fields alone, and a plugin with none gets no settings namespace. The Models page renders a provider row only for a row whose namespace exists, so a schema without a volatile field leaves the route, and the card that rides it, impossible to display. Volatile fields are read through `.get()` at the point of use rather than captured as values.":
    "- **每个 Config 字段都是 `volatile()`，这是有实际作用的** — Harness 只根据 volatile 字段构建插件的 settings 表单，没有 volatile 字段的插件就不会有 settings 命名空间。而模型页只为命名空间存在的行渲染 provider 行，所以没有 volatile 字段的 schema 会让这条路由、以及依附其上的卡片，根本无法显示。volatile 字段在使用处以 `.get()` 读取，而不是被当作值捕获。",
  "- **The Client half mounts its own Remote namespace** — a bundled third-party plugin cannot reach `ctx.remote.<namespace>` on its own: the Gateway installs a namespace only from a contribution of generated descriptors, and the package carrying those for the shipped API packages is generated at build time from a fixed list of workspace packages. Nothing generates one for an out-of-tree package, and the generator is not published, so this plugin mounts the contribution itself from `src/remote-methods.ts`. A test reads the controller's source and fails when the two lists drift, because a method added on one side only would fail at the moment a user clicks.":
    "- **客户端半会自己挂载它的 Remote 命名空间** — 打包的第三方插件无法自行访问 `ctx.remote.<namespace>`：Gateway 只从生成出来的 descriptor contribution 安装命名空间，而承载这些内容的包是在构建期按固定的 workspace 包列表生成的。没有任何机制为树外包生成它，生成器也未发布，因此本插件在 `src/remote-methods.ts` 里自行挂载该 contribution。有测试会读取控制器源码，在两边列表不一致时失败——因为只在一边新增方法，会在用户点击的瞬间才报错。",
  "- **Signing in announces the new roster to the browser** — a model selector caches the Host catalog and reloads it only when the Host says something changed, so a plugin that fills an empty roster at sign-in time has to publish `llm/adapters-updated`. Without it the models are served and never appear in the selector, which looks exactly like a broken provider. The account card reports how many models the account offers, or why the listing could not be read.":
    "- **登录后会向浏览器通告新的模型清单** — 模型选择器会缓存宿主 catalog，只在宿主声明有变化时重载，因此在登录时把空清单填满的插件必须发布 `llm/adapters-updated`。否则模型确实在服务，却永远不会出现在选择器里——看起来就像 provider 坏了。账号卡片会报告该账号提供多少个模型，或说明清单为何读不到。",
  "- **Cache statistics are measured, not predicted** — the percentage is `cacheReadTokens / (inputTokens + cacheReadTokens + cacheWriteTokens)` using provider-reported counters. Earlier versions reordered tool history and dropped native reasoning; their low hit rates do not establish an inherent SIWC limit. Prefix-preservation tests do not measure live cache hits. Compare fixed-model, fixed-effort runs after warm-up, recording cache reads/writes, total input, latency, and quota impact.":
    "- **缓存统计来自实测，不作预测** — 百分比按服务端计数计算为 `cacheReadTokens / (inputTokens + cacheReadTokens + cacheWriteTokens)`。旧版本曾重排工具历史并丢弃原生推理，其低命中率不能证明 SIWC 存在固有上限。前缀保持测试不等于线上命中率测试；应固定模型与推理级别，预热后比较缓存读写、总输入、延迟和额度影响。",
  "- **Each installation registers its own client** — ChatGPT settings lists one app row per registration, named by `agent_name_hint`, and this plugin keeps the account/client mapping after signing out so the next sign-in on the same installation reuses its row instead of adding another. A second state directory is a second installation to OpenAI, and registers separately; deleting a state directory is what forgets one.":
    "- **每个安装各自注册一个 client** — ChatGPT 设置里每个注册对应一行应用，名称取自 `agent_name_hint`；本插件在登出后仍保留「账号 ↔ client」的映射，因此同一安装下次登录会复用原来那一行，而不是再添一行。第二个 state 目录对 OpenAI 而言就是第二个安装，会单独注册；删除某个 state 目录即等于忘记那个安装。",
  "`dev-types/` holds development-only declarations for the harness's LLM and Cordis seams, transcribed from the harness sources. They are not published and never shipped; the host supplies the real packages as peer dependencies. An end-to-end mount in a real harness remains the authoritative check.":
    "`dev-types/` 存放 Harness 的 LLM 与 Cordis 接缝的开发期声明，转录自 Harness 源码。它们不发布、也从不随包分发；宿主以 peer dependency 的形式提供真实包。在真实 Harness 中做端到端挂载仍然是权威的验证方式。",
  "Regenerate the model catalog when the upstream catalog moves:":
    "当上游目录更新时，重新生成模型目录：",
  "### Releasing":
    "### 发版",
  "A release is one tag: bump the version, push the tag, and the release workflow runs every check the CI lane runs, publishes only when the registry does not have that version yet, and records the GitHub Release either way.":
    "一次发版就是一个 tag：提版本、打 tag、推送。release 流水线会跑 CI 的全部检查，只在 registry 上还没有该版本时才发布，而无论是否发布都会记录 GitHub Release。",
  "Publishing takes either the repository's `NPM_TOKEN` secret or npm trusted publishing (workflow `release.yml`); the Release half uses the run's own token. Asking the registry first is what lets a tag for a version that was published by hand record its Release instead of failing, and what lets re-running a tag repair a missing Release. `workflow_dispatch` releases the manifest's version, creating the tag when it is absent.":
    "发布凭据走仓库的 `NPM_TOKEN` secret 或 npm 可信发布（工作流 `release.yml`）；Release 那一半用运行自带的 token。关键在「先问 registry」：它让手工发布过的版本在打 tag 时只补 Release 而不会失败，也让重跑同一个 tag 能修复缺失的 Release。`workflow_dispatch` 会发布 manifest 里的版本，并在 tag 不存在时自动创建。",
}

/** Lines carried through unchanged: they hold no prose in either language. */
const STRUCTURAL = [
  /^---$/,
  /^kind: /,
  /^#+ /,
  /^-----$/,
  /^<a id=/,
  /^<\/a>$/,
  /^<details>$/,
  /^<\/details>$/,
  /^\|/,
  /^```/,
  /^$/,
]

/**
 * Build the Chinese page from the English one.
 * @param {string[]} english - the English lines.
 * @returns {string[]} the Chinese lines, structurally identical.
 */
function build(english) {
  const out = []
  let inFence = false
  const used = new Set()
  for (const line of english) {
    if (line.startsWith('```')) {
      inFence = !inFence
      out.push(line)
      continue
    }
    // Code blocks are byte-identical in both languages, comments included.
    if (inFence) {
      out.push(line)
      continue
    }
    if (Object.hasOwn(LINE_TRANSLATIONS, line)) {
      out.push(LINE_TRANSLATIONS[line])
      used.add(line)
      continue
    }
    if (STRUCTURAL.some(pattern => pattern.test(line))) {
      out.push(line)
      continue
    }
    throw new Error(`no translation for prose line: ${JSON.stringify(line)}`)
  }

  const unused = Object.keys(LINE_TRANSLATIONS).filter(line => !used.has(line))
  if (unused.length > 0) {
    throw new Error(
      `${unused.length} translation(s) match no English line (stale or mistyped):`
      + unused.map(line => `\n  ${JSON.stringify(line)}`).join(''),
    )
  }
  if (out.length !== english.length) {
    throw new Error(`line count drifted: ${english.length} English, ${out.length} Chinese`)
  }
  return out
}

const english = readFileSync(englishPath, 'utf8').replace(/\n$/, '').split('\n')
const chinese = build(english)

if (process.argv.includes('--check')) {
  const current = readFileSync(chinesePath, 'utf8').replace(/\n$/, '').split('\n')
  if (current.join('\n') !== chinese.join('\n')) {
    console.error('docs/README.zh.md is out of date; run: node scripts/align-readme-i18n.mjs')
    process.exit(1)
  }
  console.log(`README pair aligned: ${chinese.length} lines each`)
  process.exit(0)
}

writeFileSync(chinesePath, `${chinese.join('\n')}\n`, 'utf8')
console.log(`wrote docs/README.zh.md (${chinese.length} lines, matching README.md)`)
