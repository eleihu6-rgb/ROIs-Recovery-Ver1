/**
 * Live-1320 — the dynamic-rule-set recheck surfaces violations under the CURRENT
 * instance code in the real Alert Center.
 *
 * Background: the recheck engine used to hardcode each rule's instance (8002 → '006').
 * After the rule set renamed every instance to '001', the recheck silently fell back to a
 * hardcoded cap and tagged violations '006' — which the gantt (grouping by the current
 * '001') could never match, so the bell/Alert Center looked empty/stale. The fix resolves
 * the instance + params dynamically from the rule set (resolveRulesetRules by ruleset_id)
 * and tags each finding with the resolved instance ('001') + a per-window scope_key.
 *
 * This test proves the USER-VISIBLE outcome: after a live recheck of the default rule set,
 * the gantt Alert Center, grouped by Rule, shows an "8002/001" group with a real,
 * row-backed count — i.e. the dynamically-tagged instance reaches the planner's screen.
 * (The recheck WRITE path itself is proven by the live-server unit tests + the real-DB
 * recheck receipt; here we assert the read side a planner actually sees, §No-Illusion.)
 *
 * Run alone:
 *   cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test \
 *     --config=config/playwright.config.ts --project=gantt \
 *     tests/gantt/legality-dynamic-instance-recheck.spec.ts --no-deps --reporter=list
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

type LiveViol = { ruleCode: string }

/** 8002 violation count from the gantt hook — used only to know the async stream has settled. */
const hook8002 = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const t = (window as unknown as { __ganttTest?: { liveViolations?: () => LiveViol[] } }).__ganttTest
    return (t?.liveViolations?.() ?? []).filter((v) => v.ruleCode === '8002').length
  })

const waitStreamSettled = async (page: Page, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  let last = -1
  let stableSince = 0
  while (Date.now() < deadline) {
    const n = await hook8002(page)
    if (n > 0 && n === last) {
      if (stableSince === 0) stableSince = Date.now()
      if (Date.now() - stableSince >= 3000) return
    } else {
      stableSince = 0
    }
    last = n
    await new Promise((r) => setTimeout(r, 1000))
  }
}

test('Live-1320 Alert Center shows 8002 under the current instance 8002/001 (dynamic recheck)', async ({ page, request }) => {
  test.setTimeout(180_000)
  await seedGanttAuth(page, request)
  await gotoGantt(page)
  await waitStreamSettled(page, 90_000)

  // Open the Alert Center and group by Rule.
  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await dialog.getByTestId('alert-groupby-rule').click()

  // The 8002 group must appear under the CURRENT instance code (8002/001), not the old 8002/006.
  const group001 = dialog.locator('[data-testid="alert-group-item"]', { hasText: '8002/001' })
  await expect(group001, '8002/001 group missing — recheck did not tag the current instance').toHaveCount(1)
  const group006 = dialog.locator('[data-testid="alert-group-item"]', { hasText: '8002/006' })
  await expect(group006, 'stale 8002/006 group should not exist').toHaveCount(0)

  // The group's badge count must match its (non-virtualized) rows — real data, not just visible.
  const badge = (await group001.first().locator('span').last().innerText()).trim()
  const count = parseInt(badge, 10)
  expect(Number.isFinite(count) && count > 0, `8002/001 badge "${badge}" must be a positive count`).toBeTruthy()
  await group001.first().click()
  const rows = dialog.locator('[data-testid="violation-list-row"][data-rule-id="8002/001"]')
  await expect.poll(() => rows.count(), { timeout: 10_000, intervals: [500] }).toBe(count)

  await page.getByTestId('violation-list-dialog-close').click()
})
