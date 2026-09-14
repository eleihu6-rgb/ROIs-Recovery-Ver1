/**
 * Roster-pane puck text is WIDTH-RESPONSIVE and never overlaps (Ryan 2026-09-13:
 * "simpify info when the puck is too narrow, current overlapping, cannot see the details" /
 * "puck info showing should be puck size -width responsive"). His screenshot was the ROSTER
 * pane, where "NOS 15:45 ET836 ADD 19:45" was piled on top of itself in a narrow puck.
 *
 * The fix (roster-renderer.ts drawRosterPuck) measures the dep/arv columns against the
 * centered flt_num and degrades as the puck narrows: airport+time each side → airports only
 * → flt_num only, so text never collides. This mirrors the Flight pane's drawFullPuck
 * (§Gantt-Unify) with roster fonts and the two-line dep/arv layout.
 *
 * Also validates Ryan's ghost-label change (2026-09-13: "change text sched to STD, showing
 * schedule timing is more informative"): the roster delay ghost reuses the shared
 * drawDelayGhost, whose head label is now "STD HH:MM" (was "HH:MM sched").
 *
 * Puck text is Canvas-rendered (not DOM), so per §PW-Snapshot the proof is the captured,
 * visually-inspected screenshots at descending zoom levels — one per responsive tier.
 *
 * Fixture: roster_flight.id=1328507 / crew_id='1168' / pairing_id=14968 — flight 502
 * (YXX->YYC, 2026-08-01), the same naturally-occurring 60min-dep delay used by
 * roster-delay-ghost-bar.spec.ts. Reused as-is (no new DB row) per Ryan's fixture guidance.
 */
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, setDateRange } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const shot = (name: string): string =>
  path.resolve(__dirname, `../../../docs/assets/screenshots/gantt/${name}`)

const ROSTER_ITEM_ID = 1328507
const CREW_ID = '1168'

// Large-delay fixture for the STD-label capture: 1439min (~24h) dep delay makes the ghost head
// wide enough that "STD HH:MM" renders in full (the 60min fixture's ghost clips the prefix).
// Same row used by roster-delay-ghost-bar.spec.ts (roster_flight 1309635 / crew 2292, 2026-06-22).
const STD_ITEM_ID = 1309635
const STD_CREW_ID = '2292'

const applyCrewFilter = (page: Page, filter: { crewIds?: string[] }): Promise<void> =>
  page.evaluate(
    (f) => (window.__ganttTest as unknown as { applyCrewFilter: (x: typeof f) => Promise<void> }).applyCrewFilter(f),
    filter,
  )

const setZoom = (page: Page, pxPerHour: number): Promise<void> =>
  page.evaluate((px) => (window.__ganttTest as unknown as { setZoom: (n: number) => void }).setZoom(px), pxPerHour)

const focusRosterItem = (
  page: Page,
  itemId: number,
): Promise<{ id: number; pairingId: number | null; crewId: string; x: number; y: number } | null> =>
  page.evaluate(
    (id) =>
      (window.__ganttTest as unknown as {
        focusRosterItem: (n: number) => { id: number; pairingId: number | null; crewId: string; x: number; y: number } | null
      }).focusRosterItem(id),
    itemId,
  )

const settleFrame = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))

test.describe('Roster pane — puck width-responsive text (no overlap)', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await setDateRange(page, '2026-07-31T00:00:00.000Z', '2026-08-02T00:00:00.000Z')
    await applyCrewFilter(page, { crewIds: [CREW_ID] })
  })

  test('Live-puck-responsive — roster puck text degrades across zoom tiers without overlapping', async ({ page }) => {
    const canvas = page.locator('canvas[data-testid="roster-canvas"]')
    await expect(canvas).toBeVisible()

    // FULL (≥60px): wide zoom — airport + time on both sides plus centered flt_num.
    // PARTIAL/degraded: airports-only, then flt_num-only as the puck narrows.
    // Each tier is a separate versioned capture, cropped to the focused crew row.
    const tiers: Array<{ zoom: number; label: string }> = [
      { zoom: 90, label: 'z90-full' },
      { zoom: 40, label: 'z40-airports' },
      { zoom: 18, label: 'z18-minimal' },
    ]

    for (const { zoom, label } of tiers) {
      await setZoom(page, zoom)
      await settleFrame(page)
      const focus = await focusRosterItem(page, ROSTER_ITEM_ID)
      expect(focus, `focus roster item ${ROSTER_ITEM_ID} @zoom ${zoom}`).not.toBeNull()

      const box = await canvas.boundingBox()
      expect(box).not.toBeNull()

      // Crop a wide band around the focused crew row so several pucks (the whole pairing) are
      // visible — overlap, if any, shows up as text piled on itself.
      const rowY = box!.y + focus!.y
      await page.screenshot({
        path: shot(`roster-puck-width-responsive-Ver1-${label}.png`),
        clip: {
          x: box!.x,
          y: Math.max(box!.y, rowY - 24),
          width: box!.width,
          height: 48,
        },
      })
    }
  })

  test('Live-ghost-STD — roster delay ghost head reads "STD HH:MM" (was "HH:MM sched")', async ({ page }) => {
    // Re-target to the large-delay fixture (its ghost is ~24h wide, so the "STD HH:MM" label
    // never clips) — overrides the beforeEach date range / crew filter.
    await setDateRange(page, '2026-06-21T00:00:00.000Z', '2026-06-23T00:00:00.000Z')
    await applyCrewFilter(page, { crewIds: [STD_CREW_ID] })
    await setZoom(page, 30)
    await settleFrame(page)
    const focus = await focusRosterItem(page, STD_ITEM_ID)
    expect(focus, `focus roster item ${STD_ITEM_ID}`).not.toBeNull()

    const canvas = page.locator('canvas[data-testid="roster-canvas"]')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()

    // Ghost head starts at the scheduled dep, ~6px left of the focus anchor (focusRosterItem
    // lands 6px into the box from schStr). Crop the head; its "STD HH:MM" label sits at +4px.
    const schedStrXLocal = focus!.x - 6
    const rowY = box!.y + focus!.y
    await page.screenshot({
      path: shot('roster-ghost-std-label-Ver1.png'),
      clip: {
        x: box!.x + Math.max(0, schedStrXLocal - 20),
        y: Math.max(box!.y, rowY - 18),
        width: 260,
        height: 36,
      },
    })
  })
})
