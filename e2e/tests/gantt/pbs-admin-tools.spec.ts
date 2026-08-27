import { test, expect, type Page } from '@playwright/test'

/**
 * PBS Admin Tools view (gantt/src/components/pbs/pbs-admin-tools.tsx), reached via the
 * PBS top-nav tab → "Admin Tools" sidebar item.
 *
 * Read-only structural test: it asserts the three real workflow sections render with
 * their controls (period selector, Dry Run, Refresh) — not merely that "a view loaded".
 * No imports/exports are triggered, so no data is written.
 */
const seedFakeAuth = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'rois-auth',
      JSON.stringify({
        user: { userCode: 'admin', userName: 'Admin', schema: 'f8', isAdmin: 1 },
        token: 'test-token',
      }),
    )
  })

  await page.route('**/altair/live/**', async (route) => {
    await route.fulfill({ json: { code: 200, message: 'ok', data: null } })
  })
  await page.route('**/altair/live/api/auth/me', async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        message: 'ok',
        data: { userCode: 'admin', userName: 'Admin', schema: 'f8', isAdmin: 1 },
      },
    })
  })
  await page.route('**/altair/live/api/base', async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        message: 'ok',
        data: [{ id: 1, base: 'YYZ', name: 'YYZ', filiale: 'F8', isPrimeDisplayBase: 1, displayOrder: 1 }],
      },
    })
  })
  await page.route('**/altair/live/api/rank', async (route) => {
    await route.fulfill({ json: { code: 200, message: 'ok', data: [] } })
  })
  await page.route('**/altair/live/api/fleet', async (route) => {
    await route.fulfill({ json: { code: 200, message: 'ok', data: [] } })
  })
  await page.route('**/altair/live/api/pairing/types', async (route) => {
    await route.fulfill({ json: { code: 200, message: 'ok', data: [] } })
  })
  await page.route('**/altair/live/api/pbs/periods', async (route) => {
    await route.fulfill({
      json: { code: 200, message: 'ok', data: [{ periodCode: 'Mar 2026' }, { periodCode: 'Jun 2026' }] },
    })
  })
  await page.route('**/altair/live/api/pbs/period-admin**', async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        message: 'ok',
        data: {
          rows: [
            { id: 3, periodCode: 'Mar 2026', rpStart: '2026-03-02 00:00:00', rpEnd: '2026-03-31 23:59:59' },
            { id: 6, periodCode: 'Jun 2026', rpStart: '2026-06-01 00:00:00', rpEnd: '2026-06-30 23:59:59' },
          ],
          total: 2,
        },
      },
    })
  })
  await page.route(/.*\/altair\/live\/api\/admin\/crew-bid-imports(\?.*)?$/, async (route) => {
    await route.fulfill({ json: { code: 200, message: 'ok', data: { runs: [] } } })
  })
}

