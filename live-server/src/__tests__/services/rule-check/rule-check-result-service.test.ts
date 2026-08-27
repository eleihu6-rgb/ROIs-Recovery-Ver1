import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ruleCheckResultService } from '../../../services/rule-check/rule-check-result-service.js'

const mockPool = { query: vi.fn() }
const mockFastify = { pgPool: mockPool } as any

describe('ruleCheckResultService', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('upsertPairingResult', () => {
    it('executes INSERT ... ON CONFLICT DO UPDATE', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] })
      await ruleCheckResultService.upsertPairingResult(mockFastify, {
        crewId: 'CA001',
        pairingId: 1,
        rulesetId: 103,
        passedAll: false,
        highestSeverity: 3,
        checkResults: [{ ruleCode: 'max_fdp', passed: false, severity: 3 }],
        calcResults: { fdp_calculator: { value: 840, unit: 'minutes' } },
      })
      const sql = mockPool.query.mock.calls[0][0] as string
      expect(sql).toContain('ON CONFLICT')
      expect(sql).toContain('rule_check_result_pairing')
      expect(sql).toContain('ruleset_id')
      expect(sql).not.toContain('rule_group_code')
    })

    it('passes correct parameter values', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] })
      await ruleCheckResultService.upsertPairingResult(mockFastify, {
        crewId: 'CA001',
        pairingId: 42,
        rulesetId: 103,
        passedAll: true,
        highestSeverity: 0,
        checkResults: [],
        calcResults: {},
      })
      const params = mockPool.query.mock.calls[0][1] as unknown[]
      expect(params[0]).toBe('CA001')
      expect(params[1]).toBe(42)
      expect(params[2]).toBe(103)
      expect(params[3]).toBe(true)
      expect(params[4]).toBe(0)
    })
  })

  describe('bulkUpsertPairingResults', () => {
    it('splits large arrays into chunks of 200', async () => {
      const rows = Array.from({ length: 250 }, (_, i) => ({
        crewId: `CA${String(i + 1).padStart(3, '0')}`,
        pairingId: i + 1,
        rulesetId: 103,
        passedAll: true,
        highestSeverity: 0,
        checkResults: [],
        calcResults: {},
      }))
      mockPool.query.mockResolvedValue({ rows: [] })
      await ruleCheckResultService.bulkUpsertPairingResults(mockFastify, rows)
      expect(mockPool.query).toHaveBeenCalledTimes(2)
    })

    it('handles empty array without querying', async () => {
      await ruleCheckResultService.bulkUpsertPairingResults(mockFastify, [])
      expect(mockPool.query).not.toHaveBeenCalled()
    })

    it('includes ON CONFLICT in SQL', async () => {
      mockPool.query.mockResolvedValue({ rows: [] })
      await ruleCheckResultService.bulkUpsertPairingResults(mockFastify, [
        {
          crewId: 'CA001',
          pairingId: 1,
          rulesetId: 103,
          passedAll: true,
          highestSeverity: 0,
          checkResults: [],
          calcResults: {},
        },
      ])
      const sql = mockPool.query.mock.calls[0][0] as string
      expect(sql).toContain('ON CONFLICT')
      expect(sql).toContain('rule_check_result_pairing')
    })
  })

  describe('upsertRosterResult', () => {
    it('executes INSERT ... ON CONFLICT DO UPDATE with roster result', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] })
      const rosterResult = {
        pairingResults: new Map(),
        rosterViolations: [],
        passedAll: true,
        highestSeverity: 0,
      }
      await ruleCheckResultService.upsertRosterResult(
        mockFastify,
        'CA001',
        103,
        '2026-05',
        rosterResult,
      )
      const sql = mockPool.query.mock.calls[0][0] as string
      expect(sql).toContain('ON CONFLICT')
      expect(sql).toContain('rule_check_result_roster')
      expect(sql).toContain('ruleset_id')
      expect(sql).not.toContain('rule_group_code')
    })

    it('passes correct parameter values', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] })
      const rosterResult = {
        pairingResults: new Map(),
        rosterViolations: [{ ruleCode: 'max_consecutive_days', passed: false, severity: 2, actualValue: 8, limitValue: 7, unit: 'days', message: 'Exceeded', ruleName: 'Max Consecutive Days' }],
        passedAll: false,
        highestSeverity: 2,
      }
      await ruleCheckResultService.upsertRosterResult(
        mockFastify,
        'CA001',
        103,
        '2026-05',
        rosterResult,
      )
      const params = mockPool.query.mock.calls[0][1] as unknown[]
      expect(params[0]).toBe('CA001')
      expect(params[1]).toBe(103)
      expect(params[2]).toBe('2026-05')
      expect(params[3]).toBe(false)
      expect(params[4]).toBe(2)
    })
  })

  describe('queryPairingResults', () => {
    it('returns results keyed by pairingId', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            crew_id: 'CA001',
            pairing_id: 42,
            ruleset_id: 103,
            passed_all: false,
            highest_severity: 3,
            check_results: [],
            calc_results: {},
            checked_at: new Date('2026-05-10T08:00:00Z'),
            created_by: 'system',
            created_at: new Date('2026-05-10T08:00:00Z'),
            updated_by: 'system',
            updated_at: new Date('2026-05-10T08:00:00Z'),
          },
        ],
      })
      const result = await ruleCheckResultService.queryPairingResults(
        mockFastify,
        ['CA001'],
        103,
        '2026-05-01',
        '2026-05-31',
      )
      expect(result.byPairing['42']).toBeDefined()
      expect(result.byPairing['42'].crew_id).toBe('CA001')
      expect(result.missing).toEqual([])
    })

    it('returns empty map when no results found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] })
      const result = await ruleCheckResultService.queryPairingResults(
        mockFastify,
        ['NONEXIST'],
        103,
        '2026-01-01',
        '2026-01-31',
      )
      expect(result.byPairing).toEqual({})
      expect(result.missing).toEqual([])
    })
  })

  describe('queryRosterResults', () => {
    it('returns roster result rows', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            crew_id: 'CA001',
            ruleset_id: 103,
            result_month: '2026-05',
            passed_all: true,
            highest_severity: 0,
            violations: [],
            calc_summary: {},
            checked_at: new Date('2026-05-10T08:00:00Z'),
            created_by: 'system',
            created_at: new Date('2026-05-10T08:00:00Z'),
            updated_by: 'system',
            updated_at: new Date('2026-05-10T08:00:00Z'),
          },
        ],
      })
      const result = await ruleCheckResultService.queryRosterResults(
        mockFastify,
        ['CA001'],
        103,
        ['2026-05'],
      )
      expect(result).toHaveLength(1)
      expect(result[0].crew_id).toBe('CA001')
      expect(result[0].result_month).toBe('2026-05')
    })

    it('returns empty array when no results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] })
      const result = await ruleCheckResultService.queryRosterResults(
        mockFastify,
        ['NONEXIST'],
        103,
        ['2026-05'],
      )
      expect(result).toEqual([])
    })
  })

  describe('incrementBatchProgress', () => {
    it('updates processed_crew and processed_pairings', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] })
      await ruleCheckResultService.incrementBatchProgress(mockFastify, 1, 5)
      const sql = mockPool.query.mock.calls[0][0] as string
      expect(sql).toContain('processed_crew = processed_crew + 1')
      expect(sql).toContain('processed_pairings = processed_pairings + $2')
      expect(sql).toContain('rule_check_batch_run')
    })

    it('passes correct parameter values', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] })
      await ruleCheckResultService.incrementBatchProgress(mockFastify, 42, 10)
      const params = mockPool.query.mock.calls[0][1] as unknown[]
      expect(params[0]).toBe(42)
      expect(params[1]).toBe(10)
    })
  })
})
