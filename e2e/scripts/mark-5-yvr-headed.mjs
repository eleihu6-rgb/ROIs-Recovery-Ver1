/**
 * HEADED demo — mark the to-be-de-assigned duties for 5 YVR-base crew.
 *
 * Loads exactly the 5 crew via the filter dialog's crew-ID input (no flaky
 * reference dropdowns), then shows the yellow note icons on every duty the
 * PA-removal plan marked for de-assignment. Verifies per-crew counts:
 *   113=27  390=24  535=15  927=1  1147=31  (98 total)
 *
 *   node e2e/scripts/mark-5-yvr-headed.mjs
 *
 * The default planning window is June+July 2026, so the June memos render
 * without any date change. Memos are seeded by stage-1 PA-removal beforehand.
 */
import { chromium } from 'playwright'

const DIR = '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/e2e/scripts'
const GANTT = 'http://localhost:5173', API = 'http://localhost:3000'
const CREW = ['113', '390', '535', '927', '1147', '379']
const FROM = '2026-06-01T00:00:00Z', TO = '2026-07-01T00:00:00Z'
const log = (...a) => console.log('[mark-5]', ...a)

const browser = await chromium.launch({ headless: false, slowMo: 120 })
const ctx = await browser.newContext({ viewport: { width: 1680, height: 920 } })
const page = await ctx.newPage()

const auth = (await (await ctx.request.post(`${API}/api/auth/login`, { data: { userCode: 'admin', password: '123456' } })).json()).data
const bearer = { headers: { Authorization: `Bearer ${auth.token}` } }

// Re-seed the stage-1 plan so the demo is self-contained (idempotent: clears type=3 first).
for (const c of CREW) {
  const existing = (await (await ctx.request.get(`${API}/api/crew-memo?crewIds=${c}&from=${FROM}&to=${TO}`, bearer)).json()).data
  for (const m of existing) await ctx.request.delete(`${API}/api/crew-memo/${m.id}`, bearer)
}
const plan = (await (await ctx.request.post(`${API}/api/crew-memo/pa-removal`,
  { ...bearer, data: { crewIds: CREW, from: FROM, to: TO } })).json()).data
log(`stage-1 plan written: ${plan.written} memos across ${plan.crewCount} crew`, plan.byCrew)

await page.addInitScript((a) => window.sessionStorage.setItem('rois-auth', JSON.stringify({
  user: { userCode: a.userCode, userName: a.userName, schema: a.schema, isAdmin: a.isAdmin ?? 0 }, token: a.token })), auth)
await page.goto(`${GANTT}/altair/`)
await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
await page.getByTestId('module-nav-live').click()

// Open the filter dialog (via empty-state if present, else the header Filter button).
const empty = page.getByTestId('live-empty-state')
const atEmpty = await empty.isVisible().catch(() => false)
if (atEmpty) await empty.click(); else await page.getByTestId('filter-btn').click()
await page.getByTestId('filter-dialog').waitFor({ state: 'visible' })
await page.getByTestId('filter-tab-crew').click().catch(() => {})

// Type the 5 crew IDs into the crew-ID chip input (no reference data needed).
const idInput = page.getByTestId('filter-crew-id')
await idInput.click()
for (const c of CREW) { await idInput.fill(c); await idInput.press('Enter') }
log('entered crew IDs:', CREW.join(', '))
await page.getByTestId('filter-apply').click()
await page.getByTestId('filter-dialog').waitFor({ state: 'hidden' })
await empty.waitFor({ state: 'hidden', timeout: 270_000 }).catch(() => {})

// Roster + memo overlay load incrementally under DB load, so poll the per-crew
// icon counts until they all match the plan (or a generous deadline elapses).
const EXPECT = plan.byCrew
const countIcons = () => page.evaluate((crew) => {
  const rows = window.__ganttTest.roster?.() ?? []
  const badges = new Set(window.__ganttTest.memoBadges())
  const out = {}
  for (const c of crew) {
    const ids = rows.filter((r) => String(r.crewId) === c).map((r) => r.id)
    out[c] = ids.filter((id) => badges.has(id)).length
  }
  return out
}, CREW)

let counts = {}, ok = false
const deadline = 240_000 / 5000
for (let i = 0; i < deadline; i++) {
  counts = await countIcons()
  ok = CREW.every((c) => (counts[c] ?? 0) === EXPECT[c])
  if (ok) break
  await page.waitForTimeout(5000)
}
for (const c of CREW) {
  const got = counts[c] ?? 0, want = EXPECT[c]
  log(`  crew ${c}: ${got} icons (expected ${want}) ${got === want ? '✓' : '✗'}`)
}
log(ok ? 'ALL PER-CREW ICON COUNTS MATCH ✓' : 'MISMATCH — some crew still loading')

await page.screenshot({ path: `${DIR}/mark-5-yvr-board.png` })
log('screenshot → mark-5-yvr-board.png')
log('headed window stays open 90s so you can review the icons…')
await page.waitForTimeout(90_000)
await browser.close()
process.exit(ok ? 0 : 1)
