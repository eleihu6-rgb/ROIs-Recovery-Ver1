import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { scenarioService } from '../../../services/scenario/scenario-service.js'
import { scenarioParameterService } from '../../../services/scenario/scenario-parameter-service.js'

vi.mock('../../../utils/cache.js', () => ({
  getOrSet: vi.fn((_redis, _key, _ttl, fetchFn) => fetchFn()),
  invalidate: vi.fn(),
  invalidatePattern: vi.fn(),
}))

vi.mock('../../../utils/audit.js', () => ({
  auditCreate: vi.fn((u: string) => ({ createdBy: u, createdAt: new Date(), updatedBy: u, updatedAt: new Date() })),
  auditUpdate: vi.fn((u: string) => ({ updatedBy: u, updatedAt: new Date() })),
}))

vi.mock('../../../services/scenario/scenario-export-service.js', () => ({
  countScenarioRunScope: vi.fn(),
}))

vi.mock('../../../services/engine-server-client.js', () => ({
  engineServerClient: {
    startRoTask: vi.fn().mockResolvedValue('task-123'),
  },
}))

vi.mock('../../../utils/filiale.js', () => ({
  resolveFiliale: vi.fn(async () => 'F8'),
  resolveFilialeLower: vi.fn(async () => 'f8'),
}))

import { invalidate, invalidatePattern } from '../../../utils/cache.js'
import { countScenarioRunScope } from '../../../services/scenario/scenario-export-service.js'
import { engineServerClient } from '../../../services/engine-server-client.js'

const mockScenario = {
  id: 1,
  name: 'March 2026 Schedule',
  status: 'DRAFT',
  createdAt: new Date('2026-01-01T00:00:00Z'),
}

