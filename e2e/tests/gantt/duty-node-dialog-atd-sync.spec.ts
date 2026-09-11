/**
 * Edit Duty Nodes dialog — flight-ATD sync (Path A anchoring, "polish pairing duty note ui" feat).
 *
 * Feature under test (gantt/src/components/pairing/duty-node-dialog.tsx +
 * duty-node-gantt-bar.tsx + duty-node-utils.ts): the duty-node dialog puck anchors the crew
 * BRIEF/pickup to the SCHEDULED departure (STD) and renders the STD→ATD gap as a hatched "SKED"
 * delay ghost — the puck stays pinned to STD while the flight's actual departure slides out.
 *
 * This spec drives a real flight ATD delay TWICE, then reverts it back to STD, and after each
 * change asserts the two pucks stay in sync per the user's ask ("flight puck + pairing puck sync
 * per flight atd changes"):
 *   - Flight puck  → Flight pane store (window.__ganttTest 'flights' hook: actDepDtUtc/actArvDtUtc)
 *   - Pairing puck → Pairing pane store ('pairingSegments' hook: seg actStrDtUtc/actEndDtUtc)
 *   - Duty-node dialog puck (HTML flex bars, DOM-assertable): the "SKED" ghost block appears on
 *     delay / disappears on revert, while the locked "Brief End" field stays STD-anchored the
 *     whole time (item 7 — brief never stretches to the delayed ATD).
 *
 * FDP is intentionally out of scope for this spec (validated separately via rule 3007) — the ask
 * here is puck sync only.
 *
 * Real UI throughout (§Simulate-User): the ATD/ATA change is the real Flight Detail Edit → Save
 * flow (same as flight-delay-pairing-roster-propagation.spec.ts). Opening the duty-node dialog
 * uses the real Live pairing context menu ("Edit Duty Nodes" button) via the __ganttTest hook that
 * pops that menu; the click on the menu item and the dialog itself are the real components. Only
 * read-only reads and the defensive afterEach reset go direct to the API — never the delay/revert
 * actions under test.
 *
 * Fixture (collision-checked — outside every reserved id/crew range in the other gantt specs):
 *   pairing 151614 — ET462 (155826, ADD→JED) then ET463 (155856, JED→ADD): a real ET ADD-based,
 *   single-duty, base-out-and-back MANUAL pairing (§Real-Business-Case-Test, §Flight-Change-Ripple-
 *   Required). Uncrewed by design — roster sync is not in this spec's scope, so no crew is needed.
 *   Leg 1 (ET462) is the delayed leg; STD 2026-09-12 08:00Z / STA 10:30Z.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Locator, type Page } from '@playwright/test'
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
  fltId: number | null
}

interface FocusResult { id: number; x: number; y: number; rowIndex: number; scrollX: number; scrollY: number }

// ── Fixture ──────────────────────────────────────────────────────────────
const PAIRING_ID = 151614
const LEG1_FLT_ID = 155826        // ET462 ADD→JED — the delayed leg
const LEG1_FLT_NUM = 'ET462'
const LEG1_STD = '2026-09-12T08:00:00.000Z'
const LEG1_STA = '2026-09-12T10:30:00.000Z'

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

const leg1Flight = async (page: Page): Promise<FlightRow | undefined> =>
  (await flightsNow(page)).find((f) => f.id === LEG1_FLT_ID)
const leg1Seg = async (page: Page): Promise<SegObj | undefined> =>
  (await segsNow(page)).find((s) => s.pairingId === PAIRING_ID && s.fltId === LEG1_FLT_ID)

const focusFlight = (page: Page, fltId: number): Promise<FocusResult | null> =>
  page.evaluate((id) => (window.__ganttTest as unknown as { focusFlight: (n: number) => FocusResult | null }).focusFlight(id), fltId)

const applyFlightFilter = (page: Page, filter: { depArps?: string[]; fltNums?: string[] }): Promise<void> =>
  page.evaluate(
    (f) => (window.__ganttTest as unknown as { applyFlightFilter: (x: typeof f) => Promise<void> }).applyFlightFilter(f),
    filter,
  )

const openLivePairingContextMenu = (page: Page, pairingId: number): Promise<void> =>
  page.evaluate((id) => (window.__ganttTest as unknown as { openLivePairingContextMenu: (n: number) => void }).openLivePairingContextMenu(id), pairingId)

/** Is the Live real-time WebSocket actually open in the browser? */
const wsConnected = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window.__ganttTest as unknown as { wsConnected: () => boolean }).wsConnected())

