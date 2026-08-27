/**
 * HEADED — de-assign pilots through the REAL gantt user flow (per CLAUDE.md §Simulate-User):
 *
 *   for each loaded crew:
 *     1. select the PA-removal-marked duty pucks   (window.__ganttTest.selectRosterTasks — multi-select)
 *     2. press Delete                              (real keyboard shortcut → draft remove op)
 *     3. click Save                                (draft-save-btn → commit → real /api/roster delete)
 *     4. confirm past any rule dialog              (rule-confirm-proceed, if removal flags a new violation)
 *
 * No direct API mutation — the de-assignment is fired by the UI's own handlers. The browser
 * is doing the work, exactly what a headed run is for.
 *
 *   BASES=YYZ RANKS=FO node e2e/scripts/deassign-via-ui-delete.mjs
 */
import { chromium } from 'playwright'

const GANTT = 'http://localhost:5173', API = 'http://localhost:3000'
const BASES = (process.env.BASES || 'YYZ').split(',')
// Filter by crew-level rank only if RANKS is set; otherwise load all pilots of the base
// (the marked duties carry roster_acting_rank, which differs from crew-level rank, so a
// rank filter would miss marked crew — base + division=Pilot surfaces them all).
const RANKS = (process.env.RANKS || '').split(',').filter(Boolean)
const DIVISIONS = (process.env.DIVISIONS || 'P').split(',').filter(Boolean)
// CREW_IDS overrides base/rank: load exactly these crew by id (handles multi-base stragglers
// whose gantt base ≠ their prime base, so a base filter never surfaces them).
const CREW_IDS = (process.env.CREW_IDS || '').split(',').filter(Boolean)
const log = (...a) => console.log('[ui-delete]', ...a)

