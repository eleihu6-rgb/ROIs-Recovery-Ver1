import { describe, expect, it, vi } from 'vitest'
import * as check7505Gdo from '../check-7505-gdo.mjs'
import { evaluateCrewViolations, fetchOverlapUtcWindow } from '../check-7505-gdo.mjs'

describe('evaluateCrewViolations', () => {
  it('widens the UTC fetch window by one day on both sides', () => {
    expect(fetchOverlapUtcWindow('2026-06-01', '2026-07-01')).toEqual({
      lowerBoundIso: '2026-05-31T00:00:00.000Z',
      upperBoundIso: '2026-07-02T00:00:00.000Z',
    })
  })

  it('builds structured 7505 R rows with scope columns', () => {
    const header = [
      'Bases', 'Ranks', 'Fleets', 'Crew Teams', 'DO Assignment Group', 'Min DO',
      'Period', 'Unit', 'RP Days Range', 'Utilize Post Duty Rest',
      'Count Blank Day', 'Count Layover', 'Leave Assignments', 'Leave Days Range',
    ]
    const H = (name) => header.indexOf(name)

    expect(check7505Gdo.buildStructured7505RuleLine(
      ['YYZ', 'CA', '737', 'TEAM1', 'DO', '7', '1', 'RP', '30-30', 'N', 'N', 'N', '*', '0-0'],
      H,
    )).toBe('R\tYYZ\tCA\t737\tTEAM1\t7\t30\t30\t0\t0\tDO\t\t0\t0\t1\tRP\t0')
  })

  it('emits Count Layover=Y as trailing 1 on the R line', () => {
    const header = [
      'Bases', 'Ranks', 'Fleets', 'Crew Teams', 'DO Assignment Group', 'Min DO',
      'Period', 'Unit', 'RP Days Range', 'Utilize Post Duty Rest',
      'Count Blank Day', 'Count Layover', 'Leave Assignments', 'Leave Days Range',
    ]
    const H = (name) => header.indexOf(name)
    expect(check7505Gdo.buildStructured7505RuleLine(
      ['*', '*', '*', '*', 'DO', '12', '1', 'RP', '30-30', 'Y', 'Y', 'Y', 'VAC', '0-0'],
      H,
    )).toBe('R\t*\t*\t*\t*\t12\t30\t30\t0\t0\tDO\tVAC\t1\t1\t1\tRP\t1')
  })

  it('evaluates each crew in its own local RP window and still aggregates both violations', () => {
    const engineCalls = []
    const runEngineFn = vi.fn((tsv, rpStart, rpEnd, offsetMin) => {
      const crewIds = tsv
        .split('\n')
        .filter((line) => line.startsWith('A\t'))
        .map((line) => line.split('\t')[1])
      engineCalls.push({ crewIds, rpStart, rpEnd, offsetMin })
      return [{
        crewId: crewIds[0],
        rpStart,
        rpEnd,
        daysOff: 6,
        minDo: 8,
        period: 'RP',
        unit: 'DAY',
      }]
    })

    const violations = evaluateCrewViolations({
      activityRows: [
        { crewId: '1001', code: 'DO', startSecs: 1_780_320_000, endSecs: 1_780_323_600 },
        { crewId: '2002', code: 'DO', startSecs: 1_780_406_400, endSecs: 1_780_410_000 },
      ],
      bandLines: ['R\t8\t30\t30\t0\t31\tDO\tVAC\t1\t0\tRP\tDAY'],
      from: '2026-06-01',
      to: '2026-06-30',
      crewOffsetsById: new Map([
        ['1001', -240],
        ['2002', -420],
      ]),
      runEngineFn,
    })

    expect(engineCalls).toEqual([
      { crewIds: ['1001'], offsetMin: -240, rpStart: 1_780_286_400, rpEnd: 1_782_878_400 },
      { crewIds: ['2002'], offsetMin: -420, rpStart: 1_780_297_200, rpEnd: 1_782_889_200 },
    ])
    expect(violations).toEqual([
      { crewId: '1001', rpStart: 1_780_286_400, rpEnd: 1_782_878_400, daysOff: 6, minDo: 8, period: 'RP', unit: 'DAY' },
      { crewId: '2002', rpStart: 1_780_297_200, rpEnd: 1_782_889_200, daysOff: 6, minDo: 8, period: 'RP', unit: 'DAY' },
    ])
  })

  it('ignores the buffered-but-non-overlapping pairing when selecting persisted anchors', () => {
    const pairingByCrew = check7505Gdo.selectPersistedPairingByCrew({
      pairRows: [
        { crew_id: '2002', pairing_id: 9001, s: 1_780_282_800, e: 1_780_290_000 },
        { crew_id: '2002', pairing_id: 9002, s: 1_780_300_800, e: 1_780_308_000 },
      ],
      from: '2026-06-01',
      to: '2026-06-30',
      crewOffsetsById: new Map([['2002', -420]]),
    })

    expect(pairingByCrew).toEqual(new Map([['2002', 9002]]))
  })
})
