# S3 Pairing Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Scenarios screen `S3 Pairing` PRG import workflow, including backend parsing/import into `scenario.pairing*` tables and frontend dialog/entry point.

**Architecture:** Use a synchronous multipart endpoint in `live-server` for the first implementation. Keep fixed-width PRG parsing in a pure parser module, keep database writes in a Scenario import service, and keep the React UI as a focused dialog launched from `ScenarioListPanel`.

**Tech Stack:** Fastify 5, Drizzle raw SQL, Zod, Vitest, React 19, Zustand, `@rois/ui`, lucide-react.

---

## Files

- Create: `live-server/src/services/scenario/s3-pairing-prg-parser.ts`
  - Pure fixed-width parser. No database access.
- Create: `live-server/src/services/scenario/s3-pairing-import-service.ts`
  - Validates target scenario, optionally clears existing pairing data, creates new PO scenario, inserts parsed rows into `scenario.*`.
- Create: `live-server/src/services/scenario/__tests__/s3-pairing-prg-parser.test.ts`
  - Parser unit tests using small inline PRG samples and the first group from `docs/modules/connector-server/2026_FEB_PILOT_PAIRINGS_A_CT.PRG`.
- Create: `live-server/src/services/scenario/__tests__/s3-pairing-import-service.test.ts`
  - Import service tests with a fake db/pgPool.
- Modify: `live-server/src/routes/scenario/scenario.ts`
  - Add `GET /import-targets/po` and `POST /s3-pairing-import`.
- Create: `live-server/src/__tests__/unit/scenario-s3-pairing-import-route.test.ts`
  - Multipart route validation tests.
- Modify: `gantt/src/services/scenario-api.ts`
  - Add PO target listing and multipart import client calls.
- Modify: `gantt/src/services/__tests__/scenario-api.test.ts`
  - Add tests for multipart request construction.
- Create: `gantt/src/components/scenario/s3-pairing-import-dialog.tsx`
  - Dialog UI and validation.
- Create: `gantt/src/components/scenario/__tests__/s3-pairing-import-dialog.test.tsx`
  - Dialog behavior tests.
- Modify: `gantt/src/components/scenario/scenario-list-panel.tsx`
  - Add download-icon `S3 Pairing` button to the left of `Import PBS material`, open dialog, refresh list after import.
- Create: `gantt/src/components/scenario/__tests__/scenario-list-panel-s3-pairing.test.tsx`
  - Placement and dialog-open test.

## Task 1: Backend PRG Parser

**Files:**
- Create: `live-server/src/services/scenario/s3-pairing-prg-parser.ts`
- Create: `live-server/src/services/scenario/__tests__/s3-pairing-prg-parser.test.ts`

- [ ] **Step 1: Write parser tests**

Create `live-server/src/services/scenario/__tests__/s3-pairing-prg-parser.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import {
  parseS3PairingPrg,
  parseCrewPlanPositions,
  toUtcFromYmdMinutes,
} from '../s3-pairing-prg-parser.js'

const FIRST_T4101 = [
  '1T4101 202601312026013120260228NNNNNYN000000000000000000000000000000002026013103652026013110202648 0425001D  655 CA01FO01                        060010520000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000 0000000000000520000000000520052000000000000000000000                06550000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000D',
  '2T4101 202601312648 20260131YYZ202601310425MBJ202601310690010  D0265000002650000102-0300-03007M8D',
  '2T4101 202601312649 20260131MBJ202601310750YYZ202601311005020 PD0255000002550000102-0300-03007M8D',
  '3T4101 202601310250001202601310365202601311020D065500000                                                      000005200000000005200520D0000D000000000',
].join('\n')

describe('s3 pairing PRG parser', () => {
  it('parses CrewPlan position slots into composition plans', () => {
    expect(parseCrewPlanPositions('CA01FO01                        ')).toEqual([
      { rank: 'CA', plan: 1 },
      { rank: 'FO', plan: 1 },
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
      tafb: 655,
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

  it('rejects unsupported offline and non-flying record types', () => {
    expect(() => parseS3PairingPrg('4T4101 20260131\n')).toThrow('Unsupported PRG record type 4')
    expect(() => parseS3PairingPrg('5T4101 20260131\n')).toThrow('Unsupported PRG record type 5')
  })

  it('rejects orphan segment rows', () => {
    expect(() => parseS3PairingPrg('2T4101 202601312648 20260131YYZ202601310425MBJ202601310690010  D0265000002650000102-0300-03007M8D')).toThrow('Segment row has no matching pairing master')
  })
})
```

- [ ] **Step 2: Run parser tests and verify they fail**

Run:

```bash
cd live-server
npm test -- src/services/scenario/__tests__/s3-pairing-prg-parser.test.ts
```

Expected: fail because `s3-pairing-prg-parser.ts` does not exist.

- [ ] **Step 3: Implement parser**

Create `live-server/src/services/scenario/s3-pairing-prg-parser.ts`:

```ts
export interface S3PairingCompositionInput {
  rank: string
  plan: number
}

export interface S3PairingSegmentInput {
  dutySeq: number
  segSeq: number
  fltNum: string
  fltDt: string
  airline: string
  depArp: string
  arvArp: string
  fleet: string
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc: string
  actEndDtUtc: string
  segAssignment: string
}

export interface S3PairingInput {
  logicalKey: string
  pairingLabel: string
  pairingDate: string
  interfaceId: string
  filiale: string
  division: string
  base: string
  fleet: string
  assignmentGroup: string
  assignment: string
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc: string
  actEndDtUtc: string
  durationDays: number
  tafb: number
  dutyCount: number
  segCount: number
  comments: string | null
  compositions: S3PairingCompositionInput[]
  segments: S3PairingSegmentInput[]
  duties: Map<number, S3DutyBreakInput>
}

export interface S3DutyBreakInput {
  dutySeq: number
  dutyStrArp: string
  dutyEndArp: string
  dutySchStrDtUtc: string
  dutySchEndDtUtc: string
  dutyActStrDtUtc: string
  dutyActEndDtUtc: string
  dutySchFdpMin: number
  dutyActCreditedMinutes: number
}

export interface S3PairingParseResult {
  pairings: S3PairingInput[]
  warnings: string[]
}

const slice1 = (line: string, start: number, end: number): string => line.slice(start - 1, end)
const trimSlice = (line: string, start: number, end: number): string => slice1(line, start, end).trim()

const toNumber = (value: string, field: string): number => {
  const n = Number(value.trim())
  if (!Number.isFinite(n)) throw new Error(`Invalid numeric PRG field ${field}: ${value}`)
  return n
}

export const parseCrewPlanPositions = (raw: string): S3PairingCompositionInput[] => {
  const out: S3PairingCompositionInput[] = []
  for (let i = 0; i + 4 <= raw.length; i += 4) {
    const rank = raw.slice(i, i + 2).trim()
    const planText = raw.slice(i + 2, i + 4).trim()
    if (!rank && !planText) continue
    const plan = toNumber(planText, 'position plan')
    if (plan > 0) out.push({ rank, plan })
  }
  return out
}

export const toUtcFromYmdMinutes = (ymd: string, minutesText: string): string => {
  if (!/^\d{8}$/.test(ymd)) throw new Error(`Invalid PRG date: ${ymd}`)
  const minutes = toNumber(minutesText, 'minutes')
  const year = Number(ymd.slice(0, 4))
  const month = Number(ymd.slice(4, 6)) - 1
  const day = Number(ymd.slice(6, 8))
  const d = new Date(Date.UTC(year, month, day, 0, minutes, 0, 0))
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid PRG date/minutes: ${ymd} ${minutesText}`)
  return d.toISOString()
}

