# Usage 计数与待解决的协议限制

核对日期：2026-11-03。本文覆盖模型响应的 token usage，不涉及 Codex 剩余额度查询。

## 已确认的规则与修复

OpenAI 的 `usage.input_tokens` 包含普通输入、缓存读取和缓存写入。
缓存分项完整且有效时，插件按以下关系转换为 DSH 的互不重叠计数：

```text
inputTokens = input_tokens - cached_tokens - cache_write_tokens
outputTokens = output_tokens
totalTokens = total_tokens
```

`reasoning_tokens` 是输出的子集，不能再次加进输出或总量。显式零值必须保留。
插件现已要求推理分项为非负安全整数，且不超过有效的输出计数；非法推理分项被省略，
其余有效用量保留。该修复不改变输入、输出、缓存和总量字段的现有降级策略。
测试覆盖完成、未完成和失败终态，以及推理零值和等于输出总数的边界。

官方依据：

- [Responses usage schema](https://developers.openai.com/api/reference/resources/responses/methods/retrieve)
- [Prompt caching：输入分项与计算](https://developers.openai.com/api/docs/guides/prompt-caching)
- [Reasoning：推理计数属于输出](https://developers.openai.com/api/docs/guides/reasoning)
- [SIWC：读取终态并区分失败、未完成与完成](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)

## 待解决：缓存分项缺失时，未缓存输入不能确定

OpenAI 主模型 usage schema 将缓存读写列为整数分项。文档中“缓存计数可以省略”的
说明属于 `tool_usage` 工具用量，不能据此认定主模型正常完成时保证允许省略缓存分项。
无论缺失原因是什么，缺失都不能作为明确零值或缓存未命中的证据。

当前插件保留缺失的缓存字段，但计算 `inputTokens` 时使用 `(cacheRead ?? 0)` 和
`(cacheWrite ?? 0)`。例如输入总量 1000、缓存写入 100、缓存读取缺失，会输出
`inputTokens: 900`；这实际包含未知的缓存读取，不能称为精确的未缓存输入。
保留上游 total 可以保住总量，但不能证明这个分项准确。

DSH 的 `TokenUsage` 要求 `inputTokens` 必填且表示未缓存输入；仅省略该字段会被
turn usage 校验拒绝。补零或从剩余总量推断未知缓存同样没有依据。
本次保留现有行为，尚未解决该限制。

完整修复需要先确定 DSH 的表达与消费协议：独立保留输入总量，允许未缓存分项未知，
并让聚合和 UI 保留这种未知状态，再由插件仅在缓存读写都有效时计算未缓存输入。
不能仅修改插件输出类型而依靠强制类型转换绕过宿主契约。

## 待解决：缓存或基础计数异常时的降级

当前基础数字解析只要求有限数。输入、输出和总量的负数、小数、非安全整数，
缓存小数、超出输入总量的缓存读写，以及互相矛盾的总量，尚未统一处理。
例如缓存读取 1100、输入总量 1000 时，现有代码将普通输入压为 0，仍输出缓存 1100。
这不是修复矛盾数据；DSH 的严格校验可能拒绝整轮统计。

非法推理分项可独立丢弃，因为输出总量已经包含它；缓存计数参与输入拆分，
将非法缓存直接视作 0 或缺失会再次落入上述未知分项问题。
本次没有为这些情况引入未经确定的降级策略，也没有声称所有非法数字已修复。
后续应随 DSH 协议明确：保留哪些可信总量、如何标记未知/矛盾分项，以及无法形成
有效统计时如何展示；不得为了显示完整而伪造计数。

DSH 核对位置（宿主仓库相对路径，安装的版本仍须单独验证）：

- `packages/llm/llm/src/types.ts`：`TokenUsage` 的必填字段和互不重叠语义。
- `packages/llm/token-meter/src/turn-usage.ts`：`normalizeUsage` 与整轮聚合。

本次证据来自源码、官方文档和离线测试，没有调用真实推理接口；不能据此判断某个
历史会话为何缺失缓存计数。排查实际缺失仍需要对应路由的原始响应或脱敏记录。
