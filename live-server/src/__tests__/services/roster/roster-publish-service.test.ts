import { afterEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
})

import {
  rosterPublishService,
  type RosterPublishDiffRow,
} from '../../../services/roster/roster-publish-service.js'

const makeFastify = (query: ReturnType<typeof vi.fn>) => ({
  pgPool: { query, connect: vi.fn() },
  redis: {
    scan: vi.fn(async () => ({ cursor: 0, keys: [] })),
    del: vi.fn(async () => 0),
  },
}) as never

const toRawDiff = (row: RosterPublishDiffRow) => ({
  key: row.key,
  kind: row.kind,
  status: row.status,
  crew_id: row.crewId,
  crew_name: row.crewName,
  crew_fleet: row.crewFleet,
  base: row.base,
  pairing_id: row.pairingId,
  pairing_label: row.pairingLabel,
  roster_ids: row.rosterIds,
  publish_ids: row.publishIds,
  assignment_group: row.assignmentGroup,
  assignment: row.assignment,
  acting_rank: row.actingRank,
  sch_str_dt_utc: row.schStrDtUtc,
  sch_end_dt_utc: row.schEndDtUtc,
  dep_arp: row.depArp,
  arv_arp: row.arvArp,
  segment_count: row.segmentCount,
  changed_fields: row.changedFields,
  publish_status: row.publishStatus,
})

const toCrewScopes = (rows: RosterPublishDiffRow[]) => [...new Map(rows.map((row) => [row.crewId, {
  crew_id: row.crewId,
  division: 'P',
  base: row.base ?? 'YYZ',
  base_count: 1,
  ac_type: row.crewFleet ?? '737',
}])).values()]