const toDate = (ymd: string): string => {
  if (!/^\d{8}$/.test(ymd)) throw new Error(`Invalid PRG date: ${ymd}`)
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
}

const logicalKey = (pairingNumber: string, pairingYmd: string): string => `${pairingNumber}:${pairingYmd}`

const parseMaster = (line: string): S3PairingInput => {
  const pairingLabel = trimSlice(line, 2, 7)
  const pairingYmd = trimSlice(line, 8, 15)
  const startDate = trimSlice(line, 71, 78)
  const startMin = trimSlice(line, 79, 82)
  const endDate = trimSlice(line, 83, 90)
  const endMin = trimSlice(line, 91, 94)
  const dutyCount = toNumber(trimSlice(line, 104, 106), 'duty count')
  const compositions = parseCrewPlanPositions(slice1(line, 114, 145))
  const schStrDtUtc = toUtcFromYmdMinutes(startDate, startMin)
  const schEndDtUtc = toUtcFromYmdMinutes(endDate, endMin)
  return {
    logicalKey: logicalKey(pairingLabel, pairingYmd),
    pairingLabel,
    pairingDate: toDate(pairingYmd),
    interfaceId: `S3:${pairingLabel}:${pairingYmd}`,
    filiale: 'F8',
    division: 'P',
    base: '',
    fleet: '',
    assignmentGroup: 'FLY',
    assignment: 'FLY',
    schStrDtUtc,
    schEndDtUtc,
    actStrDtUtc: schStrDtUtc,
    actEndDtUtc: schEndDtUtc,
    durationDays: Math.max(1, Math.ceil((new Date(schEndDtUtc).getTime() - new Date(schStrDtUtc).getTime()) / 86_400_000)),
    tafb: toNumber(trimSlice(line, 107, 111), 'tafb'),
    dutyCount,
    segCount: 0,
    comments: null,
    compositions,
    segments: [],
    duties: new Map<number, S3DutyBreakInput>(),
  }
}

const parseSegment = (line: string): S3PairingSegmentInput & { key: string } => {
  const pairingLabel = trimSlice(line, 2, 7)
  const pairingYmd = trimSlice(line, 8, 15)
  const fltNum = trimSlice(line, 16, 20)
  const fltDate = trimSlice(line, 21, 28)
  const depArp = trimSlice(line, 29, 31)
  const depDate = trimSlice(line, 32, 39)
  const depMin = trimSlice(line, 40, 43)
  const arvArp = trimSlice(line, 44, 46)
  const arvDate = trimSlice(line, 47, 54)
  const arvMin = trimSlice(line, 55, 58)
  const segSeq = toNumber(trimSlice(line, 59, 61), 'segment sequence')
  const fleet = trimSlice(line, 94, 96) || 'UNK'
  const schStrDtUtc = toUtcFromYmdMinutes(depDate, depMin)
  const schEndDtUtc = toUtcFromYmdMinutes(arvDate, arvMin)
  return {
    key: logicalKey(pairingLabel, pairingYmd),
    dutySeq: 1,
    segSeq,
    fltNum,
    fltDt: toDate(fltDate),
    airline: 'F8',
    depArp,
    arvArp,
    fleet,
    schStrDtUtc,
    schEndDtUtc,
    actStrDtUtc: schStrDtUtc,
    actEndDtUtc: schEndDtUtc,
    segAssignment: 'FLY',
  }
}

const parseDuty = (line: string): S3DutyBreakInput & { key: string } => {
  const pairingLabel = trimSlice(line, 2, 7)
  const pairingYmd = trimSlice(line, 8, 15)
  const dutySeq = toNumber(trimSlice(line, 19, 22), 'duty sequence')
  const startDate = trimSlice(line, 23, 30)
  const startMin = trimSlice(line, 31, 34)
  const endDate = trimSlice(line, 35, 42)
  const endMin = trimSlice(line, 43, 46)
  const dutySchStrDtUtc = toUtcFromYmdMinutes(startDate, startMin)
  const dutySchEndDtUtc = toUtcFromYmdMinutes(endDate, endMin)
  return {
    key: logicalKey(pairingLabel, pairingYmd),
    dutySeq,
    dutyStrArp: '',
    dutyEndArp: '',
    dutySchStrDtUtc,
    dutySchEndDtUtc,
    dutyActStrDtUtc: dutySchStrDtUtc,
    dutyActEndDtUtc: dutySchEndDtUtc,
    dutySchFdpMin: toNumber(trimSlice(line, 48, 51), 'scheduled duty time'),
    dutyActCreditedMinutes: toNumber(trimSlice(line, 127, 130), 'duty credit'),
  }
}

export const parseS3PairingPrg = (content: string): S3PairingParseResult => {
  const pairings = new Map<string, S3PairingInput>()
  const warnings: string[] = []
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0)

  for (const [index, line] of lines.entries()) {
    const recordType = line[0]
    if (recordType === '4' || recordType === '5') {
      throw new Error(`Unsupported PRG record type ${recordType} at line ${index + 1}`)
    }
    if (recordType === '1') {
      const pairing = parseMaster(line)
      pairings.set(pairing.logicalKey, pairing)
      continue
    }
    if (recordType === '2') {
      const seg = parseSegment(line)
      const pairing = pairings.get(seg.key)
      if (!pairing) throw new Error(`Segment row has no matching pairing master at line ${index + 1}`)
      const { key: _key, ...segment } = seg
      pairing.segments.push(segment)
      pairing.segCount = pairing.segments.length
      if (!pairing.base) pairing.base = segment.depArp
      if (!pairing.fleet || pairing.fleet === 'UNK') pairing.fleet = segment.fleet
      continue
    }
    if (recordType === '3') {
      const duty = parseDuty(line)
      const pairing = pairings.get(duty.key)
      if (!pairing) throw new Error(`Duty row has no matching pairing master at line ${index + 1}`)
      const { key: _key, ...dutyBreak } = duty
      pairing.duties.set(dutyBreak.dutySeq, dutyBreak)
      continue
    }
    throw new Error(`Unsupported PRG record type ${recordType || '<empty>'} at line ${index + 1}`)
  }

  for (const pairing of pairings.values()) {
    if (!pairing.base) throw new Error(`Pairing ${pairing.logicalKey} has no segment base`)
    if (!pairing.fleet) pairing.fleet = 'UNK'
    for (const duty of pairing.duties.values()) {
      const dutySegments = pairing.segments.filter((seg) => seg.dutySeq === duty.dutySeq)
      duty.dutyStrArp = dutySegments[0]?.depArp ?? pairing.base
      duty.dutyEndArp = dutySegments[dutySegments.length - 1]?.arvArp ?? pairing.base
    }
    if (pairing.duties.size === 0) {
      warnings.push(`Pairing ${pairing.logicalKey} has no duty break records; segment times will be used`)
    }
  }

  return { pairings: [...pairings.values()], warnings }
}
```

- [ ] **Step 4: Run parser tests and verify they pass**

Run:

```bash
cd live-server
npm test -- src/services/scenario/__tests__/s3-pairing-prg-parser.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit parser**

```bash
git add live-server/src/services/scenario/s3-pairing-prg-parser.ts live-server/src/services/scenario/__tests__/s3-pairing-prg-parser.test.ts
git commit -m "feat: parse S3 pairing PRG files"
```

## Task 2: Backend Import Service

