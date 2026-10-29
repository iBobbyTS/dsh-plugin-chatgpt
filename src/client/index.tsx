/**
 * The ChatGPT card on the Models page.
 *
 * It rides the provider row's extension area, and it borrows the row's own
 * chrome: the harness renders the one-line head (provider name, status dot,
 * actions) and opens its editor when the human presses 编辑. The card stays
 * out of layout until that editor exists — the collapsed row is the harness's
 * line alone — and then serves as the editor's body: the account facts, the
 * model list behind a collapsed disclosure, and the sign-out action. The
 * page's own editor body for this namespace (a managed-elsewhere hint plus
 * Apply/Cancel) is hidden; the card replaces it. The seams this relies on and
 * their fallback behavior are documented in ./styles.ts, which owns the CSS.
 *
 * The Host owns every part of the flow that touches a credential. A sign-in needs
 * a listener on this machine and ends with tokens that must never reach a page, so
 * the card only asks the Host to start an attempt and reports what comes back.
 * Nothing here holds a token, and nothing here could leak one.
 *
 * @module dsh-plugin-chatgpt/client
 */

import { Button, Input, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientContextServices, Context as CordisContext } from '@deepseek-ai/cordis'
import type * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { REMOTE_NAMESPACE } from '../remote-methods.ts'
import { remoteContribution } from './remote.ts'
import { unwrap, type RemoteResult } from './result.ts'
import { installCardStyles } from './styles.ts'

/** The browser context this plugin runs against. */
type ClientContext = CordisContext & ClientContextServices

/** The namespace this plugin's provider row is registered under. */
const SETTINGS_NS = 'chatgpt'

/**
 * How long the card waits for the Remote namespace before calling it unreachable.
 *
 * The namespace map arrives with the connection rather than with the bundle, so a
 * card can mount before its own namespace exists. Failing at that moment would
 * report a broken plugin for a race that resolves by itself.
 */
const REMOTE_WAIT_MS = 15_000

/** How often the card looks for the namespace while waiting. */
const REMOTE_POLL_MS = 250

/** Everything the card may show, mirrored from the Host's view type. */
interface StatusView {
  signedIn: boolean
  planUsageDenied: boolean
  email?: string
  plan?: string
  expiresAt?: number
  accounts: { subject: string, email?: string, active: boolean }[]
  pending?: { url: string, redirectUri: string }
  roster?: { count: number, error?: string }
  /** Set when the stored grant can no longer be refreshed and must be replaced. */
  needsSignIn?: boolean
  error?: string
}

/** What a sign-out reports beyond the resulting state. */
interface SignOutOutcome {
  status: StatusView
  revocationConfirmed: boolean
  revocationError?: string
}

/** One roster model as the card's model list shows it. */
interface ModelSwitchView {
  id: string
  /** Display name from the roster entry, before any hand-set override. */
  defaultName: string
  /** The name the selector shows: the hand-set override, else the roster's. */
  name: string
  disabled: boolean
}

/** The write this card has in flight, so the rows it touches wait. */
type PendingWrite = { kind: 'model', id: string } | { kind: 'reset' }

/** The Remote surface this card calls, as the Gateway actually resolves it. */
interface ChatGptRemote {
  status(): Promise<RemoteResult<StatusView>>
  begin(): Promise<RemoteResult<StatusView>>
  submit(value: string): Promise<RemoteResult<StatusView>>
  cancel(): Promise<RemoteResult<StatusView>>
  /**
   * End one account's session, or the active one when given `undefined`.
   *
   * The argument is required so it cannot be omitted at a call site: the Gateway
   * compares the argument count exactly, and `signOut()` fails before it leaves the
   * page with "expected 1 argument(s), got 0".
   */
  signOut(subject: string | undefined): Promise<RemoteResult<SignOutOutcome>>
  /** Every roster model with its switch and display-name state. */
  modelSwitches(): Promise<RemoteResult<ModelSwitchView[]>>
  /** Switch one roster model on or off; returns the resulting switch list. */
  setModelDisabled(model: string, disabled: boolean): Promise<RemoteResult<ModelSwitchView[]>>
  /** Set one model's display name; `undefined` restores the roster's own. */
  setModelName(model: string, name: string | undefined): Promise<RemoteResult<ModelSwitchView[]>>
  /** Clear every switch and name override; returns the resulting switch list. */
  resetModels(): Promise<RemoteResult<ModelSwitchView[]>>
}



