/**
 * Scenario legality dev playbook — proof-snapshot capture (image/SCENARIO/<id>/).
 *
 * The scenario counterpart of the Rust rule playbook (image/RUST/<rule>/). Opens the linked
 * RO scenario 460, then captures: the scenario gantt with at-rest violation bells, the
 * scenario Alert Center grouped by rule, and each firing rule's filtered rows — proving the
 * Rust-computed persisted legality reaches the scenario UI.
 *
 *   npx playwright test --config config/playwright.config.ts --project=gantt \
 *     tests/gantt/scenario-legality-snapshots.spec.ts
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../../../image/SCENARIO/460')
const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const SCENARIO_NAME = 'Ryan-2026-06 YEG Test---'

// Firing rules on scenario 460 (8004/7506/7503 honestly produce no rows there).
const RULES = [
  { id: '8002/001', dir: '8002' },
  { id: '8056/001', dir: '8056' },
  { id: '8030/001', dir: '8030' },
  { id: '7501/001', dir: '7501' },
  { id: '7504/001', dir: '7504' },
  { id: '7505/001', dir: '7505' },
]

test('capture scenario 460 legality proofs into image/SCENARIO', async ({ page, request }) => {
  test.setTimeout(120_000)
  const res = await request.post(`${GANTT_API}/api/auth/login`, { data: { userCode: 'admin', password: '123456' } })
  expect(res.ok()).toBeTruthy()
  const { data: auth } = (await res.json()) as { data: { token: string; userCode: string; userName: string; schema: string } }
  await page.addInitScript((a) => {
    window.sessionStorage.setItem('rois-auth', JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }))
  }, auth)

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  await scenario.listItemByName(SCENARIO_NAME).first().click()
  await expect(scenario.detailPanel).toBeVisible()
  await scenario.detailPanel.getByTestId('scenario-open-btn').click()
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 15_000 })

  // Wait until the persisted legality has loaded into the shared bell (now in the roster
  // condition strip, unified with Live via RosterPaneSource.useAlertCenter). The badge caps at
  // "99+" like Live; scenario 460 has >100 persisted violations.
  const view = page.getByTestId('scenario-gantt-view')
  const bell = view.getByTestId('violations-button')
  await expect(view.getByTestId('violations-button-count')).toHaveText('99+', { timeout: 40_000 })

  // 1) Scenario gantt with at-rest violation bells.
  await page.screenshot({ path: path.join(OUT, 'scenario-460-gantt-bells.png') })

  // 2) Alert Center, grouped by rule.
  await bell.click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('alert-groupby-rule').click()
  await dialog.screenshot({ path: path.join(OUT, 'scenario-460-alert-groupby-rule.png') })

  // 3) Each firing rule's filtered rows.
  let captured = 0
  for (const r of RULES) {
    const group = dialog.locator('[data-testid="alert-group-item"]', { hasText: r.id })
    if ((await group.count()) === 0) continue
    await group.first().click()
    await dialog.screenshot({ path: path.join(OUT, `scenario-460-alert-${r.dir}.png`) })
    captured += 1
  }
  expect(captured).toBeGreaterThanOrEqual(5)
})
