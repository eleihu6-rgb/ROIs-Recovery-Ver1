/**
 * HEADED — de-assign ALL YVR+YYZ base pilots (CA+FO), June 2026.
 *
 * Fast path (per user direction):
 *   1. close the Pairing pane (roster-only)
 *   2. apply the DIVISION + BASE + RANK facet filter → loads ONLY the target crew
 *      (non-windowed path, not all 815 crew) — fast
 *   3. walk the loaded crew top→bottom: de-assign each, scroll down to follow,
 *      Refresh periodically so the cleared rows update on screen
 *
 * Idempotent: already-de-assigned rows are skipped, so a re-run only finishes leftovers.
 *
 *   node e2e/scripts/deassign-all-headed.mjs
 */
import { chromium } from 'playwright'

const GANTT = 'http://localhost:5173', API = 'http://localhost:3000'
const FROM = '2026-06-01T00:00:00Z', TO = '2026-07-01T00:00:00Z'
const REFRESH_EVERY = 15
const SCROLL_EVERY = 3
const log = (...a) => console.log('[all]', ...a)

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

const browser = await chromium.launch({ headless: false, slowMo: 40 })
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
  log(`  ! execute failed for ${crewId} (will be caught on a re-run)`)
  return 0
}

await page.addInitScript((a) => window.sessionStorage.setItem('rois-auth', JSON.stringify({
  user: { userCode: a.userCode, userName: a.userName, schema: a.schema, isAdmin: a.isAdmin ?? 0 }, token: a.token })), auth)
await page.goto(`${GANTT}/altair/`)
await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
await page.getByTestId('module-nav-live').click()

// Close the Pairing pane → roster-only.
const pairClose = page.getByTestId('pairing-pane').locator('[title="Close pane"]').first()
if (await pairClose.isVisible().catch(() => false)) {
  await pairClose.click()
  await page.getByTestId('pairing-pane').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
  log('closed Pairing pane — roster-only')
}

// Apply the BASE + RANK facet filter directly (loads ONLY target crew — non-windowed).
log('loading YVR+YYZ pilots (bases YVR/YYZ, ranks CA/FO) via facet filter…')
await page.evaluate(() => window.__ganttTest.applyCrewFilter({ bases: ['YVR', 'YYZ'], ranks: ['CA', 'FO'] }))
await page.getByTestId('live-empty-state').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {})

// Robustly wait for the target crew to load (poll up to ~240s under DB load).
let order = []
for (let i = 0; i < 80; i++) {
  order = await page.evaluate(() => (window.__ganttTest.rosterPanelOrder?.() ?? []).map((r) => String(r.crewId)))
  if (order.length > 0) break
  await page.waitForTimeout(3000)
}
if (order.length === 0) {
  log('ABORT — no target crew loaded (DB likely saturated); not de-assigning over an empty set.')
  await browser.close(); process.exit(2)
}
await page.waitForTimeout(2000)
order = await page.evaluate(() => (window.__ganttTest.rosterPanelOrder?.() ?? []).map((r) => String(r.crewId)))
log(`loaded ${order.length} target crew — starting de-assignment, first → last`)

// Anchor the mouse over the roster pane so wheel events scroll the list.
const pane = page.getByTestId('roster-pane').first()
const box = await pane.boundingBox().catch(() => null)
if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

let total = 0, done = 0
for (let i = 0; i < order.length; i++) {
  const crewId = order[i]
  const n = await execCrew(crewId)
  total += n; done += 1
  if (i % SCROLL_EVERY === SCROLL_EVERY - 1 && box) await page.mouse.wheel(0, 90)
  if (i % REFRESH_EVERY === REFRESH_EVERY - 1) {
    await page.getByTestId('refresh-btn').click().catch(() => {})
    await page.waitForTimeout(1500)
    log(`  …${done}/${order.length} crew processed, ${total} duties de-assigned`)
  }
}

await page.getByTestId('refresh-btn').click().catch(() => {})
await page.waitForTimeout(2500)
log(`DONE — de-assigned ${total} duties across ${order.length} YVR+YYZ pilots`)
log('window stays open 45s for review…')
await page.waitForTimeout(45_000)
await browser.close()
