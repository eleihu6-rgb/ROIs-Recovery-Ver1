/**
 * Flight Detail dialog — Fleet/Register edit + Cancel/Restore + delay ghost bar screenshot capture.
 * Demo/progress proof for Ryan's "add fleet and cancel in the same flight info edit ui,
 * all in one to manage flight" request.
 *
 * Run with:
 *   cd e2e && npx tsx scripts/capture-flight-edit-screenshots.ts
 *
 * Prerequisites:
 *   - gantt dev server running (default :5173)
 *   - live-server running on :3000 (auth + real data)
 *
 * Output: docs/assets/screenshots/flight-edit/*.png (viewport 1440×900, DPR 2)
 *
 * Cancel/Restore is exercised against a real shared f8_sit_live row — the script always
 * clicks Restore before exiting (try/finally), mirroring e2e/tests/gantt/flight-detail-fleet-cancel.spec.ts.
 */
import { chromium, type Page, type Locator } from 'playwright'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const OUT_DIR = path.join(REPO_ROOT, 'docs/assets/screenshots/flight-edit')
const BASE_URL = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'
const API_URL = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const USER = process.env.GANTT_TEST_USER ?? 'admin'
const PASS = process.env.GANTT_TEST_PASS ?? '123456'

// Same delayed-flight fixture as e2e/tests/gantt/flight-delay-ghost-bar.spec.ts
// (142-flight-schedule-seed-generator's delay-flights.mjs).
const GHOST_TARGET = { id: 145505, fltNum: 'EK001', delayMin: 120 }
const PX_PER_HOUR = 60