/** The Cordis service key the Gateway installs this plugin's namespace under. */
const REMOTE_SERVICE_KEY = `remote.${REMOTE_NAMESPACE}`

/**
 * The Remote namespace for this plugin, or `undefined` before it is installed.
 *
 * Read two ways that both matter:
 *
 * - Through `ctx.get`, not `ctx.remote.<namespace>`. The accessor form demands a
 *   declared dependency on the namespace, and this plugin is the thing that
 *   installs it: injecting it would mean waiting for a service this plugin creates
 *   itself, which never settles.
 * - On every call, not once when the bundle loads. The namespace arrives with the
 *   mount and the connection, so a card that resolved it once would keep the empty
 *   answer it got at load for as long as the window lives.
 *
 * @param ctx - the browser plugin context.
 * @returns the namespace, once it is usable.
 */
function remoteNow(ctx: ClientContext): ChatGptRemote | undefined {
  const namespace = ctx.get(REMOTE_SERVICE_KEY) as ChatGptRemote | undefined
  // A service that is present but half-installed would answer with no methods, so
  // the shape is checked rather than the lookup's success.
  return typeof namespace?.status === 'function' ? namespace : undefined
}

/**
 * Wait for the Remote namespace to arrive.
 * @param ctx - the browser plugin context.
 * @returns the namespace.
 * @throws When it never arrives, naming the action that fixes it.
 */
async function waitForRemote(ctx: ClientContext): Promise<ChatGptRemote> {
  const deadline = Date.now() + REMOTE_WAIT_MS
  for (;;) {
    const namespace = remoteNow(ctx)
    if (namespace !== undefined) return namespace
    if (Date.now() >= deadline) {
      throw new Error('the ChatGPT service is not reachable from this window; reload the window and try again')
    }
    await new Promise(resolve => { setTimeout(resolve, REMOTE_POLL_MS) })
  }
}

/** Services this plugin consumes from the page. */
export const inject = ['slots', 'remote']

/**
 * Register the card.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  // The card's CSS addresses hashed module classes of the host page; see
  // ./styles.ts for the seams. Disposal is the fiber's, as for any registration.
  ctx.effect(() => installCardStyles())

  // Nothing in the generated aggregate carries this plugin's namespace, so it is
  // mounted here. The card waits for it to appear, which also covers the mount
  // settling after the card's first render.
  //
  // A refused mount is the one failure the card cannot describe by itself, so it
  // is handed to the card instead of only logged: the reason is a validator's
  // complaint about these descriptors, and a console nobody opens would hide it.
  const mounting: Promise<string | undefined> = ctx.remote.$mount(remoteContribution()).then(
    () => undefined,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  )

  ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register(
    { name: 'settings.models.provider-card', key: SETTINGS_NS },
    () => <ChatGptCard ctx={ctx} mounting={mounting} />,
  ))
}

/**
 * The card itself.
 * @param props.ctx - the browser plugin context carrying the Remote namespace.
 * @param props.mounting - why mounting the Remote namespace failed, when it did.
 */
