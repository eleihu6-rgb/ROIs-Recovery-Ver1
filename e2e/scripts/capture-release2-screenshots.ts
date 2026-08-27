/**
 * Release 2 screenshot capture.
 *
 * Run with:
 *   cd e2e && npx tsx scripts/capture-release2-screenshots.ts
 *
 * Prerequisites:
 *   - gantt dev server on :5173, live-server on :3000 (auth + data), ai-server
 *     on :3005 for the Regression tab.
 *
 * Output: gantt/public/release/screenshots/*.png  (separate from /help so the
 * Rel 1 / Help captures are never overwritten). 2× density to match the Help
 * convention so <HelpScreenshot> renders at naturalWidth/2 and stays sharp.
 *
 * Each shot depicts a genuine Rel 2 change (per quality rule: a screenshot must
 * frame the feature its caption describes). Captures are best-effort — a missing
 * surface is skipped, never aborts the run.
 */
import { chromium, type Page, type Locator } from 'playwright'
import { gotoScenarioList } from '../pages/gantt/scenario-nav'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const OUT_DIR   = path.join(REPO_ROOT, 'gantt/public/release/screenshots')
const BASE_URL  = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'
const API_URL   = process.env.GANTT_API_URL  ?? 'http://localhost:3000'
const USER      = process.env.GANTT_TEST_USER ?? 'admin'
const PASS      = process.env.GANTT_TEST_PASS ?? '123456'

