/**
 * Regression — Pairing Info "Crew on Pairing" Base column must be populated.
 *
 * Bug: local-first Pairing Info preferred blank `roster_flight.base` (`'' ?? panelBase`
 * never falls through), so Base rendered empty while Scenario (crew_base) was fine.
 *
 * Coverage:
 *  1. Live-1123 — API `/crew-detail` resolves home base from crew_base
 *  2. Live-1124 — real UI after panes load (local-first / server fallthrough path)
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import {
  ganttApiLogin,
  ganttApiUrl,
  seedGanttAuth,
  counts,
  rosterObjects,
} from '../../utils/gantt-hook'

const AIRPORT = /^[A-Z]{3}$/

interface CrewDetail {
  crewId: string
  name: string
  base: string | null
  actingRank: string | null
}

/** Find a pairing that currently has rostered crew (IDs drift across demo data refreshes). */
const findPairingWithCrew = async (
  request: import('@playwright/test').APIRequestContext,
  token: string,
  candidateIds: number[],
): Promise<{ pairingId: number; crew: CrewDetail[] } | null> => {
  for (const pairingId of candidateIds) {
    const res = await request.get(`${ganttApiUrl}/api/pairing/${pairingId}/crew-detail`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok()) continue
    const body = (await res.json()) as { data?: CrewDetail[] }
    const crew = body.data ?? []
    if (crew.length > 0) return { pairingId, crew }
  }
  return null
}

test.describe('Pairing Info — crew Base', () => {
  test('Live-1123 — rostered crew expose a home base from crew_base (not blank roster_flight.base) @smoke', async ({ request }) => {
    const token = await ganttApiLogin(request)

    // Prefer historically blank-roster-base cases, then a short scan of nearby IDs.
    const candidates = [12224, 13198, 4121, ...Array.from({ length: 40 }, (_, i) => 12000 + i)]
    const found = await findPairingWithCrew(request, token, candidates)
    test.skip(!found, 'no rostered pairing found in candidate set for this demo DB')

    for (const c of found!.crew) {
      expect(
        c.base,
        `crew ${c.crewId} (${c.name}) Base must be a 3-letter airport code, got "${c.base}"`,
      ).toMatch(AIRPORT)
    }
  })

  test('Live-1124 — Pairing Info UI shows crew Base after local-first open @smoke', async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect.poll(async () => (await counts(page)).roster, {
      message: 'roster objects loaded', timeout: 30_000,
    }).toBeGreaterThan(0)

    const roster = await rosterObjects(page)
    const pairingIds = [...new Set(
      roster
        .map((r) => r.pairingId as number | null | undefined)
        .filter((id): id is number => typeof id === 'number' && id > 0),
    )].slice(0, 15)

    test.skip(pairingIds.length === 0, 'no flying roster rows with pairingId in viewport load')

    const token = await ganttApiLogin(request)
    const found = await findPairingWithCrew(request, token, pairingIds)
    test.skip(!found, 'loaded roster pairings have no crew-detail rows')

    await page.evaluate((id) => {
      ;(window as unknown as { __ganttTest: { openPairingInfo: (n: number) => void } })
        .__ganttTest.openPairingInfo(id)
    }, found!.pairingId)

    const dialog = page.getByTestId('pairing-info-dialog')
    await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 15_000 })
    await expect(dialog.getByTestId('pairing-info-crew')).toBeVisible({ timeout: 10_000 })

    // Position / MBH columns removed — not pairing-crew attributes for this table.
    await expect(dialog.getByTestId('pairing-info-crew').locator('thead')).not.toContainText('Position')
    await expect(dialog.getByTestId('pairing-info-crew').locator('thead')).not.toContainText('MBH')

    const baseCells = dialog.getByTestId('pairing-info-crew').locator('tbody tr td:nth-child(3)')
    const n = await baseCells.count()
    expect(n, 'crew rows present').toBeGreaterThan(0)
    for (let i = 0; i < n; i++) {
      const text = ((await baseCells.nth(i).textContent()) ?? '').trim()
      expect(text, `crew row ${i} Base must be a 3-letter airport, got "${text}"`).toMatch(AIRPORT)
    }

    // Sanity: server authority for the same pairing also has airport bases.
    for (const c of found!.crew) {
      expect(c.base).toMatch(AIRPORT)
    }
  })
})
