/**
 * Headed driver: open the LIVE gantt, scope to YVR CA/FO crew, pin crew 113 to
 * the top, set the date range to June 2026, and leave the browser open so we can
 * eyeball crew 113's to-be-de-assigned duties (flying pairings + days off).
 *
 * This is a manual "show me" driver for preparing the PBS-solver roster
 * de-assignment skill — it does NOT change any data.
 *
 *   node e2e/scripts/show-crew113-deassign.mjs
 */
import { chromium } from 'playwright'

const GANTT_URL = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'
const API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const USER = process.env.GANTT_TEST_USER ?? 'admin'
const PASS = process.env.GANTT_TEST_PASS ?? '123456'
const CREW = process.env.CREW_ID ?? '113'

const log = (...a) => console.log('[show113]', ...a)

const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] })
const ctx = await browser.newContext({ viewport: null })
const page = await ctx.newPage()

// 1. API login → token + user
const res = await ctx.request.post(`${API}/api/auth/login`, { data: { userCode: USER, password: PASS } })
if (!res.ok()) throw new Error(`login failed ${res.status()}`)
const auth = (await res.json()).data
log('logged in as', auth.userCode, 'schema', auth.schema, 'isAdmin', auth.isAdmin)

// 2. Seed sessionStorage auth before first navigation
await page.addInitScript((a) => {
  window.sessionStorage.setItem('rois-auth', JSON.stringify({
    user: { userCode: a.userCode, userName: a.userName, schema: a.schema, isAdmin: a.isAdmin ?? 0 },
    token: a.token,
  }))
}, auth)

// 3. Open gantt, wait for introspection hook
await page.goto(`${GANTT_URL}/altair/`)
await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
log('gantt loaded, __ganttTest ready')

// 4. Enter Live view; on the empty-state-triggered filter, scope crew set
await page.getByTestId('module-nav-live').click()
const empty = page.getByTestId('live-empty-state')
let needFilterAtEmpty = true
try { await empty.waitFor({ state: 'visible', timeout: 5_000 }) }
catch { needFilterAtEmpty = false; log('data already loaded this session') }

const openCrewFilter = async () => {
  await page.getByTestId('filter-btn').click()
  await page.getByTestId('filter-dialog').waitFor({ state: 'visible' })
  await page.getByTestId('filter-tab-crew').click().catch(() => {})
}
const pickMulti = async (prefix, values) => {
  await page.getByTestId(`${prefix}-trigger`).click()
  for (const v of values) await page.getByTestId(`${prefix}-opt-${v}`).click()
  await page.getByTestId('filter-tab-crew').click() // close dropdown overlay
}

if (needFilterAtEmpty) {
  await empty.click()
  await page.getByTestId('filter-dialog').waitFor({ state: 'visible' })
  await page.getByTestId('filter-tab-crew').click().catch(() => {})
} else {
  await openCrewFilter()
}

// Scope: Base = YVR, Rank = CA + FO  (the 73-crew solver set)
await pickMulti('filter-crew-base', ['YVR'])
await pickMulti('filter-crew-rank', ['CA', 'FO'])
// Pin crew 113 to the top
const crewIdInput = page.getByPlaceholder('e.g. 12345, 67890')
await crewIdInput.fill(CREW)
await crewIdInput.press('Enter')

await page.getByTestId('filter-apply').click()
await page.getByTestId('filter-dialog').waitFor({ state: 'hidden' })
log('filter applied: base=YVR rank=CA,FO pin crew', CREW, '— loading…')
await empty.waitFor({ state: 'hidden', timeout: 270_000 }).catch(() => {})

// 5. Set date range to June 2026
await page.getByTestId('date-range-to').fill('2026-06-30')
await page.getByTestId('date-range-from').fill('2026-06-01')
log('date range set to 2026-06-01 ~ 2026-06-30')

// 6. Wait until panes show objects, then report crew 113 presence
await page.waitForFunction(() => window.__ganttTest?.ready?.() ?? false, undefined, { timeout: 120_000 }).catch(() => {})
const roster = await page.evaluate(() => (window.__ganttTest.roster?.() ?? []))
const found = roster.find((r) => String(r.crewId) === '113')
log('roster rows loaded:', roster.length, '| crew 113 present:', !!found, found ? `(row ${roster.indexOf(found)})` : '')

log('Browser is open. Crew 113 is pinned at the top — inspect its June duties.')
log('Press Ctrl+C here to close the browser when done.')
await page.waitForTimeout(3_600_000)
await browser.close()