export function ChatGptCard({ ctx, mounting }: { ctx: ClientContext, mounting: Promise<string | undefined> }) {
  const [status, setStatus] = useState<StatusView | undefined>(undefined)
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  /** Set when signing out worked locally but the server did not confirm it. */
  const [revocationNote, setRevocationNote] = useState<string | undefined>(undefined)
  /** The roster's switch rows, once an account is being shown. */
  const [switches, setSwitches] = useState<ModelSwitchView[] | undefined>(undefined)
  /** Why the switch list could not be read or written, until the next attempt. */
  const [switchesError, setSwitchesError] = useState<string | undefined>(undefined)
  /** The write in flight, so the rows it touches wait. */
  const [pendingWrite, setPendingWrite] = useState<PendingWrite | undefined>(undefined)
  /** Hand-edited display names not yet committed, keyed by model id. */
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({})
  /**
   * The card's write queue.
   *
   * One gesture can start two writes — leaving a name field commits it, and the
   * same click then lands on a switch. Each write is a Host-side read-modify-write
   * over one file, so overlapping requests could interleave into a lost update;
   * chaining them keeps the second's read after the first's write.
   */
  const writeQueue = useRef<Promise<void>>(Promise.resolve())
  const urlRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    try {
      // The mount's own refusal explains far more than a wait that timed out
      // behind it, so it is preferred whenever there is one.
      const refused = await mounting
      if (refused !== undefined) throw new Error(`the sign-in service could not be mounted: ${refused}`)
      const remote = await waitForRemote(ctx)
      setStatus(unwrap(await remote.status()))
    } catch (error) {
      setStatus({
        signedIn: false,
        planUsageDenied: false,
        accounts: [],
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }, [ctx, mounting])

  useEffect(() => { void refresh() }, [refresh])

  // A browser callback lands on the Host with no way to tell this page. While an
  // attempt is open the card asks again on a slow interval, which is cheap and
  // stops the moment the attempt settles either way.
  useEffect(() => {
    if (status?.pending === undefined) return
    const timer = setInterval(() => { void refresh() }, 2000)
    return () => { clearInterval(timer) }
  }, [status?.pending, refresh])

  // The switch list is read separately from the status, so a switch failure
  // cannot blank the account facts. It is re-read whenever the roster changes —
  // a sign-in turns an empty roster into a full one, and a sign-out empties it —
  // because those are the moments the set of switchable models changes.
  const accountShown = status !== undefined && status.needsSignIn !== true
    && (status.signedIn || status.planUsageDenied)
  useEffect(() => {
    if (!accountShown) {
      setSwitches(undefined)
      setSwitchesError(undefined)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const remote = await waitForRemote(ctx)
        const rows = unwrap(await remote.modelSwitches())
        if (!cancelled) {
          setSwitches(rows)
          setSwitchesError(undefined)
        }
      } catch (error) {
        if (!cancelled) setSwitchesError(error instanceof Error ? error.message : String(error))
      }
    })()
    return () => { cancelled = true }
  }, [ctx, accountShown, status?.roster?.count])

  /**
   * Run one roster write and adopt the switch list the Host answers with.
   *
   * Writes are chained on {@link writeQueue} — one gesture can legitimately
   * start two (leaving a name field commits it, the same click lands on a
   * switch) — so nothing here may disable controls to keep writes apart: the
   * queue already does, and disabling is what made the next focus target drop
   * the click and the list visibly dim while a write was in flight.
   *
   * @param pending - the write to mark in flight, for the row that owns it.
   * @param write - the Remote call, answering the fresh switch list.
   * @param onSuccess - runs with the fresh list once it is adopted; name drafts
   * reconcile against it so committed text stays on screen until this moment.
   */
  const writeSwitches = useCallback(async (
    pending: PendingWrite,
    write: (remote: ChatGptRemote) => Promise<RemoteResult<ModelSwitchView[]>>,
    onSuccess?: (rows: ModelSwitchView[]) => void,
  ) => {
    const run = writeQueue.current.then(async () => {
      setPendingWrite(pending)
      try {
        const remote = await waitForRemote(ctx)
        const rows = unwrap(await write(remote))
        setSwitches(rows)
        onSuccess?.(rows)
        setSwitchesError(undefined)
      } catch (error) {
        setSwitchesError(error instanceof Error ? error.message : String(error))
      } finally {
        setPendingWrite(undefined)
      }
    })
    // A failed write must not poison the queue: the tail swallows so the next
    // gesture still runs, while `run` itself keeps the failure for its caller.
    writeQueue.current = run.then(() => undefined, () => undefined)
    return await run
  }, [ctx])

  /** Write one toggle; the selector rebuilds its offering on the Host's announcement. */
  const toggle = useCallback((model: string, offered: boolean) => {
    void writeSwitches({ kind: 'model', id: model }, remote => remote.setModelDisabled(model, !offered))
  }, [writeSwitches])

  /**
   * Commit one display name; blank restores the roster's own.
   *
   * The draft stays until the write lands, so the field never flashes empty
   * mid-round-trip, and it survives a failure for the user to retry.
   */
  const renameModel = useCallback((model: string, name: string | undefined) => {
    void writeSwitches({ kind: 'model', id: model }, remote => remote.setModelName(model, name), (rows) => {
      setNameDrafts((previous) => {
        const next: Record<string, string> = {}
        for (const [id, draft] of Object.entries(previous)) {
          const row = rows.find(entry => entry.id === id)
          if (row === undefined) continue
          const trimmed = draft.trim()
          if (trimmed === row.name) continue
          if (trimmed.length === 0 && row.name === row.defaultName) continue
          next[id] = draft
        }
        return next
      })
    })
  }, [writeSwitches])

  /** Clear every switch and name override; drafts drop when the reset lands. */
  const resetAll = useCallback(() => {
    void writeSwitches({ kind: 'reset' }, remote => remote.resetModels(), () => { setNameDrafts({}) })
  }, [writeSwitches])

  const act = useCallback(async (operation: (remote: ChatGptRemote) => Promise<RemoteResult<StatusView>>) => {
    setBusy(true)
    try {
      const remote = await waitForRemote(ctx)
      setStatus(unwrap(await operation(remote)))
    } catch (error) {
      setStatus(previous => ({
        signedIn: false,
        planUsageDenied: false,
        accounts: [],
        ...previous,
        error: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      setBusy(false)
    }
  }, [ctx])

  if (status === undefined) {
    return (
      <div className="dsh-chatgpt-card">
        <p className="dsh-chatgpt-note">Contacting the ChatGPT service…</p>
      </div>
    )
  }

  const pending = status.pending
  // The Gateway counts arguments exactly, and `signOut` takes one. Passing it
  // explicitly — `undefined` meaning whichever account is active — is what the
  // declared descriptor expects; omitting it fails before the call leaves the page.
  const activeSubject = status.accounts.find(entry => entry.active)?.subject
  const needsSignIn = status.needsSignIn === true
  // A dead grant is not usable plan access even though a credential is stored:
  // show the sign-in action rather than account facts over an unusable token.
  const showsAccount = accountShown
  // The row-head dot: green for a usable account, amber for plan usage that is
  // stored but not authorized, red for everything a new sign-in must fix.
  const signInState = needsSignIn
    ? 'out'
    : status.signedIn
      ? status.planUsageDenied ? 'warn' : 'in'
      : 'out'
  const accountLabel = [status.email ?? activeSubject ?? 'unknown', status.plan]
    .filter(part => part !== undefined && part.length > 0)
    .join(' · ')

  return (
    <div className="dsh-chatgpt-card" data-chatgpt-signin={signInState}>
      {status.error === undefined ? null : <p className="dsh-chatgpt-error">{status.error}</p>}

      {revocationNote === undefined ? null : <p className="dsh-chatgpt-note">{revocationNote}</p>}

      {showsAccount ? (
        <>
          <div className="dsh-chatgpt-facts">
            <div className="dsh-chatgpt-fact">
              <span className="dsh-chatgpt-factlabel">Account</span>
              <span>{accountLabel}</span>
            </div>
            {status.expiresAt === undefined ? null : (
              <div className="dsh-chatgpt-fact">
                <span className="dsh-chatgpt-factlabel">Token</span>
                <span>{`refreshes automatically (valid to ${new Date(status.expiresAt).toLocaleTimeString()})`}</span>
              </div>
            )}
          </div>

          {status.planUsageDenied ? (
            <p className="dsh-chatgpt-note">Authorize plan usage to use this account.</p>
          ) : null}

          {switchesError === undefined ? null : <p className="dsh-chatgpt-error">{switchesError}</p>}

          {switches === undefined ? null : (
            <details className="dsh-chatgpt-models">
              <summary className="dsh-chatgpt-summary">Models</summary>
              <div className="dsh-chatgpt-models-body">
                <div className="dsh-chatgpt-models-head">
                  <p className="dsh-chatgpt-meta">
                    {`${String(switches.length)} models · a switch only changes what the selector offers; a name is display-only`}
                  </p>
                  <button
                    type="button"
                    className="dsh-chatgpt-restore"
                    // Everything already reads as the roster produced it: there is
                    // nothing to restore, so the button stands but does nothing.
                    // A click while another write is queued just lines up behind it.
                    disabled={switches.every(row => !row.disabled && row.name === row.defaultName)}
                    onClick={resetAll}
                  >
                    Restore defaults
                  </button>
                </div>
                {switches.map(model => (
                  <NameRow
                    key={model.id}
                    model={model}
                    saving={pendingWrite?.kind === 'model' && pendingWrite.id === model.id}
                    draft={nameDrafts[model.id]}
                    onDraft={value => { setNameDrafts(previous => ({ ...previous, [model.id]: value })) }}
                    onDropDraft={() => {
                      setNameDrafts(previous => {
                        const next = { ...previous }
                        delete next[model.id]
                        return next
                      })
                    }}
                    onToggle={offered => { toggle(model.id, offered) }}
                    onRename={name => { renameModel(model.id, name) }}
                  />
                ))}
              </div>
            </details>
          )}

          <div className="dsh-chatgpt-actions">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                void act(async (remote) => {
                  const result = await remote.signOut(activeSubject)
                  if (!result.ok) return result
                  const outcome = result.value
                  // Signing out here is not the same as ending the grant at the
                  // server, and only one of those happened if this is set.
                  setRevocationNote(outcome.revocationConfirmed
                    ? undefined
                    : 'Signed out on this machine, but the server did not confirm the revocation'
                      + `${outcome.revocationError === undefined ? '' : ` (${outcome.revocationError})`}.`
                      + ' Disconnect the app in ChatGPT settings to be sure.')
                  return { ok: true as const, value: outcome.status }
                })
              }}
            >
              Sign out
            </Button>
          </div>
        </>
      ) : pending === undefined ? (
        <>
          {needsSignIn ? (
            <p className="dsh-chatgpt-error">
              The stored ChatGPT grant was refused and cannot be refreshed. Sign in again to
              restore plan usage; the model selector will reload the account's models.
            </p>
          ) : null}
          <p className="dsh-chatgpt-note">
            Use your ChatGPT subscription instead of an API key. Signing in authorizes this
            installation to spend your plan on model calls; the token stays on this machine.
          </p>
          <div className="dsh-chatgpt-actions">
            <Button variant="primary" disabled={busy} onClick={() => { void act(remote => remote.begin()) }}>
              Sign in with ChatGPT
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="dsh-chatgpt-note">
            Open the authorization page. When the browser returns to{' '}
            <code>{pending.redirectUri}</code>, this card finishes on its own.
          </p>
          <div className="dsh-chatgpt-urlrow">
            <input
              ref={urlRef}
              readOnly
              value={pending.url}
              aria-label="Authorization URL"
              onFocus={event => { event.currentTarget.select() }}
              className="dsh-chatgpt-urlinput"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                window.open(pending.url, '_blank', 'noopener')
                urlRef.current?.select()
              }}
            >
              Open
            </Button>
          </div>
          <p className="dsh-chatgpt-note">
            If the browser cannot reach that address, paste the final URL it landed on instead.
          </p>
          <div className="dsh-chatgpt-urlrow">
            <Input
              value={pasted}
              placeholder={pending.redirectUri}
              onChange={event => { setPasted(event.target.value) }}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Button
              variant="outline"
              disabled={busy || pasted.trim().length === 0}
              onClick={() => {
                void act(async (remote) => {
                  const next = await remote.submit(pasted.trim())
                  setPasted('')
                  return next
                })
              }}
            >
              Finish
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => { void act(remote => remote.cancel()) }}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * One model row: the display name under edit, the slug it names, and the switch.
 *
 * The name commits on blur or Enter; Escape drops the draft. An empty commit
 * restores the roster's own name, which is what the placeholder shows while no
 * override is set. Nothing here is disabled by a write elsewhere on the card:
 * writes are serialized by the card's queue, and a disabled control is what
 * ate the next focus and dimmed the list mid-save. Only this row's own switch
 * waits for its own write, so a double-click cannot queue two toggles.
 */
function NameRow(props: {
  model: ModelSwitchView
  saving: boolean
  draft: string | undefined
  onDraft: (value: string) => void
  onDropDraft: () => void
  onToggle: (offered: boolean) => void
  onRename: (name: string | undefined) => void
}): React.ReactNode {
  const { model } = props
  const commit = (): void => {
    const draft = props.draft
    if (draft === undefined) return
    const trimmed = draft.trim()
    if (trimmed === model.name) {
      props.onDropDraft()
      return
    }
    if (trimmed.length === 0 && model.name === model.defaultName) {
      props.onDropDraft()
      return
    }
    // The draft stays until the write lands and the fresh list reconciles it:
    // dropping it now would blank the field for the round-trip, and dropping
    // it never (failure) leaves the user's text editable for a retry.
    props.onRename(trimmed.length === 0 ? undefined : trimmed)
  }
  return (
    <div className="dsh-chatgpt-model">
      <input
        type="text"
        className="dsh-chatgpt-nameinput"
        // Empty means "no override": the placeholder carries the name the
        // selector would show, so clearing the field reads as restoring it.
        value={props.draft ?? (model.name === model.defaultName ? '' : model.name)}
        placeholder={model.defaultName}
        aria-label={`Display name for ${model.id}`}
        onChange={event => { props.onDraft(event.target.value) }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') props.onDropDraft()
        }}
      />
      <span className="dsh-chatgpt-slug" title={model.id}>{model.id}</span>
      <Switch
        checked={!model.disabled}
        onChange={offered => { props.onToggle(offered) }}
        label={`Offer ${model.id} in the model selector`}
        disabled={props.saving}
        title={props.saving ? 'Saving…' : undefined}
      />
    </div>
  )
}
