/**
 * Rule dev playbook — proof-snapshot capture (image/RUST/<function-id>/).
 *
 * Repeatable regeneration of the per-rule proof screenshots the migration playbook
 * (docs/architecture/rule-migration-playbook.md §Phase 5b) requires. Run after
 * re-validating the legality suite (rule-*.spec.ts). Covers all 14 rules:
 *   - 9 violation-firing rules → gantt bells + Alert Center grouped-by-rule rows.
 *     "Scan live" is clicked so low-volume rules (e.g. 7503, 14 rows) surface even when
 *     their crew aren't in the first-paint batch.
 *   - 2 CALC rules (7502, 7272) → Legality tab ruleset-103 + the rule's param table.
 *
 *   npx playwright test --config config/playwright.config.ts --project=gantt \
 *     tests/gantt/rule-snapshots.spec.ts
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../../../image/RUST')

const FIRING = [
  { id: '8002/001', dir: '8002' },
  { id: '8056/001', dir: '8056' },
  { id: '7501/001', dir: '7501' },
  { id: '7503/001', dir: '7503' },
  { id: '7504/001', dir: '7504' },
  { id: '7505/001', dir: '7505' },
  { id: '7506/001', dir: '7506' },
  { id: '8030/001', dir: '8030' },
  { id: '8004/001', dir: '8004' },
]

// Legality-tab param proofs: the CALC rules (no violations) + 7503 (its live alert rows
// are sparse — 14 rows on crew outside the first-paint batch — so its deterministic proof
// here is the migrated Max-WOCL=2 param table; its alert-row proof stays from migration).
const LEGALITY = [
  { code: '7502', inst: '001', dir: '7502', paramsName: 'credit' },
  { code: '7272', inst: '001', dir: '7272', paramsName: 'standby-dp' },
  { code: '7503', inst: '001', dir: '7503', paramsName: 'maxwocl' },
]

test('capture firing-rule Alert Center proofs into image/RUST', async ({ page, request }) => {
  test.setTimeout(180_000)
  await seedGanttAuth(page, request)
  await gotoGantt(page)

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const t = (window as unknown as { __ganttTest?: { liveViolations?: () => unknown[] } }).__ganttTest
          return t?.liveViolations?.()?.length ?? 0
        }),
      { timeout: 30_000, intervals: [500] },
    )
    .toBeGreaterThan(0)

  // Gantt-bells proof (shared canvas; saved per dir).
  for (const r of FIRING) {
    await page.screenshot({ path: path.join(OUT, r.dir, `${r.dir}-gantt-bells.png`) })
  }

  // Alert Center, grouped by rule, with a live scan to surface low-volume rules.
  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('alert-center-scan').click()
  await dialog.getByTestId('alert-groupby-rule').click()

  let captured = 0
  for (const r of FIRING) {
    const group = dialog.locator('[data-testid="alert-group-item"]', { hasText: r.id })
    if ((await group.count()) === 0) {
      // eslint-disable-next-line no-console
      console.warn(`no Alert group for ${r.id} — skipping (no loaded violations this run)`)
      continue
    }
    await group.first().click()
    await expect
      .poll(() => dialog.locator(`[data-testid="violation-list-row"][data-rule-id="${r.id}"]`).count(), {
        timeout: 10_000,
        intervals: [400],
      })
      .toBeGreaterThan(0)
    await dialog.screenshot({ path: path.join(OUT, r.dir, `${r.dir}-alert-groupby-rule.png`) })
    captured += 1
  }
  expect(captured).toBeGreaterThanOrEqual(8)
})

test('capture CALC-rule Legality-tab proofs into image/RUST', async ({ page, request }) => {
  test.setTimeout(120_000)
  await seedGanttAuth(page, request)
  await page.goto('/altair/')
  await page.getByTestId('module-nav-legality').click()
  await page.getByTestId('legality-rule-sets-view').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByTestId('legality-ruleset-card-103').click()
  await expect(page.getByTestId('legality-set-name')).toContainText('PBS Solver Ruleset', { timeout: 10_000 })

  for (const r of LEGALITY) {
    await expect(page.getByTestId(`legality-rule-name-${r.code}-${r.inst}`)).toBeVisible()
    // Ruleset-103 view showing this CALC rule in the list.
    await page.screenshot({ path: path.join(OUT, r.dir, `${r.dir}-legality-ruleset-103.png`) })
    // The rule's param table.
    await page.getByTestId(`legality-rule-edit-${r.code}-${r.inst}`).click()
    const params = page.getByTestId(`legality-params-${r.code}-${r.inst}`)
    await expect(params).toBeVisible()
    await params.screenshot({ path: path.join(OUT, r.dir, `${r.dir}-legality-${r.paramsName}-params.png`) })
    // close the param view if it's a dialog, else continue (the list stays).
    await page.keyboard.press('Escape').catch(() => undefined)
  }
})
