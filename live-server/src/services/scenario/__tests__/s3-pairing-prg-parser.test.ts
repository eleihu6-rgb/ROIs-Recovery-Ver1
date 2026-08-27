import { describe, expect, it } from 'vitest'
import {
  parseS3PairingPrg,
  parseS3PairingPrgRecords,
  parseCrewPlanPositions,
  toUtcFromYmdMinutes,
} from '../s3-pairing-prg-parser.js'

const FIRST_T4101 = [
  '1T4101 202601312026013120260228NNNNNYN000000000000000000000000000000002026013103652026013110202648 0425001D  655 CA01FO01                        060010520000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000 0000000000000520000000000520052000000000000000000000                06550000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000D',
  '2T4101 202601312648 20260131YYZ202601310425MBJ202601310690010  D0265000002650000102-0300-03007M8D',
  '2T4101 202601312649 20260131MBJ202601310750YYZ202601311005020 PD0255000002550000102-0300-03007M8D',
  '3T4101 202601310250001202601310365202601311020D065500000                                                      000005200000000005200520D0000D000000000',
].join('\n')

const O4101_WITH_OFFLINE_SEGMENT = [
  '1O4101 202602012026020120260201NNNNNNY000000000000000000000000000000002026020108452026020409450160 0905004D 4420 CA01FO01                        060010000051505150300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000D0203000000001330003700371570157000000000000000000000                01350635063505550000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000D',
  '4O4101 20260201010PD  160 20260201YOW202602010905YYZ20260201098000380038D-0300-0300PD D',
  '3O4101 202602010150001202602010845202602010980D0135  845YYZ NO HOTEL ON FILE                                  020300000037003702400240D0000D  9050000',
  '2O4101 202602012610 20260202YYZ202602020445CUN202602020715020  D0270000002700000102-0300-03007M8D',
].join('\n')


const makePrgLine = (recordType: string, fields: Array<[number, number, string]>): string => {
  const chars = Array.from(' '.repeat(160))
  chars[0] = recordType
  for (const [start, end, value] of fields) {
    const width = end - start + 1
    const padded = value.padEnd(width, ' ').slice(0, width)
    for (let i = 0; i < width; i += 1) chars[start - 1 + i] = padded[i]
  }
  return chars.join('').trimEnd()
}

const MULTI_DUTY_PRG = [
  makePrgLine('1', [
    [2, 7, 'M4101'], [8, 15, '20260210'], [71, 78, '20260210'], [79, 82, '0360'],
    [83, 90, '20260212'], [91, 94, '1200'], [104, 106, '003'], [108, 112, '3240'],
    [114, 145, 'CA01FO01'], [146, 149, '0720'],
  ]),
  makePrgLine('2', [[2, 7, 'M4101'], [8, 15, '20260210'], [16, 20, '1001'], [21, 28, '20260210'], [29, 31, 'YYZ'], [32, 39, '20260210'], [40, 43, '0420'], [44, 46, 'YVR'], [47, 54, '20260210'], [55, 58, '0600'], [59, 61, '010'], [94, 96, '7M8']]),
  makePrgLine('2', [[2, 7, 'M4101'], [8, 15, '20260210'], [16, 20, '1002'], [21, 28, '20260211'], [29, 31, 'YVR'], [32, 39, '20260211'], [40, 43, '0480'], [44, 46, 'YYC'], [47, 54, '20260211'], [55, 58, '0600'], [59, 61, '020'], [94, 96, '7M8']]),
  makePrgLine('2', [[2, 7, 'M4101'], [8, 15, '20260210'], [16, 20, '1003'], [21, 28, '20260212'], [29, 31, 'YYC'], [32, 39, '20260212'], [40, 43, '0420'], [44, 46, 'YEG'], [47, 54, '20260212'], [55, 58, '0480'], [59, 61, '030'], [94, 96, '7M8']]),
  makePrgLine('2', [[2, 7, 'M4101'], [8, 15, '20260210'], [16, 20, '1004'], [21, 28, '20260212'], [29, 31, 'YEG'], [32, 39, '20260212'], [40, 43, '0520'], [44, 46, 'YVR'], [47, 54, '20260212'], [55, 58, '0580'], [59, 61, '040'], [94, 96, '7M8']]),
  makePrgLine('2', [[2, 7, 'M4101'], [8, 15, '20260210'], [16, 20, '1005'], [21, 28, '20260212'], [29, 31, 'YVR'], [32, 39, '20260212'], [40, 43, '0620'], [44, 46, 'YYZ'], [47, 54, '20260212'], [55, 58, '0720'], [59, 61, '050'], [94, 96, '7M8']]),
  makePrgLine('3', [[2, 7, 'M4101'], [8, 15, '20260210'], [16, 18, '010'], [19, 22, '0010'], [23, 30, '20260210'], [31, 34, '0360'], [35, 42, '20260210'], [43, 46, '0630'], [48, 51, '0270'], [127, 130, '0180']]),
  makePrgLine('3', [[2, 7, 'M4101'], [8, 15, '20260210'], [16, 18, '020'], [19, 22, '0020'], [23, 30, '20260211'], [31, 34, '0450'], [35, 42, '20260211'], [43, 46, '0630'], [48, 51, '0180'], [127, 130, '0120']]),
  makePrgLine('3', [[2, 7, 'M4101'], [8, 15, '20260210'], [16, 18, '030'], [19, 22, '0030'], [23, 30, '20260212'], [31, 34, '0390'], [35, 42, '20260212'], [43, 46, '0750'], [48, 51, '0360'], [127, 130, '0300']]),
].join('\n')

