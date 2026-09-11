import { describe, it, expect } from 'vitest'
import { computeDutyCreditMin, computeCreditBinPath } from '../../../services/pairing/pairing-credit.js'

// These drive the REAL Rust rule-7502 binary (rule-engine-rs/target/release/check-7502).
// Credit per FLY duty = max(240 floor, Σblk×1.0, DP×0.5) with the F8 default ruleset.
const hasBin = computeCreditBinPath() != null

describe('computeDutyCreditMin (rule-7502 CARS credit bridge)', () => {
  it('empty input returns an empty map without spawning', () => {
    expect(computeDutyCreditMin([])).toEqual(new Map())
  })

  it.runIf(hasBin)('block-driven duty: credit = Σblk×FT when it beats floor and DP', () => {
    // blk 300, dp 480 → max(240, 300, 240) = 300
    const m = computeDutyCreditMin([{ key: 'd1', blkMin: 300, dpMin: 480 }])
    expect(m?.get('d1')).toBe(300)
  })

  it.runIf(hasBin)('short duty falls to the 4:00 (240min) minimum credit floor', () => {
    // blk 120, dp 360 → max(240, 120, 180) = 240
    const m = computeDutyCreditMin([{ key: 'd1', blkMin: 120, dpMin: 360 }])
    expect(m?.get('d1')).toBe(240)
  })

  it.runIf(hasBin)('FLY credit is block+floor only — a long ground sit does NOT raise it (DP term is GND-only)', () => {
    // F8 FLY rule has dp_ratio=-1 (unconfigured), so a big duty period never lifts flight credit:
    // blk 200, dp 600 → max(240, 200) = 240 (NOT DP×0.5=300).
    const m = computeDutyCreditMin([{ key: 'd1', blkMin: 200, dpMin: 600 }])
    expect(m?.get('d1')).toBe(240)
  })

  it.runIf(hasBin)('computes each duty independently in one batch call', () => {
    const m = computeDutyCreditMin([
      { key: 'd1', blkMin: 300, dpMin: 480 },
      { key: 'd2', blkMin: 120, dpMin: 360 },
    ])
    expect(m?.get('d1')).toBe(300)
    expect(m?.get('d2')).toBe(240)
  })
})