await fs.mkdir(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

let captured = 0
let skipped = 0

async function shoot(name: string, target: Locator | Page) {
  const dest = path.join(OUT_DIR, `${name}.png`)
  if ('screenshot' in target && 'goto' in target) {
    await (target as Page).screenshot({ path: dest })
  } else {
    await (target as Locator).screenshot({ path: dest })
  }
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

const visible = (loc: Locator, timeout = 4_000) => loc.isVisible({ timeout }).catch(() => false)

// ── Auth: real login, mirrors utils/gantt-hook.ts:seedGanttAuth ──────────────
async function seedAuth() {
  const res = await page.request.post(`${API_URL}/api/auth/login`, { data: { userCode: USER, password: PASS } })
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`)
  const json = (await res.json()) as { data: { token: string; userCode: string; userName: string; schema: string; isAdmin?: number } }
  const auth = json.data
  if (!auth?.token) throw new Error('login response had no data.token — check API shape')
  await page.addInitScript((a) => {
    window.sessionStorage.setItem(
      'rois-auth',
      JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema, isAdmin: a.isAdmin ?? 0 }, token: a.token }),
    )
  }, auth)
}

await seedAuth()
await page.goto(`${BASE_URL}/altair/`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => typeof (window as unknown as { __ganttTest?: unknown }).__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
console.log('• authenticated, shell loaded')

// ── Open Live view (empty-start flow: reminder card → Filter dialog → Apply) ─
await page.getByTestId('module-nav-live').click()
const emptyState = page.getByTestId('live-empty-state')
if (await visible(emptyState, 5_000)) {
  await emptyState.click()
  await page.getByTestId('filter-dialog').waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})
  await page.getByTestId('filter-apply').click()
  await page.getByTestId('filter-dialog').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
  await emptyState.waitFor({ state: 'hidden', timeout: 270_000 }).catch(() => {})
} else {
  await page.getByTestId('refresh-btn').waitFor({ state: 'visible', timeout: 5_000 })
}
console.log('• Live view loaded')

// ── Add Flight pane ────────────────────────────────────────────────────────
const addFlightBtn = page.getByTestId('add-pane-flight')
await addFlightBtn.waitFor({ state: 'visible', timeout: 30_000 })
await addFlightBtn.click({ timeout: 30_000 })
await page.waitForTimeout(1_500)
console.log('• Flight pane added')

// 0) Delay ghost bar — capture FIRST, on a clean Flight pane (no dialogs open yet).
// Canvas-rendered, so reproduce the focus/zoom/settle sequence from
// e2e/tests/gantt/flight-delay-ghost-bar.spec.ts to actually paint the amber ghost tail.
await tryShoot('flight-ghost-bar', async () => {
  await page.evaluate(
    (f) => (window as unknown as { __ganttTest: { applyFlightFilter: (x: typeof f) => Promise<void> } }).__ganttTest.applyFlightFilter(f),
    { fltNums: [GHOST_TARGET.fltNum] },
  )
  await page.waitForTimeout(800)
  await page.evaluate(
    (px) => (window as unknown as { __ganttTest: { setZoom: (n: number) => void } }).__ganttTest.setZoom(px),
    PX_PER_HOUR,
  )
  const focus = await page.evaluate(
    (id) =>
      (window as unknown as { __ganttTest: { focusFlight: (n: number) => { x: number; y: number } | null } }).__ganttTest.focusFlight(id),
    GHOST_TARGET.id,
  )
  if (!focus) throw new Error(`focusFlight(${GHOST_TARGET.id}) returned null — target not in loaded/filtered rows`)
  // Settle two RAF ticks so the canvas repaints at the new scroll position before capture.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))

  // Compute the puck's full extent + the delay-minutes ghost tail past it (same math as
  // flight-delay-ghost-bar.spec.ts) so the clip covers solid puck AND the dashed ghost tail,
  // not just the puck's left edge.
  const row = await page.evaluate(
    (id) => {
      const rows = (window as unknown as { __ganttTest: { flights: () => Array<{ id: number; start: string | null; end: string | null }> } }).__ganttTest.flights()
      return rows.find((r) => r.id === id) ?? null
    },
    GHOST_TARGET.id,
  )
  if (!row?.start || !row.end) throw new Error(`flightObjects() has no start/end for id ${GHOST_TARGET.id}`)
  const durationHours = (new Date(row.end).getTime() - new Date(row.start).getTime()) / 3_600_000
  const schedDepXLocal = focus.x - 6 // focusFlight lands 6px into the puck from its schDep x.
  const ghostEndXLocal = schedDepXLocal + (GHOST_TARGET.delayMin / 60 + durationHours) * PX_PER_HOUR

  const canvas = page.locator('canvas[data-testid="flight-canvas"]')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('flight-canvas has no bounding box')
  const clip = {
    x: Math.max(0, box.x + schedDepXLocal - 20),
    y: Math.max(0, box.y + focus.y - 35),
    width: Math.min(ghostEndXLocal - schedDepXLocal + 50, box.width - (schedDepXLocal - 20)),
    height: 85,
  }
  await page.screenshot({ path: path.join(OUT_DIR, 'flight-ghost-bar.png'), clip })
  captured += 1
  console.log('✓  flight-ghost-bar.png')
})

// Clear the flight-number filter before opening Flight Navi, so its "first row" pick
// below isn't accidentally scoped to just EK001.
await tryShoot('clear-ghost-filter', async () => {
  await page.evaluate(
    () => (window as unknown as { __ganttTest: { applyFlightFilter: (x: { fltNums?: string[] }) => Promise<void> } }).__ganttTest.applyFlightFilter({}),
  )
  await page.waitForTimeout(500)
})

// ── Open Flight Detail via Flight Navi → first COF row ────────────────────
await page.getByTestId('flight-navi-button').click()
await page.getByTestId('flight-navi-dialog').waitFor({ state: 'visible', timeout: 10_000 })
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid^="navi-cof-"]').length > 0,
  undefined,
  { timeout: 20_000 },
)
await page.locator('[data-testid^="navi-cof-"]').first().click()
const dialog = page.getByTestId('flight-detail-dialog')
await dialog.waitFor({ state: 'visible', timeout: 10_000 })
console.log('• Flight Detail dialog open')

// 1) View mode — Fleet/Register text + Cancel Flight button.
await tryShoot('flight-detail-view', async () => {
  await page.waitForTimeout(500)
  await shoot('flight-detail-view', dialog)
})

// 2) Edit mode — STD/ATD/STA/ATA pickers AND Fleet/Register inputs together ("all in one").
const editBtn = dialog.getByTestId('flight-detail-edit')
const fleetInput = dialog.getByTestId('flight-detail-fleet-input')
let editOpened = false
await tryShoot('flight-detail-edit', async () => {
  await editBtn.click()
  await fleetInput.waitFor({ state: 'visible', timeout: 5_000 })
  editOpened = true
  await page.waitForTimeout(300)
  await shoot('flight-detail-edit', dialog)
})
// Back out of edit mode without saving before touching Cancel/Restore below.
if (editOpened) {
  const cancelEditBtn = dialog.getByTestId('flight-detail-edit-cancel')
  if (await visible(cancelEditBtn, 2_000)) await cancelEditBtn.click()
}

// 3) & 4) Cancel-confirm state + Cancelled state — always restored in `finally`.
const cancelFlightBtn = dialog.getByTestId('flight-detail-cancel-flight')
let cancelArmed = false
let cancelled = false
try {
  if (await visible(cancelFlightBtn, 5_000)) {
    await tryShoot('flight-detail-cancel-confirm', async () => {
      await cancelFlightBtn.click()
      cancelArmed = true
      await page.getByText('Confirm Cancel?').waitFor({ state: 'visible', timeout: 5_000 })
      await shoot('flight-detail-cancel-confirm', dialog)
    })

    if (cancelArmed) {
      await tryShoot('flight-detail-cancelled', async () => {
        await cancelFlightBtn.click()
        cancelled = true
        await dialog.getByTestId('flight-detail-restore').waitFor({ state: 'visible', timeout: 15_000 })
        await page.waitForTimeout(300)
        await shoot('flight-detail-cancelled', dialog)
      })
    }
  } else {
    console.warn('✗  cancel flow skipped — Cancel Flight button not visible (already cancelled, or scenario-locked)')
  }
} finally {
  if (cancelled) {
    const restoreBtn = dialog.getByTestId('flight-detail-restore')
    if (await visible(restoreBtn, 5_000)) {
      await restoreBtn.click()
      await dialog.getByTestId('flight-detail-cancel-flight').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
      console.log('• restored flight to original (non-cancelled) state')
    } else {
      console.warn('!! flight-detail-restore not found after cancel — flight may still be cancelled in f8_sit_live, please check manually')
    }
  }
}

await page.keyboard.press('Escape').catch(() => {})
await page.waitForTimeout(300)

await browser.close()
console.log(`\ndone -> ${OUT_DIR}  (${captured} captured, ${skipped} skipped)`)
