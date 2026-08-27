/**
 * Regression tests for case-insensitive param_json header lookup in
 * legality-recheck-core.mjs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

vi.mock('node:child_process', () => ({ spawn: vi.fn(), spawnSync: vi.fn() }))

const writeFileCalls: Array<[unknown, unknown]> = []

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  const skipFreshness = {
    readdirSync: vi.fn(() => {
      throw new Error('skip freshness walk in unit tests')
    }),
    statSync: vi.fn(() => ({ mtimeMs: 0 })),
  }
  const writeFileSync = ((...args: Parameters<typeof actual.writeFileSync>) => {
    writeFileCalls.push([args[0], args[1]])
    return actual.writeFileSync(...args)
  }) as typeof actual.writeFileSync
  return {
    ...actual,
    ...skipFreshness,
    writeFileSync,
    default: {
      ...actual.default,
      ...skipFreshness,
      writeFileSync,
    },
  }
})

import { spawn } from 'node:child_process'
import { doStartGrace1001, rule1001, rule7501, rule7504, rule7505, rule8002, rule8056, doStartMin } from '../../scripts/legality-recheck-core.mjs'

const mockSpawn = vi.mocked(spawn)

function fakeBin(tsvLine: string): void {
  mockSpawn.mockImplementationOnce(() => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter
      stderr: EventEmitter
    }
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    process.nextTick(() => {
      if (tsvLine) child.stdout.emit('data', Buffer.from(tsvLine))
      child.emit('close', 0)
    })
    return child as never
  })
}

/** runBin feeds binaries via a temp file; capture that TSV from writeFileSync. */
function lastBinInput(): string {
  if (!writeFileCalls.length) return ''
  return String(writeFileCalls[writeFileCalls.length - 1][1] ?? '')
}

const FAKE_SPACING_VIOLATION = 'crew1\t9001\t1000000\t1001800\t30\tP1\tP2'

