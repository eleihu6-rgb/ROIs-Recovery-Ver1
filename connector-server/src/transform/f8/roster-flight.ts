import { TransformPlugin, StandardRecord } from '../base.js'
import { normalizeRank } from './utils.js'

interface F8RosterFlightCrew {
  crewId: string
  crewName?: string
  actingRank?: string
}

interface F8RosterFlight {
  rosterFlightId: number
  pairingId: number
  fltId?: string
  depArp?: string
  arrArp?: string
  dutyStrUtc?: string
  crew: F8RosterFlightCrew
}

export class F8RosterFlightTransform implements TransformPlugin {
  toStandard(raw: unknown): StandardRecord {
    if (!raw || typeof raw !== 'object') {
      throw new Error('F8RosterFlightTransform: invalid input')
    }
    const r = raw as F8RosterFlight
    if (!r.crew?.crewId) {
      throw new Error('F8RosterFlightTransform: missing crew.crewId')
    }

    // pairingId === 0 means SIM/DHD — must not be scheduled
    if (r.pairingId === 0) {
      throw new Error('SIM/DHD record: pairingId=0, skip this record')
    }

    const rosterDate = r.dutyStrUtc?.slice(0, 10) ?? ''

    return {
      recordType: 'roster',
      data: {
        crewCode: String(r.crew.crewId),
        rosterDate,
        dutyType: 'FLT',
        pairingId: String(r.pairingId),
        flightId: r.fltId,
        depTime: r.dutyStrUtc,
        depAirport: r.depArp,
        arrAirport: r.arrArp,
        role: normalizeRank(r.crew.actingRank ?? ''),
      },
      metadata: { externalId: String(r.rosterFlightId) },
    }
  }

  fromStandard(record: StandardRecord): unknown {
    return record.data
  }
}