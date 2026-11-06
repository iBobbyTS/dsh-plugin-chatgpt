# dsh-plugin-chatgpt

English | [中文](docs/README.zh.md)

Use a signed-in ChatGPT subscription as the `chatgpt` model provider in DSH. The plugin lists account models, preserves tool/reasoning replay, supports per-model context budgets, and optionally shares sanitized Codex quota windows with Usage Stats.

This is the [iBobbyTS fork](https://github.com/iBobbyTS/dsh-plugin-chatgpt) of [ckanner/dsh-plugin-chatgpt](https://github.com/ckanner/dsh-plugin-chatgpt). Install the built checkout below; the upstream npm package does not contain this fork's changes.

## Compatibility

Verified: DSH 0.2.2-rc.1 (source review and automated checks); Desktop testing has not been completed.

## Install

Requires DSH, Node.js `^22.19.0 || >=24.0.0`, and pnpm for DSH plugin installation. Build from this fork:

```sh
git clone https://github.com/iBobbyTS/dsh-plugin-chatgpt.git
cd dsh-plugin-chatgpt
npm ci --ignore-scripts
npm run build
```

Desktop: select the built repository directory in the application's plugin manager. The application owns the `desktop` profile. Web: from that directory, run:

```sh
dsh plugin --profile web add "$PWD"
```

Use the full path in Windows cmd. Restart the DSH Host and refresh the page. To update, update this checkout, rebuild, and add the same directory through the same profile/plugin manager.

## Use

Open **Settings → Models → ChatGPT** and choose **Sign in with ChatGPT**. Complete the browser flow, or paste its final redirect URL into the card when the loopback callback is unavailable. Select the account models you want to use. Tokens remain on the Host.

Context budgets control what DSH reports and when it compacts; they are not service-side or spending limits. Signing out clears local credentials and reports whether remote revocation was confirmed. Quota-file monitoring is separate from the inference account and requires an explicit file selection.

See [authentication and model settings](docs/auth-and-models.md) for headless use, account limits, attachments, and configuration details.

## Documentation

- [Replay, reasoning-effort changes, and validation](docs/cache-replay.md)
- [Usage accounting and unresolved limits](docs/usage-accounting.md)
- [Codex quota setup and safety](docs/codex-quota.md)
- [Architecture](docs/architecture.md) · [Development](docs/development.md) · [Development rules](https://github.com/iBobbyTS/dsh-plugin-chatgpt/blob/main/AGENTS.md)
- [History](https://github.com/iBobbyTS/dsh-plugin-chatgpt/blob/main/CHANGELOG.md) · [MIT license](LICENSE)
