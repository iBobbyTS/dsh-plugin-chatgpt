import React, { useEffect, useState } from 'react'
import type { CodexQuotaView } from '../codex-quota.ts'
import { unwrap, type RemoteResult } from './result.ts'

export interface CodexQuotaRemote {
  codexQuotaStatus(): Promise<RemoteResult<CodexQuotaView>>
  selectCodexQuota(path: string, allowRefresh: boolean, label: string): Promise<RemoteResult<CodexQuotaView>>
  clearCodexQuota(): Promise<RemoteResult<CodexQuotaView>>
  refreshCodexQuota(): Promise<RemoteResult<CodexQuotaView>>
}
const MESSAGES: Record<string, string> = {
  'reauth-required': '请在 Codex 重新登录，再重试查询。',
  'credential-conflict': '授权文件被其他程序更新，未覆盖。请重试或重新登录 Codex。',
  'persistence-failed': '刷新结果尚未落盘；请恢复文件写权限并重试，不要重复登录或切换文件。',
  'refresh-busy': '凭据刷新正在进行或锁文件尚未释放，请稍后重试。',
  'invalid-auth-file': '授权文件或上游额度响应格式无效。',
  'unsupported-auth-mode': '仅支持 auth_mode 为 chatgpt 的 Codex 授权文件。',
  'file-unavailable': '无法读取授权文件：请检查路径、所有者及权限，不支持符号链接。',
  'quota-unavailable': '额度查询暂不可用，请稍后重试。',
  'absolute-host-path-required': '请输入运行 DSH 的主机上的绝对路径。'
}

/** User-only file authorization. The browser never reads or uploads auth.json contents. */
export function CodexQuotaCard({ remote }: { remote: () => Promise<CodexQuotaRemote> }) {
  const [view, setView] = useState<CodexQuotaView>()
  const [path, setPath] = useState('')
  const [label, setLabel] = useState('')
  const [allowRefresh, setAllowRefresh] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  useEffect(() => {
    let cancelled = false
    void remote().then(api => api.codexQuotaStatus()).then(result => {
      const next = unwrap(result)
      if (!cancelled) { setView(next); setPath(next.path ?? ''); setLabel(next.label); setAllowRefresh(next.allowRefresh) }
    }).catch(() => { if (!cancelled) setError('quota-unavailable') })
    return () => { cancelled = true }
  }, [remote])
  const act = async (operation: (api: CodexQuotaRemote) => Promise<RemoteResult<CodexQuotaView>>) => {
    setBusy(true); setError(undefined)
    try {
      const next = unwrap(await operation(await remote()))
      setView(next); setPath(next.path ?? ''); setLabel(next.label); setAllowRefresh(next.allowRefresh)
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : ''
      setError(Object.hasOwn(MESSAGES, message) ? message : 'quota-unavailable')
    } finally { setBusy(false) }
  }
  const reason = error ?? view?.error
  return <details className="dsh-chatgpt-models" data-codex-quota="true">
    <summary className="dsh-chatgpt-summary">Codex 剩余额度（独立监控账号）</summary>
    <div className="dsh-chatgpt-models-body">
      <p className="dsh-chatgpt-note">指定运行 DSH 的主机上的 Codex 授权文件；不会上传文件内容，不改变上面的 ChatGPT 调用账号。ChatGPT 后端额度接口可能发生变化。</p>
      <label>授权文件路径
        <input className="dsh-chatgpt-urlinput" aria-label="Codex auth.json Host 路径" value={path} disabled={busy} onChange={event => setPath(event.target.value)} placeholder="~/.codex/auth.json" style={{ width: '100%', boxSizing: 'border-box' }} />
      </label>
      <button type="button" disabled={busy || !view} onClick={() => { setPath(view?.defaultPath ?? '') }}>填入默认路径</button>
      <label>监控账号昵称
        <input className="dsh-chatgpt-urlinput" aria-label="Codex 监控账号昵称" value={label} maxLength={80} disabled={busy} onChange={event => setLabel(event.target.value)} />
      </label>
      <label style={{ display: 'block' }}>
        <input type="checkbox" checked={allowRefresh} disabled={busy} onChange={event => setAllowRefresh(event.target.checked)} />
        允许使用 refresh_token 刷新，并原子写回此文件（与 Codex 共享；不保证非协作进程的并发刷新无冲突）
      </label>
      <div className="dsh-chatgpt-actions">
        <button type="button" disabled={busy || !path.trim()} onClick={() => { void act(api => api.selectCodexQuota(path.trim(), allowRefresh, label)) }}>保存文件选择与授权</button>
        <button type="button" disabled={busy || !view?.path} onClick={() => { void act(api => api.refreshCodexQuota()) }}>查询额度</button>
        <button type="button" disabled={busy || !view?.path} onClick={() => { void act(api => api.clearCodexQuota()) }}>停止监控</button>
      </div>
      {reason ? <p className="dsh-chatgpt-error" role="alert">{MESSAGES[reason] ?? '额度暂不可用。'}</p> : null}
      <div aria-live="polite">
        {busy ? <p>正在处理…</p> : null}
        {view?.snapshot?.accounts.map(account => <div key={account.id}>
          <p>{account.label} · {account.plan ?? 'Codex'} · {account.status}</p>
          {account.windows.map(window => <p key={window.id}>{window.label ?? window.id}：剩余 {(100 - window.usedPercent).toFixed(1)}%{window.resetsAt === undefined ? '' : ` · 重置 ${new Date(window.resetsAt).toLocaleString()}`}</p>)}
        </div>)}
        {view?.snapshot ? <p className="dsh-chatgpt-note">观测时间：{new Date(view.snapshot.observedAt).toLocaleString()}。这是账号窗口额度，不是本会话 token 余额。</p> : null}
      </div>
    </div>
  </details>
}
