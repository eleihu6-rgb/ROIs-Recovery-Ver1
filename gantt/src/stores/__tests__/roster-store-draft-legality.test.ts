import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DraftLegalityPreviewResponse } from '@/services/legality-preview-api'
import type { RuleViolation } from '@/types/rule-check'
import type { RosterItem } from '@/types/roster'

const mocks = vi.hoisted(() => ({
  checkDraft: vi.fn(),
  toRuleViolations: vi.fn(),
  showConfirmDialog: vi.fn(),
  notifyError: vi.fn(),
  setSessionViolations: vi.fn(),
  setChecking: vi.fn(),
}))

vi.mock('@/services/roster-api', () => ({
  rosterApi: {
    getView: vi.fn(),
    createGroundTask: vi.fn(),
    create: vi.fn(),
    move: vi.fn(),
    swap: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    removeByPairingAndCrew: vi.fn(),
    assignPairing: vi.fn(),
  },
}))

vi.mock('@/services/legality-preview-api', () => ({
  legalityPreviewApi: {
    checkDraft: mocks.checkDraft,
    toRuleViolations: mocks.toRuleViolations,
  },
}))

vi.mock('@/stores/rule-check-store', () => ({
  useRuleCheckStore: {
    getState: () => ({
      preCheck: vi.fn().mockResolvedValue({ violations: [], hasBlocking: false }),
      showConfirmDialog: mocks.showConfirmDialog,
      setChecking: mocks.setChecking,
      confirmDialog: { open: false },
    }),
  },
}))

vi.mock('@/stores/session-violation-store', () => ({
  useSessionViolationStore: {
    getState: () => ({
      setSessionViolations: mocks.setSessionViolations,
    }),
  },
}))

vi.mock('@/stores/lock-store', () => ({
  useLockStore: {
    getState: () => ({
      acquireLock: vi.fn().mockResolvedValue(true),
      acquireLocks: vi.fn().mockResolvedValue(true),
      releaseAllLocks: vi.fn().mockResolvedValue(undefined),
      releaseCrewLock: vi.fn().mockResolvedValue(undefined),
      myLockKeys: new Set(),
      currentUser: 'test',
    }),
  },
}))

vi.mock('@/stores/gantt-view-store', () => ({
  useGanttViewStore: { getState: () => ({ markDirty: vi.fn() }) },
}))

vi.mock('@/utils/notify', () => ({
  notify: {
    error: mocks.notifyError,
  },
}))

import {
  checkLiveDraftLegality,
  expandAffectedWithPairingMates,
  expandAffectedWithFlightMates,
  expandRelatedWithNeighborFlyPairings,
} from '@/stores/roster-store'
import { useDraftStore } from '@/stores/draft-store'
import { useRosterStore } from '@/stores/roster-store'

type PreviewViolation = DraftLegalityPreviewResponse['violations'][number]

const rosterItem = (overrides: Partial<RosterItem> = {}): RosterItem => ({
  id: 1,
  crewId: '911',
  pairingId: 100,
  ver: 1,
  base: 'YYZ',
  label: 'F100',
  assignmentGroup: 'FLY',
  assignment: 'F100',
  role: null,
  subRole: null,
  source: null,
  isRequested: 0,
  isSwapped: 0,
  preference: null,
  comments: null,
  score: null,
  workingHour: null,
  schStrDtUtc: '2026-07-02T12:00:00Z',
  schEndDtUtc: '2026-07-02T14:00:00Z',
  actStrDtUtc: null,
  actEndDtUtc: null,
  fltId: 10,
  fltDt: '2026-07-02',
  dutySeq: 1,
  segSeq: 1,
  division: 'P',
  flightActingRank: 'CA',
  rosterActingRank: null,
  activeRank: null,
  position: null,
  schCreditedMinutes: null,
  actCreditedMinutes: null,
  tagSet: null,
  exceptionCode: null,
  dutyActCreditedMinutes: '120',
  ybh: null,
  mbh: null,
  yal: null,
  mal: null,
  ydo: null,
  mdo: null,
  mcred: null,
  ...overrides,
})

const previewViolation = (overrides: Partial<PreviewViolation> = {}): PreviewViolation => ({
  crewId: '911',
  pairingId: 100,
  dutySeq: 1,
  ruleCode: '8002',
  ruleInstance: 'default',
  scopeKey: 'scope-100',
  severity: 1,
  startDt: '2026-07-02T12:00:00Z',
  endDt: '2026-07-02T14:00:00Z',
  message: 'New related violation',
  ...overrides,
})

