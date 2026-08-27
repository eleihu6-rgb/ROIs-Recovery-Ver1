import { describe, it, expect } from 'vitest'
import { F8CrewTransform } from '../../transform/f8/crew.js'

const now = new Date()
const future = new Date(now.getTime() + 365 * 24 * 3600_000).toISOString()
const past = new Date(now.getTime() - 10_000).toISOString()

const sampleCrew = {
  owner: 'F8',
  crewId: 5510,
  firstName: 'Peter',
  middleName: '',
  lastName: 'Adams',
  gender: 'Male',
  telephone: '647-449-2247',
  workEmail: 'peter.adams@flyflair.com',
  bases: [
    { crewId: 5510, base: 'YYZ', effDt: '2018-06-22T00:00:00Z', expDt: '2055-09-16T23:59:59Z', isPrimary: true },
    { crewId: 5510, base: 'YVR', effDt: '2018-06-22T00:00:00Z', expDt: '2055-09-16T23:59:59Z', isPrimary: false },
  ],
  ranks: [
    { rank: 'CA', effDt: '2018-06-22T00:00:00Z', expDt: future },
    { rank: 'FO', effDt: '2025-11-30T00:00:00Z', expDt: '2055-12-01T23:59:59Z' },
  ],
  certificates: [
    { certificate: 'RHS', isValid: true, expDt: future },
  ],
}

describe('F8CrewTransform', () => {
  const transform = new F8CrewTransform()

  it('maps crewId to crewCode string', () => {
    const result = transform.toStandard(sampleCrew)
    expect(result.recordType).toBe('crew')
    expect(result.data.crewCode).toBe('5510')
  })

  it('sets crewName as firstName + lastName', () => {
    const result = transform.toStandard(sampleCrew)
    expect(result.data.crewName).toBe('Peter Adams')
  })

  it('picks highest effective rank (CA > FO)', () => {
    const result = transform.toStandard(sampleCrew)
    expect(result.data.rank).toBe('CA')
  })

  it('falls back to FO when CA is expired', () => {
    const crewFoOnly = {
      ...sampleCrew,
      ranks: [
        { rank: 'CA', effDt: '2018-06-22T00:00:00Z', expDt: past },
        { rank: 'FO', effDt: '2020-01-01T00:00:00Z', expDt: future },
      ],
    }
    const result = transform.toStandard(crewFoOnly)
    expect(result.data.rank).toBe('FO')
  })

  it('normalizes CAP to CA', () => {
    const crewWithCap = {
      ...sampleCrew,
      ranks: [{ rank: 'CAP', effDt: '2018-06-22T00:00:00Z', expDt: future }],
    }
    const result = transform.toStandard(crewWithCap)
    expect(result.data.rank).toBe('CA')
  })

  it('picks primary base', () => {
    const result = transform.toStandard(sampleCrew)
    expect(result.data.base).toBe('YYZ')
  })

  it('sets hasRhs true when valid RHS cert exists', () => {
    const result = transform.toStandard(sampleCrew)
    expect(result.data.hasRhs).toBe(true)
  })

  it('sets hasRhs false when RHS cert isValid=false', () => {
    const crew = { ...sampleCrew, certificates: [{ certificate: 'RHS', isValid: false, expDt: future }] }
    const result = transform.toStandard(crew)
    expect(result.data.hasRhs).toBe(false)
  })

  it('sets hasRhs false when RHS cert is expired', () => {
    const crew = { ...sampleCrew, certificates: [{ certificate: 'RHS', isValid: true, expDt: past }] }
    const result = transform.toStandard(crew)
    expect(result.data.hasRhs).toBe(false)
  })

  it('sets externalId in metadata', () => {
    const result = transform.toStandard(sampleCrew)
    expect(result.metadata?.externalId).toBe('5510')
  })

  it('throws on invalid input', () => {
    expect(() => transform.toStandard(null)).toThrow()
    expect(() => transform.toStandard({ notACrew: true })).toThrow()
  })
})

// ============== F8FlightTransform ==============

import { F8FlightTransform } from '../../transform/f8/flight.js'

const sampleFlight = {
  owner: 'F8 - Flair Airlines',
  legNo: 804,
  datOp: '2026-03-04T00:00:00Z',
  fltId: 'F8804',
  depStn: 'YVR',
  arrStn: 'YYC',
  status: 'Completed',
  std: '2026-03-04T16:50:00Z',
  sta: '2026-03-04T18:20:00Z',
  atd: '2026-03-04T16:50:00Z',
  ata: '2026-03-04T18:18:00Z',
  acGrp: '7M8',
  acReg: 'C-FLGD',
}

