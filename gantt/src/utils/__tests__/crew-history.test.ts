import { describe, it, expect } from 'vitest'
import { getAllEffective, getEffective } from '../crew-history'

const r = (rank: string, effDt: string, expDt: string | null) => ({
  id: 1,
  crewId: 'X001',
  rank,
  effDt,
  expDt,
})

describe('getAllEffective', () => {
  it('returns records where eff_dt <= date and exp_dt is null', () => {
    const records = [r('FO', '2022-01-01', null)]
    const result = getAllEffective(records, new Date('2025-06-01'))
    expect(result).toHaveLength(1)
    expect(result[0].rank).toBe('FO')
  })

  it('returns records where eff_dt <= date and exp_dt > date', () => {
    const records = [r('CA', '2024-07-01', '2026-12-31')]
    const result = getAllEffective(records, new Date('2025-01-15'))
    expect(result).toHaveLength(1)
    expect(result[0].rank).toBe('CA')
  })

  it('excludes records where eff_dt > date', () => {
    const records = [r('CA', '2026-01-01', null)]
    const result = getAllEffective(records, new Date('2025-01-15'))
    expect(result).toHaveLength(0)
  })

  it('excludes records where exp_dt <= date', () => {
    const records = [r('FO', '2022-01-01', '2024-06-30')]
    const result = getAllEffective(records, new Date('2025-01-15'))
    expect(result).toHaveLength(0)
  })

  it('returns multiple records when both are effective (dual rating)', () => {
    const records = [
      r('CA',  '2021-01-01', null),
      r('FCN', '2023-06-01', null),
    ]
    const result = getAllEffective(records, new Date('2025-01-15'))
    expect(result).toHaveLength(2)
  })

  it('returns empty array for empty input', () => {
    expect(getAllEffective([], new Date('2025-01-15'))).toHaveLength(0)
  })

  it('excludes records where exp_dt equals date exactly (exp_dt is exclusive upper bound)', () => {
    const records = [r('FO', '2022-01-01', '2025-01-15')]
    const result = getAllEffective(records, new Date('2025-01-15'))
    expect(result).toHaveLength(0)
  })
})

describe('getEffective', () => {
  it('returns null when no records are effective', () => {
    expect(getEffective([], new Date('2025-01-15'))).toBeNull()
  })

  it('returns the single effective record', () => {
    const records = [r('CA', '2024-01-01', null)]
    expect(getEffective(records, new Date('2025-01-15'))?.rank).toBe('CA')
  })

  it('returns the record with the latest eff_dt when multiple match', () => {
    const records = [
      r('FO', '2020-01-01', null),
      r('CA', '2024-07-01', null),
    ]
    expect(getEffective(records, new Date('2025-01-15'))?.rank).toBe('CA')
  })
})