**Files:**
- Create: `live-server/src/services/scenario/s3-pairing-import-service.ts`
- Create: `live-server/src/services/scenario/__tests__/s3-pairing-import-service.test.ts`

- [ ] **Step 1: Write import service tests**

Create `live-server/src/services/scenario/__tests__/s3-pairing-import-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../scenario-service.js', () => ({
  scenarioService: {
    create: vi.fn(async () => ({ id: 900, name: 'S3 Pairing sample', fileType: 'PO' })),
    getById: vi.fn(async (fastify: unknown, id: number) => ({ id, name: 'PO Target', fileType: 'PO' })),
  },
}))

import { scenarioService } from '../scenario-service.js'
import { importS3PairingPrg } from '../s3-pairing-import-service.js'

const PRG = [
  '1T4101 202601312026013120260228NNNNNYN000000000000000000000000000000002026013103652026013110202648 0425001D  655 CA01FO01                        060010520000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000 0000000000000520000000000520052000000000000000000000                06550000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000D',
  '2T4101 202601312648 20260131YYZ202601310425MBJ202601310690010  D0265000002650000102-0300-03007M8D',
  '2T4101 202601312649 20260131MBJ202601310750YYZ202601311005020 PD0255000002550000102-0300-03007M8D',
  '3T4101 202601310250001202601310365202601311020D065500000                                                      000005200000000005200520D0000D000000000',
].join('\n')

const buildFastify = () => {
  const calls: string[] = []
  const pgPool = {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      calls.push(`${text.trim()} :: ${JSON.stringify(values ?? [])}`)
      if (text.includes('RETURNING id')) return { rows: [{ id: 777 }] }
      if (text.includes('count(*)::int AS n')) return { rows: [{ n: 0 }] }
      return { rows: [] }
    }),
  }
  return {
    fastify: {
      pgPool,
      db: {},
      redis: { del: vi.fn() },
      log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
    } as never,
    calls,
    pgPool,
  }
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
        base: 'YYZ',
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
        filterParams: { base: 'YYZ', division: 'P' },
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
    expect(clearCalls[2]).toContain('delete from scenario.pairing ')
  })

  it('rejects non-PO existing target scenarios', async () => {
    vi.mocked(scenarioService.getById).mockResolvedValueOnce({ id: 801, fileType: 'RO' } as never)
    const { fastify } = buildFastify()

    await expect(importS3PairingPrg(fastify, {
      fileName: 'sample.PRG',
      fileText: PRG,
      targetMode: 'existing',
      targetScenarioId: 801,
      clearBeforeImport: false,
      username: 'kevin',
    })).rejects.toThrow('Target scenario must be a PO scenario')
  })
})
```

- [ ] **Step 2: Run import service tests and verify they fail**

Run:

```bash
cd live-server
npm test -- src/services/scenario/__tests__/s3-pairing-import-service.test.ts
```

Expected: fail because `s3-pairing-import-service.ts` does not exist.

- [ ] **Step 3: Implement import service**

