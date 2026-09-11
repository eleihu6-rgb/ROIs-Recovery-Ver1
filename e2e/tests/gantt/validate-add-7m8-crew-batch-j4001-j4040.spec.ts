/**
 * Validates the 40 freshly-seeded ADD/7M8 crew (J4001-J4020 CA, J4021-J4040 FO
 * — sql/seed/2026-09-10-crew-add-j4001-j4040-add-7m8.sql) appear correctly on
 * the Live Gantt roster panel when filtered by Base=ADD / Fleet=7M8, each with
 * the right rank, and that their real pairing assignment
 * (assign-add-7m8-crew-batch-j4001-j4040.spec.ts) shows up for a sample crew.
 */
import { expect, test } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import {
  applyFilter,
  ganttApiUrl,
  openFilter,
  readHook,
  seedGanttAuth,
  selectDropdownOption,
  setDateRange,
} from '../../utils/gantt-hook'

const EXPECTED_CA = Array.from({ length: 20 }, (_, i) => `J${4001 + i}`)
const EXPECTED_FO = Array.from({ length: 20 }, (_, i) => `J${4021 + i}`)

test('Validate-ADD-7M8-Batch — J4001-J4040 appear on Live roster (Base=ADD, Fleet=7M8) with correct rank and their assigned pairing', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  const token = await seedGanttAuth(page, request)
  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto(90_000)

  await setDateRange(page, '2026-09-10', '2026-09-13')

  await openFilter(page, 'crew')
  await selectDropdownOption(page, 'filter-crew-base', 'ADD', 'crew')
  await selectDropdownOption(page, 'filter-crew-fleet', '7M8', 'crew')
  await applyFilter(page)

  const allExpected = [...EXPECTED_CA, ...EXPECTED_FO]
  await expect
    .poll(
      async () => {
        const rows = await readHook<Array<{ crewId: string; rank: string }>>(page, 'rosterPanelOrder')
        const ids = new Set(rows.map((r) => r.crewId))
        return allExpected.filter((id) => ids.has(id)).length
      },
      { timeout: 45_000, message: 'all 40 J4001-J4040 crew load into the Base=ADD/Fleet=7M8 filtered roster panel' },
    )
    .toBe(40)

  const rows = await readHook<Array<{ crewId: string; rank: string }>>(page, 'rosterPanelOrder')
  const byId = new Map(rows.map((r) => [r.crewId, r.rank]))
  for (const crewId of EXPECTED_CA) {
    expect(byId.get(crewId), `${crewId} must show rank CA on the roster panel`).toBe('CA')
  }
  for (const crewId of EXPECTED_FO) {
    expect(byId.get(crewId), `${crewId} must show rank FO on the roster panel`).toBe('FO')
  }

  // Spot-check the real assignment for one CA and one FO crew via the same API the UI reads.
  for (const [crewId, pairingId] of [['J4001', 151528], ['J4021', 151559]] as const) {
    const rosterCheck = await request.get(
      `${ganttApiUrl}/api/roster?crewIds=${crewId}&startDate=2026-09-10&endDate=2026-09-13`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(rosterCheck.ok(), `GET /api/roster for ${crewId} must succeed`).toBeTruthy()
    const body = (await rosterCheck.json()) as { data: unknown }
    const raw = body.data
    const items: Array<{ pairingId?: number | string }> = Array.isArray(raw)
      ? raw
      : Object.values(raw as Record<string, unknown>).flat() as Array<{ pairingId?: number | string }>
    expect(
      items.some((it) => String(it.pairingId) === String(pairingId)),
      `${crewId} must be assigned to pairing ${pairingId}`,
    ).toBe(true)
  }

  await page.waitForTimeout(500)
  await dashboard.rosterPane.screenshot({
    path: '../docs/assets/screenshots/gantt/add-7m8-crew-batch-roster-Ver1.png',
  })
})
