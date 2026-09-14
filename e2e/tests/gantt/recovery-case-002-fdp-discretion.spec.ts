/**
 * Case 2 — Request Crew FDP discretion from the Recovery dialog.
 *
 * Fixture (prepared by .local/s2-et-consent/*, not by this test):
 *   - Pairing 152675 (ADD-B787, ET2681/ET2682/ET2683/ET2684) with a published
 *     delay on ET2681; crew T2001 (CA), T2021 (FO), T2022 (FO).
 *   - T2001 has already REJECTED the latest FDP-discretion proposal, so the
 *     Recovery row must show the "Crew rejected" status and flag Standby Crew
 *     callout as the next best answer.
 *
 * Acceptance:
 *   1. the request action sits in the ACTIONS cell BEFORE the Preview button;
 *   2. the status chip reflects the live consent state (Crew rejected);
 *   3. the request dialog carries the execution caveat;
 *   4. after a rejection the Standby group is marked "Recommended next".
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedGanttAuth } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOT_DIR = path.resolve(__dirname, '../../../docs/assets/screenshots/crew-recovery')
const PAIRING_ID = 152675
const SOURCE_CREW = 'T2001'
const CREW_IDS = [
  'T2001', 'T2002', 'T2003', 'T2004', 'T2005', 'T2006', 'T2007',
  ...Array.from({ length: 14 }, (_, i) => `T20${21 + i}`),
]
const OPTION_ID = `fdp-discretion-${PAIRING_ID}-${SOURCE_CREW}-none`

test('Case 2 — FDP discretion request action precedes Preview and points at Standby after rejection', async ({ page, request }) => {
  test.setTimeout(600_000)
  await seedGanttAuth(page, request)
  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof (window as unknown as { __ganttTest?: unknown }).__ganttTest !== 'undefined', undefined, { timeout: 30_000 })

  // ── Load Live narrowed to the case-2 crew ──────────────────────────────
  await page.getByTestId('module-nav-live').click()
  const emptyState = page.getByTestId('live-empty-state')
  await expect(emptyState).toBeVisible({ timeout: 10_000 })
  await emptyState.click()
  const filterDialog = page.getByTestId('filter-dialog')
  await expect(filterDialog).toBeVisible({ timeout: 5_000 })
  await page.getByTestId('filter-crew-division-P').click()
  const crewIdField = page.getByTestId('filter-crew-id')
  await crewIdField.fill(CREW_IDS.join(','))
  await crewIdField.press('Enter')
  await page.getByTestId('filter-apply').click()
  await expect(filterDialog).not.toBeVisible({ timeout: 10_000 })
  await expect(emptyState).not.toBeVisible({ timeout: 300_000 })

  // ── Open Recovery from the Roster pane for the delayed pairing ─────────
  await page.evaluate(({ crewId, pairingId }) => {
    (window as unknown as { __ganttTest: { openLiveRosterContextMenu: (c: string, p: number) => void } }).__ganttTest.openLiveRosterContextMenu(crewId, pairingId)
  }, { crewId: SOURCE_CREW, pairingId: PAIRING_ID })
  const rosterRecovery = page.locator('div.fixed.z-50 button').filter({ hasText: /^Recovery/ }).first()
  await expect(rosterRecovery).toBeVisible({ timeout: 15_000 })
  await rosterRecovery.click({ force: true })

  const dialog = page.getByTestId('recovery-violation-dialog')
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  await expect(dialog).toContainText('Rule 3007')
  await dialog.getByTestId('recovery-plan-filter-fdp-discretion').click()
  await expect(dialog.getByTestId('recovery-options-fdp-discretion')).toBeVisible({ timeout: 30_000 })

  // 2. Live consent state: T2001 has a rejected proposal for this duty.
  const statusChip = dialog.getByTestId('recovery-fdp-status-rejected')
  await expect(statusChip).toBeVisible({ timeout: 60_000 })
  await expect(statusChip).toContainText('Crew rejected')

  // 1. The request/resend action sits before the Preview icon in the same row.
  const requestButton = dialog.getByTestId(`recovery-fdp-request-${OPTION_ID}`)
  const previewButton = dialog.getByTestId(`recovery-preview-${OPTION_ID}`)
  await expect(requestButton).toBeVisible({ timeout: 30_000 })
  await expect(requestButton).toContainText('Resend')
  await expect(previewButton).toBeVisible()
  const requestBox = await requestButton.boundingBox()
  const previewBox = await previewButton.boundingBox()
  expect(requestBox && previewBox && requestBox.x < previewBox.x, 'request action must precede Preview').toBeTruthy()

  // 4. A rejection points at Standby Crew callout as the next best answer.
  await expect(dialog.getByTestId('recovery-fdp-fallback-hint')).toContainText('Standby Crew callout is the next best solution')
  await page.screenshot({ path: `${SHOT_DIR}/case2-fdp-discretion-rejected-Ver1.png` })
  await dialog.getByTestId('recovery-fdp-show-standby').click()
  await expect(dialog.getByTestId('recovery-plan-detail-standby')).toBeVisible({ timeout: 30_000 })
  await expect(dialog.getByTestId('recovery-standby-recommended')).toBeVisible({ timeout: 30_000 })
  await expect(dialog).toContainText('Recommended next')
  await page.screenshot({ path: `${SHOT_DIR}/case2-fdp-standby-recommended-Ver1.png` })

  // 3. The request dialog repeats the execution caveat (open only, never send).
  await dialog.getByTestId('recovery-plan-filter-fdp-discretion').click()
  await expect(dialog.getByTestId(`recovery-fdp-request-${OPTION_ID}`)).toBeVisible({ timeout: 30_000 })
  await dialog.getByTestId(`recovery-fdp-request-${OPTION_ID}`).click()
  const requestDialog = page.getByTestId('recovery-fdp-request-dialog')
  await expect(requestDialog).toBeVisible({ timeout: 15_000 })
  await expect(requestDialog.getByTestId('recovery-fdp-execution-note')).toContainText('Crew agreement communication only')
  await expect(requestDialog).toContainText('Crew rejected')
  await page.screenshot({ path: `${SHOT_DIR}/case2-fdp-request-dialog-Ver1.png` })
  await requestDialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(requestDialog).not.toBeVisible({ timeout: 10_000 })
})