Create `live-server/src/services/scenario/s3-pairing-import-service.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { scenarioService } from './scenario-service.js'
import { parseS3PairingPrg, type S3PairingInput } from './s3-pairing-prg-parser.js'

export interface S3PairingNewScenarioInput {
  name?: string
  strDtLoc: string
  endDtLoc: string
  base: string
  division: string
}

export interface S3PairingImportRequest {
  fileName: string
  fileText: string
  targetMode: 'existing' | 'new'
  targetScenarioId?: number
  clearBeforeImport: boolean
  newScenario?: S3PairingNewScenarioInput
  username: string
}

export interface S3PairingImportResult {
  scenarioId: number
  createdScenario: boolean
  importedPairings: number
  importedSegments: number
  importedCompositions: number
  warnings: string[]
}

const sqlDate = (iso: string): string => iso.slice(0, 10)
const sqlTs = (iso: string): string => iso.slice(0, 19).replace('T', ' ')

const requireNewScenario = (request: S3PairingImportRequest): S3PairingNewScenarioInput => {
  if (!request.newScenario) throw new Error('New scenario details are required')
  if (!request.newScenario.strDtLoc || !request.newScenario.endDtLoc) throw new Error('New scenario date range is required')
  if (!request.newScenario.base) throw new Error('New scenario base is required')
  if (!request.newScenario.division) throw new Error('New scenario division is required')
  return request.newScenario
}

const assertExistingPoScenario = async (fastify: FastifyInstance, scenarioId: number): Promise<void> => {
  const target = await scenarioService.getById(fastify, scenarioId)
  if (!target) throw new Error('Target scenario not found')
  if (target.fileType !== 'PO') throw new Error('Target scenario must be a PO scenario')
}

const assertNoRosterReferences = async (fastify: FastifyInstance, scenarioId: number): Promise<void> => {
  const res = await fastify.pgPool.query(
    `select count(*)::int as n
       from scenario.roster_flight rf
      where rf.scenario_id = $1
        and rf.pairing_id is not null
        and rf.is_deleted = 0`,
    [scenarioId],
  )
  const count = Number(res.rows[0]?.n ?? 0)
  if (count > 0) throw new Error('Cannot clear pairing data because roster rows reference this scenario')
}

const clearScenarioPairings = async (fastify: FastifyInstance, scenarioId: number): Promise<void> => {
  await assertNoRosterReferences(fastify, scenarioId)
  await fastify.pgPool.query('delete from scenario.pairing_composition where scenario_id = $1', [scenarioId])
  await fastify.pgPool.query('delete from scenario.pairing_segment where scenario_id = $1', [scenarioId])
  await fastify.pgPool.query('delete from scenario.pairing where scenario_id = $1', [scenarioId])
}

const createTargetScenario = async (
  fastify: FastifyInstance,
  request: S3PairingImportRequest,
): Promise<number> => {
  const details = requireNewScenario(request)
  const defaultName = `S3 Pairing ${request.fileName.replace(/\.[^.]+$/, '')}`
  const created = await scenarioService.create(fastify, {
    name: details.name?.trim() || defaultName,
    fileType: 'PO',
    strDtLoc: details.strDtLoc,
    endDtLoc: details.endDtLoc,
    leadinLive: 1,
    filterParams: {
      base: details.base,
      division: details.division,
    },
  } as never, request.username)
  return created.id
}

const insertPairing = async (
  fastify: FastifyInstance,
  scenarioId: number,
  pairing: S3PairingInput,
  username: string,
): Promise<number> => {
  const res = await fastify.pgPool.query(
    `insert into scenario.pairing (
       scenario_id, pairing_label, filiale, division, base, fleet,
       assignment_group, assignment,
       sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
       pairing_dt, duration_days, tafb, duty_count, seg_count,
       source, interface_id, comments, created_by, updated_by
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9::timestamp,$10::timestamp,$11::timestamp,$12::timestamp,
       $13::date,$14,$15,$16,$17,$18,$19,$20,$21,$21
     ) returning id`,
    [
      scenarioId,
      pairing.pairingLabel,
      pairing.filiale,
      pairing.division,
      pairing.base,
      pairing.fleet,
      pairing.assignmentGroup,
      pairing.assignment,
      sqlTs(pairing.schStrDtUtc),
      sqlTs(pairing.schEndDtUtc),
      sqlTs(pairing.actStrDtUtc),
      sqlTs(pairing.actEndDtUtc),
      sqlDate(pairing.pairingDate),
      pairing.durationDays,
      pairing.tafb,
      pairing.dutyCount,
      pairing.segCount,
      'IMPORT',
      pairing.interfaceId,
      pairing.comments,
      username,
    ],
  )
  return Number(res.rows[0].id)
}

const insertSegments = async (
  fastify: FastifyInstance,
  scenarioId: number,
  dbPairingId: number,
  pairing: S3PairingInput,
  username: string,
): Promise<number> => {
  let count = 0
  for (const segment of pairing.segments) {
    const duty = pairing.duties.get(segment.dutySeq)
    const dutyStrArp = duty?.dutyStrArp || segment.depArp
    const dutyEndArp = duty?.dutyEndArp || segment.arvArp
    const dutySchStr = duty?.dutySchStrDtUtc ?? segment.schStrDtUtc
    const dutySchEnd = duty?.dutySchEndDtUtc ?? segment.schEndDtUtc
    await fastify.pgPool.query(
      `insert into scenario.pairing_segment (
         scenario_id, pairing_id, duty_seq, seg_seq,
         duty_str_arp, duty_end_arp,
         duty_sch_str_dt_utc, duty_sch_end_dt_utc,
         duty_act_str_dt_utc, duty_act_end_dt_utc,
         duty_acc_state, duty_sch_fdp_min, duty_act_credited_minutes,
         pickup_start_utc, pickup_end_utc, brief_start_utc, brief_end_utc,
         debrief_start_utc, debrief_end_utc, dropoff_start_utc, dropoff_end_utc,
         flt_id, flt_num, flt_dt, airline, dep_arp, arv_arp, fleet_seg,
         sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
         seg_assignment, is_deleted, created_by, updated_by
       ) values (
         $1,$2,$3,$4,$5,$6,$7::timestamp,$8::timestamp,$9::timestamp,$10::timestamp,
         'D',$11,$12,$13::timestamp,$13::timestamp,$13::timestamp,$13::timestamp,
         $14::timestamp,$14::timestamp,$14::timestamp,$14::timestamp,
         null,$15,$16::date,$17,$18,$19,$20,
         $21::timestamp,$22::timestamp,$23::timestamp,$24::timestamp,
         $25,0,$26,$26
       )`,
      [
        scenarioId,
        dbPairingId,
        segment.dutySeq,
        segment.segSeq,
        dutyStrArp,
        dutyEndArp,
        sqlTs(dutySchStr),
        sqlTs(dutySchEnd),
        sqlTs(duty?.dutyActStrDtUtc ?? dutySchStr),
        sqlTs(duty?.dutyActEndDtUtc ?? dutySchEnd),
        duty?.dutySchFdpMin ?? null,
        duty?.dutyActCreditedMinutes ?? null,
        sqlTs(dutySchStr),
        sqlTs(dutySchEnd),
        segment.fltNum,
        segment.fltDt,
        segment.airline,
        segment.depArp,
        segment.arvArp,
        segment.fleet,
        sqlTs(segment.schStrDtUtc),
        sqlTs(segment.schEndDtUtc),
        sqlTs(segment.actStrDtUtc),
        sqlTs(segment.actEndDtUtc),
        segment.segAssignment,
        username,
      ],
    )
    count++
  }
  return count
}

const insertCompositions = async (
  fastify: FastifyInstance,
  scenarioId: number,
  dbPairingId: number,
  pairing: S3PairingInput,
  username: string,
): Promise<number> => {
  let count = 0
  for (const comp of pairing.compositions) {
    await fastify.pgPool.query(
      `insert into scenario.pairing_composition (
         scenario_id, pairing_id, division, acting_rank, plan, fill, is_deleted, created_by, updated_by
       ) values ($1,$2,$3,$4,$5,0,0,$6,$6)`,
      [scenarioId, dbPairingId, pairing.division, comp.rank, comp.plan, username],
    )
    count++
  }
  return count
}

export const importS3PairingPrg = async (
  fastify: FastifyInstance,
  request: S3PairingImportRequest,
): Promise<S3PairingImportResult> => {
  if (!request.fileText.trim()) throw new Error('PRG file is empty')

  const scenarioId = request.targetMode === 'new'
    ? await createTargetScenario(fastify, request)
    : Number(request.targetScenarioId)

  if (!Number.isFinite(scenarioId) || scenarioId <= 0) throw new Error('Target scenario id is required')
  if (request.targetMode === 'existing') await assertExistingPoScenario(fastify, scenarioId)

  const parsed = parseS3PairingPrg(request.fileText)
  let importedSegments = 0
  let importedCompositions = 0

  await fastify.pgPool.query('begin')
  try {
    if (request.clearBeforeImport) await clearScenarioPairings(fastify, scenarioId)
    for (const pairing of parsed.pairings) {
      const dbPairingId = await insertPairing(fastify, scenarioId, pairing, request.username)
      importedSegments += await insertSegments(fastify, scenarioId, dbPairingId, pairing, request.username)
      importedCompositions += await insertCompositions(fastify, scenarioId, dbPairingId, pairing, request.username)
    }
    await fastify.pgPool.query('commit')
  } catch (error) {
    await fastify.pgPool.query('rollback')
    throw error
  }

  return {
    scenarioId,
    createdScenario: request.targetMode === 'new',
    importedPairings: parsed.pairings.length,
    importedSegments,
    importedCompositions,
    warnings: parsed.warnings,
  }
}
```

- [ ] **Step 4: Run service tests and verify they pass**

Run:

```bash
cd live-server
npm test -- src/services/scenario/__tests__/s3-pairing-import-service.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit import service**

```bash
git add live-server/src/services/scenario/s3-pairing-import-service.ts live-server/src/services/scenario/__tests__/s3-pairing-import-service.test.ts
git commit -m "feat: import S3 pairings into scenario tables"
```

## Task 3: Backend Scenario Routes

**Files:**
- Modify: `live-server/src/routes/scenario/scenario.ts`
- Create: `live-server/src/__tests__/unit/scenario-s3-pairing-import-route.test.ts`

- [ ] **Step 1: Write route tests**

Create `live-server/src/__tests__/unit/scenario-s3-pairing-import-route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import multipart from '@fastify/multipart'

vi.mock('../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    FILIALE: 'F8',
    SCENARIO_GANTT_SOURCE: 'db',
  },
}))

vi.mock('../../services/scenario/scenario-run-health-service.js', () => ({
  getScenarioRunHealth: vi.fn(async () => ({ overall: 'healthy', services: [], checkedAt: new Date().toISOString() })),
}))

vi.mock('../../services/scenario/scenario-service.js', () => ({
  scenarioService: {
    list: vi.fn(async () => ({ items: [{ id: 1, name: 'PO', fileType: 'PO' }], total: 1, page: 1, pageSize: 50, totalPages: 1 })),
    create: vi.fn(),
    getById: vi.fn(),
  },
}))

vi.mock('../../services/scenario/s3-pairing-import-service.js', () => ({
  importS3PairingPrg: vi.fn(async () => ({
    scenarioId: 900,
    createdScenario: true,
    importedPairings: 1,
    importedSegments: 2,
    importedCompositions: 2,
    warnings: [],
  })),
}))

import scenarioRoutes from '../../routes/scenario/scenario.js'
import { scenarioService } from '../../services/scenario/scenario-service.js'
import { importS3PairingPrg } from '../../services/scenario/s3-pairing-import-service.js'

const build = async () => {
  const app = Fastify()
  await app.register(multipart)
  app.decorate('db', {} as never)
  app.decorate('pgPool', {} as never)
  app.decorate('redis', {} as never)
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (req) => {
    ;(req as { authUser?: unknown }).authUser = { userCode: 'kevin', schema: 'f8', isAdmin: 1 }
  })
  await app.register(scenarioRoutes)
  return app
}

