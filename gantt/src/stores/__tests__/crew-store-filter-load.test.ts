import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
}))

vi.mock('@/services/crew-api', () => ({
  crewApi: { list: mocks.list },
}))

import { useCrewStore } from '../crew-store'

const range = { start: new Date('2026-09-01T00:00:00.000Z'), end: new Date('2026-09-30T00:00:00.000Z') }

describe('fetchCrewsWithFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCrewStore.setState({
      items: [], total: 0, unfilteredTotal: 0, loading: false, hasMore: false,
      sessions: [], nextSessionId: 1, selectedCrewIds: [], activeGlobalFilter: null,
    })
  })

  it('uses the fast Gantt panel response so selected crews are available for roster loading', async () => {
    mocks.list.mockResolvedValueOnce({
      total: 1,
      items: [{
        id: 1012, crewId: '1012', firstName: 'Test', middleName: null, lastName: 'Crew',
        preferredName: null, gender: 'M', division: 'P', filiale: 'F8', status: 1,
        remarks: null, seniorityNum: null, panelRank: 'FO', panelBase: 'PEK', panelFleets: ['7M8'],
        quals: { crewId: '1012', division: 'P', rank: 'FO', fleetQuals: ['7M8'], airportQuals: [] },
      }],
    })
    // The unfiltered count query runs in the background and is not on the Roster critical path.
    mocks.list.mockResolvedValueOnce({ total: 1, items: [] })

    await useCrewStore.getState().fetchCrewsWithFilter({ divisions: ['P'], bases: [], ranks: [], fleets: [] }, range)

    expect(mocks.list).toHaveBeenNthCalledWith(1, expect.objectContaining({
      page: 1, pageSize: 0, divisions: ['P'], dateRangeStart: '2026-09-01', dateRangeEnd: '2026-09-30',
    }), 'gantt-panel')
    expect(useCrewStore.getState().selectedCrewIds).toEqual(['1012'])
    expect(useCrewStore.getState().getQuals('1012')).toEqual(expect.objectContaining({ fleetQuals: ['7M8'] }))
  })
})
