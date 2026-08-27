/**
 * Scen — Save / Undo must stay disabled while a rule-confirm dialog is open
 * (and during the async check that opens it).
 *
 * Regression for the "drag pairing → crew" bug: after dropping a pairing onto
 * a crew the patch is applied to the store synchronously (isDirty flips true),
 * then `checkLiveDraftLegality` runs in the background and finally calls
 * `showConfirmDialog`. During the brief window between `addPatch` and the
 * dialog appearing the Save / Undo buttons must NOT be enabled — clicking
 * Save while the legality check is still in flight would race the violation
 * confirmation and leave the UI out of sync with the DB.
 *
 * Same gating contract as `assignment-precheck.spec.ts > Precheck-2` (Live),
 * mirrored for Scenario.
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'
import { gotoScenarioList } from '../../pages/gantt/scenario-nav'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'

async function findAnyScenarioId(page: Page): Promise<{ id: number; name: string }> {
  // The Scenario list is rendered inside ScenarioPage; query the gantt-data
  // API directly — same DB the UI sees, just bypasses the virtualized list.
  const token = await page.evaluate(() => {
    const raw = window.sessionStorage.getItem('rois-auth')
    return raw ? (JSON.parse(raw).token as string) : ''
  })
  const res = await page.request.get(`${GANTT_API}/api/scenario`, {
    params: { page: 1, pageSize: 50 },
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `scenario list fetch failed: ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as { data: { items: Array<{ id: number; name: string }> } }
  expect(body.data.items.length, 'no scenarios available for the regression test').toBeGreaterThan(0)
  // Pick the most recently-created item so the list order / virtualization
  // doesn't push it off-screen.
  const item = body.data.items[0]
  return { id: item.id, name: item.name }
}

async function openScenarioGantt(page: Page, scenarioId: number, searchName: string): Promise<void> {
  await gotoScenarioList(page)
  // The list defaults to RO; the search bar is the stable anchor for hydration.
  await expect(page.getByPlaceholder('Search scenarios…')).toBeVisible({ timeout: 30_000 })
  // Virtualized list — search to materialize the target row.
  await page.getByPlaceholder('Search scenarios…').fill(searchName)
  const item = page.getByTestId('scenario-list-item').filter({
    has: page.getByTestId('scenario-item-id').getByText(String(scenarioId), { exact: true }),
  })
  await expect(item, `scenario #${scenarioId} ("${searchName}") must be in the list`).toBeVisible({ timeout: 40_000 })
  await item.click()
  const detailPanel = page.getByTestId('scenario-detail-panel')
  await expect(detailPanel).toBeVisible({ timeout: 15_000 })
  await detailPanel.getByTestId('scenario-open-btn').click()
  const ganttView = page.getByTestId('scenario-gantt-view')
  await expect(ganttView).toBeVisible({ timeout: 15_000 })
}

test('Scen-SaveGate — Save / Undo disabled while rule-confirm dialog is open', async ({ page }) => {
  await seedGanttAuth(page, page.context().request)
  await page.goto('/altair/')
  const { id: scenarioId, name: scenarioName } = await findAnyScenarioId(page)
  await openScenarioGantt(page, scenarioId, scenarioName)

  const toolbar = page.getByTestId('scenario-gantt-toolbar')
  await expect(toolbar).toBeVisible({ timeout: 30_000 })
  await expect(toolbar.getByTestId('sg-save-btn')).toBeVisible()

  // Acquire the edit lock so canSave is allowed by `isOwner`.
  const acquireBtn = toolbar.getByTestId('sg-acquire-lock-btn')
  if (await acquireBtn.isVisible().catch(() => false)) {
    await acquireBtn.click()
    await expect(toolbar.getByTestId('sg-release-lock-btn')).toBeVisible({ timeout: 10_000 })
  }

  // Sanity: with no pending patches, Save must be disabled.
  await expect(toolbar.getByTestId('sg-save-btn')).toBeDisabled()

  // Inject a pending patch into the scenario store so isDirty=true. This is
  // the post-drop state the user actually sees.
  await page.evaluate(async (sid) => {
    const mod = await import('/altair/src/stores/scenario-gantt-store.ts')
    const store = mod.getScenarioGanttStore(sid).getState()
    store.addPatch({ op: 'add', crewId: 'E2E-SAVE-GATE', pairingId: 1, rosterActingRank: 'CA' })
  }, scenarioId)

  // Without the rule dialog, Save + Undo should now be enabled (the lock is
  // owned, isDirty=true, no async check in flight).
  await expect(toolbar.getByTestId('sg-save-btn')).toBeEnabled()
  await expect(toolbar.getByTestId('sg-undo-btn')).toBeEnabled()

  // Force-open the rule-confirm dialog (the post-check state).
  await page.evaluate(async () => {
    const mod = await import('/altair/src/stores/rule-check-store.ts')
    void mod.useRuleCheckStore.getState().showConfirmDialog(
      [
        {
          ruleCode: '8002',
          ruleName: '8002/001',
          message: 'Synthetic violation for scenario save-gate test',
          severity: 3,
          canOverride: false,
          isNew: true,
          crewId: 'E2E-SAVE-GATE',
          targetId: 'E2E-SAVE-GATE',
          targetType: 'crew',
        },
      ],
      true,
    )
  })

  // Dialog renders.
  const dialog = page.getByTestId('rule-confirm-dialog')
  await expect(dialog).toBeVisible({ timeout: 5_000 })

  // Regression: Save + Undo MUST be disabled while the dialog is open. Prior
  // to the fix the toolbar did not subscribe to rule-check-store.confirmDialog
  // (or its `checking` flag), so the buttons stayed clickable through the
  // legality confirm — Save + Cancel could leave the UI dirty without ever
  // persisting.
  await expect(toolbar.getByTestId('sg-save-btn')).toBeDisabled()
  await expect(toolbar.getByTestId('sg-undo-btn')).toBeDisabled()

  // Close the dialog (Cancel) — buttons should re-enable.
  await page.evaluate(async () => {
    const mod = await import('/altair/src/stores/rule-check-store.ts')
    mod.useRuleCheckStore.getState().closeConfirmDialog()
  })
  await expect(dialog).toBeHidden({ timeout: 5_000 })
  await expect(toolbar.getByTestId('sg-save-btn')).toBeEnabled({ timeout: 5_000 })
  await expect(toolbar.getByTestId('sg-undo-btn')).toBeEnabled({ timeout: 5_000 })

  // Cleanup: undo the synthetic patch + release the lock so the test leaves
  // the scenario in a clean state for any subsequent run.
  await toolbar.getByTestId('sg-undo-btn').click()
  if (await toolbar.getByTestId('sg-release-lock-btn').isVisible().catch(() => false)) {
    await toolbar.getByTestId('sg-release-lock-btn').click()
  }
})