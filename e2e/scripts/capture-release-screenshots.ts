/**
 * Release-tab screenshot capture (for the items the Help set doesn't already cover).
 *
 * Run with:
 *   cd e2e && npx tsx scripts/capture-release-screenshots.ts
 *
 * Prerequisites:
 *   - gantt dev server on 5173, live-server on 3000 (auth + real data)
 *
 * Output (NEW files only — never overwrites Help screenshots):
 *   gantt/public/help/screenshots/pairing-info-dialog.png
 *   gantt/public/help/screenshots/data-tab.png
 *   gantt/public/help/screenshots/regression-view.png
 *
 * 2× DPR to match the Help convention (rendered at naturalWidth/2 by <HelpScreenshot>).
 */
import { chromium, type Page, type Locator } from 'playwright'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const OUT_DIR   = path.join(REPO_ROOT, 'gantt/public/help/screenshots')
const BASE_URL  = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'
const API_URL   = process.env.GANTT_API_URL  ?? 'http://localhost:3000'
const USER      = process.env.GANTT_TEST_USER ?? 'admin'
const PASS      = process.env.GANTT_TEST_PASS ?? '123456'

await fs.mkdir(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx     = await browser.newContext({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 2 })
const page    = await ctx.newPage()

let captured = 0, skipped = 0
const visible = (loc: Locator, timeout = 4_000) => loc.isVisible({ timeout }).catch(() => false)

async function shoot(name: string, target: Locator | Page) {
  const dest = path.join(OUT_DIR, `${name}.png`)
  if ('goto' in target) await (target as Page).screenshot({ path: dest })
  else await (target as Locator).screenshot({ path: dest })
  captured += 1
  console.log(`✓  ${name}.png`)
}
async function tryShoot(name: string, fn: () => Promise<void>) {
  try { await fn() } catch (err) {
    skipped += 1
    console.warn(`✗  ${name} — skipped: ${(err as Error).message.split('\n')[0]}`)
  }
}

async function seedAuth() {
  const res = await page.request.post(`${API_URL}/api/auth/login`, { data: { userCode: USER, password: PASS } })
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`)
  const json = (await res.json()) as { data: { token: string; userCode: string; userName: string; schema: string } }
  const auth = json.data
  if (!auth?.token) throw new Error('login response had no data.token')
  await page.addInitScript((a) => {
    window.sessionStorage.setItem('rois-auth', JSON.stringify({
      user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token,
    }))
  }, auth)
}

// ── Boot ──────────────────────────────────────────────────────────────────────
await seedAuth()
await page.goto(`${BASE_URL}/altair/`)
await page.waitForSelector('[data-testid="nav-release"]', { timeout: 30_000 })
console.log('• authenticated, shell loaded')

// ── Data tab ───────────────────────────────────────────────────────────────────
await tryShoot('data-tab', async () => {
  await page.getByTestId('module-nav-data').click()
  await page.getByTestId('data-view').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(1_200)
  await shoot('data-tab', page.getByTestId('data-view'))
})

// ── Regression view ──────────────────────────────────────────────────────────
await tryShoot('regression-view', async () => {
  await page.getByTestId('nav-regression').click()
  await page.waitForTimeout(1_500)
  await shoot('regression-view', page)
})

// ── Live → load data → Pairing Info dialog (PCK/RPT + Local time zone) ─────────
await tryShoot('pairing-info-dialog', async () => {
  await page.getByTestId('module-nav-live').click()

  // Empty-start flow: inline reminder → Filter dialog → Apply, to load real data.
  const emptyState = page.getByTestId('live-empty-state')
  if (await visible(emptyState, 5_000)) {
    await emptyState.click()
    await page.getByTestId('filter-dialog').waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})
    await page.getByTestId('filter-apply').click()
    await page.getByTestId('filter-dialog').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
    await emptyState.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {})
  }
  // Ensure a Pairing pane exists.
  const addPairing = page.getByTestId('add-pane-pairing')
  if (await visible(addPairing, 2_000)) await addPairing.click()
  const canvas = page.getByTestId('pairing-canvas').first()
  await canvas.waitFor({ timeout: 15_000 })
  await page.waitForTimeout(2_500) // let pairing pucks render

  // Scan rows, double-clicking until the dialog opens (pucks have no stable DOM).
  const dialog = page.getByTestId('pairing-info-dialog')
  const ROW_H = 42, HEADER_H = 30
  let opened = false
  for (let row = 0; row < 8 && !opened; row++) {
    const y = HEADER_H + row * ROW_H + Math.floor(ROW_H / 2)
    for (let x = 8; x <= 360 && !opened; x += 6) {
      await canvas.dblclick({ position: { x, y } }).catch(() => {})
      if (await dialog.count() > 0) opened = true
    }
  }
  if (!opened) throw new Error('could not open Pairing Info dialog by scan')
  await page.getByTestId('pairing-info-content').waitFor({ timeout: 8_000 })
  // Switch to Local time zone so the snapshot showcases per-airport localization.
  if (await visible(page.getByTestId('pairing-info-tz-local'), 2_000)) {
    await page.getByTestId('pairing-info-tz-local').click()
  }
  await page.waitForTimeout(600)
  await shoot('pairing-info-dialog', dialog)
})

await browser.close()
console.log(`\n${captured} screenshots saved to ${OUT_DIR}`)
if (skipped) console.log(`${skipped} skipped.`)
