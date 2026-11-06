/** Generate docs/README.zh.md from the English README and its prose translations. */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const translations = {
  "English | [中文](docs/README.zh.md)": "[English](../README.md) | 中文",
  "Use a signed-in ChatGPT subscription as the `chatgpt` model provider in DSH. The plugin lists account models, preserves tool/reasoning replay, supports per-model context budgets, and optionally shares sanitized Codex quota windows with Usage Stats.": "在 DSH 中使用已登录的 ChatGPT 订阅作为 `chatgpt` 模型提供方。插件列出账号模型、保留工具与推理回放、提供逐模型上下文预算，并可向 Usage Stats 共享脱敏 Codex 额度窗口。",
  "This is the [iBobbyTS fork](https://github.com/iBobbyTS/dsh-plugin-chatgpt) of [ckanner/dsh-plugin-chatgpt](https://github.com/ckanner/dsh-plugin-chatgpt). Install the built checkout below; the upstream npm package does not contain this fork's changes.": "这是 [ckanner/dsh-plugin-chatgpt](https://github.com/ckanner/dsh-plugin-chatgpt) 的 [iBobbyTS fork](https://github.com/iBobbyTS/dsh-plugin-chatgpt)。请安装以下构建后的 checkout；上游 npm 包不包含本 fork 的改动。",
  "## Install": "## 安装",
  "Requires DSH, Node.js `^22.19.0 || >=24.0.0`, and pnpm for DSH plugin installation. Build from this fork:": "需要 DSH、Node.js `^22.19.0 || >=24.0.0`，以及 DSH 插件安装所需的 pnpm。从本 fork 构建：",
  "Desktop: select the built repository directory in the application's plugin manager. The application owns the `desktop` profile. Web: from that directory, run:": "Desktop：在应用插件管理器中选择构建后的仓库目录；`desktop` profile 由应用管理。Web：从该目录运行：",
  "Use the full path in Windows cmd. Restart the DSH Host and refresh the page. To update, update this checkout, rebuild, and add the same directory through the same profile/plugin manager.": "Windows cmd 使用完整目录路径。安装后重启 DSH Host 并刷新页面。更新时更新本 checkout、重新构建，再通过同一 profile/插件管理器添加同一目录。",
  "## Use": "## 使用",
  "Open **Settings → Models → ChatGPT** and choose **Sign in with ChatGPT**. Complete the browser flow, or paste its final redirect URL into the card when the loopback callback is unavailable. Select the account models you want to use. Tokens remain on the Host.": "打开 **设置 → 模型 → ChatGPT**，选择 **Sign in with ChatGPT**。完成浏览器授权；回环回调不可用时，把最终重定向 URL 粘贴回卡片。选择需要使用的账号模型。Token 保留在 Host。",
  "Context budgets control what DSH reports and when it compacts; they are not service-side or spending limits. Signing out clears local credentials and reports whether remote revocation was confirmed. Quota-file monitoring is separate from the inference account and requires an explicit file selection.": "上下文预算影响 DSH 报告的窗口与压缩时机，不是服务端或消费限额。退出登录会清除本地凭据，并说明远端撤销是否已确认。额度文件监控独立于推理账号，需要明确选择文件。",
  "See [authentication and model settings](docs/auth-and-models.md) for headless use, account limits, attachments, and configuration details.": "无头使用、账号限制、附件和配置细节见[授权与模型设置](auth-and-models.md)。",
  "## Documentation": "## 文档",
  "- [Replay, reasoning-effort changes, and validation](docs/cache-replay.md)": "- [回放、推理深度切换与验证](cache-replay.md)",
  "- [Usage accounting and unresolved limits](docs/usage-accounting.md)": "- [用量计数与未解决的边界](usage-accounting.md)",
  "- [Codex quota setup and safety](docs/codex-quota.md)": "- [Codex 额度设置与安全](codex-quota.md)",
  "- [Architecture](docs/architecture.md) · [Development](docs/development.md) · [Development rules](https://github.com/iBobbyTS/dsh-plugin-chatgpt/blob/main/AGENTS.md)": "- [架构](architecture.md) · [开发](development.md) · [开发规范](https://github.com/iBobbyTS/dsh-plugin-chatgpt/blob/main/AGENTS.md)",
  "- [History](https://github.com/iBobbyTS/dsh-plugin-chatgpt/blob/main/CHANGELOG.md) · [MIT license](LICENSE)": "- [历史](https://github.com/iBobbyTS/dsh-plugin-chatgpt/blob/main/CHANGELOG.md) · [MIT 许可](../LICENSE)",
  "DSH 0.2.2-rc.1 has source-contract and automated verification; this is not a real Desktop end-to-end result. Provider behavior and live endpoint limits require their own evidence, as described in the detailed guides.": "DSH 0.2.2-rc.1 已做源码合同核对和自动化验证，不代表真实 Desktop 端到端验收。提供方行为及线上端点边界需要独立证据，详见专题文档。"
}
const english = readFileSync(join(root, 'README.md'), 'utf8')
let fenced = false
const used = new Set()
const chinese = english.split('\n').map(line => {
  if (line.startsWith('```')) { fenced = !fenced; return line }
  if (fenced || line === '' || line === '# dsh-plugin-chatgpt') return line
  if (!Object.hasOwn(translations, line)) throw new Error(`Missing translation: ${line}`)
  used.add(line)
  return translations[line]
}).join('\n')
for (const line of Object.keys(translations)) {
  if (!used.has(line)) throw new Error(`Unused translation: ${line}`)
}
const target = join(root, 'docs', 'README.zh.md')
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== chinese) {
    console.error('docs/README.zh.md is out of date; run node scripts/align-readme-i18n.mjs')
    process.exit(1)
  }
  console.log(`README pair aligned: ${english.trimEnd().split('\n').length} lines each`)
} else {
  writeFileSync(target, chinese)
  console.log('Generated docs/README.zh.md')
}
