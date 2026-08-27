import { test, expect, type Locator, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'

/**
 * Live MCred recomputes in real time as the planner de-assigns a duty (BEFORE Save),
 * and reverts on Undo. Phase A optimistic delta: displayed mcred = server base +
 * credit(virtual roster) − credit(base roster).
 *
 * Reported behaviour: de-assigning a pairing from a crew did not change that crew's
 * MCred column until a month-scroll re-fetch (and not even after Save). This proves
 * the column now tracks the draft edit immediately, with no backend write (edits are
 * always-draft / local until Save).
 *
 * Drives the REAL UI (§Simulate-User): a genuine canvas right-click on a flying puck
 * opens the context menu; "Delete" removes the whole pairing-from-crew; the toolbar
 * Undo button reverts. Proof reads the actually-rendered left-panel mcred text
 * (`window.__ganttTest.rosterMcred()`), not an API call (§No-Illusion).
 */

interface RosterProbe {
  id: number
  pairingId: number
  crewId: string
  schStrDtUtc: string
  rowIndex: number
  scrollX: number
  scrollY: number
  pxPerHour: number
  rangeStartIso: string
  headerHeight: number
  rowHeight: number
}

/** Compute canvas click coordinates for a probed roster puck (mirrors roster-box-delete). */
const puckClickXY = (probe: RosterProbe): { x: number; y: number } => {
  const iso = probe.schStrDtUtc
  const ms = Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
  const rangeStartMs = Date.parse(probe.rangeStartIso)
  const x = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * probe.pxPerHour - probe.scrollX
  const rowTop = probe.headerHeight + probe.rowIndex * probe.rowHeight - probe.scrollY
  return { x: x + 6, y: rowTop + Math.floor(probe.rowHeight / 2) }
}

/** Right-click a roster puck; skip if its computed point falls outside the canvas. */
const rightClickPuck = async (canvas: Locator, probe: RosterProbe): Promise<void> => {
  const box = await canvas.boundingBox()
  const { x, y } = puckClickXY(probe)
  test.skip(!box || x < 0 || x > box.width - 4 || y < 0 || y > box.height - 4,
    'probed roster puck is outside the visible canvas')
  await canvas.click({ position: { x, y }, button: 'right' })
}

/** Displayed MCred text for a crew (the actually-rendered left-panel value), '' if none. */
const mcredFor = async (page: Page, crewId: string): Promise<string> => {
  const rows = await readHook<Array<{ crewId: string; mcred: string }>>(page, 'rosterMcred')
  return rows.find((r) => r.crewId === crewId)?.mcred ?? ''
}

// Regression guard: the browser/OS timezone must NOT determine which month MCred recomputes.
// Pin a host tz WEST of the display tz (Pacific). Before the fix, viewportYearMonth was read in
// the host tz, so viewing June resolved to "May" and a de-assign changed nothing; now it is read
// in the DISPLAY timezone, so the June edit moves MCred regardless of the host tz.
test.use({ timezoneId: 'America/Vancouver' })

test.describe('Live MCred draft recompute', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect.poll(async () => (await counts(page)).roster, {
      message: 'roster objects loaded',
      timeout: 30_000,
    }).toBeGreaterThan(0)
  })

  test('Live-1310 — de-assigning a flying pairing lowers MCred before Save; Undo restores it', async ({ page }) => {
    const probe = await readHook<RosterProbe | null>(page, 'rosterProbe')
    expect(probe, 'a visible roster puck belonging to a pairing exists').not.toBeNull()
    const crewId = probe!.crewId

    // MCred is async (post-first-paint). Wait until this crew's credit has loaded.
    await expect.poll(async () => mcredFor(page, crewId), {
      message: 'crew MCred loaded',
      timeout: 30_000,
    }).not.toBe('')
    const before = await mcredFor(page, crewId)

    // REAL canvas right-click → "Delete" removes the whole pairing-from-crew (a draft op).
    await rightClickPuck(dashboard.rosterCanvas, probe!)
    const del = page.getByRole('button', { name: /^Delete/ })
    await expect(del).toBeVisible({ timeout: 5_000 })
    await del.click()

    // The puck is gone (draft applied) ...
    await expect.poll(async () => {
      const items = await readHook<Array<{ id: number }>>(page, 'roster')
      return new Set(items.map((i) => i.id)).has(probe!.id)
    }, { message: 'de-assigned duty removed from roster', timeout: 10_000 }).toBe(false)

    // ... and MCred dropped immediately, with NO Save.
    let afterDelete = ''
    await expect.poll(async () => {
      afterDelete = await mcredFor(page, crewId)
      return afterDelete
    }, { message: 'MCred changed after de-assign (before save)', timeout: 10_000 }).not.toBe(before)
    expect(toMinutes(afterDelete), 'MCred decreased').toBeLessThan(toMinutes(before))

    // Undo reverts the optimistic delta back to the server base value.
    await page.getByTestId('draft-undo-btn').click()
    await expect.poll(async () => mcredFor(page, crewId), {
      message: 'MCred reverts on undo',
      timeout: 10_000,
    }).toBe(before)
  })
})

/** Parse a "H:MM" credit string to minutes for ordering assertions. */
const toMinutes = (hmm: string): number => {
  const [h, m] = hmm.split(':')
  return Number(h) * 60 + Number(m ?? 0)
}