/** Open Flight Detail for a known flight via a real double-click on its Flight-pane puck. */
const openFlightDetailById = async (page: Page, dashboard: GanttDashboardPage, fltId: number): Promise<Locator> => {
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

const readOriginalAtdAta = async (dialog: Locator): Promise<{ atd: string; ata: string }> => ({
  atd: (await dialog.getByTestId('flight-detail-atd').innerText()).trim(),
  ata: (await dialog.getByTestId('flight-detail-ata').innerText()).trim(),
})

/** Edit ATD + ATA via the real Edit UI and save; returns once edit mode has closed. */
const editActualTimes = async (page: Page, dialog: Locator, next: { atd: string; ata: string }): Promise<void> => {
  const editBtn = dialog.getByTestId('flight-detail-edit')
  const atdInput = dialog.getByTestId('flight-detail-atd-time')
  const ataInput = dialog.getByTestId('flight-detail-ata-time')
  for (let attempt = 0; attempt < 5; attempt++) {
    await editBtn.click()
    if (await atdInput.isVisible({ timeout: 3_000 }).catch(() => false)) break
    await page.waitForTimeout(500)
  }
  await expect(atdInput).toBeVisible({ timeout: 5_000 })
  await atdInput.fill(next.atd)
  await ataInput.fill(next.ata)
  await dialog.getByTestId('flight-detail-edit-save').click()
  await expect(editBtn).toBeVisible({ timeout: 15_000 })
}

/** Real Flight Detail edit: apply ATD/ATA, verify the display, close. Returns the flight row after. */
const delayFlight = async (
  page: Page, dashboard: GanttDashboardPage, next: { atd: string; ata: string },
): Promise<FlightRow> => {
  const dialog = await openFlightDetailById(page, dashboard, LEG1_FLT_ID)
  await editActualTimes(page, dialog, next)
  await expect(dialog.getByTestId('flight-detail-atd')).toHaveText(next.atd, { timeout: 10_000 })
  await expect(dialog.getByTestId('flight-detail-ata')).toHaveText(next.ata, { timeout: 10_000 })
  await dialog.getByTestId('flight-detail-close').click()
  await expect(dialog).toBeHidden({ timeout: 5_000 })
  const row = await leg1Flight(page)
  expect(row, 'delayed leg still present in Flight pane').toBeTruthy()
  return row!
}

/** Open the Edit Duty Nodes dialog via the real Live pairing context menu ("Edit Duty Nodes"). */
const openDutyDialog = async (page: Page): Promise<Locator> => {
  await openLivePairingContextMenu(page, PAIRING_ID)
  const editBtn = page.getByRole('button', { name: 'Edit Duty Nodes', exact: true })
  await expect(editBtn).toBeVisible({ timeout: 5_000 })
  await editBtn.click()
  const dialog = page.getByTestId('duty-node-dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  // Dialog re-fetches pairing detail on every open — wait until the loaded form is present.
  await expect(dialog.getByText('Loading...')).toBeHidden({ timeout: 15_000 }).catch(() => {})
  await expect(dialog.getByLabel('Brief End time', { exact: true })).toBeVisible({ timeout: 15_000 })
  return dialog
}

const closeDutyDialog = async (dialog: Locator): Promise<void> => {
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 5_000 })
}

