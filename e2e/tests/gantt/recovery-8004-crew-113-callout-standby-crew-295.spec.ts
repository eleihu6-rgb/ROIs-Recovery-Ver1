/**
 * Live 8004 Recovery — Crew 113 → Crew 295 via Callout Standby (Pairing 135905, 2026-09-12)
 *
 * Skeleton / no-op end-to-end coverage of the 8004 Recovery Callout-Standby flow
 * for the same Crew 113 / Pairing 135905 alert that
 * recovery-8004-crew-113.spec.ts targets, but routing the swap through a
 * standby crew (Crew 295) and asserting that the option lands in the
 * "Standby Crew callout" group (NOT the "Roster transfer or exchange"
 * group).
 *
 * Why a separate file:
 *   - The Roster option is the natural "best" outcome (a clean swap to
 *     Crew 529 who holds 7M8). The standby option is a fallback when no
 *     qualified same-base/rank crew is roster-free, and exercises a
 *     different render path in the Recovery dialog (group="standby" vs
 *     "roster", plus an "isCalloutStandby" marker on the standby task).
 *   - Crew 295 already holds a real Airport Standby (ASBY) task on
 *     2026-09-11 22:30Z → 2026-09-12 08:30Z in the demo data, so a
 *     callout-standby assignment is plausible and the recovery preview
 *     has something to attach to.
 *
 * Currently SKIPPED (see .skip below) — the user asked to land the file
 * first and exercise the flow later, after the underlying 1001-vs-ASBY
 * rule interaction is settled (see docs/requirements/recovery-refactor
 * for the open question). The skeleton's UI flow is the same as
 * recovery-8004-crew-113.spec.ts with two changes: the target group is
 * "standby" and the target crew is 295.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

const SOURCE_CREW_ID = '113'
const SOURCE_PAIRING_ID = '135905'
const TARGET_CREW_ID = '295'

test.skip('Live 8004 — Crew 113 / Pairing 135905 → Crew 295 is the top executable Callout-Standby option', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, {
    timeout: 30_000,
  })

  // ── Narrow the Live scope to the Pilot (P) division before bootstrap ──
  await page.getByTestId('module-nav-live').click()
  const emptyState = page.getByTestId('live-empty-state')
  await expect(emptyState).toBeVisible({ timeout: 5_000 })
  await emptyState.click()
  await expect(page.getByTestId('filter-dialog')).toBeVisible({ timeout: 5_000 })
  await page.getByTestId('filter-crew-division-P').click()
  await page.getByTestId('filter-apply').click()
  await expect(page.getByTestId('filter-dialog')).not.toBeVisible({ timeout: 10_000 })
  await expect(emptyState).not.toBeVisible({ timeout: 270_000 })

  // Let the Rust cold-start recheck settle before reading the Alert Center.
  await page.waitForTimeout(30_000)

  // ── Step 1: open the Alert Center and locate the 113 / 135905 row ──
  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible()

  const targetCheckbox = dialog.getByTestId(`alert-recovery-checkbox-${SOURCE_CREW_ID}-${SOURCE_PAIRING_ID}`)
  await expect(targetCheckbox).toBeVisible({ timeout: 15_000 })
  await expect(targetCheckbox).toBeEnabled()
  await expect(targetCheckbox).not.toBeChecked()

  const targetRow = dialog.locator(
    `[data-testid="violation-list-row"][data-crew-id="${SOURCE_CREW_ID}"][data-rule-code="8004"]`
  )
  await expect(targetRow.first()).toHaveAttribute('data-recoverable', 'true')

  // ── Step 2: select the row and click "Recovery Selected" ──
  await targetCheckbox.check()
  await expect(targetCheckbox).toBeChecked()
  await expect(page.getByTestId('alert-recovery-selected')).toBeEnabled()
  await page.getByTestId('alert-recovery-selected').click()

  await expect(dialog).not.toBeVisible({ timeout: 5_000 })
  const recoveryDialog = page.getByTestId('recovery-violation-dialog')
  await expect(recoveryDialog).toBeVisible({ timeout: 15_000 })

  // ── Step 3: wait for the rule check on every Standby option to settle ──
  // The Roster group and the Standby group both render; we only care about
  // the Standby group here because the recovery will mark Crew 295's
  // existing ASBY task as "Callout Standby" rather than swap the roster.
  const standbyGroup = recoveryDialog.getByTestId('recovery-options-standby')
  await expect(standbyGroup).toBeVisible({ timeout: 10_000 })

  const settle = await expect
    .poll(
      async () => {
        const checking = await standbyGroup.getByText('Checking', { exact: true }).count()
        const passed = await standbyGroup.getByText('Executable', { exact: true }).count()
        const failed = await standbyGroup.getByText('Rule failed', { exact: true }).count()
        return { checking, passed, failed }
      },
      { timeout: 120_000, intervals: [1_000] },
    )
    .toMatchObject({ checking: 0 })

  // At least one standby option must be Executable — otherwise the test
  // would be vacuously true and a missing-Crew-295 option would slip by.
  expect(settle.passed, 'at least one Standby option must be Executable').toBeGreaterThan(0)

  // ── Step 4: assert Crew 295 is the EXECUTABLE Standby option ──
  // The Standby group can also list 529 (any same-base / same-rank crew
  // qualifies for both Roster and Standby), so scope strictly to the
  // Standby group before climbing to the option row.
  const crew295Row = standbyGroup
    .locator(`[data-testid="recovery-crew-checkbox-${TARGET_CREW_ID}"]`)
    .first()
    .locator('xpath=ancestor::div[contains(@class, "border-l-2")][1]')
  await expect(crew295Row).toBeVisible({ timeout: 5_000 })
  await expect(crew295Row.locator('input[type="checkbox"]')).toBeEnabled()
  await expect(crew295Row).toContainText('Executable')

  // Drive the user action: tick the checkbox to select 295 for execution.
  const crew295Checkbox = crew295Row.locator('input[type="checkbox"]')
  await crew295Checkbox.check()
  await expect(crew295Checkbox).toBeChecked()
})
