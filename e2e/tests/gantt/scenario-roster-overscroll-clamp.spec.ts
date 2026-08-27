/**
 * Regression: the Scenario Roster pane must not over-scroll past its last row.
 *
 * Bug report (zh): "检查Scenario Roster Pane 向下滑动时，底下出现一大段空白行，底下没数据
 * 就不应该继续往下滑动滚动条了" — scrolling down past the data leaves a big blank gap.
 *
 * Root cause: the scenario layout store's `setScrollY` only clamps `≥ 0` (it can't know the
 * viewport height). The Live roster pane compensates by clamping scrollY to `maxScroll` in
 * BOTH wheel handlers, but the scenario roster pane's `onScroll` (content canvas) and `onWheel`
 * (header) only clamped `≥ 0` — so a wheel-down pushed scrollY far past the last row, scrolling
 * the content up out of view and leaving blank space below it.
 *
 * Fix: scenario-roster-pane clamps the wheel target to [0, maxScroll] in both handlers
 * (same basis as PaneCanvas's scrollbar geometry: rowCount*ROW_HEIGHT − (height − HEADER_HEIGHT)).
 *
 * Proof model (§No-Illusion): drive a REAL wheel over the scenario roster canvas (goes through
 * the app's clamp path), then read the per-pane draw receipt (`__ganttTest.render()` → height /
 * totalRows for paneId 'roster-1') + the stored scrollY (`__ganttTest.scenarioPaneScrollY`).
 * Compute maxScroll from those and assert scrollY never exceeds it and no blank gap remains.
 * This test FAILS before the fix (scrollY ≈ 96000 ≫ maxScroll, blankBelowPx large).
 */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth, renderStats, type PaneRenderStat } from '../../utils/gantt-hook'

const DEMO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'
const DEMO_SCENARIO_ID = 6

const HEADER_HEIGHT = 30
const ROW_HEIGHT = 43

/** Many crew so content is taller than the viewport (scrollable) regardless of pane height. */
const CREW_COUNT = 80

const MOCK_GANTT_DATA = {
  scenarioId: DEMO_SCENARIO_ID,
  scenarioName: DEMO_SCENARIO_NAME,
  fileType: 'RO' as const,
  strDtLoc: '2026-03-01T00:00:00.000Z',
  endDtLoc: '2026-03-31T23:59:59.000Z',
  scenarioStrDt: '2026-03-01T00:00:00',
  scenarioEndDt: '2026-03-31T00:00:00',
  leadinLive: 1,
  dataSource: 'snapshot' as const,
  crew: Array.from({ length: CREW_COUNT }, (_, i) => ({
    crewId: `C${String(i + 1).padStart(4, '0')}`,
    base: 'YEG',
    division: 'Pilots',
    rank: i % 2 === 0 ? 'CA' : 'FO',
    seniorityNum: String(i + 1),
    crewName: `Crew ${i + 1}`,
  })),
  pairings: [],
  assignments: [],
  pairingSegments: [],
  flights: [],
  groundItems: [],
  crewStats: {},
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

type RosterMetric = {
  found: boolean
  scrollY: number
  totalRows: number
  viewportHeight: number
  contentHeight: number
  maxScroll: number
  scrollYExceedsMax: boolean
  blankBelowPx: number
}

const measureRoster = (page: Page, scenarioId: number): Promise<RosterMetric> =>
  page.evaluate(
    ({ HEADER_HEIGHT, ROW_HEIGHT, scenarioId }) => {
      const hook = (window as unknown as {
        __ganttTest?: {
          render: () => Array<{ paneId: string; paneType: string; totalRows: number; height: number }>
          scenarioPaneScrollY: (sid: number, paneId?: string) => number
        }
      }).__ganttTest
      const stat = (hook?.render?.() ?? []).find(
        (s) => s.paneId === 'roster-1' && s.paneType === 'scenario-roster',
      )
      const scrollY = hook?.scenarioPaneScrollY?.(scenarioId, 'roster-1') ?? 0
      if (!stat) {
        return { found: false, scrollY, totalRows: 0, viewportHeight: 0, contentHeight: 0, maxScroll: 0, scrollYExceedsMax: false, blankBelowPx: 0 }
      }
      const viewportHeight = stat.height - HEADER_HEIGHT
      const contentHeight = stat.totalRows * ROW_HEIGHT
      const maxScroll = Math.max(0, contentHeight - viewportHeight)
      const blankBelowPx = Math.max(0, viewportHeight - (contentHeight - scrollY))
      return {
        found: true,
        scrollY,
        totalRows: stat.totalRows,
        viewportHeight,
        contentHeight,
        maxScroll,
        scrollYExceedsMax: scrollY > maxScroll + 1, // +1px rounding tolerance
        blankBelowPx: Math.round(blankBelowPx),
      }
    },
    { HEADER_HEIGHT, ROW_HEIGHT, scenarioId },
  )

const wheelRosterToBottom = async (page: Page) => {
  const box = await page.locator('canvas[data-testid="scenario-roster-canvas"]').boundingBox()
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 16; i++) {
    await page.mouse.wheel(0, 6000)
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(250)
}

test.describe('Scenario Roster — wheel does not over-scroll past the last row', () => {
  test('Scen-2013 — wheeling to the bottom clamps scrollY to maxScroll (no blank gap below)', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    await page.route(`**/api/scenario/${DEMO_SCENARIO_ID}/gantt-data`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: MOCK_GANTT_DATA, message: 'ok' }),
      }),
    )
    await page.route(`**/api/scenario/${DEMO_SCENARIO_ID}/lock-status`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: MOCK_LOCK_STATUS, message: 'ok' }),
      }),
    )

    // ── Step 1: open the demo scenario; the shared PaneCanvas draws the 80 crew rows ──
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    // Demo DB has several copies named DEMO_SCENARIO_NAME (#6/#460/#467) → search + pin by id.
    const item = await scenario.scenarioRow(DEMO_SCENARIO_ID, DEMO_SCENARIO_NAME)
    await item.click()
    await expect(scenario.detailPanel).toBeVisible()
    await scenario.detailPanel.getByTestId('scenario-open-btn').click()

    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })

    // Wait until the canvas published its crew rows (content taller than the viewport).
    await expect
      .poll(async () => (await measureRoster(page, DEMO_SCENARIO_ID)).totalRows, { timeout: 15_000 })
      .toBe(CREW_COUNT)

    const before = await measureRoster(page, DEMO_SCENARIO_ID)
    expect(before.found, 'scenario roster pane present').toBe(true)
    expect(before.contentHeight, 'content taller than viewport (scrollable)').toBeGreaterThan(before.viewportHeight)
    expect(before.scrollY, 'starts at top').toBe(0)

    // ── Step 2: wheel hard to the bottom — must clamp, not overscroll ──
    await wheelRosterToBottom(page)

    const after = await measureRoster(page, DEMO_SCENARIO_ID)
    // The bug: scrollY (only clamped ≥ 0) blows past maxScroll → blank rows below the data.
    expect(after.scrollYExceedsMax, `scrollY ${after.scrollY} must not exceed maxScroll ${after.maxScroll}`).toBe(false)
    expect(after.blankBelowPx, 'no blank gap below the last roster row').toBe(0)
    // And the wheel actually reached (near) the bottom — proves we clamped AT the end, not before it.
    expect(after.scrollY, 'scrolled to (near) the bottom').toBeGreaterThanOrEqual(after.maxScroll - ROW_HEIGHT)
  })
})
