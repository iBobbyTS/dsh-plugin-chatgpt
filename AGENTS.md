# Development rules

## Purpose and boundaries

Provide the DSH `chatgpt` route through Sign in with ChatGPT, including account/model selection, native history replay, context budgets, and optional quota monitoring. Reuse DSH's attachment and compaction ownership; this plugin does not add a second tool executor, history compressor, or LLM API-key flow. Context budgets are not spending limits.

- Host owns credentials and refresh/writeback. Browser UI receives sanitized status only. Keep quota-file consent independent of the inference account; preserve cancellation/conflict behavior and unknown credential fields.
- Preserve message/block/tool order and opaque native replay only within its authorization, route, model, and unchanged-prefix scope. Use the actual Session ID for cache isolation; fork ancestry is not current identity. Missing/malformed evidence must not become a successful completed stream.
- Keep schema fields needed by the model UI volatile, Remote methods aligned with their descriptors, and roster changes announced through `llm/adapters-updated`. Read live config at its use site.
- Verify endpoint and DSH contracts with relevant source or real evidence. Do not infer live cache hits, token accounting, or supported endpoint capabilities from serialization tests. Keep response/usage uncertainty explicit.
- Examples must install this fork's built checkout. Preserve upstream attribution; the unchanged package name is not upstream publishing permission. Preserve unrelated work, omit credentials/private logs/user data from commits, and use explicit staged paths. Pushing, publishing, and tags require explicit user authorization.

## Owners and checks

[README](README.md) is the human entry; [authentication/models](docs/auth-and-models.md), [architecture](docs/architecture.md), [replay](docs/cache-replay.md), [usage](docs/usage-accounting.md), and [quota](docs/codex-quota.md) own their detailed contracts. [Development](docs/development.md) owns build, verification, and documentation commands. CHANGELOG is history.

Edit English README prose and its translation entries, then generate the Chinese README; never edit the generated translation alone. Keep linked documents in the package's `files` list. Run relevant `package.json` checks; packaging requires a prior build. Distinguish source/simulated checks from real host and live-provider results. Review staged changes and `git diff --cached --check` before committing.
