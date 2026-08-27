import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted to properly handle mock hoisting
const { mockPost, mockGet } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockGet: vi.fn(),
}))

vi.mock('@/services/http-client', () => ({
  createHttpClient: vi.fn(() => ({ post: mockPost, get: mockGet })),
}))

// Import after mock is in place
import { ruleApi } from '../rule-api'

describe('ruleApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('batchCheck', () => {
    it('posts to /check/batch with correct body and returns BatchCheckResponse', async () => {
      const mockResponse = {
        items: [{ id: 101, result: { calcResults: [], checkResults: [], passedAll: true, highestSeverity: 0 } }],
        totalDuration: 5,
      }
      mockPost.mockResolvedValueOnce(mockResponse)

      const result = await ruleApi.batchCheck('ccar121_gantt', [
        { pairing: { pairingId: 101, crewBase: 'PEK', duties: [] } },
      ])

      expect(mockPost).toHaveBeenCalledWith('/check/batch', {
        ruleGroupCode: 'ccar121_gantt',
        items: [{ pairing: { pairingId: 101, crewBase: 'PEK', duties: [] } }],
      })
      expect(result.items[0].id).toBe(101)
      expect(result.totalDuration).toBe(5)
    })
  })

  describe('checkRoster', () => {
    it('posts to /check/roster with correct body', async () => {
      const mockResponse = {
        pairingResults: {},
        rosterViolations: [],
        passedAll: true,
        highestSeverity: 0,
      }
      mockPost.mockResolvedValueOnce(mockResponse)

      const input = {
        ruleGroupCode: 'ccar121_gantt',
        crew: {
          crewId: 'C001',
          division: 'P',
          rank: 'FO',
          fleetQuals: ['B737'],
          airportQuals: [],
          recentFlightHours: { last24h: 0, last7d: 0, last28d: 0, last90d: 0, last365d: 0 },
        },
        pairings: [{ pairingId: 200, crewBase: 'SHA', duties: [] }],
        periodStart: '2026-04-01T00:00:00.000Z',
        periodEnd: '2026-04-30T23:59:59.000Z',
      }

      const result = await ruleApi.checkRoster(input)

      expect(mockPost).toHaveBeenCalledWith('/check/roster', input)
      expect(result.passedAll).toBe(true)
      expect(result.rosterViolations).toHaveLength(0)
    })
  })

  describe('getGroups', () => {
    it('calls /rules/groups (new path, not legacy /api/rules/groups)', async () => {
      mockGet.mockResolvedValueOnce([
        { groupCode: 'ccar121_gantt', name: 'CCAR 121 Gantt', usage: 'gantt' },
      ])

      const result = await ruleApi.getGroups()

      expect(mockGet).toHaveBeenCalledWith('/rules/groups')
      expect(result[0].groupCode).toBe('ccar121_gantt')
    })
  })
})