const ruleViolation = (v: PreviewViolation): RuleViolation => ({
  ruleCode: v.ruleCode,
  ruleName: v.ruleInstance,
  severity: v.severity,
  canOverride: v.severity < 2,
  message: v.message,
  targetId: v.pairingId ?? v.crewId,
  targetType: v.pairingId == null ? 'crew' : 'pairing',
  crewId: v.crewId,
  anchorPairingId: v.pairingId,
  windowStartDt: v.startDt,
  windowEndDt: v.endDt,
  isNew: true,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.checkDraft.mockReset()
  mocks.toRuleViolations.mockImplementation((violations: PreviewViolation[]) => violations.map(ruleViolation))
  mocks.showConfirmDialog.mockResolvedValue(true)
  mocks.setChecking.mockReset()
  useDraftStore.setState({ active: true, operations: [], redoStack: [], saving: false })
  useRosterStore.setState({
    main: {
      crewList: [],
      baseItems: [rosterItem()],
      rosterItems: [rosterItem()],
      sortField: 'crewId',
      sortDirection: 'asc',
      loading: false,
    },
    sub: {
      crewList: [],
      baseItems: [],
      rosterItems: [],
      sortField: 'crewId',
      sortDirection: 'asc',
      loading: false,
    },
  })
})

describe('expandAffectedWithPairingMates', () => {
  it('adds simulated crews already on the related pairing', () => {
    expect(
      expandAffectedWithPairingMates(
        ['B'],
        [
          rosterItem({ crewId: 'A', pairingId: 100 }),
          rosterItem({ crewId: 'B', pairingId: 100 }),
          rosterItem({ crewId: 'C', pairingId: 200 }),
        ],
        [100],
      ).sort(),
    ).toEqual(['A', 'B'])
  })
})

describe('expandAffectedWithFlightMates', () => {
  it('adds simulated crews sharing the same fltId across pairings', () => {
    expect(
      expandAffectedWithFlightMates(
        ['B'],
        [
          rosterItem({ crewId: 'A', pairingId: 100, fltId: 500 }),
          rosterItem({ crewId: 'B', pairingId: 200, fltId: 500 }),
          rosterItem({ crewId: 'C', pairingId: 300, fltId: 999 }),
        ],
      ).sort(),
    ).toEqual(['A', 'B'])
  })

  it('with focusPairingIds, seeds only fltIds on those pairings (not mates\' other duties)', () => {
    expect(
      expandAffectedWithFlightMates(
        ['B', 'A'], // A already a pairing-mate of the focus pairing
        [
          // Focus pairing 200: B assigning onto shared flight 500 with A
          rosterItem({ crewId: 'A', pairingId: 200, fltId: 500 }),
          rosterItem({ crewId: 'B', pairingId: 200, fltId: 500 }),
          // Mate A also flies unrelated flight 999 on another pairing — must NOT pull C
          rosterItem({ crewId: 'A', pairingId: 300, fltId: 999 }),
          rosterItem({ crewId: 'C', pairingId: 400, fltId: 999 }),
        ],
        [200],
      ).sort(),
    ).toEqual(['A', 'B'])
  })

  it('with focusPairingIds, still expands cross-pairing crews sharing the focus fltId', () => {
    expect(
      expandAffectedWithFlightMates(
        ['B'],
        [
          rosterItem({ crewId: 'A', pairingId: 100, fltId: 500 }),
          rosterItem({ crewId: 'B', pairingId: 200, fltId: 500 }),
          rosterItem({ crewId: 'C', pairingId: 300, fltId: 999 }),
        ],
        [200],
      ).sort(),
    ).toEqual(['A', 'B'])
  })

  it('without focusPairingIds, keeps legacy seed from all flts of expanded crews', () => {
    expect(
      expandAffectedWithFlightMates(
        ['A', 'B'],
        [
          rosterItem({ crewId: 'A', pairingId: 200, fltId: 500 }),
          rosterItem({ crewId: 'B', pairingId: 200, fltId: 500 }),
          rosterItem({ crewId: 'A', pairingId: 300, fltId: 999 }),
          rosterItem({ crewId: 'C', pairingId: 400, fltId: 999 }),
        ],
      ).sort(),
    ).toEqual(['A', 'B', 'C'])
  })
})