const CABIN_PRG = [
  makePrgLine('1', [
    [2, 7, 'C4109'], [8, 15, '20260210'], [71, 78, '20260210'], [79, 82, '0360'],
    [83, 90, '20260210'], [91, 94, '0600'], [104, 106, '001'], [108, 112, '0240'],
    [114, 145, 'IFD1D1'], [146, 149, '0600'],
  ]),
  makePrgLine('2', [
    [2, 7, 'C4109'], [8, 15, '20260210'], [16, 20, '1001'], [21, 28, '20260210'],
    [29, 31, 'YYZ'], [32, 39, '20260210'], [40, 43, '0420'], [44, 46, 'YVR'],
    [47, 54, '20260210'], [55, 58, '0600'], [59, 61, '010'], [94, 96, '7M8'],
  ]),
].join('\n')

const C4108_WITH_LIMO_SEGMENT = [
  '1C4108 202602032026020320260203NYNNNNN000000000000000000000000000000002026020305552026020605700524 0615003D 4335 CA01FO01                        060010225057000000250000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000D0090000002401045000000001375137500000000000000000000                04200765000004150000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000D',
  '2C4108 202602030524 20260203YYC202602030615YKF202602030960010  D0225000002250000102-0420-03007M8D',
  '4C4108 20260203020   LIMO 20260203YKF202602030990YYZ20260203108000450045D-0300-0300   D',
  '3C4108 202602030250001202602030555202602031095D0420  915YYZ NO HOTEL ON FILE                                  004502250000000002700270D0000D 10950000',
].join('\n')

