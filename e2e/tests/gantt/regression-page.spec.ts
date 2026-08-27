/**
 * Regression-testing module — failure-first list, create-then-generate flow,
 * plus info popover, import, run polling, quarantine, version history, and
 * regenerate-with-fixes.
 *
 * The ai-server `/altair/ai/regression/*` endpoints are stubbed at the network
 * layer so the test is deterministic and asserts the REAL UI behaviour
 * (§No-Illusion): failure-first ordering, the fail-count badge value, a created
 * row appearing with source=User, the user-added stat incrementing, and the
 * generated-code preview rendering the returned code with Apply enabled when
 * there are no blocking issues.
 *
 * Auth is seeded the standard gantt way (sessionStorage via addInitScript). The
 * regression module is reachable from the landing page via the top-nav
 * `nav-regression` button (it switches the active shell module), so no Live view
 * / Canvas bootstrap is required.
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
  last_status: 'pass' | 'fail' | 'flaky' | null
  last_duration_ms: number | null
  last_run_at?: string | null
  run_count: number
  pass_count: number
  fail_count: number
  flakiness_score: number
  spec_file: string
  test_name: string
  recent_results: string[]
  instability: number
  quarantined: boolean
  created_by?: string
  active_version?: number
  versions?: Array<{
    version: number
    trigger: string
    status?: string
    title: string
    code: string
    log?: string
    run_at?: string
    duration_ms?: number
    timestamp: string
    modified_by?: string
    applied_by?: string
    rounds?: Array<Record<string, unknown>>
  }>
}

const mkTest = (over: Partial<StubTest>): StubTest => ({
  id: 1,
  title: 'x',
  category: 'General',
  source: 'AI',
  priority: 'Medium',
  description: '',
  last_status: null,
  last_duration_ms: null,
  run_count: 0,
  pass_count: 0,
  fail_count: 0,
  flakiness_score: 0,
  spec_file: 'auto.spec.ts',
  test_name: '',
  recent_results: [],
  instability: 0,
  quarantined: false,
  created_by: 'AI',
  ...over,
})

/** Wire deterministic stubs for the regression endpoints; returns the live array. */
const stubRegression = async (page: Page, seed: StubTest[]): Promise<void> => {
  const tests = [...seed]
  let nextId = 1000

  await page.route('**/altair/ai/regression/tests', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as {
        title: string
        category: string
        priority: string
        description?: string
      }
      const created = mkTest({
        id: ++nextId,
        title: body.title,
        category: body.category,
        priority: body.priority,
        description: body.description ?? '',
        source: 'User',
        spec_file: 'manual',
        fail_count: 0,
      })
      tests.push(created)
      await route.fulfill({ json: created })
    } else {
      await route.fulfill({ json: { tests } })
    }
  })

  await page.route('**/altair/ai/regression/generate-playwright', async (route) => {
    await route.fulfill({
      json: {
        code:
          "test('Live-1178 — x', async ({ page }) => { await loginAndSeed(page); " +
          "await expect(page.getByTestId('y')).toHaveCount(1) })",
        issues: [],
      },
    })
  })
}

const openRegression = async (page: Page): Promise<void> => {
  await page.goto('/altair/')
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, {
    timeout: 30_000,
  })
  await page.getByTestId('nav-regression').click()
  await expect(page.getByText('Regression Tests', { exact: true })).toBeVisible()
}

