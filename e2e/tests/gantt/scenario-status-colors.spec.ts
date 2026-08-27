import { test, expect } from '@playwright/test'
import { gotoScenarioList } from '../../pages/gantt/scenario-nav'
import { seedGanttAuth } from '../../utils/gantt-hook'

/**
 * Scenario status lifecycle — each status dot must have a DISTINCT, visually
 * separable colour.
 *
 * Regression intent (2026-06-12 request): "resign according to status, avoid
 * duplicate color". Before the fix RUNNING used `bg-blue-500` and PUBLISHED used
 * `bg-primary` — and in the default theme `bg-primary` resolves to rgb(7,104,223),
 * a blue at hue ~213° while blue-500 sits at hue ~216°. The two were different
 * exact RGB values but the SAME blue to the eye (Δhue ~3°), so a naive
 * "distinct rgb" check would NOT have caught it. PUBLISHED is now violet
 * (hue ~261°, Δhue ~45° from RUNNING).
 *
 * This test normalises every dot colour to RGB (status utilities ship as oklch in
 * Tailwind v4, theme tokens as rgb — canvas paints both to a common rgb), then
 * asserts the RUNNING vs PUBLISHED hue distance clears a 25° visual-separation
 * threshold. It fails at Δhue ~3° (pre-fix) and passes at ~45° (post-fix).
 */

const STATUSES = ['DRAFT', 'RUNNING', 'DONE', 'FAILED', 'PUBLISHED'] as const

const makeItem = (id: number, status: string) => ({
  id,
  name: `e2e-${status}`,
  fileType: 'PO',
  status,
  strDtLoc: '2026-06-01',
  endDtLoc: '2026-06-07',
  optimizedCount: 0,
  leadinLive: 0,
  updatedBy: 'e2e',
  updatedAt: '2026-06-12T00:00:00.000Z',
})

/** Circular distance between two hue angles in degrees (0..180). */
const hueDistance = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** HSL hue (0..360) from an [r,g,b] triple. */
const rgbToHue = ([r, g, b]: [number, number, number]): number => {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const c = max - min
  if (c === 0) return 0
  let h: number
  if (max === rn) h = ((gn - bn) / c) % 6
  else if (max === gn) h = (bn - rn) / c + 2
  else h = (rn - gn) / c + 4
  h *= 60
  return h < 0 ? h + 360 : h
}

test.describe('Scenario status colours', () => {
  test('Scen-2028 — RUNNING and PUBLISHED are different hues, all five dots distinct', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    // Return one scenario per status so all five dots render at once.
    await page.route(/\/api\/scenario(\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          message: 'ok',
          data: {
            items: STATUSES.map((s, i) => makeItem(1000 + i, s)),
            total: STATUSES.length,
            page: 1,
            pageSize: 50,
            totalPages: 1,
          },
        }),
      }),
    )

    await page.goto('/altair/')
    await page.waitForLoadState('networkidle')
    await gotoScenarioList(page)

    await expect(page.getByTestId('scenario-list-item').first()).toBeVisible({ timeout: 30_000 })

    // Read each dot's computed colour and normalise to [r,g,b] via a canvas so
    // oklch utilities and rgb theme tokens land in one comparable space.
    const rgb: Record<string, [number, number, number]> = {}
    for (const status of STATUSES) {
      const dot = page.locator(`[data-testid="scenario-item-status-dot"][data-status="${status}"]`)
      await expect(dot).toBeVisible()
      rgb[status] = await dot.evaluate((el) => {
        const css = getComputedStyle(el).backgroundColor
        const c = document.createElement('canvas')
        c.width = c.height = 1
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#000'
        ctx.fillStyle = css
        ctx.fillRect(0, 0, 1, 1)
        const d = ctx.getImageData(0, 0, 1, 1).data
        return [d[0], d[1], d[2]] as [number, number, number]
      })
    }

    // The bug: RUNNING (blue ~216°) and PUBLISHED (blue ~213° pre-fix) were the
    // same blue. PUBLISHED now uses an unused hue (amber ~38°), so require a real
    // hue gap from every other CHROMATIC lifecycle colour — not just RUNNING.
    // DRAFT is intentionally excluded: it is a desaturated grey with no stable hue.
    const publishedHue = rgbToHue(rgb.PUBLISHED)
    for (const other of ['RUNNING', 'DONE', 'FAILED'] as const) {
      const dHue = hueDistance(publishedHue, rgbToHue(rgb[other]))
      expect(
        dHue,
        `PUBLISHED ${JSON.stringify(rgb.PUBLISHED)} must be a different hue from ${other} ${JSON.stringify(rgb[other])} (Δ=${dHue.toFixed(1)}°)`,
      ).toBeGreaterThanOrEqual(25)
    }

    // Secondary guard: all five lifecycle colours are mutually distinct rgb.
    const keys = STATUSES.map((s) => rgb[s].join(','))
    expect(new Set(keys).size, `expected 5 distinct status colours, got ${JSON.stringify(rgb)}`).toBe(STATUSES.length)
  })
})
