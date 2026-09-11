import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Rust rule-7502 CARS credit calculator (`CalculateCredit`): per FLY duty the credit is
// max(minCH-floor, Σblk×FT-ratio, DP×DP-ratio). Ported from
// crewrule-dev/RuleEngine/rule/rule7502/CalculateCreditHoursForCARSRule.cpp; the binary
// applies the F8 default ruleset (FT=1.0, DP=0.5, floor=240) when no ratio flags are passed.
// Same spawn-a-Rust-binary bridge shape as pairing-fdp.ts (compute-fdp).
const RELEASE_BIN = path.resolve(__dirname, '../../../../rule-engine-rs/target/release/check-7502')
const DEBUG_BIN = path.resolve(__dirname, '../../../../rule-engine-rs/target/debug/check-7502')

export type DutyCreditInput = {
  /** Stable key echoed back in the output (e.g. `d1`, `d2`). */
  key: string
  /** Assignment group; FLY duties use the flight-credit path. */
  group?: string
  /** Σ scheduled block minutes across the duty's legs. */
  blkMin: number
  /** Duty period minutes (check-in → check-out). */
  dpMin: number
}

const resolveBin = (): string | null => {
  if (fs.existsSync(RELEASE_BIN)) return RELEASE_BIN
  if (fs.existsSync(DEBUG_BIN)) return DEBUG_BIN
  return null
}

/**
 * Credit minutes per duty via the Rust rule-7502 engine, keyed by the caller's `key`.
 * Returns `null` when the binary is missing or the engine errors — callers must then leave
 * the credit columns NULL rather than fabricate a value (mirrors computeDutyFdpMin).
 */
export const computeDutyCreditMin = (duties: DutyCreditInput[]): Map<string, number> | null => {
  if (duties.length === 0) return new Map()
  const bin = resolveBin()
  if (!bin) return null

  // check-7502 --emit-tsv reads one activity per line:  key<TAB>group<TAB>blk_min<TAB>dp_min
  // and prints:  key<TAB>total_credit<TAB>fly<TAB>ground<TAB>activities  (one row per key).
  const input =
    duties
      .map((d) => [d.key, d.group ?? 'FLY', Math.round(d.blkMin), Math.round(d.dpMin)].join('\t'))
      .join('\n') + '\n'
  const res = spawnSync(bin, ['--emit-tsv'], { input, encoding: 'utf-8', maxBuffer: 1 << 20 })
  if (res.status !== 0) {
    console.error(`check-7502 exited ${res.status}: ${res.stderr}`)
    return null
  }
  const out = new Map<string, number>()
  for (const line of (res.stdout ?? '').split('\n')) {
    const f = line.split('\t')
    if (f.length < 2 || !f[0]) continue
    const n = Number(f[1])
    if (Number.isFinite(n)) out.set(f[0], n)
  }
  return out
}

export const computeCreditBinPath = resolveBin
