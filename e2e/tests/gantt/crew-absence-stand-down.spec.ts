/**
 * Crew recovery story 101 — crew-app sick leave → Live auto stand-down (planner view).
 *
 * The crew-side action (Quick actions → Absence → Submit) has no Playwright surface
 * (crew-app is React Native / Maestro), so this spec fires the exact request the app
 * sends — `POST /api/crew-app/v1/absence` with body credentials — and then proves the
 * planner-visible outcome through the REAL Live gantt UI:
 *
 *   fixture: ET crew J4002 (ADD, CA) holds pairing 152056, a real 2-day ADD-based duty
 *   (6 legs, 24–25 Sep 2026). Sick leave 25–26 Sep overlaps only day 2, and by decision
 *   #3 in the story spec the WHOLE pairing must be stood down.
 *
 *   assert: no 152056 rows on J4002's roster line, two ILL rows on the ADD-local days
 *   25 Sep and 26 Sep, and pairing 152056's composition fill reflects the removal.
 *
 * Shared SIT data: the fixture is reset to baseline before and after the run.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { createDbHelper, type DbHelper } from '../../utils/db-helper'
import {
  applyFilterLight,
  ganttApiUrl,
  openFilter,
  readHook,
  seedGanttAuth,
  setDateRange,
} from '../../utils/gantt-hook'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '../../..')
const SCREENSHOT_DIR = path.join(REPO_ROOT, 'docs/assets/screenshots/gantt')

const CREW_ID = 'J4002'
const CREW_PASSWORD = 'Pier2026' // shared seed password: sql/seed/2026-09-11-crew-app-accounts-and-password.sql
const PAIRING_ID = 152056
const FROM_DATE = '2026-09-25'
const TO_DATE = '2026-09-26'
// ADD is UTC+3: local 00:00 25 Sep = 24 Sep 21:00Z.
const ILL_DAY_1 = { start: '2026-09-24T21:00:00.000Z', end: '2026-09-25T20:59:59.000Z' }
const ILL_DAY_2 = { start: '2026-09-25T21:00:00.000Z', end: '2026-09-26T20:59:59.000Z' }

interface RosterRow {
  id: number
  crewId: string
  pairingId: number | null
  fltId: number | null
  assignment: string | null
  start: string | null
  end: string | null
}

const nextVersioned = (base: string): string => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true })
  let version = 1
  while (existsSync(path.join(SCREENSHOT_DIR, `${base}-Ver${version}.png`))) version++
  return path.join(SCREENSHOT_DIR, `${base}-Ver${version}.png`)
}

/** Same connection the live-server uses (gitignored .env); no credentials in code. */
const openDb = async (): Promise<DbHelper> => {
  const envText = readFileSync(path.join(REPO_ROOT, 'live-server/.env'), 'utf8')
  const raw = envText.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '')
  if (!raw) throw new Error('live-server/.env has no DATABASE_URL')
  const url = new URL(raw)
  const schema = decodeURIComponent(url.searchParams.get('options') ?? '').match(/search_path=(\w+)/)?.[1]
  if (!schema) throw new Error('DATABASE_URL has no search_path option')
  return createDbHelper({
    host: url.hostname,
    port: Number(url.port || 5432),
    database: url.pathname.slice(1),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    schema,
  })
}

/** Put J4002 / pairing 152056 back to baseline: pairing rows live, no ILL rows, no absence. */
const resetFixture = async (db: DbHelper): Promise<void> => {
  await db.query(
    `update roster_flight set is_deleted = 0, request_source = null, request_id = null
      where crew_id = $1 and pairing_id = $2 and request_source = 'CREW_APP'`,
    [CREW_ID, PAIRING_ID],
  )
  await db.query(
    `delete from roster_flight where crew_id = $1 and pairing_id is null and assignment = 'ILL' and request_source = 'CREW_APP'`,
    [CREW_ID],
  )
  await db.query(`delete from crew_absence where crew_id = $1`, [CREW_ID])
  await db.query(`delete from crew_notification where crew_id = $1 and notif_id like 'absence-%'`, [CREW_ID])
  await db.query(
    `update pairing_composition pc
        set fill = (select count(distinct rf.crew_id) from roster_flight rf
                     where rf.pairing_id = pc.pairing_id and rf.roster_acting_rank = pc.acting_rank and rf.is_deleted = 0)
      where pc.pairing_id = $1`,
    [PAIRING_ID],
  )
}

let db: DbHelper

