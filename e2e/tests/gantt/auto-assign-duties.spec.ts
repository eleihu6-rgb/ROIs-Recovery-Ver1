/**
 * Auto-assign Duties — REAL UI walk-through for 3 ADD crew and 3 DXB crew.
 *
 * Extends "Auto-assign open pairings" (J4001) to duty types with limits
 * (docs/superpowers/specs/2026-09-12-auto-assign-duties-design.md):
 *   1. Filter the three crew to the top of the roster, multi-select their rows.
 *   2. Right-click → "Auto-assign Duties (3 crew)".
 *   3. Configure step: range defaults to the roster period (2026-09-01 → 09-30),
 *      FLY / RES / DO rows with Ryan's limits (FLY every-7-days min 1 / max 4,
 *      RES min 1 / period max 2, DO min 1 / max 2 / period max 8), pool sizes
 *      match the DB (RES pool = base + pilot division, fleet ignored).
 *   4. Analyse → per-crew outcome table vs limits + trace; assert every FLY
 *      rolling window ≤ 4, RES total ≤ 2, DO ≥ 1 per window where a free day existed.
 *   5. Apply to gantt → each planned duty is one draft op; Save commits.
 *   6. Roster API must carry the planned pairings AND the DO rows as crew-base
 *      local full days (ADD = UTC+3 → 21:00Z start; DXB = UTC+4 → 20:00Z start).
 *
 * Fixtures: ADD J4020/J4021/J4022 (7M8, seed 2026-09-10-crew-add-j4001-j4040);
 * DXB K1001/K1002/K1003 (A380) with the 60 DXB PRAM/PRPM RES pairings created
 * through the RES Pairing Creator (res-pairing-dxb-sep2026-seed.spec.ts).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import {
  applyFilterLight,
  ganttApiUrl,
  openFilter,
  readHook,
  seedGanttAuth,
  setDateRange,
} from '../../utils/gantt-hook'

const ROSTER_HEADER_HEIGHT = 30
const ROSTER_ROW_HEIGHT = 43
/** §PW-Snapshot: versioned screenshots under docs/assets/screenshots/gantt/, independent of the runner cwd. */
const HERE = path.dirname(fileURLToPath(import.meta.url))
const shot = (name: string): string => path.resolve(HERE, '../../../docs/assets/screenshots/gantt', `auto-assign-duties-${name}-Ver${process.env.SHOT_VER ?? '1'}.png`)

const RP_START = '2026-09-01'
const RP_END = '2026-09-30'

interface RosterRow {
  id: number
  crewId: string
  pairingId: number | null
  assignment: string | null
  assignmentGroup: string | null
  schStrDtUtc: string | null
  schEndDtUtc: string | null
}

interface PlanResponse {
  crews: Array<{
    crewId: string
    base: string
    assigned: Array<{ pairingId: number; group?: string; label: string }>
    assignedGround: Array<{ group: string; assignment: string; day: string; startDtUtc: string; endDtUtc: string }>
    outcome: Array<{
      group: string
      existing: number
      assigned: number
      windows: Array<{ start: string; end: string; count: number; minUnmet: boolean }>
    }>
    steps: Array<{ kind: string; group?: string; message?: string }>
    warnings: Array<{ ruleCode: string; message: string }>
    summary: { assignedCount: number; skippedCount: number }
  }>
  summary: { crewCount: number; assignedTotal: number; skippedTotal: number }
}

