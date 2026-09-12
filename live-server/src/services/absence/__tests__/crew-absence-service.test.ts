import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../config/index.js', () => ({
  env: { LIVE_SCHEMA: 'f8_sit_live' },
}))

const {
  refreshFill, invalidate, recheck, recomputeManday, mandayWindow, notifyRoster, appendNotification,
} = vi.hoisted(() => ({
  refreshFill: vi.fn(async () => undefined),
  invalidate: vi.fn(async () => undefined),
  recheck: vi.fn(async () => undefined),
  recomputeManday: vi.fn(async () => ({ ok: true })),
  mandayWindow: vi.fn(async () => ({ startDt: '2026-09-22', endDt: '2026-10-05' })),
  notifyRoster: vi.fn(async () => ['J4002']),
  appendNotification: vi.fn(async () => ({ notifId: 'absence-77' })),
}))

vi.mock('../../../utils/composition-fill.js', () => ({ refreshPairingCompositionFillBulk: refreshFill }))
vi.mock('../../../utils/cache.js', () => ({ invalidate }))
vi.mock('../../rule/legality-recheck.js', () => ({ recheckLiveRosterMutation: recheck }))
vi.mock('../../manday/manday-operation-service.js', () => ({ recomputeMandayAndNotify: recomputeManday }))
vi.mock('../../manday/manday-mutation-window.js', () => ({ mandayMutationWindow: mandayWindow }))
vi.mock('../../roster/roster-change-notifier.js', () => ({ notifyRosterTasksChanged: notifyRoster }))
vi.mock('../../crew-notify/crew-notify-service.js', () => ({ appendNotification }))

import { CrewAbsenceServiceError, submitCrewAbsence } from '../crew-absence-service.js'

type Row = Record<string, unknown>

/**
 * Fake pg client: each non-transaction query pops the next canned result;
 * `begin/commit/rollback` are recorded so the test can assert atomicity.
 */
const createFastify = (results: Array<{ rows: Row[] }>) => {
  const calls: Array<{ text: string; values?: unknown[] }> = []
  const client = {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      calls.push({ text, values })
      if (/^(begin|commit|rollback)$/.test(text)) return { rows: [] }
      return results.shift() ?? { rows: [] }
    }),
    release: vi.fn(),
  }
  const fastify = {
    pgPool: { connect: vi.fn(async () => client) },
    db: {},
    redis: {},
    log: { error: vi.fn() },
    wsBroadcastAll: vi.fn(),
  }
  return { fastify: fastify as unknown as FastifyInstance, calls, client }
}

const sqlOf = (calls: Array<{ text: string }>) => calls.map((c) => c.text.replace(/\s+/g, ' ').trim())

/** The payload of the crew notification the service appended (call 0, arg 1). */
const appendedPayload = (): Record<string, unknown> => {
  const call = appendNotification.mock.calls[0] as unknown as [
    unknown,
    { payload: Record<string, unknown> },
  ]
  return call[1].payload
}

/**
 * Real-business fixture: pairing 152056 is J4002's 2-day ADD-based duty
 * (6 legs, 2026-09-24 → 2026-09-25). Sick leave on 25 Sep only overlaps day 2,
 * and the WHOLE pairing must be stood down (decision #3 in the story spec).
 */
const baseInput = {
  airline: 'F8',
  crewId: 'J4002',
  type: 'sick',
  fromDate: '2026-09-25',
  toDate: '2026-09-26',
  note: 'flu',
  wsSchema: 'f8_sit_live',
}

