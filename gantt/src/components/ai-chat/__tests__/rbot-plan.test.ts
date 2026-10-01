import { describe, expect, it } from 'vitest'
import { buildPlanLines, canRbotSave } from '../rbot-plan'
import { parseRbotPolicy, FAIL_CLOSED_POLICY } from '../rbot-policy'
import type { DraftOperation } from '@/stores/draft-store'
import type { DraftOp } from '@/services/draft-api'
import type { RosterItem } from '@/types/roster'

const op = (id: string, o: DraftOp): DraftOperation =>
  ({ id, op: o, affectedCrewIds: [], affectedPairingIds: [], timestamp: 0 })

// Two legs of one ADD→ASO→ADD pairing (ET137/ET136) flown by T2001, plus a T2002 ground task.
const base = [
  { id: 11, crewId: 'T2001', pairingId: 151614, pairingLabel: 'ET137/ET136', schStrDtUtc: '2026-09-01T06:00:00Z' },
  { id: 12, crewId: 'T2001', pairingId: 151614, pairingLabel: 'ET137/ET136', schStrDtUtc: '2026-09-01T09:30:00Z' },
  { id: 21, crewId: 'T2002', pairingId: null, assignment: 'SBY', schStrDtUtc: '2026-09-02T04:00:00Z' },
] as unknown as RosterItem[]

const L2 = { autonomy: 'L2' as const, maxPlanChanges: 20 }

describe('buildPlanLines', () => {
  it('describes every pending change and marks which ones R\'Bot made', () => {
    const lines = buildPlanLines([
      op('d1', { type: 'remove-pairing-from-crew', pairingId: 151614, crewId: 'T2001' }),
      op('d2', { type: 'move', taskId: 21, toCrewId: 'T2003' }),
    ], new Set(['d1']), base)
    expect(lines).toEqual([
      { opId: 'd1', text: 'Take T2001 off ET137/ET136 on 2026-09-01', byRbot: true, manualOnly: false },
      { opId: 'd2', text: 'Move SBY on 2026-09-02 from T2002 to T2003', byRbot: false, manualOnly: false },
    ])
  })

  it('flags pairing / flight changes as manual-only', () => {
    const lines = buildPlanLines([
      op('d1', { type: 'remove-pairing', pairingId: 151614 }),
      op('d2', { type: 'edit-flight', flightId: 9001 }),
    ], new Set(['d1']), base)
    expect(lines.map((l) => [l.text, l.manualOnly])).toEqual([
      ['Delete pairing 151614', true],
      ['Change flight times (flight 9001)', true],
    ])
  })
})

describe('canRbotSave (L2 contract)', () => {
  const rbotLine = buildPlanLines([op('d1', { type: 'remove-pairing-from-crew', pairingId: 151614, crewId: 'T2001' })], new Set(['d1']), base)

  it('L2 + allowed change + under the cap → may save', () => {
    expect(canRbotSave(rbotLine, L2)).toEqual({ ok: true })
  })

  it('kill switch: L1 / L0 → never saves', () => {
    expect(canRbotSave(rbotLine, { ...L2, autonomy: 'L1' })).toMatchObject({ ok: false, reason: expect.stringContaining('L1') })
    expect(canRbotSave(rbotLine, { ...L2, autonomy: 'L0' }).ok).toBe(false)
  })

  it('over the per-plan cap → manual Save', () => {
    expect(canRbotSave(rbotLine, { ...L2, maxPlanChanges: 0 }).ok).toBe(false)
    const many = buildPlanLines(
      Array.from({ length: 3 }, (_, i) => op(`d${i}`, { type: 'remove', taskId: 11 })), new Set(['d0']), base)
    expect(canRbotSave(many, { ...L2, maxPlanChanges: 2 })).toMatchObject({ ok: false, reason: expect.stringContaining('over R\'Bot\'s limit of 2') })
  })

  it('any manual-only change in the draft blocks R\'Bot from saving the batch', () => {
    const mixed = buildPlanLines([
      op('d1', { type: 'remove-pairing-from-crew', pairingId: 151614, crewId: 'T2001' }),
      op('d2', { type: 'remove-pairing', pairingId: 151700 }),
    ], new Set(['d1']), base)
    expect(canRbotSave(mixed, L2)).toMatchObject({ ok: false, reason: expect.stringContaining('manual Save') })
  })

  it('nothing pending → nothing to save', () => {
    expect(canRbotSave([], L2).ok).toBe(false)
  })
})

describe('parseRbotPolicy', () => {
  it('reads SYS_PARAM rows', () => {
    expect(parseRbotPolicy([
      { code: 'RBOT_AUTONOMY', codeValue: 'l2' },
      { code: 'RBOT_MAX_PLAN_CHANGES', codeValue: '20' },
    ])).toEqual({ autonomy: 'L2', maxPlanChanges: 20 })
  })

  it('fails closed when rows are missing or garbage', () => {
    expect(parseRbotPolicy([])).toEqual(FAIL_CLOSED_POLICY)
    expect(parseRbotPolicy([{ code: 'RBOT_AUTONOMY', codeValue: 'L9' }, { code: 'RBOT_MAX_PLAN_CHANGES', codeValue: '-3' }]))
      .toEqual({ autonomy: 'L1', maxPlanChanges: 0 })
  })
})
