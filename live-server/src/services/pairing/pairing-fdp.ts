import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const RELEASE_BIN = path.resolve(__dirname, '../../../../rule-engine-rs/target/release/compute-fdp')
const DEBUG_BIN = path.resolve(__dirname, '../../../../rule-engine-rs/target/debug/compute-fdp')

export type DutyFdpSeg = {
  dbId: number
  assignment: string
  startAct: Date
  endAct: Date
  startSch: Date
  endSch: Date
  blkSeconds?: number
  operating?: boolean
  dep?: string
  arr?: string
  fleet?: string
  fleetGrp?: string
  domInt?: string
  fltSts?: string
}

export type DutyFdpInput = {
  dutyKey?: string
  assignmentGroup?: string
  pairingId?: number
  dutySeq?: number
  segments: DutyFdpSeg[]
  briefStart?: Date | null
  briefEnd?: Date | null
  debriefStart?: Date | null
  debriefEnd?: Date | null
  pickupStart?: Date | null
  pickupEnd?: Date | null
  dropoffStart?: Date | null
  dropoffEnd?: Date | null
}

const epoch = (d: Date | null | undefined): number | null =>
  d instanceof Date && !Number.isNaN(d.getTime()) ? Math.floor(d.getTime() / 1000) : null

const resolveBin = (): string | null => {
  if (fs.existsSync(RELEASE_BIN)) return RELEASE_BIN
  if (fs.existsSync(DEBUG_BIN)) return DEBUG_BIN
  return null
}

/** 2107 first-seed switches (INCLUDE CI=Y, INCLUDE CO=N) plus FLY assignment. */
export const defaultFdpParamTsv = (): string =>
  [
    'B\tINCLUDE CHECK IN\tY',
    'B\tINCLUDE CHECK OUT\tN',
    'B\tIS PICKUP COUNT\tN',
    'B\tIS DROPOFF COUNT\tN',
    'C\t60\t15',
    'A\tFLY\t1.0\tFLY',
  ].join('\n')

export const buildDutyFdpTsv = (input: DutyFdpInput, paramTsv = defaultFdpParamTsv()): string => {
  const key = input.dutyKey ?? 'd1'
  const group = input.assignmentGroup ?? 'FLY'
  const lines = [paramTsv]
  lines.push(
    [
      'D',
      key,
      '',
      String(input.pairingId ?? 0),
      String(input.dutySeq ?? 1),
      group,
      '',
    ].join('\t'),
  )
  for (const seg of input.segments) {
    lines.push(
      [
        'S',
        key,
        String(seg.dbId),
        seg.assignment || 'FLY',
        String(epoch(seg.startAct) ?? 0),
        String(epoch(seg.endAct) ?? 0),
        String(epoch(seg.startSch) ?? 0),
        String(epoch(seg.endSch) ?? 0),
        String(seg.blkSeconds ?? 0),
        seg.operating === false ? 'N' : 'Y',
        seg.fltSts ?? '',
        seg.dep ?? '',
        seg.arr ?? '',
        seg.fleet ?? '',
        seg.fleetGrp ?? '',
        seg.domInt ?? '*',
      ].join('\t'),
    )
  }
  const node = (
    type: string,
    name: string,
    start: Date | null | undefined,
    end: Date | null | undefined,
  ): void => {
    const s = epoch(start)
    const e = epoch(end)
    if (s == null || e == null) return
    lines.push(['N', key, type, name, String(s), String(e), '0', '0'].join('\t'))
  }
  node('DUTY', 'PICKUP', input.pickupStart, input.pickupEnd)
  node('DUTY', 'BRIEF', input.briefStart, input.briefEnd)
  node('DUTY', 'DEBRIEF', input.debriefStart, input.debriefEnd)
  node('DUTY', 'DROPOFF', input.dropoffStart, input.dropoffEnd)
  return `${lines.join('\n')}\n`
}

/**
 * Spawn compute-fdp. Returns integer minutes, or null when the binary is missing
 * or the duty is not FLY / uncomputable. Pairing writes must leave NULL in that case.
 */
export const computeDutyFdpMin = (input: DutyFdpInput): number | null => {
  if ((input.assignmentGroup ?? 'FLY') !== 'FLY' || input.segments.length === 0) return null
  const bin = resolveBin()
  if (!bin) return null
  const res = spawnSync(bin, [], {
    input: buildDutyFdpTsv(input),
    encoding: 'utf-8',
    maxBuffer: 1 << 20,
  })
  if (res.status !== 0) {
    console.error(`compute-fdp exited ${res.status}: ${res.stderr}`)
    return null
  }
  for (const line of (res.stdout ?? '').split('\n')) {
    const f = line.split('\t')
    if (f[0] === 'F' && f.length >= 5) {
      const n = Number(f[4])
      return Number.isFinite(n) ? n : null
    }
  }
  return null
}

export const computeFdpBinPath = resolveBin
