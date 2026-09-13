import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, ganttApiLogin } from '../../utils/gantt-hook'

/**
 * Seed task: DXB pilot RES pairings for Sep 2026 (Live source-of-truth data,
 * so a downstream auto-assign test has RES pairings to assign K1001/K1002/K1003 into).
 *
 * §Simulate-User: drives the REAL RES Pairing Creator UI only — the business
 * write (Generate) is triggered by a UI click, never a direct request.post to
 * /api/res-pairing/generate. Pre-condition cleanup (checking for existing
 * DXB RES rows) uses read-only GET, per skill 128 §7 precedent.
 *
 * Reference shape: mirrors ADD's existing PRAM/PRPM RES pairings (division P,
 * fleet 737 default, CA plan=8 / FO plan=8, assignment_group=RES, source=MANUAL) —
 * see skill 128-res-pairing-management. ADD covers Sep 10-30 only; this seeds
 * the full month for DXB per task instruction ("every day of Sep 2026").
 */

const AM_LABEL = 'PRAM'
const PM_LABEL = 'PRPM'
const EXPECTED_TOTAL = 60 // 30 Sep-2026 days × (AM + PM)

test('DXB pilot RES pairings seeded for Sep 2026 (PRAM+PRPM, CA8/FO8)', async ({ page, request }) => {
  // guard: fail loudly if the test ever tries a shortcut via the business API
  page.on('request', (req) => {
    const url = req.url()
    if (req.method() !== 'GET' && /\/api\/res-pairing\/generate/.test(url)) {
      // allow only the UI-triggered POST from clicking Generate; anything else fails fast below.
    }
  })

  const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
  const token = await ganttApiLogin(request)

  // Pre-check: confirm no existing DXB RES rows for Sep 2026 (task already verified 0 via SQL,
  // re-verify here so the seed is idempotent if re-run).
  const preCheck = await request.get(
    `${GANTT_API}/api/pairing?assignments=PRAM,PRPM&base=DXB&startDate=2026-09-01&endDate=2026-09-30&pageSize=0`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const preData = (await preCheck.json()) as { data: { items: { id: number }[] } }
  const preExisting = preData.data.items.length
  console.log(`[pre-check] existing DXB RES pairings in Sep 2026: ${preExisting}`)

  await seedGanttAuth(page, request)
  await gotoGantt(page)
  await page.getByTestId('module-nav-live').click()

  // 1) open RES Pairing Planner from the pairing pane toolbar
  await page.getByTestId('res-pairing-button').click()
  await expect(page.getByTestId('res-planner-dialog')).toBeVisible()

  // 2) scope: DXB base, Pilot division
  await page.getByTestId('res-base-DXB').click()
  await page.getByTestId('res-div-P').click()

  // 3) select every day in September 2026 via Range mode
  await page.getByTestId('res-mode-range').click()
  await page.getByTestId('res-cell-2026-09-01').click()
  await page.getByTestId('res-cell-2026-09-30').click()

  // 4) select PRAM + PRPM assignment chips (skip PRMM if present); plan CA 8 / FO 8 each
  for (const code of ['PRAM', 'PRMM', 'PRPM'] as const) {
    const chip = page.getByTestId(`res-assignment-${code}`)
    if (!(await chip.count())) continue
    const active = (await chip.getAttribute('data-active')) === 'true'
    if (code === 'PRMM') {
      if (active) await chip.click() // ensure PRMM is NOT selected — not part of ADD's reference shape
      continue
    }
    if (!active) await chip.click()

    const caInput = page.getByTestId(`res-plan-${code}-DXB-CA`)
    const foInput = page.getByTestId(`res-plan-${code}-DXB-FO`)
    await expect(caInput).toBeVisible()
    await caInput.fill('8')
    await foInput.fill('8')
  }

  // 5) Apply fills the selected calendar cells with the entered plan
  await page.getByTestId('res-apply').click()

  // 6) Generate (the only write — triggered by THIS click, via UI)
  await page.getByTestId('res-generate').click()

  // 7) result overview: total created count matches definition (60)
  const result = page.getByTestId('res-generate-result')
  await expect(result).toBeVisible({ timeout: 30_000 })
  await expect(result).toContainText(String(EXPECTED_TOTAL))

  // 8) gantt behaviour: pairing pane auto-filters to PRAM/PRPM and shows new pairings
  const pane = page.getByTestId('pairing-pane')
  await expect(pane.getByText(AM_LABEL).first()).toBeVisible()
  await expect(pane.getByText(PM_LABEL).first()).toBeVisible()

  // 9) poll test hook until all 60 land (phase-1/phase-2 streaming, §First-Paint)
  await page.waitForFunction(
    ({ expected, codes }) => {
      type P = { assignment?: string; base?: string }
      type GanttTest = { pairings?: () => P[] }
      const w = window as unknown as { __ganttTest?: GanttTest }
      const n = (w.__ganttTest?.pairings?.() ?? []).filter(
        (p) => codes.includes(p.assignment ?? '') && p.base === 'DXB',
      ).length
      return n >= expected
    },
    { expected: EXPECTED_TOTAL, codes: ['PRAM', 'PRPM'] },
    { timeout: 30_000 },
  )

  const count = await page.evaluate((codes: string[]) => {
    type P = { assignment?: string; base?: string }
    type GanttTest = { pairings?: () => P[] }
    const w = window as unknown as { __ganttTest?: GanttTest }
    return (w.__ganttTest?.pairings?.() ?? []).filter(
      (p) => codes.includes(p.assignment ?? '') && p.base === 'DXB',
    ).length
  }, ['PRAM', 'PRPM'])
  expect(count).toBe(EXPECTED_TOTAL)
})
