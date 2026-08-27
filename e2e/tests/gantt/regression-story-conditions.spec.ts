/**
 * Regression tab — expanded row shows a two-column "Test story | Pass conditions"
 * layout (1 story : N conditions per test), and the test story is editable.
 *
 * Data model under test: each test carries exactly ONE `story` string and a LIST of
 * `conditions`. The expanded panel renders the story on the left and the bulleted
 * conditions on the right.
 *
 * The ai-server endpoints are stubbed for determinism (§No-Illusion: assert concrete
 * text + counts, never bare visibility).
 */
import { test, expect, type Page } from '@playwright/test'

/**
 * Seed gantt auth directly into sessionStorage (gantt auth is per-tab sessionStorage).
 * The Reg tab renders entirely from the stubbed /regression/tests endpoint, so a real
 * backend login is unnecessary — only a token's presence is required to pass the shell
 * auth gate. This keeps the test runnable without a live-server login backend.
 */
const seedFakeAuth = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'rois-auth',
      JSON.stringify({ user: { userCode: 'admin', userName: 'Admin', schema: 'f8' }, token: 'test-token' }),
    )
  })
  // Catch-all success for live-server calls: in this env the remote DB is empty so
  // startup calls would 401, and the http-client turns any 401 into logout() — which
  // would wipe the restored session straight back to the login page. Registered first
  // so the specific /auth/me handler below (added last → matched first) overrides it.
  await page.route('**/altair/live/**', async (route) => {
    await route.fulfill({ json: { code: 200, message: 'ok', data: null } })
  })
  // auth-store.restore() validates the stored token via GET /api/auth/me; stub it so the
  // fake session is accepted and the app shell (with the Regression nav) renders.
  await page.route('**/altair/live/api/auth/me', async (route) => {
    await route.fulfill({ json: { code: 200, message: 'ok', data: { userCode: 'admin', userName: 'Admin', schema: 'f8' } } })
  })
}

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
  story: string
  conditions: string[]
}

const mk = (over: Partial<StubTest> & Pick<StubTest, 'id' | 'title' | 'story' | 'conditions'>): StubTest => ({
  category: 'Filter', source: 'User', priority: 'Medium', description: '',
  last_status: 'pass', last_duration_ms: 1200, run_count: 1, pass_count: 1, fail_count: 0,
  flakiness_score: 0, spec_file: 'filter-coverage.spec.ts', test_name: '',
  recent_results: [], instability: 0, quarantined: false,
  ...over,
})

const SEED: StubTest[] = [
  mk({
    id: 1040,
    title: 'Live-1040 — Crew: rank filter (data-driven) — filter store updated; chip visible @filter-crew',
    story: 'Opens the Crew filter tab, selects the first available rank, and applies it.',
    conditions: [
      'The active crew filter records the selected rank.',
      'A filter chip showing the selected rank appears on the pane strip.',
    ],
  }),
  mk({
    id: 1048,
    title: 'Live-1048 — Flight: fleet filter (data-driven) — store updated @filter-flight',
    story: 'Adds the flight pane, opens the Flight filter tab, selects the first fleet, and applies.',
    conditions: ['The flight filter records the selected fleet.'],
  }),
]

const stub = async (page: Page): Promise<void> => {
  await page.route('**/altair/ai/regression/tests', async (route) => {
    await route.fulfill({ json: { tests: SEED } })
  })
}

const openRegression = async (page: Page): Promise<void> => {
  await page.goto('/altair/')
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
  await page.getByTestId('nav-regression').click()
  await expect(page.getByTestId('regression-row')).toHaveCount(SEED.length)
}

test.describe('Regression tab — Test story vs Pass conditions panel', () => {
  test('Live-1281 — expanded row shows one story beside its N pass conditions', async ({ page }) => {
    await seedFakeAuth(page)
    await stub(page)
    await openRegression(page)

    // Expand Live-1040 (1 story : 2 conditions).
    const row = page.getByTestId('regression-row').filter({ hasText: 'rank filter' })
    await row.getByTestId('row-expand').click()

    const grid = page.getByTestId('story-conditions-grid')
    await expect(grid).toBeVisible()

    // LEFT: exactly one story, rendered as the actual story text.
    const storyCol = page.getByTestId('story-col')
    await expect(storyCol).toContainText('Test story')
    await expect(storyCol.getByTestId('story-text')).toHaveText(
      'Opens the Crew filter tab, selects the first available rank, and applies it.',
    )

    // RIGHT: the two pass conditions, both present and counted.
    const conditionsCol = page.getByTestId('conditions-col')
    await expect(conditionsCol).toContainText('Pass conditions')
    await expect(conditionsCol.getByTestId('condition-item')).toHaveCount(2)
    await expect(conditionsCol.getByTestId('condition-item').first()).toContainText('records the selected rank')

    // Expanding the flight row collapses the first (single-expand model), so the panel
    // now shows that test's 1 story and its single condition — proving the 1:N mapping
    // is data-driven, not fixed.
    const flightRow = page.getByTestId('regression-row').filter({ hasText: 'fleet filter' })
    await flightRow.getByTestId('row-expand').click()
    await expect(page.getByTestId('story-text')).toHaveText(
      'Adds the flight pane, opens the Flight filter tab, selects the first fleet, and applies.',
    )
    await expect(page.getByTestId('condition-item')).toHaveCount(1)
  })

  test('Live-1282 — editing the test story saves and updates the panel', async ({ page }) => {
    await seedFakeAuth(page)
    await stub(page)

    let savedStory = ''
    await page.route('**/altair/ai/regression/tests/*/story', async (route) => {
      savedStory = (route.request().postDataJSON() as { story: string }).story
      await route.fulfill({ json: { ...SEED[0], story: savedStory } })
    })

    await openRegression(page)
    const row = page.getByTestId('regression-row').filter({ hasText: 'rank filter' })
    await row.getByTestId('row-expand').click()

    // Edit the story.
    await page.getByTestId('story-edit').click()
    const editor = page.getByTestId('story-col').locator('textarea')
    await editor.fill('Updated: opens Crew filter, picks rank CA, applies.')
    await page.getByTestId('story-save').click()

    // Persisted to the endpoint and reflected in the panel.
    await expect.poll(() => savedStory).toBe('Updated: opens Crew filter, picks rank CA, applies.')
    await expect(page.getByTestId('story-text')).toHaveText('Updated: opens Crew filter, picks rank CA, applies.')
  })
})