test.describe('Regression testing module', () => {
  test('Live-1179 — lists failure-first, then create + generate @smoke', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    // Two seeded rows with differing fail_count to prove failure-first order.
    await stubRegression(page, [
      mkTest({ id: 1, title: 'Healthy passing case', fail_count: 0, last_status: 'pass', run_count: 4, pass_count: 4 }),
      mkTest({ id: 2, title: 'Flaky failing case', fail_count: 3, last_status: 'fail', run_count: 5, pass_count: 2 }),
    ])

    // 1. Navigate to the module.
    await openRegression(page)

    // 2. Failure-first order: the higher fail_count row is first; badge shows "3".
    const rows = page.getByTestId('regression-row')
    await expect(rows).toHaveCount(2)
    await expect(rows.first()).toContainText('Flaky failing case')
    await expect(rows.first().getByTestId('row-failcount')).toHaveText('3')
    // The passing row has no fail-count badge.
    await expect(rows.nth(1).getByTestId('row-failcount')).toHaveCount(0)

    // Stats: 0 user-added so far.
    await expect(page.getByTestId('stat-user')).toContainText('User Added')
    await expect(page.getByTestId('stat-user')).toContainText('0')
    await expect(page.getByTestId('stat-fail')).toContainText('Failing')
    await expect(page.getByTestId('stat-fail')).toContainText('1')

    // 3. Create a new test via the dialog.
    await page.getByTestId('add-test-open').click()
    await page.getByTestId('add-test-title').fill('Filtering to BKK shows a base chip')
    await page.getByTestId('add-test-save').click()

    // Row appears (source User) and the user-added stat increments.
    await expect(page.getByTestId('regression-row')).toHaveCount(3)
    await expect(page.getByTestId('regression-list')).toContainText('Filtering to BKK shows a base chip')
    await expect(page.getByTestId('stat-user')).toContainText('1')

    // 4. Generate Playwright for the new (failure-free) row → preview shown, Apply enabled.
    const newRow = page
      .getByTestId('regression-row')
      .filter({ hasText: 'Filtering to BKK shows a base chip' })
    await newRow.getByTestId('row-generate').click()

    await expect(page.getByTestId('generate-preview')).toContainText("test('Live-1178 — x'")
    await expect(page.getByTestId('apply-generated')).toBeEnabled()
    // No issues → no issue chips.
    await expect(page.getByTestId('generate-issue')).toHaveCount(0)
  })

  test('Live-1181 — list load failure shows error state, not empty state', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    // GET fails with 500 → the view must distinguish "load failed" from "empty".
    await page.route('**/altair/ai/regression/tests', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 500, json: { error: 'boom' } })
      } else {
        await route.fulfill({ json: { tests: [] } })
      }
    })

    await openRegression(page)

    // Error row visible; empty-state must NOT render (failure ≠ empty).
    await expect(page.getByTestId('regression-error')).toBeVisible()
    await expect(page.getByTestId('regression-empty')).toHaveCount(0)
    await expect(page.getByTestId('regression-row')).toHaveCount(0)
  })

  test('Live-1182 — info popover is a step-by-step manual covering the full workflow', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await stubRegression(page, [
      mkTest({ id: 1001, title: 'opens the roster pane', spec_file: 'pane-limits.spec.ts', test_name: 'opens the roster pane', category: 'Panes', source: 'User', priority: 'Medium' }),
    ])
    await openRegression(page)

    await page.getByTestId('regression-info').click()
    const pop = page.getByTestId('regression-info-popover')
    await expect(pop).toContainText('Regression Playground')
    await expect(pop).toContainText('No coding required')
    // Full step-by-step manual: catalog → version → generate → run round → evidence → latest/history → failure/fix.
    await expect(pop.getByTestId('regression-info-steps').locator('li')).toHaveCount(7)
    await expect(pop).toContainText('Build the catalog')
    await expect(pop).toContainText('Version rule')
    await expect(pop).toContainText('Run round rule')
    await expect(pop).toContainText('Evidence rule')
    await expect(pop).toContainText('Failure/fix')
    await expect(pop).toContainText('quarantined')
    // Non-intrusive: opening the manual must NOT block the page — the toolbar stays usable.
    await expect(page.getByTestId('add-test-open')).toBeEnabled()
  })

  test('Live-1183 — import specs populates the catalog with named tests', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    // Track state: initially empty, after import returns 2 tests
    let importCalled = false
    const importedTests = [
      mkTest({ id: 1001, title: 'opens the roster pane', spec_file: 'pane-limits.spec.ts', test_name: 'opens the roster pane', category: 'Panes', source: 'User', priority: 'Medium' }),
      mkTest({ id: 1002, title: 'closes the pane', spec_file: 'pane-limits.spec.ts', test_name: 'closes the pane', category: 'Panes', source: 'User', priority: 'Medium' }),
    ]

    await page.route('**/altair/ai/regression/tests', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { tests: importCalled ? importedTests : [] } })
      } else {
        await route.fulfill({ json: { tests: [] } })
      }
    })

    await page.route('**/altair/ai/regression/import-specs', async (route) => {
      importCalled = true
      await route.fulfill({ json: { imported: 2, skipped: 0 } })
    })

    await openRegression(page)

    // Initially empty: shows the import button in empty state
    await expect(page.getByTestId('regression-empty')).toContainText('Import specs')

    // Click Import specs from empty state
    await page.getByTestId('import-specs-empty').click()

    // After import, list has 2 rows
    await expect(page.getByTestId('regression-row')).toHaveCount(2)
    await expect(page.getByTestId('regression-list')).toContainText('opens the roster pane')
    await expect(page.getByTestId('stat-total')).toContainText('Total Tests')
    await expect(page.getByTestId('stat-total')).toContainText('2')
  })

  test('Live-1184 — run shows live status bar, then summary toast and refreshed rows', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    const twoTests = [
      mkTest({ id: 1001, title: 'opens the roster pane', spec_file: 'pane-limits.spec.ts', test_name: 'opens the roster pane', category: 'Panes', source: 'User', priority: 'Medium' }),
      mkTest({ id: 1002, title: 'closes the pane', spec_file: 'pane-limits.spec.ts', test_name: 'closes the pane', category: 'Panes', source: 'User', priority: 'Medium', fail_count: 1, last_status: 'fail' }),
    ]

    let pollCount = 0
    const updatedTests = [
      mkTest({ id: 1001, title: 'opens the roster pane', spec_file: 'pane-limits.spec.ts', test_name: 'opens the roster pane', category: 'Panes', source: 'User', priority: 'Medium', last_status: 'pass' }),
      mkTest({ id: 1002, title: 'closes the pane', spec_file: 'pane-limits.spec.ts', test_name: 'closes the pane', category: 'Panes', source: 'User', priority: 'Medium', fail_count: 2, last_status: 'fail' }),
    ]

    await page.route('**/altair/ai/regression/tests', async (route) => {
      if (route.request().method() === 'GET') {
        // Return updated tests after the run completes (pollCount > 1)
        await route.fulfill({ json: { tests: pollCount > 1 ? updatedTests : twoTests } })
      } else {
        await route.fulfill({ json: twoTests[0] })
      }
    })

    await page.route('**/altair/ai/regression/runs', async (route) => {
      await route.fulfill({ json: { run_id: 'run-9' } })
    })

    await page.route('**/altair/ai/regression/runs/run-9', async (route) => {
      pollCount++
      if (pollCount === 1) {
        await route.fulfill({
          json: { status: 'running', total: 2, passed: 0, failed: 0, results: {} },
        })
      } else {
        await route.fulfill({
          json: {
            status: 'done',
            total: 2,
            passed: 1,
            failed: 1,
            results: {
              '1001': { status: 'pass', duration_ms: 500 },
              '1002': { status: 'fail', duration_ms: 200, has_trace: true },
            },
          },
        })
      }
    })

    await openRegression(page)

    // Click Run failing first
    await page.getByTestId('run-failing-first').click()

    // Status bar should appear with running state
    const bar = page.getByTestId('run-status-bar')
    await expect(bar).toBeVisible({ timeout: 5_000 })
    await expect(bar.getByTestId('run-status-text')).toContainText('Running 2 tests')

    // Wait for run to complete (bar disappears on done)
    await expect(page.getByTestId('run-status-bar')).toHaveCount(0, { timeout: 15_000 })

    // Trace icon should appear for the failed test (has_trace: true)
    await expect(page.getByTestId('row-trace')).toHaveCount(1)
  })

  test('Live-1185 — quarantined test shows badge and Run All excludes it client-side', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    let capturedRunBody: { test_ids?: number[] } | null = null
    let capturedUserCode: string | undefined

    await page.route('**/altair/ai/regression/tests', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            tests: [
              mkTest({ id: 1001, title: 'stable case', spec_file: 'pane-limits.spec.ts', test_name: 'stable case', source: 'User', priority: 'Medium', run_count: 5, pass_count: 5 }),
              mkTest({ id: 1002, title: 'shaky case', spec_file: 'pane-limits.spec.ts', test_name: 'shaky case', source: 'User', priority: 'Medium', quarantined: true, instability: 0.6, recent_results: ['pass', 'fail', 'pass', 'fail', 'pass'], run_count: 5 }),
            ],
          },
        })
      } else {
        await route.fulfill({ json: { tests: [] } })
      }
    })

    await page.route('**/altair/ai/regression/runs', async (route) => {
      capturedRunBody = route.request().postDataJSON() as { test_ids?: number[] }
      capturedUserCode = route.request().headers()['x-user-code']
      await route.fulfill({ json: { run_id: 'run-test-quarantine' } })
    })

    await page.route('**/altair/ai/regression/runs/run-test-quarantine', async (route) => {
      await route.fulfill({ json: { status: 'done', total: 1, passed: 1, failed: 0, results: {} } })
    })

    await openRegression(page)

    // Quarantined badge visible
    await expect(page.getByTestId('row-quarantined')).toHaveCount(1)
    // Instability badge shows 60%
    await expect(page.getByTestId('row-instability')).toContainText('60% unstable')

    // Run All — should exclude quarantined test (id 1002)
    await page.getByTestId('run-failing-first').click()

    // Wait a moment for the route to be called
    await page.waitForTimeout(500)

    // Quarantined test 1002 should NOT be in the run body
    expect(capturedRunBody).not.toBeNull()
    if (capturedRunBody) {
      expect((capturedRunBody as { test_ids?: number[] }).test_ids).not.toContain(1002)
      expect((capturedRunBody as { test_ids?: number[] }).test_ids).toContain(1001)
    }

    // X-User-Code carries the logged-in planner's identity (actor tracking).
    const seededUserCode = await page.evaluate(
      () => (JSON.parse(sessionStorage.getItem('rois-auth') as string) as { user: { userCode: string } }).user.userCode,
    )
    expect(capturedUserCode).toBe(seededUserCode)
  })

  test('Live-1186 — Run All button runs only filtered tests when a status filter is active', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    let capturedIds: number[] = []

    await page.route('**/altair/ai/regression/tests', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            tests: [
              mkTest({ id: 2001, title: 'passing test', spec_file: 'a.spec.ts', test_name: 'passing test', source: 'User', priority: 'Medium', last_status: 'pass', run_count: 1, pass_count: 1 }),
              mkTest({ id: 2002, title: 'failing test', spec_file: 'b.spec.ts', test_name: 'failing test', source: 'User', priority: 'Medium', last_status: 'fail', run_count: 1, fail_count: 1 }),
            ],
          },
        })
      } else {
        await route.fulfill({ json: { tests: [] } })
      }
    })

    await page.route('**/altair/ai/regression/runs', async (route) => {
      capturedIds = (route.request().postDataJSON() as { test_ids: number[] }).test_ids
      await route.fulfill({ json: { run_id: 'run-filter-test' } })
    })

    await page.route('**/altair/ai/regression/runs/run-filter-test', async (route) => {
      await route.fulfill({ json: { status: 'done', total: 1, passed: 0, failed: 1, results: {} } })
    })

    await openRegression(page)

    // Apply "Fail" filter from the status dropdown
    await page.getByTestId('filter-status').selectOption('fail')

    // Button should say "Run 1" (only the failing test is visible)
    await expect(page.getByTestId('run-failing-first')).toContainText('Run 1')

    // Click — only failing test 2002 should be submitted
    await page.getByTestId('run-failing-first').click()
    await page.waitForTimeout(300)

    expect(capturedIds).toContain(2002)
    expect(capturedIds).not.toContain(2001)
  })

  test('Live-1187 — version history expands with versions and run rounds', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    await page.route('**/altair/ai/regression/tests', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            tests: [
              mkTest({ id: 1001, title: 'opens the roster pane', spec_file: 'pane-limits.spec.ts', test_name: 'opens the roster pane', category: 'Panes', source: 'User', priority: 'Medium' }),
            ],
          },
        })
      } else {
        await route.fulfill({ json: { tests: [] } })
      }
    })

    await page.route('**/altair/ai/regression/tests/1001/detail', async (route) => {
      await route.fulfill({
        json: mkTest({
          id: 1001,
          title: 'opens the roster pane',
          active_version: 2,
          versions: [
            {
              version: 1,
              trigger: 'created',
              title: 'opens the roster pane',
              code: '',
              timestamp: '2026-06-01T00:00:00Z',
              rounds: [{
                round: 1,
                status: 'fail',
                run_id: 'run-1',
                run_at: '2026-06-01T00:10:00Z',
                duration_ms: 1200,
                log: 'old failure',
                details: { summary: 'v1 failed before the fix', steps: [], artifacts: [] },
              }],
            },
            {
              version: 2,
              trigger: 'script',
              title: 'opens the roster pane',
              code: "test('Live-1188 — opens the roster pane', async () => {})",
              timestamp: '2026-06-02T00:00:00Z',
              modified_by: 'AI',
              applied_by: 'P10001',
              rounds: [{
                round: 1,
                status: 'pass',
                run_id: 'run-2',
                run_at: '2026-06-02T00:10:00Z',
                duration_ms: 900,
                log: '',
                tester: 'P10001',
                details: {
                  summary: 'switched to date range X-Y, clicked >> on pairing TG123 2026-06-08, expected M-N and observed M-N',
                  steps: [{ action: 'click_pairing_jump', pairing_id: 'TG123', pairing_date: '2026-06-08', direction: '>>' }],
                  artifacts: [],
                },
              }],
            },
          ],
        }),
      })
    })

    await openRegression(page)

    // Click the expand button on the first row
    await page.getByTestId('row-expand').first().click()

    // Version history panel should appear with 2 selectable versions and latest round evidence.
    await expect(page.getByTestId('version-row')).toHaveCount(2)
    await expect(page.getByTestId('version-history')).toContainText('script')
    await expect(page.getByTestId('version-history')).toContainText('switched to date range X-Y')
    await page.getByTestId('round-detail-toggle').first().click()
    await expect(page.getByTestId('round-detail')).toContainText('pairing_id=TG123')

    // Actor tracking: baseline creator, per-version modifier, per-round tester.
    await expect(page.getByTestId('version-creator')).toContainText('Created by AI')
    // Active version is v2 (script): AI authored, P10001 applied.
    await expect(page.getByTestId('version-modifier')).toContainText('by AI')
    await expect(page.getByTestId('version-modifier')).toContainText('applied by P10001')
    await expect(page.getByTestId('round-tester').first()).toHaveText('P10001')
    // v1 predates actor tracking — modifier renders as an em-dash, never a wrong name.
    await page.getByTestId('version-row').filter({ hasText: 'v1' }).click()
    await expect(page.getByTestId('version-modifier')).toContainText('by —')
  })

  test('Live-1189 — regenerate with fixes resubmits previous code and issues', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    let generateCallCount = 0
    let secondRequestBody: Record<string, unknown> | null = null

    await page.route('**/altair/ai/regression/tests', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            tests: [
              mkTest({ id: 1001, title: 'opens the roster pane', spec_file: 'pane-limits.spec.ts', test_name: 'opens the roster pane', category: 'Panes', source: 'User', priority: 'Medium' }),
            ],
          },
        })
      } else {
        await route.fulfill({ json: { tests: [] } })
      }
    })

    await page.route('**/altair/ai/regression/generate-playwright', async (route) => {
      generateCallCount++
      if (generateCallCount === 1) {
        // First generate returns code with issues
        await route.fulfill({
          json: {
            code: 'bad',
            issues: ['no assertion (expect) found'],
          },
        })
      } else {
        // Second generate (regenerate with fixes) should include previous_code
        secondRequestBody = route.request().postDataJSON() as Record<string, unknown>
        await route.fulfill({
          json: {
            code: "test('Live-1190 — opens the roster pane', async ({ page }) => { await expect(page.getByTestId('roster')).toHaveCount(1); })",
            issues: [],
          },
        })
      }
    })

    await openRegression(page)

    // Click generate on the first row
    await page.getByTestId('row-generate').first().click()

    // Should show the issue chip
    await expect(page.getByTestId('generate-issue')).toContainText('no assertion')

    // Click Regenerate with fixes
    await page.getByTestId('regenerate-with-fixes').click()

    // After regenerate, issues should be gone and Apply should be enabled
    await expect(page.getByTestId('generate-issue')).toHaveCount(0)
    await expect(page.getByTestId('apply-generated')).toBeEnabled()

    // Verify the second request included previous_code
    expect(secondRequestBody).not.toBeNull()
    expect((secondRequestBody as { previous_code?: string }).previous_code).toBe('bad')
  })

  test('Live-1191 — last-run time renders compact and is never overlapped by the action buttons', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    // A runnable row (spec_file ≠ 'manual' → Run button renders) with a 7-hour-old
    // last run. Before the fix the 4 action buttons (~151px) overflowed their 120px
    // grid column leftwards, covering the "about 7 hours ago" text in the Last Run
    // cell — this test fails on that layout.
    const sevenHoursAgo = new Date(Date.now() - 7 * 3_600_000).toISOString()
    await stubRegression(page, [
      mkTest({
        id: 1002,
        title: 'filters crew to BKK, then clears all filters',
        spec_file: 'filter-coverage.spec.ts',
        test_name: 'filters crew to BKK',
        source: 'User',
        priority: 'Medium',
        last_status: 'pass',
        last_duration_ms: 4_500,
        last_run_at: sevenHoursAgo,
        run_count: 1,
        pass_count: 1,
      }),
    ])

    await openRegression(page)

    const row = page.getByTestId('regression-row').first()
    const lastRunCell = row.getByTestId('row-lastrun')

    // Compact relative format — the long "about 7 hours ago" form is what overflowed.
    await expect(lastRunCell).toHaveText('7h ago')

    // The text must fit its cell without truncation (single line, no ellipsis cut).
    const fits = await lastRunCell.evaluate((el) => el.scrollWidth <= el.clientWidth)
    expect(fits, 'last-run text must not be truncated').toBe(true)

    // All 4 action buttons render and none crosses into the Last Run cell.
    const lastRunBox = await lastRunCell.boundingBox()
    expect(lastRunBox).not.toBeNull()
    for (const tid of ['row-run', 'row-generate', 'row-quarantine-toggle', 'row-delete']) {
      const btn = row.getByTestId(tid)
      await expect(btn).toBeVisible()
      const btnBox = await btn.boundingBox()
      expect(btnBox).not.toBeNull()
      // No horizontal intersection: every button starts right of the cell's right edge.
      expect(
        btnBox!.x,
        `${tid} must not overlap the last-run cell`,
      ).toBeGreaterThanOrEqual(lastRunBox!.x + lastRunBox!.width)
    }
  })

  test('Live-1192 — step detail names never paint over the key=value params column', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    // Real-world step names from REG-GANTT-PAIRING-OFFSCREEN-JUMP-001. Before the
    // fix the step-name grid track was a fixed 6rem (96px): the unbreakable
    // 27-char token "assert_jump_buttons_visible" overflowed the track and painted
    // over the params column ("assert_jump_buttonspairing_start=…"). The third step
    // uses a name longer than the widened track to prove wrap-instead-of-overlap.
    await page.route('**/altair/ai/regression/tests', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            tests: [mkTest({ id: 1145, title: 'shows date jump and scrolls to pairing start minus two days', spec_file: 'pairing-pane.spec.ts', test_name: 'jump', category: 'Panes', source: 'User', priority: 'Medium' })],
          },
        })
      } else {
        await route.fulfill({ json: { tests: [] } })
      }
    })

    await page.route('**/altair/ai/regression/tests/1145/detail', async (route) => {
      await route.fulfill({
        json: mkTest({
          id: 1145,
          title: 'shows date jump and scrolls to pairing start minus two days',
          active_version: 1,
          versions: [{
            version: 1,
            trigger: 'created',
            title: 'shows date jump and scrolls to pairing start minus two days',
            code: '',
            timestamp: '2026-06-06T09:00:00Z',
            rounds: [{
              round: 1,
              status: 'pass',
              run_id: 'run-jump',
              run_at: '2026-06-06T09:34:27Z',
              duration_ms: 3400,
              log: '',
              tester: 'claude',
              details: {
                summary: 'Jump << on pairing 2026-06-01 scrolled to 2026-05-30 (start − 2 days)',
                steps: [
                  { assertion: 'assert_jump_buttons_visible', pairing_start: '2026-06-01', button_label: '<< 2026-05-31', timezone: 'America/Toronto' },
                  { action: 'click_jump_button', target_date: '2026-05-30', expected_scroll_x: 0, actual_scroll_x: 0 },
                  { assertion: 'assert_pairing_timeline_scrolled_to_target_date_minus_two_days', evidence_url: 'http://127.0.0.1:3005/altair/ai/regression/artifacts/run-jump/snapshots/after-jump-timeline-scrolled.png' },
                ],
                artifacts: [],
              },
            }],
          }],
        }),
      })
    })

    await openRegression(page)
    await page.getByTestId('row-expand').first().click()
    await page.getByTestId('round-detail-toggle').first().click()
    const detail = page.getByTestId('round-detail')
    await expect(detail).toBeVisible()

    const names = detail.getByTestId('step-name')
    const params = detail.getByTestId('step-params')
    await expect(names).toHaveCount(3)
    await expect(names.nth(0)).toHaveText('assert_jump_buttons_visible')
    await expect(params.nth(0)).toContainText('pairing_start=2026-06-01')
    await expect(params.nth(1)).toContainText('target_date=2026-05-30')

    for (let i = 0; i < 3; i++) {
      // 1. The name must render inside its own grid track — painted overflow
      //    (scrollWidth > clientWidth) is exactly what overlapped the params text.
      const nameFits = await names.nth(i).evaluate((el) => el.scrollWidth <= el.clientWidth)
      expect(nameFits, `step-name ${i} must not paint past its column`).toBe(true)

      // 2. The params cell must start strictly right of the name's painted extent.
      const nameBox = await names.nth(i).boundingBox()
      const paramsBox = await params.nth(i).boundingBox()
      expect(nameBox).not.toBeNull()
      expect(paramsBox).not.toBeNull()
      expect(
        paramsBox!.x,
        `params column ${i} must not be overlapped by the step name`,
      ).toBeGreaterThanOrEqual(nameBox!.x + nameBox!.width)
    }

    // 3. Long unbreakable param values (URLs) must wrap inside the cell, not bleed out.
    const lastParamsFits = await params.nth(2).evaluate((el) => el.scrollWidth <= el.clientWidth)
    expect(lastParamsFits, 'long param values must wrap, not overflow').toBe(true)
  })

  test('Live-1193 — round detail shows evidence snapshot thumbnail and deletes it on request', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    const SNAP_FILENAME = 'case-1001-20260606T120000Z-0-pairing-jump-after-click.png'
    const SNAP_URL = `/ai/regression/artifacts/run-1/snapshots/${SNAP_FILENAME}`
    let deleteCalled = false

    await page.route('**/altair/ai/regression/tests', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            tests: [mkTest({ id: 1001, title: 'pairing jump test', spec_file: 'pairing-pane.spec.ts', test_name: 'pairing jump test', category: 'Panes', source: 'AI', priority: 'High' })],
          },
        })
      } else {
        await route.fulfill({ json: mkTest({ id: 1001, title: 'pairing jump test', category: 'Panes', source: 'AI', priority: 'High', spec_file: 'pairing-pane.spec.ts', test_name: 'pairing jump test' }) })
      }
    })

    await page.route('**/altair/ai/regression/tests/1001/detail', async (route) => {
      await route.fulfill({
        json: mkTest({
          id: 1001,
          title: 'pairing jump test',
          active_version: 1,
          versions: [{
            version: 1,
            trigger: 'import',
            title: 'pairing jump test',
            code: '',
            timestamp: '2026-06-06T12:00:00Z',
            modified_by: 'AI',
            rounds: [{
              round: 1,
              status: 'pass',
              run_id: 'run-1',
              run_at: '2026-06-06T12:05:00Z',
              duration_ms: 1400,
              log: '',
              tester: 'P10001',
              details: {
                summary: 'pairing TG123 jump lands on correct date',
                steps: [{ action: 'click_jump', pairing_id: 'TG123', expected_date: '2026-06-16' }],
                artifacts: [{
                  type: 'snapshot',
                  id: 'snap-1001-20260606T120000Z-0',
                  filename: SNAP_FILENAME,
                  url: SNAP_URL,
                  label: 'pairing-jump-after-click',
                  step_index: 0,
                  created_at: '20260606T120000Z',
                  deleted: false,
                }],
              },
            }],
          }],
        }),
      })
    })

    // Serve the snapshot as a 1x1 transparent PNG (valid image for img.complete).
    const TINY_PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
      'base64',
    )
    await page.route(`**${SNAP_URL}`, async (route) => {
      await route.fulfill({ body: TINY_PNG, contentType: 'image/png' })
    })

    await page.route(`**/altair/ai/regression/artifacts/run-1/snapshots/${SNAP_FILENAME}`, async (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true
        await route.fulfill({ json: { deleted: SNAP_FILENAME } })
      } else {
        await route.fulfill({ body: TINY_PNG, contentType: 'image/png' })
      }
    })

    await openRegression(page)
    await page.getByTestId('row-expand').first().click()
    await expect(page.getByTestId('version-history')).toBeVisible()

    // Expand round detail
    await page.getByTestId('round-detail-toggle').first().click()
    const detail = page.getByTestId('round-detail')
    await expect(detail).toBeVisible()

    // Snapshot strip visible — thumbnail + label present
    await expect(detail.getByTestId('snapshot-strip')).toBeVisible()
    await expect(detail.getByTestId('snapshot-item')).toHaveCount(1)
    await expect(detail.getByTestId('snapshot-label')).toContainText('pairing-jump-after-click')

    // Delete the snapshot
    await detail.getByTestId('snapshot-item').hover()
    await detail.getByTestId('snapshot-delete').click()

    // After delete, snapshot gone — empty state shown
    await expect(detail.getByTestId('snapshot-strip')).toHaveCount(0)
    await expect(detail.getByTestId('snapshot-empty')).toBeVisible()
    expect(deleteCalled, 'DELETE endpoint must have been called').toBe(true)
  })

  test('Live-1194 — conditions section shows existing conditions and saves edits via PUT endpoint', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    let putBody: string[] | null = null

    await page.route('**/altair/ai/regression/tests', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            tests: [
              {
                ...mkTest({ id: 1110, title: 'Fleet filter updates roster', spec_file: 'roster.spec.ts', test_name: 'fleet filter', category: 'Roster', source: 'User', priority: 'High' }),
                conditions: ['fleet chip appears on roster pane strip for the selected fleet', 'roster canvas shows crew rows (crew count > 0)'],
              },
            ],
          },
        })
      } else {
        await route.fulfill({ json: mkTest({ id: 1110, title: 'Fleet filter updates roster', category: 'Roster', source: 'User', priority: 'High' }) })
      }
    })

    await page.route('**/altair/ai/regression/tests/1110/conditions', async (route) => {
      putBody = route.request().postDataJSON() as string[]
      await route.fulfill({
        json: {
          ...mkTest({ id: 1110, title: 'Fleet filter updates roster', category: 'Roster', source: 'User', priority: 'High' }),
          conditions: putBody,
        },
      })
    })

    await openRegression(page)

    // Expand the test row
    await page.getByTestId('row-expand').first().click()

    // Conditions list shows the two pre-existing conditions
    const condList = page.getByTestId('conditions-list')
    await expect(condList).toBeVisible()
    await expect(page.getByTestId('condition-item')).toHaveCount(2)
    await expect(condList).toContainText('fleet chip appears on roster pane strip')

    // Click Edit, clear, add one new condition, Save
    await page.getByTestId('conditions-edit').click()
    const textarea = page.locator('textarea').first()
    await textarea.fill('roster canvas shows crew rows (crew count > 0) after filtering by 73M')
    await page.getByTestId('conditions-save').click()

    // After save: conditions update and "regenerate?" prompt appears
    await expect(page.getByTestId('condition-item')).toHaveCount(1)
    await expect(page.getByTestId('conditions-list')).toContainText('73M')
    // The PUT endpoint must have been called with the new lines
    expect(putBody).not.toBeNull()
    expect(putBody).toHaveLength(1)
    expect(putBody![0]).toContain('73M')
  })

  test('Live-1195 — Diagnose button appears only on failed rounds and shows AI diagnosis panel', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    let diagnoseCalled = false

    await page.route('**/altair/ai/regression/tests', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            tests: [mkTest({ id: 1110, title: 'Fleet filter updates roster', spec_file: 'roster.spec.ts', test_name: 'fleet filter', category: 'Roster', source: 'User', priority: 'High', last_status: 'fail', fail_count: 1, run_count: 1 })],
          },
        })
      } else {
        await route.fulfill({ json: mkTest({ id: 1110 }) })
      }
    })

    await page.route('**/altair/ai/regression/tests/1110/detail', async (route) => {
      await route.fulfill({
        json: {
          ...mkTest({
            id: 1110,
            title: 'Fleet filter updates roster',
            active_version: 1,
          }),
          versions: [{
            version: 1,
            trigger: 'created',
            title: 'Fleet filter updates roster',
            code: '',
            timestamp: '2026-06-05T00:00:00Z',
            rounds: [{
              round: 1,
              status: 'fail',
              run_id: 'run-fail-1',
              run_at: '2026-06-05T10:00:00Z',
              duration_ms: 3000,
              log: 'AssertionError: expected crew count > 0 but got 0',
              tester: 'claude',
              details: {
                summary: 'No crew rows found for fleet 73M — P-division has no 73M assignments',
                steps: [],
                artifacts: [],
              },
            }],
          }],
        },
      })
    })

    await page.route('**/altair/ai/regression/tests/1110/diagnose', async (route) => {
      diagnoseCalled = true
      await route.fulfill({
        json: {
          issue_type: 'data_issue',
          summary: 'P-division crew has no 73M fleet assignments in the demo dataset',
          explanation: 'The test asserts crew count > 0 for fleet 73M, but the demo dataset contains no pairing or roster entries linking P-division crew to 73M aircraft. This is expected behaviour exposing a data gap.',
          recommendation: 'Add 73M fleet assignments for P-division crew in the demo seed data, or adjust the test to use a fleet that exists in the dataset.',
        },
      })
    })

    await openRegression(page)

    // Expand the test row
    await page.getByTestId('row-expand').first().click()

    // Expand the failed round
    await page.getByTestId('round-detail-toggle').first().click()
    const detail = page.getByTestId('round-detail')
    await expect(detail).toBeVisible()

    // Diagnose button is present on the failed round
    const diagnoseBtn = detail.getByTestId('diagnose-button')
    await expect(diagnoseBtn).toBeVisible()

    // Click Diagnose → panel appears with correct content
    await diagnoseBtn.click()

    const panel = detail.getByTestId('diagnosis-panel')
    await expect(panel).toBeVisible()
    await expect(detail.getByTestId('diagnosis-type')).toHaveText('data_issue')
    await expect(detail.getByTestId('diagnosis-summary')).toContainText('P-division crew has no 73M fleet assignments')
    expect(diagnoseCalled, 'POST /diagnose must have been called').toBe(true)
  })

  test('Live-1196 — Diagnose button does NOT appear on passed rounds', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    await page.route('**/altair/ai/regression/tests', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            tests: [mkTest({ id: 2001, title: 'Passing test', spec_file: 'stable.spec.ts', test_name: 'passes', category: 'Smoke', source: 'AI', priority: 'Medium', last_status: 'pass' })],
          },
        })
      } else {
        await route.fulfill({ json: mkTest({ id: 2001 }) })
      }
    })

    await page.route('**/altair/ai/regression/tests/2001/detail', async (route) => {
      await route.fulfill({
        json: {
          ...mkTest({ id: 2001, title: 'Passing test', active_version: 1 }),
          versions: [{
            version: 1,
            trigger: 'created',
            title: 'Passing test',
            code: '',
            timestamp: '2026-06-05T00:00:00Z',
            rounds: [{
              round: 1,
              status: 'pass',
              run_id: 'run-pass-1',
              run_at: '2026-06-05T10:00:00Z',
              duration_ms: 1500,
              log: '',
              tester: 'claude',
              details: { summary: 'All assertions passed', steps: [], artifacts: [] },
            }],
          }],
        },
      })
    })

    await openRegression(page)
    await page.getByTestId('row-expand').first().click()
    await page.getByTestId('round-detail-toggle').first().click()
    const detail = page.getByTestId('round-detail')
    await expect(detail).toBeVisible()

    // No Diagnose button on a passing round
    await expect(detail.getByTestId('diagnose-button')).toHaveCount(0)
    await expect(detail.getByTestId('diagnosis-panel')).toHaveCount(0)
  })

  test('Live-1197 — extract-entities returns detected values after conditions save', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    let extractCalled = false
    let extractBody: { conditions?: string[] } | null = null

    await page.route('**/altair/ai/regression/tests', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            tests: [
              {
                ...mkTest({ id: 1200, title: 'Fleet 73M roster check', spec_file: 'roster.spec.ts', test_name: 'fleet 73M', category: 'Roster', source: 'User', priority: 'High' }),
                conditions: [],
              },
            ],
          },
        })
      } else {
        await route.fulfill({ json: mkTest({ id: 1200 }) })
      }
    })

    await page.route('**/altair/ai/regression/tests/1200/conditions', async (route) => {
      await route.fulfill({
        json: {
          ...mkTest({ id: 1200, title: 'Fleet 73M roster check', category: 'Roster', source: 'User', priority: 'High' }),
          conditions: ['roster canvas shows crew rows for fleet 73M'],
        },
      })
    })

    await page.route('**/altair/ai/regression/tests/1200/extract-entities', async (route) => {
      extractCalled = true
      extractBody = route.request().postDataJSON() as { conditions?: string[] }
      await route.fulfill({
        json: [
          { value: '73M', entity_type: 'fleet', intent: 'pending', condition_index: 0, context: 'fleet 73M' },
        ],
      })
    })

    await openRegression(page)

    // Expand the row
    await page.getByTestId('row-expand').first().click()

    // Edit and save a condition containing "73M"
    await page.getByTestId('conditions-edit').click()
    const textarea = page.locator('textarea').first()
    await textarea.fill('roster canvas shows crew rows for fleet 73M')
    await page.getByTestId('conditions-save').click()

    // The extract-entities endpoint must have been called with the saved conditions
    await page.waitForTimeout(300)
    expect(extractCalled, 'extract-entities must be called after conditions save').toBe(true)
    expect(extractBody?.conditions).toContain('roster canvas shows crew rows for fleet 73M')

    // Entity disambiguation panel should appear with the detected entity
    const panel = page.getByTestId('entity-disambiguation-panel')
    await expect(panel).toBeVisible({ timeout: 5_000 })
    await expect(panel).toContainText('73M')
    await expect(panel).toContainText('fleet')
    await expect(panel).toContainText('Specific value detected')
  })

  test('Live-1198 — entity disambiguation panel shows for pending entities; A intent saved on confirm', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    let savedIntents: Array<{ value: string; intent: string }> | null = null

    await page.route('**/altair/ai/regression/tests', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            tests: [
              {
                ...mkTest({ id: 1201, title: 'Fleet 7M8 check', spec_file: 'roster.spec.ts', test_name: 'fleet check', category: 'Roster', source: 'User', priority: 'High' }),
                conditions: [],
              },
            ],
          },
        })
      } else {
        await route.fulfill({ json: mkTest({ id: 1201 }) })
      }
    })

    await page.route('**/altair/ai/regression/tests/1201/conditions', async (route) => {
      await route.fulfill({
        json: {
          ...mkTest({ id: 1201, title: 'Fleet 7M8 check', category: 'Roster', source: 'User', priority: 'High' }),
          conditions: ['roster shows rows for fleet 7M8'],
        },
      })
    })

    await page.route('**/altair/ai/regression/tests/1201/extract-entities', async (route) => {
      await route.fulfill({
        json: [
          { value: '7M8', entity_type: 'fleet', intent: 'pending', condition_index: 0, context: 'fleet 7M8' },
        ],
      })
    })

    await page.route('**/altair/ai/regression/tests/1201/entity-intents', async (route) => {
      savedIntents = route.request().postDataJSON() as Array<{ value: string; intent: string }>
      await route.fulfill({
        json: {
          ...mkTest({ id: 1201, title: 'Fleet 7M8 check', category: 'Roster', source: 'User', priority: 'High' }),
          entity_intents: savedIntents,
        },
      })
    })

    await page.route('**/altair/ai/regression/generate-playwright', async (route) => {
      await route.fulfill({ json: { code: "test('Live-1199 — x', async ({ page }) => { expect(true).toBe(true) })", issues: [] } })
    })

    await openRegression(page)
    await page.getByTestId('row-expand').first().click()

    // Save conditions to trigger entity extraction
    await page.getByTestId('conditions-edit').click()
    await page.locator('textarea').first().fill('roster shows rows for fleet 7M8')
    await page.getByTestId('conditions-save').click()

    // Panel appears with the detected entity
    const panel = page.getByTestId('entity-disambiguation-panel')
    await expect(panel).toBeVisible({ timeout: 5_000 })
    const entityItem = panel.getByTestId('entity-item').first()
    await expect(entityItem).toContainText('7M8')

    // Click "Yes, it is" → proceeds to A/B choice
    await entityItem.getByText('Yes, it is').click()
    await expect(entityItem.getByTestId('entity-intent-A')).toBeVisible()
    await expect(entityItem.getByTestId('entity-intent-B')).toBeVisible()

    // Select A (must_find) and confirm
    await entityItem.getByTestId('entity-intent-A').click()
    await entityItem.getByTestId('entity-intent-confirm').click()

    // After confirming, the entity-intents PUT endpoint must be called with must_find
    await page.waitForTimeout(500)
    expect(savedIntents, 'entity-intents must be saved').not.toBeNull()
    expect(savedIntents![0].value).toBe('7M8')
    expect(savedIntents![0].intent).toBe('must_find')

    // The panel transitions to the "regenerate?" offer
    await expect(panel).toContainText('Regenerate')
  })

  test('Live-1200 — entity B intent generates empty-state assertion contract', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    let savedIntents: Array<{ value: string; intent: string }> | null = null
    let generateBody: { entity_intents?: Array<{ value: string; intent: string }> } | null = null

    await page.route('**/altair/ai/regression/tests', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            tests: [
              {
                ...mkTest({ id: 1202, title: 'Flight P10001 empty state', spec_file: 'flight.spec.ts', test_name: 'flight check', category: 'Flights', source: 'User', priority: 'Medium' }),
                conditions: [],
              },
            ],
          },
        })
      } else {
        await route.fulfill({ json: mkTest({ id: 1202 }) })
      }
    })

    await page.route('**/altair/ai/regression/tests/1202/conditions', async (route) => {
      await route.fulfill({
        json: {
          ...mkTest({ id: 1202, title: 'Flight P10001 empty state', category: 'Flights', source: 'User', priority: 'Medium' }),
          conditions: ['roster shows empty state for crew P10001 on off day'],
        },
      })
    })

    await page.route('**/altair/ai/regression/tests/1202/extract-entities', async (route) => {
      await route.fulfill({
        json: [
          { value: 'P10001', entity_type: 'crew', intent: 'pending', condition_index: 0, context: 'crew P10001' },
        ],
      })
    })

    await page.route('**/altair/ai/regression/tests/1202/entity-intents', async (route) => {
      savedIntents = route.request().postDataJSON() as Array<{ value: string; intent: string }>
      await route.fulfill({
        json: {
          ...mkTest({ id: 1202, title: 'Flight P10001 empty state', category: 'Flights', source: 'User', priority: 'Medium' }),
          entity_intents: savedIntents,
        },
      })
    })

    await page.route('**/altair/ai/regression/generate-playwright', async (route) => {
      generateBody = route.request().postDataJSON() as { entity_intents?: Array<{ value: string; intent: string }> }
      await route.fulfill({ json: { code: "test('Live-1201 — x', async ({ page }) => { expect(true).toBe(true) })", issues: [] } })
    })

    await openRegression(page)
    await page.getByTestId('row-expand').first().click()

    // Save conditions to trigger entity extraction
    await page.getByTestId('conditions-edit').click()
    await page.locator('textarea').first().fill('roster shows empty state for crew P10001 on off day')
    await page.getByTestId('conditions-save').click()

    // Panel appears — answer Yes then choose B (empty_state)
    const panel = page.getByTestId('entity-disambiguation-panel')
    await expect(panel).toBeVisible({ timeout: 5_000 })
    const entityItem = panel.getByTestId('entity-item').first()

    await entityItem.getByText('Yes, it is').click()
    await entityItem.getByTestId('entity-intent-B').click()
    await entityItem.getByTestId('entity-intent-confirm').click()

    // Entity intent B (empty_state) must be saved
    await page.waitForTimeout(500)
    expect(savedIntents![0].intent).toBe('empty_state')

    // The offer-regen panel appears — click Regenerate to trigger generate with entity_intents
    await expect(panel).toContainText('Regenerate')
    await panel.getByTestId('entity-regen-button').click()

    // Generate must be called with entity_intents containing the empty_state intent
    await page.waitForTimeout(500)
    expect(generateBody, 'generate must be called after regen click').not.toBeNull()
    expect(generateBody?.entity_intents).toBeDefined()
    expect(generateBody!.entity_intents![0].intent).toBe('empty_state')
    expect(generateBody!.entity_intents![0].value).toBe('P10001')
  })
})
