import React, { useEffect, useRef, useState } from 'react'
import type { CodexQuotaView } from '../quota-protocol.ts'
import { unwrap, type RemoteResult } from './result.ts'
import { createAutosave } from './autosave.ts'

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
type Draft = { path: string, label: string, allowRefresh: boolean }

/** User-only file authorization. The browser never reads or uploads auth.json contents. */
export function CodexQuotaCard({ remote }: { remote: () => Promise<CodexQuotaRemote> }) {
  const [view, setView] = useState<CodexQuotaView>()
  const [draft, setDraft] = useState<Draft>({ path: '', label: '', allowRefresh: false })
  const draftRef = useRef(draft)
  const [busy, setBusy] = useState(false)
  const [saveState, setSaveState] = useState('')
  const [error, setError] = useState<string>()
  const autosave = useRef<ReturnType<typeof createAutosave<Draft>>>()
  const failed = useRef(false)
  useEffect(() => {
    let mounted = true
    const saver = createAutosave<Draft>(async next => {
      const result = unwrap(await (await remote()).selectCodexQuota(next.path.trim(), next.allowRefresh, next.label))
      if (mounted) setView(result)
    }, (state, failure) => {
      if (!mounted) return
      failed.current = state === 'error'
      setSaveState(state)
      const message = failure instanceof Error ? failure.message : ''
      setError(state === 'error' ? (Object.hasOwn(MESSAGES, message) ? message : 'quota-unavailable') : undefined)
    })
    autosave.current = saver
    void remote().then(api => api.codexQuotaStatus()).then(result => {
      const next = unwrap(result)
      if (!mounted) return
      const initial = { path: next.path ?? '', label: next.label, allowRefresh: next.allowRefresh }
      setView(next); setDraft(initial); draftRef.current = initial
    }).catch(() => { if (mounted) setError('quota-unavailable') })
    return () => { mounted = false; void saver.flush() }
  }, [remote])
  const change = (patch: Partial<Draft>, immediate = false) => {
    const next = { ...draftRef.current, ...patch }
    draftRef.current = next
    setDraft(next)
    if (next.path.trim()) autosave.current?.schedule(next, immediate)
    else { autosave.current?.cancel(); setSaveState(''); setError('absolute-host-path-required') }
  }
  const flush = () => {
    if (failed.current && draftRef.current.path.trim()) autosave.current?.schedule(draftRef.current, true)
    else void autosave.current?.flush()
  }
  const act = async (clear: boolean) => {
    setBusy(true)
    try {
      if (clear) autosave.current?.cancel()
      await autosave.current?.flush()
      if (!clear && failed.current) return
      const api = await remote()
      const next = unwrap(await (clear ? api.clearCodexQuota() : api.refreshCodexQuota()))
      setView(next); setError(undefined)
      if (clear) {
        const empty = { path: '', label: next.label, allowRefresh: next.allowRefresh }
        draftRef.current = empty; setDraft(empty); setSaveState('')
      }
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : ''
      setError(Object.hasOwn(MESSAGES, message) ? message : 'quota-unavailable')
    } finally { setBusy(false) }
  }
  const reason = error ?? view?.error
  return <details className="dsh-chatgpt-models" data-codex-quota="true">
    <summary className="dsh-chatgpt-summary">Codex 剩余额度（独立监控账号）</summary>
    <div className="dsh-chatgpt-models-body">
      <p className="dsh-chatgpt-note">指定运行 DSH 的主机上的 Codex 授权文件；不会上传文件内容，不改变上面的 ChatGPT 调用账号。设置自动保存，文本停止输入 600ms 或离开输入框时保存；勾选授权立即生效。ChatGPT 后端额度接口可能发生变化。</p>
      <label>授权文件路径
        <input className="dsh-chatgpt-urlinput" aria-label="Codex auth.json Host 路径" value={draft.path} disabled={busy || !view} onChange={event => change({ path: event.target.value })} onBlur={flush} placeholder="~/.codex/auth.json" style={{ width: '100%', boxSizing: 'border-box' }} />
      </label>
      <button type="button" disabled={busy || !view} onClick={() => change({ path: view?.defaultPath ?? '' }, true)}>填入默认路径</button>
      <label>监控账号昵称
        <input className="dsh-chatgpt-urlinput" aria-label="Codex 监控账号昵称" value={draft.label} maxLength={80} disabled={busy || !view} onChange={event => change({ label: event.target.value })} onBlur={flush} />
      </label>
      <label style={{ display: 'block' }}>
        <input type="checkbox" checked={draft.allowRefresh} disabled={busy || !view} onChange={event => change({ allowRefresh: event.target.checked }, true)} />
        允许使用 refresh_token 刷新，并原子写回此文件（与 Codex 共享；不保证非协作进程的并发刷新无冲突）
      </label>
      <div className="dsh-chatgpt-actions">
        <button type="button" disabled={busy || !view?.path || !draft.path.trim()} onClick={() => { void act(false) }}>查询额度</button>
        <button type="button" disabled={busy || !view?.path} onClick={() => { void act(true) }}>停止监控</button>
      </div>
      <p role="status">{saveState === 'waiting' ? '等待自动保存…' : saveState === 'saving' ? '正在自动保存…' : saveState === 'saved' ? '已自动保存' : saveState === 'error' ? '自动保存失败；修改设置或重新离开输入框可重试。' : ''}</p>
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
