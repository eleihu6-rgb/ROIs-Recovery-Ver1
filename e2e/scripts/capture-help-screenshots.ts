/**
 * Help page screenshot capture script.
 *
 * Run with:
 *   cd e2e && npx tsx scripts/capture-help-screenshots.ts
 *
 * Prerequisites:
 *   - gantt dev server running on port 5173
 *   - live-server running on port 3000 (for auth + real data)
 *
 * Output: gantt/public/help/screenshots/*.png (viewport 1280×800)
 *
 * Auth note: the login API returns { data: { token, userCode, userName, schema } }.
 * The token is nested under `data` — mirror utils/gantt-hook.ts:seedGanttAuth exactly.
 */
import { chromium, type Page, type Locator } from 'playwright'
import { gotoScenarioList } from '../pages/gantt/scenario-nav'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const OUT_DIR   = path.join(REPO_ROOT, 'gantt/public/help/screenshots')
const BASE_URL  = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'
const API_URL   = process.env.GANTT_API_URL  ?? 'http://localhost:3000'
const USER      = process.env.GANTT_TEST_USER ?? 'admin'
const PASS      = process.env.GANTT_TEST_PASS ?? '123456'

await fs.mkdir(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ headless: true })
// deviceScaleFactor: 2 renders every capture at 2× pixel density, so small
// toolbar crops (a button, a pill row) carry enough physical pixels to stay
// sharp when the help article scales them up. At 1× a 246px button row was
// upscaled ~2.8× in the panel and looked blurry; at 2× it is crisp.
const ctx     = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
const page    = await ctx.newPage()

let captured = 0
let skipped = 0

