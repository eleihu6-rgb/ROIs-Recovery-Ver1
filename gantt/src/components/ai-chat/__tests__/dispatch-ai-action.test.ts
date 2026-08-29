import { describe, it, expect, beforeEach, vi } from 'vitest'
import { dispatchAiAction } from '../dispatch-ai-action'
import { useFilterStore } from '@/stores/filter-store'
import { usePaneStore } from '@/stores/pane-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { useCrewStore } from '@/stores/crew-store'
import type { RosterItem } from '@/types/roster'
import type { Crew } from '@/types/crew'

const mocks = vi.hoisted(() => ({
  moveTask: vi.fn(),
  swapTasks: vi.fn(),
  removeTask: vi.fn(),
  removeTasksByPairingAndCrew: vi.fn(),
  addGroundTask: vi.fn(),
  apiGet: vi.fn(),
  rosterMain: { crewList: [] as Crew[], rosterItems: [] as RosterItem[] },
}))

vi.mock('@/stores/roster-store', () => ({
  useRosterStore: {
    getState: () => ({
      main: mocks.rosterMain,
      moveTask: mocks.moveTask,
      swapTasks: mocks.swapTasks,
      removeTask: mocks.removeTask,
      removeTasksByPairingAndCrew: mocks.removeTasksByPairingAndCrew,
      addGroundTask: mocks.addGroundTask,
    }),
  },
}))

vi.mock('@/services/api', () => ({
  api: { get: mocks.apiGet },
}))