await fs.mkdir(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx     = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
const page    = await ctx.newPage()

let captured = 0
let skipped = 0

async function seedAuth() {
  const res = await page.request.post(`${API_URL}/api/auth/login`, {
    data: { userCode: USER, password: PASS },
  })
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`)
  const json = (await res.json()) as {
    data: { token: string; userCode: string; userName: string; schema: string }
  }
  const auth = json.data
  if (!auth?.token) throw new Error('login response had no data.token — check API shape')
  await page.addInitScript((a) => {
    window.sessionStorage.setItem(
      'rois-auth',
      JSON.stringify({
        user: { userCode: a.userCode, userName: a.userName, schema: a.schema },
        token: a.token,
      }),
    )
  }, auth)
}

async function shoot(name: string, target: Locator | Page) {
  const dest = path.join(OUT_DIR, `${name}.png`)
  if ('goto' in target) await (target as Page).screenshot({ path: dest })
  else await (target as Locator).screenshot({ path: dest })
  captured += 1
  console.log(`✓  ${name}.png`)
}

async function tryShoot(name: string, fn: () => Promise<void>) {
  try {
    await fn()
  } catch (err) {
    skipped += 1
    console.warn(`✗  ${name} — skipped: ${(err as Error).message.split('\n')[0]}`)
  }
}

const visible = (loc: Locator, timeout = 4_000) =>
  loc.isVisible({ timeout }).catch(() => false)

// ── Navigate to the app (authenticated) ───────────────────────────────────────
await seedAuth()
await page.goto(`${BASE_URL}/altair/`)
await page.waitForSelector('[data-testid="nav-help"]', { timeout: 30_000 })
console.log('• authenticated, shell loaded')

// ── Load Live data once (empty-state → Filter → Apply), reused by Alert Center ─
await page.getByTestId('module-nav-live').click()
const emptyState = page.getByTestId('live-empty-state')
if (await visible(emptyState, 5_000)) {
  await emptyState.click()
  await page.getByTestId('filter-dialog').waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})
  await page.getByTestId('filter-apply').click()
  await page.getByTestId('filter-dialog').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
  await emptyState.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {})
}
await page.waitForTimeout(2_000)

// ── Live: Alert Center (violation bell → dialog) ──────────────────────────────
// Needs violations loaded for the toolbar's active rule group (June has 8002s).
await tryShoot('rel2-alert-center', async () => {
  const bell = page.getByTestId('violations-button').first()
  await bell.waitFor({ timeout: 10_000 })
  await bell.click()
  const dialog = page.getByTestId('violation-list-dialog')
  await dialog.waitFor({ timeout: 8_000 })
  // Wait for either populated rows or the explicit empty state, then settle.
  await page.locator('[data-testid="violation-list-row"]').first().waitFor({ timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(800)
  await shoot('rel2-alert-center', dialog)
  await page.keyboard.press('Escape').catch(() => {})
})

// ── Rule / Legality: ruleset list + a selected ruleset's rules ────────────────
await tryShoot('rel2-legality', async () => {
  await page.getByTestId('module-nav-legality').click()
  const view = page.getByTestId('legality-rule-sets-view')
  await view.waitFor({ timeout: 10_000 })
  // Click the first ruleset card so the right panel shows its rules.
  const card = page.locator('[data-testid^="legality-ruleset-card-"]').first()
  await card.waitFor({ timeout: 10_000 })
  await card.click()
  await page.locator('[data-testid^="legality-rule-row-"]').first().waitFor({ timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(700)
  await shoot('rel2-legality', view)
})

// ── Data: Assignment editable grid ────────────────────────────────────────────
await tryShoot('rel2-data-assignment', async () => {
  await page.getByTestId('module-nav-data').click()
  await page.getByTestId('data-tree-item-basic.assignment').click({ timeout: 10_000 })
  const grid = page.getByTestId('data-grid-assignment')
  await grid.waitFor({ timeout: 12_000 })
  await page.locator('[data-testid^="data-edit-row-"]').first().waitFor({ timeout: 12_000 }).catch(() => {})
  await page.waitForTimeout(700)
  // The section container is much taller than its rows (empty tail) — clip the
  // header + first rows so the crop is a legible grid, not mostly white space.
  const section = page.getByTestId('data-section-assignment')
  const bb = (await section.boundingBox())!
  await page.screenshot({
    path: path.join(OUT_DIR, 'rel2-data-assignment.png'),
    clip: { x: Math.max(0, bb.x), y: Math.max(0, bb.y), width: bb.width, height: Math.min(bb.height, 470) },
  })
  captured += 1
  console.log('✓  rel2-data-assignment.png')
})

// ── Regression: category tree + rows with naming ids (Live-1001 etc.) ─────────
await tryShoot('rel2-regression-tree', async () => {
  await page.getByTestId('nav-regression').click()
  await page.getByTestId('regression-tree').waitFor({ timeout: 12_000 })
  // Wait for rows so the naming-id column is visible in the crop.
  await page.locator('[data-testid="regression-row"]').first().waitFor({ timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(800)
  // Full view shows the sidebar tree (left) beside the list with row-code ids (right).
  await shoot('rel2-regression-tree', page)
})

// ── Scenario: bottom Status Bar — open a scenario's gantt first ───────────────
// Best-effort: a gantt only opens for a scenario with results, and the canvas
// must mount; if none opens headless, this is skipped (no Scenario gallery).
await tryShoot('rel2-scenario-status-bar', async () => {
  await gotoScenarioList(page)
  const items = page.getByTestId('scenario-list-item')
  await items.first().waitFor({ timeout: 10_000 })
  const n = await items.count()
  let opened = false
  for (let i = 0; i < n && !opened; i++) {
    await items.nth(i).click()
    await page.waitForTimeout(500)
    const openBtn = page.getByTestId('scenario-open-btn')
    if ((await visible(openBtn, 2_500)) && (await openBtn.isEnabled().catch(() => false))) {
      await openBtn.click()
      opened = await page.getByTestId('scenario-gantt-view').isVisible({ timeout: 15_000 }).catch(() => false)
    }
  }
  if (!opened) throw new Error('no scenario opened a gantt view')
  const bar = page.getByTestId('scenario-status-bar')
  await bar.waitFor({ timeout: 15_000 })
  await page.waitForTimeout(2_000) // let per-scenario violations resolve into the count
  await shoot('rel2-scenario-status-bar', bar)
})

await browser.close()
console.log(`\n${captured} screenshots saved to ${OUT_DIR}`)
if (skipped) console.log(`${skipped} captures skipped (see ✗ lines above).`)
