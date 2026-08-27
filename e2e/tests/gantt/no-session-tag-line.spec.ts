/**
 * Regression test — bug 103: orange vertical line at the left edge of the pane canvases.
 *
 * Root cause (NOT the grid line, NOT the red NOW line): the per-row "session tag" bar.
 * `crew-store.fetchCrews` tags every crew with sessionTags=[1]; session 1 === SESSION_COLORS[0]
 * === '#f97316' (orange). roster-renderer / pairing-renderer drew a 4px-wide bar at canvas x=0
 * for every visible row, so in the common single-session view they stacked into one solid
 * orange vertical line down the left edge — carrying no information (every row identical).
 *
 * Fix: session tag bars are only meaningful when 2+ query sessions exist (append mode).
 * Both renderers now gate the bar behind `showSessionTags = sessions.length > 1`.
 *
 * This test loads the default Live view (single session) and asserts the canvas left edge
 * (x = 0..6) has NO solid orange vertical line. It is theme-independent — the session color
 * is hardcoded, not a --gantt-* var — so the previous theme-only fixes never caught it.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, waitGanttReady } from '../../utils/gantt-hook'

test.describe('Gantt — no session-tag line in single-session view (bug 103)', () => {
  test('Live-1106 — left edge has no solid orange vertical line @smoke', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page)
    await page.waitForTimeout(300)

    const result = await page.evaluate(() => {
      // #f97316 = rgb(249,115,22): high red, mid green, low blue. Detect that hue robustly.
      const isOrange = (r: number, g: number, b: number): boolean =>
        r > 200 && g > 80 && g < 170 && b < 90 && r - b > 120

      const report: { id: string; orangeFraction: number; worstX: number }[] = []
      for (const testId of ['roster-canvas', 'pairing-canvas']) {
        const canvas = document.querySelector<HTMLCanvasElement>(`canvas[data-testid="${testId}"]`)
        if (!canvas) continue
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        const w = canvas.width, h = canvas.height
        if (w === 0 || h === 0) continue
        const img = ctx.getImageData(0, 0, w, h).data

        // Scan the first 7 px columns (the 4px bar lives at x=0..3 in CSS px → 0..7 at dpr=2).
        // For each, measure the fraction of the lower body (below the header) that is orange.
        const yTop = Math.floor(h * 0.25), yBot = Math.floor(h * 0.95)
        let worstFraction = 0, worstX = -1
        for (let x = 0; x < Math.min(8, w); x++) {
          let orange = 0, total = 0
          for (let y = yTop; y < yBot; y++) {
            const i = (y * w + x) * 4
            if (isOrange(img[i], img[i + 1], img[i + 2])) orange++
            total++
          }
          const frac = total ? orange / total : 0
          if (frac > worstFraction) { worstFraction = frac; worstX = x }
        }
        report.push({ id: testId, orangeFraction: worstFraction, worstX })
      }
      return report
    })

    // Sanity: the canvases must actually exist and have been scanned.
    expect(result.length, 'no pane canvases found to scan').toBeGreaterThan(0)

    for (const r of result) {
      // A solid session-tag line covers nearly the whole column. Anything above 15%
      // indicates the orange bar is back. Genuine orange pucks are short and won't
      // line up into a single near-full column at the very left edge.
      expect(
        r.orangeFraction,
        `${r.id}: solid orange vertical line at x=${r.worstX} (covers ${(r.orangeFraction * 100).toFixed(0)}% of column) — session-tag bar leaked into single-session view`,
      ).toBeLessThan(0.15)
    }
  })
})
