# dsh-plugin-chatgpt

[English](../README.md) | 中文

在 DSH 中使用已登录的 ChatGPT 订阅作为 `chatgpt` 模型提供方。插件列出账号模型、保留工具与推理回放、提供逐模型上下文预算，并可向 Usage Stats 共享脱敏 Codex 额度窗口。

这是 [ckanner/dsh-plugin-chatgpt](https://github.com/ckanner/dsh-plugin-chatgpt) 的 [iBobbyTS fork](https://github.com/iBobbyTS/dsh-plugin-chatgpt)。请安装以下构建后的 checkout；上游 npm 包不包含本 fork 的改动。

## 安装

需要 DSH、Node.js `^22.19.0 || >=24.0.0`，以及 DSH 插件安装所需的 pnpm。从本 fork 构建：

```sh
git clone https://github.com/iBobbyTS/dsh-plugin-chatgpt.git
cd dsh-plugin-chatgpt
npm ci --ignore-scripts
npm run build
```

Desktop：在应用插件管理器中选择构建后的仓库目录；`desktop` profile 由应用管理。Web：从该目录运行：

```sh
dsh plugin --profile web add "$PWD"
```

Windows cmd 使用完整目录路径。安装后重启 DSH Host 并刷新页面。更新时更新本 checkout、重新构建，再通过同一 profile/插件管理器添加同一目录。

## 使用

打开 **设置 → 模型 → ChatGPT**，选择 **Sign in with ChatGPT**。完成浏览器授权；回环回调不可用时，把最终重定向 URL 粘贴回卡片。选择需要使用的账号模型。Token 保留在 Host。

上下文预算影响 DSH 报告的窗口与压缩时机，不是服务端或消费限额。退出登录会清除本地凭据，并说明远端撤销是否已确认。额度文件监控独立于推理账号，需要明确选择文件。

无头使用、账号限制、附件和配置细节见[授权与模型设置](auth-and-models.md)。

## 文档

- [回放、推理深度切换与验证](cache-replay.md)
- [用量计数与未解决的边界](usage-accounting.md)
- [Codex 额度设置与安全](codex-quota.md)
- [架构](architecture.md) · [开发](development.md) · [开发规范](https://github.com/iBobbyTS/dsh-plugin-chatgpt/blob/main/AGENTS.md)
- [历史](https://github.com/iBobbyTS/dsh-plugin-chatgpt/blob/main/CHANGELOG.md) · [MIT 许可](../LICENSE)

DSH 0.2.2-rc.1 已做源码合同核对和自动化验证，不代表真实 Desktop 端到端验收。提供方行为及线上端点边界需要独立证据，详见专题文档。
