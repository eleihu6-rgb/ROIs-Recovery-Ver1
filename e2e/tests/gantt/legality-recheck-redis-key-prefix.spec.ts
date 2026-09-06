/**
 * Regression — "Checking legality…" spins forever after a successful recheck.
 *
 * Bug: live-server's `fastify.redis` transparently prefixes every key with
 * `<REDIS_KEY_PREFIX>:` (utils/prefixed-redis.ts), but the detached child script
 * `scripts/live-legality.mjs` wrote its status keys UNPREFIXED. So a recheck that
 * finished fine wrote `legality:recheck:F8:103:status=done` while
 * GET /api/legality/recheck-status kept reading `dev:legality:recheck:F8:103:status`,
 * which the parent had pinned at 'computing' — the indicator spun until the 30-min TTL.
 *
 * This drives the REAL "Recheck now" button and asserts the indicator settles to
 * "Last checked …". Before the fix it stayed on "Checking legality…" indefinitely.
 *
 * Run alone (pbs-server not needed):
 *   cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test \
 *     --config=config/playwright.config.ts --project=gantt \
 *     tests/gantt/legality-recheck-redis-key-prefix.spec.ts --no-deps --reporter=list
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const DEFAULT_RULESET = 103

test('a completed live recheck settles the indicator to "Last checked" instead of spinning', async ({ page, request }) => {
  test.setTimeout(300_000)
  await seedGanttAuth(page, request)
  await page.goto('/altair/')
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })

  await page.getByTestId('module-nav-legality').click()
  await page.getByTestId('legality-rule-sets-view').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByTestId(`legality-ruleset-card-${DEFAULT_RULESET}`).click()
  await expect(page.getByTestId('legality-set-name')).toContainText('PBS Solver Ruleset', { timeout: 10_000 })

  const label = page.getByTestId('legality-recheck-label')
  const recheckBtn = page.getByTestId('legality-recheck-now')
  await expect(recheckBtn).toBeVisible({ timeout: 10_000 })

  // A prior stuck recheck leaves the button disabled for 10 min; wait it out of 'computing'
  // first so this run measures its own recheck, not a leftover one.
  await expect(recheckBtn).toBeEnabled({ timeout: 60_000 })

  await recheckBtn.click()
  await expect(label).toContainText('Checking legality', { timeout: 15_000 })

  // The fix: the child's 'done' lands on the SAME prefixed key the poller reads, so the
  // label flips to the concrete last-checked timestamp rather than spinning forever.
  await expect(label).toContainText('Last checked', { timeout: 240_000 })
  await expect(label).not.toContainText('taking longer than usual')
  await expect(page.getByTestId('legality-recheck-indicator')).not.toContainText('Recheck failed')

  // Clip the whole ruleset header row so the settled indicator is readable in context.
  const box = await page.getByTestId('legality-set-name').boundingBox()
  await page.screenshot({
    path: '../docs/assets/screenshots/gantt/legality-recheck-redis-key-prefix-Ver2.png',
    clip: { x: 0, y: Math.max(0, (box?.y ?? 0) - 12), width: 1440, height: 48 },
  })
})
