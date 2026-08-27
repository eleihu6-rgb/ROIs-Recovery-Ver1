import { test, expect, type Locator, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'

/**
 * Task Detail dialog (gantt/src/components/roster/task-detail-dialog.tsx).
 *
 * Reached via right-click on a roster flight/pairing puck → "Edit Task". The only
 * editable field is the comment. updateTask runs through the always-draft store, so
 * the edit is LOCAL (no backend write) — nothing to clean up.
 *
 * We prove a real edit round-trip: type a unique comment, Save, reopen the same task,
 * and read the comment back from the dialog. A "dialog is visible" check would not
 * prove the edit was applied; reopening and reading the value does.
 */
interface RosterProbe {
  id: number; pairingId: number; crewId: string; schStrDtUtc: string; rowIndex: number
  scrollX: number; scrollY: number; pxPerHour: number; rangeStartIso: string
  headerHeight: number; rowHeight: number
}

const puckClickXY = (probe: RosterProbe): { x: number; y: number } => {
  const iso = probe.schStrDtUtc
  const ms = Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
  const rangeStartMs = Date.parse(probe.rangeStartIso)
  const x = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * probe.pxPerHour - probe.scrollX
  const rowTop = probe.headerHeight + probe.rowIndex * probe.rowHeight - probe.scrollY
  return { x: x + 6, y: rowTop + Math.floor(probe.rowHeight / 2) }
}

const rightClickPuck = async (canvas: Locator, probe: RosterProbe): Promise<void> => {
  const box = await canvas.boundingBox()
  const { x, y } = puckClickXY(probe)
  test.skip(!box || x < 0 || x > box.width - 4 || y < 0 || y > box.height - 4,
    'probed roster puck is outside the visible canvas')
  await canvas.click({ position: { x, y }, button: 'right' })
}

const openEditTask = async (dashboard: GanttDashboardPage, probe: RosterProbe): Promise<void> => {
  await rightClickPuck(dashboard.rosterCanvas, probe)
  await dashboard.page.getByRole('button', { name: /Edit Task/ }).click()
  await expect(dashboard.page.getByRole('dialog').getByText('Task Detail')).toBeVisible({ timeout: 5_000 })
}

test.describe('Task Detail dialog', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect
      .poll(async () => (await counts(page)).roster, { message: 'roster loaded', timeout: 30_000 })
      .toBeGreaterThan(0)
  })

  test('TaskDetail-1 — edit a flight task comment, Save, reopen shows the new comment', async ({ page }) => {
    const probe = await readHook<RosterProbe | null>(page, 'rosterProbe')
    expect(probe, 'a visible roster puck belonging to a pairing exists').not.toBeNull()

    const newComment = `E2E-TD-${Date.now()}`

    // Open the detail editor for the probed flight duty.
    await openEditTask(dashboard, probe!)
    const dialog = page.getByRole('dialog')
    // Sanity: this is the duty we right-clicked (crew matches the probe).
    await expect(dialog.getByText(probe!.crewId, { exact: true })).toBeVisible()

    // Edit the only editable field and persist (draft-local).
    const commentInput = dialog.getByPlaceholder('Add comments...')
    await commentInput.fill(newComment)
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Reopen the SAME duty → the dialog reflects the saved comment (round-trip proof).
    await openEditTask(dashboard, probe!)
    await expect(page.getByRole('dialog').getByPlaceholder('Add comments...')).toHaveValue(newComment)
  })
})
