import { TransformPlugin, StandardRecord } from '../base.js'

interface F8Flight {
  fltId: string
  fltNum?: string
  datOp: string
  depStn?: string
  arrStn?: string
  std?: string
  sta?: string
  atd?: string
  ata?: string
  acGrp?: string
  acReg?: string
}

export class F8FlightTransform implements TransformPlugin {
  toStandard(raw: unknown): StandardRecord {
    if (!raw || typeof raw !== 'object') {
      throw new Error('F8FlightTransform: invalid input')
    }
    const f = raw as F8Flight
    if (!f.fltId || !f.datOp) {
      throw new Error('F8FlightTransform: missing fltId or datOp')
    }

    // Extract date portion from datOp (ISO datetime -> yyyy-MM-dd)
    const depDate = f.datOp.slice(0, 10)

    return {
      recordType: 'flight',
      data: {
        flightNo: f.fltNum ?? f.fltId,
        depDate,
        depAirport: f.depStn,
        arrAirport: f.arrStn,
        depTime: f.std ?? f.atd,
        arrTime: f.sta ?? f.ata,
        aircraftType: f.acGrp,
        acReg: f.acReg,
      },
      metadata: { externalId: `${f.fltId}:${depDate}` },
    }
  }

  fromStandard(record: StandardRecord): unknown {
    return record.data
  }
}