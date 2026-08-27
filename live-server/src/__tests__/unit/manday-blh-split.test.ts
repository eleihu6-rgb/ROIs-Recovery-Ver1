import { describe, expect, it } from 'vitest'
import { splitBlhByBaseMidnight, splitDutyDpByBaseMidnight } from '../../services/manday/manday-blh-split.js'

describe('splitBlhByBaseMidnight', () => {
  const yvr = 'America/Vancouver'

  it('same local day with act: all wall minutes on that day', () => {
    // 2026-08-01 00:00–05:30 UTC = 2026-07-31 17:00–22:30 YVR
    const parts = splitBlhByBaseMidnight({
      depUtc: '2026-08-01T00:00:00Z',
      arvUtc: '2026-08-01T05:30:00Z',
      blkMin: 330,
      hasAct: true,
      zoneId: yvr,
    })
    expect(parts).toEqual([{ localDate: '2026-07-31', minutes: 330 }])
  })

  it('act cross-midnight: absolute wall minutes either side of base midnight', () => {
    // 2026-08-01 06:30–12:20 UTC = 2026-07-31 23:30 → 2026-08-01 05:20 YVR
    const parts = splitBlhByBaseMidnight({
      depUtc: '2026-08-01T06:30:00Z',
      arvUtc: '2026-08-01T12:20:00Z',
      blkMin: 350,
      hasAct: true,
      zoneId: yvr,
    })
    expect(parts).toEqual([
      { localDate: '2026-07-31', minutes: 30 },
      { localDate: '2026-08-01', minutes: 320 },
    ])
  })

  it('no act: proportional blk_min by sch wall overlap (remainder on last day)', () => {
    // Same timeline as cross-midnight, but sch wall 350 and blk 349 → 30/320 proportion
    // round(349 * 30/350)=30, remainder 319 on last day
    const parts = splitBlhByBaseMidnight({
      depUtc: '2026-08-01T06:30:00Z',
      arvUtc: '2026-08-01T12:20:00Z',
      blkMin: 349,
      hasAct: false,
      zoneId: yvr,
    })
    expect(parts).toEqual([
      { localDate: '2026-07-31', minutes: 30 },
      { localDate: '2026-08-01', minutes: 319 },
    ])
    expect(parts.reduce((s, p) => s + p.minutes, 0)).toBe(349)
  })

  it('no act and wall <= 0: all blk on dep local date', () => {
    const parts = splitBlhByBaseMidnight({
      depUtc: '2026-08-01T00:00:00Z',
      arvUtc: '2026-08-01T00:00:00Z',
      blkMin: 100,
      hasAct: false,
      zoneId: yvr,
    })
    expect(parts).toEqual([{ localDate: '2026-07-31', minutes: 100 }])
  })

  it('splits raw duty minutes first, then applies dpPct per local day', () => {
    // 2026-08-01 06:30–12:30 UTC = 2026-07-31 23:30 → 2026-08-01 05:30 YVR.
    // Raw duty split is 30/330. With dpPct 0.5, DP is 15/165.
    const parts = splitDutyDpByBaseMidnight({
      startUtc: '2026-08-01T06:30:00Z',
      endUtc: '2026-08-01T12:30:00Z',
      dpPct: 0.5,
      zoneId: yvr,
    })

    expect(parts).toEqual([
      { localDate: '2026-07-31', minutes: 15 },
      { localDate: '2026-08-01', minutes: 165 },
    ])
    expect(parts.reduce((sum, part) => sum + part.minutes, 0)).toBe(180)
  })
})
