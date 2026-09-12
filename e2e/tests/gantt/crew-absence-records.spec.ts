/**
 * Crew recovery story 101, step 5 — planner views crew absence records.
 *
 * Two real-UI surfaces over the same `crew_absence` table:
 *   B. Live roster pane toolbar → Crew Absence icon → query dialog (all records,
 *      filter by crew/status/date, row click floats the crew, pairing chip loads
 *      the reopened pairing into the Pairing pane).
 *   C. Data module → Crew Master → crew ID → "Crew Absence" section.
 *
 * Fixture: a sick-leave submission for J4002 seeded through the crew-app endpoint
 * (the exact request the app sends), covering 2026-09-25..26 → pairing 152056
 * stood down. Shared SIT data is reset before and after.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { createDbHelper, type DbHelper } from '../../utils/db-helper'
import { ganttApiUrl, readHook, seedGanttAuth, setDateRange } from '../../utils/gantt-hook'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '../../..')
const SCREENSHOT_DIR = path.join(REPO_ROOT, 'docs/assets/screenshots/gantt')

const CREW_ID = 'J4002'
const CREW_PASSWORD = 'Pier2026'
const PAIRING_ID = 152056
const FROM_DATE = '2026-09-25'
const TO_DATE = '2026-09-26'

const nextVersioned = (base: string): string => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true })
  let version = 1
  while (existsSync(path.join(SCREENSHOT_DIR, `${base}-Ver${version}.png`))) version++
  return path.join(SCREENSHOT_DIR, `${base}-Ver${version}.png`)
}

const openDb = async (): Promise<DbHelper> => {
  const envText = readFileSync(path.join(REPO_ROOT, 'live-server/.env'), 'utf8')
  const raw = envText.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '')
  if (!raw) throw new Error('live-server/.env has no DATABASE_URL')
  const url = new URL(raw)
  const schema = decodeURIComponent(url.searchParams.get('options') ?? '').match(/search_path=(\w+)/)?.[1]
  if (!schema) throw new Error('DATABASE_URL has no search_path option')
  return createDbHelper({
    host: url.hostname, port: Number(url.port || 5432), database: url.pathname.slice(1),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), schema,
  })
}

const resetFixture = async (db: DbHelper): Promise<void> => {
  await db.query(
    `update roster_flight set is_deleted = 0, request_source = null, request_id = null
      where crew_id = $1 and pairing_id = $2 and request_source = 'CREW_APP'`,
    [CREW_ID, PAIRING_ID],
  )
  await db.query(
    `delete from roster_flight where crew_id = $1 and pairing_id is null and assignment = 'ILL' and request_source = 'CREW_APP'
        and sch_str_dt_utc >= $2::date - interval '1 day' and sch_str_dt_utc < $3::date + interval '1 day'`,
    [CREW_ID, FROM_DATE, TO_DATE],
  )
  await db.query(`delete from crew_absence where crew_id = $1 and from_date = $2::date`, [CREW_ID, FROM_DATE])
  await db.query(
    `update pairing_composition pc
        set fill = (select count(distinct rf.crew_id) from roster_flight rf
                     where rf.pairing_id = pc.pairing_id and rf.roster_acting_rank = pc.acting_rank and rf.is_deleted = 0)
      where pc.pairing_id = $1`,
    [PAIRING_ID],
  )
}

// One fixture per file: beforeAll must not run per worker.
test.describe.configure({ mode: 'serial' })

let db: DbHelper
let absenceId: number

test.beforeAll(async ({ request }) => {
  db = await openDb()
  await resetFixture(db)
  const submit = await request.post(`${ganttApiUrl}/api/crew-app/v1/absence`, {
    data: { airline: 'F8', crewId: CREW_ID, password: CREW_PASSWORD, type: 'sick', fromDate: FROM_DATE, toDate: TO_DATE, note: 'e2e absence records' },
  })
  expect(submit.status(), await submit.text()).toBe(200)
  const body = await submit.json() as { data: { absenceId: number; removedPairingIds: number[] } }
  expect(body.data.removedPairingIds).toEqual([PAIRING_ID])
  absenceId = body.data.absenceId
})

test.afterAll(async () => {
  await db.query(`delete from crew_notification where crew_id = $1 and notif_id = $2`, [CREW_ID, `absence-${absenceId}`])
  await resetFixture(db)
  await db.close()
})

test('roster pane toolbar opens the Crew Absence dialog; records are queryable and jump to crew / reopened pairing', async ({ page, request }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await seedGanttAuth(page, request)
  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto(150_000)
  await setDateRange(page, '2026-09-20', '2026-09-30')

  // B. toolbar icon → dialog, default filter = active, last 30 days onward.
  await page.getByTestId('crew-absence-button').first().click()
  const dialog = page.getByTestId('crew-absence-dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await expect(dialog).toContainText('Crew Absence')

  const row = dialog.getByTestId(`crew-absence-row-${absenceId}`)
  await expect(row).toBeVisible({ timeout: 15_000 })
  await expect(row).toContainText(CREW_ID)
  await expect(row).toContainText('Getnet Kifle')
  await expect(row).toContainText('sick')
  await expect(row).toContainText('ILL')
  await expect(row).toContainText(FROM_DATE)
  await expect(row).toContainText(TO_DATE)
  await expect(row).toContainText('active')
  await expect(row.getByTestId(`crew-absence-pairing-${PAIRING_ID}`)).toHaveText(String(PAIRING_ID))

  // Query: a crew id that has no records → explicit empty state, not a stale list.
  await dialog.getByTestId('crew-absence-filter-crew').fill('NO_SUCH_CREW')
  await dialog.getByTestId('crew-absence-search').click()
  await expect(dialog.getByTestId('crew-absence-empty')).toContainText('No absence records match the filter.', { timeout: 15_000 })
  await expect(dialog.getByTestId('crew-absence-count')).toHaveText('0 records')

  // Query: J4002 within the exact window → only this record returns.
  await dialog.getByTestId('crew-absence-filter-crew').fill(CREW_ID)
  await dialog.getByTestId('crew-absence-filter-from').fill(FROM_DATE)
  await dialog.getByTestId('crew-absence-filter-to').fill(FROM_DATE)
  await dialog.getByTestId('crew-absence-search').click()
  await expect(row).toBeVisible({ timeout: 15_000 })
  await expect(dialog.getByTestId('crew-absence-count')).toHaveText('1 record')
  await page.screenshot({ path: nextVersioned('crew-absence-dialog'), fullPage: true })

  // Pairing chip → the stood-down (now open) pairing is loaded into the Pairing pane.
  await row.getByTestId(`crew-absence-pairing-${PAIRING_ID}`).click()
  await expect
    .poll(
      () => readHook<Array<{ id: number }>>(page, 'pairings').then((items) => items.some((item) => item.id === PAIRING_ID)),
      { timeout: 30_000, message: `pairing ${PAIRING_ID} loaded into the Pairing pane` },
    )
    .toBe(true)

  // Row click → crew floated to the top of the roster pane.
  await row.click()
  await expect
    .poll(
      () => readHook<Array<{ crewId: string }>>(page, 'rosterPanelOrder').then((rows) => rows[0]?.crewId),
      { timeout: 30_000, message: `crew ${CREW_ID} brought to top of roster` },
    )
    .toBe(CREW_ID)
  await dialog.locator('button', { hasText: 'Close' }).click()
  await expect(dialog).toBeHidden()
  await page.screenshot({ path: nextVersioned('crew-absence-dialog-jump'), fullPage: true })
})

test('Data module → Crew Master shows the Crew Absence record for the crew', async ({ page, request }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await seedGanttAuth(page, request)
  await page.goto('/altair/')
  await page.getByTestId('module-nav-data').click()
  await page.getByTestId('data-view').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByTestId('data-tree-item-crew.master').click()
  await page.getByTestId('data-section-crew').waitFor({ state: 'visible', timeout: 10_000 })

  await page.getByTestId('data-filter-crew-id').fill(CREW_ID)
  await page.getByRole('button', { name: /search/i }).click()
  await expect.poll(() => page.getByTestId('data-grid-crew').locator('tbody tr').count(), { timeout: 15_000 }).toBeGreaterThan(0)

  const section = page.getByTestId('data-section-crew_absence')
  await expect(section).toBeVisible({ timeout: 15_000 })
  await section.scrollIntoViewIfNeeded()
  const body = page.getByTestId('data-section-body-crew_absence')
  if ((await body.count()) === 0) await section.getByRole('button').first().click()
  await expect(body).toBeVisible({ timeout: 10_000 })

  const grid = page.getByTestId('data-grid-crew_absence')
  const absenceRow = grid.locator('tbody tr').filter({ hasText: FROM_DATE })
  await expect(absenceRow).toHaveCount(1, { timeout: 15_000 })
  await expect(absenceRow).toContainText(CREW_ID)
  await expect(absenceRow).toContainText('sick')
  await expect(absenceRow).toContainText('ILL')
  await expect(absenceRow).toContainText(TO_DATE)
  await expect(absenceRow).toContainText(String(PAIRING_ID))
  await expect(absenceRow).toContainText('active')
  await section.screenshot({ path: nextVersioned('crew-absence-data-crew-master') })
})