/** Number of hatched "SKED" delay-ghost blocks in the duty puck (0 = no delay rendered). */
const ghostCount = (dialog: Locator): Promise<number> => dialog.locator('div[title^="SKED:"]').count()
/** The value of the locked, STD-anchored "Brief End" time field. */
const briefEndValue = (dialog: Locator): Promise<string> => dialog.getByLabel('Brief End time', { exact: true }).inputValue()

test.describe('Edit Duty Nodes — flight puck + pairing puck stay in sync per flight ATD change', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.addFlightPane()
  })

  // Defensive reset: the delayed leg is real shared flight data. The test reverts it inline at the
  // end, but if an assertion fails midway this restores the flight to on-time (STD/STA) via API so
  // the fixture is left clean for the next run. Cleanup only — never the tested action.
  test.afterEach(async ({ request }) => {
    const token = await ganttApiLogin(request)
    await request.put(`${ganttApiUrl}/api/flight/${LEG1_FLT_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { actDepDtUtc: LEG1_STD, actArvDtUtc: LEG1_STA },
    }).catch(() => {})
  })

  test('delay ET462 ATD twice, then revert to STD — flight/pairing pucks track it and the duty puck ghost appears/clears while brief stays STD-anchored', async ({ page }) => {
    test.setTimeout(180_000)
    const dirname = path.dirname(fileURLToPath(import.meta.url))

    await setDateRange(page, '2026-09-11T00:00:00.000Z', '2026-09-14T00:00:00.000Z')

    // Load pairing 151614 into the Pairing pane (real filter UI).
    await openFilter(page, 'pairing')
    const pairingIdInput = page.getByTestId('filter-pairing-id')
    await pairingIdInput.click()
    await pairingIdInput.fill(String(PAIRING_ID))
    await pairingIdInput.press('Enter')
    await applyFilterLight(page)
    await expect.poll(() => leg1Seg(page).then((s) => s?.segId ?? null), {
      message: `pairing #${PAIRING_ID} leg-1 segment loaded in Pairing pane`, timeout: 30_000,
    }).not.toBeNull()

    // Load ET462 into the Flight pane.
    await applyFlightFilter(page, { depArps: ['ADD'], fltNums: [LEG1_FLT_NUM] })
    await expect.poll(() => leg1Flight(page).then((f) => f?.id ?? null), {
      message: `${LEG1_FLT_NUM} (${LEG1_FLT_ID}) loaded in Flight pane`, timeout: 20_000,
    }).toBe(LEG1_FLT_ID)

    // ── Real-time channel guard ───────────────────────────────────────────
    // Every pane-sync assertion below depends on the Live WebSocket pushing the
    // delay to already-open panes. Assert that channel is actually open *before*
    // relying on it, so a ws-403 / upgrade regression (as happened over the
    // cr.rois.one tunnel) fails here with a clear message — not as an opaque 20s
    // poll timeout, and not masked by the client-side fallback poller, which
    // would otherwise let the panes catch up on HTTP and hide the regression.
    await expect.poll(() => wsConnected(page), {
      message: 'Live WebSocket is connected (real-time pane push channel). '
        + 'If this fails over a proxy/tunnel, the ws upgrade is being rejected (ws-403).',
      timeout: 15_000,
    }).toBe(true)

    // ── Baseline (on-time) ────────────────────────────────────────────────
    const flightBase = await leg1Flight(page)
    const segBase = await leg1Seg(page)
    expect(segBase!.actStrDtUtc, 'leg-1 segment on-time before any delay').toBe(segBase!.schStrDtUtc)
    expect(flightBase!.actDepDtUtc, 'flight puck on-time before any delay').toBe(segBase!.schStrDtUtc)

    let dialog = await openDutyDialog(page)
    const briefEndSTD = await briefEndValue(dialog)   // STD-anchored value; must never change
    expect(await ghostCount(dialog), 'no SKED ghost while on-time').toBe(0)
    await closeDutyDialog(dialog)

    // Read the original ATD/ATA once, from the Flight Detail display, for the shift math + revert.
    const detail = await openFlightDetailById(page, dashboard, LEG1_FLT_ID)
    const original = await readOriginalAtdAta(detail)
    await detail.getByTestId('flight-detail-close').click()
    await expect(detail).toBeHidden({ timeout: 5_000 })

    // ── Delay #1: ATD/ATA +30 ───────────────────────────────────────────────
    const delayed1 = await delayFlight(page, dashboard, {
      atd: shiftTime(original.atd, 30), ata: shiftTime(original.ata, 30),
    })
    expect(delayed1.actDepDtUtc, 'flight puck moved off STD after delay #1').not.toBe(flightBase!.actDepDtUtc)
    await expect.poll(() => leg1Seg(page).then((s) => s?.actStrDtUtc), {
      message: 'pairing puck (leg-1 seg actStrDtUtc) syncs to delayed ATD #1', timeout: 20_000,
    }).toBe(delayed1.actDepDtUtc)
    expect((await leg1Seg(page))!.actEndDtUtc, 'pairing puck end syncs to delayed ATA #1').toBe(delayed1.actArvDtUtc)

    dialog = await openDutyDialog(page)
    expect(await ghostCount(dialog), 'SKED ghost appears in duty puck after delay #1').toBeGreaterThan(0)
    expect(await briefEndValue(dialog), 'brief end stays STD-anchored (not stretched to delayed ATD) #1').toBe(briefEndSTD)
    // §PW-Snapshot: visible proof the duty puck rendered the SKED ghost + STD-anchored brief.
    await dialog.screenshot({
      path: path.resolve(dirname, '../../../docs/assets/screenshots/gantt/duty-node-dialog-atd-sync-Ver1.png'),
    })
    await closeDutyDialog(dialog)

    // ── Delay #2: ATD/ATA +60 (a different delay magnitude) ──────────────────
    const delayed2 = await delayFlight(page, dashboard, {
      atd: shiftTime(original.atd, 60), ata: shiftTime(original.ata, 60),
    })
    expect(delayed2.actDepDtUtc, 'flight puck moved again for delay #2').not.toBe(delayed1.actDepDtUtc)
    await expect.poll(() => leg1Seg(page).then((s) => s?.actStrDtUtc), {
      message: 'pairing puck syncs to the second, larger delayed ATD', timeout: 20_000,
    }).toBe(delayed2.actDepDtUtc)

    dialog = await openDutyDialog(page)
    expect(await ghostCount(dialog), 'SKED ghost still present after delay #2').toBeGreaterThan(0)
    expect(await briefEndValue(dialog), 'brief end still STD-anchored after delay #2').toBe(briefEndSTD)
    await closeDutyDialog(dialog)

    // ── Revert: ATD/ATA back to STD ─────────────────────────────────────────
    const reverted = await delayFlight(page, dashboard, { atd: original.atd, ata: original.ata })
    await expect.poll(() => leg1Seg(page).then((s) => s?.actStrDtUtc), {
      message: 'pairing puck reverts to on-time (actStrDtUtc == schStrDtUtc)', timeout: 20_000,
    }).toBe(segBase!.schStrDtUtc)
    expect(reverted.actDepDtUtc, 'flight puck back on STD after revert').toBe(flightBase!.actDepDtUtc)

    dialog = await openDutyDialog(page)
    expect(await ghostCount(dialog), 'SKED ghost cleared once flight is back on STD').toBe(0)
    expect(await briefEndValue(dialog), 'brief end unchanged through the whole delay/revert cycle').toBe(briefEndSTD)
    await dialog.screenshot({
      path: path.resolve(dirname, '../../../docs/assets/screenshots/gantt/duty-node-dialog-atd-sync-reverted-Ver1.png'),
    })
    await closeDutyDialog(dialog)
  })
})
