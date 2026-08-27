import { describe, expect, it } from 'vitest'
import { resolveIdToPairingId, resolveSelectedPairingIds } from '@/utils/delete-gantt-selection'
import type { PairingItem } from '@/types'

const item = (pairingId: number, segmentIds: number[]): PairingItem => ({
  pairing: {
    id: pairingId,
    pairingLabel: `P-${pairingId}`,
    base: 'YVR',
    fleet: '737',
    tafb: 0,
    segCount: segmentIds.length,
    durationDays: 1,
    schStrDtUtc: '2026-06-01T10:00:00Z',
    schEndDtUtc: '2026-06-01T18:00:00Z',
    composition: [],
  } as PairingItem['pairing'],
  flights: [],
  segments: segmentIds.map((id, idx) => ({
    id,
    segSeq: idx + 1,
    dutySeq: 1,
    schStrDtUtc: '2026-06-01T10:00:00Z',
    schEndDtUtc: '2026-06-01T14:00:00Z',
  })) as PairingItem['segments'],
  sessionTags: [],
})

describe('delete-gantt-selection helpers', () => {
  const items = [item(100, [501, 502]), item(200, [601])]

  it('resolves pairing row ids', () => {
    expect(resolveIdToPairingId(100, items)).toBe(100)
  })

  it('resolves segment ids to owning pairing ids', () => {
    expect(resolveIdToPairingId(502, items)).toBe(100)
    expect(resolveIdToPairingId(601, items)).toBe(200)
  })

  it('returns null for unknown ids', () => {
    expect(resolveIdToPairingId(999, items)).toBeNull()
  })

  it('dedupes mixed pairing and segment selections', () => {
    expect(resolveSelectedPairingIds([100, 501, 502, 200, 601], items)).toEqual([100, 200])
  })
})
