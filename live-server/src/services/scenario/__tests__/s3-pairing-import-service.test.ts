import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    FILIALE: 'F8',
    LIVE_SCHEMA: 'f8',
    SCENARIO_SCHEMA: 'scenario',
    PBS_SCHEMA: 'f8_pbs',
    SCENARIO_GANTT_SOURCE: 'db',
  },
}))

vi.mock('../scenario-service.js', () => ({
  scenarioService: {
    create: vi.fn(async () => ({ id: 900, name: 'S3 Pairing sample', fileType: 'PO' })),
    getById: vi.fn(async (_fastify: unknown, id: number) => ({
      id,
      name: 'PO Target',
      fileType: 'PO',
      division: 'P',
    })),
  },
}))

vi.mock('../../../utils/cache.js', () => ({
  invalidate: vi.fn(async () => undefined),
  invalidatePattern: vi.fn(async () => undefined),
}))

import { scenarioService } from '../scenario-service.js'
import { importS3PairingPrg } from '../s3-pairing-import-service.js'

const makePrgLine = (recordType: string, fields: Array<[number, number, string]>): string => {
  const chars = Array.from({ length: 160 }, () => ' ')
  chars[0] = recordType
  for (const [start, end, value] of fields) {
    const width = end - start + 1
    const padded = value.padEnd(width, ' ').slice(0, width)
    for (let index = 0; index < width; index += 1) {
      chars[start - 1 + index] = padded[index]
    }
  }
  return chars.join('').trimEnd()
}

