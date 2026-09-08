/**
 * Live 8004 Recovery — Crew 113 / Pairing 135905 cross-base trace coverage
 *
 * The cross-base plan group on 113 / 135905 is empty in the manual flow. The
 * dialog logCrossBaseTrace() POSTs a diagnostic record to /api/recovery/debug-trace,
 * which appends to .dev-logs/recovery-cross-base-trace.jsonl. This spec drives the
 * UI through the same flow as recovery-8004-crew-113.spec.ts and asserts:
 *   1. The Cross-base group renders (even when empty) so the diagnostic surface
 *      is reachable.
 *   2. A non-empty trace record was appended to the JSONL log for the 113 / 135905
 *      alert. The trace contains at least one candidate so we can prove the
 *      trace was captured (not skipped).
 *
 * Spec discipline (shared with the Roster spec):
 *   - Pilot (P) division only + 9.8-9.18 date range to keep the bootstrap under
 *     the dev DB per-page budget.
 *   - 30s post-bootstrap wait for the Rust cold-start recheck to settle.
 */
import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { seedGanttAuth } from '../../utils/gantt-hook'

const SOURCE_CREW_ID = '113'
const SOURCE_PAIRING_ID = '135905'
const TRACE_LOG = resolve(process.cwd(), '.dev-logs/recovery-cross-base-trace.jsonl')

test('Live 8004 — Crew 113 / Pairing 135905 cross-base trace is logged', async ({ page, request }) => {
  test.setTimeout(180_000)
  await seedGanttAuth(page, request)
  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, {
    timeout: 30_000,
  })

  await page.getByTestId('module-nav-live').click()
  const emptyState = page.getByTestId('live-empty-state')
  await expect(emptyState).toBeVisible({ timeout: 5_000 })
  await emptyState.click()
  await expect(page.getByTestId('filter-dialog')).toBeVisible({ timeout: 5_000 })
  await page.getByTestId('filter-crew-division-P').click()
  await page.getByTestId('filter-apply').click()
  await expect(page.getByTestId('filter-dialog')).not.toBeVisible({ timeout: 10_000 })
  await expect(emptyState).not.toBeVisible({ timeout: 270_000 })

  await page.getByTestId('date-range-to').fill('2026-09-18')
  await page.getByTestId('date-range-from').fill('2026-09-08')
  await page.waitForTimeout(30_000)

  let bytesBefore = 0
  try {
    const stat = await readFile(TRACE_LOG)
    bytesBefore = stat.byteLength
  } catch { /* file may not exist yet */ }

  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible()
  const targetCheckbox = dialog.getByTestId(`alert-recovery-checkbox-${SOURCE_CREW_ID}-${SOURCE_PAIRING_ID}`)
  await expect(targetCheckbox).toBeVisible({ timeout: 15_000 })
  await expect(targetCheckbox).toBeEnabled()
  await targetCheckbox.check()
  await page.getByTestId('alert-recovery-selected').click()
  await expect(dialog).not.toBeVisible({ timeout: 5_000 })
  const recoveryDialog = page.getByTestId('recovery-violation-dialog')
  await expect(recoveryDialog).toBeVisible({ timeout: 15_000 })

  const crossBaseGroup = recoveryDialog.getByTestId('recovery-options-cross-base')
  await expect(crossBaseGroup).toBeVisible({ timeout: 10_000 })

  await page.waitForTimeout(2_000)

  const bytesAfter = (await readFile(TRACE_LOG)).byteLength
  expect(bytesAfter, "cross-base trace should have been appended").toBeGreaterThan(bytesBefore)

  const tail = (await readFile(TRACE_LOG, 'utf8')).trim().split('\\n').pop() ?? ''
  const record = JSON.parse(tail)
  expect(record.alert.crewId).toBe(SOURCE_CREW_ID)
  expect(record.alert.pairingId).toBe(Number(SOURCE_PAIRING_ID))
  expect(record.alert.ruleCode).toBe('8004')
  expect(Array.isArray(record.crossBaseTrace)).toBe(true)
  expect(record.crossBaseTrace.length).toBeGreaterThan(0)
})