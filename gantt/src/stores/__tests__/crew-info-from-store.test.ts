import { describe, it, expect, vi, beforeEach } from 'vitest'
import { crewInfoFromStore } from '../crew-store'
import { useCrewStore } from '../crew-store'
import { crewApi } from '@/services/crew-api'
import { api } from '@/services/api'

const baseCrew = {
  id: 1,
  crewId: 'C001',
  firstName: 'A',
  middleName: null,
  lastName: 'B',
  preferredName: null,
  gender: 'F',
  division: 'P',
  filiale: 'F8',
  status: 0,
  remarks: null,
  seniorityNum: '100',
}

const fullHistory = {
  ranks: [{ id: 1, crewId: 'C001', rank: 'CA', effDt: '2026-01-01', expDt: null }],
  bases: [{ id: 1, crewId: 'C001', base: 'YOW', effDt: '2026-01-01', expDt: null }],
  fleets: [{ id: 1, crewId: 'C001', fleetSpecific: '320', effDt: '2026-01-01', expDt: null }],
  qualifications: [{ id: 1, crewId: 'C001', qualification: 'IFR', effDt: '2026-01-01', renewedDt: null, expDt: null, fleetSpecific: null, acType: null, rank: null, position: null, isValid: 1, remarks: null, interfaceCrewQualId: null, airport: null, interfaceQualificationId: null, remarkDetails: null, bases: null, ranks: null, fleets: null, teams: null, nextPlannedDate: null, displayFlag: 1, status: null, interfaceCrewRecurrentId: null, projectDate: null, recordStatus: null, baseMonth: null }],
  certifications: [{ id: 1, crewId: 'C001', certificate: 'TR', certificateNo: 'TR-1', effDt: '2026-01-01', invalidDt: null, expDt: null, tmpIssueCountry: null, tmpIssueAuthority: null, referenceNo: null, referenceId: null, isValid: 1, remarks: null, interfaceCrewCertId: null, interfaceCertId: null, firstName: null, middleName: null, lastName: null, isPrimary: null, nationality: null, surname: null, titleName: null, givenName: null }],
  teams: [{ id: 1, crewId: 'C001', team: 'YOW-A', effDt: '2026-01-01', expDt: null, isValid: 1, remarks: null, source: null, teamTaskId: null }],
}

describe('crewInfoFromStore', () => {
  beforeEach(() => {
    useCrewStore.setState({ items: [] })
    vi.restoreAllMocks()
  })

  it('reads all six history arrays from store without backend calls', async () => {
    useCrewStore.setState({
      items: [{
        crew: { ...baseCrew, ...fullHistory },
        sessionTags: [],
      }],
    })
    const getInfoSpy = vi.spyOn(crewApi, 'getInfo').mockResolvedValue({} as never)
    const listSpy = vi.spyOn(crewApi, 'list').mockRejectedValue(new Error('unexpected list'))
    const getSpy = vi.spyOn(api, 'get').mockImplementation(() => Promise.reject(new Error('unexpected GET')))

    const info = await crewInfoFromStore('C001')

    expect(info.crew.crewId).toBe('C001')
    expect(info.ranks).toHaveLength(1)
    expect(info.ranks[0].rank).toBe('CA')
    expect(info.bases[0].base).toBe('YOW')
    expect(info.fleets[0].fleetSpecific).toBe('320')
    expect(info.qualifications).toHaveLength(1)
    expect(info.qualifications[0].qualification).toBe('IFR')
    expect(info.certifications).toHaveLength(1)
    expect(info.certifications[0].certificate).toBe('TR')
    expect(info.teams).toHaveLength(1)
    expect(info.teams[0].team).toBe('YOW-A')
    expect(getInfoSpy).not.toHaveBeenCalled()
    expect(listSpy).not.toHaveBeenCalled()
    expect(getSpy).not.toHaveBeenCalled()
  })

  it('uses one full crew list request when crew is slim in store', async () => {
    useCrewStore.setState({
      items: [{ crew: { ...baseCrew, crewId: 'C002' }, sessionTags: [] }],
    })
    const listSpy = vi.spyOn(crewApi, 'list').mockResolvedValue({
      items: [{ ...baseCrew, crewId: 'C002', ...fullHistory }],
      total: 1,
    })
    const getInfoSpy = vi.spyOn(crewApi, 'getInfo')

    const info = await crewInfoFromStore('C002')

    expect(info.ranks).toHaveLength(1)
    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ crewIds: ['C002'], page: 1, pageSize: 1 }))
    expect(getInfoSpy).not.toHaveBeenCalled()
  })

  it('falls back to one full crew list request when crew not in store', async () => {
    const listSpy = vi.spyOn(crewApi, 'list').mockResolvedValue({
      items: [{ ...baseCrew, ...fullHistory }],
      total: 1,
    })
    const getInfoSpy = vi.spyOn(crewApi, 'getInfo')
    const getSpy = vi.spyOn(api, 'get')

    const info = await crewInfoFromStore('NOT_IN_STORE')

    expect(info.crew.crewId).toBe('C001')
    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ crewIds: ['NOT_IN_STORE'] }))
    expect(getInfoSpy).not.toHaveBeenCalled()
    expect(getSpy).not.toHaveBeenCalled()
  })
})
