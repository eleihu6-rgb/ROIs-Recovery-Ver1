import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks (must precede imports that pull the mocked modules) ─────────────────
// Only rule-api (the engine HTTP call) and crew-store (quals cache) are mocked.
// buildCheckInputs + runRuleBatch + the violation store run for real, so this
// exercises the genuine build → batchCheck → parse → store path.

vi.mock('@/services/rule-api', () => ({
  ruleApi: {
    batchCheck: vi.fn(),
    checkRoster: vi.fn(),
  },
}))

vi.mock('@/stores/crew-store', () => ({
  useCrewStore: {
    getState: vi.fn(() => ({
      getQuals: vi.fn().mockReturnValue(undefined),
    })),
  },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { ruleApi } from '@/services/rule-api'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import {
  getScenarioViolationStore,
  destroyScenarioViolationStore,
} from '@/stores/scenario-violation-store'
import { useScenarioViolationSource } from '../scenario-violation-source'
import type { RosterItem } from '@/types'
import type { RuleViolation } from '@/types/rule-check'
import type { BatchCheckResponse } from '@/types/rule-check'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal flight RosterItem for crew C001 / pairing 101 (one FLT segment). */
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

/** A batch response with one hard (non-overridable) violation on pairing 101. */
const batchWithViolation = (pairingId: number): BatchCheckResponse => ({
  totalDuration: 1,
  items: [
    {
      id: pairingId,
      result: {
        calcResults: [],
        passedAll: false,
        highestSeverity: 3,
        checkResults: [
          {
            ruleCode: 'MAX_FDP',
            ruleName: '最大飞行职责期',
            passed: false,
            severity: 3,
            actualValue: 14,
            limitValue: 12,
            unit: 'h',
            message: '飞行职责期超限',
            overridable: false,
          },
        ],
      },
    },
  ],
})

/** Mount a probe that reads the source within a real React render. */
const mountProbe = (render: (src: ReturnType<typeof useScenarioViolationSource>) => void, scenarioId: number) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const Probe = () => {
    const src = useScenarioViolationSource(scenarioId)
    render(src)
    return null
  }
  act(() => {
    createRoot(container).render(React.createElement(Probe))
  })
  return () => document.body.removeChild(container)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useScenarioViolationSource', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useRuleCheckStore.setState({ ruleGroupCode: 'STD_GROUP' })
  })

  it('runPreCheck calls batchCheck with active ruleGroupCode + built inputs, writes violations, returns a PreCheckResult', async () => {
    const id = 991001
    destroyScenarioViolationStore(id)
    vi.mocked(ruleApi.batchCheck).mockResolvedValue(batchWithViolation(101))

    const items: RosterItem[] = [makeItem({ crewId: 'C001', pairingId: 101 })]

    let runPreCheck: ReturnType<typeof useScenarioViolationSource>['runPreCheck'] | null = null
    const cleanup = mountProbe((src) => { runPreCheck = src.runPreCheck }, id)

    let result: Awaited<ReturnType<NonNullable<typeof runPreCheck>>> | null = null
    await act(async () => {
      result = await runPreCheck!(['C001'], items)
    })

    // batchCheck was called with the active rule group from the Live store.
    expect(ruleApi.batchCheck).toHaveBeenCalledTimes(1)
    const [groupArg, itemsArg] = vi.mocked(ruleApi.batchCheck).mock.calls[0]
    expect(groupArg).toBe('STD_GROUP')
    expect(itemsArg).toHaveLength(1)
    expect(itemsArg[0].pairing.pairingId).toBe(101)

    // PreCheckResult: hard violation → blocking → not allowed.
    expect(result!.hasBlocking).toBe(true)
    expect(result!.allowed).toBe(false)
    expect(result!.violations.some((v) => v.ruleCode === 'MAX_FDP')).toBe(true)

    // Store was written: pairing + crew keyed entries both present.
    const store = getScenarioViolationStore(id).getState()
    expect(store.getViolations('pairing', '101').some((v) => v.ruleCode === 'MAX_FDP')).toBe(true)
    expect(store.getViolations('crew', 'C001').some((v) => v.ruleCode === 'MAX_FDP')).toBe(true)

    cleanup()
  })

  it('useViolations returns the violations for a key after runPreCheck, and a stable EMPTY array when none', async () => {
    const id = 991002
    destroyScenarioViolationStore(id)
    vi.mocked(ruleApi.batchCheck).mockResolvedValue(batchWithViolation(101))

    const items: RosterItem[] = [makeItem({ crewId: 'C001', pairingId: 101 })]

    // First render: capture both the subscribed violations and runPreCheck.
    let pairingViolations: RuleViolation[] = []
    let emptyA: RuleViolation[] = []
    let emptyB: RuleViolation[] = []
    let runPreCheck: ReturnType<typeof useScenarioViolationSource>['runPreCheck'] | null = null

    const cleanup = mountProbe((src) => {
      pairingViolations = src.useViolations('pairing', '101')
      emptyA = src.useViolations('pairing', '999')
      emptyB = src.useViolations('crew', 'NOBODY')
      runPreCheck = src.runPreCheck
    }, id)

    // No violations yet → empty, and the same stable reference for distinct empty keys.
    expect(pairingViolations).toEqual([])
    expect(emptyA).toBe(emptyB)

    await act(async () => {
      await runPreCheck!(['C001'], items)
    })

    // After the pre-check, the subscribed hook re-rendered with the new violations.
    expect(pairingViolations.some((v) => v.ruleCode === 'MAX_FDP')).toBe(true)
    // The still-empty keys keep returning the stable EMPTY reference.
    expect(emptyA).toBe(emptyB)

    cleanup()
  })
})
