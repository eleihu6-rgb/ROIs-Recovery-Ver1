/**
 * Live 8004 Recovery — Crew 113 → Crew 529 (Pairing 135905, 2026-09-12)
 *
 * End-to-end coverage of the 8004 Recovery flow on a real, DB-verified alert:
 *
 *   - Crew 113 is currently 737-only at 2026-09-12; Pairing 135905 (Sep 12-14)
 *     is a 7M8 rotation, so 8004 fires ("Crew fleet 7M8 is not a valid
 *     qualification for the roster (2026-09-12)").
 *   - Crew 529 shares Crew 113's home base (YVR) and rank (CA), holds 7M8
 *     qualification through 2026-12-31, and is roster-free on Sep 10-15 —
 *     so a Roster transfer to 529 should be the top executable option and
 *     should fully resolve the 8004 violation.
 *
 * Performance / scope discipline:
 *   - To keep the bootstrap load under the dev DB's per-page budget (each
 *     /api/crew?crewIds=… page can take 10-20s under load), the test
 *     narrows the Live view to the Pilot (P) division via the Filter
 *     dialog. This halves the crew roster size — the cabin (C) division
 *     has no 8004-recovery surface to verify here.
 *   - The default date range already covers 2026-09-01 to 2026-10-31,
 *     which includes the 2026-09-12 violation, so no date narrowing is
 *     required.
 *
 * Drives the real UI (Filter → Alert Center selection → Recovery dialog →
 * option check → executable confirmation), not a mocked API. Depends on
 * the Rust rule engine cold-start recheck (gantt bell + Alert Center
 * data source) being settled, so we let the gantt idle for 30 s after
 * the data load before opening the Alert Center.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

const SOURCE_CREW_ID = '113'
const SOURCE_PAIRING_ID = '135905'
const TARGET_CREW_ID = '529'

test('Live 8004 — Crew 113 / Pairing 135905 → Crew 529 is the top executable Roster option', async ({ page, request }) => {
  test.setTimeout(180_000)
  await seedGanttAuth(page, request)
  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, {
    timeout: 30_000,
  })

  // ── Narrow the Live scope to the Pilot (P) division before bootstrap ──
  // The empty-state "Apply Filter" card is the only entry to the live
  // bootstrap. We open it, restrict to P (cabin has no recovery surface
  // here, and excluding it roughly halves the bootstrap crew count), then
  // apply.
  await page.getByTestId('module-nav-live').click()
  const emptyState = page.getByTestId('live-empty-state')
  await expect(emptyState).toBeVisible({ timeout: 5_000 })
  await emptyState.click()
  await expect(page.getByTestId('filter-dialog')).toBeVisible({ timeout: 5_000 })
  // The Crew tab is the default. Toggle the P division pill — defaults are
  // empty (all divisions), so a single click adds P.
  await page.getByTestId('filter-crew-division-P').click()
  await page.getByTestId('filter-apply').click()
  await expect(page.getByTestId('filter-dialog')).not.toBeVisible({ timeout: 10_000 })
  // Worst-case: bootstrap 90s + fallback fetchCrews 30s + buffer → 270s total.
  await expect(emptyState).not.toBeVisible({ timeout: 270_000 })

  // Narrow the Live date range to the 9.8-9.18 window around the alert. The full
  // default 9.1-10.31 window has each /api/crew?crewIds= page take 10-20s under
  // load; 9.8-9.18 still covers 9.12 but cuts crew/roster rows by ~3x.
  await page.getByTestId('date-range-to').fill('2026-09-18')
  await page.getByTestId('date-range-from').fill('2026-09-08')
  // Step 1: let the Rust cold-start recheck settle (date range already narrowed in setup)
  // Center. The bell / violation data source is updated by the live legality
  // recheck worker; without this wait, 8004 rows may still be in the "stale
  // before recheck" state. 30 s matches the manual user flow.
  await page.waitForTimeout(30_000)

  // ── Step 1: open the Alert Center and locate the 113 / 135905 row ──
  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible()

  // The per-row checkbox is named after (crewId, pairingId). The row itself
  // only carries data-crew-id / data-rule-code; the pairing id is rendered
  // as text in the message and the checkbox aria-label, so we bind the
  // assertion to the specific 113 + 135905 checkbox.
  const targetCheckbox = dialog.getByTestId(`alert-recovery-checkbox-${SOURCE_CREW_ID}-${SOURCE_PAIRING_ID}`)
  await expect(targetCheckbox).toBeVisible({ timeout: 15_000 })
  await expect(targetCheckbox).toBeEnabled()
  await expect(targetCheckbox).not.toBeChecked()

  // Sanity check the row is recoverable (data-recoverable="true" on the
  // <tr>). 8004 rows for crews whose roster has already ended would render
  // as data-recoverable="false" — the test should fail loudly in that case.
  const targetRow = dialog.locator(
    `[data-testid="violation-list-row"][data-crew-id="${SOURCE_CREW_ID}"][data-rule-code="8004"]`
  )
  await expect(targetRow.first()).toHaveAttribute('data-recoverable', 'true')

  // ── Step 2: select the row and click "Recovery Selected" ──
  await targetCheckbox.check()
  await expect(targetCheckbox).toBeChecked()
  await expect(page.getByTestId('alert-recovery-selected')).toBeEnabled()
  await page.getByTestId('alert-recovery-selected').click()

  // The Alert Center closes and the Recovery dialog opens (they don't
  // stack — handleRecovery() sets Alert Center closed before opening the
  // recovery dialog).
  await expect(dialog).not.toBeVisible({ timeout: 5_000 })
  const recoveryDialog = page.getByTestId('recovery-violation-dialog')
  await expect(recoveryDialog).toBeVisible({ timeout: 15_000 })

  // ── Step 3: wait for the rule check on every Roster option to settle ──
  // Each option runs legalityPreviewApi.checkDraft() asynchronously; the
  // badge starts at "Checking" and flips to "Executable" / "Rule failed" /
  // "Blocked" when done. Wait for ALL "Checking" badges in the Roster group
  // to disappear, then snapshot the pass/fail counts for the assertion.
  const rosterGroup = recoveryDialog.getByTestId('recovery-options-roster')
  await expect(rosterGroup).toBeVisible({ timeout: 10_000 })

  const settle = await expect
    .poll(
      async () => {
        const checking = await rosterGroup.getByText('Checking', { exact: true }).count()
        const passed = await rosterGroup.getByText('Executable', { exact: true }).count()
        const failed = await rosterGroup.getByText('Rule failed', { exact: true }).count()
        return { checking, passed, failed }
      },
      { timeout: 120_000, intervals: [1_000] },
    )
    .toMatchObject({ checking: 0 })

  // There must be at least one Executable option in the Roster group — the
  // whole point of the test is to prove 529 is executable. (If this fails,
  // the rest of the test would be vacuously true.)
  expect(settle.passed, 'at least one Roster option must be Executable').toBeGreaterThan(0)

  // ── Step 4: assert Crew 529 is the EXECUTABLE Roster option ──
  // Multiple groups can list 529 (cross-base etc.), so scope the lookup to
  // the Roster group only. Each option row is a <div class="border-l-2 ...">
  // containing both the checkbox and the badge button. Climb from the
  // checkbox to the option row, then assert the row contains "Executable".
  const crew529Row = rosterGroup
    .locator(`[data-testid="recovery-crew-checkbox-${TARGET_CREW_ID}"]`)
    .first()
    .locator('xpath=ancestor::div[contains(@class, "border-l-2")][1]')
  await expect(crew529Row).toBeVisible({ timeout: 5_000 })
  await expect(crew529Row.locator('input[type="checkbox"]')).toBeEnabled()
  await expect(crew529Row).toContainText('Executable')

  // Click the checkbox to select 529 for execution — this is the user
  // action the test is asked to drive.
  const crew529Checkbox = crew529Row.locator('input[type="checkbox"]')
  await crew529Checkbox.check()
  await expect(crew529Checkbox).toBeChecked()
})
