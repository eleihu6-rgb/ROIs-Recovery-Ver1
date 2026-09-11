/**
 * Crew-app ↔ Gantt GROUND-DUTY parity — ET crew J4002 (ADD, CA), September 2026.
 *
 * Why this exists: the planner added two non-flying ground duties to J4002 from the
 * Live gantt on 2026-09-11 —
 *   DO (Day Off)       ADD→ADD  roster day 9 Sep 2026
 *   AL (Annual Leave)  ADD→ADD  roster day 17 Sep 2026
 * — and the crew app has to show them on those same local days. This spec captures
 * the gantt side (screenshot + JSON artifact of the rendered rows) so the simulator
 * screenshots can be compared row-by-row instead of by eye.
 *
 * Read-only: it only sets the date range and the crew filter, never mutates a roster.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import {
  applyFilterLight,
  openFilter,
  readHook,
  seedGanttAuth,
  setDateRange,
} from '../../utils/gantt-hook'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '../../..')
const SCREENSHOT_DIR = path.join(REPO_ROOT, 'docs/assets/screenshots/crew-app')
const ARTIFACT_DIR = path.join(REPO_ROOT, 'e2e/results/crew-app-parity')

const CREW_ID = 'J4002'

interface RosterRow {
  id: number
  crewId: string
  pairingId: number | null
  label: string | null
  fltId: number | null
  assignment: string | null
  base: string
  depArp: string | null
  arvArp: string | null
  start: string | null
  end: string | null
}

const nextVersioned = (base: string): string => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true })
  let version = 1
  while (existsSync(path.join(SCREENSHOT_DIR, `${base}-Ver${version}.png`))) version++
  return path.join(SCREENSHOT_DIR, `${base}-Ver${version}.png`)
}

test('Gantt shows the two J4002 September ground duties — parity artifact for the crew app', async ({
  page,
  request,
}) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await seedGanttAuth(page, request)
  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto(150_000)

  await setDateRange(page, '2026-09-01', '2026-09-30')
  await openFilter(page, 'pairing')
  await page.getByTestId('filter-tab-crew').click()
  const crewIdInput = page.getByTestId('filter-crew-id')
  await crewIdInput.click()
  await crewIdInput.fill(CREW_ID)
  await crewIdInput.press('Enter')
  await applyFilterLight(page)

  await expect
    .poll(
      () =>
        readHook<Array<{ crewId: string }>>(page, 'rosterPanelOrder').then((rows) => rows[0]?.crewId),
      { timeout: 30_000, message: `crew ${CREW_ID} brought to top of roster` },
    )
    .toBe(CREW_ID)

  const rows = (await readHook<RosterRow[]>(page, 'roster')).filter((row) => row.crewId === CREW_ID)
  expect(rows.length, 'gantt must hold J4002 duty rows for September').toBeGreaterThan(0)

  const groundDuties = rows.filter((row) => row.pairingId === null || row.fltId === null)
  const byAssignment = new Map(groundDuties.map((row) => [String(row.assignment), row]))

  const dayOff = byAssignment.get('DO')
  expect(dayOff, 'gantt must render the 9 Sep Day Off row').toBeTruthy()
  // The DO row covers the ADD-local calendar day 9 Sep: 08 Sep 21:00Z → 09 Sep 20:59Z.
  expect(dayOff?.start).toBe('2026-09-08T21:00:00.000Z')
  expect(dayOff?.end).toBe('2026-09-09T20:59:00.000Z')

  const annualLeave = byAssignment.get('AL')
  expect(annualLeave, 'gantt must render the 17 Sep Annual Leave row').toBeTruthy()
  expect(annualLeave?.start).toBe('2026-09-16T21:00:00.000Z')
  expect(annualLeave?.end).toBe('2026-09-17T20:59:00.000Z')

  const artifact = {
    crewId: CREW_ID,
    period: '2026-09',
    capturedAt: new Date().toISOString(),
    rowCount: rows.length,
    groundDutyCount: groundDuties.length,
    groundDuties: groundDuties.map((row) => ({
      id: row.id,
      assignment: row.assignment,
      label: row.label,
      base: row.base,
      depArp: row.depArp,
      arvArp: row.arvArp,
      start: row.start,
      end: row.end,
    })),
    rows,
  }
  mkdirSync(ARTIFACT_DIR, { recursive: true })
  writeFileSync(
    path.join(ARTIFACT_DIR, 'j4002-gantt-sep2026.json'),
    `${JSON.stringify(artifact, null, 2)}\n`,
    'utf8',
  )

  await page.screenshot({ path: nextVersioned('gantt-j4002-sep2026'), fullPage: true })
})