describe('s3 pairing PRG parser', () => {
  it('parses CrewPlan position slots into composition plans', () => {
    expect(parseCrewPlanPositions('CA01FO01                        ')).toEqual([
      { rank: 'CA', plan: 1 },
      { rank: 'FO', plan: 1 },
    ])
    expect(parseCrewPlanPositions('IFD1D1')).toEqual([
      { rank: 'IFD', plan: 1 },
      { rank: 'D', plan: 1 },
    ])
    expect(parseCrewPlanPositions('IFD1FA03')).toEqual([
      { rank: 'IFD', plan: 1 },
      { rank: 'FA', plan: 3 },
    ])
  })

  it('converts YYYYMMDD plus minutes since midnight into UTC ISO', () => {
    expect(toUtcFromYmdMinutes('20260131', '0425')).toBe('2026-01-31T07:05:00.000Z')
  })

  it('parses the first T4101 pairing group from the sample PRG', () => {
    const parsed = parseS3PairingPrg(FIRST_T4101)

    expect(parsed.warnings).toEqual([])
    expect(parsed.pairings).toHaveLength(1)
    expect(parsed.pairings[0]).toMatchObject({
      logicalKey: 'T4101:20260131',
      pairingLabel: 'T4101',
      pairingDate: '2026-01-31',
      base: 'YYZ',
      division: 'P',
      fleet: '7M8',
      assignmentGroup: 'FLY',
      assignment: 'FLY',
      durationDays: 1,
      tafb: 1,
      dutyCount: 1,
      segCount: 2,
    })
    expect(parsed.pairings[0].compositions).toEqual([
      { rank: 'CA', plan: 1 },
      { rank: 'FO', plan: 1 },
    ])
    expect(parsed.pairings[0].segments).toHaveLength(2)
    expect(parsed.pairings[0].segments[0]).toMatchObject({
      dutySeq: 1,
      segSeq: 1,
      fltNum: '2648',
      depArp: 'YYZ',
      arvArp: 'MBJ',
      schStrDtUtc: '2026-01-31T07:05:00.000Z',
      schEndDtUtc: '2026-01-31T11:30:00.000Z',
    })
    expect(parsed.pairings[0].segments[1]).toMatchObject({
      dutySeq: 1,
      segSeq: 2,
      fltNum: '2649',
      depArp: 'MBJ',
      arvArp: 'YYZ',
      schStrDtUtc: '2026-01-31T12:30:00.000Z',
      schEndDtUtc: '2026-01-31T16:45:00.000Z',
    })
  })

  it('parses type 4 offline segment records without rejecting the PRG file', () => {
    const parsed = parseS3PairingPrg(O4101_WITH_OFFLINE_SEGMENT)

    expect(parsed.pairings).toHaveLength(1)
    expect(parsed.pairings[0]).toMatchObject({
      logicalKey: 'O4101:20260201',
      base: 'YOW',
      segCount: 2,
    })
    expect(parsed.pairings[0].segments[0]).toMatchObject({
      dutySeq: 1,
      segSeq: 1,
      airline: 'PD',
      fltNum: '160',
      depArp: 'YOW',
      arvArp: 'YYZ',
      schStrDtUtc: '2026-02-01T15:05:00.000Z',
      schEndDtUtc: '2026-02-01T16:20:00.000Z',
      segAssignment: 'PD',
      fleet: 'GRD',
    })
  })

  it('keeps LIMO type 4 ground transport out of the airline code field', () => {
    const parsed = parseS3PairingPrg(C4108_WITH_LIMO_SEGMENT)

    expect(parsed.pairings).toHaveLength(1)
    expect(parsed.pairings[0].segments[1]).toMatchObject({
      airline: 'F8',
      fltNum: 'LIMO',
      depArp: 'YKF',
      arvArp: 'YYZ',
      segAssignment: 'LIMO',
      fleet: 'GRD',
    })
  })


  it('extracts structured staging records for PRG types 1, 2, 3, and 4', () => {
    const parsed = parseS3PairingPrgRecords([FIRST_T4101, C4108_WITH_LIMO_SEGMENT].join('\n'))

    expect(parsed.pairings[0]).toMatchObject({
      recordType: '1',
      pairingNumber: 'T4101',
      pairingDate: '20260131',
      reportDate: '20260131',
      reportMinutes: 365,
      pairingEndDate: '20260131',
      pairingEndMinutes: 1020,
      restRequiredAfterPairingMinutes: 600,
      rawLineNo: 1,
    })
    expect(parsed.onlineSegments[0]).toMatchObject({
      recordType: '2',
      pairingNumber: 'T4101',
      pairingDate: '20260131',
      flightNumber: '2648',
      pairingSequenceNumber: 10,
      departureAirport: 'YYZ',
      arrivalAirport: 'MBJ',
      equipmentType: '7M8',
      rawLineNo: 2,
    })
    expect(parsed.duties[0]).toMatchObject({
      recordType: '3',
      pairingNumber: 'T4101',
      pairingDate: '20260131',
      pairingSequenceNumber: 25,
      dutyPeriodNumber: 1,
      dutyStartDate: '20260131',
      dutyStartMinutes: 365,
      dutyEndDate: '20260131',
      dutyEndMinutes: 1020,
      totalDutyCreditMinutes: 520,
      rawLineNo: 4,
    })
    expect(parsed.offlineSegments[0]).toMatchObject({
      recordType: '4',
      pairingNumber: 'C4108',
      pairingDate: '20260203',
      pairingSequenceNumber: 20,
      carrier: 'L',
      transportCode: 'IMO',
      departureAirport: 'YKF',
      arrivalAirport: 'YYZ',
      rawLineNo: 7,
    })
  })

  it('assigns segments to duties using type 3 duty windows', () => {
    const parsed = parseS3PairingPrg(MULTI_DUTY_PRG)

    expect(parsed.warnings).toEqual([])
    expect(parsed.pairings[0].segments.map((segment) => segment.dutySeq)).toEqual([1, 2, 3, 3, 3])
    expect([...parsed.pairings[0].duties.keys()]).toEqual([1, 2, 3])
    expect(parsed.pairings[0].duties.get(3)).toMatchObject({
      dutySchStrDtUtc: '2026-02-12T06:30:00.000Z',
      dutySchEndDtUtc: '2026-02-12T12:30:00.000Z',
      dutyStrArp: 'YYC',
      dutyEndArp: 'YYZ',
    })
  })

  it('detects Cabin division from three-character and short Cabin ranks', () => {
    const parsed = parseS3PairingPrg(CABIN_PRG)

    expect(parsed.pairings[0]).toMatchObject({
      division: 'C',
      restAfterPairingMinutes: 600,
      compositions: [
        { rank: 'IFD', plan: 1 },
        { rank: 'D', plan: 1 },
      ],
    })
  })
  it('rejects unsupported offline and non-flying record types', () => {
    expect(() => parseS3PairingPrg('5T4101 20260131\n')).toThrow('Unsupported PRG record type 5')
  })

  it('rejects orphan segment rows', () => {
    expect(() => parseS3PairingPrg('2T4101 202601312648 20260131YYZ202601310425MBJ202601310690010  D0265000002650000102-0300-03007M8D')).toThrow('Segment row has no matching pairing master')
  })
})