describe('rosterPublishService diff/apply', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('maps the grouped diff row and summary counts from the SQL result', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          key: 'F|C001|9001',
          kind: 'FLYING',
          status: 'UPDATE',
          crew_id: 'C001',
          crew_name: 'Crew One',
          crew_fleet: 'A321 | B777',
          base: 'YVR',
          pairing_id: '9001',
          pairing_label: 'V9001',
          roster_ids: ['11', '12'],
          publish_ids: ['21', '22'],
          assignment_group: 'FLY',
          assignment: 'FLY',
          acting_rank: 'FO',
          sch_str_dt_utc: new Date('2026-07-01T10:00:00Z'),
          sch_end_dt_utc: new Date('2026-07-02T18:00:00Z'),
          dep_arp: null,
          arv_arp: null,
          segment_count: 2,
          changed_fields: ['brief_start_utc'],
          publish_status: 'UNPUBLISHED',
          total_count: '3',
          add_count: '1',
          update_count: '1',
          delete_count: '1',
          no_change_count: '0',
        }],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: '11', source: 'CR' },
          { id: '12', source: 'CR' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { new_roster_flight_id: '11', published: '1' },
          { new_roster_flight_id: '12', published: '1' },
        ],
      })

    const result = await rosterPublishService.listDiff(makeFastify(query), {
      rosterPeriodId: 7,
      divisions: [' p ', 'C', 'P'],
      statuses: ['ADD', 'UPDATE', 'DELETE'],
    })

    expect(result).toMatchObject({
      total: 3,
      summary: { add: 1, update: 1, delete: 1, noChange: 0, actionable: 3 },
      items: [{
        key: 'F|C001|9001',
        crewId: 'C001',
        pairingId: 9001,
        rosterIds: [11, 12],
        publishIds: [21, 22],
        changedFields: ['brief_start_utc'],
        schStrDtUtc: '2026-07-01T10:00:00.000Z',
      }],
    })
    expect(result.items[0]).toMatchObject({ source: 'CR', noc: 'Success' })
    expect(query).toHaveBeenCalledWith(expect.stringContaining('full join publish_flying'), expect.any(Array))
    const firstCall = query.mock.calls[0] as unknown as [string, unknown[]]
    const [sqlText, params] = firstCall
    expect(String(sqlText)).toContain('c.division = any($12::text[])')
    expect(String(sqlText)).toContain("coalesce(assignment_group, '')")
    expect(String(sqlText)).toContain("coalesce(dep_arp, '')")
    expect(String(sqlText)).toContain('full join publish_ground pg on pg.key = sg.key')
    expect(String(sqlText)).not.toContain("('G|' || crew_id || '|' || roster_id::text)")
    expect(String(sqlText)).toContain('coalesce(rf.sch_credited_minutes, ps.duty_sch_credited_minutes, ps.duty_act_credited_minutes)')
    expect(String(sqlText)).toContain('coalesce(rf.act_credited_minutes, ps.duty_act_credited_minutes)')
    expect(String(sqlText)).toContain('sf.sch_credit_sig is distinct from pf.sch_credit_sig')
    expect(String(sqlText)).toContain("'sch_credited_minutes'")
    expect(String(sqlText)).toContain("'act_credited_minutes'")
    expect(String(sqlText)).toContain('array_agg(distinct roster_id order by roster_id)')
    expect(String(sqlText)).toContain('array_agg(distinct publish_id order by publish_id)')
    expect(String(sqlText)).toContain('group by crew_id, assignment_group, assignment, sch_str_dt_utc, sch_end_dt_utc, dep_arp, arv_arp')
    expect(params[11]).toEqual(['P', 'C'])
  })

  it('resolves Source and NOC per row: IMP ignore, CR pending, delete from publish source', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [
        {
          key: 'F|C100|9001', kind: 'FLYING', status: 'ADD', crew_id: 'C100',
          crew_name: null, crew_fleet: null, base: null, pairing_id: null, pairing_label: null,
          roster_ids: ['31'], publish_ids: [], assignment_group: null, assignment: null,
          acting_rank: null, sch_str_dt_utc: null, sch_end_dt_utc: null, dep_arp: null, arv_arp: null,
          segment_count: 1, changed_fields: [], publish_status: 'UNPUBLISHED',
          total_count: '3', add_count: '1', update_count: '1', delete_count: '1', no_change_count: '0',
        },
        {
          key: 'F|C200|9002', kind: 'FLYING', status: 'UPDATE', crew_id: 'C200',
          crew_name: null, crew_fleet: null, base: null, pairing_id: null, pairing_label: null,
          roster_ids: ['41'], publish_ids: [], assignment_group: null, assignment: null,
          acting_rank: null, sch_str_dt_utc: null, sch_end_dt_utc: null, dep_arp: null, arv_arp: null,
          segment_count: 1, changed_fields: [], publish_status: 'UNPUBLISHED',
        },
        {
          key: 'F|C300|9003', kind: 'FLYING', status: 'DELETE', crew_id: 'C300',
          crew_name: null, crew_fleet: null, base: null, pairing_id: null, pairing_label: null,
          roster_ids: [], publish_ids: ['51'], assignment_group: null, assignment: null,
          acting_rank: null, sch_str_dt_utc: null, sch_end_dt_utc: null, dep_arp: null, arv_arp: null,
          segment_count: 1, changed_fields: [], publish_status: 'UNPUBLISHED',
        },
      ]})
      .mockResolvedValueOnce({
        rows: [
          { id: '31', source: 'IMP' },
          { id: '41', source: 'CR' },
          { id: '51', source: 'MA' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ new_roster_flight_id: '41', published: '0' }],
      })

    const result = await rosterPublishService.listDiff(makeFastify(query), { rosterPeriodId: 7 })

    expect(result.items[0]).toMatchObject({ source: 'IMP', noc: 'Ignore' })
    expect(result.items[1]).toMatchObject({ source: 'CR', noc: 'Pending' })
    expect(result.items[2]).toMatchObject({ source: 'MA', noc: null })
  })

  it('filters roster publish diffs by base-local dates instead of raw UTC timestamps', async () => {
    const query = vi.fn(async () => ({ rows: [] }))

    await rosterPublishService.listDiff(makeFastify(query), {
      rosterPeriodId: 8,
      statuses: ['ADD', 'UPDATE', 'DELETE'],
    })

    const firstCall = query.mock.calls[0] as unknown as [string, unknown[]]
    const [sqlText] = firstCall
    expect(String(sqlText)).toContain('crew_scope_raw as (')
    expect(String(sqlText)).toContain('left join')
    expect(String(sqlText)).toContain('base_airport')
    expect(String(sqlText)).toContain("split_part(csr.base, ' | ', 1)")
    expect(String(sqlText)).toContain('base_zone_id')
    expect(String(sqlText)).toContain("at time zone cs.base_zone_id")
    expect(String(sqlText)).toContain("at time zone 'UTC') at time zone cs.base_zone_id)::time = time '00:00'")
    expect(String(sqlText)).toContain("interval '1 second'")
    expect(String(sqlText)).toContain('when rf.pairing_id is null')
    expect(String(sqlText)).toContain('when rpbl.pairing_id is null')
    expect(String(sqlText)).toContain("at time zone 'UTC')::date")
    expect(String(sqlText)).not.toContain('coalesce(rf.sch_end_dt_utc, rf.sch_str_dt_utc) >= rp.rp_start')
    expect(String(sqlText)).not.toContain('coalesce(rf.sch_str_dt_utc, rf.sch_end_dt_utc) <= rp.rp_end')
  })

  it('matches the Crew filter by exact crew id', async () => {
    const query = vi.fn(async () => ({ rows: [] }))

    await rosterPublishService.listDiff(makeFastify(query), {
      rosterPeriodId: 8,
      crewId: ' C001 ',
    })

    const firstCall = query.mock.calls[0] as unknown as [string, unknown[]]
    const [sqlText, params] = firstCall
    expect(String(sqlText)).toContain('c.crew_id = $4::text')
    expect(String(sqlText)).not.toContain("c.crew_id ilike ('%' || $4::text || '%')")
    expect(params[3]).toBe('C001')
  })

  it('rechecks selected keys inside the serializable transaction and returns stale keys without writes', async () => {
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ rp_start: new Date('2026-07-01T00:00:00Z'), rp_end: new Date('2026-07-31T00:00:00Z') }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const release = vi.fn()
    const fastify = {
      pgPool: {
        query: vi.fn(),
        connect: vi.fn(async () => ({ query: clientQuery, release })),
      },
      redis: {
        scan: vi.fn(async () => ({ cursor: 0, keys: [] })),
        del: vi.fn(async () => 0),
      },
    } as never

    const result = await rosterPublishService.applyDiff(fastify, {
      rosterPeriodId: 7,
      keys: ['G|C001|11'],
    }, 'planner')

    expect(result).toEqual({
      batchId: null,
      applied: 0,
      inserted: 0,
      updated: 0,
      deleted: 0,
      skipped: 1,
      staleKeys: ['G|C001|11'],
    })
    expect(clientQuery.mock.calls.map(([sql]) => String(sql))).toEqual([
      'begin isolation level serializable',
      expect.stringContaining('pg_advisory_xact_lock'),
      expect.stringContaining('roster_period'),
      expect.stringContaining('with rp as'),
      'commit',
    ])
    expect(release).toHaveBeenCalled()
  })

  it('applies only the selected key when other changes for the same crew are omitted (relaxed per-crew atomicity)', async () => {
    // Bug 2: per-crew completeness was too strict — a crew may have N
    // diff rows (some ADD, some DELETE, some UPDATE) but the UI can only
    // select a subset in one publish batch. The remaining changes stay in
    // roster_publish / roster_flight and the diff is recomputed on the
    // next query. This test pins the relaxed semantics: one selected key
    // is applied, an omitted ADD on the same crew is left untouched.
    const selectedRow: RosterPublishDiffRow = {
      key: 'F|C001|9001',
      kind: 'FLYING',
      status: 'UPDATE',
      crewId: 'C001',
      crewName: 'Crew One',
      crewFleet: '737',
      base: 'YYZ',
      pairingId: 9001,
      pairingLabel: 'T9001',
      rosterIds: [11],
      publishIds: [21],
      assignmentGroup: 'FLY',
      assignment: 'FLY',
      actingRank: 'IFD',
      schStrDtUtc: '2026-07-01T10:00:00.000Z',
      schEndDtUtc: '2026-07-01T18:00:00.000Z',
      depArp: null,
      arvArp: null,
      segmentCount: 1,
      changedFields: ['assignment'],
      publishStatus: 'UNPUBLISHED',
      source: null,
      noc: null,
    }
    const omittedRow: RosterPublishDiffRow = {
      ...selectedRow,
      key: 'G|C001|GRD|VAC',
      kind: 'GROUND',
      status: 'ADD',
      pairingId: null,
      pairingLabel: 'VAC',
      rosterIds: [12],
      publishIds: [],
    }
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })                                              // begin
      .mockResolvedValueOnce({ rows: [] })                                              // advisory lock
      .mockResolvedValueOnce({                                                         // roster_period
        rows: [{ rp_start: new Date('2026-07-01T00:00:00Z'), rp_end: new Date('2026-07-31T00:00:00Z') }],
      })
      .mockResolvedValueOnce({ rows: [toRawDiff(selectedRow)] })                        // initial diff by keys
      .mockResolvedValueOnce({ rows: toCrewScopes([selectedRow]) })                      // load crew scopes
      .mockResolvedValueOnce({ rows: [{ id: 11 }] })                                    // lock source
      .mockResolvedValueOnce({ rows: [{ id: 21 }] })                                    // lock publish
      .mockResolvedValueOnce({ rows: [{ batch_id: '1784710000000000' }] })              // batch id
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })                                 // bulk adjust
      .mockResolvedValueOnce({ rows: [{ id: 21 }] })                                    // delete publish
      .mockResolvedValueOnce({ rows: [{ roster_flight_id: 11 }] })                      // flying insert
      .mockResolvedValueOnce({ rows: [] })                                              // ground insert (none for selected)
      .mockResolvedValueOnce({ rows: [{ crew_id: 'C001' }] })                           // schedule publish records
    const release = vi.fn()
    const fastify = {
      pgPool: {
        query: vi.fn(),
        connect: vi.fn(async () => ({ query: clientQuery, release })),
      },
      redis: {
        scan: vi.fn(async () => ({ cursor: 0, keys: [] })),
        del: vi.fn(async () => 0),
      },
    } as never

    const result = await rosterPublishService.applyDiff(fastify, {
      rosterPeriodId: 7,
      keys: [selectedRow.key],
    }, 'planner')

    // Only the selected key was applied; the omitted row remains in roster_publish
    // for the user to publish on the next pass.
    expect(result).toMatchObject({ batchId: 1784710000000000, applied: 1, inserted: 1, updated: 1, deleted: 1, staleKeys: [] })
    expect(clientQuery).toHaveBeenCalledTimes(14)
    expect(clientQuery.mock.calls.at(-1)?.[0]).toBe('commit')

    // The bulk-adjust snapshot only contains the selected row — the omitted
    // row must not be folded into this batch.
    const adjustCall = clientQuery.mock.calls.find(([sql]) => String(sql).includes('roster_publish_adjust'))
    expect(adjustCall).toBeDefined()
    const payload = JSON.parse(String(adjustCall?.[1]?.[4])) as RosterPublishDiffRow[]
    expect(payload).toHaveLength(1)
    expect(payload[0]?.key).toBe(selectedRow.key)
    expect(release).toHaveBeenCalled()
  })

  it('applies selected flying and ground rows in one transaction', async () => {
    const rows: RosterPublishDiffRow[] = [
      {
        key: 'F|C001|9001',
        kind: 'FLYING',
        status: 'UPDATE',
        crewId: 'C001',
        crewName: 'Crew One',
        crewFleet: 'A321',
        base: 'YVR',
        pairingId: 9001,
        pairingLabel: 'V9001',
        rosterIds: [11, 12],
        publishIds: [21, 22],
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        actingRank: 'FO',
        schStrDtUtc: '2026-07-01T10:00:00.000Z',
        schEndDtUtc: '2026-07-02T18:00:00.000Z',
        depArp: null,
        arvArp: null,
        segmentCount: 2,
        changedFields: ['assignment'],
        publishStatus: 'UNPUBLISHED',
        source: null,
        noc: null,
      },
      {
        key: 'G|C001|13',
        kind: 'GROUND',
        status: 'ADD',
        crewId: 'C001',
        crewName: 'Crew One',
        crewFleet: 'A321',
        base: 'YVR',
        pairingId: null,
        pairingLabel: 'DO',
        rosterIds: [13],
        publishIds: [],
        assignmentGroup: 'GRD',
        assignment: 'DO',
        actingRank: 'FO',
        schStrDtUtc: '2026-07-03T00:00:00.000Z',
        schEndDtUtc: '2026-07-03T23:59:00.000Z',
        depArp: 'YVR',
        arvArp: 'YVR',
        segmentCount: 1,
        changedFields: [],
        publishStatus: 'UNPUBLISHED',
        source: null,
        noc: null,
      },
      {
        key: 'F|C002|9002',
        kind: 'FLYING',
        status: 'DELETE',
        crewId: 'C002',
        crewName: 'Crew Two',
        crewFleet: 'A321',
        base: 'YVR',
        pairingId: 9002,
        pairingLabel: 'V9002',
        rosterIds: [],
        publishIds: [31, 32],
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        actingRank: 'CA',
        schStrDtUtc: '2026-07-04T10:00:00.000Z',
        schEndDtUtc: '2026-07-05T18:00:00.000Z',
        depArp: null,
        arvArp: null,
        segmentCount: 2,
        changedFields: [],
        publishStatus: 'UNPUBLISHED',
        source: null,
        noc: null,
      },
    ]
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ rp_start: new Date('2026-07-01T00:00:00Z'), rp_end: new Date('2026-07-31T00:00:00Z') }],
      })
      .mockResolvedValueOnce({ rows: rows.map(toRawDiff) })
      .mockResolvedValueOnce({ rows: toCrewScopes(rows) })
      .mockResolvedValueOnce({ rows: [{ id: 11 }, { id: 12 }, { id: 13 }] })
      .mockResolvedValueOnce({ rows: [{ id: 21 }, { id: 22 }, { id: 31 }, { id: 32 }] })
      .mockResolvedValueOnce({ rows: [{ batch_id: '1784710000000000' }] })
      .mockResolvedValueOnce({ rowCount: 5, rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 21 }, { id: 22 }, { id: 31 }, { id: 32 }] })
      .mockResolvedValueOnce({ rows: [{ roster_flight_id: 11 }, { roster_flight_id: 12 }] })
      .mockResolvedValueOnce({ rows: [{ roster_flight_id: 13 }] })
      .mockResolvedValueOnce({ rows: [{ crew_id: 'C001' }, { crew_id: 'C002' }] })
      .mockResolvedValueOnce({ rows: [] })
    const release = vi.fn()
    const fastify = {
      pgPool: {
        query: vi.fn(),
        connect: vi.fn(async () => ({ query: clientQuery, release })),
      },
      redis: {
        scan: vi.fn(async () => ({ cursor: 0, keys: [] })),
        del: vi.fn(async () => 0),
      },
    } as never

    const result = await rosterPublishService.applyDiff(fastify, {
      rosterPeriodId: 7,
      keys: rows.map((row) => row.key),
    }, 'planner')

    expect(result).toMatchObject({ batchId: 1784710000000000, applied: 3, inserted: 3, updated: 1, deleted: 4, staleKeys: [] })
    expect(clientQuery).toHaveBeenCalledTimes(14)
    expect(clientQuery.mock.calls.map(([sql]) => String(sql))).toEqual(expect.arrayContaining([
      'begin isolation level serializable',
      'commit',
    ]))
    const insertCalls = clientQuery.mock.calls.filter(([sql]) => String(sql).includes('insert into'))
    const adjustCalls = insertCalls.filter(([sql]) => String(sql).includes('roster_publish_adjust'))
    const publishCalls = insertCalls.filter(([sql]) => String(sql).includes('roster_publish ('))
    const recordCalls = insertCalls.filter(([sql]) => String(sql).includes('schedule_publish_record'))
    expect(adjustCalls).toHaveLength(1)
    expect(publishCalls).toHaveLength(2)
    expect(recordCalls).toHaveLength(1)
    expect(adjustCalls[0]?.[0]).toEqual(expect.stringContaining('jsonb_to_recordset($5::jsonb)'))
    expect(adjustCalls[0]?.[0]).toEqual(expect.stringContaining('n.roster_id is not distinct from o.roster_flight_id'))
    expect(adjustCalls[0]?.[0]).toEqual(expect.stringContaining('n.pair_order = o.pair_order'))
    expect(publishCalls[0]?.[0]).toEqual(expect.stringContaining('rf.id = any($2::bigint[]) and rf.pairing_id is not null'))
    expect(publishCalls[0]?.[0]).toEqual(expect.stringContaining('pairing_label, pairing_base, pairing_fleet, fleet_seg, tafb'))
    expect(publishCalls[0]?.[0]).toEqual(expect.stringContaining('coalesce(rf.act_credited_minutes, ps.duty_act_credited_minutes)'))
    expect(publishCalls[0]?.[0]).toEqual(expect.stringContaining('coalesce(rf.sch_credited_minutes, ps.duty_sch_credited_minutes, ps.duty_act_credited_minutes)'))
    expect(publishCalls[0]?.[0]).toEqual(expect.stringContaining('ps.fleet_seg'))
    expect(publishCalls[0]?.[1]).toEqual(['planner', [11, 12]])
    expect(publishCalls[1]?.[0]).toEqual(expect.stringContaining('rf.id = any($2::bigint[]) and rf.pairing_id is null'))
    expect(publishCalls[1]?.[1]).toEqual(['planner', [13]])
    expect(recordCalls[0]?.[0]).not.toEqual(expect.stringContaining('file_path'))
    expect(recordCalls[0]?.[0]).not.toEqual(expect.stringContaining('file_size'))
    expect(recordCalls[0]?.[0]).not.toEqual(expect.stringContaining('checksum'))
    expect(clientQuery.mock.calls.some(([sql]) =>
      String(sql).includes('count(distinct upper(base_candidate.base))'))).toBe(true)
    expect(release).toHaveBeenCalled()
  })

  it('applies ground updates by business identity and deletes the old publish row by publish id', async () => {
    const rows: RosterPublishDiffRow[] = [{
      key: 'G|C001|RES|PRAM|2026-08-01T10:00:00.000Z|2026-08-01T22:00:00.000Z|YVR|YVR',
      kind: 'GROUND',
      status: 'UPDATE',
      crewId: 'C001',
      crewName: 'Crew One',
      crewFleet: 'A321',
      base: 'YVR',
      pairingId: null,
      pairingLabel: 'PRAM',
      rosterIds: [103],
      publishIds: [203],
      assignmentGroup: 'RES',
      assignment: 'PRAM',
      actingRank: 'FO',
      schStrDtUtc: '2026-08-01T10:00:00.000Z',
      schEndDtUtc: '2026-08-01T22:00:00.000Z',
      depArp: 'YVR',
      arvArp: 'YVR',
      segmentCount: 1,
      changedFields: [],
      publishStatus: 'UNPUBLISHED',
      source: null,
      noc: null,
    }]
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ rp_start: new Date('2026-08-01T00:00:00Z'), rp_end: new Date('2026-08-31T00:00:00Z') }],
      })
      .mockResolvedValueOnce({ rows: rows.map(toRawDiff) })
      .mockResolvedValueOnce({ rows: toCrewScopes(rows) })
      .mockResolvedValueOnce({ rows: [{ id: 103 }] })
      .mockResolvedValueOnce({ rows: [{ id: 203 }] })
      .mockResolvedValueOnce({ rows: [{ batch_id: '1784710000000001' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 203 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ roster_flight_id: 103 }] })
      .mockResolvedValueOnce({ rows: [{ crew_id: 'C001' }] })
      .mockResolvedValueOnce({ rows: [] })
    const release = vi.fn()
    const fastify = {
      pgPool: {
        query: vi.fn(),
        connect: vi.fn(async () => ({ query: clientQuery, release })),
      },
      redis: {
        scan: vi.fn(async () => ({ cursor: 0, keys: [] })),
        del: vi.fn(async () => 0),
      },
    } as never

    const result = await rosterPublishService.applyDiff(fastify, {
      rosterPeriodId: 8,
      keys: rows.map((row) => row.key),
    }, 'planner')

    expect(result).toMatchObject({ batchId: 1784710000000001, applied: 1, inserted: 1, updated: 1, deleted: 1, staleKeys: [] })
    const adjustCall = clientQuery.mock.calls.find(([sql]) => String(sql).includes('roster_publish_adjust'))
    expect(adjustCall?.[0]).toEqual(expect.stringContaining('n.pair_order = o.pair_order'))
    expect(adjustCall?.[1]?.slice(0, 4)).toEqual([
      'planner',
      1784710000000001,
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-08-31T00:00:00Z'),
    ])
    const deleteCall = clientQuery.mock.calls.find(([sql]) => String(sql).includes('delete from') && String(sql).includes('roster_publish'))
    expect(deleteCall?.[0]).toEqual(expect.stringContaining('where id = any($1::bigint[])'))
    expect(deleteCall?.[1]).toEqual([[203]])
    const publishCalls = clientQuery.mock.calls.filter(([sql]) => String(sql).includes('roster_publish ('))
    expect(publishCalls[1]?.[0]).toEqual(expect.stringContaining('rf.comments'))
    expect(publishCalls[1]?.[0]).toEqual(expect.stringContaining('rf.request_source'))
    expect(publishCalls[1]?.[0]).toEqual(expect.stringContaining('rf.request_id'))
    expect(publishCalls[1]?.[1]).toEqual(['planner', [103]])
    expect(release).toHaveBeenCalled()
  })

  it('keeps the successful query budget bounded for 5,000 selected keys', async () => {
    const rows: RosterPublishDiffRow[] = Array.from({ length: 5_000 }, (_, index) => ({
      key: `G|C${index}|GRD|VAC|2026-07-01T00:00:00Z|2026-07-02T00:00:00Z||`,
      kind: 'GROUND',
      status: 'ADD',
      crewId: `C${index}`,
      crewName: null,
      crewFleet: null,
      base: 'YYZ',
      pairingId: null,
      pairingLabel: 'VAC',
      rosterIds: [index + 1],
      publishIds: [],
      assignmentGroup: 'GRD',
      assignment: 'VAC',
      actingRank: null,
      schStrDtUtc: '2026-07-01T00:00:00.000Z',
      schEndDtUtc: '2026-07-02T00:00:00.000Z',
      depArp: null,
      arvArp: null,
      segmentCount: 1,
      changedFields: [],
      publishStatus: 'UNPUBLISHED',
      source: null,
      noc: null,
    }))
    const ids = rows.map((row) => row.rosterIds[0] as number)
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ rp_start: new Date('2026-07-01T00:00:00Z'), rp_end: new Date('2026-07-31T00:00:00Z') }],
      })
      .mockResolvedValueOnce({ rows: rows.map(toRawDiff) })
      .mockResolvedValueOnce({ rows: toCrewScopes(rows) })
      .mockResolvedValueOnce({ rows: ids.map((id) => ({ id })) })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ batch_id: '1784710000000002' }] })
      .mockResolvedValueOnce({ rowCount: 5_000, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: ids.map((id) => ({ roster_flight_id: id })) })
      .mockResolvedValueOnce({ rows: rows.map((row) => ({ crew_id: row.crewId })) })
      .mockResolvedValueOnce({ rows: [] })
    const fastify = {
      pgPool: {
        query: vi.fn(),
        connect: vi.fn(async () => ({ query: clientQuery, release: vi.fn() })),
      },
      redis: {
        scan: vi.fn(async () => ({ cursor: 0, keys: [] })),
        del: vi.fn(async () => 0),
      },
    } as never

    const result = await rosterPublishService.applyDiff(fastify, {
      rosterPeriodId: 7,
      keys: rows.map((row) => row.key),
    }, 'planner')

    expect(result).toMatchObject({ applied: 5_000, inserted: 5_000, deleted: 0 })
    expect(clientQuery).toHaveBeenCalledTimes(14)
    expect(clientQuery.mock.calls.length).toBeLessThanOrEqual(18)
  })

  it('rolls back and returns a retryable product error on serialization failure', async () => {
    const serializationError = Object.assign(new Error('raw database detail'), { code: '40001' })
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ rp_start: new Date('2026-07-01T00:00:00Z'), rp_end: new Date('2026-07-31T00:00:00Z') }],
      })
      .mockRejectedValueOnce(serializationError)
      .mockResolvedValueOnce({ rows: [] })
    const release = vi.fn()
    const fastify = {
      pgPool: {
        connect: vi.fn(async () => ({ query: clientQuery, release })),
      },
    } as never

    await expect(rosterPublishService.applyDiff(fastify, {
      rosterPeriodId: 7,
      keys: ['G|C001|GRD|VAC'],
    }, 'planner')).rejects.toThrow('Roster data changed during publishing. Refresh the diff and try again.')
    expect(clientQuery.mock.calls.at(-1)?.[0]).toBe('rollback')
    expect(release).toHaveBeenCalled()
  })

  it('rolls back and hides database details when selected row counts no longer match', async () => {
    const row: RosterPublishDiffRow = {
      key: 'G|C001|GRD|VAC',
      kind: 'GROUND',
      status: 'ADD',
      crewId: 'C001',
      crewName: null,
      crewFleet: null,
      base: 'YYZ',
      pairingId: null,
      pairingLabel: 'VAC',
      rosterIds: [11],
      publishIds: [],
      assignmentGroup: 'GRD',
      assignment: 'VAC',
      actingRank: null,
      schStrDtUtc: '2026-07-01T00:00:00.000Z',
      schEndDtUtc: '2026-07-02T00:00:00.000Z',
      depArp: null,
      arvArp: null,
      segmentCount: 1,
      changedFields: [],
      publishStatus: 'UNPUBLISHED',
      source: null,
      noc: null,
    }
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ rp_start: new Date('2026-07-01T00:00:00Z'), rp_end: new Date('2026-07-31T00:00:00Z') }],
      })
      .mockResolvedValueOnce({ rows: [toRawDiff(row)] })
      .mockResolvedValueOnce({ rows: toCrewScopes([row]) })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const error = vi.fn()
    const fastify = {
      pgPool: {
        connect: vi.fn(async () => ({ query: clientQuery, release: vi.fn() })),
      },
      log: { error },
    } as never

    await expect(rosterPublishService.applyDiff(fastify, {
      rosterPeriodId: 7,
      keys: [row.key],
    }, 'planner')).rejects.toThrow('Roster publishing could not be completed. Refresh the diff and try again.')
    expect(clientQuery.mock.calls.at(-1)?.[0]).toBe('rollback')
    expect(error).toHaveBeenCalledWith(
      { rosterPeriodId: 7 },
      'Roster publish transaction failed',
    )
  })

  it('returns success when cache invalidation fails after commit', async () => {
    const row: RosterPublishDiffRow = {
      key: 'F|C001|9001',
      kind: 'FLYING',
      status: 'ADD',
      crewId: 'C001',
      crewName: null,
      crewFleet: '737',
      base: 'YYZ',
      pairingId: 9001,
      pairingLabel: 'T9001',
      rosterIds: [11],
      publishIds: [],
      assignmentGroup: 'FLY',
      assignment: 'FLY',
      actingRank: 'IFD',
      schStrDtUtc: '2026-07-01T00:00:00.000Z',
      schEndDtUtc: '2026-07-02T00:00:00.000Z',
      depArp: null,
      arvArp: null,
      segmentCount: 1,
      changedFields: [],
      publishStatus: 'UNPUBLISHED',
      source: null,
      noc: null,
    }
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ rp_start: new Date('2026-07-01T00:00:00Z'), rp_end: new Date('2026-07-31T00:00:00Z') }],
      })
      .mockResolvedValueOnce({ rows: [toRawDiff(row)] })
      .mockResolvedValueOnce({ rows: toCrewScopes([row]) })
      .mockResolvedValueOnce({ rows: [{ id: 11 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ batch_id: '1784710000000003' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ roster_flight_id: 11 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ crew_id: 'C001' }] })
      .mockResolvedValueOnce({ rows: [] })
    const warn = vi.fn()
    const fastify = {
      pgPool: {
        connect: vi.fn(async () => ({ query: clientQuery, release: vi.fn() })),
      },
      redis: {
        scan: vi.fn(async () => { throw new Error('redis unavailable') }),
      },
      log: { warn },
    } as never

    await expect(rosterPublishService.applyDiff(fastify, {
      rosterPeriodId: 7,
      keys: [row.key],
    }, 'planner')).resolves.toMatchObject({ applied: 1, inserted: 1 })
    expect(warn).toHaveBeenCalledWith(
      { rosterPeriodId: 7 },
      'Roster publish committed but cache invalidation failed',
    )
  })

  it('reconciles a lost commit acknowledgement and preserves the committed publication', async () => {
    const row: RosterPublishDiffRow = {
      key: 'G|C001|GRD|VAC',
      kind: 'GROUND',
      status: 'ADD',
      crewId: 'C001',
      crewName: 'Crew One',
      crewFleet: '737',
      base: 'YYZ',
      pairingId: null,
      pairingLabel: 'VAC',
      rosterIds: [11],
      publishIds: [],
      assignmentGroup: 'GRD',
      assignment: 'VAC',
      actingRank: 'IFD',
      schStrDtUtc: '2026-07-01T00:00:00.000Z',
      schEndDtUtc: '2026-07-02T00:00:00.000Z',
      depArp: 'YYZ',
      arvArp: 'YYZ',
      segmentCount: 1,
      changedFields: [],
      publishStatus: 'UNPUBLISHED',
      source: null,
      noc: null,
    }
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ rp_start: new Date('2026-07-01T00:00:00Z'), rp_end: new Date('2026-07-31T00:00:00Z') }],
      })
      .mockResolvedValueOnce({ rows: [toRawDiff(row)] })
      .mockResolvedValueOnce({ rows: toCrewScopes([row]) })
      .mockResolvedValueOnce({ rows: [{ id: 11 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ batch_id: '1784710000000004' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ roster_flight_id: 11 }] })
      .mockResolvedValueOnce({ rows: [{ crew_id: 'C001' }] })
      .mockRejectedValueOnce(new Error('connection closed after commit'))
    const poolQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{ crew_id: 'C001' }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
    const fastify = {
      pgPool: {
        query: poolQuery,
        connect: vi.fn(async () => ({ query: clientQuery, release: vi.fn() })),
      },
      redis: {
        scan: vi.fn(async () => ({ cursor: 0, keys: [] })),
        del: vi.fn(async () => 0),
      },
    } as never

    await expect(rosterPublishService.applyDiff(fastify, {
      rosterPeriodId: 7,
      keys: [row.key],
    }, 'planner')).resolves.toMatchObject({ batchId: 1784710000000004, applied: 1 })

    expect(poolQuery).toHaveBeenCalledTimes(2)
    expect(clientQuery.mock.calls.some(([sql]) => sql === 'rollback')).toBe(false)
  })
})
