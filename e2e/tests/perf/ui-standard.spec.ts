/**
 * UI Standard Gate — static source guard (regression test for the token migration).
 *
 * This is the §Playwright-Required regression test for the CSS/Typography standardization:
 * it asserts the codebase contains ZERO hard violations of root CLAUDE.md §样式与排版标准
 * (magic font sizes like `text-[11px]`, `font-extrabold/black`, `rounded-[Npx]`, arbitrary
 * `font-[...]`). It WOULD have failed before the migration (268 magic font sizes across 53
 * files) and passes after — i.e. it cannot be satisfied by a no-op (§No-Illusion).
 *
 * It runs server-free (no navigation, no auth) and shares its logic with the standalone
 * gate `scripts/check-ui-standard.mjs` (the same module powers the git pre-push hook and
 * `npm run check:ui`), so there is a single source of truth for the rules.
 *
 * Run (server-free):
 *   cd e2e && npx playwright test --config=config/perf.config.ts -g 'UI Standard'
 */
import { test, expect } from '@playwright/test'
// Shared checker — single source of truth for the standard's rules.
import { scanUiStandard } from '../../../scripts/check-ui-standard.mjs'

test.describe('UI Standard Gate', () => {
  test('gantt + pbs-portal + @rois/ui contain zero hard CSS/typography-standard violations @smoke', () => {
    const { hard } = scanUiStandard()

    // Build a readable failure message listing every offender (file:line + token).
    const report = hard
      .map((h) => `  ${h.file}:${h.line}  [${h.rule}]  ${h.token}  → ${h.fix}`)
      .join('\n')

    expect(
      hard.length,
      hard.length
        ? `Found ${hard.length} hard UI-standard violation(s) — migrate to tokens (see CLAUDE.md §样式与排版标准):\n${report}`
        : 'no violations',
    ).toBe(0)
  })
})
