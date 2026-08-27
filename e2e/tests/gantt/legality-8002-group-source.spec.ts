/**
 * Rule 8002 — the persisted-violation bell/Alert Center must follow the TOOLBAR's rule
 * group (useRuleCheckStore.ruleGroupCode), which since the Model B drop is a RULE workset
 * id (the gantt default = '103'). There is no longer a separate Rule-management page
 * selection to diverge from (Model B's rule-config store was removed), so the surviving
 * invariant is simply: the bell sources its group from the toolbar store, and the
 * persisted 8002 violations surface for that group.
 *
 * Field regression context: a planner once saw an empty Alert Center because the bell
 * read a divergent (now-deleted) config store instead of the toolbar group. With the
 * config store gone, this test asserts the toolbar group is the workset default and the
 * 8002 bells are present.
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth, gotoGantt, waitGanttReady } from '../../utils/gantt-hook'

type Hook = {
  selectedCrewCount: () => number
  crewViolationSeverities: () => Array<{ crewId: string; severity: number }>
  ruleGroupCodes: () => { toolbar: string }
}
const h = (page: Page, fn: (t: Hook) => unknown) => page.evaluate(`(${fn.toString()})((window).__ganttTest)`)

test('Viol-8005 — persisted violations follow the toolbar group (RULE workset default 103)', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await gotoGantt(page)
  await waitGanttReady(page)
  await expect.poll(() => h(page, (t) => t.selectedCrewCount()) as Promise<number>,
    { timeout: 45_000, intervals: [1000] }).toBeGreaterThan(800)

  // The toolbar group source is the default RULE workset id ('103') after the Model-B drop.
  const groups = await h(page, (t) => t.ruleGroupCodes()) as { toolbar: string }
  console.log('GROUPS:', JSON.stringify(groups))
  expect(groups.toolbar).toBe('103')   // toolbar default = workset 103 (what the planner sees)

  // The bells must be present (the persisted-violation fetch used the toolbar group).
  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible()
  await expect
    .poll(() => dialog.locator('[data-testid="violation-list-row"][data-rule-code="8002"]').count(),
      { timeout: 15_000, intervals: [500] })
    .toBeGreaterThan(0)
  await expect(dialog.getByTestId('violation-list-empty')).toBeHidden()
})
