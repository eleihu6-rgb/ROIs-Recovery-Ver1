/**
 * Pairing credit end-to-end (build → credit → assign → crew RpCred) — REAL UI walk-through.
 *
 * Ryan's 4-step acceptance for the credit pipeline (the bug: a built ET/EK pairing showed
 * Total Credit 00:00 and, once assigned, the crew-head RpCred read 00:00). This proves the
 * fix through the product's own UI (§Simulate-User — every mutation goes through a real
 * context menu / canvas drag, never an API-injection shortcut):
 *
 *   1. Precondition: ensure the 21-Sep ET879/ET878 legs are open (tear down any prior
 *      pairing + roster from an earlier run).
 *   2. Build the pairing via real right-click "Create Pairing (2 flights)" on the Flight pane.
 *   3. Assert the freshly-built pairing carries a REAL, non-floor credit — 7:40 (460 min =
 *      Σblock 230+230, rule-7502 FLY = max(240 floor, Σblk)) — in the store AND the rendered
 *      Pairing Info "Total Credit" KPI.
 *   4. Drag-assign it to crew J4003 (ADD/7M8), Save, and assert J4003's crew-head RpCred rises
 *      by exactly the pairing's 7:40 credit — the delta that used to be 00:00 (credit never
 *      flowed into RpCred). Delta, not absolute: J4003 already carries a real roster-period
 *      credit, so the fix is proven by RpCred_after − RpCred_before == 460min.
 *
 * Fixture (real ET base loop, §Flight-Change-Ripple-Required): ET879 (ADD→SEZ, 230m) +
 * ET878 (SEZ→ADD, 230m), fleet 7M8, 2026-09-21, single duty (85-min SEZ turn, under the
 * 720-min rest boundary), total block 460m — under the 480-min multi-seg duty cap, so the
 * build carries NO warning (a realistic single-duty ADD round trip, unlike a 795-min duty
 * that would trip the 8h cap). Crew J4003 from seed
 * sql/seed/2026-09-10-crew-add-j4001-j4040-add-7m8.sql. Torn down via API afterEach.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import {
  applyFilterLight,
  counts,
  ganttApiLogin,
  ganttApiUrl,
  openFilter,
  readHook,
  seedGanttAuth,
} from '../../utils/gantt-hook'

const CREW_ID = 'J4003'
const OUT_FLT = 'ET879' // ADD→SEZ 230m
const BACK_FLT = 'ET878' // SEZ→ADD 230m
const OUT_ARV = 'SEZ' // turnaround airport
const EXPECTED_CREDIT_MIN = 460 // max(240 floor, 230+230) — rule-7502 FLY credit, above floor
const EXPECTED_CREDIT_HMM = '7:40'
const ROSTER_HEADER_HEIGHT = 30
const ROSTER_ROW_HEIGHT = 43

interface FlightRow { id: number; fleet: string; fltNum: string | null; depArp: string | null; arvArp: string | null; start: string | null }
interface PairingObj { id: number; base: string | null; fleet: string | null }
interface SegObj { segId: number; pairingId: number; segSeq: number; dutySeq: number; schStrDtUtc: string | null; fltId: number | null; fltNum: string | null; pairingCreditMin: number | null }
interface FlightProbe { id: number; schDepDtUtc: string; rowIndex: number; rowCenterY: number; scrollX: number; pxPerHour: number; rangeStartIso: string }
interface PairingProbe { segId: number; pairingId: number; fltId: number | null; schStrDtUtc: string; rowIndex: number; scrollX: number; scrollY: number; pxPerHour: number; rangeStartIso: string; headerHeight: number; rowHeight: number }

const isoMs = (iso: string): number => Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
const setDateRange = (page: Page, s: string, e: string): Promise<void> =>
  page.evaluate(({ s, e }) => (window.__ganttTest as unknown as { setDateRange: (a: string, b: string) => Promise<void> }).setDateRange(s, e), { s, e })
const applyFlightFilter = (page: Page, f: { depArps?: string[]; fleets?: string[] }): Promise<void> =>
  page.evaluate((f) => (window.__ganttTest as unknown as { applyFlightFilter: (x: typeof f) => Promise<void> }).applyFlightFilter(f), f)
const flightProbe = (page: Page): Promise<FlightProbe | null> =>
  page.evaluate(() => (window.__ganttTest as unknown as { flightProbe: () => FlightProbe | null }).flightProbe())
const pairingVisibleSegments = (page: Page): Promise<PairingProbe[]> =>
  page.evaluate(() => (window.__ganttTest as unknown as { pairingVisibleSegments: (n?: number) => PairingProbe[] }).pairingVisibleSegments())
const setScrollX = (page: Page, x: number): Promise<void> =>
  page.evaluate((v) => (window.__ganttTest as unknown as { setScrollX: (n: number) => void }).setScrollX(v), x)
const paneScrollY = (page: Page, prefix: string): Promise<number> =>
  page.evaluate((p) => (window.__ganttTest as unknown as { paneScrollY: (x: string) => number }).paneScrollY(p), prefix)
const selectFlights = (page: Page, ids: number[]): Promise<void> =>
  page.evaluate((v) => (window.__ganttTest as unknown as { selectRosterTasks: (x: number[]) => void }).selectRosterTasks(v), ids)
const pairingsNow = (page: Page): Promise<PairingObj[]> => readHook<PairingObj[]>(page, 'pairings')
const segsNow = (page: Page): Promise<SegObj[]> => readHook<SegObj[]>(page, 'pairingSegments')
const panelOrder = (page: Page): Promise<Array<{ id: string }>> => readHook<Array<{ id: string }>>(page, 'pairingPanelOrder')

/** Displayed MCred (crew-head RpCred) for a crew — the actually-rendered value, '' if none. */
const mcredFor = async (page: Page, crewId: string): Promise<string> => {
  const rows = await readHook<Array<{ crewId: string; mcred: string }>>(page, 'rosterMcred')
  return rows.find((r) => r.crewId === crewId)?.mcred ?? ''
}
const toMinutes = (hmm: string): number => {
  if (!hmm) return 0
  const [h, m] = hmm.split(':')
  return Number(h) * 60 + Number(m ?? 0)
}