const fetchRoster = async (request: APIRequestContext, token: string, crewIds: string[]): Promise<RosterRow[]> => {
  const res = await request.get(
    `${ganttApiUrl}/api/roster?crewIds=${crewIds.join(',')}&startDate=${RP_START}&endDate=${RP_END}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(res.ok(), 'roster read must succeed').toBeTruthy()
  const raw = ((await res.json()) as { data: unknown }).data
  return (Array.isArray(raw) ? raw : (Object.values(raw as Record<string, unknown>).flat() as unknown[])) as RosterRow[]
}

/** Setup only (not the operation under test): clear September for the crew so the run is repeatable. */
const resetSeptember = async (request: APIRequestContext, token: string, crewIds: string[]): Promise<void> => {
  const auth = { headers: { Authorization: `Bearer ${token}` } }
  const rows = await fetchRoster(request, token, crewIds)
  const byCrewPairing = new Set<string>()
  for (const r of rows) {
    if (r.pairingId != null && r.pairingId !== 0) {
      const key = `${r.pairingId}:${r.crewId}`
      if (byCrewPairing.has(key)) continue
      byCrewPairing.add(key)
      const del = await request.post(`${ganttApiUrl}/api/roster/pairing/${r.pairingId}/crew/${r.crewId}/delete`, { ...auth, data: { username: 'e2e-duties' } })
      expect(del.ok(), `reset: delete pairing ${r.pairingId} from ${r.crewId}`).toBeTruthy()
    } else {
      const del = await request.delete(`${ganttApiUrl}/api/roster/${r.id}`, auth)
      expect(del.ok(), `reset: delete ground row ${r.id} of ${r.crewId}`).toBeTruthy()
    }
  }
}

const bringCrewToTop = async (page: Page, crewIds: string[]): Promise<void> => {
  await openFilter(page, 'pairing')
  await page.getByTestId('filter-tab-crew').click()
  const crewIdInput = page.getByTestId('filter-crew-id')
  for (const id of crewIds) {
    await crewIdInput.click()
    await crewIdInput.fill(id)
    await crewIdInput.press('Enter')
  }
  await applyFilterLight(page)
  await expect
    .poll(
      () => readHook<Array<{ crewId: string }>>(page, 'rosterPanelOrder').then((rows) => rows.slice(0, crewIds.length).map((r) => r.crewId).sort()),
      { timeout: 30_000, message: `crew ${crewIds.join('/')} brought to the top of the roster` },
    )
    .toEqual([...crewIds].sort())
}

const runFor = (base: 'ADD' | 'DXB', crewIds: string[], expectedResPool: number, localMidnightUtcHour: string) =>
  test(`Auto-assign Duties — ${base} ${crewIds.join('/')}: configure RP range + FLY/RES/DO limits, analyse, apply, save`, async ({ page, request }, testInfo) => {
    test.setTimeout(600_000 + Number(process.env.SHOW_HOLD_MS ?? 0))
    const tag = crewIds.length > 3 ? `${base.toLowerCase()}-${crewIds.length}crew` : base.toLowerCase()
    // Every selected row must sit inside the roster pane for the shift-click range; wider batches need a taller viewport.
    await page.setViewportSize({ width: 1920, height: crewIds.length > 3 ? 1700 : 1080 })
    const token = await seedGanttAuth(page, request)
    await resetSeptember(request, token, crewIds)

    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto(150_000)
    await setDateRange(page, '2026-09-10', '2026-09-13') // viewport month = September 2026
    await bringCrewToTop(page, crewIds)

    // Multi-select the three rows (click first + shift-click last = range), then right-click the first.
    const nameCanvas = page.getByTestId('pane-header-canvas-roster-main')
    const box = await nameCanvas.boundingBox()
    expect(box, 'roster name canvas must be measurable').not.toBeNull()
    const rowY = (i: number) => box!.y + ROSTER_HEADER_HEIGHT + ROSTER_ROW_HEIGHT * i + ROSTER_ROW_HEIGHT / 2
    const x = box!.x + Math.min(70, box!.width / 2)
    await page.mouse.click(x, rowY(0))
    await page.keyboard.down('Shift')
    await page.mouse.click(x, rowY(crewIds.length - 1))
    await page.keyboard.up('Shift')
    await page.mouse.click(x, rowY(0), { button: 'right' })
    const menuItem = page.getByRole('button', { name: new RegExp(`Auto-assign Duties \\(${crewIds.length} crew\\)`) })
    await expect(menuItem).toBeVisible({ timeout: 10_000 })
    await menuItem.click()

    // ── Configure step ────────────────────────────────────────────────────────
    const dialog = page.getByTestId('auto-assign-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog).toContainText(`${crewIds.length} crew`)
    await expect(dialog.getByTestId('auto-assign-from')).toHaveValue(RP_START, { timeout: 15_000 })
    await expect(dialog.getByTestId('auto-assign-to')).toHaveValue(RP_END)
    await expect(dialog.getByTestId('auto-assign-range-chip')).toContainText('30 days · 24 rolling 7-day windows')
    await expect(dialog.getByTestId('auto-assign-duty-table')).toContainText('Every 7 Days Min')
    await expect(dialog.getByTestId('auto-assign-duty-table')).toContainText('Every 7 Days Max')

    // Pool sizes come from the DB: RES = base + pilot division (fleet ignored); DO has no pool.
    await expect(dialog.getByTestId('auto-assign-pool-RES')).toContainText(`${expectedResPool} open pairing(s)`, { timeout: 30_000 })
    const flyPool = Number(((await dialog.getByTestId('auto-assign-pool-FLY').textContent()) ?? '').match(/(\d+) open/)?.[1] ?? 0)
    expect(flyPool, `${base} must offer open FLY pairings`).toBeGreaterThan(0)
    await expect(dialog.getByTestId('auto-assign-pool-DO')).toContainText('ground task')

    // Ryan's limits (typed explicitly so the test documents them, not the defaults).
    const setLimit = async (group: string, key: string, v: string) => {
      const inp = dialog.getByTestId(`auto-assign-${group}-${key}`)
      await inp.fill(v)
      await expect(inp).toHaveValue(v)
    }
    await setLimit('FLY', 'periodMax', '')
    await setLimit('FLY', 'every7Min', '1')
    await setLimit('FLY', 'every7Max', '4')
    await setLimit('RES', 'periodMax', '2')
    await setLimit('RES', 'every7Min', '1')
    await setLimit('RES', 'every7Max', '')
    await setLimit('DO', 'periodMax', '8')
    await setLimit('DO', 'every7Min', '1')
    await setLimit('DO', 'every7Max', '2')
    await page.screenshot({ path: shot(`${tag}-configure`) })

    // ── Analyse ───────────────────────────────────────────────────────────────
    const planPromise = page.waitForResponse(
      (res) => res.url().includes('/api/roster/auto-assign/plan') && res.request().method() === 'POST',
      { timeout: 300_000 },
    )
    await dialog.getByTestId('auto-assign-analyse').click()
    const planRes = await planPromise
    expect(planRes.status(), 'plan must return 200').toBe(200)
    const sent = planRes.request().postDataJSON() as { startDate: string; endDate: string; dutyTypes: Array<{ group: string; every7Max: number | null }> }
    expect(sent.startDate).toBe(RP_START)
    expect(sent.endDate).toBe(RP_END)
    expect(sent.dutyTypes.map((d) => d.group)).toEqual(['FLY', 'RES', 'DO'])
    expect(sent.dutyTypes[0].every7Max).toBe(4)
    const plan = ((await planRes.json()) as { data: PlanResponse }).data
    expect(plan.summary.crewCount).toBe(crewIds.length)
    expect(plan.summary.assignedTotal, 'plan must place at least one duty').toBeGreaterThan(0)

    for (const crewId of crewIds) {
      const c = plan.crews.find((p) => p.crewId === crewId)
      expect(c, `plan includes ${crewId}`).toBeTruthy()
      expect(c!.base).toBe(base)
      const fly = c!.outcome.find((o) => o.group === 'FLY')!
      const res = c!.outcome.find((o) => o.group === 'RES')!
      const doo = c!.outcome.find((o) => o.group === 'DO')!
      expect(fly.windows.length, '24 rolling windows over 30 days').toBe(24)
      for (const w of fly.windows) expect(w.count, `${crewId} FLY ${w.start}..${w.end} ≤ 4`).toBeLessThanOrEqual(4)
      expect(res.existing + res.assigned, `${crewId} RES period max 2`).toBeLessThanOrEqual(2)
      expect(doo.existing + doo.assigned, `${crewId} DO period max 8`).toBeLessThanOrEqual(8)
      for (const w of doo.windows) expect(w.count, `${crewId} DO ${w.start}..${w.end} ≤ 2`).toBeLessThanOrEqual(2)
      // Every DO window is either satisfied or explicitly reported unmet (never silently skipped).
      const unmetDo = c!.steps.filter((s) => s.kind === 'unmet' && s.group === 'DO').length
      expect(doo.windows.filter((w) => w.minUnmet).length).toBe(unmetDo)
      expect(c!.assignedGround.length, `${crewId} gets at least one DO day`).toBeGreaterThan(0)
      for (const g of c!.assignedGround) {
        expect(g.assignment).toBe('DO')
        expect(g.startDtUtc.slice(11, 16), `${crewId} DO starts at ${base}-local midnight`).toBe(localMidnightUtcHour)
      }
      // Trace order: FLY filter before RES filter before DO ground.
      const kinds = c!.steps.map((s) => `${s.kind}:${s.group ?? ''}`)
      expect(kinds.indexOf('filter:FLY')).toBeLessThan(kinds.indexOf('filter:RES'))
      const firstGround = kinds.indexOf('ground:DO')
      if (firstGround >= 0) expect(kinds.indexOf('filter:RES')).toBeLessThan(firstGround)

      // UI outcome table shows the same numbers.
      const outcomeRow = dialog.getByTestId(`auto-assign-outcome-${crewId}-FLY`)
      await expect(outcomeRow).toBeVisible()
      await expect(dialog.getByTestId(`auto-assign-outcome-${crewId}-FLY-new`)).toHaveText(`+${fly.assigned}`)
      await expect(dialog.getByTestId(`auto-assign-outcome-${crewId}-DO-new`)).toHaveText(`+${doo.assigned}`)
      // Soft rules left standing (e.g. 7505 min days off) are shown for acceptance, never hidden.
      if (c!.warnings.length > 0) {
        await expect(dialog.getByTestId(`auto-assign-warnings-${crewId}`)).toContainText(c!.warnings[0].ruleCode)
      }
    }
    await expect(dialog.getByTestId('auto-assign-crew')).toHaveCount(crewIds.length)
    await expect(dialog.getByTestId('auto-assign-summary')).toContainText(`${plan.summary.assignedTotal} to assign`)
    await page.screenshot({ path: shot(`${tag}-analyse`) })

    // ── Apply → draft ops → Save ──────────────────────────────────────────────
    const draftBefore = await readHook<{ opCount: number }>(page, 'draftState')
    const applyBtn = dialog.getByTestId('auto-assign-apply')
    await expect(applyBtn).toHaveText(`Apply to gantt (${plan.summary.assignedTotal})`)
    await applyBtn.click()
    // Replay runs to completion (Close appears), then every step must have landed as a draft op.
    await expect(dialog.getByTestId('auto-assign-close')).toBeVisible({ timeout: 400_000 })
    // Optional headed demo: SHOW_HOLD_MS pauses here so the replay log can be inspected before assertions.
    if (Number(process.env.SHOW_HOLD_MS ?? 0) > 0) await page.waitForTimeout(Number(process.env.SHOW_HOLD_MS))
    const failedSteps = await dialog.getByTestId('auto-assign-replay-failed-step').allTextContents()
    expect(failedSteps, `no step may be skipped on replay:\n${failedSteps.join('\n')}`).toEqual([])
    await expect
      .poll(() => readHook<{ opCount: number }>(page, 'draftState').then((v) => v.opCount), {
        timeout: 30_000,
        message: 'every planned pairing and DO landed as a draft op',
      })
      .toBe(draftBefore.opCount + plan.summary.assignedTotal)
    await expect(dialog.getByTestId('auto-assign-progress')).toContainText(`applied ${plan.summary.assignedTotal}/${plan.summary.assignedTotal}`)
    await page.screenshot({ path: shot(`${tag}-applied`) })
    await dialog.getByTestId('auto-assign-close').click()
    await expect(dialog).toBeHidden()

    const saveBtn = page.getByTestId('draft-save-btn')
    await expect(saveBtn).toBeEnabled({ timeout: 15_000 })
    await saveBtn.click()
    await expect
      .poll(() => readHook<{ opCount: number }>(page, 'draftState').then((v) => v.opCount), { timeout: 120_000, message: 'draft queue drains after save' })
      .toBe(0)

    // ── Persisted result: pairings + DO full days per crew ─────────────────────
    await expect
      .poll(async () => (await fetchRoster(request, token, crewIds)).filter((r) => r.assignment === 'DO').length, {
        timeout: 60_000,
        message: 'DO rows persisted for all crew',
      })
      .toBe(plan.crews.reduce((n, c) => n + c.assignedGround.length, 0))
    const rows = await fetchRoster(request, token, crewIds)
    for (const c of plan.crews) {
      const mine = rows.filter((r) => r.crewId === c.crewId)
      const pairingIds = new Set(mine.map((r) => r.pairingId).filter((id): id is number => id != null))
      for (const a of c.assigned) expect(pairingIds.has(a.pairingId), `${c.crewId} carries pairing ${a.pairingId} (${a.group})`).toBe(true)
      const dos = mine.filter((r) => r.assignment === 'DO')
      expect(dos.length).toBe(c.assignedGround.length)
      for (const d of dos) {
        expect((d.schStrDtUtc ?? '').slice(11, 16), `${c.crewId} DO ${d.schStrDtUtc} starts at base-local midnight`).toBe(localMidnightUtcHour)
        const span = (Date.parse(d.schEndDtUtc ?? '') - Date.parse(d.schStrDtUtc ?? '')) / 3_600_000
        expect(span, 'DO spans a full local day').toBeGreaterThanOrEqual(23.9)
      }
    }
    await testInfo.attach('plan', { body: JSON.stringify(plan.summary), contentType: 'application/json' })
    // Optional headed demo: SHOW_HOLD_MS keeps the browser open on the saved result.
    const hold = Number(process.env.SHOW_HOLD_MS ?? 0)
    if (hold > 0) await page.waitForTimeout(hold)
  })

runFor('ADD', ['J4020', 'J4021', 'J4022'], 42, '21:00')
// Wider DXB batch: 13 empty crew, same limits. Screenshots carry the crew count so the 3-crew set stays intact.
runFor('DXB', Array.from({ length: 13 }, (_, i) => `K${1008 + i}`), 60, '20:00')
runFor('DXB', ['K1001', 'K1002', 'K1003'], 60, '20:00')
