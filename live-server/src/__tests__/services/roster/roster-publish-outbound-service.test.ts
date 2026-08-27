import { afterEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
})

const bullmqMocks = vi.hoisted(() => ({
  add: vi.fn(),
  waitUntilFinished: vi.fn(),
  queueClose: vi.fn(async () => undefined),
  queueEventsClose: vi.fn(async () => undefined),
  waitUntilReady: vi.fn(async () => undefined),
}))

vi.mock('bullmq', () => ({
  Queue: vi.fn(() => ({
    add: bullmqMocks.add,
    close: bullmqMocks.queueClose,
    on: vi.fn(),
  })),
  QueueEvents: vi.fn(() => ({
    waitUntilReady: bullmqMocks.waitUntilReady,
    close: bullmqMocks.queueEventsClose,
    on: vi.fn(),
  })),
}))

import {
  buildRosterPublishCallbackPayload,
  flushOneRosterPublishAdjustBatch,
  resetRosterPublishOutboundAuthCacheForTest,
  type RosterPublishAdjustRow,
} from '../../../services/roster/roster-publish-outbound-service.js'

const row = (overrides: Partial<RosterPublishAdjustRow>): RosterPublishAdjustRow => ({
  id: 1,
  batch_id: '1234567892',
  rp_start: new Date('2026-08-01T00:00:00Z'),
  rp_end: new Date('2026-08-31T00:00:00Z'),
  action_type: 'ADD',
  crew_id: '247',
  old_roster_flight_id: null,
  old_pairing_id: null,
  old_pair_interface_id: null,
  old_base: null,
  old_sch_str_dt_utc: null,
  old_sch_end_dt_utc: null,
  old_assignment_group: null,
  old_assignment: null,
  old_roster_acting_rank: null,
  new_roster_flight_id: 17327,
  new_pairing_id: null,
  new_pair_interface_id: null,
  new_base: 'YEG',
  new_sch_str_dt_utc: new Date('2026-08-03T10:00:00Z'),
  new_sch_end_dt_utc: new Date('2026-08-03T22:00:00Z'),
  new_assignment_group: 'RES',
  new_assignment: 'PRAM',
  new_roster_acting_rank: 'CA',
  old_source: null,
  new_source: null,
  ...overrides,
})