describe('param_json header case-insensitive lookup', () => {
  beforeEach(() => {
    mockSpawn.mockReset()
    writeFileCalls.length = 0
  })

  describe('rule8056', () => {
    it('reads SPACE from an ALL-UPPERCASE header', async () => {
      fakeBin(FAKE_SPACING_VIOLATION)
      const source = {
        flyByPairing: vi.fn().mockResolvedValue([
          {
            crew_id: 'crew1',
            pairing_id: 9001,
            start_secs: 900_000,
            end_secs: 1_000_000,
            label: 'P1',
            assignment_group: 'FLY',
          },
        ]),
      }
      const ctx = {
        log: vi.fn(),
        instancesOf: (fn: number) =>
          fn === 8056
            ? [
                {
                  instance: '001',
                  header: ['BASES', 'RANKS', 'SPACE', 'UNIT', 'ASSIGNMENT GROUP A', 'ASSIGNMENT GROUP B'],
                  rows: [['*', '*', '13', 'RH', 'FLY', 'FLY|SBY|SIM']],
                },
              ]
            : [],
      }

      const violations = (await rule8056(source as never, ctx as never)) as Array<{
        limit_value: number
        message: string
      }>

      expect(violations).toHaveLength(1)
      expect(violations[0].limit_value).toBe(13)
      expect(violations[0].message).toContain('below the required 13 RH')
    })

    it('emits nothing when the rule set has no 8056 instances', async () => {
      fakeBin(FAKE_SPACING_VIOLATION)
      const source = {
        flyByPairing: vi.fn().mockResolvedValue([
          {
            crew_id: 'crew1',
            pairing_id: 9001,
            start_secs: 900_000,
            end_secs: 1_000_000,
            label: 'P1',
            assignment_group: 'FLY',
          },
        ]),
      }
      const ctx = {
        log: vi.fn(),
        instancesOf: () => [],
      }

      const violations = await rule8056(source as never, ctx as never)

      expect(violations).toEqual([])
      expect(source.flyByPairing).not.toHaveBeenCalled()
    })

    it('formats warning message with labels and date-times together', async () => {
      fakeBin('crew1\t9001\t1760914800\t1760922000\t120\tP1\tP2')
      const source = {
        flyByPairing: vi.fn().mockResolvedValue([
          {
            crew_id: 'crew1',
            pairing_id: 9001,
            start_secs: 900_000,
            end_secs: 1_000_000,
            label: 'P1',
            assignment_group: 'FLY',
          },
        ]),
      }
      const ctx = {
        log: vi.fn(),
        instancesOf: (fn: number) =>
          fn === 8056
            ? [
                {
                  instance: '001',
                  header: ['Assignment Group A', 'Assignment Group B', 'Space', 'Unit'],
                  rows: [['FLY', 'FLY|SBY|SIM', '24', 'RH']],
                },
              ]
            : [],
      }

      const violations = (await rule8056(source as never, ctx as never)) as Array<{ message: string }>

      expect(violations).toHaveLength(1)
      expect(violations[0].message).toBe(
        'Rest between (P1 2025-10-19 23:00) and (P2 2025-10-20 01:00) is 2:00, which is below the required 24 RH.',
      )
    })

    it('formats 8056 warning timestamps in the duty row timezone', async () => {
      fakeBin('crew1\t9001\t1760914800\t1760922000\t120\tP1\tP2')
      const source = {
        flyByPairing: vi.fn().mockResolvedValue([
          {
            crew_id: 'crew1',
            pairing_id: 9001,
            start_secs: 1_760_910_000,
            end_secs: 1_760_914_800,
            label: 'P1',
            assignment_group: 'FLY',
            assignment: 'FLY',
            zone_id: 'America/Vancouver',
          },
        ]),
      }
      const ctx = {
        log: vi.fn(),
        instancesOf: (fn: number) =>
          fn === 8056
            ? [
                {
                  instance: '001',
                  header: ['Assignment Group A', 'Assignment Group B', 'Space', 'Unit'],
                  rows: [['FLY', 'FLY|SBY|SIM', '24', 'RH']],
                },
              ]
            : [],
      }

      const violations = (await rule8056(source as never, ctx as never)) as Array<{ message: string }>

      expect(violations).toHaveLength(1)
      expect(violations[0].message).toBe(
        'Rest between (P1 2025-10-19 16:00) and (P2 2025-10-19 18:00) is 2:00, which is below the required 24 RH.',
      )
    })

    it('falls back to UTC when the duty row timezone is missing', async () => {
      fakeBin('crew1\t9001\t1760914800\t1760922000\t120\tP1\tP2')
      const source = {
        flyByPairing: vi.fn().mockResolvedValue([
          {
            crew_id: 'crew1',
            pairing_id: 9001,
            start_secs: 1_760_910_000,
            end_secs: 1_760_914_800,
            label: 'P1',
            assignment_group: 'FLY',
            assignment: 'FLY',
          },
        ]),
      }
      const ctx = {
        log: vi.fn(),
        instancesOf: (fn: number) =>
          fn === 8056
            ? [
                {
                  instance: '001',
                  header: ['Assignment Group A', 'Assignment Group B', 'Space', 'Unit'],
                  rows: [['FLY', 'FLY|SBY|SIM', '24', 'RH']],
                },
              ]
            : [],
      }

      const violations = (await rule8056(source as never, ctx as never)) as Array<{ message: string }>

      expect(violations).toHaveLength(1)
      expect(violations[0].message).toBe(
        'Rest between (P1 2025-10-19 23:00) and (P2 2025-10-20 01:00) is 2:00, which is below the required 24 RH.',
      )
    })

    it('passes Unit=CD and crew offset through to check-8056', async () => {
      fakeBin('crew1\t9001\t1760914800\t1760922000\t2\tP1\tP2')
      const source = {
        crewOffsets: vi.fn().mockResolvedValue(new Map([['crew1', -420]])),
        flyByPairing: vi.fn().mockResolvedValue([
          {
            crew_id: 'crew1',
            pairing_id: 9001,
            start_secs: 1_760_910_000,
            end_secs: 1_760_914_800,
            label: 'P1',
            assignment_group: 'FLY',
            assignment: 'FLY',
            zone_id: 'America/Vancouver',
          },
        ]),
      }
      const ctx = {
        log: vi.fn(),
        instancesOf: (fn: number) =>
          fn === 8056
            ? [
                {
                  instance: '001',
                  header: ['Assignment Group A', 'Assignment Group B', 'Space', 'Unit'],
                  rows: [['FLY', 'FLY|SBY|SIM', '3', 'CD']],
                },
              ]
            : [],
      }

      const violations = (await rule8056(source as never, ctx as never)) as Array<{
        actual_value: number
        limit_value: number
        unit: string
        message: string
      }>

      expect(source.crewOffsets).toHaveBeenCalledOnce()
      expect(violations).toHaveLength(1)
      expect(violations[0].actual_value).toBe(2)
      expect(violations[0].limit_value).toBe(3)
      expect(violations[0].unit).toBe('DAY')
      expect(violations[0].message).toBe(
        'Rest between (P1 2025-10-19 16:00) and (P2 2025-10-19 18:00) is 2, which is below the required 3 CD.',
      )
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('check-8056'),
        ['--emit-tsv'],
        expect.anything(),
      )
      const input = lastBinInput()
      expect(input).toContain('\t3\tCD\t')
      expect(input.split('\n')).toContain(
        'D\tcrew1\t9001\t1760910000\t1760914800\t1760914800\tP1\tFLY\tFLY\t*\tFLY\t\t\tN\t\t\tN\t-420',
      )
    })
  })

  describe('rule7505', () => {
    const header = [
      'Min DO', 'RP Days Range', 'Leave Days Range', 'Count Blank Day',
      'Utilize Post Duty Rest', 'Leave Assignments', 'Period', 'Unit',
    ]
    const rows = [['12', '31-31', '0-0', 'N', 'N', '*', '1', 'RP']]
    const ctx7505 = {
      log: vi.fn(),
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      instancesOf: (fn: number) =>
        fn === 7505 ? [{ instance: '001', header, rows }] : [],
    }

    it('runs 7505 per crew with the crew-local RP UTC window while keeping dateFrom/dateTo in the message', async () => {
      fakeBin('crew1\t1780286400\t1782878400\t3\t12\t1\tRP')
      const source = {
        firstPairingByCrew: vi.fn().mockResolvedValue(new Map([['crew1', 9001]])),
        crewOffsets: vi.fn().mockResolvedValue(new Map([['crew1', -240]])),
        assignmentsAll: vi.fn().mockResolvedValue([
          { crew_id: 'crew1', pairing_id: 9001, code: 'DO', s: 1_780_286_460, e: 1_780_372_800 },
        ]),
      }

      const violations = (await rule7505(source as never, ctx7505 as never)) as Array<{
        start_dt: string
        end_dt: string
        window_start_dt: string
        window_end_dt: string
        message: string
      }>

      expect(violations).toHaveLength(1)
      expect(source.crewOffsets).toHaveBeenCalledOnce()
      expect(violations[0].start_dt).toBe('2026-06-01T04:00:00.000Z')
      expect(violations[0].end_dt).toBe('2026-07-01T03:59:59.000Z')
      expect(violations[0].window_start_dt).toBe('2026-06-01T00:00:00.000Z')
      expect(violations[0].window_end_dt).toBe('2026-06-30T23:59:59.999Z')
      expect(violations[0].message).toBe(
        'The number of days off(3) must be at least 12 in 1 RP (2026-06-01, 2026-06-30).',
      )
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('check-7505'),
        ['--rp-start', '1780286400', '--rp-end', '1782878400', '--offset', '-240', '--do-start-min', '0', '--emit-tsv'],
        expect.anything(),
      )
    })

    it('anchors 7505 to the first pairing that actually overlaps the crew-local RP window', async () => {
      fakeBin('crew1\t1780297200\t1782889200\t3\t12\t1\tRP')
      const source = {
        firstPairingByCrew: vi.fn().mockResolvedValue(new Map([['crew1', 9001]])),
        crewOffsets: vi.fn().mockResolvedValue(new Map([['crew1', -420]])),
        assignmentsAll: vi.fn().mockResolvedValue([
          { crew_id: 'crew1', pairing_id: 9001, code: 'FLY', s: 1_780_282_800, e: 1_780_290_000 },
          { crew_id: 'crew1', pairing_id: 9002, code: 'FLY', s: 1_780_300_800, e: 1_780_308_000 },
          { crew_id: 'crew1', pairing_id: null, code: 'DO', s: 1_780_308_000, e: 1_780_311_600 },
        ]),
      }

      const violations = (await rule7505(source as never, ctx7505 as never)) as Array<{
        pairing_id: number
      }>

      expect(violations).toHaveLength(1)
      expect(violations[0].pairing_id).toBe(9002)
      expect(source.firstPairingByCrew).not.toHaveBeenCalled()
    })

    it('passes post-duty rest end into 7505 activities when the rule counts post rest', async () => {
      fakeBin('')
      const source = {
        crewOffsets: vi.fn().mockResolvedValue(new Map([['crew1', 0]])),
        assignmentsAll: vi.fn().mockResolvedValue([
          {
            crew_id: 'crew1',
            pairing_id: 9001,
            code: 'FLY',
            s: 1_780_300_000,
            e: 1_780_310_000,
            end_rest_secs: 1_780_340_000,
          },
        ]),
      }

      await rule7505(source as never, ctx7505 as never)

      expect(lastBinInput()).toContain('A\tcrew1\tFLY\t1780300000\t1780310000\t1780340000')
    })
  })

  describe('rule7504', () => {
    // PDT (UTC-7): 2026-08-04 06:30Z → 2026-08-03 23:30 local; 2026-08-05 08:00Z → 2026-08-05 01:00 local.
    const duty1Start = Math.floor(Date.parse('2026-08-04T06:30:00.000Z') / 1000)
    const duty1End = Math.floor(Date.parse('2026-08-04T10:00:00.000Z') / 1000)
    const duty2Start = Math.floor(Date.parse('2026-08-05T08:00:00.000Z') / 1000)
    const header7504 = ['Min Period', 'Unit', 'Bases', 'Ranks']
    const header7503 = ['WOCL Start', 'WOCL End', 'Max Consecutive WOCLs']
    const ctx7504 = {
      log: vi.fn(),
      instancesOf: (fn: number) => {
        if (fn === 7504) {
          return [{ instance: '001', header: header7504, rows: [['55', 'RH', '*', '*']] }]
        }
        if (fn === 7503) {
          return [{ instance: '001', header: header7503, rows: [['02:00', '05:59', '2']] }]
        }
        return []
      },
    }

    it('appends both WOCL duty_start dates in crew base timezone', async () => {
      // TSV: crew, pairing, gapStart, gapEnd, offsetMin, actualMin
      fakeBin(`crew1\t9001\t${duty1End}\t${duty2Start}\t-420\t120`)
      const source = {
        crewOffsets: vi.fn().mockResolvedValue(new Map([['crew1', -420]])),
        crewBaseTimezone: vi.fn().mockResolvedValue(new Map([['crew1', 'America/Vancouver']])),
        flyDuties: vi.fn().mockResolvedValue([
          { crew_id: 'crew1', pairing_id: 9001, start_secs: duty1Start, end_secs: duty1End },
          { crew_id: 'crew1', pairing_id: 9002, start_secs: duty2Start, end_secs: duty2Start + 3600 },
        ]),
      }

      const violations = (await rule7504(source as never, ctx7504 as never)) as Array<{ message: string }>
      expect(violations).toHaveLength(1)
      expect(violations[0].message).toBe(
        'Rest between consecutive WOCL flight duties (2026-08-03, 2026-08-05) is 02:00 less than 55 RH.',
      )
    })

    it('fires when consecutive FLY duties are WOCL only after brief (15152/15279 shape)', async () => {
      // Flight dep would be 13:45Z = 06:45 PDT (outside WOCL). Duty/brief 12:45Z = 05:45 PDT (inside).
      // Crew base YVR offset -420. Gap between duty ends/starts < 55 RH → bin emits violation.
      const p15152Start = Math.floor(Date.parse('2026-07-15T12:45:00.000Z') / 1000)
      const p15152End = Math.floor(Date.parse('2026-07-15T18:05:00.000Z') / 1000)
      const p15279Start = Math.floor(Date.parse('2026-07-17T12:45:00.000Z') / 1000)
      const p15279End = Math.floor(Date.parse('2026-07-17T18:05:00.000Z') / 1000)
      // gap ~46.7h < 55 RH
      fakeBin(`2560\t15152\t${p15152End}\t${p15279Start}\t-420\t2800`)
      const source = {
        crewOffsets: vi.fn().mockResolvedValue(new Map([['2560', -420]])),
        crewBaseTimezone: vi.fn().mockResolvedValue(new Map([['2560', 'America/Vancouver']])),
        flyDuties: vi.fn().mockResolvedValue([
          { crew_id: '2560', pairing_id: 15152, start_secs: p15152Start, end_secs: p15152End },
          { crew_id: '2560', pairing_id: 15279, start_secs: p15279Start, end_secs: p15279End },
        ]),
      }

      const violations = (await rule7504(source as never, ctx7504 as never)) as Array<{
        rule_code: string
        crew_id: string
      }>
      expect(violations).toHaveLength(1)
      expect(violations[0].crew_id).toBe('2560')

      // The engine must be fed the DUTY (brief) starts. Flight dep would be 13:45Z, which is
      // outside WOCL — feeding those instead would silently stop 7504 from firing here.
      const input = lastBinInput()
      expect(input).toContain(`D\t2560\t15152\t${p15152Start}\t${p15152End}\t`)
      expect(input).toContain(`D\t2560\t15279\t${p15279Start}\t${p15279End}\t`)
      const flightDep15152 = Math.floor(Date.parse('2026-07-15T13:45:00.000Z') / 1000)
      const flightDep15279 = Math.floor(Date.parse('2026-07-17T13:45:00.000Z') / 1000)
      expect(input).not.toContain(String(flightDep15152))
      expect(input).not.toContain(String(flightDep15279))
    })

    it('falls back to UTC when crewBaseTimezone misses the crew', async () => {
      fakeBin(`crew1\t9001\t${duty1End}\t${duty2Start}\t0\t120`)
      const source = {
        crewOffsets: vi.fn().mockResolvedValue(new Map([['crew1', 0]])),
        crewBaseTimezone: vi.fn().mockResolvedValue(new Map()),
        flyDuties: vi.fn().mockResolvedValue([
          { crew_id: 'crew1', pairing_id: 9001, start_secs: duty1Start, end_secs: duty1End },
          { crew_id: 'crew1', pairing_id: 9002, start_secs: duty2Start, end_secs: duty2Start + 3600 },
        ]),
      }

      const violations = (await rule7504(source as never, ctx7504 as never)) as Array<{ message: string }>
      expect(violations).toHaveLength(1)
      expect(violations[0].message).toBe(
        'Rest between consecutive WOCL flight duties (2026-08-04, 2026-08-05) is 02:00 less than 55 RH.',
      )
    })

    it('Unit=CD formats calendar days (RH path unchanged)', async () => {
      fakeBin(`crew1\t9001\t${duty1End}\t${duty2Start}\t-420\t0`)
      const ctxCd = {
        log: vi.fn(),
        instancesOf: (fn: number) => {
          if (fn === 7504) {
            return [{ instance: '001', header: header7504, rows: [['2', 'CD', '*', '*']] }]
          }
          if (fn === 7503) {
            return [{ instance: '001', header: header7503, rows: [['02:00', '05:59', '2']] }]
          }
          return []
        },
      }
      const source = {
        crewOffsets: vi.fn().mockResolvedValue(new Map([['crew1', -420]])),
        crewBaseTimezone: vi.fn().mockResolvedValue(new Map([['crew1', 'America/Vancouver']])),
        flyDuties: vi.fn().mockResolvedValue([
          { crew_id: 'crew1', pairing_id: 9001, start_secs: duty1Start, end_secs: duty1End },
          { crew_id: 'crew1', pairing_id: 9002, start_secs: duty2Start, end_secs: duty2Start + 3600 },
        ]),
      }

      const violations = (await rule7504(source as never, ctxCd as never)) as Array<{
        message: string
        unit: string
        actual_value: number
      }>
      expect(violations).toHaveLength(1)
      expect(violations[0].unit).toBe('DAY')
      expect(violations[0].actual_value).toBe(0)
      expect(violations[0].message).toBe(
        'Rest between consecutive WOCL flight duties (2026-08-03, 2026-08-05) is 0 less than 2 CD.',
      )
      const binArgs = mockSpawn.mock.calls[0]?.[1] as string[]
      expect(binArgs).toEqual(expect.arrayContaining(['--unit', 'CD']))
    })
  })

  describe('rule7501', () => {
    // PDT (UTC-7): window 2026-06-02 00:00 .. 2026-06-09 00:00 local.
    const ws = Math.floor(Date.parse('2026-06-02T07:00:00.000Z') / 1000)
    const we = Math.floor(Date.parse('2026-06-09T07:00:00.000Z') / 1000)
    const header7501 = ['Period', 'Unit', 'Duty End Buffer', 'Min Limits']
    const fmtLocal = (epoch: number, zone: string) => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date(epoch * 1000))
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
      return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
    }

    it('includes crew-base local YYYY-MM-DD HH:mm rolling window in C++-shaped message', async () => {
      const zone = 'America/Vancouver'
      // Structured check-7501 output: rowId, crew, ws, we, sdfd, lim, period, unit, triggerPairingId
      fakeBin(`0\tcrew1\t${ws}\t${we}\t1\t3\t168\tRH\t9001`)
      const source = {
        crewOffsets: vi.fn().mockResolvedValue(new Map([['crew1', -420]])),
        crewBaseTimezone: vi.fn().mockResolvedValue(new Map([['crew1', zone]])),
        flyDuties: vi.fn().mockResolvedValue([
          { crew_id: 'crew1', pairing_id: 9001, start_secs: ws, end_secs: ws + 3600 },
        ]),
        groundWork: vi.fn().mockResolvedValue([]),
        crewQualEntries: vi.fn().mockResolvedValue([
          { crew_id: 'crew1', dim: 'BASE', value: 'YVR', eff: '2026-01-01', exp: null },
          { crew_id: 'crew1', dim: 'RANK', value: 'CA', eff: '2026-01-01', exp: null },
          { crew_id: 'crew1', dim: 'FLEET', value: '320', eff: '2026-01-01', exp: null },
        ]),
        crewTeams: vi.fn().mockResolvedValue(new Map([['crew1', ['TEAM1']]])),
      }
      const ctx = {
        log: vi.fn(),
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
        instancesOf: (fn: number) => {
          if (fn === 7501) {
            return [{
              instance: '004',
              header: ['Bases', 'Ranks', 'Fleets', 'Crew Teams', ...header7501],
              rows: [['YVR', 'CA', '320', 'TEAM1', '168', 'RH', '00:00', '3']],
            }]
          }
          if (fn === 2014) {
            return [{ instance: '001', header: ['Start', 'End', 'Min Interval'], rows: [['22:00', '06:00', '08:00']] }]
          }
          return []
        },
      }

      const violations = (await rule7501(source as never, ctx as never)) as Array<{
        rule_code: string
        message: string
        start_dt: string
        end_dt: string
      }>
      expect(violations).toHaveLength(1)
      const w0 = fmtLocal(ws, zone)
      const w1 = fmtLocal(we, zone)
      expect(violations[0].message).toBe(
        `Single day free from duty (1) must be at least 3 in 168 RH (${w0} .. ${w1}).`,
      )
      expect(violations[0].message).toContain('2026-06-02 00:00 .. 2026-06-09 00:00')
      expect(violations[0].rule_code).toBe('7501')
      expect(violations[0].start_dt).toBe(new Date(ws * 1000).toISOString())
      expect(violations[0].end_dt).toBe(new Date(we * 1000).toISOString())
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('check-7501'),
        expect.arrayContaining(['--emit-tsv', '--checked-end-secs']),
        expect.objectContaining({ stdio: expect.any(Array) }),
      )
      const input = lastBinInput()
      expect(input).toContain('R\t0\tYVR\tCA\t320\tTEAM1\t168\tRH\t0\t3')
      expect(input).toContain(`D\tcrew1\t9001\t${ws}\t${ws + 3600}\t-420`)
      expect(input).toContain('Q\tcrew1\tBASE\tYVR\t20454\t-1')
      expect(input).toContain('Q\tcrew1\tRANK\tCA\t20454\t-1')
      expect(input).toContain('Q\tcrew1\tFLEET\t320\t20454\t-1')
      expect(input).toContain('T\tcrew1\tTEAM1')
      const binArgs = mockSpawn.mock.calls[0]?.[1] as string[]
      expect(binArgs).not.toContain('--period-hours')
      expect(binArgs).not.toContain('--min-limits')
    })
  })

  describe('doStartGrace1001', () => {
    it('treats empty filter columns as grace off for 1001', () => {
      const ctx = {
        instancesOf: (fn: number) =>
          fn === 2015
            ? [{
                header: ['Start Time', 'Assignments', 'Assignment Groups'],
                rows: [['01:00', '', '']],
              }]
            : [],
      }
      expect(doStartGrace1001(ctx)).toEqual({
        doStartMin: 0,
        assignments: [],
        groups: [],
      })
    })

    it('parses pipe-separated 2015 filters and keeps DO Start minutes', () => {
      const ctx = {
        instancesOf: (fn: number) =>
          fn === 2015
            ? [{
                header: ['Start Time', 'Assignments', 'Assignment Groups'],
                rows: [['01:00', 'DO', 'GRD|DO']],
              }]
            : [],
      }
      expect(doStartGrace1001(ctx)).toEqual({
        doStartMin: 60,
        assignments: ['DO'],
        groups: ['GRD', 'DO'],
      })
    })

    it('accepts legacy DO Start Time header for doStartMin', () => {
      const ctx = {
        instancesOf: (fn: number) =>
          fn === 2015
            ? [{
                header: ['DO Start Time', 'Assignments', 'Assignment Groups'],
                rows: [['01:30', '', '']],
              }]
            : [],
      }
      expect(doStartMin(ctx)).toBe(90)
    })
  })

  describe('rule1001', () => {
    it('maps function 1001 to check-1001 and emits an independent violation', async () => {
      fakeBin('crew1\t9001\t1\t2\t1000000\t1001800\tFLY\tVAC')
      const zone = 'America/Vancouver'
      const startBefore = 900_000
      const startAfter = 1_000_000
      const dateBefore = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(startBefore * 1000))
      const dateAfter = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(startAfter * 1000))
      const source = {
        assignmentOverlapRosters: vi.fn().mockResolvedValue([
          {
            crew_id: 'crew1',
            id: 1,
            pairing_id: 9001,
            start_secs: startBefore,
            end_duty_secs: 1_000_000,
            end_rest_secs: 1_001_800,
            assignment_group: 'FLY',
            assignment: 'FLY',
            assignment_type: 'W',
          },
          {
            crew_id: 'crew1',
            id: 2,
            pairing_id: 0,
            start_secs: startAfter,
            end_duty_secs: 1_001_800,
            end_rest_secs: 1_001_800,
            assignment_group: 'GRD',
            assignment: 'VAC',
            assignment_type: 'L',
          },
        ]),
        crewBaseTimezone: vi.fn().mockResolvedValue(new Map([['crew1', zone]])),
      }
      const ctx = {
        log: vi.fn(),
        instancesOf: (fn: number) =>
          fn === 1001
            ? [
                {
                  instance: '001',
                  header: [
                    'Assignment Group Before',
                    'Assignment Before',
                    'Assignment Rest Before',
                    'Assignment Type Before',
                    'Assignment Group After',
                    'Assignment After',
                    'Assignment Type After',
                  ],
                  rows: [['FLY', '*', 'Y', '*', '*', '*', 'L|O']],
                },
              ]
            : [],
      }

      const violations = (await rule1001(source as never, ctx as never)) as Array<{
        rule_code: string
        rule_instance: string
        scope_key: string
        pairing_id: number
        message: string
      }>

      expect(violations).toHaveLength(1)
      expect(violations[0]).toMatchObject({
        rule_code: '1001',
        rule_instance: '001',
        scope_key: '1>2',
        pairing_id: 9001,
      })
      expect(violations[0].message).toBe(
        `Row 1: Overlapping assignments between FLY (${dateBefore}) and VAC (${dateAfter}) are not allowed.`,
      )
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('check-1001'),
        ['--emit-tsv', '--do-start-min', '0'],
        expect.objectContaining({ stdio: expect.any(Array) }),
      )
      expect(lastBinInput()).toContain('R\tFLY\t*\tY')
    })
  })

  describe('rule8002', () => {
    const UPPER_HDR = ['BASES', 'RANKS', 'FLEETS', 'CREW TEAMS', 'PERIOD', 'UNIT', 'PRORATED', 'MAX LIMITS', 'MIN LIMITS', 'TYPE']
    const source8002 = () => ({
      blockByDay: vi.fn().mockResolvedValue([{ crew_id: 'crew1', day: '2026-06-10', blk: 180 }]),
      mandayMetricsByDay: vi.fn().mockResolvedValue([]),
      crewQualEntries: vi.fn().mockResolvedValue([
        { crew_id: 'crew1', dim: 'R', value: 'CA', eff: '2020-01-01', exp: null },
      ]),
      firstPairingSpanByCrew: vi.fn().mockResolvedValue(
        new Map([
          [
            'crew1',
            {
              id: 9001,
              startIso: '2026-06-10T00:00:00.000Z',
              endIso: '2026-06-10T02:00:00.000Z',
            },
          ],
        ]),
      ),
      crewBaseTimezone: vi.fn().mockResolvedValue(new Map([['crew1', 'UTC']])),
    })
    const ctx8002 = (rows: string[][]) => ({
      log: vi.fn(),
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      instancesOf: (fn: number) =>
        fn === 8002 ? [{ instance: '001', header: UPPER_HDR, rows }] : [],
    })

    it('reads all 15 columns from an ALL-UPPERCASE header into the U line and maps V rows back', async () => {
      // check-8002-full protocol: V<TAB>crew<TAB>rule_idx<TAB>type<TAB>period<TAB>unit
      //   <TAB>actual<TAB>max<TAB>min<TAB>win_start_s<TAB>win_end_s<TAB>over<TAB>cross_tz
      fakeBin('V\tcrew1\t0\tBH\t28\tCD\t2700\t2160\t0\t1780704000\t1783123199\t1\t0')
      const violations = (await rule8002(
        source8002() as never,
        ctx8002([['*', 'CA', '*', '*', '28', 'CD', 'Y', '36:00', '00:00', 'BH']]) as never,
      )) as Array<{ limit_value: number; message: string; scope_key: string }>

      expect(violations).toHaveLength(1)
      expect(violations[0].limit_value).toBe(36 * 60)
      expect(violations[0].scope_key).toBe('28CD')
      expect(violations[0].message).toMatch(/^Cumulative block 45:00 exceeds 36:00 in the 28-day window /)

      // The binary received the full U line (rank list included) + Q/M sections.
      const call = mockSpawn.mock.calls[0]
      expect(String(call[0])).toContain('check-8002-full')
      const input = lastBinInput()
      expect(input).toContain('U\t0\t*\tCA\t*\t*\t28\tCD\t2160\t0\tBH\t-1\t-1\t-1\t-1\t-1\t-1\t-1\t0')
      expect(input).toContain('Q\tcrew1\tR\tCA\t')
      expect(input).toMatch(/M\tcrew1\t\d+\t180\t0\t0\t0\t0\t0\t0\t0\t0/)
    })

    it('emits Crew Teams rows into the check-8002-full input', async () => {
      fakeBin('')
      const source = {
        ...source8002(),
        crewTeams: vi.fn().mockResolvedValue(new Map([['crew1', ['TEAM1']]])),
      }

      await rule8002(
        source as never,
        ctx8002([['*', '*', '*', 'TEAM1', '1', 'CD', 'Y', '50:00', '00:00', 'BH']]) as never,
      )

      const input = lastBinInput()
      expect(input).toContain('U\t0\t*\t*\t*\tTEAM1\t1\tCD')
      expect(input).toContain('Q\tcrew1\tT\tTEAM1\t-1000000\t-1')
    })

    it('emits roster period rows for RP unit rules', async () => {
      fakeBin('')
      const source = {
        ...source8002(),
        rosterPeriods: vi.fn().mockResolvedValue([{ start: '2026-06-01', end: '2026-06-30' }]),
      }

      await rule8002(
        source as never,
        ctx8002([['*', '*', '*', '*', '1', 'RP', 'Y', '50:00', '00:00', 'BH']]) as never,
      )

      expect(lastBinInput()).toContain('P\t20605\t20634')
    })

    it('aggregates multiple V windows to the worst per crew×row', async () => {
      fakeBin([
        'V\tcrew1\t0\tDP\t7\tCD\t3700\t3600\t0\t1780704000\t1781308799\t1\t0',
        'V\tcrew1\t0\tDP\t7\tCD\t3900\t3600\t0\t1780790400\t1781395199\t1\t0',
      ].join('\n'))
      const violations = (await rule8002(
        source8002() as never,
        ctx8002([['*', '*', '*', '*', '7', 'CD', 'Y', '60:00', '00:00', 'DP']]) as never,
      )) as Array<{ actual_value: number; message: string }>

      expect(violations).toHaveLength(1)
      expect(violations[0].actual_value).toBe(3900)
      expect(violations[0].message).toMatch(/Cumulative DP 65:00 exceeds 60:00 in the 7CD window/)
    })

    it('overlays blockByDay BLH for crews whose manday blh is all-zero in the window', async () => {
      fakeBin('') // no violations needed — we assert the stdin M section
      const source = {
        ...source8002(),
        // crew1 HAS manday rows but blh=0 (live blh column unmaintained); dp populated.
        mandayMetricsByDay: vi.fn().mockResolvedValue([
          { crew_id: 'crew1', day: '2026-06-10', blh: 0, ft: 0, dp: 500, credit_min: 0, sby: 0, int_blh: 0, aug_blh: 0, duty_aloft: 0, cross_tz: 0 },
        ]),
        blockByDay: vi.fn().mockResolvedValue([{ crew_id: 'crew1', day: '2026-06-10', blk: 480 }]),
      }
      await rule8002(
        source as never,
        ctx8002([['*', '*', '*', '*', '28', 'CD', 'Y', '90:00', '00:00', 'BH']]) as never,
      )
      const input = lastBinInput()
      // Manday row (dp intact) AND the roster-derived BLH overlay row both present.
      expect(input).toMatch(/M\tcrew1\t\d+\t0\t0\t500\t0\t0\t0\t0\t0\t0/)
      expect(input).toMatch(/M\tcrew1\t\d+\t480\t0\t0\t0\t0\t0\t0\t0\t0/)
    })

    it('skips unported types with a log and emits nothing', async () => {
      const ctx = ctx8002([['*', '*', '*', '*', '28', 'CD', 'Y', '36:00', '00:00', 'COSMIC']])
      const violations = await rule8002(source8002() as never, ctx as never)
      expect(violations).toEqual([])
      expect(mockSpawn).not.toHaveBeenCalled()
      expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('not ported'))
    })
  })
})