describe('scenario s3 pairing import routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists PO import targets', async () => {
    const app = await build()
    const res = await app.inject({ method: 'GET', url: '/import-targets/po' })

    expect(res.statusCode).toBe(200)
    expect(scenarioService.list).toHaveBeenCalledWith(expect.anything(), { page: 1, pageSize: 1000, fileType: 'PO' })
    expect(JSON.parse(res.body).data.items[0].id).toBe(1)
  })

  it('rejects non-multipart import requests', async () => {
    const app = await build()
    const res = await app.inject({ method: 'POST', url: '/s3-pairing-import', payload: { targetMode: 'new' } })

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).message).toContain('multipart/form-data')
  })

  it('passes multipart import payload to service with authenticated username', async () => {
    const app = await build()
    const form = new FormData()
    form.append('file', new Blob(['1T4101 20260131'], { type: 'text/plain' }), 'sample.PRG')
    form.append('targetMode', 'new')
    form.append('clearBeforeImport', 'false')
    form.append('newStrDtLoc', '2026-01-31')
    form.append('newEndDtLoc', '2026-02-28')
    form.append('newBase', 'YYZ')
    form.append('newDivision', 'P')

    const res = await app.inject({
      method: 'POST',
      url: '/s3-pairing-import',
      payload: form,
      headers: form.headers as HeadersInit,
    })

    expect(res.statusCode).toBe(200)
    expect(importS3PairingPrg).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      fileName: 'sample.PRG',
      targetMode: 'new',
      newScenario: {
        strDtLoc: '2026-01-31',
        endDtLoc: '2026-02-28',
        base: 'YYZ',
        division: 'P',
        name: undefined,
      },
      username: 'kevin',
    }))
  })
})
```

- [ ] **Step 2: Run route tests and verify they fail**

Run:

```bash
cd live-server
npm test -- src/__tests__/unit/scenario-s3-pairing-import-route.test.ts
```

Expected: fail because routes are not registered.

- [ ] **Step 3: Add route helpers and endpoints**

Modify `live-server/src/routes/scenario/scenario.ts`:

Add import near existing imports:

```ts
import { importS3PairingPrg } from '../../services/scenario/s3-pairing-import-service.js'
```

Add helper functions near `getAuthUsername`:

```ts
const parseBooleanField = (value: string | undefined): boolean => {
  const normalized = (value ?? '').trim().toLowerCase()
  return ['true', '1', 'yes'].includes(normalized)
}

const readS3PairingImportRequest = async (
  request: FastifyRequest,
): Promise<
  | { success: true; value: Parameters<typeof importS3PairingPrg>[1] }
  | { success: false; message: string }
> => {
  if (!request.isMultipart()) {
    return { success: false, message: 'S3 Pairing import requires multipart/form-data.' }
  }

  const fields = new Map<string, string>()
  let fileName = ''
  let fileText = ''

  try {
    for await (const part of request.parts({ limits: { files: 1, fileSize: 10 * 1024 * 1024, fields: 20, parts: 24 } })) {
      if (part.type === 'file') {
        if (part.fieldname !== 'file') return { success: false, message: 'PRG file must use form field name file.' }
        fileName = part.filename
        fileText = (await part.toBuffer()).toString('utf8')
      } else {
        fields.set(part.fieldname, String(part.value ?? ''))
      }
    }
  } catch (err) {
    return { success: false, message: err instanceof Error && err.message.toLowerCase().includes('file size') ? 'PRG file is too large.' : 'Failed to read S3 Pairing import payload.' }
  }

  if (!fileName || !fileText.trim()) return { success: false, message: 'PRG file is required.' }
  if (!/\.prg$/i.test(fileName)) return { success: false, message: 'PRG file must have .PRG extension.' }

  const targetMode = fields.get('targetMode')
  if (targetMode !== 'existing' && targetMode !== 'new') return { success: false, message: 'targetMode must be existing or new.' }

  const username = getAuthUsername(request)
  if (targetMode === 'existing') {
    const targetScenarioId = Number(fields.get('targetScenarioId'))
    if (!Number.isFinite(targetScenarioId) || targetScenarioId <= 0) return { success: false, message: 'targetScenarioId is required.' }
    return {
      success: true,
      value: {
        fileName,
        fileText,
        targetMode,
        targetScenarioId,
        clearBeforeImport: parseBooleanField(fields.get('clearBeforeImport')),
        username,
      },
    }
  }

  const newStrDtLoc = fields.get('newStrDtLoc')?.trim() ?? ''
  const newEndDtLoc = fields.get('newEndDtLoc')?.trim() ?? ''
  const newBase = fields.get('newBase')?.trim() ?? ''
  const newDivision = fields.get('newDivision')?.trim() ?? ''
  if (!newStrDtLoc || !newEndDtLoc || !newBase || !newDivision) {
    return { success: false, message: 'New Pairing Scenario requires date range, Base, and Division.' }
  }

  return {
    success: true,
    value: {
      fileName,
      fileText,
      targetMode,
      clearBeforeImport: false,
      newScenario: {
        name: fields.get('newScenarioName')?.trim() || undefined,
        strDtLoc: newStrDtLoc,
        endDtLoc: newEndDtLoc,
        base: newBase,
        division: newDivision,
      },
      username,
    },
  }
}
```

Add routes after `GET /api/scenario` list route and before `GET /api/scenario/:id`:

```ts
  fastify.get('/import-targets/po', async (_request, reply) => {
    const result = await scenarioService.list(fastify, { page: 1, pageSize: 1000, fileType: 'PO' })
    return success(reply, { items: result.items })
  })

  fastify.post('/s3-pairing-import', async (request, reply) => {
    const parsed = await readS3PairingImportRequest(request)
    if (!parsed.success) return fail(reply, 400, parsed.message)
    try {
      const result = await importS3PairingPrg(fastify, parsed.value)
      await invalidatePattern(fastify.redis, 'scenario:list:*')
      await invalidate(fastify.redis, `scenario:${result.scenarioId}`)
      return success(reply, result)
    } catch (err) {
      return fail(reply, 400, err instanceof Error ? err.message : String(err))
    }
  })
```

If `invalidate` and `invalidatePattern` are not currently imported in this route file, add:

```ts
import { invalidate, invalidatePattern } from '../../utils/cache.js'
```

- [ ] **Step 4: Run route tests and verify they pass**

Run:

```bash
cd live-server
npm test -- src/__tests__/unit/scenario-s3-pairing-import-route.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit route work**

```bash
git add live-server/src/routes/scenario/scenario.ts live-server/src/__tests__/unit/scenario-s3-pairing-import-route.test.ts
git commit -m "feat: add S3 pairing import routes"
```

## Task 4: Frontend API Client

**Files:**
- Modify: `gantt/src/services/scenario-api.ts`
- Modify: `gantt/src/services/__tests__/scenario-api.test.ts`

- [ ] **Step 1: Add frontend API tests**

Append to `gantt/src/services/__tests__/scenario-api.test.ts`:

```ts
it('lists S3 pairing PO import targets', async () => {
  await scenarioApi.listS3PairingPoTargets()

  expect(api.get).toHaveBeenCalledWith('/api/scenario/import-targets/po')
})

it('posts S3 pairing import multipart form data', async () => {
  vi.mocked(api.post).mockResolvedValue({ scenarioId: 900 })
  const file = new File(['PRG'], 'sample.PRG')

  await scenarioApi.importS3Pairing({
    file,
    targetMode: 'new',
    clearBeforeImport: false,
    newScenarioName: 'S3 Pairing sample',
    newStrDtLoc: '2026-01-31',
    newEndDtLoc: '2026-02-28',
    newBase: 'YYZ',
    newDivision: 'P',
  })

  expect(api.post).toHaveBeenCalledWith(
    '/api/scenario/s3-pairing-import',
    expect.any(FormData),
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
})
```