const createChainableDb = () => {
  const chain: any = {}
  const methods = [
    'select', 'from', 'where', 'leftJoin', 'innerJoin', 'limit', 'orderBy', 'offset',
    'insert', 'values', 'update', 'set', 'delete', '$dynamic',
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
  return {
    db,
    pgPool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
    redis: {} as any,
    log: { info: vi.fn(), warn: vi.fn() } as any,
  } as any
}

describe('scenarioService', () => {
  let fastify: ReturnType<typeof createFastify>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(countScenarioRunScope).mockResolvedValue({ crewCount: 1, pairingCount: 1 })
    vi.mocked(engineServerClient.startRoTask).mockResolvedValue('task-123')
    fastify = createFastify()
  })

  // ---------- list ----------

  describe('list', () => {
    it('uses case-insensitive matching for scenario name search', () => {
      const serviceSource = readFileSync(resolve(process.cwd(), 'src/services/scenario/scenario-service.ts'), 'utf8')

      expect(serviceSource).toContain('ilike(workset.name')
      expect(serviceSource).not.toMatch(/[^i]like\(scenario\.name/)
    })

    it('uses one broad scenario search term across id, name, and updater code', () => {
      const serviceSource = readFileSync(resolve(process.cwd(), 'src/services/scenario/scenario-service.ts'), 'utf8')

      expect(serviceSource).toContain('searchTerm')
      expect(serviceSource).toContain('scenario.id}::text')
      expect(serviceSource).toContain('ilike(workset.name')
      expect(serviceSource).toContain('ilike(scenario.updatedBy')
      expect(serviceSource).not.toContain('ilike(users.userName')
    })

    it('keeps old name query as a fallback when search is absent', () => {
      const serviceSource = readFileSync(resolve(process.cwd(), 'src/services/scenario/scenario-service.ts'), 'utf8')

      expect(serviceSource).toContain('search ?? name')
    })

    it('does not join users because scenario updater is already stored as user_code', () => {
      const serviceSource = readFileSync(resolve(process.cwd(), 'src/services/scenario/scenario-service.ts'), 'utf8')

      expect(serviceSource).not.toContain('leftJoin(users')
    })

    it('uses optimizer-placed roster flight rows as the scenario list result count', () => {
      const serviceSource = readFileSync(resolve(process.cwd(), 'src/services/scenario/scenario-service.ts'), 'utf8')

      expect(serviceSource).toContain('optimizedCount:')
      expect(serviceSource).toContain('scenario.roster_flight')
      expect(serviceSource).toContain("rf.source = 'CR'")
      expect(serviceSource).toContain('rf.is_deleted = 0')
    })

    it('should return paginated scenario list', async () => {
      const enrichedScenario = { ...mockScenario, updatedBy: 'admin' }
      let thenCallCount = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        thenCallCount++
        if (thenCallCount === 1) return resolve([enrichedScenario])   // items
        if (thenCallCount === 2) return resolve([{ count: 1 }])    // count
        return resolve([])
      })

      const result = await scenarioService.list(fastify, { page: 1, pageSize: 20 })

      expect(result.items).toEqual([enrichedScenario])
      expect(result.items[0]).toMatchObject({ updatedBy: 'admin' })
      expect(fastify.db.leftJoin).not.toHaveBeenCalled()
      expect(result.total).toBe(1)
    })
  })

  // ---------- getById ----------

  describe('getById', () => {
    it('should return scenario when found', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([mockScenario]))

      const result = await scenarioService.getById(fastify, 1)

      expect(result).toEqual(mockScenario)
    })

    it('normalizes legacy PO workset id stored in pairingScenarioId to PO scenario id', async () => {
      const legacy = {
        ...mockScenario,
        fileType: 'RO',
        pairingScenarioId: 721,
      }
      let n = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        n += 1
        if (n === 1) return resolve([legacy])
        if (n === 2) return resolve([])
        if (n === 3) return resolve([{ id: 692 }])
        return resolve([])
      })

      const result = await scenarioService.getById(fastify, 696)

      expect(result).toMatchObject({ pairingScenarioId: 692 })
    })

    it('should return null when not found', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([]))

      const result = await scenarioService.getById(fastify, 999)

      expect(result).toBeNull()
    })
  })

  // ---------- create ----------

  describe('create', () => {
    it('should create scenario with DRAFT status and invalidate list cache', async () => {
      const created = { ...mockScenario, id: 2, division: 'P', worksetId: 9 }
      fastify.db.returning
        .mockResolvedValueOnce([{ id: 9, name: 'New SC', division: 'P' }])
        .mockResolvedValueOnce([{ id: 2 }])
      // getById select chain
      fastify.db.then.mockImplementation((resolve: any) => resolve([created]))

      const result = await scenarioService.create(fastify, { name: 'New SC', division: 'P' } as any, 'admin')

      expect(result).toEqual(created)
      expect(fastify.db.insert).toHaveBeenCalled()
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'scenario:list:*')
    })
  })

  // ---------- update ----------

  describe('update', () => {
    it('should update scenario and invalidate caches', async () => {
      const updated = { ...mockScenario, name: 'Updated SC', division: 'P', worksetId: 1 }
      let n = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        n += 1
        // 1) select worksetId  2) getById join
        if (n === 1) return resolve([{ worksetId: 1 }])
        return resolve([updated])
      })

      const result = await scenarioService.update(fastify, 1, { name: 'Updated SC' } as any, 'admin')

      expect(result).toEqual(updated)
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'scenario:1')
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'scenario:list:*')
    })

    it('persists algorithm parameter drafts through the Scenario update', async () => {
      const updated = { ...mockScenario, name: 'Updated SC', division: 'P', worksetId: 1 }
      let n = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        n += 1
        if (n === 1) return resolve([{ worksetId: 1 }])
        return resolve([updated])
      })
      const ensureDefaults = vi.spyOn(scenarioParameterService, 'ensureDefaults').mockResolvedValue()
      const saveValues = vi.spyOn(scenarioParameterService, 'saveValues').mockResolvedValue()

      await scenarioService.update(fastify, 1, {
        name: 'Updated SC',
        algorithmParameters: [{ code: 'crew_bids', value: { enabled: false } }],
      }, 'admin')

      expect(saveValues).toHaveBeenCalledWith(
        fastify,
        1,
        [{ code: 'crew_bids', value: { enabled: false } }],
        'admin',
      )
      ensureDefaults.mockRestore()
      saveValues.mockRestore()
    })
  })

  // ---------- remove ----------

  describe('remove', () => {
    it('should delete scenario and invalidate caches', async () => {
      let n = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        n += 1
        // 1) select worksetId  2) check other scenarios for workset
        if (n === 1) return resolve([{ worksetId: 99 }])
        return resolve([])
      })

      await scenarioService.remove(fastify, 1)

      expect(fastify.db.delete).toHaveBeenCalled()
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'scenario:1')
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'scenario:list:*')
    })

    it('should delete scenario parameter values with the scenario', async () => {
      let n = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        n += 1
        if (n === 1) return resolve([{ worksetId: 99 }])
        return resolve([])
      })

      await scenarioService.remove(fastify, 1)

      expect(fastify.pgPool.query).toHaveBeenCalledWith(
        'delete from scenario_parameter where scenario_id = $1',
        [1],
      )
    })
  })

  // ---------- transition ----------

  describe('transition', () => {
    it('should allow DRAFT -> RUNNING', async () => {
      const draftScenario = { ...mockScenario, status: 'DRAFT' }
      const runningScenario = { ...mockScenario, status: 'RUNNING', division: 'P' }

      // First await: select current scenario
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([draftScenario]))
      // Second await: getById returns workset-enriched detail
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([runningScenario]))

      const result = await scenarioService.transition(fastify, 1, 'RUNNING', 'admin')

      expect(result).toEqual(runningScenario)
      expect(result!.division).toBe('P')
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'scenario:1')
    })

    it('should allow RUNNING -> DONE', async () => {
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([{ ...mockScenario, status: 'RUNNING' }]))
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([{ ...mockScenario, status: 'DONE', division: 'P' }]))

      const result = await scenarioService.transition(fastify, 1, 'DONE', 'admin')

      expect(result!.status).toBe('DONE')
    })

    it('should allow RUNNING -> FAILED', async () => {
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([{ ...mockScenario, status: 'RUNNING' }]))
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([{ ...mockScenario, status: 'FAILED', division: 'P' }]))

      const result = await scenarioService.transition(fastify, 1, 'FAILED', 'admin')

      expect(result!.status).toBe('FAILED')
    })

    it('should allow FAILED -> DRAFT', async () => {
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([{ ...mockScenario, status: 'FAILED' }]))
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([{ ...mockScenario, status: 'DRAFT', division: 'P' }]))

      const result = await scenarioService.transition(fastify, 1, 'DRAFT', 'admin')

      expect(result!.status).toBe('DRAFT')
    })

    it('should allow PUBLISHED -> PUBLISHED as an idempotent transition', async () => {
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([{ ...mockScenario, status: 'PUBLISHED' }]))
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([{ ...mockScenario, status: 'PUBLISHED', division: 'P' }]))

      const result = await scenarioService.transition(fastify, 1, 'PUBLISHED', 'admin')

      expect(result!.status).toBe('PUBLISHED')
      expect(result!.division).toBe('P')
      expect(fastify.db.update).not.toHaveBeenCalled()
    })

    it('should reject DRAFT -> DONE (invalid transition)', async () => {
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([{ ...mockScenario, status: 'DRAFT' }]))

      await expect(
        scenarioService.transition(fastify, 1, 'DONE', 'admin'),
      ).rejects.toThrow('Invalid status transition: DRAFT -> DONE')
    })

    it('should reject DRAFT -> FAILED (invalid transition)', async () => {
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([{ ...mockScenario, status: 'DRAFT' }]))

      await expect(
        scenarioService.transition(fastify, 1, 'FAILED', 'admin'),
      ).rejects.toThrow('Invalid status transition: DRAFT -> FAILED')
    })

    it('should reject DONE -> RUNNING (terminal state)', async () => {
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([{ ...mockScenario, status: 'DONE' }]))

      await expect(
        scenarioService.transition(fastify, 1, 'RUNNING', 'admin'),
      ).rejects.toThrow('Invalid status transition: DONE -> RUNNING')
    })

    it('should allow DONE -> DRAFT when removing an optimization result', async () => {
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([{ ...mockScenario, status: 'DONE' }]))
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([{ ...mockScenario, status: 'DRAFT', division: 'P' }]))

      const result = await scenarioService.transition(fastify, 1, 'DRAFT', 'admin')

      expect(result!.status).toBe('DRAFT')
      expect(result!.division).toBe('P')
      expect(fastify.pgPool.query).toHaveBeenCalled()
    })

    it('DONE -> DRAFT (remove result) clears scenario_result except notes', async () => {
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([{ ...mockScenario, status: 'DONE' }]))
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([{ ...mockScenario, status: 'DRAFT', division: 'P' }]))

      await scenarioService.transition(fastify, 1, 'DRAFT', 'admin')

      // notes are kept: the delete targets every type EXCEPT notes
      const deleteCall = fastify.pgPool.query.mock.calls.find((c: unknown[]) =>
        String(c[0]).includes('scenario_result') && String(c[0]).includes('<>'))
      expect(deleteCall).toBeTruthy()
      expect(String(deleteCall![0])).toContain("type <> 'notes'")
      expect(deleteCall![1]).toEqual([1])
    })

    it('should throw when scenario not found', async () => {
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([]))

      await expect(
        scenarioService.transition(fastify, 999, 'RUNNING', 'admin'),
      ).rejects.toThrow('Scenario not found')
    })
  })

  // ---------- run ----------

  describe('run', () => {
    const runnableScenario = {
      ...mockScenario,
      fileType: 'RO',
      worksetId: 693,
      rulesetId: 103,
      strDtLoc: new Date('2026-06-01T00:00:00Z'),
      endDtLoc: new Date('2026-06-30T00:00:00Z'),
      filterParams: {
        crew: { division: 'C', bases: ['YOW'], fleets: ['737'] },
        pairing: { bases: ['YOW'], fleets: ['737'] },
      },
    }

    // run() resolves the scenario's roster period (exact date match on rp_start/rp_end)
    // so the bid-package fetch can carry rosterPeriodId + periodCode.
    beforeEach(() => {
      fastify.pgPool.query.mockResolvedValue({ rows: [{ id: '6', pbsPeriodCode: 'Jun 2026' }] })
    })

    it('rejects RO optimization before RUNNING when no crew matches the selected scope', async () => {
      vi.mocked(countScenarioRunScope).mockResolvedValueOnce({ crewCount: 0, pairingCount: 12 })
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([runnableScenario]))
      const transitionSpy = vi.spyOn(scenarioService, 'transition')

      await expect(
        scenarioService.run(fastify, 1, 'token', 'f8', 'http://live-server', 'admin'),
      ).rejects.toThrow(
        'No crew matched the selected scenario scope. Check Crew Filters such as Division, Base, Fleet, and Status before running optimization.',
      )

      expect(countScenarioRunScope).toHaveBeenCalledWith(fastify, expect.objectContaining({ id: 1, fileType: 'RO' }))
      expect(transitionSpy).not.toHaveBeenCalled()
      expect(engineServerClient.startRoTask).not.toHaveBeenCalled()
      transitionSpy.mockRestore()
    })

    it('rejects RO optimization before RUNNING when no pairings match the selected scope', async () => {
      vi.mocked(countScenarioRunScope).mockResolvedValueOnce({ crewCount: 8, pairingCount: 0 })
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([runnableScenario]))
      const transitionSpy = vi.spyOn(scenarioService, 'transition')

      await expect(
        scenarioService.run(fastify, 1, 'token', 'f8', 'http://live-server', 'admin'),
      ).rejects.toThrow(
        'No pairings matched the selected scenario scope. Check Pairing Filters such as Base, Fleet, Division, and date range before running optimization.',
      )

      expect(countScenarioRunScope).toHaveBeenCalledWith(fastify, expect.objectContaining({ id: 1, fileType: 'RO' }))
      expect(transitionSpy).not.toHaveBeenCalled()
      expect(engineServerClient.startRoTask).not.toHaveBeenCalled()
      transitionSpy.mockRestore()
    })

    it('starts RO optimization when crew and pairing scopes both have data', async () => {
      vi.mocked(countScenarioRunScope).mockResolvedValueOnce({ crewCount: 8, pairingCount: 12 })
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([runnableScenario]))
      const transitionSpy = vi.spyOn(scenarioService, 'transition').mockResolvedValueOnce({
        ...runnableScenario,
        status: 'RUNNING',
      } as any)

      const result = await scenarioService.run(fastify, 1, 'token', 'f8', 'http://live-server', 'admin')

      expect(result).toEqual({ taskId: 'task-123' })
      expect(countScenarioRunScope).toHaveBeenCalledWith(fastify, expect.objectContaining({ id: 1, fileType: 'RO' }))
      // The RUNNING transition records the initiating user (from the JWT), not 'system'.
      expect(transitionSpy).toHaveBeenCalledWith(fastify, 1, 'RUNNING', 'admin')
      expect(engineServerClient.startRoTask).toHaveBeenCalledWith({
        scenarioId: 1,
        rosterPeriodId: 6,
        periodCode: 'Jun 2026',
        liveServerUrl: 'http://live-server',
        token: 'token',
        airline: 'f8',
        version: 'v0',
      })
      transitionSpy.mockRestore()
    })

    it('records the initiating user (not system) when engine-server rejects the start', async () => {
      vi.mocked(countScenarioRunScope).mockResolvedValueOnce({ crewCount: 8, pairingCount: 12 })
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([runnableScenario]))
      vi.mocked(engineServerClient.startRoTask).mockRejectedValueOnce(new Error('engine unreachable'))
      const transitionSpy = vi.spyOn(scenarioService, 'transition').mockResolvedValue({
        ...runnableScenario,
        status: 'RUNNING',
      } as any)

      await expect(
        scenarioService.run(fastify, 1, 'token', 'f8', 'http://live-server', 'admin'),
      ).rejects.toThrow('engine unreachable')

      expect(transitionSpy).toHaveBeenCalledWith(fastify, 1, 'RUNNING', 'admin')
      expect(transitionSpy).toHaveBeenCalledWith(fastify, 1, 'FAILED', 'admin')
      transitionSpy.mockRestore()
    })

    it('rejects RO optimization when scenario dates match no roster period', async () => {
      vi.mocked(countScenarioRunScope).mockResolvedValueOnce({ crewCount: 8, pairingCount: 12 })
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([runnableScenario]))
      fastify.pgPool.query.mockResolvedValueOnce({ rows: [] })
      const transitionSpy = vi.spyOn(scenarioService, 'transition')

      await expect(
        scenarioService.run(fastify, 1, 'token', 'f8', 'http://live-server', 'admin'),
      ).rejects.toThrow(
        'Scenario dates must match exactly one configured roster period before running optimization.',
      )

      expect(transitionSpy).not.toHaveBeenCalled()
      expect(engineServerClient.startRoTask).not.toHaveBeenCalled()
      transitionSpy.mockRestore()
    })

    it('rejects RO optimization when scenario dates match multiple roster periods', async () => {
      vi.mocked(countScenarioRunScope).mockResolvedValueOnce({ crewCount: 8, pairingCount: 12 })
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([runnableScenario]))
      fastify.pgPool.query.mockResolvedValueOnce({
        rows: [
          { id: '5', pbsPeriodCode: 'May 2026' },
          { id: '6', pbsPeriodCode: 'Jun 2026' },
        ],
      })
      const transitionSpy = vi.spyOn(scenarioService, 'transition')

      await expect(
        scenarioService.run(fastify, 1, 'token', 'f8', 'http://live-server', 'admin'),
      ).rejects.toThrow(
        'Scenario dates must match exactly one configured roster period before running optimization.',
      )

      expect(transitionSpy).not.toHaveBeenCalled()
      expect(engineServerClient.startRoTask).not.toHaveBeenCalled()
      transitionSpy.mockRestore()
    })
  })

  // ---------- duplicate ----------

  describe('duplicate', () => {
    it('throws when source scenario not found', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([]))
      await expect(scenarioService.duplicate(fastify, 999, 'tester')).rejects.toThrow('Scenario not found')
    })

    it('creates a copy with "Copy of" name and DRAFT status', async () => {
      const source = {
        id: 1,
        name: 'March 2026',
        division: 'P',
        fileType: 'RO',
        status: 'DONE',
        strDtLoc: new Date('2026-03-01'),
        endDtLoc: new Date('2026-03-31'),
        leadinLive: 0,
        cqfsetId: 'CQF01',
        pairingScenarioId: 5,
        flightScenarioId: null,
        rankCross: null,
        filterParams: { crew: { bases: ['YEG'] } },
        comments: 'test',
        isPublic: 0,
        isFavorite: 1,
        worksetId: 10,
        taskId: 'task-abc',
        filePath: '/some/path.gz',
        fileSize: 12345,
        checksum: 'abc123',
        processId: 'P001',
        version: 3,
        optimizedCount: 2,
        action: 'OPTIMIZE',
      }

      const newScenario = { id: 42, name: 'Copy of March 2026', status: 'DRAFT', fileType: 'RO' }
      const createSpy = vi.spyOn(scenarioService, 'create').mockResolvedValueOnce(newScenario as any)

      fastify.db.then.mockImplementation((resolve: any) => resolve([source]))

      const result = await scenarioService.duplicate(fastify, 1, 'tester')

      expect(result.name).toBe('Copy of March 2026')
      expect(result.status).toBe('DRAFT')
      expect(result.id).toBe(42)

      // Core invariant: worksetId must NOT be forwarded — create() will auto-generate one
      const passedPayload = createSpy.mock.calls[0][1]
      expect(passedPayload).not.toHaveProperty('worksetId')
      expect(passedPayload.division).toBe('P')
      expect(passedPayload.name).toBe('Copy of March 2026')

      createSpy.mockRestore()
    })

    it('copies scenario parameter values when duplicating a scenario', async () => {
      const source = {
        id: 1,
        name: 'March 2026',
        fileType: 'RO',
        status: 'DONE',
        strDtLoc: new Date('2026-03-01'),
        endDtLoc: new Date('2026-03-31'),
        leadinLive: 0,
        cqfsetId: 'CQF01',
        pairingScenarioId: null,
        flightScenarioId: null,
        rankCross: null,
        filterParams: {},
        comments: null,
        isPublic: 0,
        isFavorite: 0,
      }
      const created = { id: 42, name: 'Copy of March 2026', status: 'DRAFT', fileType: 'RO' }
      const createSpy = vi.spyOn(scenarioService, 'create').mockResolvedValueOnce(created as any)
      const copySpy = vi.spyOn(scenarioParameterService, 'copyValues').mockResolvedValueOnce(undefined)
      fastify.db.then.mockImplementation((resolve: any) => resolve([source]))

      const result = await scenarioService.duplicate(fastify, 1, 'tester')

      expect(result.id).toBe(42)
      expect(copySpy).toHaveBeenCalledWith(fastify, 1, 42, 'tester')
      createSpy.mockRestore()
      copySpy.mockRestore()
    })

    it('truncates name to 200 chars', async () => {
      const longName = 'A'.repeat(196)  // "Copy of " (8) + 196 = 204 chars — must be sliced to 200
      const source = {
        id: 1,
        name: longName,
        fileType: 'PO',
        status: 'DRAFT',
        strDtLoc: new Date(),
        endDtLoc: new Date(),
        leadinLive: 0,
        cqfsetId: '',
        pairingScenarioId: null,
        flightScenarioId: null,
        rankCross: null,
        filterParams: {},
        comments: null,
        isPublic: 0,
        isFavorite: 0,
        worksetId: 1,
        taskId: null,
        filePath: null,
        fileSize: null,
        checksum: null,
        processId: null,
        version: 0,
        optimizedCount: 0,
        action: null,
      }

      // Spy on create to capture the name actually passed to it by duplicate()
      const createSpy = vi.spyOn(scenarioService, 'create').mockResolvedValueOnce({
        id: 56,
        name: `Copy of ${longName}`.slice(0, 200),
        status: 'DRAFT',
      } as any)

      fastify.db.then.mockImplementation((resolve: any) => resolve([source]))

      await scenarioService.duplicate(fastify, 1, 'tester')

      // Verify the service passed a ≤200-char name to create(), proving truncation happened
      const passedPayload = createSpy.mock.calls[0][1]
      expect(passedPayload.name!.length).toBeLessThanOrEqual(200)
      expect(passedPayload.name).toBe(`Copy of ${longName}`.slice(0, 200))

      createSpy.mockRestore()
    })
  })

  // ---------- Scenario Group ----------

  describe('getGroupByWorksetId', () => {
    it('should return group items ordered by sequence', async () => {
      const items = [{ id: 1, worksetId: 10, sequence: 1 }]
      fastify.db.then.mockImplementation((resolve: any) => resolve(items))

      const result = await scenarioService.getGroupByWorksetId(fastify, 10)

      expect(result).toEqual(items)
    })
  })

  describe('addToGroup', () => {
    it('should insert group entry and invalidate group cache', async () => {
      const created = { id: 2, worksetId: 10, scenarioId: 5 }
      fastify.db.returning.mockResolvedValue([created])

      const result = await scenarioService.addToGroup(fastify, { worksetId: 10, scenarioId: 5 } as any, 'admin')

      expect(result).toEqual(created)
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'scenario:group:10')
    })
  })

  describe('removeFromGroup', () => {
    it('should delete group entry and invalidate group cache', async () => {
      const removed = { id: 2, worksetId: 10 }
      fastify.db.returning.mockResolvedValue([removed])

      const result = await scenarioService.removeFromGroup(fastify, 2)

      expect(result).toEqual(removed)
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'scenario:group:10')
    })
  })
})
