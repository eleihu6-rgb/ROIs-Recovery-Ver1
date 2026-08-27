import { describe, expect, it } from 'vitest'
import { filterAirportOptions, filterGroundTaskAssignments } from '../ground-task-dialog'

describe('filterGroundTaskAssignments', () => {
  it('keeps DHD assignments visible and only excludes FLT', () => {
    const options = [
      { assignment: 'DHD', description: 'Deadhead', defaultAssignmentGroup: 'DHD', restTime: null },
      { assignment: 'VAC', description: 'Vacation', defaultAssignmentGroup: 'GRD', restTime: null },
      { assignment: 'FLT1', description: 'Flight', defaultAssignmentGroup: 'FLT', restTime: null },
    ]

    expect(filterGroundTaskAssignments(options)).toEqual([
      options[0],
      options[1],
    ])
  })
})

describe('filterAirportOptions', () => {
  const airports = [
    { airport: 'YVR', airportName: 'Vancouver' },
    { airport: 'YYZ', airportName: 'Toronto Pearson' },
    { airport: 'YUL', airportName: 'Montreal' },
  ]

  it('fuzzy-matches airport code and name', () => {
    expect(filterAirportOptions(airports, 'tor')).toEqual([airports[1]])
    expect(filterAirportOptions(airports, 'yv')).toEqual([airports[0]])
  })
})