Update the mock at the top of the same file to include `post`:

```ts
vi.mock('../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))
```

- [ ] **Step 2: Run API tests and verify they fail**

Run:

```bash
cd gantt
npm test -- src/services/__tests__/scenario-api.test.ts
```

Expected: fail because new API methods do not exist.

- [ ] **Step 3: Add API types and methods**

Modify `gantt/src/services/scenario-api.ts` before `export const scenarioApi`:

```ts
export interface S3PairingPoTarget {
  id: number
  name: string
  strDtLoc: string
  endDtLoc: string
}

export interface S3PairingImportInput {
  file: File
  targetMode: 'existing' | 'new'
  targetScenarioId?: number
  clearBeforeImport: boolean
  newScenarioName?: string
  newStrDtLoc?: string
  newEndDtLoc?: string
  newBase?: string
  newDivision?: string
}

export interface S3PairingImportResult {
  scenarioId: number
  createdScenario: boolean
  importedPairings: number
  importedSegments: number
  importedCompositions: number
  warnings: string[]
}

const buildS3PairingImportFormData = (input: S3PairingImportInput): FormData => {
  const form = new FormData()
  form.append('file', input.file)
  form.append('targetMode', input.targetMode)
  form.append('clearBeforeImport', String(input.clearBeforeImport))
  if (input.targetScenarioId != null) form.append('targetScenarioId', String(input.targetScenarioId))
  if (input.newScenarioName) form.append('newScenarioName', input.newScenarioName)
  if (input.newStrDtLoc) form.append('newStrDtLoc', input.newStrDtLoc)
  if (input.newEndDtLoc) form.append('newEndDtLoc', input.newEndDtLoc)
  if (input.newBase) form.append('newBase', input.newBase)
  if (input.newDivision) form.append('newDivision', input.newDivision)
  return form
}
```

Add methods inside `scenarioApi`:

```ts
  async listS3PairingPoTargets(): Promise<{ items: S3PairingPoTarget[] }> {
    return api.get('/api/scenario/import-targets/po') as Promise<{ items: S3PairingPoTarget[] }>
  },

  async importS3Pairing(input: S3PairingImportInput): Promise<S3PairingImportResult> {
    return api.post('/api/scenario/s3-pairing-import', buildS3PairingImportFormData(input), {
      headers: { 'Content-Type': 'multipart/form-data' },
    }) as Promise<S3PairingImportResult>
  },
```

- [ ] **Step 4: Run API tests and verify they pass**

Run:

```bash
cd gantt
npm test -- src/services/__tests__/scenario-api.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit frontend API**

```bash
git add gantt/src/services/scenario-api.ts gantt/src/services/__tests__/scenario-api.test.ts
git commit -m "feat: add S3 pairing import API client"
```

## Task 5: Frontend Import Dialog

**Files:**
- Create: `gantt/src/components/scenario/s3-pairing-import-dialog.tsx`
- Create: `gantt/src/components/scenario/__tests__/s3-pairing-import-dialog.test.tsx`

- [ ] **Step 1: Write dialog tests**

Create `gantt/src/components/scenario/__tests__/s3-pairing-import-dialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { S3PairingImportDialog } from '../s3-pairing-import-dialog'

vi.mock('@rois/ui', () => ({
  AppDialog: ({ open, title, children, footer }: { open: boolean; title: string; children: React.ReactNode; footer: React.ReactNode }) =>
    open ? <div data-testid="dialog"><h1>{title}</h1>{children}<footer>{footer}</footer></div> : null,
  Button: ({ children, disabled, onClick, 'data-testid': testId }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void; 'data-testid'?: string }) =>
    <button data-testid={testId} disabled={disabled} onClick={onClick}>{children}</button>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; value: string; onValueChange: (v: string) => void }) =>
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
  SelectValue: () => null,
}))

const renderDialog = (props?: Partial<React.ComponentProps<typeof S3PairingImportDialog>>) => {
  const container = document.createElement('div')
  const root = createRoot(container)
  const onImport = vi.fn()
  act(() => {
    root.render(
      <S3PairingImportDialog
        open
        onOpenChange={vi.fn()}
        importing={false}
        poTargets={[{ id: 1, name: 'PO Feb', strDtLoc: '2026-02-01', endDtLoc: '2026-02-28' }]}
        baseOptions={[{ value: 'YYZ', label: 'YYZ' }]}
        divisionOptions={[{ value: 'P', label: 'P' }]}
        onImport={onImport}
        {...props}
      />,
    )
  })
  return { container, onImport }
}

