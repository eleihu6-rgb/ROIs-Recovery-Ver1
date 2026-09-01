/**
 * Flight-detail Edit (ATD/ATA) → Pairing-pane / Roster-pane ghost-bar + KPI propagation.
 *
 * Backend: live-server/src/services/flight/flight-delay-propagation-service.ts, wired into
 * flightService.update() + PUT /api/flight/:id (see live-server/src/routes/flight/flight.ts).
 * §Flight-Change-Ripple-Required — this spec is the propagation's own regression coverage.
 *
 * Real UI throughout (§Simulate-User): double-click a Flight-pane puck to open Flight Detail,
 * Edit → ATD/ATA fields → Save (same flow already covered by flight-detail-edit-times.spec.ts,
 * reused here on flights that already/subsequently have a pairing + crew assignment). Pairing
 * build is the real right-click "Create Pairing" menu (pairing-build.spec.ts's pattern); crew
 * assignment is a real Pairing-canvas → Roster-canvas drag (roster-assign-delay-fixtures.spec.ts's
 * pattern). Only read-only GET/status-check API calls and non-tested-action cleanup (pairing
 * delete) go direct to the API — never the delay/build/assign/revert actions under test.
 *
 * Fixtures (all collision-checked against other specs' reserved ids/crews):
 * - Scenario 1: flight ET162 (id 153926, ADD→GDQ, unpaired, on-time) + crew T2002 (ADD-based).
 * - Scenario 2/3: a real single-duty, base-to-base pairing — ET137 (id 153914, ADD→ASO) out +
 *   ET136 (id 153913, ASO→ADD) return, both unpaired/on-time — + crew T2003 (ADD-based). Distinct
 *   flights from Scenario 1's ET162/153926 so the two scenarios stay independent.
 *   §Real-Business-Case-Test: a genuine 2-leg out-and-back, not a single-flight throwaway pairing.
 * - Scenario 4: pairing 611 duty 2 (3-leg, F8-imported, already assigned to crew 13439),
 *   delaying the middle leg (seg 1644 / flight 17094) — real shared F8 data, reverted at the end.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import {
  seedGanttAuth,
  ganttApiLogin,
  ganttApiUrl,
  readHook,
  openFilter,
  applyFilterLight,
  setDateRange,
} from '../../utils/gantt-hook'

interface FlightRow {
  id: number
  fltNum: string | null
  depArp: string | null
  arvArp: string | null
  actDepDtUtc: string | null
  actArvDtUtc: string | null
}

interface SegObj {
  segId: number
  pairingId: number
  segSeq: number
  dutySeq: number
  schStrDtUtc: string | null
  schEndDtUtc: string | null
  actStrDtUtc: string | null
  actEndDtUtc: string | null
  pickupStartUtc: string | null
  dropoffEndUtc: string | null
  dutyActRestMin: number | null
  fltId: number | null
}

interface PairingObj {
  id: number
  fleet: string | null
}

interface RosterItem {
  id: number
  crewId: string
  pairingId: number | null
  fltId: number | null
  start: string | null
  end: string | null
  actStrDtUtc: string | null
  actEndDtUtc: string | null
  pickupStartUtc: string | null
  debriefEndUtc: string | null
  dropoffEndUtc: string | null
  dutyActRestMin: number | null
  mbh: string
  ybh: string
}

interface RosterKpi {
  crewId: string
  mcred: string
  mbh: string
  ybh: string
  mdo: string
  ydo: string
  mal: string
  yal: string
}

interface FocusResult {
  id: number
  x: number
  y: number
  rowIndex: number
  scrollX: number
  scrollY: number
}

interface FocusSegResult extends FocusResult {
  pairingId: number
}

const ROSTER_HEADER_HEIGHT = 30
const ROSTER_ROW_HEIGHT = 43

/** Shift an "HH:MM" time by deltaMin, reversing direction if it would cross midnight. */
const shiftTime = (hhmm: string, deltaMin: number): string => {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m
  const forward = total + deltaMin
  const shifted = forward >= 0 && forward < 24 * 60 ? forward : total - deltaMin
  const nh = Math.floor(shifted / 60) % 24
  const nm = shifted % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

const flightsNow = (page: Page): Promise<FlightRow[]> => readHook<FlightRow[]>(page, 'flights')
const segsNow = (page: Page): Promise<SegObj[]> => readHook<SegObj[]>(page, 'pairingSegments')
const pairingsNow = (page: Page): Promise<PairingObj[]> => readHook<PairingObj[]>(page, 'pairings')
const rosterNow = (page: Page): Promise<RosterItem[]> => readHook<RosterItem[]>(page, 'roster')
const rosterKpis = (page: Page): Promise<RosterKpi[]> => readHook<RosterKpi[]>(page, 'rosterPanelKpis')

/**
 * Read-only verification of the backend Manday recompute for a crew/rosterPeriod, bypassing the
 * UI's own KPI cell. Used only where the UI cell is known to sit outside
 * useRosterPeriodStore's default preload window (current RP ±6) — a pre-existing, unrelated
 * frontend limitation (affects every manday-updated push for far-past/future periods, not just
 * this cascade) that is out of scope for this task per §Surgical. This still proves the actual
 * backend contract (crewStatsService/crew_manday_fd_period) that the UI cell would read from
 * once that period is in view; it does not replace the real-UI flight edit under test.
 */
const crewStatsMbhViaApi = async (
  request: APIRequestContext,
  token: string,
  crewId: string,
  rosterPeriod: string,
): Promise<number> => {
  const res = await request.get(`${ganttApiUrl}/api/crew/stats?crewIds=${crewId}&rosterPeriod=${rosterPeriod}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `crew-stats API call for ${crewId}/${rosterPeriod} must succeed`).toBeTruthy()
  const body = (await res.json()) as { data: Record<string, { crewId: string; mbh: number }> }
  const row = body.data[crewId]
  expect(row, `crew-stats API must return a row for ${crewId}/${rosterPeriod}`).toBeTruthy()
  return row!.mbh
}

const applyFlightFilter = (page: Page, filter: { depArps?: string[]; fltNums?: string[] }): Promise<void> =>
  page.evaluate(
    (f) => (window.__ganttTest as unknown as { applyFlightFilter: (x: typeof f) => Promise<void> }).applyFlightFilter(f),
    filter,
  )

const focusFlight = (page: Page, fltId: number): Promise<FocusResult | null> =>
  page.evaluate((id) => (window.__ganttTest as unknown as { focusFlight: (n: number) => FocusResult | null }).focusFlight(id), fltId)

/** Test driver: set the Flight-pane multi-select set directly (mirrors a finished box-drag) —
 * the real right-click "Create Pairing (N flights)" menu then acts on the whole selection exactly
 * as it would after manual ctrl/shift-clicks (same pattern as pairing-build.spec.ts's Live-1712). */
const selectFlights = (page: Page, ids: number[]): Promise<void> =>
  page.evaluate((v) => (window.__ganttTest as unknown as { selectRosterTasks: (x: number[]) => void }).selectRosterTasks(v), ids)

const focusPairingSegment = (page: Page, segId: number): Promise<FocusSegResult | null> =>
  page.evaluate((id) => (window.__ganttTest as unknown as { focusPairingSegment: (n: number) => FocusSegResult | null }).focusPairingSegment(id), segId)

const paneScrollY = (page: Page, prefix: string): Promise<number> =>
  page.evaluate((p) => (window.__ganttTest as unknown as { paneScrollY: (x: string) => number }).paneScrollY(p), prefix)

/** Open Flight Detail for a specific known flight via a real double-click on its Flight-pane puck. */
const openFlightDetailById = async (page: Page, dashboard: GanttDashboardPage, fltId: number): Promise<Locator> => {
  // Poll rather than a single focusFlight() call: a preceding pairing/roster mutation (e.g.
  // assignSegmentToCrew's draft-commit) broadcasts roster-updated, which the Flight pane's own
  // useFlightStore refetches against asynchronously — a single-shot check can race that
  // refetch's transient in-flight window and see a shrunk item list. Every other post-mutation
  // read in this suite already polls; this one didn't, which is what made the failure look like
  // a one-off flake instead of the reproducible race it actually was.
  let probe: FocusResult | null = null
  await expect.poll(async () => {
    probe = await focusFlight(page, fltId)
    return probe
  }, { message: `flight #${fltId} focusable in Flight pane`, timeout: 15_000 }).not.toBeNull()
  await dashboard.flightCanvas.dblclick({ position: { x: probe!.x, y: probe!.y } })
  const dialog = dashboard.flightDetailDialog
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await expect(dialog.getByTestId('flight-detail-flight-id')).toHaveText(`#${fltId}`, { timeout: 10_000 })
  return dialog
}

/** Edit ATD and/or ATA via the real Edit UI and save; returns once edit mode has closed. */
const editActualTimes = async (
  page: Page,
  dialog: Locator,
  next: { atd?: string; ata?: string },
): Promise<void> => {
  const editBtn = dialog.getByTestId('flight-detail-edit')
  const atdInput = dialog.getByTestId('flight-detail-atd-time')
  const ataInput = dialog.getByTestId('flight-detail-ata-time')
  for (let attempt = 0; attempt < 5; attempt++) {
    await editBtn.click()
    if (await atdInput.isVisible({ timeout: 3_000 }).catch(() => false)) break
    await page.waitForTimeout(500)
  }
  await expect(atdInput).toBeVisible({ timeout: 5_000 })
  if (next.atd) await atdInput.fill(next.atd)
  if (next.ata) await ataInput.fill(next.ata)
  await dialog.getByTestId('flight-detail-edit-save').click()
  await expect(editBtn).toBeVisible({ timeout: 15_000 })
}

const readOriginalAtdAta = async (dialog: Locator): Promise<{ atd: string; ata: string }> => ({
  atd: (await dialog.getByTestId('flight-detail-atd').innerText()).trim(),
  ata: (await dialog.getByTestId('flight-detail-ata').innerText()).trim(),
})

/** Build a single-flight MANUAL pairing via the real right-click "Create Pairing (1 flight)" menu. */
const buildSingleFlightPairing = async (
  page: Page,
  dashboard: GanttDashboardPage,
  fltId: number,
  createdPairingIds: number[],
): Promise<PairingObj & { segId: number }> => {
  const before = new Set((await pairingsNow(page)).map((p) => p.id))
  const probe = await focusFlight(page, fltId)
  expect(probe, `flight #${fltId} focusable in Flight pane`).toBeTruthy()
  await dashboard.flightCanvas.click({ position: { x: probe!.x, y: probe!.y }, button: 'right' })
  const create = page.getByRole('button', { name: 'Create Pairing (1 flight)', exact: true })
  await expect(create).toBeVisible({ timeout: 3_000 })
  await create.click()

  let built: PairingObj | undefined
  await expect.poll(async () => {
    built = (await pairingsNow(page)).find((p) => !before.has(p.id))
    return built?.id ?? null
  }, { message: `new pairing built from flight #${fltId}`, timeout: 15_000 }).not.toBeNull()
  createdPairingIds.push(built!.id)

  const seg = (await segsNow(page)).find((s) => s.pairingId === built!.id && s.fltId === fltId)
  expect(seg, `built pairing #${built!.id} has a segment for flight #${fltId}`).toBeTruthy()
  return { ...built!, segId: seg!.segId }
}

/** Build a real single-duty, base-out-and-back pairing (≥2 flights) via the right-click
 * "Create Pairing (N flights)" menu on a multi-flight selection — pairing-build.spec.ts's
 * Live-1712 pattern, reused here so this cascade is validated against a realistic multi-leg
 * pairing rather than a single-flight throwaway (§Real-Business-Case-Test). */
const buildRoundTripPairing = async (
  page: Page,
  dashboard: GanttDashboardPage,
  outFltId: number,
  retFltId: number,
  createdPairingIds: number[],
): Promise<PairingObj & { outSegId: number; retSegId: number }> => {
  const before = new Set((await pairingsNow(page)).map((p) => p.id))
  await selectFlights(page, [outFltId, retFltId])
  const probe = await focusFlight(page, outFltId)
  expect(probe, `flight #${outFltId} focusable in Flight pane`).toBeTruthy()
  await dashboard.flightCanvas.click({ position: { x: probe!.x, y: probe!.y }, button: 'right' })
  const create = page.getByRole('button', { name: 'Create Pairing (2 flights)', exact: true })
  await expect(create).toBeVisible({ timeout: 3_000 })
  await create.click()

  let built: PairingObj | undefined
  await expect.poll(async () => {
    built = (await pairingsNow(page)).find((p) => !before.has(p.id))
    return built?.id ?? null
  }, { message: `new round-trip pairing built from flights #${outFltId}/#${retFltId}`, timeout: 15_000 }).not.toBeNull()
  createdPairingIds.push(built!.id)

  const segs = (await segsNow(page)).filter((s) => s.pairingId === built!.id)
  const outSeg = segs.find((s) => s.fltId === outFltId)
  const retSeg = segs.find((s) => s.fltId === retFltId)
  expect(outSeg, `built pairing #${built!.id} has a segment for outbound flight #${outFltId}`).toBeTruthy()
  expect(retSeg, `built pairing #${built!.id} has a segment for return flight #${retFltId}`).toBeTruthy()
  expect(segs.length, 'round-trip pairing carries both legs').toBe(2)
  return { ...built!, outSegId: outSeg!.segId, retSegId: retSeg!.segId }
}

/** Filter the Roster pane to a single crew (real UI), assign the given pairing segment to it via
 * a real drag from the Pairing canvas to the Roster canvas, then save the draft. */
const assignSegmentToCrew = async (
  page: Page,
  dashboard: GanttDashboardPage,
  pairingId: number,
  segId: number,
  crewId: string,
): Promise<void> => {
  await openFilter(page, 'pairing')
  const pairingIdInput = page.getByTestId('filter-pairing-id')
  await pairingIdInput.click()
  await pairingIdInput.fill(String(pairingId))
  await pairingIdInput.press('Enter')
  await page.getByTestId('filter-tab-crew').click()
  const crewIdInput = page.getByTestId('filter-crew-id')
  await crewIdInput.click()
  await crewIdInput.fill(crewId)
  await crewIdInput.press('Enter')
  await applyFilterLight(page)

  await expect.poll(
    () => readHook<Array<{ crewId: string }>>(page, 'rosterPanelOrder').then((rows) => rows[0]?.crewId),
    { timeout: 30_000, message: `crew ${crewId} brought to top of roster` },
  ).toBe(crewId)
  await expect.poll(
    () => readHook<Array<{ id: string }>>(page, 'pairingPanelOrder').then((rows) => rows[0]?.id),
    { timeout: 30_000, message: `pairing #${pairingId} brought to top of pairing pane` },
  ).toBe(String(pairingId))

  const seg = await focusPairingSegment(page, segId)
  expect(seg, `segment #${segId} focusable in Pairing pane`).toBeTruthy()

  const pairingBox = await dashboard.pairingCanvas.boundingBox()
  const rosterBox = await dashboard.rosterCanvas.boundingBox()
  expect(pairingBox, 'pairing canvas must be measurable').not.toBeNull()
  expect(rosterBox, 'roster canvas must be measurable').not.toBeNull()
  const rosterScrollY = await paneScrollY(page, 'roster-main')
  const sourceX = pairingBox!.x + seg!.x
  const sourceY = pairingBox!.y + seg!.y
  const targetX = rosterBox!.x + Math.min(80, rosterBox!.width / 2)
  const targetY = rosterBox!.y + ROSTER_HEADER_HEIGHT - rosterScrollY + ROSTER_ROW_HEIGHT / 2

  const draftBefore = await readHook<{ opCount: number }>(page, 'draftState')
  const previewPromise = page.waitForResponse((res) => res.url().includes('/api/legality/preview-draft'), { timeout: 150_000 })

  await page.mouse.move(sourceX, sourceY)
  await page.mouse.down()
  await page.mouse.move(sourceX + 15, sourceY, { steps: 3 })
  await page.mouse.move(targetX, targetY, { steps: 12 })
  await page.mouse.up()

  const preview = await previewPromise
  expect(preview.status()).toBe(200)
  const previewBody = await preview.json()
  const violations = (previewBody as { violations?: unknown[] }).violations
    ?? (previewBody as { data?: { violations?: unknown[] } }).data?.violations
  expect(Array.isArray(violations), 'preview must return an engine-computed violations array').toBe(true)

  const dialog = page.getByTestId('rule-confirm-dialog')
  if ((violations as unknown[]).length > 0) {
    await expect(dialog).toBeVisible({ timeout: 60_000 })
    const proceedBtn = dialog.getByTestId('rule-confirm-proceed')
    const canProceed = await proceedBtn.isVisible().catch(() => false)
    expect(canProceed, `assign pairing ${pairingId} to ${crewId}: blocking violations (dialog: ${await dialog.innerText()})`).toBe(true)
    await proceedBtn.click()
    await expect(dialog).toBeHidden()
  }

  await expect.poll(
    () => readHook<{ opCount: number }>(page, 'draftState').then((v) => v.opCount),
    { timeout: 30_000, message: 'assign accepted exactly one new draft op' },
  ).toBe(draftBefore.opCount + 1)

  const saveBtn = page.getByTestId('draft-save-btn')
  await expect(saveBtn).toBeEnabled({ timeout: 15_000 })
  const commitPromise = page.waitForResponse(
    (res) => res.url().includes('/api/draft/commit') || res.url().includes('/api/roster/assign-pairing'),
    { timeout: 60_000 },
  )
  await saveBtn.click()
  const commit = await commitPromise
  expect(commit.ok(), `draft commit/assign pairing ${pairingId} must succeed`).toBeTruthy()

  await expect.poll(
    () => readHook<{ opCount: number }>(page, 'draftState').then((v) => v.opCount),
    { timeout: 30_000, message: 'draft queue drains back to 0 after successful save' },
  ).toBe(0)
}

test.describe('Flight-detail edit propagates to Pairing/Roster panes + KPI', () => {
  let dashboard: GanttDashboardPage
  let createdPairingIds: number[] = []

  test.beforeEach(async ({ page, request }) => {
    createdPairingIds = []
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.addFlightPane()
    // Date range is set per-test, narrowed around that scenario's own fixture date —
    // a single wide shared range clamps the pane's horizontal scroll window hard enough
    // that focusFlight()'s returned click coordinates can overflow the canvas bounds.
  })

  test.afterEach(async ({ request }) => {
    if (createdPairingIds.length === 0) return
    const token = await ganttApiLogin(request)
    const authHeaders = { Authorization: `Bearer ${token}` }
    for (const id of createdPairingIds) {
      // pairing-service.remove()'s rostered-crew pre-check (409) blocks deleting a pairing that
      // still has an active roster_flight row — unassign every crew first, or this cleanup
      // silently no-ops (caught below) and leaves the pairing + roster row behind for the next run.
      const crewRes = await request.get(`${ganttApiUrl}/api/pairing/${id}/crew`, { headers: authHeaders }).catch(() => null)
      const crewIds = crewRes && crewRes.ok() ? ((await crewRes.json()) as { data: { crewIds: string[] } }).data.crewIds : []
      for (const crewId of crewIds) {
        await request.post(`${ganttApiUrl}/api/roster/pairing/${id}/crew/${crewId}/delete`, {
          headers: authHeaders,
          data: { username: 'admin' },
        }).catch(() => {})
      }
      await request.post(`${ganttApiUrl}/api/pairing/${id}/delete`, {
        headers: authHeaders,
        data: {},
      }).catch(() => {})
    }
  })

  test('Scenario 1 (regression guard) — delaying an unpaired flight, then building + assigning, carries the delay into the fresh pairing/roster snapshot', async ({ page }) => {
    test.setTimeout(180_000)
    const FLT_ID = 153926
    const CREW_ID = 'T2002'

    await setDateRange(page, '2026-09-01T00:00:00.000Z', '2026-09-10T00:00:00.000Z')
    await applyFlightFilter(page, { depArps: ['ADD'], fltNums: ['ET162'] })
    await expect.poll(async () => (await flightsNow(page)).some((f) => f.id === FLT_ID), {
      message: 'ET162 (153926) loaded in Flight pane', timeout: 20_000,
    }).toBe(true)

    const dialog = await openFlightDetailById(page, dashboard, FLT_ID)
    const original = await readOriginalAtdAta(dialog)
    const delayedAtd = shiftTime(original.atd, 25)
    const delayedAta = shiftTime(original.ata, 25)
    await editActualTimes(page, dialog, { atd: delayedAtd, ata: delayedAta })
    await expect(dialog.getByTestId('flight-detail-atd')).toHaveText(delayedAtd, { timeout: 10_000 })
    await expect(dialog.getByTestId('flight-detail-ata')).toHaveText(delayedAta, { timeout: 10_000 })
    await dialog.getByTestId('flight-detail-close').click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })

    const flightDelayed = (await flightsNow(page)).find((f) => f.id === FLT_ID)
    expect(flightDelayed?.actDepDtUtc, 'flight store reflects the delayed ATD').not.toBeNull()

    const built = await buildSingleFlightPairing(page, dashboard, FLT_ID, createdPairingIds)
    const seg = (await segsNow(page)).find((s) => s.segId === built.segId)
    expect(seg, 'built pairing carries a segment for the delayed flight').toBeTruthy()
    expect(seg!.actStrDtUtc, 'build-time snapshot copies the ALREADY-delayed actual departure').toBe(flightDelayed!.actDepDtUtc)
    expect(seg!.actEndDtUtc, 'build-time snapshot copies the ALREADY-delayed actual arrival').toBe(flightDelayed!.actArvDtUtc)

    await assignSegmentToCrew(page, dashboard, built.id, built.segId, CREW_ID)

    await expect.poll(
      async () => (await rosterNow(page)).find((r) => r.pairingId === built.id && r.fltId === FLT_ID)?.actStrDtUtc,
      { message: `crew ${CREW_ID} roster row picks up the delayed actual departure after assignment`, timeout: 20_000 },
    ).toBe(flightDelayed!.actDepDtUtc)
    const rosterRow = (await rosterNow(page)).find((r) => r.pairingId === built.id && r.fltId === FLT_ID)
    expect(rosterRow!.actEndDtUtc, 'roster ghost bar carries the delayed actual arrival').toBe(flightDelayed!.actArvDtUtc)

    // §PW-Snapshot: visible proof the fresh-build snapshot (build-time copy of an already-delayed
    // flight) reached the Pairing/Roster panes' own ghost-bar rendering, not just store state.
    const dirname = path.dirname(fileURLToPath(import.meta.url))
    await page.screenshot({
      path: path.resolve(dirname, '../../../docs/assets/screenshots/gantt/flight-delay-pairing-roster-propagation-scenario1.png'),
    })

    // Cleanup: revert the flight to on-time via the real Edit UI so the shared flight row is
    // left unchanged (afterEach deletes the pairing itself via API — not the tested action).
    const dialog2 = await openFlightDetailById(page, dashboard, FLT_ID)
    await editActualTimes(page, dialog2, { atd: original.atd, ata: original.ata })
    await expect(dialog2.getByTestId('flight-detail-atd')).toHaveText(original.atd, { timeout: 10_000 })
    await expect(dialog2.getByTestId('flight-detail-ata')).toHaveText(original.ata, { timeout: 10_000 })
    await dialog2.getByTestId('flight-detail-close').click()
  })

  test('Scenario 2 (new cascade) — delaying the return leg of an assigned base-to-base pairing ripples into Pairing/Roster ghost bars, debrief window and crew KPI', async ({ page }) => {
    test.setTimeout(180_000)
    // ET137 (ADD→ASO) out + ET136 (ASO→ADD) return: a real single-duty, base-to-base pairing —
    // validated via a live POST /api/pairing/build dry-run before writing this test (§Real-
    // Business-Case-Test) — not a single-flight throwaway.
    const OUT_FLT_ID = 153914
    const RET_FLT_ID = 153913
    const CREW_ID = 'T2003'

    await setDateRange(page, '2026-09-01T00:00:00.000Z', '2026-09-10T00:00:00.000Z')
    await applyFlightFilter(page, { depArps: ['ADD', 'ASO'], fltNums: ['ET137', 'ET136'] })
    await expect.poll(async () => {
      const rows = await flightsNow(page)
      return rows.some((f) => f.id === OUT_FLT_ID) && rows.some((f) => f.id === RET_FLT_ID)
    }, {
      message: 'ET137 (153914) + ET136 (153913) loaded in Flight pane', timeout: 20_000,
    }).toBe(true)

    const built = await buildRoundTripPairing(page, dashboard, OUT_FLT_ID, RET_FLT_ID, createdPairingIds)
    await assignSegmentToCrew(page, dashboard, built.id, built.outSegId, CREW_ID)

    const outBefore = (await segsNow(page)).find((s) => s.segId === built.outSegId)
    const retBefore = (await segsNow(page)).find((s) => s.segId === built.retSegId)
    expect(outBefore, 'assigned outbound segment loaded').toBeTruthy()
    expect(retBefore, 'assigned return segment loaded').toBeTruthy()
    expect(retBefore!.actStrDtUtc, 'return segment on-time before delay').toBe(retBefore!.schStrDtUtc)

    await expect.poll(
      async () => (await rosterNow(page)).find((r) => r.pairingId === built.id && r.fltId === RET_FLT_ID)?.actStrDtUtc,
      { message: `crew ${CREW_ID} roster row synced from assignment before delay`, timeout: 20_000 },
    ).not.toBeNull()
    const rosterOutBefore = (await rosterNow(page)).find((r) => r.pairingId === built.id && r.fltId === OUT_FLT_ID)
    const rosterRetBefore = (await rosterNow(page)).find((r) => r.pairingId === built.id && r.fltId === RET_FLT_ID)
    expect(rosterOutBefore, `crew ${CREW_ID} outbound roster row loaded`).toBeTruthy()
    expect(rosterRetBefore!.actStrDtUtc, 'return roster row on-time before delay').toBe(rosterRetBefore!.start)

    // KPI signal is block hours (mbh), not credit (mcred): T2003 is a synthetic MANUAL-pairing
    // test crew missing the rank/composition reference data crewStatsService's credit formula
    // needs, so mcred is pinned at 0 regardless of the delay — a pre-existing test-fixture gap,
    // unrelated to this cascade. mbh is a direct function of actual block time and reliably moves
    // with the delay, proving the same recompute pipeline (refreshLiveLegalityAndManday) fires.
    const kpiBefore = (await rosterKpis(page)).find((k) => k.crewId === CREW_ID)
    expect(kpiBefore, `crew ${CREW_ID} KPI row visible before delay`).toBeTruthy()

    // Delay the RETURN leg — the last segment of the single duty, so the debrief/dropoff-window
    // assertions below stay meaningful (last-segment recompute).
    const dialog = await openFlightDetailById(page, dashboard, RET_FLT_ID)
    const original = await readOriginalAtdAta(dialog)
    // Asymmetric offsets (not a uniform shift): a delay that pushes ATD and ATA by the same
    // amount preserves block DURATION exactly, so mbh (block hours) — and any credit rule
    // derived from it — would never move, which is not what we're testing here. Widening block
    // time by 20min (ATD +20, ATA +40) actually changes the crew's credited/duty inputs.
    const delayedAtd = shiftTime(original.atd, 20)
    const delayedAta = shiftTime(original.ata, 40)
    await editActualTimes(page, dialog, { atd: delayedAtd, ata: delayedAta })
    await expect(dialog.getByTestId('flight-detail-atd')).toHaveText(delayedAtd, { timeout: 10_000 })
    await expect(dialog.getByTestId('flight-detail-ata')).toHaveText(delayedAta, { timeout: 10_000 })
    await dialog.getByTestId('flight-detail-close').click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })

    const flightDelayed = (await flightsNow(page)).find((f) => f.id === RET_FLT_ID)
    expect(flightDelayed?.actDepDtUtc, 'flight store reflects the new delayed ATD').not.toBe(retBefore!.actStrDtUtc)

    await expect.poll(
      async () => (await segsNow(page)).find((s) => s.segId === built.retSegId)?.actStrDtUtc,
      { message: 'Pairing-pane ghost bar (return segment actStrDtUtc) picks up the delay', timeout: 20_000 },
    ).toBe(flightDelayed!.actDepDtUtc)
    const retAfter = (await segsNow(page)).find((s) => s.segId === built.retSegId)
    expect(retAfter!.actEndDtUtc, 'Pairing-pane ghost bar end matches the delayed actual arrival').toBe(flightDelayed!.actArvDtUtc)
    expect(retAfter!.dropoffEndUtc, 'MANUAL pairing debrief/dropoff window shifts with the delay').not.toBe(retBefore!.dropoffEndUtc)

    // The untouched OUTBOUND leg must not move — proves the cascade targets only the edited
    // flight's own segment/roster row, not the whole pairing indiscriminately.
    const outAfter = (await segsNow(page)).find((s) => s.segId === built.outSegId)
    expect(outAfter!.actStrDtUtc, 'outbound leg actual departure untouched by the return-leg delay').toBe(outBefore!.actStrDtUtc)
    expect(outAfter!.actEndDtUtc, 'outbound leg actual arrival untouched by the return-leg delay').toBe(outBefore!.actEndDtUtc)

    await expect.poll(
      async () => (await rosterNow(page)).find((r) => r.pairingId === built.id && r.fltId === RET_FLT_ID)?.actStrDtUtc,
      { message: 'Roster-pane ghost bar (return roster_flight actStrDtUtc) picks up the delay', timeout: 20_000 },
    ).toBe(flightDelayed!.actDepDtUtc)
    const rosterRetAfter = (await rosterNow(page)).find((r) => r.pairingId === built.id && r.fltId === RET_FLT_ID)
    expect(rosterRetAfter!.actEndDtUtc, 'Roster-pane ghost bar end matches the delayed actual arrival').toBe(flightDelayed!.actArvDtUtc)
    expect(rosterRetAfter!.debriefEndUtc, `crew ${CREW_ID}'s debrief window shifts with the delay`).not.toBe(rosterRetBefore!.debriefEndUtc)

    const rosterOutAfter = (await rosterNow(page)).find((r) => r.pairingId === built.id && r.fltId === OUT_FLT_ID)
    expect(rosterOutAfter!.actStrDtUtc, 'outbound roster ghost bar untouched by the return-leg delay').toBe(rosterOutBefore!.actStrDtUtc)

    // §PW-Snapshot: visible proof the cascade reached the Pairing/Roster panes' own ghost-bar
    // rendering, not just their underlying store state asserted above.
    const dirname = path.dirname(fileURLToPath(import.meta.url))
    await page.screenshot({
      path: path.resolve(dirname, '../../../docs/assets/screenshots/gantt/flight-delay-pairing-roster-propagation.png'),
    })

    await expect.poll(
      async () => (await rosterKpis(page)).find((k) => k.crewId === CREW_ID)?.mbh,
      { message: `crew ${CREW_ID} KPI (mbh) updates after the delay`, timeout: 30_000 },
    ).not.toBe(kpiBefore!.mbh)

    // ── Scenario 3 (revert) — retime back to on-time via the real Edit UI; assert cascade reverts.
    const dialog2 = await openFlightDetailById(page, dashboard, RET_FLT_ID)
    await editActualTimes(page, dialog2, { atd: original.atd, ata: original.ata })
    await expect(dialog2.getByTestId('flight-detail-atd')).toHaveText(original.atd, { timeout: 10_000 })
    await expect(dialog2.getByTestId('flight-detail-ata')).toHaveText(original.ata, { timeout: 10_000 })
    await dialog2.getByTestId('flight-detail-close').click()
    await expect(dialog2).toBeHidden({ timeout: 5_000 })

    const flightReverted = (await flightsNow(page)).find((f) => f.id === RET_FLT_ID)

    await expect.poll(
      async () => (await segsNow(page)).find((s) => s.segId === built.retSegId)?.actStrDtUtc,
      { message: 'Pairing-pane ghost bar reverts to on-time', timeout: 20_000 },
    ).toBe(flightReverted!.actDepDtUtc)
    const retReverted = (await segsNow(page)).find((s) => s.segId === built.retSegId)
    expect(retReverted!.actStrDtUtc, 'return segment reverted actStrDtUtc equals scheduled').toBe(retReverted!.schStrDtUtc)
    expect(retReverted!.dropoffEndUtc, 'debrief/dropoff window reverts to the original on-time value').toBe(retBefore!.dropoffEndUtc)

    const outReverted = (await segsNow(page)).find((s) => s.segId === built.outSegId)
    expect(outReverted!.actStrDtUtc, 'outbound leg still untouched after the return-leg revert').toBe(outBefore!.actStrDtUtc)

    await expect.poll(
      async () => (await rosterNow(page)).find((r) => r.pairingId === built.id && r.fltId === RET_FLT_ID)?.actStrDtUtc,
      { message: 'Roster-pane ghost bar reverts to on-time', timeout: 20_000 },
    ).toBe(flightReverted!.actDepDtUtc)
    const rosterRetReverted = (await rosterNow(page)).find((r) => r.pairingId === built.id && r.fltId === RET_FLT_ID)
    expect(rosterRetReverted!.debriefEndUtc, `crew ${CREW_ID}'s debrief window reverts to on-time`).toBe(rosterRetBefore!.debriefEndUtc)

    // §PW-Snapshot: visible proof the revert cascade cleared the ghost bars/debrief shift back
    // out of the Pairing/Roster panes, not just that the store fields matched pre-delay values.
    await page.screenshot({
      path: path.resolve(dirname, '../../../docs/assets/screenshots/gantt/flight-delay-pairing-roster-propagation-scenario3-revert.png'),
    })

    await expect.poll(
      async () => (await rosterKpis(page)).find((k) => k.crewId === CREW_ID)?.mbh,
      { message: `crew ${CREW_ID} KPI (mbh) reverts to its pre-delay value`, timeout: 30_000 },
    ).toBe(kpiBefore!.mbh)
  })

  test('Scenario 4 (combined position + source skip) — delaying an F8-imported, non-boundary duty leg cascades raw actual times + KPI but leaves the pickup/debrief window untouched by design', async ({ page, request }) => {
    test.setTimeout(180_000)
    // pairing_id=611 duty_seq=2, real F8-imported shared data (not a throwaway MANUAL pairing) —
    // reverted to on-time at the end of this test, never deleted.
    const FLT_ID = 17094
    const PAIRING_ID = 611
    const SEG_ID = 1644
    const CREW_ID = '13439'
    const ROSTER_PERIOD = '2026RP01'
    const apiToken = await ganttApiLogin(request)

    await setDateRange(page, '2026-01-05T00:00:00.000Z', '2026-01-15T00:00:00.000Z')
    await openFilter(page, 'pairing')
    const pairingIdInput = page.getByTestId('filter-pairing-id')
    await pairingIdInput.click()
    await pairingIdInput.fill(String(PAIRING_ID))
    await pairingIdInput.press('Enter')
    // Fixture pairing 611 is already fully crewed (coverage='full'); the pane's default
    // coverage filter is ['open','partial'] and would silently exclude it otherwise.
    await page.getByTestId('filter-pairing-coverage-full').click()
    await applyFilterLight(page)
    await expect.poll(
      () => readHook<Array<{ id: string }>>(page, 'pairingPanelOrder').then((rows) => rows[0]?.id),
      { timeout: 30_000, message: `pairing #${PAIRING_ID} loaded in Pairing pane` },
    ).toBe(String(PAIRING_ID))

    const segBefore = (await segsNow(page)).find((s) => s.segId === SEG_ID)
    expect(segBefore, `seg #${SEG_ID} loaded (pairing #${PAIRING_ID}, duty leg 2 of 3)`).toBeTruthy()
    expect(segBefore!.actStrDtUtc, 'F8-imported segment on-time before delay').toBe(segBefore!.schStrDtUtc)
    const rosterBefore = (await rosterNow(page)).find((r) => r.crewId === CREW_ID && r.fltId === FLT_ID)
    expect(rosterBefore, `crew ${CREW_ID} roster row for flight #${FLT_ID} loaded`).toBeTruthy()
    // Verified via the crew-stats API (not the rosterPanelKpis UI hook): flight #17094 is dated
    // 2026-01-10, ~7 roster periods before "today" — outside useRosterPeriodStore's default
    // preload window (current RP ±6), a pre-existing, unrelated frontend limitation (affects any
    // manday-updated push for a period outside that window, not specific to this cascade — see
    // getLiveViewportRosterPeriod()/loadRosterPeriods()). The UI's own KPI cell will not refresh
    // for this date without a manual "load earlier RPs" action, so it is not asserted here;
    // the API call below proves the same backend contract (crewStatsService) the UI cell reads.
    // Signal is mbh (block hours), not mcred (credit): confirmed by direct DB check that mcred is
    // pinned to a duty-boundary-anchored value that a mid-leg (non-boundary) delay does not move,
    // even though the recompute genuinely fires (crew_manday_fd_period.updated_at changes) — a
    // real Rust-engine business rule, not a propagation defect. mbh is a direct function of actual
    // block time and reliably moves with any actual block-duration delta, including mid-leg ones —
    // which requires an asymmetric ATD/ATA offset (a uniform shift preserves block duration exactly
    // and would never move mbh).
    const kpiBeforeApi = await crewStatsMbhViaApi(request, apiToken, CREW_ID, ROSTER_PERIOD)

    await applyFlightFilter(page, { fltNums: ['825'] })
    await expect.poll(async () => (await flightsNow(page)).some((f) => f.id === FLT_ID), {
      message: 'flight #17094 (825, YEG->YVR) loaded in Flight pane', timeout: 20_000,
    }).toBe(true)
    const dialog = await openFlightDetailById(page, dashboard, FLT_ID)
    const original = await readOriginalAtdAta(dialog)
    const delayedAtd = shiftTime(original.atd, 10)
    const delayedAta = shiftTime(original.ata, 20)
    await editActualTimes(page, dialog, { atd: delayedAtd, ata: delayedAta })
    await expect(dialog.getByTestId('flight-detail-atd')).toHaveText(delayedAtd, { timeout: 10_000 })
    await expect(dialog.getByTestId('flight-detail-ata')).toHaveText(delayedAta, { timeout: 10_000 })
    await dialog.getByTestId('flight-detail-close').click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })

    const flightDelayed = (await flightsNow(page)).find((f) => f.id === FLT_ID)

    // Raw actual-time cascade fires unconditionally: seg + roster ghost bars pick up the delay.
    await expect.poll(
      async () => (await segsNow(page)).find((s) => s.segId === SEG_ID)?.actStrDtUtc,
      { message: 'middle-leg segment actual time cascades regardless of source/position', timeout: 20_000 },
    ).toBe(flightDelayed!.actDepDtUtc)
    const segAfter = (await segsNow(page)).find((s) => s.segId === SEG_ID)
    expect(segAfter!.actEndDtUtc, 'middle-leg segment actual arrival cascades too').toBe(flightDelayed!.actArvDtUtc)

    await expect.poll(
      async () => (await rosterNow(page)).find((r) => r.crewId === CREW_ID && r.fltId === FLT_ID)?.actStrDtUtc,
      { message: `crew ${CREW_ID} roster ghost bar picks up the delay`, timeout: 20_000 },
    ).toBe(flightDelayed!.actDepDtUtc)

    // By-design non-recompute: this duty's pickup/debrief window is neither MANUAL-sourced nor
    // anchored on this (non-boundary) leg, so it must NOT shift — asserted explicitly, not left
    // untested (§Flight-Change-Ripple-Required's "assert unchanged, with a stated reason").
    expect(segAfter!.pickupStartUtc, 'F8-imported duty: pickup window untouched (not this duty\'s first/last leg)').toBe(segBefore!.pickupStartUtc)
    expect(segAfter!.dropoffEndUtc, 'F8-imported duty: dropoff/debrief window untouched (source != MANUAL)').toBe(segBefore!.dropoffEndUtc)
    expect(segAfter!.dutyActRestMin, 'F8-imported duty: rest minutes untouched').toBe(segBefore!.dutyActRestMin)
    const rosterAfter = (await rosterNow(page)).find((r) => r.crewId === CREW_ID && r.fltId === FLT_ID)
    expect(rosterAfter!.debriefEndUtc, `crew ${CREW_ID}: debrief window untouched by this middle-leg delay`).toBe(rosterBefore!.debriefEndUtc)

    // §PW-Snapshot: visible proof the middle-leg raw-time cascade reached the Pairing/Roster
    // ghost bars while the pickup/debrief window visibly held still, on real F8-imported data.
    const dirname = path.dirname(fileURLToPath(import.meta.url))
    await page.screenshot({
      path: path.resolve(dirname, '../../../docs/assets/screenshots/gantt/flight-delay-pairing-roster-propagation-scenario4-f8-imported.png'),
    })

    // KPI still recomputes (unconditional, per manday-updated broadcast) even though the window
    // itself didn't move — the delay still changes actual credited/duty time inputs. Verified via
    // the crew-stats API for the reason documented above (kpiBeforeApi).
    await expect.poll(
      async () => crewStatsMbhViaApi(request, apiToken, CREW_ID, ROSTER_PERIOD),
      { message: `crew ${CREW_ID} KPI (mbh, ${ROSTER_PERIOD}) still updates from the raw actual-time change`, timeout: 30_000 },
    ).not.toBe(kpiBeforeApi)

    // Cleanup: revert to on-time via the real Edit UI — this is real shared F8 data, not a
    // pairing we can delete.
    const dialog2 = await openFlightDetailById(page, dashboard, FLT_ID)
    await editActualTimes(page, dialog2, { atd: original.atd, ata: original.ata })
    await expect(dialog2.getByTestId('flight-detail-atd')).toHaveText(original.atd, { timeout: 10_000 })
    await expect(dialog2.getByTestId('flight-detail-ata')).toHaveText(original.ata, { timeout: 10_000 })
    await dialog2.getByTestId('flight-detail-close').click()
    await expect(dialog2).toBeHidden({ timeout: 5_000 })

    await expect.poll(
      async () => (await segsNow(page)).find((s) => s.segId === SEG_ID)?.actStrDtUtc,
      { message: 'middle-leg segment actual time reverts to on-time', timeout: 20_000 },
    ).toBe(segBefore!.schStrDtUtc)
  })
})
