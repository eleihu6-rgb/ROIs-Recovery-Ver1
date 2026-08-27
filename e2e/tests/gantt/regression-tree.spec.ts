/**
 * Regression tab — sidebar category tree + naming-convention id in rows.
 *
 * Covers two changes to the Regression module:
 *   1. The (previously empty) left sidebar now renders a tree grouping tests by
 *      category; selecting a category filters the main list, "All Tests" clears.
 *   2. Each row shows our naming-convention id parsed from the title
 *      (e.g. "Live-1001"), not the duplicate raw DB id (#1001); rows whose title
 *      has no code fall back to "#<id>".
 *
 * The ai-server /altair/ai/regression/tests endpoint is stubbed for determinism
 * (§No-Illusion: assert concrete counts/text, never bare visibility).
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

interface StubTest {
  id: number
  title: string
  category: string
  source: 'AI' | 'User'
  priority: string
  description: string
  last_status: 'pass' | 'fail' | null
  last_duration_ms: number | null
  run_count: number
  pass_count: number
  fail_count: number
  flakiness_score: number
  spec_file: string
  test_name: string
  recent_results: string[]
  instability: number
  quarantined: boolean
}

const mk = (id: number, category: string, title: string, last_status: 'pass' | 'fail' | null, fail_count: number): StubTest => ({
  id, category, title, last_status, fail_count,
  source: 'User', priority: 'Medium', description: '',
  last_duration_ms: last_status ? 1200 : null,
  run_count: last_status ? Math.max(1, fail_count) : 0,
  pass_count: last_status === 'pass' ? 1 : 0,
  flakiness_score: 0, spec_file: 'auto.spec.ts', test_name: '',
  recent_results: [], instability: 0, quarantined: false,
})

const SEED: StubTest[] = [
  mk(1, 'AI Chat', 'Live-1001 — filters crew to BKK, then clears all filters @smoke', 'fail', 3),
  mk(2, 'AI Chat', 'Live-1002 — tips use stored hints (base/rank/fleet/crew id), never Bangkok', null, 0),
  mk(50, 'Data tab', 'Data-5020 — Assignment, Group and Group-Map sections display real data', 'pass', 0),
  mk(99, 'Misc', 'Healthy passing case with no code prefix', 'pass', 0),
]

const stubRegression = async (page: Page): Promise<void> => {
  await page.route('**/altair/ai/regression/tests', async (route) => {
    await route.fulfill({ json: { tests: SEED } })
  })
}

const openRegression = async (page: Page): Promise<void> => {
  await page.goto('/altair/')
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
  await page.getByTestId('nav-regression').click()
  await expect(page.getByText('Regression Tests', { exact: true })).toBeVisible()
  await expect(page.getByTestId('regression-row')).toHaveCount(SEED.length)
}