describe('S3PairingImportDialog', () => {
  it('renders title and disables Import PO until a PRG file is selected', () => {
    const { container } = renderDialog()

    expect(container.textContent).toContain('S3 Pairing Import')
    expect((container.querySelector('[data-testid="s3-pairing-import-confirm"]') as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables import for existing PO target when PRG file is selected', () => {
    const { container } = renderDialog()
    const file = new File(['PRG'], 'sample.PRG')

    act(() => {
      Object.defineProperty(container.querySelector('[data-testid="s3-pairing-file"]'), 'files', { value: [file] })
      container.querySelector<HTMLInputElement>('[data-testid="s3-pairing-file"]')?.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect((container.querySelector('[data-testid="s3-pairing-import-confirm"]') as HTMLButtonElement).disabled).toBe(false)
  })

  it('requires date range, base, and division for new target mode', () => {
    const { container } = renderDialog()

    act(() => {
      ;(container.querySelector('[data-testid="s3-target-mode-new"]') as HTMLInputElement).click()
    })

    expect(container.textContent).toContain('New Pairing Scenario')
    expect((container.querySelector('[data-testid="s3-pairing-import-confirm"]') as HTMLButtonElement).disabled).toBe(true)
  })
})
```

- [ ] **Step 2: Run dialog tests and verify they fail**

Run:

```bash
cd gantt
npm test -- src/components/scenario/__tests__/s3-pairing-import-dialog.test.tsx
```

Expected: fail because component does not exist.

- [ ] **Step 3: Implement dialog**

Create `gantt/src/components/scenario/s3-pairing-import-dialog.tsx`:

```tsx
import { useState, type ChangeEvent, type ReactNode } from 'react'
import { Download, Loader2 } from 'lucide-react'
import {
  AppDialog,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@rois/ui'
import type { S3PairingImportInput, S3PairingPoTarget } from '@/services/scenario-api'

interface Option {
  value: string
  label: string
}

interface S3PairingImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  poTargets: S3PairingPoTarget[]
  baseOptions: Option[]
  divisionOptions: Option[]
  importing: boolean
  onImport: (input: S3PairingImportInput) => void | Promise<void>
}

const today = (): string => new Date().toISOString().slice(0, 10)

const Field = ({ label, children }: { label: string; children: ReactNode }): ReactNode => (
  <div className="flex flex-col gap-1.5">
    <span className="text-2xs font-medium text-muted-foreground">{label}</span>
    {children}
  </div>
)

export const S3PairingImportDialog = ({
  open,
  onOpenChange,
  poTargets,
  baseOptions,
  divisionOptions,
  importing,
  onImport,
}: S3PairingImportDialogProps): ReactNode => {
  const [file, setFile] = useState<File | null>(null)
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>('existing')
  const [targetScenarioId, setTargetScenarioId] = useState<string>(() => poTargets[0]?.id ? String(poTargets[0].id) : '')
  const [clearBeforeImport, setClearBeforeImport] = useState(false)
  const [newScenarioName, setNewScenarioName] = useState('')
  const [newStrDtLoc, setNewStrDtLoc] = useState(today)
  const [newEndDtLoc, setNewEndDtLoc] = useState(today)
  const [newBase, setNewBase] = useState('')
  const [newDivision, setNewDivision] = useState('')

  const datesValid = newStrDtLoc !== '' && newEndDtLoc !== '' && newStrDtLoc <= newEndDtLoc
  const existingReady = targetMode === 'existing' && targetScenarioId !== ''
  const newReady = targetMode === 'new' && datesValid && newBase !== '' && newDivision !== ''
  const canImport = !!file && !importing && (existingReady || newReady)

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const selected = event.target.files?.[0] ?? null
    setFile(selected && /\.prg$/i.test(selected.name) ? selected : null)
  }

  const handleImport = (): void => {
    if (!file || !canImport) return
    if (targetMode === 'existing') {
      void onImport({
        file,
        targetMode,
        targetScenarioId: Number(targetScenarioId),
        clearBeforeImport,
      })
      return
    }
    void onImport({
      file,
      targetMode,
      clearBeforeImport: false,
      newScenarioName: newScenarioName.trim() || undefined,
      newStrDtLoc,
      newEndDtLoc,
      newBase,
      newDivision,
    })
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(next: boolean) => { if (!importing) onOpenChange(next) }}
      data-testid="s3-pairing-import-dialog"
      className="sm:max-w-[560px]"
      dismissable={!importing}
      icon={<Download className="h-4 w-4" />}
      title="S3 Pairing Import"
      footer={
        <>
          <Button variant="ghost" size="sm" data-testid="s3-pairing-import-cancel" disabled={importing} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="gap-1.5" data-testid="s3-pairing-import-confirm" disabled={!canImport} onClick={handleImport}>
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {importing ? 'Importing...' : 'Import PO'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 py-1 text-xs">
        <Field label="PRG file">
          <Input data-testid="s3-pairing-file" type="file" accept=".PRG,.prg" className="h-8 text-xs" onChange={handleFileChange} />
        </Field>

        <Field label="Target">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={targetMode === 'existing'} onChange={() => setTargetMode('existing')} />
              Existing PO Scenario
            </label>
            <label className="flex items-center gap-1.5">
              <input data-testid="s3-target-mode-new" type="radio" checked={targetMode === 'new'} onChange={() => setTargetMode('new')} />
              New Pairing Scenario
            </label>
          </div>
        </Field>

        {targetMode === 'existing' ? (
          <>
            <Field label="PO Scenario">
              <Select value={targetScenarioId} onValueChange={setTargetScenarioId}>
                <SelectTrigger data-testid="s3-target-scenario" className="h-8 text-xs">
                  <SelectValue placeholder="Select PO scenario" />
                </SelectTrigger>
                <SelectContent>
                  {poTargets.map((target) => (
                    <SelectItem key={target.id} value={String(target.id)} className="text-xs">
                      #{target.id} {target.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={clearBeforeImport} onChange={(event) => setClearBeforeImport(event.target.checked)} />
              Clear selected PO scenario before import
            </label>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="text-xs font-semibold text-foreground">New Pairing Scenario</div>
            <Field label="Scenario name">
              <Input className="h-8 text-xs" value={newScenarioName} placeholder="S3 Pairing <filename>" onChange={(event) => setNewScenarioName(event.target.value)} />
            </Field>
            <Field label="Date range">
              <div className="flex items-center gap-2">
                <Input type="date" className="h-8 text-xs" value={newStrDtLoc} max={newEndDtLoc || undefined} onChange={(event) => setNewStrDtLoc(event.target.value)} />
                <span className="text-muted-foreground">to</span>
                <Input type="date" className="h-8 text-xs" value={newEndDtLoc} min={newStrDtLoc || undefined} onChange={(event) => setNewEndDtLoc(event.target.value)} />
              </div>
            </Field>
            <Field label="Base">
              <Select value={newBase} onValueChange={setNewBase}>
                <SelectTrigger data-testid="s3-new-base" className="h-8 text-xs"><SelectValue placeholder="Select base" /></SelectTrigger>
                <SelectContent>{baseOptions.map((option) => <SelectItem key={option.value} value={option.value} className="text-xs">{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Division">
              <Select value={newDivision} onValueChange={setNewDivision}>
                <SelectTrigger data-testid="s3-new-division" className="h-8 text-xs"><SelectValue placeholder="Select division" /></SelectTrigger>
                <SelectContent>{divisionOptions.map((option) => <SelectItem key={option.value} value={option.value} className="text-xs">{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        )}
      </div>
    </AppDialog>
  )
}
```

- [ ] **Step 4: Run dialog tests and verify they pass**

Run:

```bash
cd gantt
npm test -- src/components/scenario/__tests__/s3-pairing-import-dialog.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit dialog**

```bash
git add gantt/src/components/scenario/s3-pairing-import-dialog.tsx gantt/src/components/scenario/__tests__/s3-pairing-import-dialog.test.tsx
git commit -m "feat: add S3 pairing import dialog"
```

## Task 6: Scenarios Screen Entry Point

**Files:**
- Modify: `gantt/src/components/scenario/scenario-list-panel.tsx`
- Create: `gantt/src/components/scenario/__tests__/scenario-list-panel-s3-pairing.test.tsx`

- [ ] **Step 1: Write ScenarioListPanel test**

Create `gantt/src/components/scenario/__tests__/scenario-list-panel-s3-pairing.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ScenarioListPanel } from '../scenario-list-panel'

vi.mock('@/stores/scenario-store', () => ({
  useScenarioStore: (selector: (s: Record<string, unknown>) => unknown) => selector({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    listLoading: false,
    selectedId: null,
    saving: false,
    selectScenario: vi.fn(),
    removeScenario: vi.fn(),
    renameScenario: vi.fn(),
    duplicateScenario: vi.fn(),
    createNew: vi.fn(),
    setPage: vi.fn(),
    setFilterType: vi.fn(),
    fetchList: vi.fn(),
  }),
}))

vi.mock('@/stores/shell-store', () => ({
  useShellStore: (selector: (s: Record<string, unknown>) => unknown) => selector({
    activeScenarioItem: 'po',
    activeModule: 'scenario',
  }),
}))

vi.mock('@/services/scenario-api', () => ({
  scenarioApi: {
    listS3PairingPoTargets: vi.fn(async () => ({ items: [] })),
    importS3Pairing: vi.fn(async () => ({ scenarioId: 1, createdScenario: true, importedPairings: 1, importedSegments: 2, importedCompositions: 2, warnings: [] })),
  },
}))

vi.mock('@/services/reference-api', () => ({
  referenceApi: {
    listBases: vi.fn(async () => [{ base: 'YYZ', name: 'Toronto' }]),
  },
}))

vi.mock('@/services/dictionary-api', () => ({
  dictionaryApi: {
    getByParentCode: vi.fn(async () => [{ id: 1, parentCode: 'DIVISION', code: 'P', name: 'Pilot', idx: 1, codeValue: null }]),
  },
}))

vi.mock('@rois/ui', () => ({
  AppDialog: ({ open, title, children, footer }: { open: boolean; title: string; children: React.ReactNode; footer?: React.ReactNode }) => open ? <div data-testid="dialog"><h1>{title}</h1>{children}{footer}</div> : null,
  Button: ({ children, onClick, 'aria-label': ariaLabel, 'data-testid': testId }: { children: React.ReactNode; onClick?: () => void; 'aria-label'?: string; 'data-testid'?: string }) => <button aria-label={ariaLabel} data-testid={testId} onClick={onClick}>{children}</button>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Select: ({ children }: { children: React.ReactNode }) => <select>{children}</select>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}))

vi.mock('../scenario-search-bar', () => ({ ScenarioSearchBar: () => <div /> }))
vi.mock('../scenario-empty-state', () => ({ ScenarioEmptyState: () => <div /> }))
vi.mock('../scenario-run-health-indicator', () => ({ ScenarioRunHealthIndicator: () => <div /> }))
vi.mock('../scenario-list-item', () => ({ ScenarioListItem: () => <div /> }))
vi.mock('../import-pbs-dialog', () => ({ ImportPbsDialog: ({ open }: { open: boolean }) => open ? <div data-testid="import-pbs-dialog" /> : null }))

describe('ScenarioListPanel S3 Pairing entry point', () => {
  it('places S3 Pairing before Import PBS material and opens the dialog', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<ScenarioListPanel />)
    })

    const s3Button = container.querySelector('[aria-label="S3 Pairing"]')
    const pbsButton = container.querySelector('[aria-label="Import PBS material"]')
    expect(s3Button).not.toBeNull()
    expect(pbsButton).not.toBeNull()
    expect(s3Button?.compareDocumentPosition(pbsButton as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await act(async () => {
      ;(s3Button as HTMLButtonElement).click()
    })

    expect(container.textContent).toContain('S3 Pairing Import')
  })
})
```

- [ ] **Step 2: Run ScenarioListPanel test and verify it fails**

Run:

```bash
cd gantt
npm test -- src/components/scenario/__tests__/scenario-list-panel-s3-pairing.test.tsx
```

Expected: fail because button is missing.

- [ ] **Step 3: Wire S3 Pairing button and dialog**

Modify imports in `gantt/src/components/scenario/scenario-list-panel.tsx`:

```ts
import { Loader2, ChevronLeft, ChevronRight, Plus, Upload, Trash2, Pencil, Download } from 'lucide-react'
import { scenarioApi, type S3PairingImportInput, type S3PairingPoTarget } from '@/services/scenario-api'
import { referenceApi } from '@/services/reference-api'
import { dictionaryApi } from '@/services/dictionary-api'
import { S3PairingImportDialog } from './s3-pairing-import-dialog'
import { notify } from '@/utils/notify'
```

Add state inside `ScenarioListPanel`:

```ts
  const [s3ImportOpen, setS3ImportOpen] = useState(false)
  const [s3Importing, setS3Importing] = useState(false)
  const [s3PoTargets, setS3PoTargets] = useState<S3PairingPoTarget[]>([])
  const [s3BaseOptions, setS3BaseOptions] = useState<Array<{ value: string; label: string }>>([])
  const [s3DivisionOptions, setS3DivisionOptions] = useState<Array<{ value: string; label: string }>>([])
```

Add handlers:

```ts
  const handleS3Pairing = (): void => {
    setS3ImportOpen(true)
    void Promise.all([
      scenarioApi.listS3PairingPoTargets(),
      referenceApi.listBases(),
      dictionaryApi.getByParentCode('DIVISION'),
    ]).then(([targets, bases, divisions]) => {
      setS3PoTargets(targets.items)
      setS3BaseOptions(bases.map((b) => ({ value: b.base, label: b.name ? `${b.base} - ${b.name}` : b.base })))
      setS3DivisionOptions(divisions.map((d) => ({ value: d.code ?? '', label: d.name ? `${d.code ?? ''} - ${d.name}` : (d.code ?? '') })).filter((d) => d.value !== ''))
    }).catch(() => {
      notify.error('Failed to load S3 Pairing import options')
    })
  }

  const handleS3Import = async (input: S3PairingImportInput): Promise<void> => {
    setS3Importing(true)
    try {
      const result = await scenarioApi.importS3Pairing(input)
      notify.success(`Imported ${result.importedPairings} pairings`)
      setS3ImportOpen(false)
      await fetchList()
      await selectScenario(result.scenarioId)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to import S3 Pairing')
    } finally {
      setS3Importing(false)
    }
  }
```

Add `fetchList` selector near existing store selectors:

```ts
  const fetchList = useScenarioStore((s) => s.fetchList)
```

Insert the S3 button immediately before the existing Import PBS material tooltip:

```tsx
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                data-testid="scenario-s3-pairing-btn"
                aria-label="S3 Pairing"
                className="h-7 w-7 p-0"
                onClick={handleS3Pairing}
                disabled={saving}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              S3 Pairing
            </TooltipContent>
          </Tooltip>
```

Render dialog near `ImportPbsDialog`:

```tsx
      <S3PairingImportDialog
        open={s3ImportOpen}
        onOpenChange={setS3ImportOpen}
        importing={s3Importing}
        poTargets={s3PoTargets}
        baseOptions={s3BaseOptions}
        divisionOptions={s3DivisionOptions}
        onImport={handleS3Import}
      />
```

- [ ] **Step 4: Run ScenarioListPanel test and verify it passes**

Run:

```bash
cd gantt
npm test -- src/components/scenario/__tests__/scenario-list-panel-s3-pairing.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit Scenarios entry point**

```bash
git add gantt/src/components/scenario/scenario-list-panel.tsx gantt/src/components/scenario/__tests__/scenario-list-panel-s3-pairing.test.tsx
git commit -m "feat: add S3 pairing import entry point"
```

## Task 7: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
cd live-server
npm test -- src/services/scenario/__tests__/s3-pairing-prg-parser.test.ts src/services/scenario/__tests__/s3-pairing-import-service.test.ts src/__tests__/unit/scenario-s3-pairing-import-route.test.ts
```

Expected: all focused backend tests pass.

- [ ] **Step 2: Run focused frontend tests**

Run:

```bash
cd gantt
npm test -- src/services/__tests__/scenario-api.test.ts src/components/scenario/__tests__/s3-pairing-import-dialog.test.tsx src/components/scenario/__tests__/scenario-list-panel-s3-pairing.test.tsx
```

Expected: all focused frontend tests pass.

- [ ] **Step 3: Run builds**

Run:

```bash
cd live-server
npm run build
```

Expected: TypeScript build succeeds.

Run:

```bash
cd gantt
npm run build
```

Expected: TypeScript and Vite build succeeds.

- [ ] **Step 4: Manual database verification**

With live-server pointed at a local schema and after importing `docs/modules/connector-server/2026_FEB_PILOT_PAIRINGS_A_CT.PRG`, run:

```sql
select count(*) from scenario.pairing where scenario_id = :scenario_id;
select count(*) from scenario.pairing_segment where scenario_id = :scenario_id;
select count(*) from scenario.pairing_composition where scenario_id = :scenario_id;
select pairing_label, base, division, fleet, duty_count, seg_count
from scenario.pairing
where scenario_id = :scenario_id
order by id
limit 5;
```

Expected: all three counts are greater than zero, and imported labels include `T4101`.

- [ ] **Step 5: Final commit if verification caused fixes**

If any verification fixes were required:

```bash
git add live-server gantt
git commit -m "fix: stabilize S3 pairing import"
```

If no fixes were required, do not create an empty commit.
