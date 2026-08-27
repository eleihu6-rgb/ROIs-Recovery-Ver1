import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rosterService } from '../../../services/roster/roster-service.js'

vi.mock('../../../utils/cache.js', () => ({
  getOrSet: vi.fn((_redis, _key, _ttl, fetchFn) => fetchFn()),
  // 全未命中：用 ids 调一次 fetchMiss，按 ids 顺序展开各分片（模拟冷缓存回源）。
  getOrSetChunks: vi.fn(async (_redis, ids, _keyFor, _ttl, fetchMiss) => {
    const byId = await fetchMiss(ids)
    const out: any[] = []
    for (const id of ids) out.push(...(byId.get(id) ?? []))
    return out
  }),
  invalidate: vi.fn(),
  invalidatePattern: vi.fn(),
}))

vi.mock('../../../utils/audit.js', () => ({
  auditCreate: vi.fn((u: string) => ({ createdBy: u, createdAt: new Date(), updatedBy: u, updatedAt: new Date() })),
  auditUpdate: vi.fn((u: string) => ({ updatedBy: u, updatedAt: new Date() })),
}))

// Post-transaction composition-fill recompute is a separate DB statement; stub it so
// these service tests stay focused on the transaction body.
vi.mock('../../../utils/composition-fill.js', () => ({
  refreshPairingCompositionFill: vi.fn().mockResolvedValue(undefined),
  refreshPairingCompositionFillBulk: vi.fn().mockResolvedValue(undefined),
  refreshFlightCompositionFill: vi.fn().mockResolvedValue(undefined),
}))

import { invalidate, invalidatePattern } from '../../../utils/cache.js'
import { refreshPairingCompositionFillBulk } from '../../../utils/composition-fill.js'

const mockTask = {
  id: 1,
  crewId: 'C001',
  schStrDtUtc: new Date('2026-03-01T08:00:00Z'),
  isDeleted: 0,
  isSwapped: 0,
}

const createChainableDb = () => {
  const chain: any = {}
  const methods = [
    'select', 'from', 'where', 'limit', 'orderBy', 'offset',
    'insert', 'values', 'update', 'set', 'delete', '$dynamic',
    'leftJoin',
  ]
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.returning = vi.fn().mockResolvedValue([])
  chain.transaction = vi.fn()
  chain.then = vi.fn((resolve: any) => resolve([]))
  return chain
}

const createFastify = () => {
  const db = createChainableDb()
  // Versioned chunk cache: writes INCR roster:v2:chunkver:<crewId>; getView reads versions via mGet.
  const redis = {
    incr: vi.fn().mockResolvedValue(1),
    mGet: vi.fn().mockResolvedValue([]), // no versions yet → all default to '0'
  } as any
  const pgPool = {
    query: vi.fn(),
  } as any
  return { db, redis, pgPool, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any } as any
}