test.describe('Regression tab — sidebar tree + row ids', () => {
  test('Live-1278 — sidebar tree groups tests by category with counts', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await stubRegression(page)
    await openRegression(page)

    const tree = page.getByTestId('regression-tree')
    await expect(tree).toBeVisible()

    // "All Tests" + one item per category, with counts.
    await expect(tree.getByTestId('regression-tree-item-all')).toContainText('All Tests')
    await expect(tree.getByTestId('regression-tree-item-all')).toContainText('4')

    await expect(tree.getByTestId('regression-tree-item-AI Chat')).toContainText('AI Chat')
    await expect(tree.getByTestId('regression-tree-item-AI Chat')).toContainText('2')
    await expect(tree.getByTestId('regression-tree-item-Data tab')).toContainText('1')
    await expect(tree.getByTestId('regression-tree-item-Misc')).toContainText('1')
  })

  test('Live-1279 — selecting a category in the tree filters the list; All Tests clears', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await stubRegression(page)
    await openRegression(page)

    const rows = page.getByTestId('regression-row')

    // Filter to AI Chat → only its 2 rows remain.
    await page.getByTestId('regression-tree-item-AI Chat').click()
    await expect(rows).toHaveCount(2)
    await expect(page.getByTestId('regression-list')).toContainText('filters crew to BKK')
    await expect(page.getByTestId('regression-list')).not.toContainText('Assignment, Group and Group-Map')

    // Filter to Data tab → only its 1 row.
    await page.getByTestId('regression-tree-item-Data tab').click()
    await expect(rows).toHaveCount(1)
    await expect(page.getByTestId('regression-list')).toContainText('Assignment, Group and Group-Map')

    // All Tests → back to everything.
    await page.getByTestId('regression-tree-item-all').click()
    await expect(rows).toHaveCount(SEED.length)
  })

  test('Live-1280 — rows show the naming-convention id, not the duplicate #id', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await stubRegression(page)
    await openRegression(page)

    // Title-coded row: shows "Live-1001", strips the prefix from the story, and
    // does NOT render the raw "#1" db id.
    const codedRow = page.getByTestId('regression-row').filter({ hasText: 'filters crew to BKK' })
    await expect(codedRow.getByTestId('row-code')).toHaveText('Live-1001')
    await expect(codedRow).not.toContainText('#1')

    // The Data-tab row keeps its Data-5020 naming id.
    const dataRow = page.getByTestId('regression-row').filter({ hasText: 'Assignment, Group and Group-Map' })
    await expect(dataRow.getByTestId('row-code')).toHaveText('Data-5020')

    // Un-coded title falls back to "#<id>".
    const plainRow = page.getByTestId('regression-row').filter({ hasText: 'Healthy passing case' })
    await expect(plainRow.getByTestId('row-code')).toHaveText('#99')
  })
})

test.describe('Regression tab — legality cases get a dedicated Legality category', () => {
  // Legality-family cases (Legal-/Rule-/Viol-####) are categorised "Legality" by the
  // ai-server importer, not lumped into "General". The sidebar must surface a dedicated
  // Legality group; selecting it shows the legality cases and hides General ones.
  const LEGAL_SEED: StubTest[] = [
    mk(6006, 'Legality', 'Legal-6006 — observe gantt violations request after YYZ filter', 'pass', 0),
    mk(3019, 'Legality', 'Rule-3019 — live param_json carries 7501/001 (168 RH/Min)', 'pass', 0),
    mk(8004, 'Legality', 'Viol-8004 — Alert Center lists 8002 messages unfiltered', 'fail', 1),
    mk(200, 'General', 'General-0200 — landing page renders the shell', 'pass', 0),
  ]

  const stubLegal = async (page: Page): Promise<void> => {
    await page.route('**/altair/ai/regression/tests', async (route) => {
      await route.fulfill({ json: { tests: LEGAL_SEED } })
    })
  }

  test('Legal-6012 — sidebar shows a dedicated Legality group separate from General', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await stubLegal(page)
    await page.goto('/altair/')
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
    await page.getByTestId('nav-regression').click()
    await expect(page.getByText('Regression Tests', { exact: true })).toBeVisible()
    await expect(page.getByTestId('regression-row')).toHaveCount(LEGAL_SEED.length)

    const tree = page.getByTestId('regression-tree')
    // A dedicated Legality node exists with 3 cases; General holds only the 1 non-legality case.
    await expect(tree.getByTestId('regression-tree-item-Legality')).toContainText('Legality')
    await expect(tree.getByTestId('regression-tree-item-Legality')).toContainText('3')
    await expect(tree.getByTestId('regression-tree-item-General')).toContainText('1')

    // Selecting Legality shows the legality cases and hides the General one.
    await page.getByTestId('regression-tree-item-Legality').click()
    const rows = page.getByTestId('regression-row')
    await expect(rows).toHaveCount(3)
    const list = page.getByTestId('regression-list')
    await expect(list).toContainText('observe gantt violations request')
    await expect(list).toContainText('Alert Center lists 8002 messages')
    await expect(list).not.toContainText('landing page renders the shell')

    // Selecting General must NOT contain the legality case (proves the split, not just presence).
    await page.getByTestId('regression-tree-item-General').click()
    await expect(rows).toHaveCount(1)
    await expect(list).toContainText('landing page renders the shell')
    await expect(list).not.toContainText('observe gantt violations request')
  })
})
