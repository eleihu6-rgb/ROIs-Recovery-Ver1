/**
 * Evidence snapshot helper for AI regression tests.
 *
 * Call this after the primary assertion point in a test to capture a screenshot
 * that proves the actual state tested. The helper:
 *   1. Takes a viewport screenshot via page.screenshot()
 *   2. Attaches it to the Playwright report as a named PNG attachment
 *   3. Emits a REGRESSION_SNAPSHOT: stdout line that ai-server/runner.py parses
 *      and copies into the artifact directory (artifacts/{run_id}/snapshots/)
 *
 * Rules (filter-test-rules §No-Illusion):
 *   - Call at the assertion point, NOT at page load (screenshot must reflect the tested state)
 *   - label should name the tested entity/action, e.g. 'after-clicking-jump-on-pairing-TG123'
 *   - Provide details with exact expected/actual values when applicable
 */
import type { Page, TestInfo } from '@playwright/test'

export interface SnapshotOptions {
  /** Short slug describing what was tested — becomes part of the filename. */
  label: string
  /**
   * Zero-based index of the assertion step this snapshot corresponds to.
   * Matches the step_index in REGRESSION_DETAIL.steps[] when both are emitted.
   */
  stepIndex?: number
  /** Structured key/value evidence metadata (expected vs actual values, entity IDs, etc.) */
  details?: Record<string, unknown>
}

export async function recordRegressionSnapshot(
  page: Page,
  testInfo: TestInfo,
  opts: SnapshotOptions,
): Promise<void> {
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+/, '')
    .replace('T', 'T')
    .slice(0, 15) + 'Z'
  const safeLabel = opts.label
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const filename = `reg-snap-${ts}-${safeLabel}.png`

  const buf = await page.screenshot({ fullPage: false })
  await testInfo.attach(filename, { body: buf, contentType: 'image/png' })

  const meta = {
    label: opts.label,
    step_index: opts.stepIndex ?? 0,
    filename,
    details: opts.details ?? {},
  }
  process.stdout.write(`REGRESSION_SNAPSHOT: ${JSON.stringify(meta)}\n`)
}
