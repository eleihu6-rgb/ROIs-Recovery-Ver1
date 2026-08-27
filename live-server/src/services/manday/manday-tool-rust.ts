import { spawnSync } from 'node:child_process'
import path from 'node:path'

// live-server/src/services/manday → repo root → rule-engine-rs/target/release/ruletool.
// package.json is type:commonjs, so __dirname is the CJS-correct anchor (no import.meta).
const RUST_BIN = path.resolve(__dirname, '../../../../rule-engine-rs/target/release/ruletool')

export interface ActivityRow {
  crewId: string
  division: string
  localDate: string // YYYY-MM-DD (crew-base local)
  kind: 'FLY' | 'GND'
  a1: number // FLY: credited minutes; GND: duty minutes
  a2: number // GND: fixed_credit_min (-1 = NULL); FLY: -1
  a3: number // reserved; must remain 0
  flag: '' | 'DO' | 'VAC' | 'ILL'
  actCreditMin?: number | null
  schCreditMin?: number | null
  dpMin?: number | null
}

export interface RustGrains {
  D: string[][]
  M: string[][]
  Y: string[][]
}

const nullableNum = (v: number | null | undefined): string =>
  v === null || v === undefined || Number.isNaN(v) ? '' : String(v)

const toTsv = (r: ActivityRow): string => {
  const base = `${r.crewId}\t${r.division}\t${r.localDate}\t${r.kind}\t${r.a1}\t${r.a2}\t${r.a3}\t${r.flag}`
  if (r.kind !== 'GND') return base
  return `${base}\t${nullableNum(r.actCreditMin)}\t${nullableNum(r.schCreditMin)}\t${nullableNum(r.dpMin)}`
}

/** Spawn the pure-arithmetic Rust core. No DB. Throws on non-zero exit. */
export function runRust(rows: ActivityRow[], bandMin = 3900, bandMax = 4500): RustGrains {
  const res = spawnSync(RUST_BIN, ['--band-min', String(bandMin), '--band-max', String(bandMax)], {
    input: rows.map(toTsv).join('\n'),
    encoding: 'utf-8',
    maxBuffer: 1 << 28,
  })
  if (res.status !== 0) throw new Error(`ruletool exited ${res.status}: ${res.stderr}`)
  const D: string[][] = []
  const M: string[][] = []
  const Y: string[][] = []
  for (const line of res.stdout.split('\n')) {
    if (!line) continue
    const f = line.split('\t')
    if (f[0] === 'D') D.push(f)
    else if (f[0] === 'M') M.push(f)
    else if (f[0] === 'Y') Y.push(f)
  }
  return { D, M, Y }
}
