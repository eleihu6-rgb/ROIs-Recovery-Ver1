/**
 * Rule 8030 draft-preview complement — assigning (via preview-draft) a second
 * ≥65 pilot onto a pairing that already has one must surface 8030.
 *
 * Before the complement seed, preview temp roster only contained affectedCrewIds,
 * so the saved mate was invisible and 8030 stayed silent.
 *
 * Fixture (remote f8_sit_live, June 2026): pairing 10217 has crew 1015 (age 67);
 * crew 2175 (age 75) is not on that pairing.
 */
import { test, expect } from '@playwright/test'
import { ganttApiLogin, ganttApiUrl } from '../../utils/gantt-hook'

const PAIRING_ID = 10217
const CREW_ALREADY_ON = '1015'
const CREW_SECOND = '2175'

test.describe('Rule 8030 — draft preview sees pairing complement', () => {
  test('Rule-8030-complement — preview-draft fires 8030 when second ≥65 joins pairing with one already', async ({
    request,
  }) => {
    const token = await ganttApiLogin(request)

    // Alone: only the second crew in afterItems — backend must seed crew 1015 from DB.
    const alone = await request.post(`${ganttApiUrl}/api/legality/preview-draft`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        contextType: 'live',
        affectedCrewIds: [CREW_SECOND],
        afterItems: [
          {
            id: -900001,
            crewId: CREW_SECOND,
            pairingId: PAIRING_ID,
            assignmentGroup: 'FLY',
            assignment: 'FLY',
            schStrDtUtc: '2026-05-30T17:57:00.000Z',
            schEndDtUtc: '2026-06-04T08:22:00.000Z',
            division: 'P',
          },
        ],
      },
    })
    expect(alone.ok(), `preview-draft failed: ${alone.status()} ${await alone.text()}`).toBeTruthy()
    const aloneBody = (await alone.json()) as {
      data?: { violations?: Array<{ ruleCode: string; crewId: string; pairingId: number | null; message: string }> }
      code?: number
      message?: string
    }
    const violations = aloneBody.data?.violations ?? []
    const ageHits = violations.filter((v) => String(v.ruleCode) === '8030')
    expect(
      ageHits.length,
      `expected 8030 when adding ${CREW_SECOND} onto pairing ${PAIRING_ID} with ${CREW_ALREADY_ON} already there; got ${JSON.stringify(violations.slice(0, 5))}`,
    ).toBeGreaterThan(0)
    expect(ageHits.some((v) => Number(v.pairingId) === PAIRING_ID)).toBeTruthy()
    expect(
      ageHits.some((v) => v.crewId === CREW_SECOND || v.message.toLowerCase().includes('age')),
    ).toBeTruthy()
  })

  test('Rule-8030-complement-negative — single ≥65 on pairing alone does not fire 8030', async ({
    request,
  }) => {
    const token = await ganttApiLogin(request)
    // Preview the already-assigned crew alone (no second over-age) — should not introduce new 8030
    // for a one-person over-age complement. May still return other rules; assert no 8030 with count>1.
    const res = await request.post(`${ganttApiUrl}/api/legality/preview-draft`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        contextType: 'live',
        affectedCrewIds: [CREW_ALREADY_ON],
        afterItems: [
          {
            id: -900002,
            crewId: CREW_ALREADY_ON,
            pairingId: PAIRING_ID,
            assignmentGroup: 'FLY',
            assignment: 'FLY',
            schStrDtUtc: '2026-05-30T17:57:00.000Z',
            schEndDtUtc: '2026-06-04T08:22:00.000Z',
            division: 'P',
          },
        ],
      },
    })
    expect(res.ok(), `preview-draft failed: ${res.status()}`).toBeTruthy()
    const body = (await res.json()) as {
      data?: { violations?: Array<{ ruleCode: string; message: string; actualValue?: number }> }
    }
    const ageHits = (body.data?.violations ?? []).filter((v) => String(v.ruleCode) === '8030')
    // Max Number=1: one over-age crew is legal. Any 8030 here would mean complement double-count.
    expect(ageHits, JSON.stringify(ageHits)).toEqual([])
  })

  test('Rule-8030-cross-pairing — same fltId on different pairings merges COF in preview-draft', async ({
    request,
  }) => {
    const token = await ganttApiLogin(request)
    const sharedFltId = 888030001
    const res = await request.post(`${ganttApiUrl}/api/legality/preview-draft`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        contextType: 'live',
        affectedCrewIds: [CREW_ALREADY_ON, CREW_SECOND],
        afterItems: [
          {
            id: -900010,
            crewId: CREW_ALREADY_ON,
            pairingId: PAIRING_ID,
            fltId: sharedFltId,
            assignmentGroup: 'FLY',
            assignment: 'FLY',
            schStrDtUtc: '2026-06-01T12:00:00.000Z',
            schEndDtUtc: '2026-06-01T16:00:00.000Z',
            division: 'P',
          },
          {
            id: -900011,
            crewId: CREW_SECOND,
            pairingId: 999888030,
            fltId: sharedFltId,
            assignmentGroup: 'FLY',
            assignment: 'FLY',
            schStrDtUtc: '2026-06-01T12:00:00.000Z',
            schEndDtUtc: '2026-06-01T16:00:00.000Z',
            division: 'P',
          },
        ],
      },
    })
    expect(res.ok(), `preview-draft failed: ${res.status()} ${await res.text()}`).toBeTruthy()
    const body = (await res.json()) as {
      data?: { violations?: Array<{ ruleCode: string; crewId: string; pairingId: number | null; message: string }> }
    }
    const ageHits = (body.data?.violations ?? []).filter((v) => String(v.ruleCode) === '8030')
    expect(
      ageHits.length,
      `expected 8030 for two ≥65 pilots on different pairings sharing flt ${sharedFltId}; got ${JSON.stringify(ageHits.slice(0, 5))}`,
    ).toBeGreaterThan(0)
    expect(ageHits.some((v) => /flight\s+888030001/i.test(v.message) || v.message.toLowerCase().includes('age'))).toBeTruthy()
  })
})
