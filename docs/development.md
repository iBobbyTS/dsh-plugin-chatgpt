# Development

[AGENTS](https://github.com/iBobbyTS/dsh-plugin-chatgpt/blob/main/AGENTS.md) owns the development contract. Use package.json's pinned pnpm and Node 22.19+ on the Node 22 line or Node 24.11+ for development tools. Plugin runtime requirements remain in package.json.

## Source, build and checks

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build:runtime  # explicitly update committed lib after editing src
pnpm verify:harness /path/to/DSH-0.2.2-rc.1
```

`src/` is the only runtime editing source. Host and Client typecheck separately against actual public DSH types; `dev-types/client.d.ts` covers only the browser UI contracts consumed by the card. Pure quota/model view types have separate owners (`src/quota-protocol.ts`, `src/models/view.ts`), so Client typing does not pull Host storage into its environment.

`pnpm build:runtime` uses tsdown for Host ESM modules and the ModuleLoader Client, including JS/maps and the model catalog JSON. The Remote controller first uses TypeScript's standard-decorator transform, preserving its prior semantics; declaration-only tsc emits public types under `lib/types/`. No installation lifecycle builds run. Sources needed by maps accompany the generated runtime.

`pnpm test` builds a temporary current-source candidate before testing generated Host JS and Client behavior. A test-only import hook redirects Host source imports to that candidate’s JS, including child-process tests; the unchanged source imports still receive the full strict test typecheck. Pure Client helpers retain their source tests. `pnpm check:dist` independently rebuilds without overwriting working lib, compares the full generated set, checks actual packed files/exports/maps and installs the tarball with host peers in a clean temporary project. `pnpm check` combines typecheck, tests, Client/package/i18n checks and dist using one candidate build. `verify:harness` consumes built lib against the supplied release assembler, with synthetic provider data; it does not contact ChatGPT.

Regenerate the model catalog when the upstream catalog moves:

```text
node scripts/generate-model-catalog.mjs /path/to/@earendil-works/pi-ai
```


## Documentation generation

Edit the English `README.md` and translation entries in `scripts/align-readme-i18n.mjs`, then run:

```sh
node scripts/align-readme-i18n.mjs
pnpm check:i18n
```

`docs/README.zh.md` is generated. Its relative links differ because it lives under `docs/`. The package `files` list must include the detailed documents reached from both READMEs. `pnpm verify:package` also checks the public auth example in `docs/auth-and-models.md` against a temporary packed package; it needs built `lib/` first.

## Local installation and updates

Use [README](../README.md). After development edits to a copied `file:` dependency, build and add the same local checkout again; refreshing a page does not refresh the profile's copy. Host changes require a Host restart before refreshing the UI.

## Release

This fork retains the upstream package name for loading; that does not confer permission to publish to it. The existing release workflow and upstream release history are implementation/history, not authorization. Before a release, confirm this fork's package ownership, target version, and workflow credentials with the maintainer. Use a new approved version, never a fixed historical version copied from an example. Pushing a version tag may publish through the existing workflow.