describe('roster publish outbound service', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    resetRosterPublishOutboundAuthCacheForTest()
  })

  it('builds callback payload and de-duplicates flying rows by crew and pairing interface id', () => {
    const payload = buildRosterPublishCallbackPayload([
      row({
        id: 10,
        new_roster_flight_id: 101,
        new_pairing_id: 9001,
        new_pair_interface_id: '116443',
        new_roster_acting_rank: 'CA',
        new_assignment_group: 'FLY',
        new_assignment: 'FLY',
      }),
      row({
        id: 11,
        new_roster_flight_id: 102,
        new_pairing_id: 9001,
        new_pair_interface_id: '116443',
        new_roster_acting_rank: 'CA',
        new_assignment_group: 'FLY',
        new_assignment: 'FLY',
      }),
      row({ id: 12 }),
      row({
        id: 13,
        action_type: 'DELETE',
        old_roster_flight_id: 201,
        old_pairing_id: 9002,
        old_pair_interface_id: 'ABC9002',
        old_roster_acting_rank: 'FO',
        new_roster_flight_id: null,
        new_pairing_id: null,
        new_pair_interface_id: null,
      }),
    ])

    expect(payload).toEqual({
      requestId: '1234567892',
      rpStart: '2026-08-01',
      rpEnd: '2026-08-31',
      rosters: [
        {
          action: 'Add',
          uniqueId: '247_116443',
          crewId: '247',
          pairingId: 116443,
          actingRank: 'CA',
        },
        {
          action: 'Add',
          uniqueId: '247_17327',
          crewId: '247',
          base: 'YEG',
          startUtc: '2026-08-03 10:00:00',
          endUtc: '2026-08-03 22:00:00',
          assignmentGroup: 'RES',
          assignment: 'PRAM',
        },
        {
          action: 'Delete',
          uniqueId: '247_ABC9002',
          crewId: '247',
          pairingId: 'ABC9002',
          actingRank: 'FO',
        },
      ],
    })
  })

  it('excludes IMP rows from the callback payload', () => {
    const payload = buildRosterPublishCallbackPayload([
      row({ id: 10, new_source: 'IMP' }),
      row({ id: 11, old_source: 'IMP' }),
      row({ id: 12 }),
    ])

    expect(payload?.rosters).toHaveLength(1)
    expect(payload?.rosters[0]?.uniqueId).toBe('247_17327')
  })

  it('maps ground assignment DO to GDO in the external callback payload', () => {
    const payload = buildRosterPublishCallbackPayload([
      row({
        id: 857,
        crew_id: '857',
        new_base: 'YVR',
        new_sch_str_dt_utc: new Date('2026-07-12T07:00:00Z'),
        new_sch_end_dt_utc: new Date('2026-07-13T06:59:59Z'),
        new_assignment_group: 'GRD',
        new_assignment: 'DO',
      }),
    ])

    expect(payload?.rosters[0]).toMatchObject({
      crewId: '857',
      base: 'YVR',
      assignmentGroup: 'GRD',
      assignment: 'GDO',
    })
  })

  it('sends RES duties with a pairing id in the ground-task callback shape', () => {
    const payload = buildRosterPublishCallbackPayload([
      row({
        id: 20,
        new_roster_flight_id: 17327,
        new_pairing_id: 114207,
        new_pair_interface_id: null,
        new_base: 'YEG',
        new_sch_str_dt_utc: new Date('2026-08-03T10:00:00Z'),
        new_sch_end_dt_utc: new Date('2026-08-03T22:00:00Z'),
        new_assignment_group: 'RES',
        new_assignment: 'PRAM',
      }),
    ])

    expect(payload?.rosters[0]).toEqual({
      action: 'Add',
      uniqueId: '247_17327',
      crewId: '247',
      base: 'YEG',
      startUtc: '2026-08-03 10:00:00',
      endUtc: '2026-08-03 22:00:00',
      assignmentGroup: 'RES',
      assignment: 'PRAM',
    })
  })

  it('claims pending rows, enqueues the payload, logs connector response, and marks them published on success', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [row({ id: '10' }), row({ id: '11', new_roster_flight_id: 17328 })] })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
    bullmqMocks.waitUntilFinished.mockResolvedValueOnce({
      pushed: 1,
      results: [{
        connectorCode: 'f8-roster-publish-outbound',
        status: 'success',
        responseStatus: 200,
        responseBody: '{"code":200}',
      }],
    })
    bullmqMocks.add.mockResolvedValueOnce({ waitUntilFinished: bullmqMocks.waitUntilFinished })

    const fastify = {
      pgPool: { query },
      log: { info: vi.fn(), error: vi.fn() },
    } as never

    const result = await flushOneRosterPublishAdjustBatch(fastify)

    expect(result).toEqual({ sent: true, rowCount: 2, requestId: '1234567892' })
    expect(query.mock.calls[0]?.[0]).toEqual(expect.stringContaining('published = 0'))
    expect(query.mock.calls[0]?.[1]).toEqual([3_600_000])
    expect(bullmqMocks.add).toHaveBeenCalledWith('roster-publish', expect.objectContaining({
      schema: 'f8',
      payload: expect.objectContaining({ requestId: '1234567892' }),
    }), expect.objectContaining({ jobId: expect.stringMatching(/^roster-publish-1234567892-\d+$/) }))
    expect(query.mock.calls[1]?.[0]).toEqual(expect.stringContaining('insert into'))
    expect(query.mock.calls[1]?.[0]).toEqual(expect.stringContaining('roster_publish_outbound_log'))
    expect(query.mock.calls[1]?.[1]).toEqual(expect.arrayContaining([
      '1234567892',
      '1234567892',
      expect.stringContaining('"requestId":"1234567892"'),
      200,
      '{"code":200}',
      null,
      1,
    ]))
    expect(query.mock.calls[2]?.[1]).toEqual([1, ['10', '11']])
  })

  it('resets claimed rows to pending when the callback fails', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [row({ id: '10' })] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    bullmqMocks.waitUntilFinished.mockResolvedValueOnce({
      pushed: 1,
      results: [{
        connectorCode: 'f8-roster-publish-outbound',
        status: 'fail',
        responseStatus: 500,
        responseBody: 'bad roster',
        errorMessage: 'External API returned 500',
      }],
    })
    bullmqMocks.add.mockResolvedValueOnce({ waitUntilFinished: bullmqMocks.waitUntilFinished })

    const fastify = {
      pgPool: { query },
      log: { info: vi.fn(), error: vi.fn() },
    } as never

    await expect(flushOneRosterPublishAdjustBatch(fastify)).rejects.toThrow('External API returned 500')
    expect(query.mock.calls[1]?.[0]).toEqual(expect.stringContaining('roster_publish_outbound_log'))
    expect(query.mock.calls[1]?.[1]).toEqual(expect.arrayContaining([
      '1234567892',
      '1234567892',
      expect.stringContaining('"requestId":"1234567892"'),
      500,
      'bad roster',
      'External API returned 500',
      0,
    ]))
    expect(query.mock.calls[2]?.[1]).toEqual([0, ['10']])
  })

  it('stores the connector-provided raw error instead of the generic fallback', async () => {
    const rawError = 'TypeError: fetch failed\n    at undici:internal/deps/undici/undici:12345:17'
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [row({ id: '10' })] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    bullmqMocks.waitUntilFinished.mockResolvedValueOnce({
      pushed: 1,
      results: [{
        connectorCode: 'f8-roster-publish-outbound',
        status: 'fail',
        errorMessage: rawError,
      }],
    })
    bullmqMocks.add.mockResolvedValueOnce({ waitUntilFinished: bullmqMocks.waitUntilFinished })

    const fastify = {
      pgPool: { query },
      log: { info: vi.fn(), error: vi.fn() },
    } as never

    await expect(flushOneRosterPublishAdjustBatch(fastify)).rejects.toThrow(rawError)
    expect(query.mock.calls[1]?.[1]).toEqual(expect.arrayContaining([
      '1234567892',
      '1234567892',
      expect.stringContaining('"requestId":"1234567892"'),
      null,
      null,
      rawError,
      0,
    ]))
  })

  it('prefers an HTTP failure and formats its status over a generic connector failure', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [row({ id: '10' })] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    bullmqMocks.waitUntilFinished.mockResolvedValueOnce({
      pushed: 2,
      results: [
        {
          connectorCode: 'f8-roster-query-test',
          status: 'fail',
        },
        {
          connectorCode: 'f8-roster-publish-outbound',
          status: 'fail',
          responseStatus: 401,
        },
      ],
    })
    bullmqMocks.add.mockResolvedValueOnce({ waitUntilFinished: bullmqMocks.waitUntilFinished })

    const fastify = {
      pgPool: { query },
      log: { info: vi.fn(), error: vi.fn() },
    } as never

    await expect(flushOneRosterPublishAdjustBatch(fastify))
      .rejects.toThrow('External API returned 401')
    expect(query.mock.calls[1]?.[1]).toEqual(expect.arrayContaining([
      401,
      null,
      'External API returned 401',
      0,
    ]))
  })

  it('marks IMP rows as excluded while publishing non-IMP rows in the same batch', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [
          row({ id: '10', new_source: 'IMP' }),
          row({ id: '11', new_roster_flight_id: 17328 }),
        ],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    bullmqMocks.waitUntilFinished.mockResolvedValueOnce({
      pushed: 1,
      results: [{
        connectorCode: 'f8-roster-publish-outbound',
        status: 'success',
        responseStatus: 200,
      }],
    })
    bullmqMocks.add.mockResolvedValueOnce({ waitUntilFinished: bullmqMocks.waitUntilFinished })

    const fastify = {
      pgPool: { query },
      log: { info: vi.fn(), error: vi.fn() },
    } as never

    const result = await flushOneRosterPublishAdjustBatch(fastify)

    expect(result).toEqual({ sent: true, rowCount: 2, requestId: '1234567892' })
    expect(query.mock.calls[1]?.[1]).toEqual([2, ['10']])
    expect(query.mock.calls[3]?.[1]).toEqual([1, ['11']])
    expect(bullmqMocks.add).toHaveBeenCalledWith(
      'roster-publish',
      expect.objectContaining({
        payload: expect.objectContaining({
          rosters: [expect.objectContaining({ uniqueId: '247_17328' })],
        }),
      }),
      expect.anything(),
    )
  })
})
