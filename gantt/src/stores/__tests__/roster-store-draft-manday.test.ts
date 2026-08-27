import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    checkDraft: vi.fn().mockResolvedValue({ allowed: true, violations: [] }),
    toRuleViolations: vi.fn().mockReturnValue([]),
  },
}))

vi.mock('@/stores/lock-store', () => ({
  useLockStore: {
    getState: () => ({
      acquireLock: vi.fn().mockResolvedValue(true),
      acquireLocks: vi.fn().mockResolvedValue(true),
      myLockKeys: new Set(),
      currentUser: 'test',
    }),
  },
}))

vi.mock('@/stores/rule-check-store', () => ({
  useRuleCheckStore: {
    getState: () => ({
      preCheck: vi.fn().mockResolvedValue({ violations: [], hasBlocking: false }),
      showConfirmDialog: vi.fn().mockResolvedValue(true),
    }),
  },
}))

vi.mock('@/stores/history-store', () => ({
  useHistoryStore: {
    getState: () => ({ push: vi.fn() }),
  },
}))

import { useDraftStore } from '@/stores/draft-store'
import { useRosterStore } from '@/stores/roster-store'
import { crewMandayDelta } from '@/utils/manday-delta'
import type { RosterItem } from '@/types/roster'
import type { RosterPeriodOption } from '@/services/roster-period-api'

const rpItems: RosterPeriodOption[] = [
  { id: 7, rosterPeriod: '2026RP07', name: '2026-07', rpStart: '2026-07-01', rpEnd: '2026-07-31', isCurrent: true },
]

const baseItem = (overrides: Partial<RosterItem> = {}): RosterItem => ({
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

beforeEach(() => {
  useDraftStore.setState({ active: true, operations: [], redoStack: [], saving: false })
  useRosterStore.setState({
    main: {
      crewList: [],
      baseItems: [baseItem()],
      rosterItems: [baseItem()],
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

describe('roster-store draft manday recompute', () => {
  it('adds a DO ground task only to virtual roster so common manday delta increments MDO', async () => {
    await useRosterStore.getState().addGroundTask('main', {
      crewIds: ['911'],
      assignment: 'DO',
      depArp: 'YVR',
      arvArp: 'YYZ',
      startDtUtc: '2026-07-10T00:00:00Z',
      endDtUtc: '2026-07-10T23:59:00Z',
    })

    const { baseItems, rosterItems } = useRosterStore.getState().main

    expect(baseItems).toHaveLength(1)
    expect(baseItems.some((item) => item.assignment === 'DO')).toBe(false)
    expect(rosterItems.some((item) => item.crewId === '911' && item.assignment === 'DO')).toBe(true)
    expect(useDraftStore.getState().operations).toHaveLength(1)

    const delta = crewMandayDelta(baseItems, rosterItems, '2026RP07', rpItems).get('911')
    expect(delta?.mdo).toBe(1)
    expect(delta?.ydo).toBe(1)
  })

  it('adds fixed credit to draft ground-task mock items before Save', async () => {
    await useRosterStore.getState().addGroundTask('main', {
      crewIds: ['911'],
      assignment: 'CRAM',
      depArp: 'YVR',
      arvArp: 'YYZ',
      startDtUtc: '2026-07-15T09:00:00Z',
      endDtUtc: '2026-07-15T17:00:00Z',
      fixedCreditMin: 240,
    })

    const created = useRosterStore.getState().main.rosterItems.find((item) =>
      item.crewId === '911' && item.assignment === 'CRAM' && item.pairingId === null,
    )

    expect(created?.schCreditedMinutes).toBe('240')
    expect(created?.actCreditedMinutes).toBe('240')
    expect(useDraftStore.getState().operations[0]?.op.mockItems?.[0]).toEqual(
      expect.objectContaining({ schCreditedMinutes: '240', actCreditedMinutes: '240' }),
    )
  })
})
