/** Patient verify: wait for roster items to stream in, then screenshot crew 113's memo icons. */
import { chromium } from 'playwright'
const DIR = '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/e2e/scripts'
const GANTT = 'http://localhost:5173', API = 'http://localhost:3000'
const log = (...a) => console.log('[patient]', ...a)
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } })
const page = await ctx.newPage()
const auth = (await (await ctx.request.post(`${API}/api/auth/login`, { data: { userCode: 'admin', password: '123456' } })).json()).data
await page.addInitScript((a) => window.sessionStorage.setItem('rois-auth', JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema, isAdmin: a.isAdmin ?? 0 }, token: a.token })), auth)
await page.goto(`${GANTT}/altair/`)
await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
await page.getByTestId('module-nav-live').click()
const empty = page.getByTestId('live-empty-state')
let atEmpty = true
try { await empty.waitFor({ state: 'visible', timeout: 5_000 }) } catch { atEmpty = false }
const pick = async (p, vs) => { await page.getByTestId(`${p}-trigger`).click(); for (const v of vs) await page.getByTestId(`${p}-opt-${v}`).click(); await page.getByTestId('filter-tab-crew').click() }
if (atEmpty) await empty.click(); else await page.getByTestId('filter-btn').click()
await page.getByTestId('filter-dialog').waitFor({ state: 'visible' })
await page.getByTestId('filter-tab-crew').click().catch(() => {})
await pick('filter-crew-base', ['YVR']); await pick('filter-crew-rank', ['CA', 'FO'])
const idIn = page.getByPlaceholder('e.g. 12345, 67890'); await idIn.fill('113'); await idIn.press('Enter')
await page.getByTestId('filter-apply').click()
await page.getByTestId('filter-dialog').waitFor({ state: 'hidden' })
await empty.waitFor({ state: 'hidden', timeout: 270_000 }).catch(() => {})
await page.getByTestId('date-range-to').fill('2026-06-30'); await page.getByTestId('date-range-from').fill('2026-06-01')
// poll until crew 113 has roster items
let n = 0
for (let i = 0; i < 50; i++) {
  n = await page.evaluate(() => (window.__ganttTest.roster?.() ?? []).filter((r) => String(r.crewId) === '113').length)
  log(`poll ${i}: crew113 items=${n}`)
  if (n > 0) break
  await page.waitForTimeout(6000)
}
await page.waitForTimeout(3000)
await page.screenshot({ path: `${DIR}/memo-full.png` })
await page.screenshot({ path: `${DIR}/memo-crew113.png`, clip: { x: 300, y: 145, width: 1100, height: 60 } })
log('crew113 roster items:', n, '-> screenshots written')
await browser.close()