describe('F8FlightTransform', () => {
  const transform = new F8FlightTransform()

  it('maps fltId to flightNo', () => {
    const result = transform.toStandard(sampleFlight)
    expect(result.recordType).toBe('flight')
    expect(result.data.flightNo).toBe('F8804')
  })

  it('extracts date portion of datOp as depDate', () => {
    const result = transform.toStandard(sampleFlight)
    expect(result.data.depDate).toBe('2026-03-04')
  })

  it('maps depStn/arrStn to depAirport/arrAirport', () => {
    const result = transform.toStandard(sampleFlight)
    expect(result.data.depAirport).toBe('YVR')
    expect(result.data.arrAirport).toBe('YYC')
  })

  it('uses std as depTime and sta as arrTime', () => {
    const result = transform.toStandard(sampleFlight)
    expect(result.data.depTime).toBe('2026-03-04T16:50:00Z')
    expect(result.data.arrTime).toBe('2026-03-04T18:20:00Z')
  })

  it('maps acGrp to aircraftType and acReg to acReg', () => {
    const result = transform.toStandard(sampleFlight)
    expect(result.data.aircraftType).toBe('7M8')
    expect(result.data.acReg).toBe('C-FLGD')
  })

  it('throws on invalid input', () => {
    expect(() => transform.toStandard(null)).toThrow()
    expect(() => transform.toStandard({ noFltId: true })).toThrow()
  })
})

// ============== F8PairingTransform ==============

import { F8PairingTransform } from '../../transform/f8/pairing.js'

const samplePairing = {
  pairingId: '101198',
  pairingDt: '2026-02-23T00:00:00Z',
  label: 'YYZ/KIN/YYZ/FLL/YYZ',
  base: 'YUL',
  fleet: '737',
  durationDays: 5,
  pairingCompositions: [
    { actingRank: 'CAP', planValue: 1 },
    { actingRank: 'FO', planValue: 1 },
  ],
  pairingDutyList: [],
}

describe('F8PairingTransform', () => {
  const transform = new F8PairingTransform()

  it('maps pairingId and base fields', () => {
    const result = transform.toStandard(samplePairing)
    expect(result.recordType).toBe('pairing')
    expect(result.data.pairingId).toBe('101198')
    expect(result.data.base).toBe('YUL')
    expect(result.data.fleet).toBe('737')
    expect(result.data.durationDays).toBe(5)
  })

  it('converts pairingDt to ISO date string', () => {
    const result = transform.toStandard(samplePairing)
    expect(result.data.pairingDate).toBe('2026-02-23')
  })

  it('normalizes CAP → CA in compositions', () => {
    const result = transform.toStandard(samplePairing)
    const comps = result.data.compositions as Array<{ rank: string; planValue: number }>
    expect(comps[0].rank).toBe('CA')
    expect(comps[1].rank).toBe('FO')
  })

  it('throws on missing pairingId', () => {
    expect(() => transform.toStandard({ base: 'YYZ' })).toThrow()
  })

  it('throws on invalid input', () => {
    expect(() => transform.toStandard(null)).toThrow()
  })
})

// ============== F8RosterFlightTransform ==============

import { F8RosterFlightTransform } from '../../transform/f8/roster-flight.js'

const sampleRosterFlight = {
  rosterFlightId: 2656138,
  pairingId: 101198,
  fltId: 'F8804',
  depArp: 'YVR',
  arrArp: 'YYC',
  dutyStrUtc: '2026-06-12T17:35:00Z',
  crew: {
    crewId: '535',
    crewName: 'Alistair Camplin',
    actingRank: 'CA',
  },
}

describe('F8RosterFlightTransform', () => {
  const transform = new F8RosterFlightTransform()

  it('maps crew and flight fields to StandardRoster', () => {
    const result = transform.toStandard(sampleRosterFlight)
    expect(result.recordType).toBe('roster')
    expect(result.data.crewCode).toBe('535')
    expect(result.data.flightId).toBe('F8804')
    expect(result.data.depAirport).toBe('YVR')
    expect(result.data.arrAirport).toBe('YYC')
    expect(result.data.role).toBe('CA')
    expect(result.data.pairingId).toBe('101198')
  })

  it('extracts date from dutyStrUtc as rosterDate', () => {
    const result = transform.toStandard(sampleRosterFlight)
    expect(result.data.rosterDate).toBe('2026-06-12')
  })

  it('throws when pairingId is 0 (SIM/DHD — must be filtered out)', () => {
    const simRecord = { ...sampleRosterFlight, pairingId: 0 }
    expect(() => transform.toStandard(simRecord)).toThrow('SIM/DHD record')
  })

  it('normalizes CAP actingRank to CA', () => {
    const record = { ...sampleRosterFlight, crew: { ...sampleRosterFlight.crew, actingRank: 'CAP' } }
    const result = transform.toStandard(record)
    expect(result.data.role).toBe('CA')
  })

  it('throws on invalid input', () => {
    expect(() => transform.toStandard(null)).toThrow()
  })
})

// ============== Registration ==============

import { registerF8Transforms } from '../../transform/f8/index.js'
import { getTransform, listTransforms } from '../../transform/index.js'

describe('registerF8Transforms', () => {
  it('registers all 4 F8 transform plugins', () => {
    registerF8Transforms()
    const transforms = listTransforms()
    expect(transforms).toContain('f8/crew')
    expect(transforms).toContain('f8/flight')
    expect(transforms).toContain('f8/pairing')
    expect(transforms).toContain('f8/roster-flight')
  })

  it('getTransform returns F8CrewTransform for f8/crew', () => {
    registerF8Transforms()
    const t = getTransform('f8/crew')
    expect(t).toBeInstanceOf(F8CrewTransform)
  })
})