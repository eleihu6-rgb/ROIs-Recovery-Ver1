/**
 * HEADED (fast) — execute PA-removal (stage 3) for the remaining YVR+YYZ pilots.
 *
 * Speed-ups (per user direction):
 *   - close the Pairing pane → roster-only, so loads + refreshes are cheap
 *   - focus the roster on a small group of target crew via the crew-ID filter
 *   - de-assign the group, Refresh so the rows visibly clear, then move to the next group
 *
 * Only TARGET crew (YVR+YYZ CA/FO, already plan-marked) are touched — non-target crew
 * are never marked or de-assigned.
 *
 *   node e2e/scripts/deassign-fast-headed.mjs
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const DIR = '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/e2e/scripts'
const GANTT = 'http://localhost:5173', API = 'http://localhost:3000'
const FROM = '2026-06-01T00:00:00Z', TO = '2026-07-01T00:00:00Z'
const GROUP = 10
const remaining = JSON.parse(readFileSync('/tmp/yvr_yyz_remaining.json', 'utf8'))
const log = (...a) => console.log('[fast]', ...a)

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
const bearer = { headers: { Authorization: `Bearer ${auth.token}` } }
log(`${remaining.length} target crew still to de-assign (groups of ${GROUP})`)

const execGroup = async (crewIds) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const j = await (await ctx.request.post(`${API}/api/crew-memo/pa-removal/execute`,
        { ...bearer, data: { crewIds, from: FROM, to: TO }, timeout: 180_000 })).json()
      if (j && typeof j.data?.deassigned === 'number') return j.data
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 2500))
  }
  log(`  ! execute failed for [${crewIds.join(',')}] — re-run will catch it`)
  return { deassigned: 0 }
}

await page.addInitScript((a) => window.sessionStorage.setItem('rois-auth', JSON.stringify({
  user: { userCode: a.userCode, userName: a.userName, schema: a.schema, isAdmin: a.isAdmin ?? 0 }, token: a.token })), auth)
await page.goto(`${GANTT}/altair/`)
await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
await page.getByTestId('module-nav-live').click()

// Close the Pairing pane → roster-only (much cheaper loads + refreshes).
const pairClose = page.getByTestId('pairing-pane').locator('[title="Close pane"]').first()
if (await pairClose.isVisible().catch(() => false)) {
  await pairClose.click()
  await page.getByTestId('pairing-pane').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
  log('closed Pairing pane — roster-only')
}

const iconCount = (crew) => page.evaluate((c) => {
  const rows = window.__ganttTest.roster?.() ?? []
  const badges = new Set(window.__ganttTest.memoBadges())
  return rows.filter((r) => c.includes(String(r.crewId)) && badges.has(r.id)).length
}, crew)

const setCrewFilter = async (crewIds, first) => {
  if (first) {
    const empty = page.getByTestId('live-empty-state')
    if (await empty.isVisible().catch(() => false)) await empty.click()
    else await page.getByTestId('filter-btn').click()
  } else {
    await page.getByTestId('filter-btn').click()
  }
  await page.getByTestId('filter-dialog').waitFor({ state: 'visible' })
  await page.getByTestId('filter-tab-crew').click().catch(() => {})
  await page.getByTestId('filter-reset').click().catch(() => {})        // clear previous group's chips
  await page.getByTestId('filter-tab-crew').click().catch(() => {})
  const idInput = page.getByTestId('filter-crew-id')
  await idInput.click()
  for (const c of crewIds) { await idInput.fill(c); await idInput.press('Enter') }
  await page.getByTestId('filter-apply').click()
  await page.getByTestId('filter-dialog').waitFor({ state: 'hidden' })
  await page.getByTestId('live-empty-state').waitFor({ state: 'hidden', timeout: 180_000 }).catch(() => {})
}

let total = 0
const nGroups = Math.ceil(remaining.length / GROUP)
for (let g = 0; g < nGroups; g++) {
  const chunk = remaining.slice(g * GROUP, g * GROUP + GROUP)
  await setCrewFilter(chunk, g === 0)
  // Let the group's rows + note icons paint (BEFORE).
  for (let i = 0; i < 20; i++) { if ((await iconCount(chunk)) > 0) break; await page.waitForTimeout(1500) }
  const before = await iconCount(chunk)
  await page.waitForTimeout(1200)
  // De-assign the whole group, then Refresh so the pucks + icons clear on screen (AFTER).
  const res = await execGroup(chunk)
  total += res.deassigned
  await page.getByTestId('refresh-btn').click().catch(() => {})
  await page.waitForTimeout(2000)
  const after = await iconCount(chunk)
  log(`group ${g + 1}/${nGroups} [${chunk.length} crew] — icons ${before}→${after}, de-assigned ${res.deassigned}  (total ${total})`)
  if (g === 0) await page.screenshot({ path: `${DIR}/deassign-fast-group1.png` })
}

log(`DONE — de-assigned ${total} duties across ${remaining.length} target crew`)
await page.screenshot({ path: `${DIR}/deassign-fast-done.png` })
log('window stays open 45s for review…')
await page.waitForTimeout(45_000)
await browser.close()
