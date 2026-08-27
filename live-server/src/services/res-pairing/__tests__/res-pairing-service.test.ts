import { describe, it, expect, vi } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
  process.env.FILIALE ||= 'F8'
})

import { buildPairingRow, buildSegmentRow } from '../res-pairing-service'

describe('buildPairingRow', () => {
  const cell = {
    date: '2026-06-01',
    base: 'YVR',
    assignment: 'PRAM',
    window: { start: '04:00', end: '16:00' },
    composition: [{ rank: 'CA', plan: 5 }],
  }
  it('sets RES group, code, label, computed UTC times, source MANUAL', () => {
    const row = buildPairingRow(cell, 'P', 'PRAM', 'America/Vancouver', '737', 'RES', 'tester')
    expect(row.assignmentGroup).toBe('RES')
    expect(row.assignment).toBe('PRAM')
    expect(row.pairingLabel).toBe('PRAM')
    expect(row.base).toBe('YVR')
    expect(row.division).toBe('P')
    expect(row.fleet).toBe('737')
    expect(row.source).toBe('MANUAL')
    // 04:00 PDT (UTC-7 in June) → 11:00Z
    expect(row.schStrDtUtc.toISOString()).toBe('2026-06-01T11:00:00.000Z')
    // 16:00 PDT → 23:00Z
    expect(row.schEndDtUtc.toISOString()).toBe('2026-06-01T23:00:00.000Z')
    expect(row.durationDays).toBe(1)
    expect(row.tafb).toBe(0)
  })
  it('cross-midnight window: end date is next day when end ≤ start', () => {
    const overnight = {
      ...cell,
      assignment: 'PRPM',
      window: { start: '20:00', end: '05:59' },
    }
    const row = buildPairingRow(overnight, 'P', 'PRPM', 'America/Vancouver', '737', 'RES', 'tester')
    expect(row.pairingLabel).toBe('PRPM')
    expect(row.schStrDtUtc.toISOString()).toBe('2026-06-02T03:00:00.000Z') // 20:00 PDT
    expect(row.schEndDtUtc.toISOString()).toBe('2026-06-02T12:59:00.000Z') // 05:59 PDT next day
    expect(row.durationDays).toBe(2)
  })
  it('same local window yields different UTC for different base zones', () => {
    const yvr = buildPairingRow(cell, 'P', 'PRAM', 'America/Vancouver', '737', 'RES', 'tester')
    const yyz = buildPairingRow(
      { ...cell, base: 'YYZ' },
      'P',
      'PRAM',
      'America/Toronto',
      '737',
      'RES',
      'tester',
    )
    // Both local 04:00; PDT = UTC-7, EDT = UTC-4
    expect(yvr.schStrDtUtc.toISOString()).toBe('2026-06-01T11:00:00.000Z')
    expect(yyz.schStrDtUtc.toISOString()).toBe('2026-06-01T08:00:00.000Z')
  })
})

describe('buildSegmentRow', () => {
  const cell = {
    date: '2026-06-01',
    base: 'YVR',
    assignment: 'PRAM',
    window: { start: '04:00', end: '16:00' },
    composition: [{ rank: 'CA', plan: 5 }],
  }
  it('writes the fixed reserve credit to dutyActCreditedMinutes (flat, regardless of duration)', () => {
    const p = buildPairingRow(cell, 'P', 'PRAM', 'America/Vancouver', '737', 'RES', 'tester')
    const seg = buildSegmentRow(1, p, 'PRAM', 'tester', 240, 'F8')
    expect(seg.dutyActCreditedMinutes).toBe('240')
    expect(seg.segAssignment).toBe('PRAM')
    expect(seg.fltId).toBeNull()
    expect(seg.pairingId).toBe(1)
  })
})
