import { describe, it, expect, beforeEach } from 'vitest'
import { dispatchAiAction } from '../dispatch-ai-action'
import { useFilterStore } from '@/stores/filter-store'
import { usePaneStore } from '@/stores/pane-store'
import { useTimezoneStore } from '@/stores/timezone-store'

describe('dispatchAiAction', () => {
  beforeEach(() => {
    useFilterStore.getState().resetFilters()
    usePaneStore.getState().setSortCriteria('roster-main', [])
    useTimezoneStore.setState({ timezone: 'UTC' })
  })

  it('applies filter_crew to the filter store', () => {
    dispatchAiAction({ type: 'filter_crew', bases: ['BKK'], ranks: ['CA'] })
    expect(useFilterStore.getState().crew.bases).toEqual(['BKK'])
    expect(useFilterStore.getState().crew.ranks).toEqual(['CA'])
  })

  it('applies filter_pairing current tab fields to the filter store', () => {
    const chip = dispatchAiAction({
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
      divisions: ['P'],
      depArps: ['YYZ'],
      assignments: ['F'],
      coverage: ['open', 'partial'],
      label: '4506',
      pairingIds: ['10234', '10567'],
    })
  })

  it('applies sort_roster to roster-main via pane-store sortCriteria', () => {
    dispatchAiAction({ type: 'sort_roster', paneId: 'roster', field: 'crewId', direction: 'desc' })
    expect(usePaneStore.getState().getSortCriteria('roster-main')).toEqual([
      { column: 'crewId', direction: 'desc' },
    ])
  })

  it('applies multi-key sort_roster criteria to roster-main', () => {
    const chip = dispatchAiAction({
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

  it('skips invalid sort_roster criteria before mutating pane-store', () => {
    const chip = dispatchAiAction({
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

  it('returns null when sort_roster has no valid criteria', () => {
    expect(dispatchAiAction({
      type: 'sort_roster',
      paneId: 'roster',
      criteria: [{ column: 'bad-field', direction: 'asc' }],
    })).toBeNull()
    expect(usePaneStore.getState().getSortCriteria('roster-main')).toEqual([])
  })

  it('reset_filters clears crew filter', () => {
    dispatchAiAction({ type: 'filter_crew', bases: ['BKK'] })
    dispatchAiAction({ type: 'reset_filters' })
    expect(useFilterStore.getState().crew.bases).toEqual([])
  })

  it('returns a human chip for filter_crew', () => {
    expect(dispatchAiAction({ type: 'filter_crew', bases: ['BKK'] })).toContain('Filtered crew')
    expect(dispatchAiAction({ type: 'filter_crew', bases: ['BKK'] })).toContain('bases=BKK')
  })

  it('applies set_date_range as calendar boundaries in the display timezone (UTC here)', () => {
    const chip = dispatchAiAction({ type: 'set_date_range', start: '2026-07-01', end: '2026-07-15' })
    expect(chip).toBe('Date range 2026-07-01 → 2026-07-15')
    const { dateRange } = useFilterStore.getState()
    expect(dateRange.start.toISOString()).toBe('2026-07-01T00:00:00.000Z')
    expect(dateRange.end.toISOString()).toBe('2026-07-15T23:59:59.999Z')
  })

  it('set_date_range follows the display timezone like the toolbar picker', () => {
    useTimezoneStore.setState({ timezone: 'America/Edmonton' }) // UTC-6 (MDT) in July
    dispatchAiAction({ type: 'set_date_range', start: '2026-07-01', end: '2026-07-15' })
    const { dateRange } = useFilterStore.getState()
    expect(dateRange.start.toISOString()).toBe('2026-07-01T06:00:00.000Z')
    expect(dateRange.end.toISOString()).toBe('2026-07-16T05:59:59.999Z')
  })

  it('rejects set_date_range with an unparseable date', () => {
    const before = useFilterStore.getState().dateRange
    expect(dispatchAiAction({ type: 'set_date_range', start: 'nope', end: '2026-07-15' })).toBeNull()
    expect(useFilterStore.getState().dateRange).toEqual(before)
  })

  it('returns null for an unknown action type', () =>
    expect(dispatchAiAction({ type: 'bogus' } as never)).toBeNull())

  it('skips sort_roster for an unknown paneId', () => {
    const before = usePaneStore.getState().getSortCriteria('roster-main')
    expect(
      dispatchAiAction({
        type: 'sort_roster',
        paneId: 'roster-9',
        field: 'crewId',
        direction: 'asc',
      } as never),
    ).toBeNull()
    expect(usePaneStore.getState().getSortCriteria('roster-main')).toEqual(before)
  })
})
