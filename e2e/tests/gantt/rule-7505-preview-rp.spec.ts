/**
 * Rule 7505 draft preview + persistence must evaluate calendar-month RPs
 * (30/31-day bands), not a single padded ±365-day window.
 *
 * Fixture: f8_sit_live crew 246 in July 2026 violates Min DO=13.
 */
import { test, expect } from '@playwright/test'
import { ganttApiLogin, ganttApiUrl } from '../../utils/gantt-hook'

const CREW = '246'
const PAIRING = 12769

const julyFlyItem = {
  id: -7505001,
  crewId: CREW,
  pairingId: PAIRING,
  assignmentGroup: 'FLY',
  assignment: 'FLY',
  schStrDtUtc: '2026-07-02T12:00:00.000Z',
  schEndDtUtc: '2026-07-02T20:00:00.000Z',
  division: 'P',
}

test.describe('Rule 7505 — draft preview uses Gantt RP', () => {
  test('Rule-3034 — preview-draft with July RP returns 7505 for crew 246', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const res = await request.post(`${ganttApiUrl}/api/legality/preview-draft`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        contextType: 'live',
        rulesetId: 103,
        affectedCrewIds: [CREW],
        afterItems: [julyFlyItem],
        rpFrom: '2026-07-01',
        rpTo: '2026-07-31',
      },
    })
    expect(res.ok(), `preview-draft failed: ${res.status()} ${await res.text()}`).toBeTruthy()
    const body = (await res.json()) as {
      data?: { violations?: Array<{ ruleCode: string; crewId: string; message: string }> }
    }
    const hits = (body.data?.violations ?? []).filter((v) => String(v.ruleCode) === '7505')
    expect(
      hits.length,
      `expected 7505 for crew ${CREW} under July RP; got ${JSON.stringify(body.data?.violations?.slice(0, 8))}`,
    ).toBeGreaterThan(0)
    expect(hits.some((v) => v.crewId === CREW)).toBeTruthy()
    expect(hits.some((v) => /2026-07-01/.test(v.message) && /2026-07-31/.test(v.message))).toBeTruthy()
  })

  test('Rule-3035 — preview-draft without rpFrom/rpTo still finds 7505 via month split', async ({
    request,
  }) => {
    const token = await ganttApiLogin(request)
    const res = await request.post(`${ganttApiUrl}/api/legality/preview-draft`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        contextType: 'live',
        rulesetId: 103,
        affectedCrewIds: [CREW],
        afterItems: [julyFlyItem],
        // omit rp → padded check window is split into calendar months (incl. July)
      },
    })
    expect(res.ok(), `preview-draft failed: ${res.status()} ${await res.text()}`).toBeTruthy()
    const body = (await res.json()) as {
      data?: { violations?: Array<{ ruleCode: string; crewId: string; message: string }> }
    }
    const hits = (body.data?.violations ?? []).filter((v) => String(v.ruleCode) === '7505')
    expect(
      hits.length,
      `expected month-split 7505 for crew ${CREW}; got ${JSON.stringify(body.data?.violations?.slice(0, 8))}`,
    ).toBeGreaterThan(0)
    expect(hits.some((v) => v.crewId === CREW && /2026-07-01/.test(v.message))).toBeTruthy()
  })
})
