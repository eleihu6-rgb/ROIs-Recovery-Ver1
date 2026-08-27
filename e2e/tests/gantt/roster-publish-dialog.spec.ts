import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const envelope = (data: unknown) => ({ code: 200, data, message: 'ok' })

interface MockPublishDiffRow {
  key: string
  kind: 'FLYING' | 'GROUND'
  status: 'ADD' | 'UPDATE' | 'DELETE' | 'NO_CHANGE'
  crewId: string
  crewName: string
  crewFleet: string
  base: string
  pairingId: number | null
  pairingLabel: string
  rosterIds: number[]
  publishIds: number[]
  assignmentGroup: string
  assignment: string
  actingRank: string
  schStrDtUtc: string
  schEndDtUtc: string
  segmentCount: number
  changedFields: string[]
  publishStatus: 'PUBLISHED' | 'UNPUBLISHED'
  source: string
  noc: 'Ignore' | 'Pending' | 'Success' | null
}

interface MockPublishDiffRequest {
  pageSize?: number
  publishStatus?: string
  statuses?: string[]
  divisions?: string[]
  crewId?: string
}

interface MockPublishRosterOptions {
  largeDiff?: boolean
  sameCrewState?: { published: boolean }
}

const makePublishDiffRow = (index: number, overrides: Partial<MockPublishDiffRow> = {}): MockPublishDiffRow => ({
  key: `F|C${String(index).padStart(5, '0')}|9001`,
  kind: 'FLYING',
  status: 'UPDATE',
  crewId: `C${String(index).padStart(5, '0')}`,
  crewName: `Crew ${index}`,
  crewFleet: 'A321',
  base: 'YVR',
  pairingId: 9001,
  pairingLabel: 'PAIR-9001',
  rosterIds: [10000 + index],
  publishIds: [20000 + index],
  assignmentGroup: 'FLY',
  assignment: 'FLY',
  actingRank: 'FO',
  schStrDtUtc: '2026-06-03T10:00:00.000Z',
  schEndDtUtc: '2026-06-04T18:00:00.000Z',
  segmentCount: 1,
  changedFields: ['brief_start_utc'],
  publishStatus: 'UNPUBLISHED',
  source: 'CR',
  noc: 'Pending',
  ...overrides,
})

const mockPublishRosterApis = async (page: Page, options?: MockPublishRosterOptions): Promise<MockPublishDiffRequest[]> => {
  const diffRequests: MockPublishDiffRequest[] = []
  await page.route('**/live/api/roster-periods', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope({
        items: [
          { id: 6, rosterPeriod: '2026-06', name: '2026-06', rpStart: '2026-06-01', rpEnd: '2026-06-30', isCurrent: true },
        ],
      })),
    })
  })
  await page.route('**/live/api/fleet', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope([{ id: 1, fleet: 'A321', description: 'Airbus 321', fleetGrp: 'A320', acType: 'A321', displayOrder: 1 }])),
    })
  })
  await page.route('**/live/api/base', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope([{ id: 1, base: 'YVR', name: 'Vancouver', filiale: 'F8', isPrimeDisplayBase: 1, displayOrder: 1 }])),
    })
  })
  await page.route('**/live/api/rank', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope([])) })
  })
  await page.route('**/live/api/pairing/types', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope([])) })
  })
  await page.route('**/live/api/division', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope([
        { id: 1, division: 'P', description: 'Pilot' },
        { id: 2, division: 'C', description: 'Cabin' },
      ])),
    })
  })
  await page.route('**/live/api/roster/publish/diff', async (route) => {
    const request = route.request().postDataJSON() as MockPublishDiffRequest | null
    if (request) diffRequests.push(request)
    expect(request?.pageSize).toBe(0)
    expect(request?.publishStatus).toBeUndefined()
    const items = options?.largeDiff
      ? Array.from({ length: 8000 }, (_, index) => makePublishDiffRow(index))
      : options?.sameCrewState
        ? [
            makePublishDiffRow(1, {
              status: options.sameCrewState.published ? 'NO_CHANGE' : 'UPDATE',
              changedFields: options.sameCrewState.published ? [] : ['brief_start_utc'],
              publishStatus: options.sameCrewState.published ? 'PUBLISHED' : 'UNPUBLISHED',
            }),
            makePublishDiffRow(1, {
              key: 'F|C00001|9002',
              pairingId: 9002,
              pairingLabel: 'PAIR-9002',
              rosterIds: [10002],
              publishIds: [20002],
              status: options.sameCrewState.published ? 'NO_CHANGE' : 'UPDATE',
              changedFields: options.sameCrewState.published ? [] : ['assignment'],
              publishStatus: options.sameCrewState.published ? 'PUBLISHED' : 'UNPUBLISHED',
            }),
          ]
        : [
          makePublishDiffRow(1),
          makePublishDiffRow(2, {
            key: 'F|C00002|9002',
            status: 'NO_CHANGE',
            pairingId: 9002,
            pairingLabel: 'PAIR-9002',
            publishStatus: 'PUBLISHED',
            changedFields: [],
            source: 'IMP',
            noc: 'Ignore',
          }),
        ]
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope({
        items,
        total: items.length,
        page: 1,
        pageSize: 0,
        summary: {
          add: 0,
          update: items.filter((item) => item.status === 'UPDATE').length,
          delete: 0,
          noChange: items.filter((item) => item.status === 'NO_CHANGE').length,
          actionable: items.filter((item) => item.status !== 'NO_CHANGE').length,
        },
      })),
    })
  })
  return diffRequests
}

