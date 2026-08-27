import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../utils/gantt-hook'

/**
 * IMP-sourced roster rows are immutable in the Live Gantt:
 * Edit and Swap remain disabled; Ground Editor can be opened in view-only mode;
 * Delete remains enabled. Drag-move is still blocked.
 *
 * This test right-clicks a known IMP-sourced roster puck and checks the
 * context menu state. The `data-roster-source` attribute on the context menu
 * container identifies the source of the right-clicked task.
 */

interface RosterItem {
  id: number
  crewId: string
  pairingId: number | null
  source: string | null
  schStrDtUtc: string | null
}

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

/** Compute canvas click coordinates for a probed roster puck. */
const puckClickXY = (probe: RosterProbe): { x: number; y: number } => {
  const iso = probe.schStrDtUtc
  const ms = Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
  const rangeStartMs = Date.parse(probe.rangeStartIso)
  const x = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * probe.pxPerHour - probe.scrollX
  const rowTop = probe.headerHeight + probe.rowIndex * probe.rowHeight - probe.scrollY
  return { x: x + 6, y: rowTop + Math.floor(probe.rowHeight / 2) }
}

test.describe('IMP roster row immutability', () => {
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

  test('IMP-sourced roster row has Edit/Swap disabled, Delete enabled in context menu', async ({ page }) => {
    // Find an IMP-sourced roster item via the test hook.
    const items = await readHook<RosterItem[]>(page, 'roster')
    const impItem = items.find((i) => i.source === 'IMP' && i.pairingId != null && i.schStrDtUtc)
    test.skip(!impItem, 'no IMP-sourced flying roster item found in loaded data')

    // Get a probe for the IMP puck so we can compute its canvas coordinates.
    // We use the generic rosterProbe which returns the first visible puck —
    // but we need the specific IMP puck's coordinates. Instead, compute them
    // from the item data and the canvas state.
    const probe = await readHook<RosterProbe | null>(page, 'rosterProbe')
    test.skip(!probe, 'no visible roster puck found on canvas')

    // Get all visible roster items to find the IMP one's position.
    // We build an IMP-specific probe from the item's data and the shared canvas state.
    const impProbe: RosterProbe = {
      id: impItem.id,
      pairingId: impItem.pairingId!,
      crewId: impItem.crewId,
      schStrDtUtc: impItem.schStrDtUtc!,
      rowIndex: probe.rowIndex, // approximate — will use scrollX/pxPerHour from the real probe
      scrollX: probe.scrollX,
      scrollY: probe.scrollY,
      pxPerHour: probe.pxPerHour,
      rangeStartIso: probe.rangeStartIso,
      headerHeight: probe.headerHeight,
      rowHeight: probe.rowHeight,
    }

    // Find the correct rowIndex by looking up the crew in the panel row order.
    const panelRows = await readHook<Array<{ crewId: string; seniority: string }>>(page, 'rosterPanel')
    const impRowIdx = panelRows.findIndex((r) => r.crewId === impItem.crewId)
    test.skip(impRowIdx < 0, `IMP crew ${impItem.crewId} not found in visible panel rows`)
    impProbe.rowIndex = impRowIdx

    // Compute click coordinates and right-click the IMP puck.
    const canvas = dashboard.rosterCanvas
    const canvasBox = await canvas.boundingBox()
    test.skip(!canvasBox, 'roster canvas not visible')

    const { x, y } = puckClickXY(impProbe)
    test.skip(x < 0 || x > canvasBox.width - 4 || y < 0 || y > canvasBox.height - 4,
      'IMP roster puck is outside the visible canvas area')

    await canvas.click({ position: { x, y }, button: 'right' })

    // Verify context menu appears with IMP source attribute.
    const menu = page.locator('[data-roster-source="IMP"]')
    await expect(menu).toBeVisible({ timeout: 5_000 })

    // Edit Task should be disabled.
    const editBtn = menu.getByText(/Edit Task/i)
    await expect(editBtn).toBeDisabled()

    // Swap Task should be disabled.
    const swapBtn = menu.getByText(/Swap Task/i)
    await expect(swapBtn).toBeDisabled()

    // Delete should remain enabled.
    const deleteBtn = menu.getByText(/Delete/i)
    await expect(deleteBtn).toBeEnabled()
  })

})