const login = async (ctx) => {
  for (let i = 0; i < 5; i++) {
    try {
      const j = await (await ctx.request.post(`${API}/api/auth/login`, { data: { userCode: 'admin', password: '123456' }, timeout: 30_000 })).json()
      if (j?.data?.token) return j.data
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error('login failed')
}

const browser = await chromium.launch({ headless: false, slowMo: 60 })
const ctx = await browser.newContext({ viewport: { width: 1680, height: 940 } })
const page = await ctx.newPage()
const auth = await login(ctx)

await page.addInitScript((a) => window.sessionStorage.setItem('rois-auth', JSON.stringify({
  user: { userCode: a.userCode, userName: a.userName, schema: a.schema, isAdmin: a.isAdmin ?? 0 }, token: a.token })), auth)
await page.goto(`${GANTT}/altair/`)
await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
await page.getByTestId('module-nav-live').click()

// Close the Pairing pane → roster-only (cheaper loads + refreshes).
const pairClose = page.getByTestId('pairing-pane').locator('[title="Close pane"]').first()
if (await pairClose.isVisible().catch(() => false)) {
  await pairClose.click()
  await page.getByTestId('pairing-pane').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
  log('closed Pairing pane — roster-only')
}

// Facet filter → load ONLY the target slice. Rank only when explicitly set (RANKS),
// otherwise division=Pilot so every marked pilot loads regardless of crew-level rank.
// Optional: widen the visible window (real date-range-from input) so boundary duties
// dated just before the default range render and become selectable.
if (process.env.FROM_DATE) {
  await page.getByTestId('date-range-from').fill(process.env.FROM_DATE).catch(() => {})
  await page.waitForTimeout(1500)
  log(`set date-range-from = ${process.env.FROM_DATE}`)
}

let filter, slice
if (CREW_IDS.length) {
  filter = { crewIds: CREW_IDS }
  slice = `${CREW_IDS.length} crew by id`
} else {
  filter = { bases: BASES }
  if (RANKS.length) filter.ranks = RANKS
  else if (DIVISIONS.length) filter.divisions = DIVISIONS
  slice = `${BASES.join('/')} ${RANKS.length ? RANKS.join('/') : DIVISIONS.join('/')}`
}
log(`loading ${slice} via facet filter…`)
await page.evaluate((f) => window.__ganttTest.applyCrewFilter(f), filter)
await page.getByTestId('live-empty-state').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {})

// Wait for crew rows.
let order = []
for (let i = 0; i < 40; i++) {
  order = await page.evaluate(() => (window.__ganttTest.rosterPanelOrder?.() ?? []).map((r) => String(r.crewId)))
  if (order.length > 0) break
  await page.waitForTimeout(3000)
}
if (order.length === 0) { log('ABORT — no crew loaded'); await browser.close(); process.exit(2) }

// Wait for PA-removal memo icons to load AND stabilize (memos stream in after first paint;
// reading too early makes the loop skip crew whose memos hadn't arrived yet → needs the
// count to hold steady across several polls before we walk the list).
let badges = 0, stable = 0, prev = -1
for (let i = 0; i < 60; i++) {
  badges = await page.evaluate(() => (window.__ganttTest.memoBadges?.() ?? []).length)
  if (badges > 0 && badges === prev) { stable += 1; if (stable >= 4) break } else { stable = 0 }
  prev = badges
  await page.waitForTimeout(1500)
}
log(`loaded ${order.length} crew, ${badges} marked duties — starting select → Delete → Save, crew by crew`)

// Marked (memo'd) rendered task ids for one crew.
const markedTaskIdsFor = (crewId) => page.evaluate((cid) => {
  const marked = new Set(window.__ganttTest.memoBadges?.() ?? [])
  return (window.__ganttTest.roster?.() ?? [])
    .filter((t) => String(t.crewId) === String(cid) && marked.has(t.id))
    .map((t) => t.id)
}, crewId)

const ROW_HEIGHT = 43
// Absolute-scroll the live roster so the active crew sits ~2 rows below the top (the
// 2nd–3rd visible row) — easy to watch. Near the bottom the store clamps the scroll, so
// the final crew lands wherever the last page falls. (mouse-wheel doesn't drive the canvas.)
// Layout-store pane type is 'roster' (NOT 'roster-main' — that's only a render label),
// so the scroll hooks must use the 'roster' prefix or they match nothing.
const scrollToRow = (idx) => page.evaluate(({ i, rh }) => {
  const cur = window.__ganttTest.paneScrollY?.('roster') ?? 0
  const target = Math.max(0, (i - 2) * rh)
  window.__ganttTest.scrollPaneVertically?.('roster', target - cur)
}, { i: idx, rh: ROW_HEIGHT })

let crewDone = 0, dutiesDeleted = 0
for (let i = 0; i < order.length; i++) {
  const crewId = order[i]
  const ids = await markedTaskIdsFor(crewId)
  if (ids.length === 0) continue

  // keep the active crew in view, then operate on it
  await scrollToRow(i)
  await page.waitForTimeout(120)

  // 1. select the marked duties (multi-select)
  await page.evaluate((taskIds) => window.__ganttTest.selectRosterTasks(taskIds), ids)
  await page.waitForTimeout(150)
  // 2. Delete (real keyboard shortcut → draft remove op). Blur first: the keydown handler
  //    ignores Delete when focus sits in an <input> (e.g. after editing the date range).
  await page.evaluate(() => document.activeElement?.blur?.())
  await page.keyboard.press('Delete')
  await page.waitForTimeout(250)
  // 3. Save (real button → /api/draft/commit → real de-assign)
  await page.getByTestId('draft-save-btn').click().catch(() => {})
  // 4. wait for the REAL commit — poll for the success toast (the only honest signal that
  //    /api/draft/commit landed; local draft state clears on Delete and would lie). Click
  //    Proceed if removal flags a new violation. preCheck can take several seconds under load.
  let saved = false
  for (let w = 0; w < 80; w++) {
    if (await page.getByTestId('rule-confirm-proceed').isVisible().catch(() => false)) {
      await page.getByTestId('rule-confirm-proceed').click().catch(() => {})
    }
    if (await page.getByText('Changes saved successfully').isVisible().catch(() => false)) { saved = true; break }
    await page.waitForTimeout(500)
  }
  if (!saved) { log(`  ! crew ${crewId} save NOT confirmed — skipping (re-run will catch it)`); continue }
  // let the toast clear so it isn't counted for the next crew
  await page.getByText('Changes saved successfully').waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {})
  crewDone += 1; dutiesDeleted += ids.length
  if (crewDone % 5 === 0) log(`  …${crewDone} crew de-assigned, ~${dutiesDeleted} duties removed`)
}

log(`DONE — de-assigned ${crewDone} ${slice} crew (~${dutiesDeleted} duties) via select → Delete → Save`)
log('window stays open 40s for review…')
await page.waitForTimeout(40_000)
await browser.close()