const openPublishRosterDialog = async (page: Page, request: APIRequestContext, options?: MockPublishRosterOptions) => {
  await seedGanttAuth(page, request)
  const diffRequests = await mockPublishRosterApis(page, options)
  await page.goto('/altair/')
  await page.getByTestId('module-nav-live').click()
  await page.getByTestId('roster-publish-btn').click()
  const dialog = page.getByTestId('roster-publish-dialog')
  await expect(dialog).toBeVisible()
  return { dialog, diffRequests }
}

const clickDropdownArrow = async (page: Page, testId: string): Promise<void> => {
  await page.getByTestId(testId).locator('span').last().click()
}

test('Live-1420: Publish Roster dialog exposes current filters and omits removed legacy fields', async ({ page, request }) => {
  const { dialog, diffRequests } = await openPublishRosterDialog(page, request)
  await expect(dialog.getByText('Publish Roster')).toBeVisible()
  await expect(page.getByTestId('roster-publish-filters')).toBeVisible()
  await expect(page.getByTestId('roster-publish-start-date')).toHaveValue('2026-06-01')
  await expect(page.getByTestId('roster-publish-end-date')).toHaveValue('2026-06-30')
  await page.getByTestId('roster-publish-fleet-trigger').click()
  await expect(page.getByTestId('roster-publish-fleet-opt-A321')).toContainText('A321')
  await page.getByTestId('roster-publish-fleet-trigger').click()
  await page.getByTestId('roster-publish-bases-trigger').click()
  await expect(page.getByTestId('roster-publish-bases-opt-YVR')).toContainText('YVR')
  await page.getByTestId('roster-publish-bases-trigger').click()
  await expect(page.getByTestId('roster-publish-division-trigger')).toContainText('P')
  await expect(page.getByTestId('roster-publish-pairing-id')).toBeVisible()
  await expect(page.getByTestId('roster-publish-pairing-label')).toBeVisible()
  const statusBox = await page.getByTestId('roster-publish-status').boundingBox()
  const divisionBox = await page.getByTestId('roster-publish-division-trigger').boundingBox()
  const labelBox = await page.getByTestId('roster-publish-pairing-label').boundingBox()
  const searchBox = await page.getByTestId('roster-publish-search').boundingBox()
  const resetBox = await page.getByTestId('roster-publish-reset').boundingBox()
  expect(statusBox).toBeTruthy()
  expect(divisionBox).toBeTruthy()
  expect(labelBox).toBeTruthy()
  expect(searchBox).toBeTruthy()
  expect(resetBox).toBeTruthy()
  expect(statusBox!.x + statusBox!.width).toBeLessThanOrEqual(divisionBox!.x + 2)
  expect(Math.abs(statusBox!.y - divisionBox!.y)).toBeLessThanOrEqual(2)
  expect(labelBox!.x + labelBox!.width).toBeLessThanOrEqual(searchBox!.x + 2)
  expect(Math.abs(labelBox!.y - searchBox!.y)).toBeLessThanOrEqual(2)
  expect(searchBox!.x + searchBox!.width).toBeLessThanOrEqual(resetBox!.x + 2)
  await expect(dialog.getByText('Flight Number')).toHaveCount(0)
  await expect(dialog.getByText('Task Type')).toHaveCount(0)
  await expect(dialog.getByText('Modified By')).toHaveCount(0)
  await expect(dialog.getByText('Check Type')).toHaveCount(0)
  await expect(dialog.getByText('TS Flag')).toHaveCount(0)

  await page.getByTestId('roster-publish-search').click()
  await expect.poll(() => diffRequests.length).toBeGreaterThan(0)
  expect(diffRequests.at(-1)?.divisions).toEqual(['P'])
  await expect(dialog.getByText('PAIR-9001')).toBeVisible()
  await expect(dialog.getByText('PAIR-9002')).toBeVisible()
  await expect(page.getByTestId('roster-publish-selected-count')).toContainText('Selected: 1/2')
  await expect(page.getByTestId('roster-publish-row-F|C00002|9002')).toHaveClass(/bg-muted\/30/)
  await expect(page.getByTestId('roster-publish-row-F|C00002|9002').locator('input[type="checkbox"]')).toBeDisabled()
  await expect(page.getByTestId('roster-publish-row-F|C00001|9001')).toBeVisible()
  await expect(dialog.getByText(/Page 1/)).toHaveCount(0)

  await clickDropdownArrow(page, 'roster-publish-division-trigger')
  await expect(page.getByTestId('roster-publish-division-opt-P')).toContainText('P')
  await expect(page.getByTestId('roster-publish-division-opt-C')).toContainText('C')
  await expect(page.getByTestId('roster-publish-division-trigger')).toContainText('P')
  await expect(page.getByTestId('roster-publish-selected-count')).toContainText('Selected: 1/2')
  await dialog.getByText('Publish Roster').click()
  await expect(async () => {
    const hasHorizontalOverflow = await page.getByTestId('roster-publish-table').locator('xpath=..').evaluate((el) => (
      el.scrollWidth > el.clientWidth + 1
    ))
    expect(hasHorizontalOverflow).toBe(false)
  }).toPass()

  await clickDropdownArrow(page, 'roster-publish-division-trigger')
  await page.getByTestId('roster-publish-division-opt-C').click()
  await expect.poll(() => diffRequests.some((body) => {
    const divisions = [...(body.divisions ?? [])].sort()
    return JSON.stringify(divisions) === JSON.stringify(['C', 'P'])
  })).toBe(true)
  await page.getByTestId('roster-publish-division-opt-P').click()
  await expect.poll(() => diffRequests.some((body) => JSON.stringify(body.divisions) === JSON.stringify(['C']))).toBe(true)
})

