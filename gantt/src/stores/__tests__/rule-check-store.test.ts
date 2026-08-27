import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks (must be before any imports that trigger the mocked modules) ────────

vi.mock('@/services/rule-api', () => ({
  ruleApi: {
    batchCheck: vi.fn(),
    checkRoster: vi.fn(),
  },
}))

vi.mock('@/utils/roster-to-check-input', () => ({
  buildCheckInputs: vi.fn(),
}))

vi.mock('@/stores/crew-store', () => ({
  useCrewStore: {
    getState: vi.fn(() => ({
      getQuals: vi.fn().mockReturnValue(undefined),
    })),
  },
}))

vi.mock('@/stores/pane-store', () => ({
  usePaneStore: {
    getState: vi.fn(() => ({
      dateRange: {
        start: new Date('2026-04-01T00:00:00Z'),
        end: new Date('2026-04-30T23:59:59Z'),
      },
    })),
  },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { ruleApi } from '@/services/rule-api'
import { buildCheckInputs } from '@/utils/roster-to-check-input'
import { useRuleCheckStore } from '../rule-check-store'
import type { RosterItem } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal RosterItem factory — only fills fields required by logic paths */
const makeItem = (overrides: Partial<RosterItem> & { crewId: string; pairingId: number }): RosterItem => ({
  id: 1,
  ver: 1,
  base: 'PEK',
  label: 'CA1234 PEK-SHA',
  assignmentGroup: 'FLT',
  assignment: 'CA1234',
  role: null,
  subRole: null,
  source: null,
  isRequested: 0,
  isSwapped: 0,
  preference: null,
  comments: null,
  score: null,
  workingHour: null,
  schStrDtUtc: '2026-04-10T02:00:00Z',
  schEndDtUtc: '2026-04-10T04:00:00Z',
  actStrDtUtc: null,
  actEndDtUtc: null,
  fltId: null,
  fltDt: null,
  dutySeq: 1,
  segSeq: 1,
  division: 'P',
  flightActingRank: 'FO',
  rosterActingRank: null,
  activeRank: null,
  position: null,
  schCreditedMinutes: null,
  actCreditedMinutes: null,
  tagSet: null,
  exceptionCode: null,
  ybh: null,
  mbh: null,
  yal: null,
  mal: null,
  ydo: null,
  mdo: null,
  mcred: null,
  ...overrides,
})

/** A check input stub for crew C001, pairing 101 */
const makeCheckInputC001 = (ruleGroupCode: string) => ({
  ruleGroupCode,
  pairing: { pairingId: 101, crewBase: 'PEK', duties: [] },
  crew: {
    crewId: 'C001',
    division: 'P',
    rank: 'FO',
    fleetQuals: [],
    airportQuals: [],
    recentFlightHours: { last24h: 0, last7d: 0, last28d: 0, last90d: 0, last365d: 0 },
  },
})

/** A check input stub for crew C002, pairing 202 */
const makeCheckInputC002 = (ruleGroupCode: string) => ({
  ruleGroupCode,
  pairing: { pairingId: 202, crewBase: 'SHA', duties: [] },
  crew: {
    crewId: 'C002',
    division: 'P',
    rank: 'CA',
    fleetQuals: [],
    airportQuals: [],
    recentFlightHours: { last24h: 0, last7d: 0, last28d: 0, last90d: 0, last365d: 0 },
  },
})

/** A non-passing CheckResult (violation) */
const makeViolationResult = (ruleCode = 'MAX_FDP') => ({
  ruleCode,
  ruleName: '最大飞行职责期',
  passed: false,
  severity: 3,
  actualValue: 14,
  limitValue: 12,
  unit: 'h',
  message: '飞行职责期超限',
  overridable: false,
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useRuleCheckStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset Zustand singleton state between tests
    useRuleCheckStore.getState().clearViolations()
  })

  // ── Test 1: pairingId-based mapping (not index-based) ─────────────────────

  describe('checkCrews — batch response pairingId-based mapping', () => {
    it('maps violations to the correct pairingId, not by array index', async () => {
      const items: RosterItem[] = [
        makeItem({ crewId: 'C001', pairingId: 101 }),
        makeItem({ id: 2, crewId: 'C002', pairingId: 202 }),
      ]

      // buildCheckInputs is called once per crewId inside runChecks
      vi.mocked(buildCheckInputs).mockImplementation((crewId, _items, ruleGroupCode) => {
        if (crewId === 'C001') return [makeCheckInputC001(ruleGroupCode)]
        if (crewId === 'C002') return [makeCheckInputC002(ruleGroupCode)]
        return []
      })

      // batchCheck returns items in DIFFERENT order than request:
      // - pairing 202 (clean) returned FIRST
      // - pairing 101 (violation) returned SECOND
      // This proves the code uses item.id (pairingId) for mapping, not array index
      vi.mocked(ruleApi.batchCheck).mockResolvedValue({
        totalDuration: 10,
        items: [
          {
            id: 202,
            result: {
              calcResults: [],
              checkResults: [],
              passedAll: true,
              highestSeverity: 0,
            },
          },
          {
            id: 101,
            result: {
              calcResults: [],
              checkResults: [makeViolationResult()],
              passedAll: false,
              highestSeverity: 3,
            },
          },
        ],
      })

      // checkRoster is fire-and-forget; resolve immediately so it doesn't bleed
      vi.mocked(ruleApi.checkRoster).mockResolvedValue({
        pairingResults: {},
        rosterViolations: [],
        passedAll: true,
        highestSeverity: 0,
      })

      const { checkCrews, hasViolations } = useRuleCheckStore.getState()
      await checkCrews(['C001', 'C002'], items)

      // pairing 101 (C001) should have a violation
      expect(hasViolations('pairing', 101)).toBe(true)
      // pairing 202 (C002) should be clean
      expect(hasViolations('pairing', 202)).toBe(false)
    })
  })

  // ── Test 2: checkRosterViolations merges roster violations ────────────────

  describe('checkRosterViolations', () => {
    it('merges rosterViolations into the store with source="roster"', async () => {
      const items: RosterItem[] = [makeItem({ crewId: 'C001', pairingId: 101 })]

      vi.mocked(buildCheckInputs).mockImplementation((_crewId, _items, ruleGroupCode) =>
        [makeCheckInputC001(ruleGroupCode)],
      )

      vi.mocked(ruleApi.checkRoster).mockResolvedValue({
        pairingResults: {},
        rosterViolations: [makeViolationResult('MIN_REST')],
        passedAll: false,
        highestSeverity: 3,
      })

      const { checkRosterViolations, getViolations } = useRuleCheckStore.getState()
      await checkRosterViolations('C001', items)

      // crewId 'C001' used directly as targetId → key 'crew:C001'
      const violations = getViolations('crew', 'C001')
      expect(violations).toHaveLength(1)
      expect(violations[0].source).toBe('roster')
      expect(violations[0].ruleCode).toBe('MIN_REST')
    })
  })

  // ── Test 3: checkRosterViolations does not throw on failure ───────────────

  describe('checkRosterViolations — error resilience', () => {
    it('does not throw when ruleApi.checkRoster rejects', async () => {
      const items: RosterItem[] = [makeItem({ crewId: 'C001', pairingId: 101 })]

      vi.mocked(buildCheckInputs).mockImplementation((_crewId, _items, ruleGroupCode) =>
        [makeCheckInputC001(ruleGroupCode)],
      )

      vi.mocked(ruleApi.checkRoster).mockRejectedValue(new Error('network error'))

      const { checkRosterViolations } = useRuleCheckStore.getState()

      // Must resolve (not reject) — failure is swallowed with a console.warn
      await expect(checkRosterViolations('C001', items)).resolves.toBeUndefined()
    })
  })

  // ── Test 4: checkRosterViolations does nothing when no pairings ──────────

  it('does nothing when buildCheckInputs returns empty (no flight pairings)', async () => {
    // Make buildCheckInputs return empty array — simulates crew with no flight pairings
    vi.mocked(buildCheckInputs).mockReturnValueOnce([])

    await useRuleCheckStore.getState().checkRosterViolations('C001', [])

    expect(ruleApi.checkRoster).not.toHaveBeenCalled()
  })
})
