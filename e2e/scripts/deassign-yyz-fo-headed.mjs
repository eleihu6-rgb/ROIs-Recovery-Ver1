/**
 * HEADED — de-assign YYZ base / FO rank pilots, June 2026 (the user's fast manual flow).
 *
 *   1. open Live, close the Pairing pane (roster-only → fast loads)
 *   2. apply the BASE + RANK facet filter (YYZ + FO) → loads ONLY that ~47-crew slice
 *   3. walk the loaded crew first → last: de-assign each via the stage-3 endpoint
 *      (the same call the UI's PA-removal makes), scrolling down to keep the active
 *      crew in the viewport, refreshing so cleared rows visibly update
 *
 * Idempotent: already-de-assigned rows are skipped, so re-runs only finish leftovers.
 *
 *   node e2e/scripts/deassign-yyz-fo-headed.mjs
 */
import { chromium } from 'playwright'

const GANTT = 'http://localhost:5173', API = 'http://localhost:3000'
const FROM = '2026-06-01T00:00:00Z', TO = '2026-07-01T00:00:00Z'
const BASES = ['YYZ'], RANKS = ['FO']
const REFRESH_EVERY = 8
const log = (...a) => console.log('[yyz-fo]', ...a)

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

const browser = await chromium.launch({ headless: false, slowMo: 50 })
const ctx = await browser.newContext({ viewport: { width: 1680, height: 940 } })
const page = await ctx.newPage()
const auth = await login(ctx)
const bearer = { headers: { Authorization: `Bearer ${auth.token}` } }

const execCrew = async (crewId) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const j = await (await ctx.request.post(`${API}/api/crew-memo/pa-removal/execute`,
        { ...bearer, data: { crewIds: [crewId], from: FROM, to: TO }, timeout: 120_000 })).json()
      if (j && typeof j.data?.deassigned === 'number') return j.data.deassigned
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 2500))
  }
  log(`  ! execute failed for ${crewId} (a re-run will catch it)`)
  return 0
}

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

// Apply the BASE + RANK facet filter → loads ONLY the target slice (non-windowed).
log(`loading ${BASES.join('/')} ${RANKS.join('/')} pilots via facet filter…`)
await page.evaluate(({ bases, ranks }) => window.__ganttTest.applyCrewFilter({ bases, ranks }), { bases: BASES, ranks: RANKS })
await page.getByTestId('live-empty-state').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {})

// Wait for the target crew rows to populate (poll up to ~120s under DB load).
let order = []
for (let i = 0; i < 40; i++) {
  order = await page.evaluate(() => (window.__ganttTest.rosterPanelOrder?.() ?? []).map((r) => String(r.crewId)))
  if (order.length > 0) break
  await page.waitForTimeout(3000)
}
if (order.length === 0) {
  log('ABORT — no target crew loaded (DB likely saturated); not de-assigning over an empty set.')
  await browser.close(); process.exit(2)
}
await page.waitForTimeout(1500)
order = await page.evaluate(() => (window.__ganttTest.rosterPanelOrder?.() ?? []).map((r) => String(r.crewId)))
log(`loaded ${order.length} target crew — de-assigning first → last`)

// Anchor the mouse over the roster pane so wheel events scroll the crew list.
const pane = page.getByTestId('roster-pane').first()
const box = await pane.boundingBox().catch(() => null)
if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

let total = 0
for (let i = 0; i < order.length; i++) {
  const crewId = order[i]
  const n = await execCrew(crewId)
  total += n
  // Keep the active crew in view: nudge the list down as we descend.
  if (box && i >= 6) await page.mouse.wheel(0, 56)
  if (i % REFRESH_EVERY === REFRESH_EVERY - 1) {
    await page.getByTestId('refresh-btn').click().catch(() => {})
    await page.waitForTimeout(1200)
    log(`  …${i + 1}/${order.length} crew, ${total} duties de-assigned`)
  }
}

await page.getByTestId('refresh-btn').click().catch(() => {})
await page.waitForTimeout(2500)
log(`DONE — de-assigned ${total} duties across ${order.length} ${BASES.join('/')} ${RANKS.join('/')} pilots`)
log('window stays open 40s for review…')
await page.waitForTimeout(40_000)
await browser.close()
