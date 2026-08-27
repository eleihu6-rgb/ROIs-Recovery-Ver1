/**
 * R'Bot PA-removal demo — records the whole flow to video + before/after stills.
 *
 *   1. clears crew 113's memos (so icons appear fresh)
 *   2. opens the live gantt, filters to YVR CA/FO, pins crew 113, June 2026
 *   3. screenshot BEFORE — duties, no icons
 *   4. opens R'Bot, types "remove pre-assignment (PA) for solver…", sends
 *   5. R'Bot marks each to-be-de-assigned duty with a yellow note icon
 *   6. screenshot AFTER — icons on the duties + video saved
 *
 *   node e2e/scripts/rbot-demo.mjs
 *
 * Headless + video: the gantt's reference dropdowns don't populate in headed
 * Chromium in this environment, so we record the run instead of showing a window.
 */
import { chromium } from 'playwright'

const DIR = '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/e2e/scripts'
const GANTT = 'http://localhost:5173'
const API = 'http://localhost:3000'
const FROM = '2026-06-01T00:00:00Z'
const TO = '2026-07-01T00:00:00Z'
const log = (...a) => console.log('[rbot-demo]', ...a)

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  viewport: { width: 1680, height: 900 },
  recordVideo: { dir: `${DIR}/video`, size: { width: 1680, height: 900 } },
})
const page = await ctx.newPage()

const auth = (await (await ctx.request.post(`${API}/api/auth/login`, { data: { userCode: 'admin', password: '123456' } })).json()).data
const bearer = { headers: { Authorization: `Bearer ${auth.token}` } }

// 1. Clear crew 113 memos.
const existing = (await (await ctx.request.get(`${API}/api/crew-memo?crewIds=113&from=${FROM}&to=${TO}`, bearer)).json()).data
for (const m of existing) await ctx.request.delete(`${API}/api/crew-memo/${m.id}`, bearer)
log(`cleared ${existing.length} existing crew-113 memos`)

await page.addInitScript((a) => window.sessionStorage.setItem('rois-auth', JSON.stringify({
  user: { userCode: a.userCode, userName: a.userName, schema: a.schema, isAdmin: a.isAdmin ?? 0 }, token: a.token,
})), auth)

await page.goto(`${GANTT}/altair/`)
await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
await page.getByTestId('module-nav-live').click()
const empty = page.getByTestId('live-empty-state')
let atEmpty = true
try { await empty.waitFor({ state: 'visible', timeout: 5_000 }) } catch { atEmpty = false }
const pick = async (prefix, vals) => {
  await page.getByTestId(`${prefix}-trigger`).click()
  for (const v of vals) { const o = page.getByTestId(`${prefix}-opt-${v}`); await o.waitFor({ state: 'visible', timeout: 30_000 }); await o.click() }
  await page.getByTestId('filter-tab-crew').click()
}
if (atEmpty) await empty.click(); else await page.getByTestId('filter-btn').click()
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
log('filtered to YVR CA/FO, crew 113 pinned, June 2026')

await page.waitForFunction(() => (window.__ganttTest.roster?.() ?? []).filter((r) => String(r.crewId) === '113').length > 0,
  undefined, { timeout: 300_000 })
await page.waitForTimeout(2500)
const crop = { x: 300, y: 138, width: 1240, height: 66 }
await page.screenshot({ path: `${DIR}/rbot-1-before.png`, clip: crop })
log("BEFORE: crew 113 duties on screen, no memo icons")

// Open R'Bot and ask for PA removal.
await page.getByTestId('ai-chat-toggle').click()
await page.getByTestId('ai-chat-panel').waitFor({ state: 'visible' })
const phrase = 'remove pre-assignment (PA) for solver for crew 113, June 2026 (2026-06-01 to 2026-06-30)'
await page.getByTestId('ai-chat-input').click()
await page.getByTestId('ai-chat-input').type(phrase, { delay: 20 })
await page.waitForTimeout(600)
await page.screenshot({ path: `${DIR}/rbot-2-chat.png` })
log("typed the request to R'Bot — sending…")
await page.getByTestId('ai-chat-send').click()

const badges113 = () => page.evaluate(() => {
  const ids = new Set((window.__ganttTest.roster?.() ?? []).filter((r) => String(r.crewId) === '113').map((r) => r.id))
  return window.__ganttTest.memoBadges().filter((id) => ids.has(id)).length
})
let n = 0
for (let i = 0; i < 45; i++) { n = await badges113(); if (n > 0) break; await page.waitForTimeout(2000) }
await page.waitForTimeout(2000)
await page.screenshot({ path: `${DIR}/rbot-3-after.png`, clip: crop })
await page.screenshot({ path: `${DIR}/rbot-3-after-full.png` })
log(`AFTER: R'Bot marked ${n} of crew 113's duties with note icons ✔`)

await ctx.close() // flush video
const vid = await page.video()?.path().catch(() => null)
log('video:', vid ?? `${DIR}/video/*.webm`)
await browser.close()
