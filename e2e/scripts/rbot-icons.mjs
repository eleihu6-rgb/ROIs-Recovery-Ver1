/**
 * Render crew 113's note icons by driving the filter THROUGH R'Bot (no dropdowns).
 * Assumes the 27 PA-removal memos already exist (from rbot-chat-demo).
 */
import { chromium } from 'playwright'
const DIR = '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/e2e/scripts'
const GANTT = 'http://localhost:5173', API = 'http://localhost:3000'
const log = (...a) => console.log('[rbot-icons]', ...a)
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1680, height: 900 } })
const page = await ctx.newPage()
const auth = (await (await ctx.request.post(`${API}/api/auth/login`, { data: { userCode: 'admin', password: '123456' } })).json()).data
await page.addInitScript((a) => window.sessionStorage.setItem('rois-auth', JSON.stringify({
  user: { userCode: a.userCode, userName: a.userName, schema: a.schema, isAdmin: a.isAdmin ?? 0 }, token: a.token })), auth)
await page.goto(`${GANTT}/altair/`)
await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
await page.getByTestId('module-nav-live').click()
// dismiss empty-state by applying an empty filter (bootstraps), then narrow via R'Bot
const empty = page.getByTestId('live-empty-state')
try {
  await empty.waitFor({ state: 'visible', timeout: 5_000 })
  await empty.click()
  await page.getByTestId('filter-dialog').waitFor({ state: 'visible' })
  const idIn = page.getByPlaceholder('e.g. 12345, 67890')
  await idIn.fill('113'); await idIn.press('Enter')
  await page.getByTestId('filter-apply').click()
  await page.getByTestId('filter-dialog').waitFor({ state: 'hidden' })
} catch { /* already loaded */ }
// Use R'Bot to scope to YVR CA/FO (sets the crew filter without the dropdown).
await page.getByTestId('ai-chat-toggle').click()
await page.getByTestId('ai-chat-panel').waitFor({ state: 'visible' })
await page.getByTestId('ai-chat-input').fill('filter crew to base YVR, ranks CA and FO, and set the date range to 2026-06-01 to 2026-06-30')
await page.getByTestId('ai-chat-send').click()
log('asked R\'Bot to filter YVR CA/FO + June; loading roster…')
await empty.waitFor({ state: 'hidden', timeout: 270_000 }).catch(() => {})
try {
  await page.waitForFunction(() => (window.__ganttTest.roster?.() ?? []).filter((r) => String(r.crewId) === '113').length > 0,
    undefined, { timeout: 200_000 })
} catch { log('crew 113 roster slow to load') }
await page.waitForTimeout(3000)
const badges = await page.evaluate(() => {
  const ids = new Set((window.__ganttTest.roster?.() ?? []).filter((r) => String(r.crewId) === '113').map((r) => r.id))
  return window.__ganttTest.memoBadges().filter((id) => ids.has(id)).length
})
log(`crew 113 duties marked with note icons: ${badges}`)
await page.screenshot({ path: `${DIR}/rbot-icons-full.png` })
await page.screenshot({ path: `${DIR}/rbot-icons-crew113.png`, clip: { x: 300, y: 138, width: 1240, height: 70 } })
log('screenshots written')
await browser.close()
