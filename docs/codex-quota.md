# Codex 剩余额度监控

该功能是 ChatGPT 插件的独立 Host 数据源，不改变已有 ChatGPT 登录、模型列表、调用凭据或 provider 路由。监控的 Codex 账号可以不同于当前模型调用账号，因此界面明确标注“独立监控账号”。账号额度不是 DSH 会话的剩余 token。

## 使用

1. 构建并更新插件后，在 Models 页展开 ChatGPT provider 的编辑区域，打开“Codex 剩余额度（独立监控账号）”。
2. 输入**运行 DSH 的主机**上 Codex `auth.json` 的绝对路径（也支持 `~/`），或点“填入默认路径”。此处是 Host 路径选择，不是浏览器上传；凭据内容不会进入浏览器。
3. 可填写监控账号昵称。勾选“允许使用 refresh_token 刷新，并原子写回此文件”，才会自动续期和修改原文件；不勾选则只读并在失效时提示重新登录 Codex。
4. 设置自动保存：文本停止输入 600ms 或离开输入框时保存；默认路径及刷新授权切换立即保存。界面会显示等待、保存中、成功或失败；失败保留输入，可修改或重新离开输入框重试。保存本身只校验文件并保存路径/授权，不发起上游请求。“查询额度”会先等待设置写入完成。清空路径不会停止已有监控，请使用“停止监控”。
5. 同一个 Host composition 中启用支持协议的 Usage Stats 后，会自动接入已有监控与刷新策略。无需再次提供 token。未安装 Usage Stats 时，ChatGPT provider 与卡片自己的额度查询仍可用。
6. “停止监控”只清除插件的选择，不删除原文件、不撤销 Codex 登录。

没有原生文件 picker 服务的 Host 使用路径输入，避免为了浏览器选文件而上传完整凭据。路径不会通过额度协议发送给 Usage Stats。选择、刷新写回授权只提供用户 UI，不提供可由 agent 自行授权的工具。

## 支持的文件与接口

- 文件必须为当前用户拥有的普通单链接文件，非符号链接/路径别名；大小不超过 1 MiB。
- 支持 `auth_mode: "chatgpt"` 与 `tokens.access_token`，可选 `refresh_token`、`id_token`、`account_id`。不支持 API key 模式、系统钥匙串存储、浏览器会话 cookie。
- 额度：`GET https://chatgpt.com/backend-api/wham/usage`，携带所选文件的 Bearer token，以及存在时的 `ChatGPT-Account-Id`。
- 刷新：`POST https://auth.openai.com/oauth/token`，使用 Codex public client `app_EMoamEEZ73f0CkXaXp7hrann` 的 refresh-token grant。
- 固定 HTTPS origin，不允许配置为模型调用的自定义 baseUrl；禁止重定向携带凭据。
- 单次请求有超时、响应体大小限制。401 最多触发一次刷新/重试；403 不刷新，429 不进入刷新循环。
- 解析 primary/secondary 额度窗口；只提供百分比、重置时间和窗口时长。不把所有 secondary 假定为一周，不将百分比换算为金额/次数/token。

该后端接口不应被当作稳定的公开额度 API。供应商可能改变响应、鉴权或客户端要求，需要兼容性维护。原有 Swift 参考实现只读 primary，此处同时支持 secondary。

## 刷新与写回

- 提前读取 JWT `exp` 仅用于决定是否续期，不把未验证的 JWT 声明当作授权证明。
- 单进程按文件 single-flight；多个本插件进程通过原文件旁的 `.dsh-refresh.lock` 侧文件协调。
- 获锁后重读原文件，发现外部更新优先使用新文件，不重复消费旧 refresh token。
- 刷新后合并新 access/refresh/id token，未返回的新字段不清空旧值，保留原 JSON 中未知字段；更新 `last_refresh`。
- 同目录创建唯一临时文件（0600），写完整 JSON、fsync、关闭，在版本检查通过后 rename 替换，再 fsync 父目录。原文件不会呈现半写 JSON。
- refresh 成功但落盘失败时，新结果保留在 Host 内存，后续重试只写磁盘，不再次消费旧 refresh token。应尽快恢复目录写权限并重试，**不要在待落盘期间退出/重启 DSH**。
- 目录失去写权限而导致锁无法清理时，本进程记录所持锁的 inode/dev；权限恢复后只恢复自己已释放的同一个锁，不按时间删除别人的锁。
- 发现外部文件在刷新期间变化时不覆盖，返回 `credential-conflict`；后续可只读验证外部新凭据，验证成功才放弃本次未落盘结果。外部凭据仍不可用时，需要用户解决冲突或重新登录。
- 调用者在刷新已发出后取消查询，不会阻止已收到轮换结果的持久化；取消后的额度不会作为新结果发布。撤销文件选择会取消尚未进入刷新的旧查询，不允许它随后消费 refresh token。
- 刷新请求发生传输异常，或 HTTP 成功但轮换响应无法解析时，服务端是否已消费旧 refresh token 无法确定。本进程不会盲目重放它；会提示重新登录，或等待 Codex 写入新的凭据。

**限制：** Codex 本身不一定遵守插件的侧文件锁，版本检查与 rename 也不是严格的跨进程 CAS，无法保证与非协作进程并发刷新绝对无冲突。远端轮换和本地写入不在同一事务，进程崩溃也可能丢失尚未落盘的新 token。这种情况需要重新登录。进程异常退出留下的锁不会自动按年龄删除；请先确认没有刷新进程再由用户清理该侧文件。

## 数据边界与协议

Usage Stats 维护 `usageQuota` v1 注册表，ChatGPT 通过可选 Cordis 注入注册独立额度来源。来源 id 是实际 provider route 加 `.codex`；providerRoutes 使用实际配置路由，因此改名后仍可接入。

消费者只收到本地 HMAC 账号键、用户昵称、套餐白名单形状、固定状态码和额度窗口。token、真实 account_id、原文件、原始响应和错误文本不跨插件。

文件/账号/授权变化改变 opaque revision；缓存版本包含来源注册代际。账号切换、服务移除/替换时，旧账号的迟到结果和缓存不得污染新账号。

## 验证

```sh
pnpm typecheck
pnpm build:runtime
pnpm test
pnpm verify:client
pnpm verify:package
```

在 Usage Stats 仓库可运行：

```sh
node scripts/test-quota-integration.mjs /absolute/path/to/dsh-plugin-chatgpt
```

所有自动回归使用隔离合成授权文件和网络响应，不读取真实 Codex 凭据。完整 UI 在实际安装更新并刷新 GUI 后仍需验收；真实账号须由用户主动选择文件后对账。