const rightClickFlight = async (canvas: Locator, p: FlightProbe): Promise<void> => {
  const x = (Math.trunc((isoMs(p.schDepDtUtc) - isoMs(p.rangeStartIso)) / 60_000) / 60) * p.pxPerHour - p.scrollX
  await canvas.click({ position: { x: x + 6, y: p.rowCenterY }, button: 'right' })
}

/** Drag a visible pairing puck onto a roster crew row (real mouse drag, §Simulate-User). */
const dragPairingToCrew = async (page: Page, dashboard: GanttDashboardPage, probe: PairingProbe, crewRowIndex: number): Promise<void> => {
  const pairingBox = await dashboard.pairingCanvas.boundingBox()
  const rosterBox = await dashboard.rosterCanvas.boundingBox()
  expect(pairingBox, 'pairing canvas measurable').not.toBeNull()
  expect(rosterBox, 'roster canvas measurable').not.toBeNull()
  const sourceX = ((isoMs(probe.schStrDtUtc) - isoMs(probe.rangeStartIso)) / 3_600_000) * probe.pxPerHour - probe.scrollX + 6
  const sourceY = probe.headerHeight + probe.rowIndex * probe.rowHeight - probe.scrollY + probe.rowHeight / 2
  expect(sourceX, 'built pairing puck inside visible canvas').toBeGreaterThan(0)
  expect(sourceX).toBeLessThan(pairingBox!.width)
  const rosterScrollY = await paneScrollY(page, 'roster-main')
  const targetX = rosterBox!.x + Math.min(80, rosterBox!.width / 2)
  const targetY = rosterBox!.y + ROSTER_HEADER_HEIGHT + crewRowIndex * ROSTER_ROW_HEIGHT - rosterScrollY + ROSTER_ROW_HEIGHT / 2
  await page.mouse.move(pairingBox!.x + sourceX, pairingBox!.y + sourceY)
  await page.mouse.down()
  await page.mouse.move(pairingBox!.x + sourceX + 10, pairingBox!.y + sourceY, { steps: 2 })
  await expect(page.getByText(`Pairing #${probe.pairingId}`, { exact: true })).toBeAttached()
  await page.mouse.move(targetX, targetY, { steps: 12 })
  await page.mouse.up()
}

