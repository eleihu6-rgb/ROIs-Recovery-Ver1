import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

import {
  buildDutyFdpTsv,
  computeDutyFdpMin,
  computeFdpBinPath,
  defaultFdpParamTsv,
  type DutyFdpInput,
} from '../../../services/pairing/pairing-fdp.js'

const twoLeg: DutyFdpInput = {
  dutyKey: 'd1',
  assignmentGroup: 'FLY',
  pairingId: 42,
  dutySeq: 1,
  segments: [
    {
      dbId: 1,
      assignment: 'FLY',
      startAct: new Date('2026-09-01T06:00:00Z'),
      endAct: new Date('2026-09-01T08:00:00Z'),
      startSch: new Date('2026-09-01T06:00:00Z'),
      endSch: new Date('2026-09-01T08:00:00Z'),
      dep: 'ADD',
      arr: 'DXB',
      fleet: 'B737',
    },
    {
      dbId: 2,
      assignment: 'FLY',
      startAct: new Date('2026-09-01T09:00:00Z'),
      endAct: new Date('2026-09-01T11:00:00Z'),
      startSch: new Date('2026-09-01T09:00:00Z'),
      endSch: new Date('2026-09-01T11:00:00Z'),
      dep: 'DXB',
      arr: 'ADD',
      fleet: 'B737',
    },
  ],
  briefStart: new Date('2026-09-01T05:00:00Z'),
  briefEnd: new Date('2026-09-01T06:00:00Z'),
  debriefStart: new Date('2026-09-01T11:00:00Z'),
  debriefEnd: new Date('2026-09-01T11:15:00Z'),
}

describe('pairing-fdp TSV + compute-fdp', () => {
  it('emits 2107/3010/duty/segment/node rows', () => {
    const tsv = buildDutyFdpTsv(twoLeg)
    expect(tsv).toContain('B\tINCLUDE CHECK IN\tY')
    expect(tsv).toContain('C\t60\t15')
    expect(tsv).toMatch(/^D\td1\t/m)
    expect(tsv).toMatch(/^S\td1\t1\tFLY\t/m)
    expect(tsv).toMatch(/^N\td1\tDUTY\tBRIEF\t/m)
    expect(defaultFdpParamTsv()).toContain('INCLUDE CHECK OUT\tN')
  })

  it('returns null for RES without spawning', () => {
    expect(computeDutyFdpMin({ ...twoLeg, assignmentGroup: 'RES' })).toBeNull()
  })

  it('matches the Rust compute-fdp minutes (INCLUDE CI, exclude CO)', () => {
    const bin = computeFdpBinPath()
    expect(bin, 'compute-fdp binary must be built').toBeTruthy()
    const res = spawnSync(bin!, [], {
      input: buildDutyFdpTsv(twoLeg),
      encoding: 'utf-8',
    })
    expect(res.status, res.stderr).toBe(0)
    const f = (res.stdout ?? '').split('\n').find((line) => line.startsWith('F\t'))
    expect(f).toBeTruthy()
    const minutes = Number(f!.split('\t')[4])
    expect(minutes).toBe(360)
    expect(computeDutyFdpMin(twoLeg)).toBe(minutes)
  })
})
