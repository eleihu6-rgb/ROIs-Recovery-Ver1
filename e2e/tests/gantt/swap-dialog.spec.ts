import { test, expect, type Locator, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'

/**
 * Swap dialog (gantt/src/components/roster/swap-dialog.tsx).
 *
 * Reached via right-click on a roster puck → "Swap Task". Entering a target task id
 * and confirming swaps the two duties' crew assignments. swapTasks runs through the
 * always-draft store, so the swap is LOCAL (crewIds exchanged in memory, no backend
 * write) — nothing to clean up.
 *
 * We assert the actual exchange: after the swap, source task carries the target's
 * crew and the target task carries the source's crew. A "dialog opened" check would
 * not prove the swap happened; reading the exchanged crew ids back does.
 */
interface RosterProbe {
  id: number; pairingId: number; crewId: string; schStrDtUtc: string; rowIndex: number
  scrollX: number; scrollY: number; pxPerHour: number; rangeStartIso: string
  headerHeight: number; rowHeight: number
}
interface RosterItem { id: number; crewId: string; pairingId: number | null }

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

const rosterItems = (page: Page): Promise<RosterItem[]> => readHook<RosterItem[]>(page, 'roster')
const crewOf = async (page: Page, id: number): Promise<string | undefined> =>
  (await rosterItems(page)).find((i) => i.id === id)?.crewId

test.describe('Swap dialog', () => {
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

  test('Swap-1 — swapping two duties exchanges their crew assignments', async ({ page }) => {
    const probe = await readHook<RosterProbe | null>(page, 'rosterProbe')
    expect(probe, 'a visible roster puck belonging to a pairing exists').not.toBeNull()

    // Target = a different real (positive-id) duty on a different crew.
    const items = await rosterItems(page)
    const target = items.find((i) => i.id > 0 && i.id !== probe!.id && i.crewId !== probe!.crewId)
    test.skip(!target, 'no second duty on a different crew to swap with')

    const sourceCrew = probe!.crewId
    const targetCrew = target!.crewId

    await rightClickPuck(dashboard.rosterCanvas, probe!)
    await page.getByRole('button', { name: /Swap Task/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Swap Tasks')).toBeVisible({ timeout: 5_000 })
    // Source line identifies the duty we right-clicked.
    await expect(dialog.getByText(new RegExp(`#${probe!.id}\\b`))).toBeVisible()

    await dialog.getByPlaceholder('Enter task ID').fill(String(target!.id))
    await dialog.getByRole('button', { name: 'Swap', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // The two duties have exchanged crews in the store the canvas draws from.
    await expect.poll(() => crewOf(page, probe!.id), {
      message: 'source duty now carries the target crew',
      timeout: 10_000,
    }).toBe(targetCrew)
    expect(await crewOf(page, target!.id), 'target duty now carries the source crew').toBe(sourceCrew)
  })
})
