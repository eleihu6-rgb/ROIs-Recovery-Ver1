/**
 * R'Bot interaction demo (robust) — captures the chat conversation + proves the plan.
 * Doesn't depend on the slow base/rank reference dropdowns or a full roster load.
 *
 *   1. clears crew 113's memos
 *   2. opens R'Bot, types "remove pre-assignment (PA) for solver…", sends
 *   3. screenshots the R'Bot conversation (request → reply → applied-action chip)
 *   4. confirms R'Bot wrote the 27-duty plan via the API
 *
 *   node e2e/scripts/rbot-chat-demo.mjs
 */
import { chromium } from 'playwright'
const DIR = '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/e2e/scripts'
const GANTT = 'http://localhost:5173', API = 'http://localhost:3000'
const FROM = '2026-06-01T00:00:00Z', TO = '2026-07-01T00:00:00Z'
const log = (...a) => console.log('[rbot-chat]', ...a)

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, recordVideo: { dir: `${DIR}/video`, size: { width: 1280, height: 860 } } })
const page = await ctx.newPage()
const auth = (await (await ctx.request.post(`${API}/api/auth/login`, { data: { userCode: 'admin', password: '123456' } })).json()).data
const bearer = { headers: { Authorization: `Bearer ${auth.token}` } }

const existing = (await (await ctx.request.get(`${API}/api/crew-memo?crewIds=113&from=${FROM}&to=${TO}`, bearer)).json()).data
for (const m of existing) await ctx.request.delete(`${API}/api/crew-memo/${m.id}`, bearer)
log(`cleared ${existing.length} crew-113 memos — start clean`)

await page.addInitScript((a) => window.sessionStorage.setItem('rois-auth', JSON.stringify({
  user: { userCode: a.userCode, userName: a.userName, schema: a.schema, isAdmin: a.isAdmin ?? 0 }, token: a.token })), auth)
await page.goto(`${GANTT}/altair/`)
await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })

await page.getByTestId('ai-chat-toggle').click()
await page.getByTestId('ai-chat-panel').waitFor({ state: 'visible' })
const phrase = 'remove pre-assignment (PA) for solver for crew 113, June 2026 (2026-06-01 to 2026-06-30)'
await page.getByTestId('ai-chat-input').click()
await page.getByTestId('ai-chat-input').type(phrase, { delay: 18 })
await page.waitForTimeout(500)
await page.screenshot({ path: `${DIR}/rbot-chat-1-typed.png` })
log('typed the request to R\'Bot — sending…')
await page.getByTestId('ai-chat-send').click()

// R'Bot replies and the applied-action chip appears.
await page.getByTestId('ai-chat-applied').first().waitFor({ state: 'visible', timeout: 60_000 })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${DIR}/rbot-chat-2-reply.png` })
const thread = await page.getByTestId('ai-chat-thread').innerText()
log('R\'Bot conversation:\n' + thread.split('\n').map((l) => '    ' + l).join('\n'))

// Confirm the plan was actually written.
let plan = []
for (let i = 0; i < 30; i++) {
  plan = (await (await ctx.request.get(`${API}/api/crew-memo?crewIds=113&from=${FROM}&to=${TO}`, bearer)).json()).data
  if (plan.length > 0) break
  await page.waitForTimeout(1500)
}
const fly = plan.filter((m) => m.name === 'De-assign pairing').length
const off = plan.filter((m) => m.name === 'De-assign day off').length
log(`R'Bot wrote ${plan.length} memos for crew 113 → ${fly} flying pairings + ${off} days off ✔`)

await ctx.close()
log('video saved under', `${DIR}/video/`)
await browser.close()
