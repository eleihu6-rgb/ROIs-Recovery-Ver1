/**
 * V4-P10 regression: loadMore paths must not log filter payloads (data-security rule).
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, counts, waitGanttReady } from '../../utils/gantt-hook'

test('Live-1171 — scroll-to-bottom loadMore emits no payload-bearing console logs', async ({ page, request }) => {
  const offending: string[] = []
  page.on('console', (msg) => {
    const t = msg.text()
    if (/\[CrewStore\] loadMore (called|replace mode|params|result)/.test(t)) offending.push(t)
    if (/\[PairingPane\] triggering loadMore/.test(t)) offending.push(t)
  })

  await seedGanttAuth(page, request)
  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto()
  await waitGanttReady(page)

  const before = await counts(page)
  expect(before.roster, 'roster data loaded').toBeGreaterThan(0)

  const box = await dashboard.rosterCanvas.boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 800)
  }
  // Fixed wait: absence-of-event detection (console listener above) needs
  // a stable window to confirm no logs were emitted post-scroll.
  await page.waitForTimeout(1500)

  expect(offending, `leaked logs:\n${offending.join('\n')}`).toHaveLength(0)
})