const rosterItem = (overrides: Partial<RosterItem> = {}): RosterItem => ({
  id: 1,
  crewId: '911',
  pairingId: 100,
  pairingLabel: 'F100',
  ver: 1,
  base: 'BKK',
  label: 'F100',
  assignmentGroup: 'FLY',
  assignment: 'F',
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

const crew = (crewId: string, overrides: Partial<Crew> = {}): Crew =>
  ({ crewId, ...overrides }) as Crew

const assignmentOption = (assignment: string, defaultAssignmentGroup: string | null = 'DO') => ({
  assignment,
  description: assignment,
  defaultAssignmentGroup,
  restTime: null,
})

describe('dispatchAiAction', () => {
  beforeEach(() => {
    useFilterStore.getState().resetFilters()
    usePaneStore.getState().setSortCriteria('roster-main', [])
    useTimezoneStore.setState({ timezone: 'UTC' })
    useCrewStore.setState({ items: [] })
    mocks.rosterMain.crewList = []
    mocks.rosterMain.rosterItems = []
    mocks.moveTask.mockReset()
    mocks.swapTasks.mockReset()
    mocks.removeTask.mockReset()
    mocks.removeTasksByPairingAndCrew.mockReset()
    mocks.addGroundTask.mockReset()
    mocks.apiGet.mockReset()
  })

  it('applies filter_crew to the filter store', async () => {
    await dispatchAiAction({ type: 'filter_crew', bases: ['BKK'], ranks: ['CA'] })
    expect(useFilterStore.getState().crew.bases).toEqual(['BKK'])
    expect(useFilterStore.getState().crew.ranks).toEqual(['CA'])
  })

  it('applies filter_pairing current tab fields to the filter store', async () => {
    const chip = await dispatchAiAction({
      type: 'filter_pairing',
      bases: ['YVR'],
      fleets: ['737'],
      divisions: ['P'],
      depArps: ['YYZ'],
      assignments: ['F'],
      coverage: ['open', 'partial'],
      label: '4506',
      pairingIds: ['10234', '10567'],
    })

    expect(chip).toContain('Filtered pairings')
    expect(useFilterStore.getState().pairing).toEqual({
      bases: ['YVR'],
      fleets: ['737'],
      // divisions is mirrored from the Crew filter (owned there), not set directly by
      // filter_pairing — Crew filter is untouched in this test, so it stays empty.
      divisions: [],
      ranks: [],
      depArps: ['YYZ'],
      assignments: ['F'],
      coverage: ['open', 'partial'],
      label: '4506',
      pairingIds: ['10234', '10567'],
    })
  })

  it('applies sort_roster to roster-main via pane-store sortCriteria', async () => {
    await dispatchAiAction({ type: 'sort_roster', paneId: 'roster', field: 'crewId', direction: 'desc' })
    expect(usePaneStore.getState().getSortCriteria('roster-main')).toEqual([
      { column: 'crewId', direction: 'desc' },
    ])
  })

  it('applies multi-key sort_roster criteria to roster-main', async () => {
    const chip = await dispatchAiAction({
      type: 'sort_roster',
      paneId: 'roster',
      criteria: [
        { column: 'rank', direction: 'asc' },
        { column: 'seniority', direction: 'asc' },
        { column: 'crewId', direction: 'desc' },
      ],
    })
    expect(chip).toBe('Sorted roster by rank asc, seniority asc, crewId desc')
    expect(usePaneStore.getState().getSortCriteria('roster-main')).toEqual([
      { column: 'rank', direction: 'asc' },
      { column: 'seniority', direction: 'asc' },
      { column: 'crewId', direction: 'desc' },
    ])
  })

  it('skips invalid sort_roster criteria before mutating pane-store', async () => {
    const chip = await dispatchAiAction({
      type: 'sort_roster',
      paneId: 'roster',
      criteria: [
        { column: 'bad-field', direction: 'asc' },
        { column: 'crewId', direction: 'desc' },
      ],
    })
    expect(chip).toBe('Sorted roster by crewId desc')
    expect(usePaneStore.getState().getSortCriteria('roster-main')).toEqual([
      { column: 'crewId', direction: 'desc' },
    ])
  })

  it('returns null when sort_roster has no valid criteria', async () => {
    expect(await dispatchAiAction({
      type: 'sort_roster',
      paneId: 'roster',
      criteria: [{ column: 'bad-field', direction: 'asc' }],
    })).toBeNull()
    expect(usePaneStore.getState().getSortCriteria('roster-main')).toEqual([])
  })

  it('reset_filters clears crew filter', async () => {
    await dispatchAiAction({ type: 'filter_crew', bases: ['BKK'] })
    await dispatchAiAction({ type: 'reset_filters' })
    expect(useFilterStore.getState().crew.bases).toEqual([])
  })

  it('returns a human chip for filter_crew', async () => {
    expect(await dispatchAiAction({ type: 'filter_crew', bases: ['BKK'] })).toContain('Filtered crew')
    expect(await dispatchAiAction({ type: 'filter_crew', bases: ['BKK'] })).toContain('bases=BKK')
  })

  it('applies set_date_range as calendar boundaries in the display timezone (UTC here)', async () => {
    const chip = await dispatchAiAction({ type: 'set_date_range', start: '2026-07-01', end: '2026-07-15' })
    expect(chip).toBe('Date range 2026-07-01 → 2026-07-15')
    const { dateRange } = useFilterStore.getState()
    expect(dateRange.start.toISOString()).toBe('2026-07-01T00:00:00.000Z')
    expect(dateRange.end.toISOString()).toBe('2026-07-15T23:59:59.999Z')
  })

  it('set_date_range follows the display timezone like the toolbar picker', async () => {
    useTimezoneStore.setState({ timezone: 'America/Edmonton' }) // UTC-6 (MDT) in July
    await dispatchAiAction({ type: 'set_date_range', start: '2026-07-01', end: '2026-07-15' })
    const { dateRange } = useFilterStore.getState()
    expect(dateRange.start.toISOString()).toBe('2026-07-01T06:00:00.000Z')
    expect(dateRange.end.toISOString()).toBe('2026-07-16T05:59:59.999Z')
  })

  it('rejects set_date_range with an unparseable date', async () => {
    const before = useFilterStore.getState().dateRange
    expect(await dispatchAiAction({ type: 'set_date_range', start: 'nope', end: '2026-07-15' })).toBeNull()
    expect(useFilterStore.getState().dateRange).toEqual(before)
  })

  it('returns null for an unknown action type', async () =>
    expect(await dispatchAiAction({ type: 'bogus' } as never)).toBeNull())

  it('skips sort_roster for an unknown paneId', async () => {
    const before = usePaneStore.getState().getSortCriteria('roster-main')
    expect(
      await dispatchAiAction({
        type: 'sort_roster',
        paneId: 'roster-9',
        field: 'crewId',
        direction: 'asc',
      } as never),
    ).toBeNull()
    expect(usePaneStore.getState().getSortCriteria('roster-main')).toEqual(before)
  })

  describe('Phase 1 Live Roster mutations', () => {
    it('move_task moves a single-segment duty to another crew', async () => {
      mocks.rosterMain.crewList = [crew('911'), crew('912')]
      mocks.rosterMain.rosterItems = [rosterItem({ id: 1, crewId: '911' })]
      mocks.moveTask.mockResolvedValue(rosterItem({ id: 1, crewId: '912' }))

      const chip = await dispatchAiAction({ type: 'move_task', crewId: '911', toCrewId: '912' })

      expect(mocks.moveTask).toHaveBeenCalledWith('main', 1, '912')
      expect(chip).toBe("Moved crew 911's duty (1 row) to crew 912")
    })

    it('move_task moves every segment of a multi-segment pairing', async () => {
      mocks.rosterMain.crewList = [crew('911'), crew('912')]
      mocks.rosterMain.rosterItems = [
        rosterItem({ id: 1, crewId: '911', pairingId: 100, segSeq: 1 }),
        rosterItem({ id: 2, crewId: '911', pairingId: 100, segSeq: 2 }),
      ]
      mocks.moveTask.mockResolvedValue(rosterItem({ crewId: '912' }))

      const chip = await dispatchAiAction({ type: 'move_task', crewId: '911', toCrewId: '912' })

      expect(mocks.moveTask).toHaveBeenCalledTimes(2)
      expect(mocks.moveTask).toHaveBeenNthCalledWith(1, 'main', 1, '912')
      expect(mocks.moveTask).toHaveBeenNthCalledWith(2, 'main', 2, '912')
      expect(chip).toBe("Moved crew 911's duty (2 rows) to crew 912")
    })

    it('move_task rejects when the source crew is not loaded on the roster', async () => {
      mocks.rosterMain.crewList = [crew('912')]
      const chip = await dispatchAiAction({ type: 'move_task', crewId: '911', toCrewId: '912' })

      expect(chip).toContain('911')
      expect(chip).toContain('not currently loaded')
      expect(mocks.moveTask).not.toHaveBeenCalled()
    })

    it('move_task rejects when the target crew is not loaded on the roster', async () => {
      mocks.rosterMain.crewList = [crew('911')]
      mocks.rosterMain.rosterItems = [rosterItem({ id: 1, crewId: '911' })]

      const chip = await dispatchAiAction({ type: 'move_task', crewId: '911', toCrewId: '999' })

      expect(chip).toContain('999')
      expect(chip).toContain('not currently loaded')
      expect(mocks.moveTask).not.toHaveBeenCalled()
    })

    it('move_task asks to disambiguate when crew has more than one duty loaded', async () => {
      mocks.rosterMain.crewList = [crew('911'), crew('912')]
      mocks.rosterMain.rosterItems = [
        rosterItem({ id: 1, crewId: '911', pairingId: 100, pairingLabel: 'F100' }),
        rosterItem({ id: 2, crewId: '911', pairingId: 200, pairingLabel: 'F200' }),
      ]

      const chip = await dispatchAiAction({ type: 'move_task', crewId: '911', toCrewId: '912' })

      expect(chip).toContain('more than one duty')
      expect(mocks.moveTask).not.toHaveBeenCalled()
    })

    it('move_task uses pairingLabel to pick one duty among several', async () => {
      mocks.rosterMain.crewList = [crew('911'), crew('912')]
      mocks.rosterMain.rosterItems = [
        rosterItem({ id: 1, crewId: '911', pairingId: 100, pairingLabel: 'F100' }),
        rosterItem({ id: 2, crewId: '911', pairingId: 200, pairingLabel: 'F200' }),
      ]
      mocks.moveTask.mockResolvedValue(rosterItem({ crewId: '912' }))

      await dispatchAiAction({ type: 'move_task', crewId: '911', toCrewId: '912', pairingLabel: 'f200' })

      expect(mocks.moveTask).toHaveBeenCalledWith('main', 2, '912')
    })

    it('swap_tasks swaps two single duties', async () => {
      mocks.rosterMain.crewList = [crew('911'), crew('912')]
      mocks.rosterMain.rosterItems = [
        rosterItem({ id: 1, crewId: '911', pairingId: 100 }),
        rosterItem({ id: 2, crewId: '912', pairingId: 200 }),
      ]
      mocks.swapTasks.mockResolvedValue(true)

      const chip = await dispatchAiAction({ type: 'swap_tasks', crewIdA: '911', crewIdB: '912' })

      expect(mocks.swapTasks).toHaveBeenCalledWith('main', 1, 2)
      expect(chip).toBe('Swapped duties between crew 911 and crew 912')
    })

    it('swap_tasks rejects when either side matches a multi-segment pairing', async () => {
      mocks.rosterMain.crewList = [crew('911'), crew('912')]
      mocks.rosterMain.rosterItems = [
        rosterItem({ id: 1, crewId: '911', pairingId: 100, segSeq: 1 }),
        rosterItem({ id: 2, crewId: '911', pairingId: 100, segSeq: 2 }),
        rosterItem({ id: 3, crewId: '912', pairingId: 200 }),
      ]

      const chip = await dispatchAiAction({ type: 'swap_tasks', crewIdA: '911', crewIdB: '912' })

      expect(chip).toContain('Swap only supports single duties')
      expect(mocks.swapTasks).not.toHaveBeenCalled()
    })

    it('unassign_task removes a crew from a pairing via removeTasksByPairingAndCrew', async () => {
      mocks.rosterMain.crewList = [crew('911')]
      mocks.rosterMain.rosterItems = [rosterItem({ id: 1, crewId: '911', pairingId: 100, pairingLabel: 'F100' })]

      const chip = await dispatchAiAction({ type: 'unassign_task', crewId: '911' })

      expect(mocks.removeTasksByPairingAndCrew).toHaveBeenCalledWith('main', 100, '911')
      expect(mocks.removeTask).not.toHaveBeenCalled()
      expect(chip).toBe('Removed crew 911 from F100')
    })

    it('unassign_task removes a ground task via removeTask', async () => {
      mocks.rosterMain.crewList = [crew('911')]
      mocks.rosterMain.rosterItems = [
        rosterItem({ id: 1, crewId: '911', pairingId: null, pairingLabel: null, label: 'DO', assignmentGroup: 'DO' }),
      ]

      const chip = await dispatchAiAction({ type: 'unassign_task', crewId: '911' })

      expect(mocks.removeTask).toHaveBeenCalledWith('main', 1)
      expect(mocks.removeTasksByPairingAndCrew).not.toHaveBeenCalled()
      expect(chip).toBe('Removed crew 911 from their duty')
    })

    it('unassign_task returns an error chip when the crew is not loaded', async () => {
      mocks.rosterMain.crewList = []
      const chip = await dispatchAiAction({ type: 'unassign_task', crewId: '911' })

      expect(chip).toContain('not currently loaded')
      expect(mocks.removeTask).not.toHaveBeenCalled()
      expect(mocks.removeTasksByPairingAndCrew).not.toHaveBeenCalled()
    })

    it('add_ground_task resolves the assignment against the live dictionary and creates the task', async () => {
      useCrewStore.setState({
        items: [{ crew: crew('911', { panelBase: 'BKK' }), sessionTags: [] } as never],
      })
      mocks.apiGet.mockResolvedValue([assignmentOption('Day Off'), assignmentOption('Training')])
      mocks.addGroundTask.mockResolvedValue([rosterItem({ crewId: '911' })])

      const chip = await dispatchAiAction({
        type: 'add_ground_task',
        crewIds: ['911'],
        assignment: 'day off',
        date: '2026-09-05',
      })

      expect(mocks.apiGet).toHaveBeenCalledWith('/api/assignment')
      expect(mocks.addGroundTask).toHaveBeenCalledWith('main', {
        crewIds: ['911'],
        assignment: 'Day Off',
        depArp: 'BKK',
        arvArp: 'BKK',
        startDtUtc: '2026-09-05T00:00:00.000Z',
        endDtUtc: '2026-09-05T23:59:59.999Z',
        comments: undefined,
      })
      expect(chip).toBe('Added "Day Off" for 1 of 1 crew')
    })

    it('add_ground_task honors explicit startTime/endTime via localToUtc', async () => {
      useCrewStore.setState({
        items: [{ crew: crew('911', { panelBase: 'BKK' }), sessionTags: [] } as never],
      })
      mocks.apiGet.mockResolvedValue([assignmentOption('Standby')])
      mocks.addGroundTask.mockResolvedValue([rosterItem({ crewId: '911' })])

      await dispatchAiAction({
        type: 'add_ground_task',
        crewIds: ['911'],
        assignment: 'Standby',
        date: '2026-09-05',
        startTime: '06:00',
        endTime: '12:00',
      })

      const call = mocks.addGroundTask.mock.calls[0][1]
      expect(call.startDtUtc).toBe('2026-09-05T06:00:00.000Z')
      expect(call.endDtUtc).toBe('2026-09-05T12:00:00.000Z')
    })

    it('add_ground_task rejects an assignment name not in the live dictionary', async () => {
      mocks.apiGet.mockResolvedValue([assignmentOption('Day Off'), assignmentOption('Training')])
      useCrewStore.setState({ items: [{ crew: crew('911'), sessionTags: [] } as never] })

      const chip = await dispatchAiAction({
        type: 'add_ground_task',
        crewIds: ['911'],
        assignment: 'Nonexistent',
        date: '2026-09-05',
      })

      expect(chip).toContain('not a valid ground-task assignment')
      expect(chip).toContain('Day Off')
      expect(mocks.addGroundTask).not.toHaveBeenCalled()
    })

    it('add_ground_task rejects unknown crew ids', async () => {
      mocks.apiGet.mockResolvedValue([assignmentOption('Day Off')])
      useCrewStore.setState({ items: [{ crew: crew('911'), sessionTags: [] } as never] })

      const chip = await dispatchAiAction({
        type: 'add_ground_task',
        crewIds: ['911', '999'],
        assignment: 'Day Off',
        date: '2026-09-05',
      })

      expect(chip).toBe('Unknown crew id(s): 999')
      expect(mocks.addGroundTask).not.toHaveBeenCalled()
    })
  })
})
