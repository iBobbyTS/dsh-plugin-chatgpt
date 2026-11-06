# Development

[AGENTS](https://github.com/iBobbyTS/dsh-plugin-chatgpt/blob/main/AGENTS.md) owns the development contract. From this fork's checkout, install development dependencies with `npm ci --ignore-scripts`; then build before installing the local package into DSH. Node.js requirements come from `package.json`.

## Dev Note

```text
npm test          # node --test, no build step
npm run typecheck # entry point checked against dev-types/ shims
npm run build     # tsc emits the host half and the declarations, esbuild the browser bundle
npm run verify:harness -- /path/to/deepseek-harness # actual DSH assembler, offline
```

`dev-types/` holds development-only declarations for the harness's LLM and Cordis seams, transcribed from the harness sources. They are not published and never shipped; the host supplies the real packages as peer dependencies. An end-to-end mount in a real harness remains the authoritative check.

Regenerate the model catalog when the upstream catalog moves:

```text
node scripts/generate-model-catalog.mjs /path/to/@earendil-works/pi-ai
```


## Documentation generation

Edit the English `README.md` and translation entries in `scripts/align-readme-i18n.mjs`, then run:

```sh
node scripts/align-readme-i18n.mjs
npm run check:i18n
```

`docs/README.zh.md` is generated. Its relative links differ because it lives under `docs/`. The package `files` list must include the detailed documents reached from both READMEs. `npm run verify:package` also checks the public auth example in `docs/auth-and-models.md` against a temporary packed package; it needs built `lib/` first.

## Local installation and updates

Use [README](../README.md). On a copied `file:` dependency, rebuild and add the same local checkout again; refreshing a page does not refresh the profile's copy. Host changes require a Host restart before refreshing the UI.

## Release

This fork retains the upstream package name for loading; that does not confer permission to publish to it. The existing release workflow and upstream release history are implementation/history, not authorization. Before a release, confirm this fork's package ownership, target version, and workflow credentials with the maintainer. Use a new approved version, never a fixed historical version copied from an example. Pushing a version tag may publish through the existing workflow.