const MULTI_DUTY_PRG = [
  makePrgLine('1', [
    [2, 7, 'M4101'], [8, 15, '20260210'], [16, 23, '20260210'], [24, 31, '20260212'],
    [71, 78, '20260210'], [79, 82, '0360'], [83, 90, '20260212'], [91, 94, '0780'],
    [104, 106, '003'], [108, 112, '2880'], [114, 145, 'CA01FO01'], [146, 149, '0600'],
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
const PRG_WITH_OFFLINE_SEGMENT = [
  '1C4108 202602032026020320260203NYNNNNN000000000000000000000000000000002026020305552026020605700524 0615003D 4335 CA01FO01                        060010225057000000250000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000D0090000002401045000000001375137500000000000000000000                04200765000004150000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000D',
  '2C4108 202602030524 20260203YYC202602030615YKF202602030960010  D0225000002250000102-0420-03007M8D',
  '4C4108 20260203020   LIMO 20260203YKF202602030990YYZ20260203108000450045D-0300-0300   D',
  '3C4108 202602030250001202602030555202602031095D0420  915YYZ NO HOTEL ON FILE                                  004502250000000002700270D0000D 10950000',
].join('\n')
const PRG = [
  '1T4101 202601312026013120260228NNNNNYN000000000000000000000000000000002026013103652026013110202648 0425001D  655 CA01FO01                        060010520000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000 0000000000000520000000000520052000000000000000000000                06550000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000D',
  '2T4101 202601312648 20260131YYZ202601310425MBJ202601310690010  D0265000002650000102-0300-03007M8D',
  '2T4101 202601312649 20260131MBJ202601310750YYZ202601311005020 PD0255000002550000102-0300-03007M8D',
  '3T4101 202601310250001202601310365202601311020D065500000                                                      000005200000000005200520D0000D000000000',
].join('\n')
const CABIN_PRG = PRG.replace('CA01FO01', 'IFD1D1  ')

const buildFastify = () => {
  const calls: string[] = []
  let nextId = 776
  const client = {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      calls.push(`${text.trim().replaceAll('"scenario".', 'scenario.')} :: ${JSON.stringify(values ?? [])}`)
      if (text.includes('select input.logical_key, inserted.id')) {
        const rows = JSON.parse(String(values?.[0] ?? '[]')) as Array<{ logical_key: string }>
        return { rows: rows.map((row) => ({ logical_key: row.logical_key, id: ++nextId })) }
      }
      if (text.includes('join input on input.interface_flt_id = inserted.interface_flt_id')) {
        const rows = JSON.parse(String(values?.[0] ?? '[]')) as Array<{ segment_key: string }>
        return { rows: rows.map((row) => ({ segment_key: row.segment_key, id: ++nextId })) }
      }
      if (text.includes('returning id')) {
        nextId += 1
        return { rows: [{ id: nextId }] }
      }
      return { rows: [] }
    }),
    release: vi.fn(),
  }
  const fastify = {
    pgPool: {
      connect: vi.fn(async () => client),
    },
    db: {},
    redis: {},
    log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  } as never
  return { fastify, calls, client }
}

describe('s3 pairing import service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a new PO scenario before importing when targetMode is new', async () => {
    const { fastify } = buildFastify()

    const result = await importS3PairingPrg(fastify, {
      fileName: 'sample.PRG',
      fileText: PRG,
      targetMode: 'new',
      clearBeforeImport: false,
      newScenario: {
        name: 'S3 Pairing sample',
        strDtLoc: '2026-01-31',
        endDtLoc: '2026-02-28',
        division: 'P',
      },
      username: 'kevin',
    })

    expect(scenarioService.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'S3 Pairing sample',
        fileType: 'PO',
        strDtLoc: '2026-01-31',
        endDtLoc: '2026-02-28',
        division: 'P',
        filterParams: {
          bases: [],
          flightNos: [],
          depAirports: [],
          arrAirports: [],
          fleets: [],
          flightStatus: 'ALL',
        },
      }),
      'kevin',
    )
    expect(result).toMatchObject({
      scenarioId: 900,
      createdScenario: true,
      importedPairings: 1,
      importedSegments: 2,
      importedCompositions: 2,
    })
  })

  it('derives a new scenario Cabin division from the PRG ranks', async () => {
    const { fastify } = buildFastify()

    await importS3PairingPrg(fastify, {
      fileName: 'cabin.PRG',
      fileText: CABIN_PRG,
      targetMode: 'new',
      clearBeforeImport: false,
      newScenario: {
        name: 'Cabin import',
        strDtLoc: '2026-01-31',
        endDtLoc: '2026-02-28',
        division: 'P',
      },
      username: 'kevin',
    })

    expect(scenarioService.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        division: 'C',
        filterParams: expect.objectContaining({ bases: [] }),
      }),
      'kevin',
    )
  })

  it('does not require a base for a new scenario import', async () => {
    const { fastify } = buildFastify()

    const result = await importS3PairingPrg(fastify, {
      fileName: 'sample.PRG',
      fileText: PRG,
      targetMode: 'new',
      clearBeforeImport: false,
      newScenario: {
        name: 'All bases import',
        strDtLoc: '2026-01-31',
        endDtLoc: '2026-02-28',
        division: 'P',
      },
      username: 'kevin',
    })

    expect(result.createdScenario).toBe(true)
    expect(scenarioService.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filterParams: expect.objectContaining({ bases: [] }),
      }),
      'kevin',
    )
  })

  it('rejects a Cabin file when the selected PO scenario is Pilot', async () => {
    vi.mocked(scenarioService.getById).mockResolvedValueOnce({
      id: 800,
      name: 'Pilot Target',
      fileType: 'PO',
      division: 'P',
    } as never)
    const { fastify, client } = buildFastify()

    await expect(importS3PairingPrg(fastify, {
      fileName: 'cabin.PRG',
      fileText: CABIN_PRG,
      targetMode: 'existing',
      targetScenarioId: 800,
      clearBeforeImport: false,
      username: 'kevin',
    })).rejects.toThrow('Select a Cabin PO scenario')

    expect(client.query).not.toHaveBeenCalled()
  })

  it('clears existing scenario pairing tables in dependency order', async () => {
    const { fastify, calls } = buildFastify()

    await importS3PairingPrg(fastify, {
      fileName: 'sample.PRG',
      fileText: PRG,
      targetMode: 'existing',
      targetScenarioId: 800,
      clearBeforeImport: true,
      username: 'kevin',
    })

    const clearCalls = calls.filter((call) => call.startsWith('delete from scenario.'))
    expect(clearCalls[0]).toContain('delete from scenario.pairing_composition')
    expect(clearCalls[1]).toContain('delete from scenario.pairing_segment')
    expect(clearCalls[2]).toContain('delete from scenario.pairing')
    expect(clearCalls[3]).toContain('delete from scenario.flight')
  })

  it('writes flights before pairing segments so segment flt_id FK is valid', async () => {
    const { fastify, calls } = buildFastify()

    await importS3PairingPrg(fastify, {
      fileName: 'sample.PRG',
      fileText: PRG,
      targetMode: 'existing',
      targetScenarioId: 800,
      clearBeforeImport: false,
      username: 'kevin',
    })

    const firstFlight = calls.findIndex((call) => call.includes('insert into scenario.flight'))
    const firstSegment = calls.findIndex((call) => call.includes('insert into scenario.pairing_segment'))
    expect(firstFlight).toBeGreaterThan(-1)
    expect(firstSegment).toBeGreaterThan(firstFlight)
  })

  it('uses batched inserts to avoid remote DB round trips per PRG row', async () => {
    const { fastify, calls } = buildFastify()

    await importS3PairingPrg(fastify, {
      fileName: 'sample.PRG',
      fileText: PRG,
      targetMode: 'existing',
      targetScenarioId: 800,
      clearBeforeImport: false,
      username: 'kevin',
    })

    const businessInsertCalls = calls.filter((call) => call.includes('insert into scenario.') && !call.includes('insert into scenario.s3_prg_'))
    const stagingInsertCalls = calls.filter((call) => call.includes('insert into scenario.s3_prg_'))
    expect(businessInsertCalls).toHaveLength(4)
    expect(stagingInsertCalls).toHaveLength(4)
  })

  it('keeps generated flight identifiers within scenario.flight schema limits', async () => {
    const { fastify, calls } = buildFastify()

    await importS3PairingPrg(fastify, {
      fileName: 'sample.PRG',
      fileText: PRG,
      targetMode: 'existing',
      targetScenarioId: 800,
      clearBeforeImport: false,
      username: 'kevin',
    })

    const flightCall = calls.find((call) => call.includes('insert into scenario.flight'))
    expect(flightCall).toBeDefined()
    const payload = flightCall?.match(/:: (.+)$/)?.[1]
    const values = JSON.parse(payload ?? '[]') as [string]
    const rows = JSON.parse(values[0]) as Array<{ interface_flt_id: string; flight_key: string; segment_key: string }>

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.segment_key.length > 40)).toBe(true)
    expect(rows.every((row) => row.interface_flt_id.length <= 40)).toBe(true)
    expect(rows.every((row) => row.flight_key.length <= 30)).toBe(true)
  })

  it('maps pickup, brief, debrief, and dropoff node times from pairing, duty, and segment boundaries', async () => {
    const { fastify, calls } = buildFastify()

    await importS3PairingPrg(fastify, {
      fileName: 'sample.PRG',
      fileText: PRG,
      targetMode: 'existing',
      targetScenarioId: 800,
      clearBeforeImport: false,
      username: 'kevin',
    })

    const segmentCall = calls.find((call) => call.includes('insert into scenario.pairing_segment'))
    expect(segmentCall).toBeDefined()
    const payload = segmentCall?.match(/:: (.+)$/)?.[1]
    const values = JSON.parse(payload ?? '[]') as [string]
    const rows = JSON.parse(values[0]) as Array<{
      pickup_start_utc: string
      pickup_end_utc: string
      brief_start_utc: string
      brief_end_utc: string
      debrief_start_utc: string
      debrief_end_utc: string
      dropoff_start_utc: string
      dropoff_end_utc: string
    }>

    expect(rows.length).toBe(2)
    expect(rows[0]).toMatchObject({
      pickup_start_utc: '2026-01-31T06:05:00.000Z',
      pickup_end_utc: '2026-01-31T06:05:00.000Z',
      brief_start_utc: '2026-01-31T06:05:00.000Z',
      brief_end_utc: '2026-01-31T07:05:00.000Z',
      debrief_start_utc: '2026-01-31T16:45:00.000Z',
      debrief_end_utc: '2026-01-31T17:00:00.000Z',
      dropoff_start_utc: '2026-01-31T17:00:00.000Z',
      dropoff_end_utc: '2026-01-31T17:00:00.000Z',
      duty_sch_rest_min: 600,
      duty_act_rest_min: 600,
    })
    expect(rows[1]).toMatchObject({
      pickup_start_utc: rows[0].pickup_start_utc,
      pickup_end_utc: rows[0].pickup_end_utc,
      brief_start_utc: rows[0].brief_start_utc,
      brief_end_utc: rows[0].brief_end_utc,
      debrief_start_utc: rows[0].debrief_start_utc,
      debrief_end_utc: rows[0].debrief_end_utc,
      dropoff_start_utc: rows[0].dropoff_start_utc,
      dropoff_end_utc: rows[0].dropoff_end_utc,
    })
  })



  it('writes multi-duty segment rows using type 3 duty windows and node boundaries', async () => {
    const { fastify, calls } = buildFastify()

    await importS3PairingPrg(fastify, {
      fileName: 'multi-duty.PRG',
      fileText: MULTI_DUTY_PRG,
      targetMode: 'existing',
      targetScenarioId: 800,
      clearBeforeImport: false,
      username: 'kevin',
    })

    const segmentCall = calls.find((call) => call.includes('insert into scenario.pairing_segment'))
    expect(segmentCall).toBeDefined()
    const payload = segmentCall?.match(/:: (.+)$/)?.[1]
    const values = JSON.parse(payload ?? '[]') as [string]
    const rows = JSON.parse(values[0]) as Array<{
      duty_seq: number
      pickup_start_utc: string
      pickup_end_utc: string
      brief_start_utc: string
      brief_end_utc: string
      debrief_start_utc: string
      debrief_end_utc: string
      dropoff_start_utc: string
      dropoff_end_utc: string
    }>

    expect(rows.map((row) => row.duty_seq)).toEqual([1, 2, 3, 3, 3])
    expect(rows[0]).toMatchObject({
      pickup_start_utc: '2026-02-10T06:00:00.000Z',
      pickup_end_utc: '2026-02-10T06:00:00.000Z',
      brief_start_utc: '2026-02-10T06:00:00.000Z',
      brief_end_utc: '2026-02-10T07:00:00.000Z',
      debrief_start_utc: '2026-02-10T10:00:00.000Z',
      debrief_end_utc: '2026-02-10T10:30:00.000Z',
      dropoff_start_utc: '2026-02-10T10:30:00.000Z',
      dropoff_end_utc: '2026-02-10T10:30:00.000Z',
      duty_sch_rest_min: 1260,
      duty_act_rest_min: 1260,
    })
    expect(rows[1]).toMatchObject({
      brief_start_utc: '2026-02-11T07:30:00.000Z',
      brief_end_utc: '2026-02-11T08:00:00.000Z',
      debrief_start_utc: '2026-02-11T10:00:00.000Z',
      debrief_end_utc: '2026-02-11T10:30:00.000Z',
    })
    expect(rows[2]).toMatchObject({
      brief_start_utc: '2026-02-12T06:30:00.000Z',
      brief_end_utc: '2026-02-12T07:00:00.000Z',
      debrief_start_utc: '2026-02-12T12:00:00.000Z',
      debrief_end_utc: '2026-02-12T12:30:00.000Z',
    })
    expect(rows[3]).toMatchObject({
      brief_start_utc: rows[2].brief_start_utc,
      debrief_end_utc: rows[2].debrief_end_utc,
    })
    expect(rows[4]).toMatchObject({
      brief_start_utc: rows[2].brief_start_utc,
      debrief_end_utc: rows[2].debrief_end_utc,
    })
  })

  it('persists PRG type records to staging tables before business import', async () => {
    const { fastify, calls } = buildFastify()

    await importS3PairingPrg(fastify, {
      fileName: 'sample.PRG',
      fileText: PRG_WITH_OFFLINE_SEGMENT,
      targetMode: 'existing',
      targetScenarioId: 800,
      clearBeforeImport: false,
      username: 'kevin',
    })

    const stagingTables = [
      'scenario.s3_prg_import_batch',
      'scenario.s3_prg_pairing_record',
      'scenario.s3_prg_online_segment_record',
      'scenario.s3_prg_duty_record',
      'scenario.s3_prg_offline_segment_record',
    ]
    for (const table of stagingTables) {
      expect(calls.some((call) => call.includes(`insert into ${table}`))).toBe(true)
    }

    const firstStaging = calls.findIndex((call) => call.includes('insert into scenario.s3_prg_import_batch'))
    const firstBusinessPairing = calls.findIndex((call) => call.includes('insert into scenario.pairing ('))
    expect(firstStaging).toBeGreaterThan(-1)
    expect(firstBusinessPairing).toBeGreaterThan(firstStaging)
  })

  it('rejects non-PRG files before opening a transaction', async () => {
    const { fastify } = buildFastify()

    await expect(importS3PairingPrg(fastify, {
      fileName: 'sample.txt',
      fileText: PRG,
      targetMode: 'existing',
      targetScenarioId: 800,
      clearBeforeImport: false,
      username: 'kevin',
    })).rejects.toThrow('Only .PRG files are supported')
  })
})
