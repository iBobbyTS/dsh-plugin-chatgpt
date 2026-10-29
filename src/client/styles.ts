/**
 * The card's stylesheet, injected as one `<style>` element per registration.
 *
 * The bundle is a CJS artifact with no CSS pipeline, and the host row it rides
 * is styled by the Models page's own CSS modules, whose class names are hashed.
 * Everything below therefore addresses stable seams only:
 *
 * - our own `dsh-chatgpt-*` classes, and
 * - the slot anchor's `data-slot` attribute, which the slot renderer documents
 *   as the stable addressable wrapper, and
 * - substring matches on the page's local class names (`editor`, `rowName`),
 *   which survive hash changes but would need revisiting if the page renamed
 *   those classes outright.
 *
 * The layout contract with the row: collapsed, the card occupies no layout, so
 * the row is the harness's own one-line head; opened through the row's 编辑
 * button, the page mounts its unknown-namespace editor body inside the row, and
 * that mount is what makes the card visible while the page's own editor body —
 * a hint plus Apply/Cancel this card replaces — is hidden.
 *
 * @module dsh-plugin-chatgpt/client/styles
 */

/** The whole sheet, kept in one template so the injection stays atomic. */
export const CARD_STYLES = `
/* Collapsed by default: the harness row already renders the one-line head
   (name, status dot, actions), so the card must add no second line. */
.dsh-chatgpt-card { display: none; }

/* The row's editor mount is the plugin-visible spelling of "编辑 opened".
   When it exists, the card becomes the row's editor body. */
li:has(> div[data-slot="settings.models.provider-card"] .dsh-chatgpt-card):has(> div[class*="editor"]) .dsh-chatgpt-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* The page's unknown-namespace editor body (a managed-elsewhere hint plus
   Apply/Cancel) carries nothing this card does not; the card replaces it. */
li:has(> div[data-slot="settings.models.provider-card"] .dsh-chatgpt-card) > div[class*="editor"] {
  display: none !important;
}

/* Sign-in dot beside the row title, mirroring the page's credential dots.
   Green: signed in and usable. Amber: signed in, but plan usage is not
   authorized. Red: signed out, or the stored grant must be replaced. */
li:has([data-chatgpt-signin="in"]) span[class*="rowName"]::after,
li:has([data-chatgpt-signin="warn"]) span[class*="rowName"]::after,
li:has([data-chatgpt-signin="out"]) span[class*="rowName"]::after {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-left: 6px;
  border-radius: 50%;
  vertical-align: middle;
}
li:has([data-chatgpt-signin="in"]) span[class*="rowName"]::after {
  background: var(--dsw-alias-state-success-primary);
}
li:has([data-chatgpt-signin="warn"]) span[class*="rowName"]::after {
  background: var(--dsw-alias-state-warn-primary);
}
li:has([data-chatgpt-signin="out"]) span[class*="rowName"]::after {
  background: var(--dsw-alias-state-error-primary);
}

/* Account facts, in the page's field-label voice. */
.dsh-chatgpt-facts { display: flex; flex-direction: column; gap: 2px; }
.dsh-chatgpt-fact {
  display: flex;
  gap: 10px;
  align-items: baseline;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
}
.dsh-chatgpt-factlabel {
  flex: none;
  min-width: 5rem;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

/* The model list rides the page's collapsed-details pattern: hidden until the
   summary is expanded, so the editor opens on the account facts alone. */
.dsh-chatgpt-models {
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  padding-top: 10px;
}
.dsh-chatgpt-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  padding: 2px 4px;
  margin-left: -4px;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
  list-style: none;
}
.dsh-chatgpt-summary::-webkit-details-marker { display: none; }
.dsh-chatgpt-summary::before {
  content: '';
  width: 5px;
  height: 5px;
  border-right: 1.5px solid currentcolor;
  border-bottom: 1.5px solid currentcolor;
  transform: rotate(-45deg) translate(-1px, -1px);
  transition: transform 120ms ease;
}
.dsh-chatgpt-models[open] > .dsh-chatgpt-summary::before {
  transform: rotate(45deg) translate(-1px, -1px);
}
.dsh-chatgpt-summary:hover { color: var(--dsw-alias-label-primary); }
.dsh-chatgpt-summary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
}

.dsh-chatgpt-models-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
}
.dsh-chatgpt-models-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dsh-chatgpt-meta {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-chatgpt-restore {
  flex: none;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.dsh-chatgpt-restore:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-chatgpt-restore:disabled { opacity: 0.4; cursor: default; }
.dsh-chatgpt-restore:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
}

/* One model: editable display name, the slug it names, and the offering
   switch — the page's own model-row grid, one column narrower. */
.dsh-chatgpt-model {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
}
.dsh-chatgpt-nameinput {
  box-sizing: border-box;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}
.dsh-chatgpt-nameinput:focus {
  outline: none;
  border-color: var(--dsw-alias-state-business-primary);
}
.dsh-chatgpt-nameinput::placeholder { color: var(--dsw-alias-label-dimmed); }
.dsh-chatgpt-slug {
  font-family: var(--ds-font-family-code);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-chatgpt-actions { display: flex; gap: 8px; }
.dsh-chatgpt-urlrow { display: flex; gap: 8px; align-items: center; }
.dsh-chatgpt-urlinput {
  flex: 1;
  min-width: 0;
  font-family: var(--ds-font-family-code);
  font-size: 12px;
  line-height: 18px;
  padding: 6px 8px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}
.dsh-chatgpt-urlinput:focus { outline: none; border-color: var(--dsw-alias-state-business-primary); }

.dsh-chatgpt-note {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-chatgpt-error {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-error-primary);
}

@media (prefers-reduced-motion: reduce) {
  .dsh-chatgpt-summary::before { transition: none; }
}
`

/**
 * Install the sheet and answer its disposer.
 *
 * Each registration installs its own element, so overlapping registrations
 * (a re-apply before the previous fiber unwinds) dispose independently instead
 * of fighting over one shared node.
 *
 * @returns the disposer that removes this installation's element.
 */
export function installCardStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const element = document.createElement('style')
  element.dataset.dshPluginChatgpt = 'card-styles'
  element.textContent = CARD_STYLES
  document.head.appendChild(element)
  return () => { element.remove() }
}