test('Live-1424: Publish Roster Crew filter sends one exact crew id', async ({ page, request }) => {
  const { diffRequests } = await openPublishRosterDialog(page, request)

  await page.getByTestId('roster-publish-crew-id').fill(' C00001 ')
  await page.getByTestId('roster-publish-search').click()

  await expect.poll(() => diffRequests.length).toBeGreaterThan(0)
  expect(diffRequests.at(-1)?.crewId).toBe('C00001')
})

test('Live-1422: Publish Roster table virtualizes all loaded diff rows without pagination', async ({ page, request }) => {
  const { dialog } = await openPublishRosterDialog(page, request, { largeDiff: true })

  await page.getByTestId('roster-publish-search').click()
  await expect(page.getByTestId('roster-publish-selected-count')).toContainText('Selected: 8000/8000')
  await expect(dialog.getByText('C00000')).toBeVisible()
  await expect(dialog.getByText('C07999')).toHaveCount(0)
  await expect(dialog.getByText(/Page 1/)).toHaveCount(0)

  const renderedRows = await page.locator('[data-testid^="roster-publish-row-"]').count()
  expect(renderedRows).toBeLessThan(80)
})

test('Live-1423: Publish Roster keeps filters and table headers fixed while table content scrolls', async ({ page, request }) => {
  const { dialog } = await openPublishRosterDialog(page, request, { largeDiff: true })

  await page.getByTestId('roster-publish-search').click()
  const scroll = page.getByTestId('roster-publish-table-scroll')
  const header = scroll.locator('thead th').first()
  const filters = page.getByTestId('roster-publish-filters')
  const before = await header.boundingBox()
  const scrollBox = await scroll.boundingBox()
  const filtersBefore = await filters.boundingBox()
  expect(before).toBeTruthy()
  expect(scrollBox).toBeTruthy()
  expect(filtersBefore).toBeTruthy()

  await scroll.evaluate((element) => {
    element.scrollTop = 500
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
  })

  await expect.poll(async () => (await scroll.evaluate((element) => element.scrollTop))).toBeGreaterThan(0)
  const after = await header.boundingBox()
  const filtersAfter = await filters.boundingBox()
  expect(after).toBeTruthy()
  expect(filtersAfter).toBeTruthy()
  expect(Math.abs(after!.y - scrollBox!.y)).toBeLessThanOrEqual(2)
  expect(Math.abs(filtersAfter!.y - filtersBefore!.y)).toBeLessThanOrEqual(2)
  await expect(dialog).toBeVisible()
})

