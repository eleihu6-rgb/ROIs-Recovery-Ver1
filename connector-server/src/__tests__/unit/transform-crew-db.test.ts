import { describe, it, expect } from 'vitest'
import { transformF8Crew } from '../../transform/f8/db/transform-crew.js'

const rawCrew = {
  crewId: 12345,
  firstName: 'Zhang', middleName: '', lastName: 'San',
  nickName: 'Z', gender: 'Male', joinDate: '2018-06-22T00:00:00Z',
  seniorityNum: 28, telephone: '111-222', workEmail: 'z@x.com', contractType: 'Pilots',
  homeAddress: 'Road 1',
  bases: [{ base: 'PEK', effDt: '2018-06-22T00:00:00Z', expDt: '2099-12-31T00:00:00Z', isPrimary: true }],
  ranks: [{ rank: 'CA', effDt: '2020-01-01T00:00:00Z', expDt: '2099-12-31T00:00:00Z' }],
  fleets: [{ fleet: '737', effDt: '2020-01-01T00:00:00Z' }],
  certificates: [{ certificate: 'RHS', isValid: true, expDt: '2030-01-01T00:00:00Z' }],
  qualifications: [{ qualification: '737', effDt: '2020-01-01T00:00:00Z', isValid: true }],
  teams: [{ teamId: 'EQ737', teamName: 'EQ737 Team', effDt: '2021-08-01T00:00:00Z', expDt: '2055-09-16T23:59:59Z', isValid: true }],
}

describe('transformF8Crew', () => {
  it('maps main crew fields', () => {
    const r = transformF8Crew([rawCrew], 'F8')[0]
    expect(r.crewId).toBe('12345')
    expect(r.interfaceId).toBe('12345')
    expect(r.firstName).toBe('Zhang')
    expect(r.lastName).toBe('San')
    expect(r.preferredName).toBe('Z')
    expect(r.gender).toBe('M')
    expect(r.seniorityNum).toBe(28)
    expect(r.contractType).toBe('Pilots')
    expect(r.emplDt).toBe('2018-06-22T00:00:00.000Z')
    expect(r.division).toBe('P')   // CA = deck
    expect(r.filiale).toBe('F8')
  })

  it('maps sub-entities (bases/ranks/fleets/certificates/qualifications/teams)', () => {
    const r = transformF8Crew([rawCrew], 'F8')[0]
    expect(r.bases).toHaveLength(1)
    expect(r.bases[0]).toMatchObject({ base: 'PEK', isPrimary: true })
    expect(r.ranks).toHaveLength(1)
    expect(r.ranks[0].rank).toBe('CA')
    expect(r.fleets).toHaveLength(1)
    expect(r.fleets[0].fleet).toBe('737')
    expect(r.certificates).toHaveLength(1)
    expect(r.certificates[0].certificate).toBe('RHS')
    expect(r.certificates[0].effDt).toBe('1970-01-01T00:00:00.000Z') // defaulted when API omits effDt
    expect(r.qualifications).toHaveLength(1)
    expect(r.teams).toEqual([{
      team: 'EQ737',
      effDt: '2021-08-01T00:00:00.000Z',
      expDt: '2055-09-16T23:59:59.000Z',
      isValid: true,
      remarks: 'EQ737 Team',
    }])
  })

  it('derives division C for cabin ranks', () => {
    const cabin = { ...rawCrew, ranks: [{ rank: 'FA', effDt: '2020-01-01T00:00:00Z' }] }
    expect(transformF8Crew([cabin], 'F8')[0].division).toBe('C')
  })

  it('drops FO rank overlapping a CA rank', () => {
    const both = { ...rawCrew, ranks: [
      { rank: 'CA', effDt: '2020-01-01T00:00:00Z', expDt: '2099-12-31T00:00:00Z' },
      { rank: 'FO', effDt: '2021-01-01T00:00:00Z', expDt: '2099-12-31T00:00:00Z' },
    ] }
    const ranks = transformF8Crew([both], 'F8')[0].ranks
    expect(ranks.map(r => r.rank)).toEqual(['CA'])
  })

  it('normalizes legacy rank codes (CAP→CA)', () => {
    const r = transformF8Crew([{ ...rawCrew, ranks: [{ rank: 'CAP', effDt: '2020-01-01T00:00:00Z' }] }], 'F8')[0]
    expect(r.ranks[0].rank).toBe('CA')
  })

  it('skips records with missing crewId', () => {
    expect(transformF8Crew([{ ...rawCrew, crewId: '' }], 'F8')).toHaveLength(0)
  })
})
