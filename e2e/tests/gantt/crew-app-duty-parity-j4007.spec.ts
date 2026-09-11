/**
 * Crew-app ↔ Gantt duty parity — ET crew J4007 (ADD/7M8), September 2026.
 *
 * Why this exists: the crew app (crew-app, Ethiopian) reads
 * `POST /api/mobile-roster/session` while the gantt reads the Live roster — two
 * different projections of the same `roster_flight` rows. Ryan asked to confirm the
 * app shows the SAME September duties as the gantt for J4007. This spec captures the
 * gantt side (screenshot + JSON artifact of the rendered duty rows) so the simulator
 * screenshots can be compared duty-by-duty instead of by eye against a recollection.
 *
 * Read-only: it sets the date range and the crew filter, never mutates the roster.
 *
 * J4007 is one of the fresh ADD/7M8 crew from
 * sql/seed/2026-09-10-crew-add-j4001-j4040-add-7m8.sql, rostered for Sep 2026 by the
 * real-UI auto-assign run in auto-assign-even-distribution-j4007.spec.ts.
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

const CREW_ID = 'J4007'

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
  /** `window.__ganttTest.roster()` maps RosterItem.schStrDtUtc → `start`. */
  start: string | null
  end: string | null
  dutySeq: number | null
  segSeq: number | null
}

const nextVersioned = (base: string): string => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true })
  let version = 1
  while (existsSync(path.join(SCREENSHOT_DIR, `${base}-Ver${version}.png`))) version++
  return path.join(SCREENSHOT_DIR, `${base}-Ver${version}.png`)
}

test('Gantt shows crew J4007 September duties — parity artifact for the crew app', async ({
  page,
  request,
}) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await seedGanttAuth(page, request)
  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto(150_000)

  // Whole of September 2026 in view, then bring J4007 to the top of the roster.
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
  expect(rows.length, `gantt must hold J4007 duty rows for September`).toBeGreaterThan(0)

  for (const row of rows) {
    expect(row.start, `row ${row.id} must carry a scheduled start`).toBeTruthy()
  }

  const artifact = {
    crewId: CREW_ID,
    period: '2026-09',
    capturedAt: new Date().toISOString(),
    rowCount: rows.length,
    pairingIds: [...new Set(rows.map((r) => r.pairingId))].sort((a, b) => Number(a) - Number(b)),
    rows: rows.map((row) => ({
      id: row.id,
      pairingId: row.pairingId,
      label: row.label,
      fltId: row.fltId,
      assignment: row.assignment,
      base: row.base,
      depArp: row.depArp,
      arvArp: row.arvArp,
      dutySeq: row.dutySeq,
      segSeq: row.segSeq,
      start: row.start,
      end: row.end,
    })),
  }
  mkdirSync(ARTIFACT_DIR, { recursive: true })
  writeFileSync(
    path.join(ARTIFACT_DIR, 'j4007-gantt-sep2026.json'),
    `${JSON.stringify(artifact, null, 2)}\n`,
    'utf8',
  )

  await page.screenshot({ path: nextVersioned('gantt-j4007-sep2026'), fullPage: true })
})
