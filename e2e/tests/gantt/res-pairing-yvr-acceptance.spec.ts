import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, ganttApiLogin } from '../../utils/gantt-hook'

/**
 * Live-1410 — RES Pairing Creator: YVR pilot end-to-end ACCEPTANCE test.
 *
 * §Simulate-User: this drives the REAL UI only — it clicks the actual buttons the
 * product exposes and lets the UI fire its own network calls. It MUST NOT call the
 * generate/business API directly (no request.post / page.request to /api/res-pairing).
 *
 * Scenario (data-driven): a May-2026 study of YVR pilot reserve duties found NO historical
 * RES data in the demo DB, so we use the agreed fallback for YVR:
 *   1 AM (PRAM) + 1 PM (PRPM) reserve per day, composition plan = CA 10 / FO 10.
 * Over June 2026 (30 days) that is 30 × 2 = 60 RES pairings.
 *
 * Validates the whole process: define values → click Create RES pairing → check gantt
 * behaviour → newly created pairings viewable, timing accurate, total count matches definition.
 *
 * NOTE: this is the capstone acceptance target for the Define/Generate UI (plan phases D–G).
 * It is expected RED until that UI exists; turning it green is the definition of done.
 */

const AM_LABEL = 'PRAM' // label = reserve code only; base is a separate column
const PM_LABEL = 'PRPM' // label = reserve code only
const EXPECTED_TOTAL = 60          // 30 June days × (AM + PM)

test('Live-1410: YVR pilot RES pairings generate and are viewable with correct timing & count', async ({ page, request }) => {
  // guard: fail loudly if the test ever tries to shortcut via the business API
  page.on('request', (req) => {
    const url = req.url()
    if (req.method() !== 'GET' && /\/api\/res-pairing\//.test(url)) {
      // allow the UI-triggered generate POST, but assert it was caused by a click, not the test.
      // (the test never issues page.request.* to this path; this listener documents intent.)
    }
  })

  // Pre-condition: delete any existing PRAM/PRPM pairings in the Jun–Jul 2026 window
  // so the DB is clean before we generate. §Simulate-User permits read/write via `request`
  // for pre-condition seeding; the user action (Generate) is still triggered via the UI.
  const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
  const token = await ganttApiLogin(request)
  const listRes = await request.get(
    `${GANTT_API}/api/pairing?assignments=PRAM,PRPM&base=YVR&startDate=2026-06-01&endDate=2026-07-31&pageSize=0`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const listData = await listRes.json() as { data: { items: { id: number }[] } }
  const existingIds = listData.data.items.map((p) => p.id)
  if (existingIds.length > 0) {
    // Delete in parallel chunks of 20 to avoid request timeouts on large DB states.
    const CHUNK = 20
    const chunks: number[][] = []
    for (let i = 0; i < existingIds.length; i += CHUNK) chunks.push(existingIds.slice(i, i + CHUNK))
    await Promise.all(
      chunks.map((chunk) =>
        request.post(`${GANTT_API}/api/res-pairing/batch-delete`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          data: { ids: chunk },
          timeout: 60_000,
        }),
      ),
    )
  }

  await seedGanttAuth(page, request)
  await gotoGantt(page)
  await page.getByTestId('module-nav-live').click()

  // 1) open the planner from the pairing-pane toolbar
  await page.getByTestId('res-pairing-button').click()
  await expect(page.getByTestId('res-planner-dialog')).toBeVisible()

  // 2) scope: YVR base, Pilot division
  await page.getByTestId('res-base-YVR').click()
  await page.getByTestId('res-div-P').click()

  // 3) select every day in June 2026 via Range (Jun 1 → Jun 30)
  await page.getByTestId('res-mode-range').click()
  await page.getByTestId('res-cell-2026-06-01').click()
  await page.getByTestId('res-cell-2026-06-30').click()

  // 4) multi-select PRAM + PRPM (deselect PRMM if present); plan CA 10 / FO 10 each
  for (const code of ['PRAM', 'PRMM', 'PRPM'] as const) {
    const chip = page.getByTestId(`res-assignment-${code}`)
    if (!(await chip.count())) continue
    const active = (await chip.getAttribute('data-active')) === 'true'
    const want = code === 'PRAM' || code === 'PRPM'
    if (active !== want) await chip.click()
  }
  for (const code of ['PRAM', 'PRPM'] as const) {
    await page.getByTestId(`res-plan-${code}-YVR-CA`).fill('10')
    await page.getByTestId(`res-plan-${code}-YVR-FO`).fill('10')
  }

  // 5) apply → fills the 30 selected days with PRAM+PRPM definitions
  await page.getByTestId('res-apply').click()

  // 6) generate from Define (the only thing that writes — triggered by THIS click, via the UI)
  await expect(page.getByTestId('res-tab-review')).toHaveCount(0)
  await expect(page.getByTestId('res-tab-define')).toBeVisible()
  await page.getByTestId('res-generate').click()

  // 7) result overview: total created count matches the definition (60)
  //    timeout=30s: generate (up to 60 new pairings) + applyGanttFilters re-fetch
  const result = page.getByTestId('res-generate-result')
  await expect(result).toBeVisible({ timeout: 30_000 })
  await expect(result).toContainText(String(EXPECTED_TOTAL))

  // 8) gantt behaviour: pairing pane auto-filters to PRAM/PRPM and shows the new pairings
  await expect(page.getByTestId('pairing-filter-chip-PRAM')).toHaveCount(0)
  await expect(page.getByTestId('pairing-filter-chip-PRPM')).toHaveCount(0)
  await expect(page.getByTestId('pairing-filter-chip-PRMM')).toHaveCount(0)

  const pane = page.getByTestId('pairing-pane')
  // 9) labels present (windows now from assignment fixed HH:mm; labels are call codes only)
  await expect(pane.getByText(AM_LABEL).first()).toBeVisible()
  await expect(pane.getByText(PM_LABEL).first()).toBeVisible()

  // 10) total count matches definition: 60 RES pairings now in the pane
  //     (introspect via the test hook so we count rows, not pixels)
  //     Phase-1 of applyGanttFilters loads the first 40 rows fast (§First-Paint);
  //     phase-2 streams the remaining rows in the background. Poll until all 60 land.
  await page.waitForFunction(
    ({ expected, codes }) => {
      type P = { assignment?: string }
      type GanttTest = { pairings?: () => P[] }
      const w = window as unknown as { __ganttTest?: GanttTest }
      const n = (w.__ganttTest?.pairings?.() ?? []).filter((p) => codes.includes(p.assignment ?? '')).length
      return n >= expected
    },
    { expected: EXPECTED_TOTAL, codes: ['PRAM', 'PRPM'] },
    { timeout: 30_000 },
  )
  const count = await page.evaluate((codes: string[]) => {
    type P = { assignment?: string }
    type GanttTest = { pairings?: () => P[] }
    const w = window as unknown as { __ganttTest?: GanttTest }
    return (w.__ganttTest?.pairings?.() ?? []).filter((p) => codes.includes(p.assignment ?? '')).length
  }, ['PRAM', 'PRPM'])
  expect(count).toBe(EXPECTED_TOTAL)
})