test.beforeAll(async () => {
  db = await openDb()
  await resetFixture(db)
  const live = await db.query<{ n: string }>(
    `select count(*)::text as n from roster_flight where crew_id = $1 and pairing_id = $2 and is_deleted = 0`,
    [CREW_ID, PAIRING_ID],
  )
  expect(Number(live[0]?.n), `baseline: J4002 must hold all 6 legs of pairing ${PAIRING_ID}`).toBe(6)
})

test.afterAll(async () => {
  await resetFixture(db)
  await db.close()
})

test('crew sick leave stands J4002 down: whole pairing 152056 removed, ILL on both days, visible in Live gantt', async ({
  page,
  request,
}) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1920, height: 1080 })

  // ── Step 1–2: the crew app submits sick leave (exact request the app sends). ──
  const submit = await request.post(`${ganttApiUrl}/api/crew-app/v1/absence`, {
    data: {
      airline: 'F8', crewId: CREW_ID, password: CREW_PASSWORD,
      type: 'sick', fromDate: FROM_DATE, toDate: TO_DATE, note: 'e2e story 101',
    },
  })
  expect(submit.status(), await submit.text()).toBe(200)
  const body = await submit.json() as { data: { removedPairingIds: number[]; groundDays: number; assignment: string } }
  expect(body.data.assignment).toBe('ILL')
  expect(body.data.removedPairingIds, 'whole overlapping pairing stood down').toEqual([PAIRING_ID])
  expect(body.data.groundDays).toBe(2)

  // ── Step 3: Live auto stand-down — DB truth (fill reopened, legs stamped). ──
  const fill = await db.query<{ acting_rank: string; fill: number; live: string }>(
    `select pc.acting_rank, pc.fill,
            (select count(distinct rf.crew_id) from roster_flight rf
              where rf.pairing_id = pc.pairing_id and rf.roster_acting_rank = pc.acting_rank and rf.is_deleted = 0)::text as live
       from pairing_composition pc where pc.pairing_id = $1 order by pc.acting_rank`,
    [PAIRING_ID],
  )
  expect(fill.length).toBeGreaterThan(0)
  for (const row of fill) {
    expect(Number(row.fill), `composition fill for ${row.acting_rank} must match live crew`).toBe(Number(row.live))
  }

  // ── Step 4: crew notification in the feed. ──
  const feed = await request.post(`${ganttApiUrl}/api/crew-app/v1/notifications`, {
    data: { airline: 'F8', crewId: CREW_ID, password: CREW_PASSWORD },
  })
  expect(feed.status()).toBe(200)
  const notifications = (await feed.json() as { data: { notifications: Array<{ notifId: string; body: string }> } }).data.notifications
  const notif = notifications.find((n) => n.notifId.startsWith('absence-'))
  expect(notif?.body).toBe(`1 flight duty removed for ${FROM_DATE} – ${TO_DATE}; ILL added to your roster.`)

  // ── Planner view: real Live gantt, filter J4002, September 2026. ──
  await seedGanttAuth(page, request)
  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto(150_000)
  await setDateRange(page, '2026-09-20', '2026-09-30')
  await openFilter(page, 'pairing')
  await page.getByTestId('filter-tab-crew').click()
  const crewIdInput = page.getByTestId('filter-crew-id')
  await crewIdInput.click()
  await crewIdInput.fill(CREW_ID)
  await crewIdInput.press('Enter')
  await applyFilterLight(page)
  await expect
    .poll(
      () => readHook<Array<{ crewId: string }>>(page, 'rosterPanelOrder').then((rows) => rows[0]?.crewId),
      { timeout: 30_000, message: `crew ${CREW_ID} brought to top of roster` },
    )
    .toBe(CREW_ID)

  const j4002Rows = async () =>
    (await readHook<RosterRow[]>(page, 'roster')).filter((row) => row.crewId === CREW_ID)

  await expect
    .poll(async () => (await j4002Rows()).filter((row) => row.assignment === 'ILL').length, {
      timeout: 30_000, message: 'two ILL rows rendered on J4002 roster line',
    })
    .toBe(2)
  const rows = await j4002Rows()
  expect(rows.filter((row) => row.pairingId === PAIRING_ID), `pairing ${PAIRING_ID} must be gone from the roster line`).toHaveLength(0)
  const ill = rows.filter((row) => row.assignment === 'ILL').sort((a, b) => String(a.start).localeCompare(String(b.start)))
  expect(ill.map((row) => ({ start: row.start, end: row.end }))).toEqual([ILL_DAY_1, ILL_DAY_2])

  await page.screenshot({ path: nextVersioned('crew-absence-stand-down-j4002'), fullPage: true })
})
