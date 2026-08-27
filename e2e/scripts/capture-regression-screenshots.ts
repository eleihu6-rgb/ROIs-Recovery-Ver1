/**
 * Regression-tab screenshot capture (for the Flair PBS AI Features design doc).
 *
 * Run with:
 *   cd e2e && GANTT_BASE_URL=http://localhost:5373 npx tsx scripts/capture-regression-screenshots.ts
 *
 * Prerequisites:
 *   - gantt dev server running (default 5373)
 *   - live-server on :3000 (auth) and ai-server on :3005 (regression catalog), both proxied by vite
 *
 * Output: docs/assets/screenshots/regression/*.png  (viewport 1440×900, DPR 2)
 */
import { chromium, type Page } from 'playwright'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const OUT_DIR   = path.join(REPO_ROOT, 'docs/assets/screenshots/regression')
const BASE_URL  = process.env.GANTT_BASE_URL ?? 'http://localhost:5373'
const API_URL   = process.env.GANTT_API_URL  ?? 'http://localhost:3000'
const USER      = process.env.GANTT_TEST_USER ?? 'admin'
const PASS      = process.env.GANTT_TEST_PASS ?? '123456'

await fs.mkdir(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx     = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page    = await ctx.newPage()

// ── Auth: try a real login; fall back to a dummy token (ai-server needs no auth) ──
async function seedAuth() {
  let auth = { token: 'dev-doc-capture', userCode: USER, userName: 'Admin', schema: 'f8' }
  try {
    const res = await page.request.post(`${API_URL}/api/auth/login`, { data: { userCode: USER, password: PASS } })
    if (res.ok()) {
      const j = (await res.json()) as { data?: typeof auth }
      if (j?.data?.token) auth = j.data
    }
  } catch { /* fall back to dummy */ }
  await page.addInitScript((a) => {
    window.sessionStorage.setItem('rois-auth', JSON.stringify({
      user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token,
    }))
    // Land directly on the Regression tab.
    window.localStorage.setItem('rois-shell-module', 'regression')
    window.localStorage.setItem('rois-shell-open-tabs', JSON.stringify(['dashboard', 'regression']))
  }, auth)
}

async function shoot(name: string, full = false) {
  const p = path.join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: p, fullPage: full })
  console.log('captured', name)
}

await seedAuth()
await page.goto(`${BASE_URL}/altair/`, { waitUntil: 'networkidle' })

// Wait for the regression catalog to render (rows come from ai-server :3005).
await page.waitForSelector('[data-testid="regression-list"], [data-testid="import-specs"]', { timeout: 30_000 })
await page.waitForTimeout(1500)

// 1) Catalog overview — toolbar + populated test list with badges.
await shoot('reg-overview')

// 2) "How it works" info popover — the AI flow + Condition A/B decision tree.
const infoBtn = page.locator('[data-testid="regression-info"]')
if (await infoBtn.count()) {
  await infoBtn.first().click()
  const pop = page.locator('[data-testid="regression-info-popover"]')
  await pop.waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForTimeout(400)
  await pop.screenshot({ path: path.join(OUT_DIR, 'reg-howitworks.png') })
  console.log('captured reg-howitworks')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

// 3) Expand the first test row to reveal version history / conditions / generate area.
const firstRowToggle = page.locator('[data-testid="row-expand"]').first()
try {
  if (await firstRowToggle.count()) {
    await firstRowToggle.click()
    await page.waitForTimeout(1200)
    await shoot('reg-row-expanded')
  }
} catch (e) { console.log('row expand skipped:', String(e).slice(0, 120)) }

await browser.close()
console.log('done ->', OUT_DIR)
