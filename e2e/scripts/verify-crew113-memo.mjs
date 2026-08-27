/** Verify crew 113's memo note icons render on the live gantt; screenshot proof. */
import { chromium } from 'playwright'

const GANTT = 'http://localhost:5173'
const API = 'http://localhost:3000'
const log = (...a) => console.log('[verify]', ...a)

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } })
const page = await ctx.newPage()

const res = await ctx.request.post(`${API}/api/auth/login`, { data: { userCode: 'admin', password: '123456' } })
const auth = (await res.json()).data
await page.addInitScript((a) => {
  window.sessionStorage.setItem('rois-auth', JSON.stringify({
    user: { userCode: a.userCode, userName: a.userName, schema: a.schema, isAdmin: a.isAdmin ?? 0 }, token: a.token,
  }))
}, auth)

await page.goto(`${GANTT}/altair/`)
await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
await page.getByTestId('module-nav-live').click()
const empty = page.getByTestId('live-empty-state')
let atEmpty = true
try { await empty.waitFor({ state: 'visible', timeout: 5_000 }) } catch { atEmpty = false }
const pick = async (prefix, vals) => {
  await page.getByTestId(`${prefix}-trigger`).click()
  for (const v of vals) await page.getByTestId(`${prefix}-opt-${v}`).click()
  await page.getByTestId('filter-tab-crew').click()
}
if (atEmpty) { await empty.click() } else { await page.getByTestId('filter-btn').click() }
await page.getByTestId('filter-dialog').waitFor({ state: 'visible' })
await page.getByTestId('filter-tab-crew').click().catch(() => {})
await pick('filter-crew-base', ['YVR'])
await pick('filter-crew-rank', ['CA', 'FO'])
const idIn = page.getByPlaceholder('e.g. 12345, 67890')
await idIn.fill('113'); await idIn.press('Enter')
await page.getByTestId('filter-apply').click()
await page.getByTestId('filter-dialog').waitFor({ state: 'hidden' })
await empty.waitFor({ state: 'hidden', timeout: 270_000 }).catch(() => {})
await page.getByTestId('date-range-to').fill('2026-06-30')
await page.getByTestId('date-range-from').fill('2026-06-01')
await page.waitForFunction(() => window.__ganttTest?.ready?.() ?? false, undefined, { timeout: 120_000 }).catch(() => {})
await page.waitForTimeout(4000) // let memo fetch + render settle

const roster = await page.evaluate(() => window.__ganttTest.roster?.() ?? [])
log('roster rows:', roster.length, '| crew 113 present:', roster.some((r) => String(r.crewId) === '113'))
const out = 'e2e/scripts/crew113-memo.png'
await page.screenshot({ path: out })
log('screenshot ->', out)
// tight crop of the top rows where crew 113 is pinned
await page.screenshot({ path: 'e2e/scripts/crew113-memo-crop.png', clip: { x: 0, y: 60, width: 1600, height: 220 } })
log('crop -> e2e/scripts/crew113-memo-crop.png')
await browser.close()