const ADD_ROW = { base: 'ADD', zone_id: 'Africa/Addis_Ababa' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('submitCrewAbsence', () => {
  it('stands the crew down: whole overlapping pairing soft-deleted, one ILL row per local day, hooks after commit', async () => {
    const { fastify, calls, client } = createFastify([
      { rows: [ADD_ROW] },                                   // crew_base + zone
      { rows: [] },                                          // no overlapping absence
      { rows: [{ pairing_id: 152056 }] },                    // overlapping flying pairing
      // snapshot of the duties about to be removed (taken before the soft-delete)
      {
        rows: Array.from({ length: 6 }, (_, i) => ({
          pairing_id: 152056,
          sch_str_dt_utc: `2026-09-2${i < 3 ? 4 : 5}T05:10:00.000Z`,
          sch_end_dt_utc: `2026-09-2${i < 3 ? 4 : 5}T08:00:00.000Z`,
          flt_num: `ET${400 + i}`,
          dep_arp: i % 2 === 0 ? 'ADD' : 'DMM',
          arv_arp: i % 2 === 0 ? 'DMM' : 'ADD',
          register: 'ET-AVK',
          fleet: 'Boeing 737-800',
        })),
      },
      { rows: [{ id: 77 }] },                                // crew_absence insert
      { rows: Array.from({ length: 6 }, (_, i) => ({ sch_str_dt_utc: `2026-09-2${i < 3 ? 4 : 5}T05:10:00.000Z` })) }, // 6 legs removed
      { rows: [{ fixed_credit_min: 240, dp_pct: 0, rest_time: null }] }, // ILL dictionary row
      { rows: [] }, { rows: [] },                            // 2 ILL inserts
    ])

    const result = await submitCrewAbsence(fastify, baseInput)

    expect(result).toEqual({
      absenceId: 77,
      assignment: 'ILL',
      fromDate: '2026-09-25',
      toDate: '2026-09-26',
      removedPairingIds: [152056],
      groundDays: 2,
      notificationId: 'absence-77',
    })

    const sql = sqlOf(calls)
    expect(sql[0]).toBe('begin')
    expect(sql[sql.length - 1]).toBe('commit')

    // Overlap search uses the ADD-local window (UTC+3): 25 Sep 00:00 → 26 Sep 23:59:59 local.
    const pairingQuery = calls.find((c) => c.text.includes('select distinct pairing_id'))!
    expect(pairingQuery.values).toEqual(['J4002', '2026-09-24T21:00:00.000Z', '2026-09-26T20:59:59.000Z'])

    // Soft-delete covers every leg of the pairing, stamped with the absence id.
    const softDelete = calls.find((c) => c.text.includes('set is_deleted = 1'))!
    expect(softDelete.text).toContain("request_source = 'CREW_APP'")
    expect(softDelete.values).toEqual(['J4002', [152056], 77, 'crew:J4002'])

    // Two ILL rows, base=dep=arv=ADD, group GRD, 240 fixed credit, per local day.
    const illInserts = calls.filter((c) => /insert into "?f8_sit_live"?\.roster_flight/.test(c.text))
    expect(illInserts).toHaveLength(2)
    expect(illInserts[0]!.values!.slice(1, 5)).toEqual(['J4002', 'ADD', 'GRD', 'ILL'])
    expect(illInserts[0]!.values![5]).toBe('2026-09-24T21:00:00.000Z')
    expect(illInserts[0]!.values![6]).toBe('2026-09-25T20:59:59.000Z')
    expect(illInserts[1]!.values![5]).toBe('2026-09-25T21:00:00.000Z')
    expect(illInserts[0]!.values![9]).toBe(240)
    expect(illInserts[0]!.values![11]).toBe(77)
    expect(client.release).toHaveBeenCalledTimes(1)

    // Post-commit hooks: slot reopened, legality + manday rechecked, gantt + crew notified.
    expect(refreshFill).toHaveBeenCalledWith(fastify.db, [152056], 'crew:J4002')
    expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'pairing:152056')
    expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'pairing:comp:152056')
    expect(recheck).toHaveBeenCalledWith(fastify, undefined, expect.any(Array), ['J4002'])
    expect(recomputeManday).toHaveBeenCalledWith(fastify, expect.objectContaining({ crewIds: ['J4002'], startDt: '2026-09-22' }))
    expect(fastify.wsBroadcastAll).toHaveBeenCalledWith('f8_sit_live', { type: 'manday-updated', crewIds: ['J4002'] })
    expect(notifyRoster).toHaveBeenCalledWith(fastify, { schema: 'f8_sit_live', crewIds: ['J4002'], pairingIds: [152056] })
    expect(appendNotification).toHaveBeenCalledWith({ pgPool: fastify.pgPool }, expect.objectContaining({
      airline: 'F8', crewId: 'J4002', notifId: 'absence-77', type: 'roster_change',
      relatedPairingId: '152056',
      body: '1 flight duty removed for 2026-09-25 – 2026-09-26; ILL added to your roster.',
    }))

    // The alert carries a structured before/after so the crew app can lay the
    // change out instead of printing the prose body.
    const payload = appendedPayload()
    expect(payload).toMatchObject({
      kind: 'absence',
      absenceType: 'sick',
      assignment: 'ILL',
      fromDate: '2026-09-25',
      toDate: '2026-09-26',
      removedPairingIds: [152056],
    })
    const before = payload.before as Array<{ pairingId: number; date: string; legs: unknown[] }>
    expect(before).toHaveLength(1)
    expect(before[0]!.pairingId).toBe(152056)
    // Base-local day (ADD = UTC+3), not the UTC day.
    expect(before[0]!.date).toBe('2026-09-24')
    expect(before[0]!.legs).toHaveLength(6)
    expect(before[0]!.legs[0]).toMatchObject({
      fltNum: 'ET400', dep: 'ADD', arv: 'DMM',
      std: '2026-09-24T05:10:00.000Z', sta: '2026-09-24T08:00:00.000Z',
      register: 'ET-AVK', fleet: 'Boeing 737-800',
    })
    const after = payload.after as Array<Record<string, unknown>>
    expect(after).toEqual([
      { date: '2026-09-25', assignment: 'ILL', label: 'Sick leave', base: 'ADD' },
      { date: '2026-09-26', assignment: 'ILL', label: 'Sick leave', base: 'ADD' },
    ])

    // Notification must be written after commit, never inside the transaction.
    const commitIndex = client.query.mock.invocationCallOrder[sql.indexOf('commit')]!
    expect(appendNotification.mock.invocationCallOrder[0]!).toBeGreaterThan(commitIndex)
  })

  it('records the absence with no pairing change when no flying duty overlaps', async () => {
    const { fastify, calls } = createFastify([
      { rows: [ADD_ROW] },
      { rows: [] },
      { rows: [] },                                          // no pairing
      { rows: [{ id: 78 }] },
      { rows: [{ fixed_credit_min: 240, dp_pct: 0, rest_time: null }] },
      { rows: [] },
    ])

    const result = await submitCrewAbsence(fastify, { ...baseInput, fromDate: '2026-09-18', toDate: '2026-09-18' })

    expect(result.removedPairingIds).toEqual([])
    expect(result.groundDays).toBe(1)
    expect(calls.some((c) => c.text.includes('set is_deleted = 1'))).toBe(false)
    expect(refreshFill).not.toHaveBeenCalled()
    expect(notifyRoster).toHaveBeenCalledWith(fastify, { schema: 'f8_sit_live', crewIds: ['J4002'], pairingIds: [] })
    expect(appendNotification).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      body: 'ILL added to your roster for 2026-09-18 – 2026-09-18. No flight duties were affected.',
    }))
    // Nothing was removed, so the "before" side is empty and the app shows the
    // gained day alone rather than an empty comparison.
    const payload = appendedPayload()
    expect(payload.before).toEqual([])
    expect(payload.after).toEqual([
      { date: '2026-09-18', assignment: 'ILL', label: 'Sick leave', base: 'ADD' },
    ])
  })

  it('rejects an overlapping active absence with 409 and rolls back', async () => {
    const { fastify, calls } = createFastify([
      { rows: [ADD_ROW] },
      { rows: [{ id: 5 }] },                                 // overlap exists
    ])

    await expect(submitCrewAbsence(fastify, baseInput)).rejects.toMatchObject({ statusCode: 409 })
    const sql = sqlOf(calls)
    expect(sql[sql.length - 1]).toBe('rollback')
    expect(sql.some((s) => s.includes('insert into'))).toBe(false)
    expect(notifyRoster).not.toHaveBeenCalled()
    expect(appendNotification).not.toHaveBeenCalled()
  })

  it('rejects unsupported types and bad ranges before touching the database', async () => {
    const { fastify, calls } = createFastify([])

    await expect(submitCrewAbsence(fastify, { ...baseInput, type: 'personal' }))
      .rejects.toBeInstanceOf(CrewAbsenceServiceError)
    await expect(submitCrewAbsence(fastify, { ...baseInput, type: 'personal' }))
      .rejects.toMatchObject({ statusCode: 400, message: 'Absence type "personal" is not supported yet.' })
    await expect(submitCrewAbsence(fastify, { ...baseInput, toDate: '2026-09-24' }))
      .rejects.toMatchObject({ statusCode: 400, message: 'toDate must not be before fromDate.' })
    await expect(submitCrewAbsence(fastify, { ...baseInput, toDate: '2026-11-01' }))
      .rejects.toMatchObject({ statusCode: 400, message: 'Absence range cannot exceed 30 days.' })
    expect(calls).toHaveLength(0)
  })

  it('still succeeds when the crew notification write fails', async () => {
    appendNotification.mockRejectedValueOnce(new Error('notif down'))
    const { fastify } = createFastify([
      { rows: [ADD_ROW] }, { rows: [] }, { rows: [] }, { rows: [{ id: 79 }] },
      { rows: [{ fixed_credit_min: 240, dp_pct: 0, rest_time: null }] }, { rows: [] },
    ])

    const result = await submitCrewAbsence(fastify, { ...baseInput, fromDate: '2026-09-18', toDate: '2026-09-18' })

    expect(result.absenceId).toBe(79)
    expect(result.notificationId).toBeNull()
    expect(fastify.log.error).toHaveBeenCalled()
  })
})