describe('expandRelatedWithNeighborFlyPairings', () => {
  const fly = (
    crewId: string,
    pairingId: number,
    start: string,
    end: string,
  ): RosterItem =>
    rosterItem({
      id: pairingId,
      crewId,
      pairingId,
      assignmentGroup: 'FLY',
      schStrDtUtc: start,
      schEndDtUtc: end,
    })

  it('adds previous and next FLY pairings for the same crew (15152/15279 shape)', () => {
    const items = [
      fly('1318', 15152, '2026-08-03T12:45:00.000Z', '2026-08-03T18:05:00.000Z'),
      fly('1318', 15279, '2026-08-05T12:45:00.000Z', '2026-08-05T18:05:00.000Z'),
      fly('1318', 16000, '2026-08-10T12:00:00.000Z', '2026-08-10T18:00:00.000Z'),
    ]
    const expanded = expandRelatedWithNeighborFlyPairings([15279], items)
    expect([...expanded].sort((a, b) => a - b)).toEqual([15152, 15279, 16000])
  })

  it('does not add non-FLY pairings as neighbors', () => {
    const items = [
      rosterItem({
        id: 1,
        crewId: '1318',
        pairingId: 100,
        assignmentGroup: 'DO',
        schStrDtUtc: '2026-08-01T00:00:00.000Z',
        schEndDtUtc: '2026-08-02T00:00:00.000Z',
      }),
      fly('1318', 15279, '2026-08-05T12:45:00.000Z', '2026-08-05T18:05:00.000Z'),
    ]
    const expanded = expandRelatedWithNeighborFlyPairings([15279], items)
    expect([...expanded]).toEqual([15279])
  })

  it('keeps seed ids and ignores other crews', () => {
    const items = [
      fly('9999', 15152, '2026-08-03T12:45:00.000Z', '2026-08-03T18:05:00.000Z'),
      fly('1318', 15279, '2026-08-05T12:45:00.000Z', '2026-08-05T18:05:00.000Z'),
    ]
    const expanded = expandRelatedWithNeighborFlyPairings([15279], items)
    expect([...expanded]).toEqual([15279])
  })
})