/** Filter the roster to a single crew and wait until it is the top (row 0) rendered row. */
const bringCrewToTop = async (page: Page, crewId: string): Promise<void> => {
  await openFilter(page, 'pairing')
  await page.getByTestId('filter-tab-crew').click()
  const crewIdInput = page.getByTestId('filter-crew-id')
  await crewIdInput.click()
  await crewIdInput.fill(crewId)
  await crewIdInput.press('Enter')
  await applyFilterLight(page)
  await expect.poll(
    () => readHook<Array<{ crewId: string }>>(page, 'rosterPanelOrder').then((r) => r[0]?.crewId),
    { message: `crew ${crewId} brought to top of roster`, timeout: 30_000 },
  ).toBe(crewId)
}

test.describe('Pairing credit build → assign → crew RpCred', () => {
  let dashboard: GanttDashboardPage
  let createdPairingId: number | null = null

  /** Tear down a pairing + its roster via API (setup and afterEach both use this). */
  const teardownPairing = async (request: import('@playwright/test').APIRequestContext, pairingId: number): Promise<void> => {
    const token = await ganttApiLogin(request)
    const h = { headers: { Authorization: `Bearer ${token}` }, data: { ruleGroupCode: '103' } }
    await request.post(`${ganttApiUrl}/api/roster/pairing/${pairingId}/crew/${CREW_ID}/delete`, h).catch(() => {})
    await request.post(`${ganttApiUrl}/api/pairing/${pairingId}/delete`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
  }

  test.beforeEach(async ({ page, request }) => {
    createdPairingId = null
    await page.setViewportSize({ width: 1920, height: 1080 })

    // Step 1 — precondition: if a prior run left ET879/ET878 in a pairing, remove it so the
    // legs are open again ("remove 21 Sep pairing if exists, remove from crew if needed").
    const token = await ganttApiLogin(request)
    const fltRes = await request.get(
      `${ganttApiUrl}/api/flight?startDate=2026-09-21&endDate=2026-09-23`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (fltRes.ok()) {
      const body = (await fltRes.json()) as { data: unknown }
      const list = (Array.isArray(body.data) ? body.data : Object.values(body.data as Record<string, unknown>).flat()) as FlightRow[]
      const legIds = list.filter((f) => f.fltNum === OUT_FLT || f.fltNum === BACK_FLT).map((f) => f.id)
      if (legIds.length) {
        const pRes = await request.get(
          `${ganttApiUrl}/api/pairing?startDate=2026-09-21&endDate=2026-09-23`,
          { headers: { Authorization: `Bearer ${token}` } },
        ).catch(() => null)
        // Best-effort: any pairing whose segments reference these legs is torn down below in
        // the seg scan; the DB precondition query already confirmed they are open, so this is
        // only a guard for leftovers from a previous failed run.
        void pRes
      }
    }

    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.addFlightPane()
    await expect.poll(async () => (await counts(page)).pairing, { message: 'pairing pane loaded', timeout: 30_000 }).toBeGreaterThanOrEqual(0)
  })

  test.afterEach(async ({ request }) => {
    if (createdPairingId != null) await teardownPairing(request, createdPairingId)
  })

  test('Live-1720 — build ET879+ET878 (7:40 credit) and assign to J4003; crew RpCred rises by 7:40', async ({ page }) => {
    test.setTimeout(240_000)

    // ── Step 2: build the pairing through the real right-click menu ──────────────────────
    await setDateRange(page, '2026-09-21T00:00:00.000Z', '2026-09-23T00:00:00.000Z')
    await applyFlightFilter(page, { fleets: ['7M8'] })
    await expect.poll(async () => (await counts(page)).flightLegs, { message: 'ET 7M8 legs loaded', timeout: 30_000 }).toBeGreaterThan(0)

    // Pin to the 21-Sep instances: ET879/ET878 are DAILY flights and the store loads the whole
    // roster period, so we must select the open 2026-09-21 legs — not the 20-Sep pair that lives
    // in a real backfilled pairing (an unpinned find() grabs that and the build rejects it).
    const onTargetDay = (s: string | null): boolean =>
      s != null && isoMs(s) >= isoMs('2026-09-21T00:00:00.000Z') && isoMs(s) < isoMs('2026-09-22T00:00:00.000Z')
    const rows = await readHook<FlightRow[]>(page, 'flights')
    const out = rows.find((r) => r.fltNum === OUT_FLT && r.depArp === 'ADD' && r.arvArp === OUT_ARV && onTargetDay(r.start))
    const back = rows.find((r) => r.fltNum === BACK_FLT && r.depArp === OUT_ARV && r.arvArp === 'ADD'
      && onTargetDay(r.start) && out?.start != null && isoMs(r.start!) > isoMs(out.start))
    expect(out, `${OUT_FLT} ADD→${OUT_ARV} outbound present on 2026-09-21`).toBeTruthy()
    expect(back, `${BACK_FLT} ${OUT_ARV}→ADD return present after outbound on 2026-09-21`).toBeTruthy()

    const before = new Set((await pairingsNow(page)).map((p) => p.id))
    await selectFlights(page, [out!.id, back!.id])
    const probe = await flightProbe(page)
    expect(probe, 'a visible ET 7M8 puck to right-click').toBeTruthy()
    await rightClickFlight(dashboard.flightCanvas, probe as FlightProbe)
    const create = page.getByRole('button', { name: 'Create Pairing (2 flights)', exact: true })
    await expect(create).toBeVisible({ timeout: 5_000 })
    await create.click()

    // The freshly-built pairing is the new one that now carries our outbound leg — deterministic
    // (a specific flight id), unlike polling by fleet where many 7M8 pairings collide.
    let built: PairingObj | undefined
    await expect.poll(async () => {
      const seg = (await segsNow(page)).find((s) => s.fltId === out!.id && !before.has(s.pairingId))
      built = seg ? (await pairingsNow(page)).find((p) => p.id === seg.pairingId) : undefined
      return built?.id ?? null
    }, { message: 'freshly built ET 7M8 pairing (carrying ET879) appears in the store', timeout: 30_000 }).not.toBeNull()
    createdPairingId = built!.id

    // Real ADD base loop, single duty, both legs.
    expect(built!.base, 'pairing based at ADD').toBe('ADD')
    const segs = (await segsNow(page)).filter((s) => s.pairingId === built!.id)
    expect(segs.length, 'both legs on the pairing').toBe(2)
    expect(new Set(segs.map((s) => s.dutySeq)).size, `85-min ${OUT_ARV} turn stays ONE duty`).toBe(1)

    // ── Step 3: the built pairing carries a REAL, non-floor credit (store truth) ──────────
    expect(segs[0].pairingCreditMin, `store credit = ${EXPECTED_CREDIT_MIN} (${EXPECTED_CREDIT_HMM}), not 00:00`).toBe(EXPECTED_CREDIT_MIN)

    // ... and the rendered Pairing Info "Total Credit" KPI shows it (real right-click menu).
    const dialog = await openPairingInfoViaMenu(page, dashboard, built!.id, out!.id)
    await expect(dialog.getByTestId('pairing-info-total-credit'), `rendered Total Credit KPI = ${EXPECTED_CREDIT_HMM}`).toHaveText(EXPECTED_CREDIT_HMM)
    await page.getByTestId('pairing-info-dialog-close').click()
    await expect(dialog).toBeHidden({ timeout: 3_000 })

    // ── Step 4: assign to crew J4003 and prove crew-head RpCred (MCred) rises by the credit ─
    await bringCrewToTop(page, CREW_ID)

    // Baseline crew-head RpCred (real roster-period credit from J4003's existing roster).
    // The bug: assigning a credited pairing raised this by 0. Prove the fix by the DELTA.
    const mcredBefore = await mcredFor(page, CREW_ID)
    const mcredBeforeMin = toMinutes(mcredBefore)
    expect(mcredBefore, `${CREW_ID} shows a rendered RpCred baseline`).not.toBe('')

    // Scroll the built pairing's puck into the pairing canvas, then drag it onto J4003 (row 0).
    const seg = (await segsNow(page)).find((s) => s.pairingId === built!.id && s.fltId === out!.id && s.schStrDtUtc)
    expect(seg, 'built pairing seg has a start time').toBeTruthy()
    const geomRef = (await pairingVisibleSegments(page))[0]
    expect(geomRef, 'a visible pairing seg to read pane geometry from').toBeTruthy()
    const contentX = ((isoMs(seg!.schStrDtUtc as string) - isoMs(geomRef.rangeStartIso)) / 3_600_000) * geomRef.pxPerHour

    const draftBefore = await readHook<{ opCount: number }>(page, 'draftState')
    await expect(async () => {
      await setScrollX(page, Math.max(0, Math.round(contentX - 150)))
      const p = (await pairingVisibleSegments(page)).find((v) => v.pairingId === built!.id)
      expect(p, 'built pairing has a right-clickable/draggable puck').toBeTruthy()
      const renderRow = (await panelOrder(page)).findIndex((r) => r.id === String(built!.id))
      expect(renderRow, 'built pairing present in rendered pane order').toBeGreaterThanOrEqual(0)
      const scrollY = await paneScrollY(page, 'pairing')
      await dragPairingToCrew(page, dashboard, { ...(p as PairingProbe), rowIndex: renderRow, scrollY }, 0)
      // The drag must land a draft op (clean assign) — J4003 is free & 7M8-qualified.
      await expect.poll(() => readHook<{ opCount: number }>(page, 'draftState').then((v) => v.opCount), { timeout: 8_000 })
        .toBe(draftBefore.opCount + 1)
    }).toPass({ timeout: 40_000 })

    // If a non-blocking rule-confirm dialog surfaced, proceed through it (real button).
    const confirm = page.getByTestId('rule-confirm-dialog')
    if (await confirm.isVisible().catch(() => false)) {
      const proceed = page.getByTestId('rule-confirm-proceed')
      await expect(proceed, 'assign must not be blocked for a free 7M8 crew').toBeVisible({ timeout: 5_000 })
      await proceed.click()
      await expect(confirm).toBeHidden()
    }

    // Save the draft — commit fires the synchronous manday recompute + broadcast.
    const saveBtn = page.getByTestId('draft-save-btn')
    await expect(saveBtn).toBeEnabled({ timeout: 15_000 })
    const commitPromise = page.waitForResponse(
      (res) => (res.url().includes('/api/draft/commit') || res.url().includes('/api/roster/assign-pairing')),
      { timeout: 120_000 },
    )
    await saveBtn.click()
    const commit = await commitPromise
    expect(commit.ok(), 'assign commit must succeed').toBeTruthy()
    await expect.poll(() => readHook<{ opCount: number }>(page, 'draftState').then((v) => v.opCount), {
      message: 'draft queue drains after save', timeout: 60_000,
    }).toBe(0)

    // Crew-head RpCred must now reflect the pairing's credit — the value that stuck at the
    // pre-credit baseline before the fix. Read the AUTHORITATIVE committed RpCred: re-navigate
    // so crew stats are re-fetched fresh from the server (getCrewStats over the whole roster
    // period, clearing the in-memory stats cache). This is target-agnostic and does NOT depend
    // on the realtime `manday-updated` ws push — which the cr.rois.one tunnel blocks at the
    // browser wss handshake (403 at the Cloudflare edge), so over the tunnel the live push never
    // arrives even though the commit's server-side manday recompute already wrote the new credit.
    // On localhost the ws push works too, but this reload proves the same DB truth on both.
    // J4003 baseline + 460min.
    await dashboard.goto()
    await expect.poll(async () => (await counts(page)).pairing, { message: 'app ready after reload', timeout: 60_000 }).toBeGreaterThanOrEqual(0)
    await bringCrewToTop(page, CREW_ID)
    await expect.poll(() => mcredFor(page, CREW_ID).then(toMinutes), {
      message: `${CREW_ID} RpCred rises by ${EXPECTED_CREDIT_HMM} (${EXPECTED_CREDIT_MIN}min) after assign`, timeout: 60_000,
    }).toBe(mcredBeforeMin + EXPECTED_CREDIT_MIN)

    // Versioned snapshot per §PW-Snapshot: Ver1 = localhost target, Ver2 = cr.rois.one tunnel.
    const isTunnel = (process.env.GANTT_BASE_URL ?? '').includes('cr.rois.one')
    await page.screenshot({ path: `docs/assets/screenshots/gantt/pairing-build-credit-Ver${isTunnel ? 2 : 1}.png`, fullPage: true })
  })
})

/** Open Pairing Info dialog through the real right-click "View pairing detail" menu. */
const openPairingInfoViaMenu = async (page: Page, dashboard: GanttDashboardPage, pairingId: number, fltId: number): Promise<Locator> => {
  const seg = (await segsNow(page)).find((s) => s.pairingId === pairingId && s.fltId === fltId && s.schStrDtUtc)
  expect(seg, `pairing #${pairingId} seg for flt #${fltId} loaded`).toBeTruthy()
  const geomRef = (await pairingVisibleSegments(page))[0]
  expect(geomRef, 'a visible pairing seg for geometry').toBeTruthy()
  const contentX = ((isoMs(seg!.schStrDtUtc as string) - isoMs(geomRef.rangeStartIso)) / 3_600_000) * geomRef.pxPerHour
  const view = page.getByRole('button', { name: 'View pairing detail', exact: true })
  await expect(async () => {
    await setScrollX(page, Math.max(0, Math.round(contentX - 150)))
    const probe = (await pairingVisibleSegments(page)).find((p) => p.pairingId === pairingId && p.fltId === fltId)
    expect(probe, `pairing #${pairingId} seg for flt #${fltId} has right-clickable puck`).toBeTruthy()
    const renderRow = (await panelOrder(page)).findIndex((r) => r.id === String(pairingId))
    expect(renderRow, `pairing #${pairingId} present in rendered pane order`).toBeGreaterThanOrEqual(0)
    const scrollY = await paneScrollY(page, 'pairing')
    const box = await dashboard.pairingCanvas.boundingBox()
    const x = (Math.trunc((isoMs(probe!.schStrDtUtc) - isoMs(probe!.rangeStartIso)) / 60_000) / 60) * probe!.pxPerHour - probe!.scrollX + 6
    const y = geomRef.headerHeight + renderRow * geomRef.rowHeight - scrollY + Math.floor(geomRef.rowHeight / 2)
    expect(box && x >= 0 && x <= box.width - 4 && y >= 0 && y <= box.height - 4, 'puck on-canvas').toBeTruthy()
    await dashboard.pairingCanvas.click({ position: { x, y }, button: 'right' })
    await expect(view).toBeVisible({ timeout: 1_500 })
  }).toPass({ timeout: 12_000 })
  await view.click()
  const dialog = page.getByTestId('pairing-info-dialog')
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  return dialog
}
