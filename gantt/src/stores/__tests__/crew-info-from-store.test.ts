import { describe, it, expect, vi } from 'vitest'
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

describe('crewInfoFromStore', () => {
  it('reads ranks/bases/fleets from store, fetches qual/cert/team from backend', async () => {
    useCrewStore.setState({
      items: [{
        crew: {
          ...baseCrew,
          ranks: [{ id: 1, crewId: 'C001', rank: 'CA', effDt: '2026-01-01', expDt: null }],
          bases: [{ id: 1, crewId: 'C001', base: 'YOW', effDt: '2026-01-01', expDt: null }],
          fleets: [{ id: 1, crewId: 'C001', fleetSpecific: '320', effDt: '2026-01-01', expDt: null }],
          qualifications: [{ id: 1, crewId: 'C001', qualification: 'IFR', effDt: '2026-01-01', renewedDt: null, expDt: null, fleetSpecific: null, acType: null, rank: null, position: null, isValid: 1, remarks: null, interfaceCrewQualId: null, airport: null, interfaceQualificationId: null, remarkDetails: null, bases: null, ranks: null, fleets: null, teams: null, nextPlannedDate: null, displayFlag: 1, status: null, interfaceCrewRecurrentId: null, projectDate: null, recordStatus: null, baseMonth: null }],
          certifications: [{ id: 1, crewId: 'C001', certificate: 'TR', certificateNo: 'TR-1', effDt: '2026-01-01', invalidDt: null, expDt: null, tmpIssueCountry: null, tmpIssueAuthority: null, referenceNo: null, referenceId: null, isValid: 1, remarks: null, interfaceCrewCertId: null, interfaceCertId: null, firstName: null, middleName: null, lastName: null, isPrimary: null, nationality: null, surname: null, titleName: null, givenName: null }],
          teams: [{ id: 1, crewId: 'C001', team: 'YOW-A', effDt: '2026-01-01', expDt: null, isValid: 1, remarks: null, source: null, teamTaskId: null }],
        },
        sessionTags: [],
      }],
    })
    const getInfoSpy = vi.spyOn(crewApi, 'getInfo').mockResolvedValue({} as never)
    // No backend history GETs should fire — everything is read from the store.
    const getSpy = vi.spyOn(api, 'get').mockImplementation(() => Promise.reject(new Error('unexpected GET')))

    const info = await crewInfoFromStore('C001')

    expect(info.crew.crewId).toBe('C001')
    expect(info.ranks).toHaveLength(1)
    expect(info.ranks[0].rank).toBe('CA')
    expect(info.bases[0].base).toBe('YOW')
    expect(info.fleets[0].fleetSpecific).toBe('320')
    // qual/cert/team come from the inlined store data, not the backend.
    expect(info.qualifications).toHaveLength(1)
    expect(info.qualifications[0].qualification).toBe('IFR')
    expect(info.certifications).toHaveLength(1)
    expect(info.certifications[0].certificate).toBe('TR')
    expect(info.teams).toHaveLength(1)
    expect(info.teams[0].team).toBe('YOW-A')
    expect(getInfoSpy).not.toHaveBeenCalled()
    expect(getSpy).not.toHaveBeenCalled()
  })

  it('falls back to crewApi.getInfo when crew not in store', async () => {
    useCrewStore.setState({ items: [] })
    const full: never = {
      crew: baseCrew,
      ranks: [],
      bases: [],
      fleets: [],
      qualifications: [],
      certifications: [],
      teams: [],
    } as never
    const getInfoSpy = vi.spyOn(crewApi, 'getInfo').mockResolvedValue(full)
    const getSpy = vi.spyOn(api, 'get')

    const info = await crewInfoFromStore('NOT_IN_STORE')

    expect(info.crew.crewId).toBe('C001')
    expect(getInfoSpy).toHaveBeenCalledWith('NOT_IN_STORE')
    // No individual qual/cert/team GETs on the fallback path.
    expect(getSpy).not.toHaveBeenCalled()
  })
})