test('Live-1421: collapsing Select inside Publish Roster does not close the dialog', async ({ page, request }) => {
  const { dialog, diffRequests } = await openPublishRosterDialog(page, request)

  // Open Radix Select, then click the same trigger again to collapse.
  await page.getByTestId('roster-publish-status').click()
  const listbox = page.getByRole('listbox')
  await expect(listbox).toBeVisible()
  await expect(listbox.getByRole('option', { name: 'All changes' })).toBeVisible()

  // Second click on trigger: dropdown closes, dialog must remain open.
  await page.getByTestId('roster-publish-status').click({ force: true })
  await expect(listbox).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Publish Roster')).toBeVisible()

  // Choosing an option must also leave the dialog open.
  await page.getByTestId('roster-publish-status').click()
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.getByRole('option', { name: 'Add' }).click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('roster-publish-status')).toContainText('Add')
  await expect.poll(() => diffRequests.some((body) => body.statuses?.includes('ADD'))).toBe(true)

  // Overlay click still dismisses when no nested layer is open.
  await page.locator('[data-state="open"].fixed.inset-0').first().click({ position: { x: 8, y: 8 }, force: true })
  await expect(dialog).toHaveCount(0)
})

test('Live-1425: Publish Roster rejects a partial crew and succeeds after all crew changes are selected', async ({ page, request }) => {
  const state = { published: false }
  const { dialog } = await openPublishRosterDialog(page, request, { sameCrewState: state })
  const applyBodies: Array<{ rosterPeriodId: number; keys: string[] }> = []

  await page.route('**/live/api/roster/publish/apply', async (route) => {
    const body = route.request().postDataJSON() as { rosterPeriodId: number; keys: string[] }
    applyBodies.push(body)
    if (body.keys.length === 1) {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 409,
          data: null,
          message: 'Select all changes for crew C00001 before publishing.',
        }),
      })
      return
    }
    state.published = true
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope({
        batchId: 1785998972065033,
        applied: 2,
        inserted: 2,
        updated: 2,
        deleted: 2,
        skipped: 0,
        staleKeys: [],
      })),
    })
  })

  await page.getByTestId('roster-publish-search').click()
  await expect(page.getByTestId('roster-publish-selected-count')).toContainText('Selected: 2/2')
  await page.getByTestId('roster-publish-row-F|C00001|9002').locator('input[type="checkbox"]').click()
  await expect(page.getByTestId('roster-publish-selected-count')).toContainText('Selected: 1/2')

  await page.getByTestId('roster-publish-apply').click()
  await page.getByTestId('roster-publish-confirm').click()
  await expect(page.getByText('Select all changes for crew C00001 before publishing.')).toBeVisible()
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('roster-publish-selected-count')).toContainText('Selected: 1/2')
  expect(applyBodies[0]?.keys).toHaveLength(1)

  await page.getByTestId('roster-publish-row-F|C00001|9002').locator('input[type="checkbox"]').click()
  await page.getByTestId('roster-publish-confirm').click()
  await expect(page.getByText('Published 2 change(s)')).toBeVisible()
  await expect(page.getByTestId('roster-publish-selected-count')).toContainText('Selected: 0/2')
  expect(applyBodies[1]?.keys.sort()).toEqual(['F|C00001|9001', 'F|C00001|9002'])
})

test('Live-1426: Publish Roster renders Source and NOC columns', async ({ page, request }) => {
  const { dialog } = await openPublishRosterDialog(page, request)

  await page.getByTestId('roster-publish-search').click()
  await expect(dialog.getByText('Source', { exact: true })).toBeVisible()
  await expect(dialog.getByText('NOC', { exact: true })).toBeVisible()
  await expect(page.getByTestId('roster-publish-row-F|C00001|9001')).toContainText('CR')
  await expect(page.getByTestId('roster-publish-row-F|C00001|9001')).toContainText('Pending')
  await expect(page.getByTestId('roster-publish-row-F|C00002|9002')).toContainText('IMP')
  await expect(page.getByTestId('roster-publish-row-F|C00002|9002')).toContainText('Ignore')
})