test.describe('PBS Admin Tools', () => {
  test.beforeEach(async ({ page }) => {
    await seedFakeAuth(page)
    await page.goto('/altair/')
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
  })

  test('PbsAdmin-1 — Admin Tools shows Export / Import / Runs sections and their controls', async ({ page }) => {
    await page.getByTestId('nav-pbs').click()
    await page.getByTestId('pbs-nav-admin-tools').click()

    await expect(page.getByRole('heading', { name: 'Admin Tools' })).toBeVisible({ timeout: 10_000 })

    // The three workflow sections (h2 headings).
    await expect(page.getByRole('heading', { name: 'Algorithm Export' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Crew Bid Import' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Import Runs' })).toBeVisible()

    // Key controls of each section are present.
    await expect(page.getByTestId('pbs-export-period')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Current Package' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'YEG Test Package' })).toHaveCount(0)
    await expect(page.getByTestId('pbs-import-base')).toHaveValue('')
    await expect(page.getByRole('button', { name: 'Choose TXT File' })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('No file selected')
    await expect(page.getByLabel('TXT file')).toHaveAttribute('type', 'file')
    await expect(page.getByRole('button', { name: 'Dry Run' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible()
  })

  test('PbsAdmin-2 — resume dry run shows already-imported crew without listing them as failures', async ({ page }) => {
    let dryRunRequestBody = ''
    await page.route('**/api/admin/crew-bid-imports/dry-run', async (route) => {
      dryRunRequestBody = route.request().postData() ?? ''
      await route.fulfill({
        json: {
          code: 200,
          message: 'ok',
          data: {
            rosterPeriodId: 3,
            mode: 'dry_run',
            status: 'completed_with_warnings',
            periodCode: 'Mar 2026',
            startedAt: '2026-06-24T00:00:00.000Z',
            completedAt: '2026-06-24T00:00:01.000Z',
            summary: {
              totalBlocks: 2,
              totalCrew: 2,
              selectedCrew: 2,
              readyCrew: 0,
              importedCrew: 0,
              skippedCrew: 1,
              failedCrew: 1,
              parsedPreferenceCount: 5,
              importablePreferenceCount: 1,
              importedPreferenceCount: 0,
              skippedPreferenceCount: 0,
              failedPreferenceCount: 1,
              matchedPairingCount: 0,
              unmatchedPairingCount: 0,
            },
            items: [
              {
                crewId: '73',
                category: 'YYZ-737-FO',
                bidContext: 'Current',
                status: 'skipped',
                parsedPreferenceCount: 3,
                importablePreferenceCount: 0,
                importedPreferenceCount: 0,
                skippedPreferenceCount: 0,
                failedPreferenceCount: 0,
                matchedPairingCount: 0,
                unmatchedPairingCount: 0,
                importedBidId: 9073,
                message: 'Already imported by previous run previous-run-73; skipped for resume import.',
              },
              {
                crewId: '237',
                category: 'YEG-737-FA',
                bidContext: 'Current',
                status: 'failed',
                parsedPreferenceCount: 2,
                importablePreferenceCount: 1,
                importedPreferenceCount: 0,
                skippedPreferenceCount: 0,
                failedPreferenceCount: 1,
                matchedPairingCount: 0,
                unmatchedPairingCount: 0,
                message: 'value too long for type character varying(1000)',
              },
            ],
            problems: [
              {
                crewId: '237',
                category: 'YEG-737-FA',
                bidContext: 'Current',
                severity: 'error',
                code: 'bid_write_failed',
                message: 'value too long for type character varying(1000)',
              },
            ],
          },
        },
      })
    })

    await page.getByTestId('nav-pbs').click()
    await page.getByTestId('pbs-nav-admin-tools').click()
    await expect(page.getByRole('heading', { name: 'Admin Tools' })).toBeVisible({ timeout: 10_000 })

    const fileChooserPromise = page.waitForEvent('filechooser')
    const chooseFileButton = page.getByRole('button', { name: 'Choose TXT File' })
    await chooseFileButton.focus()
    await chooseFileButton.press('Enter')
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles({
      name: 'CLASS-BidsReport_March2026.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Period: March 2026\n'),
    })
    await expect(page.getByRole('status')).toHaveText('CLASS-BidsReport_March2026.txt')
    await page.getByRole('button', { name: 'Dry Run' }).click()

    expect(dryRunRequestBody).toContain('name="rosterPeriodId"')
    expect(dryRunRequestBody).toContain('3')
    expect(dryRunRequestBody).not.toContain('name="periodCode"')
    expect(dryRunRequestBody).not.toContain('name="scopeBase"')
    await expect(page.getByText('Skipped Crew')).toBeVisible()
    await expect(page.getByText('1 crew already imported from a previous run were skipped for this resume import.')).toBeVisible()
    await expect(page.getByRole('button', { name: /All\s+1/ })).toBeVisible()
    await expect(page.getByText('bid_write_failed')).toBeVisible()
    await expect(page.getByText('Already imported by previous run previous-run-73')).toHaveCount(0)
  })
})