describe('checkLiveDraftLegality', () => {
  it('passes pairing-mate crew ids into draft legality preview', async () => {
    mocks.checkDraft.mockResolvedValue({ allowed: true, violations: [] })

    await checkLiveDraftLegality(
      ['B'],
      [rosterItem({ crewId: 'A', pairingId: 100 })],
      [
        rosterItem({ crewId: 'A', pairingId: 100 }),
        rosterItem({ id: 2, crewId: 'B', pairingId: 100 }),
      ],
      { relatedPairingIds: [100], relatedItems: [rosterItem({ id: 2, crewId: 'B', pairingId: 100 })] },
    )

    // Fast path: legal preview (no violations) sends a single after-state check.
    expect(mocks.checkDraft).toHaveBeenCalledTimes(1)
    expect(mocks.checkDraft.mock.calls.map((call) => call[0].focusPairingIds)).toEqual([[100]])
    const afterCall = mocks.checkDraft.mock.calls[0]
    expect(afterCall[0].affectedCrewIds.sort()).toEqual(['A', 'B'])
    expect(afterCall[0].afterItems.map((item: RosterItem) => item.crewId).sort()).toEqual(['A', 'B'])
    expect(afterCall[0].contextType).toBe('live')
  })

  it('fast-path: legal drop issues only the after-state check, no before baseline', async () => {
    mocks.checkDraft.mockReset()
    mocks.checkDraft.mockResolvedValue({ allowed: true, violations: [] })
    const items = [rosterItem({ id: -1, crewId: '911', pairingId: 100 })]

    const allowed = await checkLiveDraftLegality(['911'], items, items)

    expect(allowed).toBe(true)
    expect(mocks.checkDraft).toHaveBeenCalledTimes(1)
    expect(mocks.checkDraft.mock.calls[0][0].afterItems).toEqual(items)
  })

  it('forwards scenario contextType and scenarioId to draft preview', async () => {
    mocks.checkDraft.mockResolvedValue({ allowed: true, violations: [] })

    await checkLiveDraftLegality(
      ['911'],
      [],
      [rosterItem()],
      { contextType: 'scenario', scenarioId: 698, relatedPairingIds: [100] },
    )

    expect(mocks.checkDraft).toHaveBeenCalledTimes(1)
    expect(mocks.checkDraft.mock.calls[0][0]).toMatchObject({
      contextType: 'scenario',
      scenarioId: 698,
    })
  })

  it('shows only new violations related to the current pairing operation', async () => {
    const historical = previewViolation({
      pairingId: 999,
      dutySeq: 9,
      scopeKey: 'scope-999',
      startDt: '2026-07-20T12:00:00Z',
      endDt: '2026-07-20T14:00:00Z',
      message: 'Historical unrelated violation',
    })
    const current = previewViolation({ pairingId: 100, message: 'Current operation violation' })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [historical, current] })
      .mockResolvedValueOnce({ allowed: true, violations: [historical] })

    const allowed = await checkLiveDraftLegality(
      ['911'],
      [rosterItem()],
      [rosterItem({ crewId: '912' })],
      { relatedItems: [rosterItem()], relatedPairingIds: [100] },
    )

    expect(allowed).toBe(true)
    // Focus pairing 100 is already on before roster → need before baseline to diff.
    expect(mocks.checkDraft).toHaveBeenCalledTimes(2)
    expect(mocks.toRuleViolations).toHaveBeenCalledWith([current])
    expect(mocks.showConfirmDialog).toHaveBeenCalledWith([ruleViolation(current)], false)
  })

  it('skips before-state preview when focus pairing is absent from before roster (fresh assign)', async () => {
    const current = previewViolation({ pairingId: 135599, message: '8030 on new assign' })
    mocks.checkDraft.mockResolvedValueOnce({ allowed: true, violations: [current] })

    const allowed = await checkLiveDraftLegality(
      ['386'],
      [rosterItem({ crewId: '386', pairingId: 961 })],
      [
        rosterItem({ crewId: '386', pairingId: 961 }),
        rosterItem({ id: -1, crewId: '386', pairingId: 135599 }),
      ],
      {
        contextType: 'scenario',
        scenarioId: 743,
        relatedPairingIds: [135599],
        relatedItems: [rosterItem({ id: -1, crewId: '386', pairingId: 135599 })],
      },
    )

    expect(allowed).toBe(true)
    expect(mocks.checkDraft).toHaveBeenCalledTimes(1)
    expect(mocks.toRuleViolations).toHaveBeenCalledWith([current])
    expect(mocks.showConfirmDialog).toHaveBeenCalledWith([ruleViolation(current)], false)
  })

  it('does not surface 8071 RP hits for other pairings when assigning a focus pairing', async () => {
    // 8071 Unit=RP windows span the whole RP — time-overlap must not pull them into the dialog.
    const unrelated8071 = previewViolation({
      ruleCode: '8071',
      pairingId: 136109,
      scopeKey: '1RP:DOMO',
      startDt: '2026-09-01T00:00:00Z',
      endDt: '2026-09-30T00:00:00Z',
      message: 'DOMO dest count',
    })
    const focus8030 = previewViolation({
      ruleCode: '8030',
      pairingId: 135599,
      message: 'age on assign',
    })
    mocks.checkDraft.mockResolvedValueOnce({
      allowed: true,
      violations: [unrelated8071, focus8030],
    })

    const allowed = await checkLiveDraftLegality(
      ['386'],
      [rosterItem({ crewId: '386', pairingId: 961 })],
      [
        rosterItem({ crewId: '386', pairingId: 961 }),
        rosterItem({
          id: -1,
          crewId: '386',
          pairingId: 135599,
          schStrDtUtc: '2026-09-07T13:40:00.000Z',
          schEndDtUtc: '2026-09-07T18:50:00.000Z',
        }),
      ],
      {
        relatedPairingIds: [135599],
        relatedItems: [
          rosterItem({
            id: -1,
            crewId: '386',
            pairingId: 135599,
            schStrDtUtc: '2026-09-07T13:40:00.000Z',
            schEndDtUtc: '2026-09-07T18:50:00.000Z',
          }),
        ],
      },
    )

    expect(allowed).toBe(true)
    expect(mocks.toRuleViolations).toHaveBeenCalledWith([focus8030])
    expect(mocks.showConfirmDialog).toHaveBeenCalledWith([ruleViolation(focus8030)], false)
  })

  it('does not show a dialog for historical violations that are unrelated to the operation', async () => {
    const historical = previewViolation({
      pairingId: 999,
      scopeKey: 'scope-999',
      startDt: '2026-07-20T12:00:00Z',
      endDt: '2026-07-20T14:00:00Z',
      message: 'Historical unrelated violation',
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [historical] })
      .mockResolvedValueOnce({ allowed: true, violations: [historical] })

    const allowed = await checkLiveDraftLegality(
      ['911'],
      [rosterItem()],
      [rosterItem({ crewId: '912' })],
      { relatedItems: [rosterItem()], relatedPairingIds: [100] },
    )

    expect(allowed).toBe(true)
    expect(mocks.showConfirmDialog).not.toHaveBeenCalled()
  })

  it('keeps new violations anchored to another pairing when their window overlaps the edited task', async () => {
    const adjacentAnchor = previewViolation({
      pairingId: 200,
      dutySeq: 2,
      scopeKey: 'scope-200',
      startDt: '2026-07-02T13:00:00Z',
      endDt: '2026-07-02T15:00:00Z',
      message: 'Rest violation after removing previous task',
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [adjacentAnchor] })
      .mockResolvedValueOnce({ allowed: true, violations: [] })

    const allowed = await checkLiveDraftLegality(
      ['911'],
      [rosterItem()],
      [],
      { relatedItems: [rosterItem()], relatedPairingIds: [100] },
    )

    expect(allowed).toBe(true)
    expect(mocks.toRuleViolations).toHaveBeenCalledWith([adjacentAnchor])
    expect(mocks.showConfirmDialog).toHaveBeenCalledOnce()
  })

  it('filters new crew-level violations outside the edited task window', async () => {
    const unrelatedCrewWindow = previewViolation({
      pairingId: null,
      dutySeq: null,
      scopeKey: 'crew-window',
      startDt: '2026-07-25T12:00:00Z',
      endDt: '2026-07-25T14:00:00Z',
      message: 'Unrelated crew window violation',
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [unrelatedCrewWindow] })
      .mockResolvedValueOnce({ allowed: true, violations: [] })

    const allowed = await checkLiveDraftLegality(
      ['911'],
      [rosterItem()],
      [rosterItem({ crewId: '912' })],
      { relatedItems: [rosterItem()], relatedPairingIds: [100] },
    )

    expect(allowed).toBe(true)
    expect(mocks.showConfirmDialog).not.toHaveBeenCalled()
  })

  it('always surfaces new 7505 Min-GDO findings even when anchor pairing differs', async () => {
    const gdo = previewViolation({
      pairingId: 999,
      ruleCode: '7505',
      ruleInstance: '001',
      scopeKey: '1RP',
      startDt: '2026-07-01T06:00:00Z',
      endDt: '2026-08-01T05:59:59Z',
      message: 'The number of days off(11) must be at least 13 in 1 RP (2026-07-01, 2026-07-31).',
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [gdo] })
      .mockResolvedValueOnce({ allowed: true, violations: [] })

    const allowed = await checkLiveDraftLegality(
      ['911'],
      [rosterItem()],
      [rosterItem({ crewId: '912' })],
      { relatedItems: [rosterItem()], relatedPairingIds: [100] },
    )

    expect(allowed).toBe(true)
    expect(mocks.toRuleViolations).toHaveBeenCalledWith([gdo])
    expect(mocks.showConfirmDialog).toHaveBeenCalledWith([ruleViolation(gdo)], false)
    expect(mocks.setSessionViolations).toHaveBeenCalledWith(
      '911',
      999,
      expect.arrayContaining([expect.objectContaining({ ruleCode: '7505', message: gdo.message })]),
    )
  })

  it('still surfaces 7505 when the crew already violated before the edit', async () => {
    const gdo = previewViolation({
      pairingId: 999,
      ruleCode: '7505',
      ruleInstance: '001',
      scopeKey: '1RP',
      startDt: '2026-07-01T06:00:00Z',
      endDt: '2026-08-01T05:59:59Z',
      message: 'The number of days off(11) must be at least 13 in 1 RP (2026-07-01, 2026-07-31).',
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [gdo] })
      .mockResolvedValueOnce({ allowed: true, violations: [gdo] })

    const allowed = await checkLiveDraftLegality(
      ['911'],
      [rosterItem()],
      [rosterItem({ crewId: '912' })],
      { relatedItems: [rosterItem()], relatedPairingIds: [100] },
    )

    expect(allowed).toBe(true)
    expect(mocks.showConfirmDialog).toHaveBeenCalledWith([ruleViolation(gdo)], false)
  })

  it('does not surface mate 7507 on the confirm dialog when assigning to a different crew', async () => {
    const mateGdo = previewViolation({
      crewId: '2807',
      pairingId: 138732,
      ruleCode: '7507',
      ruleInstance: '001',
      scopeKey: '1RP',
      startDt: '2026-09-01T04:00:00.000Z',
      endDt: '2026-10-01T03:59:59.000Z',
      message: 'The number of days off(9) must be at least 10 in 1 RP (2026-09-01, 2026-09-30).',
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: false, violations: [mateGdo] })
      .mockResolvedValueOnce({ allowed: true, violations: [] })

    const allowed = await checkLiveDraftLegality(
      ['13645'],
      [rosterItem({ crewId: '2807', pairingId: 138734 })],
      [
        rosterItem({ crewId: '2807', pairingId: 138734 }),
        rosterItem({ id: 2, crewId: '13645', pairingId: 138734 }),
      ],
      {
        contextType: 'scenario',
        scenarioId: 740,
        relatedPairingIds: [138734],
        relatedItems: [rosterItem({ id: 2, crewId: '13645', pairingId: 138734 })],
      },
    )

    expect(allowed).toBe(true)
    expect(mocks.showConfirmDialog).not.toHaveBeenCalled()
    expect(mocks.checkDraft.mock.calls[0][0].affectedCrewIds.sort()).toEqual(['13645', '2807'])
  })

  it('still surfaces primary-crew 7507 when the anchor pairing is not the edited pairing', async () => {
    const primaryGdo = previewViolation({
      crewId: '13645',
      pairingId: 999,
      ruleCode: '7507',
      ruleInstance: '001',
      scopeKey: '1RP',
      startDt: '2026-09-01T04:00:00.000Z',
      endDt: '2026-10-01T03:59:59.000Z',
      message: 'The number of days off(9) must be at least 10 in 1 RP (2026-09-01, 2026-09-30).',
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [primaryGdo] })
      .mockResolvedValueOnce({ allowed: true, violations: [] })

    const allowed = await checkLiveDraftLegality(
      ['13645'],
      [rosterItem({ crewId: '13645', pairingId: 100 })],
      [rosterItem({ crewId: '13645', pairingId: 138734 })],
      {
        relatedItems: [rosterItem({ crewId: '13645', pairingId: 138734 })],
        relatedPairingIds: [138734],
      },
    )

    expect(allowed).toBe(true)
    expect(mocks.toRuleViolations).toHaveBeenCalledWith([primaryGdo])
    expect(mocks.showConfirmDialog).toHaveBeenCalledWith([ruleViolation(primaryGdo)], false)
  })

  it('shows new 7504 anchored on earlier pairing when related is later only (15152/15279)', async () => {
    const v7504 = previewViolation({
      ruleCode: '7504',
      pairingId: 15152,
      scopeKey: '7504-gap',
      startDt: '2026-08-03T18:05:00.000Z',
      endDt: '2026-08-05T12:45:00.000Z',
      message: 'Rest between consecutive WOCL flight duties (2026-08-03, 2026-08-05) is 42:40 less than 55 RH.',
      severity: 2,
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [v7504] })
      .mockResolvedValueOnce({ allowed: true, violations: [] })

    const later = rosterItem({
      id: 2,
      crewId: '1318',
      pairingId: 15279,
      assignmentGroup: 'FLY',
      schStrDtUtc: '2026-08-05T12:45:00.000Z',
      schEndDtUtc: '2026-08-05T18:05:00.000Z',
    })
    const earlier = rosterItem({
      id: 1,
      crewId: '1318',
      pairingId: 15152,
      assignmentGroup: 'FLY',
      schStrDtUtc: '2026-08-03T12:45:00.000Z',
      schEndDtUtc: '2026-08-03T18:05:00.000Z',
    })

    mocks.showConfirmDialog.mockResolvedValueOnce(true)
    const allowed = await checkLiveDraftLegality(
      ['1318'],
      [earlier],
      [earlier, later],
      { relatedItems: [later], relatedPairingIds: [15279] },
    )

    expect(allowed).toBe(false)
    expect(mocks.toRuleViolations).toHaveBeenCalledWith([v7504])
    expect(mocks.showConfirmDialog).toHaveBeenCalledOnce()
  })

  it('shows new 8056 anchored on earlier pairing when related is later only', async () => {
    const v8056 = previewViolation({
      ruleCode: '8056',
      pairingId: 15152,
      scopeKey: '8056-gap',
      startDt: '2026-08-03T18:05:00.000Z',
      endDt: '2026-08-05T12:45:00.000Z',
      message: 'Rest between duties below required space.',
      severity: 2,
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [v8056] })
      .mockResolvedValueOnce({ allowed: true, violations: [] })

    const later = rosterItem({
      id: 2,
      crewId: '1318',
      pairingId: 15279,
      assignmentGroup: 'FLY',
      schStrDtUtc: '2026-08-05T12:45:00.000Z',
      schEndDtUtc: '2026-08-05T18:05:00.000Z',
    })
    const earlier = rosterItem({
      id: 1,
      crewId: '1318',
      pairingId: 15152,
      assignmentGroup: 'FLY',
      schStrDtUtc: '2026-08-03T12:45:00.000Z',
      schEndDtUtc: '2026-08-03T18:05:00.000Z',
    })

    mocks.showConfirmDialog.mockResolvedValueOnce(true)
    await checkLiveDraftLegality(
      ['1318'],
      [earlier],
      [earlier, later],
      { relatedItems: [later], relatedPairingIds: [15279] },
    )

    expect(mocks.toRuleViolations).toHaveBeenCalledWith([v8056])
  })

  it('shows new 8056 anchored on ground (pairingId 0) for the edited crew (2724 SIM→15718)', async () => {
    const v8056 = previewViolation({
      crewId: '2724',
      pairingId: 0,
      dutySeq: null,
      ruleCode: '8056',
      ruleInstance: '001',
      scopeKey: 'FLY|SIM>FLY|SIM|PRAM|PRPM|PRMM|CRAM|CRPM',
      startDt: '2026-08-11T23:15:00.000Z',
      endDt: '2026-08-12T10:05:00.000Z',
      message: 'Row 1: Rest between (SIM 2026-08-11 19:15) and (684 2026-08-12 06:05) is 10:50, which is below the required 13 RH.',
      severity: 2,
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [v8056] })
      .mockResolvedValueOnce({ allowed: true, violations: [] })

    const sim = rosterItem({
      id: 10,
      crewId: '2724',
      pairingId: null,
      assignmentGroup: 'GRD',
      assignment: 'SIM',
      label: 'SIM',
      schStrDtUtc: '2026-08-11T21:00:00.000Z',
      schEndDtUtc: '2026-08-12T03:15:00.000Z',
    })
    const fly = rosterItem({
      id: 11,
      crewId: '2724',
      pairingId: 15718,
      assignmentGroup: 'FLY',
      assignment: 'FLY',
      label: '684',
      schStrDtUtc: '2026-08-12T15:05:00.000Z',
      schEndDtUtc: '2026-08-12T20:00:00.000Z',
    })

    mocks.showConfirmDialog.mockResolvedValueOnce(true)
    await checkLiveDraftLegality(
      ['2724'],
      [sim],
      [sim, fly],
      { relatedItems: [fly], relatedPairingIds: [15718] },
    )

    expect(mocks.toRuleViolations).toHaveBeenCalledWith([v8056])
    expect(mocks.showConfirmDialog).toHaveBeenCalledOnce()
  })

  it('still hides historical ground-anchored 8056 present before and after the edit', async () => {
    const historical = previewViolation({
      crewId: '2724',
      pairingId: 0,
      dutySeq: null,
      ruleCode: '8056',
      ruleInstance: '001',
      scopeKey: '8056-old-ground',
      startDt: '2026-07-20T12:00:00.000Z',
      endDt: '2026-07-20T14:00:00.000Z',
      message: 'Historical ground-anchored 8056',
      severity: 2,
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [historical] })
      .mockResolvedValueOnce({ allowed: true, violations: [historical] })

    const fly = rosterItem({
      id: 11,
      crewId: '2724',
      pairingId: 15718,
      assignmentGroup: 'FLY',
      schStrDtUtc: '2026-08-12T15:05:00.000Z',
      schEndDtUtc: '2026-08-12T20:00:00.000Z',
    })

    await checkLiveDraftLegality(
      ['2724'],
      [fly],
      [fly],
      { relatedItems: [fly], relatedPairingIds: [15718] },
    )

    expect(mocks.showConfirmDialog).not.toHaveBeenCalled()
  })

  it('does not show new ground-anchored 8056 on a pairing mate', async () => {
    const mateHit = previewViolation({
      crewId: '9999',
      pairingId: 0,
      dutySeq: null,
      ruleCode: '8056',
      ruleInstance: '001',
      scopeKey: '8056-mate-ground',
      startDt: '2026-08-11T23:15:00.000Z',
      endDt: '2026-08-12T10:05:00.000Z',
      message: 'Mate ground-anchored 8056',
      severity: 2,
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [mateHit] })
      .mockResolvedValueOnce({ allowed: true, violations: [] })

    const primaryFly = rosterItem({
      id: 11,
      crewId: '2724',
      pairingId: 15718,
      assignmentGroup: 'FLY',
      schStrDtUtc: '2026-08-12T15:05:00.000Z',
      schEndDtUtc: '2026-08-12T20:00:00.000Z',
    })
    const mateFly = rosterItem({
      id: 12,
      crewId: '9999',
      pairingId: 15718,
      assignmentGroup: 'FLY',
      schStrDtUtc: '2026-08-12T15:05:00.000Z',
      schEndDtUtc: '2026-08-12T20:00:00.000Z',
    })

    await checkLiveDraftLegality(
      ['2724'],
      [primaryFly, mateFly],
      [primaryFly, mateFly],
      { relatedItems: [primaryFly], relatedPairingIds: [15718] },
    )

    expect(mocks.showConfirmDialog).not.toHaveBeenCalled()
  })

  it('still hides unrelated historical spacing on a non-neighbor pairing', async () => {
    const historical = previewViolation({
      ruleCode: '7504',
      pairingId: 999,
      scopeKey: 'scope-999',
      startDt: '2026-07-20T12:00:00Z',
      endDt: '2026-07-20T14:00:00Z',
      message: 'Historical unrelated 7504',
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [historical] })
      .mockResolvedValueOnce({ allowed: true, violations: [historical] })

    const later = rosterItem({
      id: 2,
      crewId: '1318',
      pairingId: 15279,
      assignmentGroup: 'FLY',
      schStrDtUtc: '2026-08-05T12:45:00.000Z',
      schEndDtUtc: '2026-08-05T18:05:00.000Z',
    })
    const earlier = rosterItem({
      id: 1,
      crewId: '1318',
      pairingId: 15152,
      assignmentGroup: 'FLY',
      schStrDtUtc: '2026-08-03T12:45:00.000Z',
      schEndDtUtc: '2026-08-03T18:05:00.000Z',
    })

    await checkLiveDraftLegality(
      ['1318'],
      [earlier, later],
      [earlier, later],
      { relatedItems: [later], relatedPairingIds: [15279] },
    )

    expect(mocks.showConfirmDialog).not.toHaveBeenCalled()
  })

  it('does not run draft legality preview when deleting a task', async () => {
    await useRosterStore.getState().removeTask('main', 1)

    expect(mocks.checkDraft).not.toHaveBeenCalled()
    expect(mocks.showConfirmDialog).not.toHaveBeenCalled()
    expect(useDraftStore.getState().operations).toHaveLength(1)
    expect(useRosterStore.getState().main.rosterItems).toHaveLength(0)
  })

  it('cancels a pending assign-pairing placeholder instead of emitting a remove op', async () => {
    // A pending assign-pairing placed a placeholder task (negative temp id) on the roster.
    const placeholderId = -5
    useDraftStore.setState({
      active: true,
      operations: [{
        id: 'draft-placeholder',
        op: {
          type: 'assign-pairing',
          pairingId: 100,
          crewId: '911',
          rosterActingRank: 'CA',
          tasks: [{ id: placeholderId, crewId: '911', pairingId: 100 }],
        },
        affectedCrewIds: ['911'],
        affectedPairingIds: [100],
        timestamp: 1,
      }],
      redoStack: [],
      saving: false,
    })
    useRosterStore.setState((s) => ({
      main: { ...s.main, baseItems: [], rosterItems: [{ ...rosterItem({ id: placeholderId }) }] },
    }))

    await useRosterStore.getState().removeTask('main', placeholderId)

    // The creating assign-pairing op is cancelled — no remove-by-temp-id op left behind
    // (which would commit as a silent no-op and leave the task on the roster).
    expect(useDraftStore.getState().operations).toHaveLength(0)
  })

  it('cancels a pending add mock item instead of emitting a remove op', async () => {
    const placeholderId = -9
    useDraftStore.setState({
      active: true,
      operations: [{
        id: 'draft-add',
        op: { type: 'add', mockItem: { id: placeholderId, crewId: '911' } },
        affectedCrewIds: ['911'],
        affectedPairingIds: [],
        timestamp: 1,
      }],
      redoStack: [],
      saving: false,
    })
    useRosterStore.setState((s) => ({
      main: { ...s.main, baseItems: [], rosterItems: [{ ...rosterItem({ id: placeholderId }) }] },
    }))

    await useRosterStore.getState().removeTask('main', placeholderId)

    expect(useDraftStore.getState().operations).toHaveLength(0)
  })
})

