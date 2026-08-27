import { test, expect, type Locator, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'

/**
 * Box-select → right-click → Delete removes the WHOLE selection.
 *
 * Reported behaviour: "drag a box to select multiple duties, right-click any
 * puck → Delete should delete all of them." Before the fix, right-clicking a
 * puck always called selectTask(clicked) — collapsing the box-selection down to
 * the single clicked puck — and Delete then removed only that one duty (or its
 * pairing). This test seeds a multi-selection (the exact output of a box-drag:
 * selectTasks(ids)), then does a REAL canvas right-click on a selected puck and
 * a REAL "Delete N Tasks" menu click, asserting every selected duty is gone.
 *
 * Pre-fix this FAILS twice: the menu shows "Delete" (not "Delete N Tasks"), and
 * the second selected duty (different crew) survives.
 *
 * Edits are local (always-draft) so nothing is written to the backend.
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

interface RosterItem {
  id: number
  crewId: string
  pairingId: number | null
}

/** Compute canvas click coordinates for a probed roster puck (mirrors locate-pairing). */
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

const selection = (page: Page): Promise<number[]> => readHook<number[]>(page, 'selectedTaskIds')

const setSelection = (page: Page, ids: number[]): Promise<void> =>
  page.evaluate((arg) => {
    (window.__ganttTest as unknown as { selectRosterTasks: (i: number[]) => void }).selectRosterTasks(arg)
  }, ids)

const rosterItems = (page: Page): Promise<RosterItem[]> => readHook<RosterItem[]>(page, 'roster')

test.describe('Roster box-select Delete', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    // Wide viewport → wider canvas time window → more pucks clickable.
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect.poll(async () => (await counts(page)).roster, {
      message: 'roster objects loaded',
      timeout: 30_000,
    }).toBeGreaterThan(0)
  })

  test('Live-1272 — box-select two duties, right-click a selected puck → "Delete 2 Tasks" removes both', async ({ page }) => {
    const probe = await readHook<RosterProbe | null>(page, 'rosterProbe')
    expect(probe, 'a visible roster puck belonging to a pairing exists').not.toBeNull()

    // Pick a SECOND duty from a different crew than the probed puck, so a pre-fix
    // single-delete (which only touches the clicked puck's pairing) would leave it behind.
    const items = await rosterItems(page)
    const second = items.find((i) => i.crewId !== probe!.crewId && i.id !== probe!.id)
    test.skip(!second, 'no second duty on a different crew to multi-select')

    await setSelection(page, [probe!.id, second!.id])
    expect((await selection(page)).sort(), 'both duties selected before right-click')
      .toEqual([probe!.id, second!.id].sort())

    await rightClickPuck(dashboard.rosterCanvas, probe!)

    // Core regression #1: the menu acts on the whole selection (label carries the count),
    // proving the right-click did NOT collapse the box-selection to the single clicked puck.
    const del = page.getByRole('button', { name: 'Delete 2 Tasks' })
    await expect(del).toBeVisible({ timeout: 5_000 })
    await del.click()

    // Core regression #2: BOTH selected duties are gone (pre-fix the other-crew duty survives).
    await expect.poll(async () => {
      const ids = new Set((await rosterItems(page)).map((i) => i.id))
      return ids.has(probe!.id) || ids.has(second!.id)
    }, { message: 'both box-selected duties removed', timeout: 10_000 }).toBe(false)
  })

  test('Live-1273 — right-clicking a puck OUTSIDE the box-selection deletes only that puck', async ({ page }) => {
    const probe = await readHook<RosterProbe | null>(page, 'rosterProbe')
    expect(probe, 'a visible roster puck belonging to a pairing exists').not.toBeNull()

    // Seed a multi-selection of OTHER duties (not the probed puck) on different crews.
    const items = await rosterItems(page)
    const others = items.filter((i) => i.crewId !== probe!.crewId && i.id !== probe!.id).slice(0, 2)
    test.skip(others.length < 2, 'need 2 other-crew duties to seed a stray selection')
    await setSelection(page, others.map((i) => i.id))

    // Right-clicking a puck that is NOT part of the selection must offer plain "Delete"
    // (single-puck), never "Delete N Tasks". (Accessible name carries the "Del" shortcut,
    // so match by substring, not exact.)
    await rightClickPuck(dashboard.rosterCanvas, probe!)
    const delBtn = page.getByRole('button', { name: 'Delete' })
    await expect(delBtn).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: /Delete \d+ Tasks/ })).toHaveCount(0)

    await delBtn.click()

    // The two stray-selected duties are untouched; only the clicked puck's pairing went away.
    await expect.poll(async () => {
      const ids = new Set((await rosterItems(page)).map((i) => i.id))
      return ids.has(probe!.id)
    }, { message: 'clicked puck removed', timeout: 10_000 }).toBe(false)
    const afterIds = new Set((await rosterItems(page)).map((i) => i.id))
    expect(others.every((o) => afterIds.has(o.id)), 'stray-selected duties untouched').toBe(true)
  })
})
