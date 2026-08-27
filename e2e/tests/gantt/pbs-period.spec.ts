/**
 * PBS Period admin page — real UI CRUD flow.
 *
 * §No-Illusion: this drives the actual PBS tab, dialog, table, and delete confirmation.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { ganttApiUrl, seedGanttAuth } from '../../utils/gantt-hook'

interface PbsPeriodApiRow {
  id: number
  periodCode: string
}

const openPbsPeriodPage = async (page: Page): Promise<void> => {
  await page.goto('/altair/')
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
  await page.getByTestId('nav-pbs').click()
  await page.getByTestId('pbs-nav-period').click()
  await expect(page.getByTestId('pbs-period-view')).toBeVisible({ timeout: 10_000 })
}

const cleanupPbsPeriods = async (
  request: APIRequestContext,
  token: string,
  periodPrefix: string,
): Promise<void> => {
  const query = await request.get(
    `${ganttApiUrl}/api/pbs/period-admin?periodCode=${encodeURIComponent(periodPrefix)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(query.ok(), `period cleanup query failed: ${query.status()}`).toBeTruthy()
  const body = await query.json() as { data?: { rows?: PbsPeriodApiRow[] } }
  const staleRows = (body.data?.rows ?? []).filter((row) => row.periodCode.startsWith(periodPrefix))

  for (const row of staleRows) {
    const deletion = await request.delete(
      `${ganttApiUrl}/api/pbs/period-admin/${row.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(deletion.ok(), `period cleanup delete failed: ${deletion.status()}`).toBeTruthy()
  }
}

const cleanupGeneratedYearPeriods = async (
  request: APIRequestContext,
  token: string,
  year: number,
): Promise<void> => {
  const query = await request.get(
    `${ganttApiUrl}/api/pbs/period-admin?periodCode=${year}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(query.ok(), `year cleanup query failed: ${query.status()}`).toBeTruthy()
  const body = await query.json() as { data?: { rows?: PbsPeriodApiRow[] } }
  const staleRows = (body.data?.rows ?? []).filter((row) => row.periodCode.endsWith(` ${year}`))

  for (const row of staleRows) {
    const deletion = await request.delete(
      `${ganttApiUrl}/api/pbs/period-admin/${row.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(deletion.ok(), `year cleanup delete failed: ${deletion.status()}`).toBeTruthy()
  }
}

test.describe('PBS Period admin', () => {
  test('PbsPeriod-1 — create, edit, and delete a PBS period from the PBS tab', async ({ page, request }) => {
    const token = await seedGanttAuth(page, request)
    const periodCode = 'Nov 2092'
    const savedPayloads: Array<Record<string, unknown>> = []
    page.on('request', (outgoingRequest) => {
      const isPeriodWrite = outgoingRequest.method() === 'POST'
        ? outgoingRequest.url().endsWith('/api/pbs/period-admin')
        : outgoingRequest.method() === 'PATCH'
          && /\/api\/pbs\/period-admin\/\d+$/.test(outgoingRequest.url())
      if (isPeriodWrite) {
        savedPayloads.push(outgoingRequest.postDataJSON() as Record<string, unknown>)
      }
    })

    await cleanupPbsPeriods(request, token, periodCode)
    try {
      await openPbsPeriodPage(page)

      await page.getByTestId('pbs-period-add').click()
      await expect(page.getByTestId('pbs-period-dialog')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByTestId('pbs-period-field-rosterPeriodId')).toHaveCount(0)
      await expect(page.getByTestId('pbs-period-field-filiale')).toHaveCount(0)
      await expect(page.getByTestId('pbs-period-field-awardRunAt')).toHaveCount(0)
      await expect(page.getByTestId('pbs-period-field-awardPublishAt')).toBeVisible()
      await expect(page.getByTestId('pbs-period-field-awardFinalAt')).toBeVisible()
      await expect(page.getByTestId('pbs-period-field-misAwardDeadlineAt')).toBeVisible()
      await expect(page.getByTestId('pbs-period-field-maxTiers')).toHaveCount(0)
      await expect(page.getByTestId('pbs-period-field-description')).toHaveCount(0)

      await page.getByTestId('pbs-period-field-periodCode').fill(periodCode)
      await page.getByTestId('pbs-period-field-rpStart').fill('2092-11-01T00:00:17')
      await page.getByTestId('pbs-period-field-rpEnd').fill('2092-11-30T23:59:18')
      await page.getByTestId('pbs-period-field-bidOpenAt').fill('2092-10-01T09:00:19')
      await page.getByTestId('pbs-period-field-bidCloseAt').fill('2092-10-20T17:00:20')
      await page.getByTestId('pbs-period-field-awardPublishAt').fill('2092-10-25T09:00:21')
      await page.getByTestId('pbs-period-field-awardFinalAt').fill('2092-10-27T09:00:22')
      await page.getByTestId('pbs-period-field-misAwardDeadlineAt').fill('2092-10-31T09:00:23')
      await page.getByTestId('pbs-period-save').click()

      await page.getByTestId('pbs-period-filter-periodCode').fill(periodCode)
      await page.getByTestId('pbs-period-search').click()

      const table = page.getByTestId('pbs-period-table')
      const createdRow = table.locator('tbody tr', { hasText: periodCode }).first()
      await expect(createdRow).toBeVisible({ timeout: 10_000 })
      expect(savedPayloads[0]).not.toHaveProperty('rosterPeriodId')
      expect(savedPayloads[0]).not.toHaveProperty('filiale')
      expect(savedPayloads[0]).not.toHaveProperty('awardRunAt')
      expect(savedPayloads[0]).toMatchObject({
        rpStart: '2092-11-01T00:00:17',
        rpEnd: '2092-11-30T23:59:18',
        awardPublishAt: '2092-10-25T09:00:21',
      })
      expect(savedPayloads[0]).not.toHaveProperty('maxTiers')
      expect(savedPayloads[0]).not.toHaveProperty('description')

      await createdRow.locator('[data-testid^="pbs-period-edit-"]').click()
      await expect(page.getByTestId('pbs-period-dialog')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByTestId('pbs-period-field-rosterPeriodId')).toHaveCount(0)
      await expect(page.getByTestId('pbs-period-field-filiale')).toHaveCount(0)
      await expect(page.getByTestId('pbs-period-field-awardRunAt')).toHaveCount(0)
      await expect(page.getByTestId('pbs-period-field-awardPublishAt')).toBeVisible()
      await expect(page.getByTestId('pbs-period-field-awardFinalAt')).toBeVisible()
      await expect(page.getByTestId('pbs-period-field-misAwardDeadlineAt')).toBeVisible()
      await expect(page.getByTestId('pbs-period-field-maxTiers')).toHaveCount(0)
      await expect(page.getByTestId('pbs-period-field-description')).toHaveCount(0)
      await expect(page.getByTestId('pbs-period-field-status')).toHaveCount(0)
      await expect(page.getByTestId('pbs-period-field-awardPublishAt')).toHaveValue('2092-10-25T09:00:21')
      await expect(page.getByTestId('pbs-period-field-awardFinalAt')).toHaveValue('2092-10-27T09:00:22')
      await expect(page.getByTestId('pbs-period-field-misAwardDeadlineAt')).toHaveValue('2092-10-31T09:00:23')
      await page.getByTestId('pbs-period-field-bidCloseAt').fill('2092-10-20T18:00:22')
      await page.getByTestId('pbs-period-save').click()

      await expect(createdRow).toContainText('2092/10/20 18:00:22', { timeout: 10_000 })
      expect(savedPayloads[1]).not.toHaveProperty('rosterPeriodId')
      expect(savedPayloads[1]).not.toHaveProperty('filiale')
      expect(savedPayloads[1]).not.toHaveProperty('awardRunAt')
      expect(savedPayloads[1]).toHaveProperty('awardPublishAt')
      expect(savedPayloads[1]).not.toHaveProperty('maxTiers')
      expect(savedPayloads[1]).not.toHaveProperty('description')

      await createdRow.locator('[data-testid^="pbs-period-delete-"]').click()
      await createdRow.locator('[data-testid^="pbs-period-delete-confirm-"]').click()
      await expect(table.locator('tbody tr', { hasText: periodCode })).toHaveCount(0, { timeout: 10_000 })
    } finally {
      await cleanupPbsPeriods(request, token, periodCode)
    }
  })

  test('PbsPeriod-2 — generate a full PBS year and skip existing periods', async ({ page, request }) => {
    const token = await seedGanttAuth(page, request)
    const year = 2091
    const yearPayloads: Array<Record<string, unknown>> = []
    page.on('request', (outgoingRequest) => {
      if (outgoingRequest.method() === 'POST' && outgoingRequest.url().includes('/api/pbs/period-admin/generate-year')) {
        yearPayloads.push(outgoingRequest.postDataJSON() as Record<string, unknown>)
      }
    })

    await cleanupGeneratedYearPeriods(request, token, year)
    try {
      await openPbsPeriodPage(page)

      await page.getByTestId('pbs-period-generate-year').click()
      await expect(page.getByTestId('pbs-period-year-dialog')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByTestId('pbs-period-year-field-filiale')).toHaveCount(0)
      await expect(page.getByTestId('pbs-period-year-field-maxTiers')).toHaveCount(0)

      await page.getByTestId('pbs-period-year-field-year').fill(String(year))
      await page.getByTestId('pbs-period-year-preview').click()
      expect(yearPayloads[0]).not.toHaveProperty('filiale')
      expect(yearPayloads[0]).not.toHaveProperty('maxTiers')

      const previewTable = page.getByTestId('pbs-period-year-preview-table')
      const janPreviewRow = previewTable.locator('tbody tr', { hasText: `Jan ${year}` })
      await expect(janPreviewRow).toContainText('New', {
        timeout: 10_000,
      })
      await expect(janPreviewRow).toContainText('2090/12/01 00:00:00')
      await expect(janPreviewRow).toContainText('2090/12/08 23:59:00')
      await expect(previewTable.locator('tbody tr', { hasText: `Dec ${year}` })).toBeVisible()

      await page.getByTestId('pbs-period-year-save').click()
      await expect(page.getByTestId('pbs-period-year-dialog')).toHaveCount(0, { timeout: 10_000 })
      expect(yearPayloads[1]).not.toHaveProperty('filiale')
      expect(yearPayloads[1]).not.toHaveProperty('maxTiers')

      await page.getByTestId('pbs-period-filter-periodCode').fill(String(year))
      await page.getByTestId('pbs-period-search').click()
      const table = page.getByTestId('pbs-period-table')
      const tableRows = table.locator('tbody tr')
      await expect(tableRows).toHaveCount(12, { timeout: 10_000 })
      await expect(tableRows.first()).toContainText(`Jan ${year}`)
      await expect(tableRows.nth(11)).toContainText(`Dec ${year}`)
      const janTableRow = table.locator('tbody tr', { hasText: `Jan ${year}` })
      await expect(janTableRow).toBeVisible({ timeout: 10_000 })
      await expect(janTableRow).toContainText('2090/12/01 00:00:00')
      await expect(janTableRow).toContainText('2090/12/08 23:59:00')
      await expect(table.locator('tbody tr', { hasText: `Dec ${year}` })).toBeVisible()

      await page.getByTestId('pbs-period-generate-year').click()
      await expect(page.getByTestId('pbs-period-year-field-filiale')).toHaveCount(0)
      await expect(page.getByTestId('pbs-period-year-field-maxTiers')).toHaveCount(0)
      await page.getByTestId('pbs-period-year-field-year').fill(String(year))
      await page.getByTestId('pbs-period-year-preview').click()
      const existingPreview = page.getByTestId('pbs-period-year-preview-table')
      await expect(existingPreview.locator('tbody tr', { hasText: `Jan ${year}` })).toContainText('Existing', {
        timeout: 10_000,
      })
      await page.getByRole('button', { name: 'Cancel' }).click()
    } finally {
      await cleanupGeneratedYearPeriods(request, token, year)
    }
  })

  test('PbsPeriod-3 — obsolete portal active period controls are removed', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await openPbsPeriodPage(page)

    await expect(page.getByText('PBS Business Time')).toHaveCount(0)
    await expect(page.getByTestId('pbs-business-time-card')).toHaveCount(0)
    await expect(page.getByText('Filters')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Periods' })).toBeVisible()
    await expect(page.getByText('Portal Active Period')).toHaveCount(0)
    await expect(page.getByText('Selection Mode')).toHaveCount(0)
    await expect(page.getByText('Manual Period')).toHaveCount(0)
    await expect(page.getByTestId('pbs-period-portal-save')).toHaveCount(0)
    await expect(page.getByText('Division', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Filiale', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Max Tiers', { exact: true })).toHaveCount(0)
    await expect(page.getByTestId('pbs-period-filter-division')).toHaveCount(0)
    await page.getByTestId('pbs-period-add').click()
    await expect(page.getByTestId('pbs-period-field-division')).toHaveCount(0)
    await expect(page.getByTestId('pbs-period-field-filiale')).toHaveCount(0)
    await expect(page.getByTestId('pbs-period-field-awardRunAt')).toHaveCount(0)
    await expect(page.getByTestId('pbs-period-field-awardPublishAt')).toBeVisible()
    await expect(page.getByTestId('pbs-period-field-awardFinalAt')).toBeVisible()
    await expect(page.getByTestId('pbs-period-field-misAwardDeadlineAt')).toBeVisible()
    await expect(page.getByTestId('pbs-period-field-maxTiers')).toHaveCount(0)
    await expect(page.getByTestId('pbs-period-field-description')).toHaveCount(0)
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.getByTestId('pbs-period-generate-year').click()
    await expect(page.getByTestId('pbs-period-year-field-division')).toHaveCount(0)
    await expect(page.getByTestId('pbs-period-year-field-filiale')).toHaveCount(0)
    await expect(page.getByTestId('pbs-period-year-field-maxTiers')).toHaveCount(0)
    await page.getByRole('button', { name: 'Cancel' }).click()
  })
})