describe('moveTask undo/save lock timing', () => {
  // SIT bug 2026-08-19: dropping a task onto a Crew lit up undo/save immediately
  // and only re-disabled them 1-2s later when the legality dialog opened. The
  // toolbar must be locked from the moment the optimistic addOp runs — `checking`
  // is the flag draft-toolbar uses to gate undo/save (see actionsBlocked).
  it('locks the toolbar synchronously when moveTask runs, releases on clean check', async () => {
    mocks.checkDraft.mockReset()
    mocks.checkDraft.mockResolvedValue({ allowed: true, violations: [] })
    // Need two crews on the roster so moveTask has a from/to target.
    useRosterStore.setState((s) => ({
      main: {
        ...s.main,
        baseItems: [rosterItem({ id: 1, crewId: '911' }), rosterItem({ id: 2, crewId: '912', pairingId: 101 })],
        rosterItems: [rosterItem({ id: 1, crewId: '911' }), rosterItem({ id: 2, crewId: '912', pairingId: 101 })],
      },
    }))

    const movePromise = useRosterStore.getState().moveTask('main', 1, '912')

    // Synchronous: the toolbar must already be locked at this point. moveTask
    // awaits the legality check internally, so the microtask queue is not yet
    // drained — anything scheduled after the first await would not have run.
    expect(mocks.setChecking).toHaveBeenCalledWith(true)

    await movePromise

    // Clean check: lock is released. Confirm dialog was not opened.
    expect(mocks.showConfirmDialog).not.toHaveBeenCalled()
    expect(mocks.setChecking).toHaveBeenLastCalledWith(false)
  })

  it('locks the toolbar synchronously even when violations are found', async () => {
    // When the legality check finds new violations, the toolbar must STILL be
    // locked from the moment the optimistic addOp runs — showConfirmDialog owns
    // the flag while open, so moveTask's own setChecking(true) closes the gap
    // before the dialog takes over.
    mocks.checkDraft.mockReset()
    // After-state has a new violation; before-state is clean — so the
    // check classifies it as `relevantNewViolations` and triggers the dialog.
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: false, violations: [previewViolation()] })
      .mockResolvedValueOnce({ allowed: true, violations: [] })
    mocks.toRuleViolations.mockImplementation((violations: PreviewViolation[]) => violations.map(ruleViolation))
    mocks.showConfirmDialog.mockResolvedValue(true)
    useRosterStore.setState((s) => ({
      main: {
        ...s.main,
        baseItems: [rosterItem({ id: 1, crewId: '911' }), rosterItem({ id: 2, crewId: '912', pairingId: 101 })],
        rosterItems: [rosterItem({ id: 1, crewId: '911' }), rosterItem({ id: 2, crewId: '912', pairingId: 101 })],
      },
    }))

    const movePromise = useRosterStore.getState().moveTask('main', 1, '912')

    // The toolbar is locked synchronously — before the legality check has even
    // produced a result — so the user never sees undo/save light up between
    // drop and confirm dialog.
    expect(mocks.setChecking).toHaveBeenCalledWith(true)

    await movePromise

    expect(mocks.showConfirmDialog).toHaveBeenCalledOnce()
  })
})