describe('rosterService', () => {
  let fastify: ReturnType<typeof createFastify>

  beforeEach(() => {
    vi.clearAllMocks()
    fastify = createFastify()
  })

  // ---------- getView ----------

  describe('getView', () => {
    // P0-1 后 getView 返回精简嵌套 DTO：select 结果是 `{ roster: {...列}, ...duty/seg }`，
    // map 再拼装成 gantt 消费的扁平 DTO。mock 必须给出 roster 子对象 + duty/seg 兜底字段。
    const rosterCols = (id: number, crewId: string) => ({
      id,
      crewId,
      pairingId: null,
      dutySeq: null,
      segSeq: null,
      fltId: null,
      fltDt: null,
      dutyRefTz: -300,
      base: 'YYZ',
      label: 'TASK',
      assignmentGroup: 'FLT',
      assignment: 'A',
      division: 'P',
      actingRank: 'CA',
      activeRank: 'CA',
      comments: null,
      source: null,
      schStrDtUtc: new Date('2026-03-01T08:00:00Z'),
      schEndDtUtc: new Date('2026-03-01T10:00:00Z'),
      actStrDtUtc: null,
      actEndDtUtc: null,
      actRestMin: null,
    })
    const mockRow = (id: number, crewId: string) => ({
      roster: rosterCols(id, crewId),
      dutyPickupStartUtc: null,
      dutyPickupEndUtc: null,
      dutyBriefStartUtc: null,
      dutyBriefEndUtc: null,
      dutyDebriefStartUtc: null,
      dutyDebriefEndUtc: null,
      dutyDropoffStartUtc: null,
      dutyDropoffEndUtc: null,
      dutySchRestMin: null,
      dutyActRestMin: null,
      pairingLabel: null,
      segSchStrDtUtc: null,
      segSchEndDtUtc: null,
      segActStrDtUtc: null,
      segActEndDtUtc: null,
      segFltId: null,
      segFltDt: null,
      segFltNum: null,
      segDepArp: null,
      segArvArp: null,
      segAssignment: null,
    })

    it('maps nested rows to the trimmed gantt DTO for specified crew/date range', async () => {
      const rows = [
        { ...mockRow(1, 'C001'), segAssignment: 'DHD' },
        mockRow(2, 'C002'),
      ]
      fastify.db.then.mockImplementation((resolve: any) => resolve(rows))

      const result = await rosterService.getView(fastify, {
        crewIds: ['C001', 'C002'],
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      })

      expect(fastify.db.select).toHaveBeenCalled()
      expect(result).toHaveLength(2)
      // 拼装出的 gantt DTO：标识/展示/时间 + duty 级字段。
      expect(result[0]).toMatchObject({
        id: 1,
        crewId: 'C001',
        base: 'YYZ',
        label: 'TASK',
        pairingLabel: null,
        assignmentGroup: 'FLT',
        schStrDtUtc: new Date('2026-03-01T08:00:00Z'),
        schEndDtUtc: new Date('2026-03-01T10:00:00Z'),
        pickupStartUtc: null,
        dutyActRestMin: null,
        dutyRefTz: -300,
        segAssignment: 'DHD',
      })
      expect(result[1]).toMatchObject({ id: 2, crewId: 'C002' })
      // DTO 裁剪：内部/审计字段不应出现在响应里（证明确实精简）。
      expect(result[0]).not.toHaveProperty('isDeleted')
      expect(result[0]).not.toHaveProperty('isSwapped')
      expect(result[0]).not.toHaveProperty('roster')
    })

    it('returns pairingLabel for flying roster rows', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([{
        ...mockRow(1, 'C001'),
        roster: { ...rosterCols(1, 'C001'), pairingId: 200 },
        pairingLabel: 'P200',
      }]))

      const result = await rosterService.getView(fastify, {
        crewIds: ['C001'],
        startDate: '2026-07-01',
        endDate: '2026-07-31',
      })

      expect(result[0]).toMatchObject({ pairingId: 200, pairingLabel: 'P200' })
    })

    it('should return empty array when no tasks match', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([]))

      const result = await rosterService.getView(fastify, {
        crewIds: ['C999'],
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      })

      expect(result).toEqual([])
    })
  })

  // ---------- getById ----------

  describe('getById', () => {
    it('should return task when found', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([mockTask]))

      const result = await rosterService.getById(fastify, 1)

      expect(result).toEqual(mockTask)
    })

    it('should return null when not found', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([]))

      const result = await rosterService.getById(fastify, 999)

      expect(result).toBeNull()
    })
  })

  describe('listBulkDeleteCandidates', () => {
    it('applies CrewId/Source filters, exact local-date RP bounds, and returns detail columns', async () => {
      fastify.pgPool.query
        .mockResolvedValueOnce({
          rows: [{ mode: 'PAIRED', assignment: 'FLY', assignment_group: 'FLT', count: '1' }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: '11',
            pairing_id: '22',
            crew_id: 'C001',
            source: 'MA',
            start_dt: '2026-07-01',
            assignment_group: 'FLT',
            assignment: 'FLY',
            pairing_label: 'P22',
            roster_acting_rank: 'CA',
            flt_num: '100',
            dep_arp: 'YYZ',
            arv_arp: 'YVR',
          }],
        })

      const result = await rosterService.listBulkDeleteCandidates(fastify, {
        startDate: '2026-07-01',
        endDate: '2026-07-31',
        groupKeys: ['PAIRED\u001fFLT\u001fFLY'],
        crewIds: ['c001'],
        sources: ['ma'],
      })

      expect(result.groups).toEqual([{ mode: 'PAIRED', assignment: 'FLY', assignmentGroup: 'FLT', count: 1 }])
      expect(result.rows[0]).toMatchObject({
        id: 11,
        pairingId: 22,
        crewId: 'C001',
        source: 'MA',
        rosterActingRank: 'CA',
        fltNum: '100',
        depArp: 'YYZ',
        arvArp: 'YVR',
      })

      const firstSql = String(fastify.pgPool.query.mock.calls[0][0])
      const firstParams = fastify.pgPool.query.mock.calls[0][1]
      expect(firstSql).toContain("rf.sch_str_dt_utc >= ($1::date - interval '2 day')")
      expect(firstSql).toContain("rf.sch_str_dt_utc < ($2::date + interval '3 day')")
      expect(firstSql).toContain("(((rf.sch_str_dt_utc at time zone 'UTC') at time zone coalesce(valid_timezone.name, 'UTC'))::date) >= $1::date")
      expect(firstSql).toContain("(((rf.sch_str_dt_utc at time zone 'UTC') at time zone coalesce(valid_timezone.name, 'UTC'))::date) < ($2::date + interval '1 day')")
      expect(firstSql).toContain('upper(rf.crew_id) = any($3::text[])')
      expect(firstSql).toContain("upper(coalesce(rf.source, '')) = any($4::text[])")
      expect(firstParams).toEqual(['2026-07-01', '2026-07-31', ['C001'], ['MA']])

      const rowsSql = String(fastify.pgPool.query.mock.calls[1][0])
      expect(rowsSql).toContain('rf.roster_acting_rank')
      expect(rowsSql).toContain("coalesce(ps.flt_num, f.flt_num, nullif(rf.assignment, '')) as flt_num")
      expect(rowsSql).toContain('coalesce(rf.dep_arp, ps.dep_arp, f.dep_arp) as dep_arp')
      expect(rowsSql).toContain('coalesce(rf.arv_arp, ps.arv_arp, f.arv_arp) as arv_arp')
    })
  })

  // ---------- create ----------

  describe('create', () => {
    it('should insert task and invalidate view cache', async () => {
      const created = { ...mockTask, id: 3 }
      fastify.db.returning.mockResolvedValue([created])

      const result = await rosterService.create(fastify, mockTask as any, 'admin')

      expect(result).toEqual(created)
      // 版本化分片缓存：仅自增该 crew 的版本计数器（取代 SCAN 删除）
      expect(fastify.redis.incr).toHaveBeenCalledWith('roster:v2:chunkver:C001')
    })
  })

  // ---------- update ----------

  describe('update', () => {
    it('should update task and invalidate caches', async () => {
      const updated = { ...mockTask, crewId: 'C002' }
      fastify.db.returning.mockResolvedValue([updated])

      const result = await rosterService.update(fastify, 1, { crewId: 'C002' } as any, 'admin')

      expect(result).toEqual(updated)
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'roster:v2:1')
      // data 改了 crewId（改派）→ 旧 crew 未知，整批兜底删除全部 roster 分片（含所有版本）
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'roster:v2:chunk:*')
      // 整批兜底时不走单 crew 版本自增
      expect(fastify.redis.incr).not.toHaveBeenCalled()
    })

    it('non-crew field update invalidates only the row crew chunks', async () => {
      const updated = { ...mockTask, comments: 'note' }
      fastify.db.returning.mockResolvedValue([updated])

      await rosterService.update(fastify, 1, { comments: 'note' } as any, 'admin')

      // 未改 crewId → 仅自增本 crew 版本，不整批清空
      expect(fastify.redis.incr).toHaveBeenCalledWith('roster:v2:chunkver:C001')
      expect(invalidatePattern).not.toHaveBeenCalledWith(fastify.redis, 'roster:v2:chunk:*')
    })
  })

  // ---------- remove ----------

  describe('remove', () => {
    it('should soft-delete task and invalidate caches', async () => {
      const removed = { ...mockTask, isDeleted: 1 }
      fastify.db.returning.mockResolvedValue([removed])

      const result = await rosterService.remove(fastify, 1, 'admin')

      expect(result).toEqual(removed)
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'roster:v2:1')
      expect(fastify.redis.incr).toHaveBeenCalledWith('roster:v2:chunkver:C001')
    })
  })

  describe('bulkRemove', () => {
    it('aggregates the updated rows in PostgreSQL and invalidates row caches in one Redis call', async () => {
      fastify.pgPool.query.mockResolvedValueOnce({
        rows: [{
          deleted_ids: ['101', '102', '103'],
          crew_ids: ['C001', 'C002'],
          pairing_ids: ['22'],
          deleted: '3',
          first_sch_str_dt_utc: new Date('2026-07-01T08:00:00Z'),
          last_sch_str_dt_utc: new Date('2026-07-03T08:00:00Z'),
        }],
      })

      const result = await rosterService.bulkRemove(fastify, [101, 102, 102], [
        { pairingId: 22, crewId: 'C001' },
        { pairingId: 22, crewId: 'C001' },
      ], 'planner')

      expect(result).toEqual({
        deleted: 3,
        crewIds: ['C001', 'C002'],
        pairingIds: [22],
        firstSchStrDtUtc: new Date('2026-07-01T08:00:00Z'),
        lastSchStrDtUtc: new Date('2026-07-03T08:00:00Z'),
      })
      expect(fastify.pgPool.query).toHaveBeenCalledTimes(1)
      const [query, queryParams] = fastify.pgPool.query.mock.calls[0]
      expect(String(query)).toContain('with updated as')
      expect(String(query)).toContain('returning id, crew_id, pairing_id, sch_str_dt_utc')
      expect(String(query)).toContain('array_agg(distinct crew_id)')
      expect(queryParams).toEqual([[101, 102], 'planner', 22, 'C001'])
      expect(invalidate).toHaveBeenCalledWith(
        fastify.redis,
        'roster:v2:101',
        'roster:v2:102',
        'roster:v2:103',
      )
      expect(fastify.redis.incr).toHaveBeenCalledWith('roster:v2:chunkver:C001')
      expect(fastify.redis.incr).toHaveBeenCalledWith('roster:v2:chunkver:C002')
    })
  })

  // ---------- swap ----------

  describe('swap', () => {
    it('should swap crew assignments between two tasks in a transaction', async () => {
      const taskA = { ...mockTask, id: 1, crewId: 'C001' }
      const taskB = { ...mockTask, id: 2, crewId: 'C002' }
      const updatedA = { ...taskA, crewId: 'C002', isSwapped: 1 }
      const updatedB = { ...taskB, crewId: 'C001', isSwapped: 1 }

      fastify.db.transaction.mockImplementation(async (fn: any) => {
        const txChain: any = {}
        const methods = ['select', 'from', 'where', 'update', 'set', 'orderBy', 'limit']
        for (const m of methods) {
          txChain[m] = vi.fn(() => txChain)
        }
        // select queries resolve via then; returning resolves for updates
        let thenCount = 0
        txChain.then = vi.fn((resolve: any) => {
          thenCount++
          if (thenCount === 1) return resolve([taskA])
          if (thenCount === 2) return resolve([taskB])
          return resolve([])
        })
        txChain.returning = vi.fn()
          .mockResolvedValueOnce([updatedA])
          .mockResolvedValueOnce([updatedB])
        return fn(txChain)
      })

      const result = await rosterService.swap(fastify, 1, 2, 'admin')

      expect(result).toEqual({ taskA: updatedA, taskB: updatedB })
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'roster:v2:1', 'roster:v2:2')
      // 互换涉及的两个 crew（换好后的归属）→ 各自版本自增
      expect(fastify.redis.incr).toHaveBeenCalledWith('roster:v2:chunkver:C002')
      expect(fastify.redis.incr).toHaveBeenCalledWith('roster:v2:chunkver:C001')
    })

    it('should throw when one task not found', async () => {
      fastify.db.transaction.mockImplementation(async (fn: any) => {
        const txChain: any = {}
        const methods = ['select', 'from', 'where', 'update', 'set']
        for (const m of methods) {
          txChain[m] = vi.fn(() => txChain)
        }
        let thenCount = 0
        txChain.then = vi.fn((resolve: any) => {
          thenCount++
          if (thenCount === 1) return resolve([mockTask])
          return resolve([])   // second task not found
        })
        return fn(txChain)
      })

      await expect(rosterService.swap(fastify, 1, 999, 'admin')).rejects.toThrow('One or both tasks not found')
    })
  })

  // ---------- move ----------

  describe('move', () => {
    it('should move task to target crew in a transaction', async () => {
      const task = { ...mockTask }
      const updated = { ...mockTask, crewId: 'C099' }

      fastify.db.transaction.mockImplementation(async (fn: any) => {
        const txChain: any = {}
        const methods = ['select', 'from', 'where', 'update', 'set']
        for (const m of methods) {
          txChain[m] = vi.fn(() => txChain)
        }
        txChain.then = vi.fn((resolve: any) => resolve([task]))
        txChain.returning = vi.fn().mockResolvedValue([updated])
        return fn(txChain)
      })

      const result = await rosterService.move(fastify, 1, 'C099', 'admin')

      // move now also surfaces the source crew so callers can recompute BOTH
      // sides' CrewManday (source lost the task, target gained it).
      expect(result).toEqual({ ...updated, sourceCrewId: 'C001' })
      expect(result.sourceCrewId).toBe('C001')
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'roster:v2:1')
      // 改派涉及源 crew（C001）与目标 crew（C099）→ 各自版本自增
      expect(fastify.redis.incr).toHaveBeenCalledWith('roster:v2:chunkver:C001')
      expect(fastify.redis.incr).toHaveBeenCalledWith('roster:v2:chunkver:C099')
    })

    it('should throw when task not found', async () => {
      fastify.db.transaction.mockImplementation(async (fn: any) => {
        const txChain: any = {}
        const methods = ['select', 'from', 'where']
        for (const m of methods) {
          txChain[m] = vi.fn(() => txChain)
        }
        txChain.then = vi.fn((resolve: any) => resolve([]))
        return fn(txChain)
      })

      await expect(rosterService.move(fastify, 999, 'C001', 'admin')).rejects.toThrow('Task not found')
    })
  })

  // ---------- createGroundTask ----------

  describe('createGroundTask', () => {
    it('creates roster_flight rows for each crew with pairingId null and correct assignment data', async () => {
      const crewIds = ['C001', 'C002']
      const assignment = 'APT'
      const depArp = 'YVR'
      const arvArp = 'YYZ'
      const startDtUtc = '2026-05-10T06:00:00.000Z'
      const endDtUtc = '2026-05-10T14:00:00.000Z'

      const mockAssignment = {
        assignment: 'APT',
        defaultAssignmentGroup: 'SBY',
        restTime: 480,
        fixedCreditMin: 240,
      }

      const createdRows = [
        { id: 1, crewId: 'C001', pairingId: null, base: depArp, depArp, arvArp, assignmentGroup: 'SBY', assignment: 'APT', actRestMin: 480, source: 'MA' },
        { id: 2, crewId: 'C002', pairingId: null, base: depArp, depArp, arvArp, assignmentGroup: 'SBY', assignment: 'APT', actRestMin: 480, source: 'MA' },
      ]

      let capturedSelect: ReturnType<typeof vi.fn> | undefined
      let capturedValues: unknown
      fastify.db.transaction.mockImplementation(async (fn: any) => {
        const txChain: any = {}
        const methods = ['select', 'from', 'where', 'orderBy', 'limit', 'insert', 'values', 'returning']
        for (const m of methods) {
          txChain[m] = vi.fn(() => txChain)
        }
        capturedSelect = txChain.select
        txChain.values = vi.fn((values: unknown) => {
          capturedValues = values
          return txChain
        })

        let selectCount = 0
        txChain.then = vi.fn((resolve: any) => {
          selectCount++
          if (selectCount === 1) return resolve([mockAssignment]) // assignment
          if (selectCount === 2) return resolve([])        // duplicate check
          return resolve([])
        })

        // Simulate insert returning
        txChain.returning = vi.fn().mockResolvedValue(createdRows)

        return fn(txChain)
      })

      const result = await rosterService.createGroundTask(
        fastify,
        { crewIds, assignment, depArp, arvArp, startDtUtc, endDtUtc },
        'test_user',
      )

      expect(capturedSelect).toHaveBeenCalledTimes(2)
      expect(result).toHaveLength(2)
      for (const row of result) {
        expect(row.pairingId).toBeNull()
        expect(row.assignmentGroup).toBe('SBY')
        expect(row.assignment).toBe('APT')
        expect(row.actRestMin).toBe(480)
        expect(row.source).toBe('MA')
      }
      expect(result.find((r: any) => r.crewId === 'C001')?.base).toBe(depArp)
      expect(result.find((r: any) => r.crewId === 'C002')?.base).toBe(depArp)
      expect(capturedValues).toEqual(expect.arrayContaining([
        expect.objectContaining({ base: depArp, depArp, arvArp, schCreditedMinutes: '240', actCreditedMinutes: '240' }),
      ]))
      // 批量地面任务：自增涉及的全部 crew 版本
      expect(fastify.redis.incr).toHaveBeenCalledWith('roster:v2:chunkver:C001')
      expect(fastify.redis.incr).toHaveBeenCalledWith('roster:v2:chunkver:C002')
    })

    it('throws when assignment does not exist', async () => {
      const crewIds = ['C001']
      const assignment = 'NONEXISTENT'
      const startDtUtc = '2026-05-10T06:00:00.000Z'
      const endDtUtc = '2026-05-10T14:00:00.000Z'

      fastify.db.transaction.mockImplementation(async (fn: any) => {
        const txChain: any = {}
        const methods = ['select', 'from', 'where']
        for (const m of methods) {
          txChain[m] = vi.fn(() => txChain)
        }

        txChain.then = vi.fn((resolve: any) => resolve([])) // assignment not found

        return fn(txChain)
      })

      await expect(
        rosterService.createGroundTask(
          fastify,
          { crewIds, assignment, depArp: 'YVR', arvArp: 'YYZ', startDtUtc, endDtUtc },
          'test_user',
        ),
      ).rejects.toThrow("Assignment 'NONEXISTENT' not found")
    })

    it('uses manual credit for roster_flight scheduled and actual credited minutes', async () => {
      const crewIds = ['C001']
      const assignment = 'CRAM'
      const startDtUtc = '2026-05-10T06:00:00.000Z'
      const endDtUtc = '2026-05-10T14:00:00.000Z'
      const mockAssignment = {
        assignment: 'CRAM',
        defaultAssignmentGroup: 'RES',
        restTime: null,
        fixedCreditMin: 240,
      }

      let capturedValues: unknown
      fastify.db.transaction.mockImplementation(async (fn: any) => {
        const txChain: any = {}
        const methods = ['select', 'from', 'where', 'insert', 'values', 'returning']
        for (const m of methods) {
          txChain[m] = vi.fn(() => txChain)
        }
        txChain.values = vi.fn((values: unknown) => {
          capturedValues = values
          return txChain
        })

        let selectCount = 0
        txChain.then = vi.fn((resolve: any) => {
          selectCount++
          if (selectCount === 1) return resolve([mockAssignment])
          if (selectCount === 2) return resolve([])
          return resolve([])
        })
        txChain.returning = vi.fn().mockResolvedValue([])

        return fn(txChain)
      })

      await rosterService.createGroundTask(
        fastify,
        { crewIds, assignment, depArp: 'YVR', arvArp: 'YYZ', startDtUtc, endDtUtc, creditMin: 135 },
        'test_user',
      )

      expect(capturedValues).toEqual([
        expect.objectContaining({
          schCreditedMinutes: '135',
          actCreditedMinutes: '135',
        }),
      ])
    })

    // Regression (duplicate-submission bug): a draft Save that partially fails leaves the
    // add-ground-task op in the queue; retrying re-calls createGroundTask with the SAME
    // input. Previously every call inserted fresh rows → stacked, un-deletable duplicate
    // DOs. createGroundTask must be idempotent: skip crew that already have an identical
    // active ground task (same assignment + window + pairingId null).
    it('does NOT insert a duplicate when an identical active ground task already exists', async () => {
      const crewIds = ['C001']
      const assignment = 'DO'
      const startDtUtc = '2026-06-06T06:05:00.000Z'
      const endDtUtc = '2026-06-08T06:05:00.000Z'

      const mockAssignment = { assignment: 'DO', defaultAssignmentGroup: 'LVE', restTime: null }

      let insertSpy: ReturnType<typeof vi.fn> | undefined
      fastify.db.transaction.mockImplementation(async (fn: any) => {
        const txChain: any = {}
        const methods = ['select', 'from', 'where', 'orderBy', 'limit', 'insert', 'values', 'returning']
        for (const m of methods) {
          txChain[m] = vi.fn(() => txChain)
        }
        insertSpy = txChain.insert

        // select #1 = assignment, #2 = existing-duplicate check (FOUND)
        let selectCount = 0
        txChain.then = vi.fn((resolve: any) => {
          selectCount++
          if (selectCount === 1) return resolve([mockAssignment])
          if (selectCount === 2) return resolve([{ crewId: 'C001' }]) // identical active DO already exists
          return resolve([])
        })
        txChain.returning = vi.fn().mockResolvedValue([])

        return fn(txChain)
      })

      const result = await rosterService.createGroundTask(
        fastify,
        { crewIds, assignment, depArp: 'YVR', arvArp: 'YYZ', startDtUtc, endDtUtc },
        'Jen',
      )

      // No insert at all — the row already exists, so the retry is a no-op.
      expect(insertSpy).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })

    it('inserts only the crew that do NOT already have an identical active ground task', async () => {
      const crewIds = ['C001', 'C002']
      const assignment = 'DO'
      const startDtUtc = '2026-06-06T06:05:00.000Z'
      const endDtUtc = '2026-06-08T06:05:00.000Z'

      const mockAssignment = { assignment: 'DO', defaultAssignmentGroup: 'LVE', restTime: null }

      let valuesSpy: ReturnType<typeof vi.fn> | undefined
      fastify.db.transaction.mockImplementation(async (fn: any) => {
        const txChain: any = {}
        const methods = ['select', 'from', 'where', 'orderBy', 'limit', 'insert', 'values', 'returning']
        for (const m of methods) {
          txChain[m] = vi.fn(() => txChain)
        }
        valuesSpy = txChain.values

        let selectCount = 0
        txChain.then = vi.fn((resolve: any) => {
          selectCount++
          if (selectCount === 1) return resolve([mockAssignment])
          if (selectCount === 2) return resolve([{ crewId: 'C001' }]) // C001 already has it; C002 does not
          return resolve([])
        })
        txChain.returning = vi.fn().mockResolvedValue([
          { id: 9, crewId: 'C002', pairingId: null, base: 'SHA', assignmentGroup: 'LVE', assignment: 'DO', source: 'MA' },
        ])

        return fn(txChain)
      })

      const result = await rosterService.createGroundTask(
        fastify,
        { crewIds, assignment, depArp: 'YVR', arvArp: 'YYZ', startDtUtc, endDtUtc },
        'Jen',
      )

      // Only C002 gets inserted; C001 is skipped as a duplicate.
      const inserted = valuesSpy!.mock.calls[0][0]
      expect(Array.isArray(inserted)).toBe(true)
      expect(inserted).toHaveLength(1)
      expect(inserted[0]).toMatchObject({ crewId: 'C002', pairingId: null })
      expect(result).toHaveLength(1)
      expect(result[0].crewId).toBe('C002')
    })

    it('is atomic - transaction ensures rollback on error', async () => {
      const crewIds = ['C001', 'C002']
      const assignment = 'APT'
      const startDtUtc = '2026-05-10T06:00:00.000Z'
      const endDtUtc = '2026-05-10T14:00:00.000Z'

      const mockAssignment = {
        assignment: 'APT',
        defaultAssignmentGroup: 'SBY',
        restTime: 480,
      }

      // Transaction should surface insert errors.
      fastify.db.transaction.mockImplementation(async (fn: any) => {
        const txChain: any = {}
        const methods = ['select', 'from', 'where', 'orderBy', 'limit']
        for (const m of methods) {
          txChain[m] = vi.fn(() => txChain)
        }

        let selectCount = 0
        txChain.then = vi.fn((resolve: any) => {
          selectCount++
          if (selectCount === 1) return resolve([mockAssignment])
          if (selectCount === 2) return resolve([])
          return resolve([])
        })

        txChain.insert = vi.fn(() => txChain)
        txChain.values = vi.fn(() => txChain)
        txChain.returning = vi.fn().mockRejectedValue(new Error('insert failed'))

        return fn(txChain)
      })

      await expect(
        rosterService.createGroundTask(
          fastify,
          { crewIds, assignment, depArp: 'YVR', arvArp: 'YYZ', startDtUtc, endDtUtc },
          'test_user',
        ),
      ).rejects.toThrow('insert failed')
    })
  })

  // ---------- assignPairing ----------

  describe('assignPairing', () => {
    it('batch-inserts one roster_flight per segment in a SINGLE insert and merges duty fields', async () => {
      const pairingId = 42
      const crewId = 'C001'
      const rosterActingRank = 'CA'

      const mockPair = {
        id: pairingId,
        base: 'PEK',
        assignmentGroup: 'FLT',
        assignment: 'FLT',
        division: 'INTL',
        source: 'IMPORT',
      }

      // Two segments → two roster_flight rows, but only ONE insert statement.
      const mockSegments = [
        {
          fltNum: 'CA101', depArp: 'PEK', arvArp: 'SHA', fltId: 1001, fltDt: '2026-05-10',
          dutySeq: 1, segSeq: 1, segAssignment: null,
          schStrDtUtc: new Date('2026-05-10T02:00:00Z'), schEndDtUtc: new Date('2026-05-10T04:00:00Z'),
          actStrDtUtc: null, actEndDtUtc: null, schCreditedMinutesSeg: 120, schFmCreditedMinutesSeg: 120,
          dutyActRestMin: null, pickupStartUtc: new Date('2026-05-10T01:00:00Z'), pickupEndUtc: null,
          briefStartUtc: null, briefEndUtc: null, debriefStartUtc: null, debriefEndUtc: null,
          dropoffStartUtc: null, dropoffEndUtc: null,
        },
        {
          fltNum: 'CA102', depArp: 'SHA', arvArp: 'CAN', fltId: 1002, fltDt: '2026-05-10',
          dutySeq: 1, segSeq: 2, segAssignment: null,
          schStrDtUtc: new Date('2026-05-10T05:00:00Z'), schEndDtUtc: new Date('2026-05-10T07:00:00Z'),
          actStrDtUtc: null, actEndDtUtc: null, schCreditedMinutesSeg: 120, schFmCreditedMinutesSeg: 120,
          dutyActRestMin: null, pickupStartUtc: null, pickupEndUtc: null,
          briefStartUtc: new Date('2026-05-10T04:30:00Z'), briefEndUtc: null, debriefStartUtc: null, debriefEndUtc: null,
          dropoffStartUtc: null, dropoffEndUtc: null,
        },
      ]

      // Rows the DB returns (RETURNING preserves VALUES order → row[i] ↔ segment[i]).
      const returnedRows = [
        { id: 1, crewId, pairingId, fltId: 1001, segSeq: 1, label: 'CA101 PEK-SHA' },
        { id: 2, crewId, pairingId, fltId: 1002, segSeq: 2, label: 'CA102 SHA-CAN' },
      ]

      let insertSpy: ReturnType<typeof vi.fn> | undefined
      let valuesSpy: ReturnType<typeof vi.fn> | undefined
      fastify.db.transaction.mockImplementation(async (fn: any) => {
        const txChain: any = {}
        const methods = ['select', 'from', 'where', 'orderBy', 'limit', 'insert', 'values']
        for (const m of methods) {
          txChain[m] = vi.fn(() => txChain)
        }
        insertSpy = txChain.insert
        valuesSpy = txChain.values

        // select #1 = pairing header, #2 = existing-dup check (none), #3 = segments
        let selectCount = 0
        txChain.then = vi.fn((resolve: any) => {
          selectCount++
          if (selectCount === 1) return resolve([mockPair])    // pairing header
          if (selectCount === 2) return resolve([])            // no existing assignment
          if (selectCount === 3) return resolve(mockSegments)  // segments
          return resolve([])
        })
        txChain.returning = vi.fn().mockResolvedValue(returnedRows)

        return fn(txChain)
      })

      const result = await rosterService.assignPairing(
        fastify, pairingId, crewId, rosterActingRank, 'test_user',
      )
      expect(refreshPairingCompositionFillBulk).toHaveBeenCalledWith(fastify.db, [pairingId], 'test_user')

      // Regression: a single batch insert for all segments (was one insert per segment).
      expect(insertSpy).toHaveBeenCalledTimes(1)
      // values() received an ARRAY of all segment rows, not a single object.
      const insertedValues = valuesSpy!.mock.calls[0][0]
      expect(Array.isArray(insertedValues)).toBe(true)
      expect(insertedValues).toHaveLength(2)
      expect(insertedValues[0]).toMatchObject({ crewId, pairingId, fltId: 1001, base: 'PEK', rosterActingRank: 'CA' })
      expect(insertedValues[1]).toMatchObject({ fltId: 1002 })

      // Duty-level fields are merged back onto the correct returned row (index-aligned).
      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ id: 1, fltId: 1001, pickupStartUtc: mockSegments[0].pickupStartUtc })
      expect(result[1]).toMatchObject({ id: 2, fltId: 1002, briefStartUtc: mockSegments[1].briefStartUtc })
    })
  })
})
