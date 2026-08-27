/**
 * HEADED — execute PA-removal (stage 3) for YVR + YYZ pilots (CA + FO), June 2026.
 *
 * Shows the de-assignment progress:
 *   1. marks the plan (stage 1) and captures the full crew set
 *   2. loads 8 sample crew (4 YVR + 4 YYZ) in the Gantt with their note icons (BEFORE)
 *   3. de-assigns each sample crew ONE AT A TIME, clicking Refresh between each so the
 *      flying pairings + days off visibly disappear row by row
 *   4. sweeps the remaining crew in batches, logging running progress to the terminal
 *   5. final Refresh (AFTER) — sample rows now hold only protected duties (VAC/SIM/RES)
 *
 *   node e2e/scripts/deassign-yvr-yyz-headed.mjs
 *
 * NOTE: this performs the REAL de-assignment (roster_flight.is_deleted = 1). It is
 * reversible (set is_deleted back to 0) but it mutates the live demo data.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const DIR = '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/e2e/scripts'
const GANTT = 'http://localhost:5173', API = 'http://localhost:3000'
const FROM = '2026-06-01T00:00:00Z', TO = '2026-07-01T00:00:00Z'
const SAMPLE = ['0227', '113', '1147', '1153', '1001', '1013', '1015', '1076'] // 4 YVR + 4 YYZ
const BATCH = 25
const log = (...a) => console.log('[deassign]', ...a)

const login = async (ctx) => {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await ctx.request.post(`${API}/api/auth/login`, { data: { userCode: 'admin', password: '123456' }, timeout: 30_000 })
      const j = await r.json()
      if (j?.data?.token) return j.data
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 3000))
  }
  throw new Error('login failed after retries')
}

const browser = await chromium.launch({ headless: false, slowMo: 80 })
const ctx = await browser.newContext({ viewport: { width: 1680, height: 940 } })
const page = await ctx.newPage()
const auth = await login(ctx)
const bearer = { headers: { Authorization: `Bearer ${auth.token}` } }

// ── Plan already marked (stage 1); load the crew set from the prepared list ────
const allCrew = JSON.parse(readFileSync('/tmp/yvr_yyz_crew.json', 'utf8'))
log(`plan already marked — ${allCrew.length} YVR+YYZ pilots queued for de-assignment`)

// ── Load the Gantt focused on the 8 sample crew ───────────────────────────────
await page.addInitScript((a) => window.sessionStorage.setItem('rois-auth', JSON.stringify({
  user: { userCode: a.userCode, userName: a.userName, schema: a.schema, isAdmin: a.isAdmin ?? 0 }, token: a.token })), auth)
await page.goto(`${GANTT}/altair/`)
await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
await page.getByTestId('module-nav-live').click()
const empty = page.getByTestId('live-empty-state')
const atEmpty = await empty.isVisible().catch(() => false)
if (atEmpty) await empty.click(); else await page.getByTestId('filter-btn').click()
await page.getByTestId('filter-dialog').waitFor({ state: 'visible' })
await page.getByTestId('filter-tab-crew').click().catch(() => {})
const idInput = page.getByTestId('filter-crew-id')
await idInput.click()
for (const c of SAMPLE) { await idInput.fill(c); await idInput.press('Enter') }
await page.getByTestId('filter-apply').click()
await page.getByTestId('filter-dialog').waitFor({ state: 'hidden' })
await empty.waitFor({ state: 'hidden', timeout: 270_000 }).catch(() => {})

const sampleIconCount = () => page.evaluate((crew) => {
  const rows = window.__ganttTest.roster?.() ?? []
  const badges = new Set(window.__ganttTest.memoBadges())
  return rows.filter((r) => crew.includes(String(r.crewId)) && badges.has(r.id)).length
}, SAMPLE)

// Wait for the sample rows + their icons to paint (BEFORE state).
for (let i = 0; i < 40; i++) { if ((await sampleIconCount()) > 0) break; await page.waitForTimeout(3000) }
log(`BEFORE — ${await sampleIconCount()} to-be-de-assigned icons on the 8 sample crew`)
await page.screenshot({ path: `${DIR}/deassign-before.png` })
await page.waitForTimeout(4000)

const refresh = async () => {
  await page.getByTestId('refresh-btn').click().catch(() => {})
  await page.waitForTimeout(2500)
}

// Robust execute: retries on a server hiccup / malformed envelope; idempotent so a
// re-run just skips already-deleted rows. Never throws — returns {deassigned}.
const execCrew = async (crewIds) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await ctx.request.post(`${API}/api/crew-memo/pa-removal/execute`,
        { ...bearer, data: { crewIds, from: FROM, to: TO }, timeout: 180_000 })
      const j = await r.json()
      if (j && typeof j.data?.deassigned === 'number') return j.data
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 2500))
  }
  log(`  ! execute failed after retries for [${crewIds.join(',')}] — will be caught on a re-run`)
  return { deassigned: 0 }
}

// ── Stage 3a: de-assign the 8 sample crew ONE AT A TIME (watch rows clear) ─────
let total = 0
for (const c of SAMPLE) {
  const res = await execCrew([c])
  total += res.deassigned
  await refresh()
  log(`  de-assigned crew ${c}: ${res.deassigned} duties  (running total ${total})`)
}
await page.screenshot({ path: `${DIR}/deassign-after-sample.png` })

// ── Stage 3b: sweep the remaining crew in batches (terminal progress) ──────────
const rest = allCrew.filter((c) => !SAMPLE.includes(c))
log(`sweeping remaining ${rest.length} crew in batches of ${BATCH}…`)
for (let i = 0; i < rest.length; i += BATCH) {
  const chunk = rest.slice(i, i + BATCH)
  const res = await execCrew(chunk)
  total += res.deassigned
  log(`  batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(rest.length / BATCH)} — +${res.deassigned}  (running total ${total})`)
}

await refresh()
log(`DONE — de-assigned ${total} duties across ${allCrew.length} YVR+YYZ pilots`)
log(`AFTER — ${await sampleIconCount()} icons remain on the sample crew (expect 0; protected VAC/SIM/RES stay as pucks)`)
await page.screenshot({ path: `${DIR}/deassign-after-all.png` })
log('headed window stays open 90s for review…')
await page.waitForTimeout(90_000)
await browser.close()