// ── Auth: inject token into sessionStorage before first navigation ────────────
async function seedAuth() {
  const res = await page.request.post(`${API_URL}/api/auth/login`, {
    data: { userCode: USER, password: PASS },
  })
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`)
  // Response shape: { data: { token, userCode, userName, schema } }
  const json = (await res.json()) as {
    data: { token: string; userCode: string; userName: string; schema: string }
  }
  const auth = json.data
  if (!auth?.token) throw new Error('login response had no data.token — check API shape')
  await page.addInitScript((a) => {
    window.sessionStorage.setItem(
      'rois-auth',
      JSON.stringify({
        user: { userCode: a.userCode, userName: a.userName, schema: a.schema },
        token: a.token,
      }),
    )
  }, auth)
}

async function shoot(name: string, target: Locator | Page) {
  const dest = path.join(OUT_DIR, `${name}.png`)
  if ('screenshot' in target && 'goto' in target) {
    await (target as Page).screenshot({ path: dest })
  } else {
    await (target as Locator).screenshot({ path: dest })
  }
  captured += 1
  console.log(`✓  ${name}.png`)
}

/** Try a capture; if anything fails, log and continue (never abort the run). */
async function tryShoot(name: string, fn: () => Promise<void>) {
  try {
    await fn()
  } catch (err) {
    skipped += 1
    console.warn(`✗  ${name} — skipped: ${(err as Error).message.split('\n')[0]}`)
  }
}

const visible = (loc: Locator, timeout = 4_000) =>
  loc.isVisible({ timeout }).catch(() => false)

// ── Navigate to the app (authenticated) ───────────────────────────────────────
await seedAuth()
await page.goto(`${BASE_URL}/altair/`)
await page.waitForSelector('[data-testid="nav-help"]', { timeout: 30_000 })
console.log('• authenticated, shell loaded')

// ── Open Live view (empty-start flow: inline toolbar reminder → Filter dialog → Apply) ─
await page.getByTestId('module-nav-live').click()
const emptyState = page.getByTestId('live-empty-state')
if (await visible(emptyState, 5_000)) {
  // Shoot the inline "No data loaded" reminder in toolbar context before clicking it.
  // Target the toolbar <header> row itself (button → gap div → header) for a tight crop.
  await tryShoot('live-empty-state', async () => {
    const row = emptyState.locator('xpath=ancestor::header[1]').first()
    await shoot('live-empty-state', (await visible(row)) ? row : page)
  })
  await emptyState.click()
  await page.getByTestId('filter-dialog').waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})
  await page.getByTestId('filter-apply').click()
  await page.getByTestId('filter-dialog').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
  await emptyState.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {})
}
await page.waitForTimeout(1_500)

// ── Live: full toolbar ────────────────────────────────────────────────────────
await tryShoot('live-toolbar', async () => {
  const tb = page.locator('[data-testid="reset-layout"]').locator('xpath=ancestor::*[3]').first()
  await shoot('live-toolbar', (await visible(tb)) ? tb : page)
})

// ── Live: date range fields + the Refresh button just to their right ──────────
// The help text calls out the Refresh button (↻), which lives in a sibling toolbar
// group after a divider — so clip the union of the date-input region and the refresh
// button rather than the date container alone (which excludes Refresh).
await tryShoot('live-date-range-open', async () => {
  const firstDate = page.locator('input[type="date"]').first()
  await firstDate.waitFor({ timeout: 4_000 })
  const dateBB = await firstDate.locator('xpath=ancestor::*[1]').first().boundingBox()
  const refreshBB = await page.getByTestId('refresh-btn').boundingBox()
  if (dateBB && refreshBB) {
    const x = Math.max(0, dateBB.x - 6)
    const y = Math.max(0, Math.min(dateBB.y, refreshBB.y) - 6)
    const right = refreshBB.x + refreshBB.width + 6
    const bottom = Math.max(dateBB.y + dateBB.height, refreshBB.y + refreshBB.height) + 6
    const dest = path.join(OUT_DIR, 'live-date-range-open.png')
    await page.screenshot({ path: dest, clip: { x, y, width: right - x, height: bottom - y } })
    captured += 1
    console.log('✓  live-date-range-open.png')
  } else {
    const region = firstDate.locator('xpath=ancestor::*[1]').first()
    await shoot('live-date-range-open', (await visible(region)) ? region : firstDate)
  }
})

// ── Live: filter dialog on Crew tab (clean, nothing selected yet) ─────────────
await tryShoot('live-filter-dialog-crew', async () => {
  await page.getByTestId('filter-btn').click()
  await page.getByTestId('filter-dialog').waitFor({ timeout: 5_000 })
  if (await visible(page.getByTestId('filter-tab-crew'), 2_000)) {
    await page.getByTestId('filter-tab-crew').click()
  }
  await page.waitForTimeout(400)
  await shoot('live-filter-dialog-crew', page.getByTestId('filter-dialog'))
})

// ── Live: filter dialog on Pairing + Flight tabs (clean, nothing selected) ────
await tryShoot('live-filter-dialog-pairing', async () => {
  if (!(await visible(page.getByTestId('filter-dialog'), 1_000))) {
    await page.getByTestId('filter-btn').click()
    await page.getByTestId('filter-dialog').waitFor({ timeout: 5_000 })
  }
  await page.getByTestId('filter-tab-pairing').click()
  await page.waitForTimeout(400)
  await shoot('live-filter-dialog-pairing', page.getByTestId('filter-dialog'))
})

await tryShoot('live-filter-dialog-flight', async () => {
  if (!(await visible(page.getByTestId('filter-dialog'), 1_000))) {
    await page.getByTestId('filter-btn').click()
    await page.getByTestId('filter-dialog').waitFor({ timeout: 5_000 })
  }
  await page.getByTestId('filter-tab-flight').click()
  await page.waitForTimeout(400)
  await shoot('live-filter-dialog-flight', page.getByTestId('filter-dialog'))
  // Return to the Crew tab so the next (active-state) capture starts clean.
  await page.getByTestId('filter-tab-crew').click()
})

// ── Live: filter button in its ACTIVE state ───────────────────────────────────
// Select two crew divisions (P + C) and apply, so the button turns amber and
// shows a "2" count badge — matching the article caption "Filters (2 active)".
// Capture the toolbar group (refresh + amber filter) rather than the bare 14px
// icon, so the crop is legible. The filter is cleared afterwards.
await tryShoot('live-filter-btn', async () => {
  if (!(await visible(page.getByTestId('filter-dialog'), 1_000))) {
    await page.getByTestId('filter-btn').click()
    await page.getByTestId('filter-dialog').waitFor({ timeout: 5_000 })
    if (await visible(page.getByTestId('filter-tab-crew'), 2_000)) await page.getByTestId('filter-tab-crew').click()
  }
  for (const div of ['P', 'C']) {
    const pill = page.getByTestId(`filter-crew-division-${div}`)
    if (await visible(pill, 2_000)) await pill.click()
  }
  await page.getByTestId('filter-apply').click()
  await page.getByTestId('filter-dialog').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(800)
  // The refresh+filter flex group alone is now too narrow for a legible crop
  // (the match pills moved into the pane title bars) — clip a fixed-width region
  // around the button cluster that includes the date pickers for context.
  const bb = await page.getByTestId('filter-btn').boundingBox()
  if (!bb) throw new Error('filter-btn has no bounding box')
  const clip = { x: Math.max(0, bb.x - 280), y: Math.max(0, bb.y - 10), width: 340, height: bb.height + 20 }
  const dest = path.join(OUT_DIR, 'live-filter-btn.png')
  await page.screenshot({ path: dest, clip })
  captured += 1
  console.log('✓  live-filter-btn.png')
})

// ── Live: filtered result — capture the roster pane title bar (the filtered/total
// funnel badge lives there, not in the toolbar). Re-filter to a single base so the
// badge shows a real restriction (e.g. 28/815), not the P+C divisions' x/x. ─────
await tryShoot('live-filter-result', async () => {
  await page.getByTestId('filter-btn').click()
  await page.getByTestId('filter-dialog').waitFor({ timeout: 5_000 })
  // P+C divisions from the previous shot may still be active — adding a single
  // base narrows the match set, which is what the badge should illustrate.
  await page.getByTestId('filter-tab-crew').click()
  await page.getByTestId('filter-crew-base-trigger').click()
  const baseOpt = page.getByTestId('filter-crew-base-opt-YEG')
  await baseOpt.waitFor({ state: 'visible', timeout: 15_000 }) // options load async
  await baseOpt.click()
  await page.getByTestId('filter-tab-crew').click() // collapse the dropdown
  await page.getByTestId('filter-apply').click()
  await page.getByTestId('filter-dialog').waitFor({ state: 'hidden', timeout: 10_000 })
  const roster = page.getByTestId('roster-pane').first()
  const badge = roster.getByTestId('pane-filtered-count')
  await badge.waitFor({ state: 'visible', timeout: 15_000 })
  // Wait until the badge shows a real restriction (n/total with n < total), i.e.
  // the filtered fetch AND the unfiltered-total backfill have both landed.
  await page.waitForFunction(() => {
    const t = window.__ganttTest?.crewTotals()
    return !!t && t.unfilteredTotal > 0 && t.total > 0 && t.total < t.unfilteredTotal
  }, undefined, { timeout: 15_000 })
  const titleRow = roster.getByTestId('pane-title-section')
  await shoot('live-filter-result', (await visible(titleRow)) ? titleRow : roster)
})

// reset filters so later shots are clean
await tryShoot('reset-filters', async () => {
  await page.getByTestId('filter-btn').click()
  await page.getByTestId('filter-dialog').waitFor({ timeout: 5_000 })
  if (await visible(page.getByTestId('filter-reset'), 2_000)) await page.getByTestId('filter-reset').click()
  if (await visible(page.getByTestId('filter-apply'), 2_000)) await page.getByTestId('filter-apply').click()
  await page.getByTestId('filter-dialog').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
})

// ── Live: pane add buttons (Roster / Pairing / Flight) ────────────────────────
await tryShoot('live-panes-buttons', async () => {
  const reset = page.getByTestId('reset-layout')
  const group = reset.locator('xpath=ancestor::*[1]').first()
  await shoot('live-panes-buttons', (await visible(group)) ? group : reset)
})

// ── Flight Navi: the table navigator dialog ───────────────────────────────────
// Add a Flight pane (it hosts the Navi button), open Flight Navi, wait for rows,
// capture the (non-modal) window, then close it so later toolbar shots are clean.
await tryShoot('flight-navi', async () => {
  const addFlight = page.getByTestId('add-pane-flight')
  if (await visible(addFlight, 3_000)) await addFlight.click()
  const naviBtn = page.getByTestId('flight-navi-button')
  await naviBtn.waitFor({ timeout: 8_000 })
  await naviBtn.click()
  const dialog = page.getByTestId('flight-navi-dialog')
  await dialog.waitFor({ timeout: 8_000 })
  await page.locator('[data-testid^="flight-navi-row-"]').first().waitFor({ timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(700)
  await shoot('flight-navi', dialog)
  if (await visible(page.getByTestId('flight-navi-dialog-close'), 1_500)) {
    await page.getByTestId('flight-navi-dialog-close').click()
  }
})

// ── Pairing label: pairing pane + Pairing Info dialog ─────────────────────────
// Ensure a Pairing pane is open, capture the full pane (canvas pucks show labels).
// Then use the Zustand store to open a Pairing Info dialog for the first loaded pairing.
await tryShoot('pairing-label-pane', async () => {
  const addPairing = page.getByTestId('add-pane-pairing')
  if (await visible(addPairing, 3_000)) await addPairing.click()
  const pairingPane = page.getByTestId('pairing-pane').first()
  await pairingPane.waitFor({ timeout: 10_000 })
  // Wait for the accessibility label mirror — signals pairings have rendered
  const labelMirror = page.locator('[aria-label="Loaded pairing labels"]')
  await labelMirror.waitFor({ timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(800)
  await shoot('pairing-label-pane', pairingPane)
})

await tryShoot('pairing-label-info-dialog', async () => {
  // Open Pairing Info for the first loaded pairing via store
  const opened = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const pairings = w.__ganttTest?.pairings?.() as Array<{ id: number }> | undefined
    const first = pairings?.[0]
    if (!first) return false
    w.__ganttTest?.openPairingInfo?.(first.id)
    return true
  })
  if (!opened) throw new Error('no pairings loaded to open info dialog')
  const dialog = page.getByTestId('pairing-info-dialog')
  await dialog.waitFor({ state: 'visible', timeout: 8_000 })
  await page.waitForTimeout(600)
  await shoot('pairing-label-info-dialog', dialog)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {})
})

// ── Live: timezone switcher open (clock + airport code button) ────────────────
await tryShoot('live-timezone-open', async () => {
  const tz = page.getByRole('button', { name: /UTC|Asia|America|Europe|Africa|Pacific/i }).first()
  await tz.click({ timeout: 4_000 })
  await page.waitForTimeout(400)
  // The switcher dropdown is a plain div (no role=menu); target it by testid so the
  // crop is the dropdown itself, not the whole page.
  const menu = page.getByTestId('timezone-menu').first()
  await shoot('live-timezone-open', (await visible(menu, 2_000)) ? menu : page)
  await page.keyboard.press('Escape')
})

// ── Live: rule set selector open (the ShieldCheck dropdown in the toolbar) ────
// IMPORTANT: target the toolbar RuleGroupSelector by its shield-check icon, NOT
// getByRole('button', {name:/rule/i}) — that matched the top-nav "Rule" MODULE
// link and navigated away, capturing the Rule Manager page by mistake.
await tryShoot('live-ruleset-open', async () => {
  const trigger = page.locator('button:has(svg.lucide-shield-check)').first()
  await trigger.click({ timeout: 4_000 })
  await page.waitForTimeout(400)
  const menu = page.locator('[role="menu"]').first()
  await shoot('live-ruleset-open', (await visible(menu, 2_000)) ? menu : page)
  await page.keyboard.press('Escape')
})

// ── Settings: theme switcher open (palette icon, top-right) ────────────────────
await tryShoot('settings-theme-open', async () => {
  // theme-switcher has no testid; it's the palette button in the top nav, left of logout
  const palette = page.locator('button:has(svg.lucide-palette)').first()
  const trigger = (await visible(palette, 2_000))
    ? palette
    : page.getByTestId('logout-btn').locator('xpath=preceding::button[1]').first()
  await trigger.click({ timeout: 4_000 })
  await page.waitForTimeout(400)
  const menu = page.locator('[role="menu"]').first()
  await shoot('settings-theme-open', (await visible(menu, 2_000)) ? menu : page)
  await page.keyboard.press('Escape')
})

// ── Scenario: list, create dialog, detail panel ───────────────────────────────
await gotoScenarioList(page)
await page.waitForTimeout(1_500)

await tryShoot('scenario-list', async () => {
  const item = page.getByTestId('scenario-list-item').first()
  await item.waitFor({ timeout: 8_000 })
  // capture the whole left list panel: nearest scrollable ancestor of the first item
  const panel = item.locator('xpath=ancestor::*[3]').first()
  await shoot('scenario-list', (await visible(panel)) ? panel : page)
})

// "Creating a new scenario": the + button creates a Draft immediately (no dialog)
// and opens it in the detail panel. Capture that panel, then delete the draft so
// repeated runs do not pollute the demo data.
async function deleteScenarioRowByName(name: string) {
  const rows = page.getByTestId('scenario-list-item')
  const n = await rows.count()
  for (let i = 0; i < n; i++) {
    const nm = (await page.getByTestId('scenario-item-name').nth(i).innerText().catch(() => '')).trim()
    if (nm === name) {
      const row = rows.nth(i)
      await row.hover()
      await row.locator('button:has(svg.lucide-ellipsis), button:has(svg.lucide-more-horizontal)')
        .first().click().catch(async () => { await row.getByRole('button').last().click() })
      await page.waitForTimeout(250)
      await page.getByRole('menuitem', { name: /delete/i }).click()
      await page.getByTestId('scenario-delete-confirm').click({ timeout: 5_000 })
      await page.waitForTimeout(600)
      return
    }
  }
}

// scenario-detail-running / scenario-detail-done depend on a scenario already being
// in that state. Click through the list, read each detail badge, and capture the
// first scenario found in each state. Run these BEFORE the create/delete step so no
// confirm-dialog overlay can interfere with row clicks.
async function captureScenarioInState(name: string, statusRe: RegExp) {
  await page.keyboard.press('Escape').catch(() => {})
  const items = page.getByTestId('scenario-list-item')
  const n = await items.count()
  for (let i = 0; i < n; i++) {
    await items.nth(i).scrollIntoViewIfNeeded().catch(() => {})
    await items.nth(i).click()
    await page.waitForTimeout(450) // let the detail panel re-render for the clicked row
    const badge = page.getByTestId('scenario-status-badge')
    if (!(await visible(badge, 3_000))) continue
    const txt = (await badge.innerText()).trim()
    if (statusRe.test(txt)) {
      await page.waitForTimeout(500)
      await shoot(name, page.getByTestId('scenario-detail-panel'))
      return
    }
  }
  throw new Error(`no scenario matched ${statusRe}`)
}

await tryShoot('scenario-detail-running', () =>
  captureScenarioInState('scenario-detail-running', /running/i))
await tryShoot('scenario-detail-done', () =>
  captureScenarioInState('scenario-detail-done', /done|complete/i))

await tryShoot('scenario-publish', async () => {
  await page.getByTestId('scenario-publish-btn').click({ timeout: 4_000 })
  const dialog = page.getByTestId('publish-roster-dialog')
  await dialog.waitFor({ state: 'visible', timeout: 8_000 })
  await page.getByTestId('publish-roster-table-scroll').waitFor({ state: 'visible', timeout: 20_000 })
  await page.waitForTimeout(600)
  await shoot('scenario-publish', dialog)
  await page.getByRole('button', { name: /^Cancel$/ }).click({ timeout: 4_000 }).catch(() => {})
  await dialog.waitFor({ state: 'hidden', timeout: 4_000 }).catch(() => {})
})

// ── Scenario: PO scope filters (Flight Filters group) ─────────────────────────
// Switch to the PO section, open the first PO scenario, and capture its Scope
// Filters column (the PoFlightFilter group is open by default).
await tryShoot('scenario-po-scope-filters', async () => {
  await page.keyboard.press('Escape').catch(() => {})
  await page.getByTestId('scenario-nav-po').click({ timeout: 4_000 })
  await page.waitForTimeout(800)
  const first = page.getByTestId('scenario-list-item').first()
  await first.waitFor({ timeout: 8_000 })
  await first.click()
  const scope = page.getByTestId('scenario-scope-filters')
  await scope.waitFor({ state: 'visible', timeout: 8_000 })
  await page.waitForTimeout(500)
  await shoot('scenario-po-scope-filters', scope)
})

// ── Scenario: Crew Bids review (Jun 2026, YEG base) ───────────────────────────
// Crew Bids is its own review view with Period / Base / Rank / Context filters.
// Pick a Jun-2026 period and the YEG base, search, then capture the filter bar +
// bid table. Best-effort: skips cleanly if that period/base has no demo data.
await tryShoot('scenario-crew-bids', async () => {
  await page.keyboard.press('Escape').catch(() => {})
  await page.getByTestId('scenario-nav-crew-bids').click({ timeout: 4_000 })
  await page.waitForTimeout(1_000)
  // Period: a native <select> when options exist, else a free-text input.
  const periodSelect = page.locator('select').first()
  if (await visible(periodSelect, 3_000)) {
    const jun = await periodSelect.locator('option', { hasText: /Jun.*2026|2026.*06|202606/i }).first().getAttribute('value').catch(() => null)
    if (jun) await periodSelect.selectOption(jun)
  }
  // Base: open the "All Bases" multiselect and tick YEG if present.
  const baseBtn = page.getByRole('button', { name: /All Bases|selected/i }).first()
  if (await visible(baseBtn, 2_000)) {
    await baseBtn.click()
    const yeg = page.getByText('YEG', { exact: false }).first()
    if (await visible(yeg, 2_000)) await yeg.click()
    await page.keyboard.press('Escape').catch(() => {})
  }
  await page.getByRole('button', { name: /^Search$/ }).first().click({ timeout: 4_000 })
  await page.waitForTimeout(1_500)
  // Capture the filter bar + table region (the crew-bids view fills the main area).
  const region = page.locator('[data-testid="scenario-gantt-view"], main, body').first()
  await shoot('scenario-crew-bids', (await visible(region)) ? region : page)
})

// "Creating a new scenario": the + button creates a Draft immediately (no dialog)
// and opens it in the detail panel. Capture that panel, then delete the draft so
// repeated runs do not pollute the demo data. Run LAST (it opens a confirm dialog).
await tryShoot('scenario-create-dialog', async () => {
  // Create the draft in the RO section so the pre-run check below shows real blockers.
  await page.getByTestId('scenario-nav-ro').click({ timeout: 4_000 }).catch(() => {})
  await page.waitForTimeout(500)
  await page.getByTestId('scenario-new-btn').click({ timeout: 4_000 })
  // A new Draft named "New Scenario" (the default) opens in the detail panel.
  await page.getByTestId('scenario-name-input').waitFor({ timeout: 5_000 })
  await page.waitForTimeout(400)
  await shoot('scenario-create-dialog', page.getByTestId('scenario-detail-panel'))

  // "Running an optimization" topic image — the actual Pre-run Check dialog.
  // A fresh draft is missing required fields, so Kick off run opens the dialog with
  // blockers (XCircle icon). This replaces the old running-detail-panel stand-in.
  try {
    await page.getByTestId('scenario-run-btn').click({ timeout: 4_000 })
    const dlg = page.getByTestId('run-check-dialog')
    await dlg.waitFor({ state: 'visible', timeout: 6_000 })
    await page.waitForTimeout(400)
    await shoot('scenario-run', dlg)
    await page.getByRole('button', { name: /^(Close|Cancel)$/ }).first().click({ timeout: 2_000 }).catch(() => {})
  } catch { /* keep the existing scenario-run.png if the dialog did not open */ }

  // Clean up: the unsaved draft is listed as "New Scenario"; delete it so repeated
  // runs do not pollute the demo data.
  await deleteScenarioRowByName('New Scenario').catch(() => {})
})

// ── Keyboard shortcuts dialog ────────────────────────────────────────────────
// Navigate back to Live (Scenario tab may be active after scenario shots above).
// Open the dialog via the toolbar button (title="Keyboard shortcuts"), then shoot
// the dialog itself, then close it so the page is clean.
await tryShoot('live-keyboard-shortcuts', async () => {
  await page.getByTestId('module-nav-live').click({ timeout: 4_000 }).catch(() => {})
  await page.waitForTimeout(600)
  const kbBtn = page.getByTitle('Keyboard shortcuts')
  await kbBtn.waitFor({ timeout: 5_000 })
  await kbBtn.click()
  const dlg = page.getByTestId('keyboard-shortcuts-dialog')
  await dlg.waitFor({ state: 'visible', timeout: 4_000 })
  await page.waitForTimeout(300)
  await shoot('live-keyboard-shortcuts', dlg)
  // Close via ESC (the backdrop click also works but ESC is cleaner here)
  await page.keyboard.press('Escape')
  await dlg.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {})
})

await browser.close()
console.log(`\n${captured} screenshots saved to ${OUT_DIR}`)
if (skipped) console.log(`${skipped} captures skipped (see ✗ lines above).`)
