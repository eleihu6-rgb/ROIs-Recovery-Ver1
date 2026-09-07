import { describe, expect, it } from 'vitest'
import { buildRecoveryCompareItems, buildRecoveryPairingPreview, resolveRecoveryPreviewItems, useRecoveryPreviewStore } from '@/stores/recovery-preview-store'
import type { RosterItem } from '@/types'
import type { RecoveryOption } from '@/services/recovery-candidates'

const item = (id: number, crewId: string, pairingId: number | null, flags: Partial<RosterItem> = {}): RosterItem => ({
  id,
  crewId,
  pairingId,
  ver: 1,
  base: 'SHA',
  label: `R${pairingId ?? 'GROUND'}`,
  assignmentGroup: pairingId == null ? 'SBY' : 'FLT',
  assignment: pairingId == null ? 'SBY' : 'FLY',
  role: null,
  subRole: null,
  source: 'OPS',
  isRequested: 0,
  isSwapped: 0,
  preference: null,
  comments: null,
  score: null,
  workingHour: null,
  schStrDtUtc: '2026-09-06T10:00:00Z',
  schEndDtUtc: '2026-09-06T12:00:00Z',
  actStrDtUtc: null,
  actEndDtUtc: null,
  fltId: null,
  fltDt: '2026-09-06',
  dutySeq: null,
  segSeq: null,
  division: 'P',
  flightActingRank: 'CAPT',
  rosterActingRank: null,
  activeRank: null,
  position: null,
  schCreditedMinutes: null,
  actCreditedMinutes: null,
  tagSet: null,
  exceptionCode: null,
  ybh: null,
  mbh: null,
  yal: null,
  mal: null,
  ydo: null,
  mdo: null,
  mcred: null,
  ...flags,
})

describe('recovery preview comparison', () => {
  it('keeps before items and overlays changed after items with unique ids', () => {
    const before = [item(1, 'T1001', 135559, { isRecoveryAffected: true }), item(2, 'T1002', 135500)]
    const after = [item(2, 'T1002', 135500), item(3, 'T1002', 135559, { isRecoveryAffected: true })]

    const compare = buildRecoveryCompareItems(before, after)

    expect(compare).toHaveLength(3)
    expect(compare.slice(0, 2).map((entry) => entry.id)).toEqual([1, 2])
    expect(compare[0].isRecoveryBefore).toBe(true)
    expect(compare[2].isRecoveryAfter).toBe(true)
    expect(compare[2].id).toBeLessThan(0)
    expect(new Set(compare.map((entry) => entry.id)).size).toBe(compare.length)
  })

  it('overlays retained callout standby and defaults to compare mode', () => {
    const before = [item(1, 'T1001', 135559, { isRecoveryAffected: true })]
    const after = [item(2, 'T1002', null, { isCalloutStandby: true }), item(3, 'T1002', 135559, { isRecoveryAffected: true })]

    const compare = resolveRecoveryPreviewItems({ liveItems: [], beforeItems: before, afterItems: after, view: 'compare' })

    expect(compare.filter((entry) => entry.isRecoveryAfter)).toHaveLength(2)
    expect(compare.find((entry) => entry.isCalloutStandby)?.isRecoveryAfter).toBe(true)
    expect(resolveRecoveryPreviewItems({ liveItems: [], beforeItems: before, afterItems: after, view: 'before' })).toEqual(before)
  })

  it('clears the Live preview state when the main layout is reset', () => {
    const before = [item(1, 'T1001', 135559, { isRecoveryAffected: true })]
    const after = [item(2, 'T1002', 135559, { isRecoveryAffected: true })]

    useRecoveryPreviewStore.getState().setPreview('option-1', after, before)
    expect(useRecoveryPreviewStore.getState().optionId).toBe('option-1')
    expect(useRecoveryPreviewStore.getState().beforeItems).toEqual(before)

    useRecoveryPreviewStore.getState().clear()

    expect(useRecoveryPreviewStore.getState().optionId).toBeNull()
    expect(useRecoveryPreviewStore.getState().items).toBeNull()
    expect(useRecoveryPreviewStore.getState().beforeItems).toBeNull()
  })

  it('builds modified and created Pairing preview rows from one recovery option', () => {
    const source = item(10, 'T1001', 135559, {
      schStrDtUtc: '2026-09-06T10:00:00Z',
      schEndDtUtc: '2026-09-06T12:00:00Z',
      isRecoveryAffected: true,
    })
    const dhd = item(11, 'T1002', -501, {
      assignmentGroup: 'DHD',
      assignment: 'DHD',
      label: 'DHD 9001 SHA-PEK',
      depArp: 'SHA',
      arvArp: 'PEK',
      fltId: 9001,
      schStrDtUtc: '2026-09-06T06:00:00Z',
      schEndDtUtc: '2026-09-06T08:00:00Z',
      isRecoveryAffected: true,
    })
    const option = {
      id: 'cross-base-1',
      mode: 'cross-base-standby',
      title: 'Cross-base standby',
      targetCrewId: 'T1002',
      targetCrewName: 'Crew 1002',
      sourceCrewId: 'T1001',
      sourcePairingId: 135559,
      targetPairingId: null,
      standbyTaskId: null,
      standbyWindow: null,
      timeDistanceMinutes: null,
      sameRank: true,
      sameBase: false,
      crossDivision: false,
      crossRole: false,
      localExecutable: true,
      reasons: [],
      beforeItems: [source],
      afterItems: [dhd, item(12, 'T1002', 135559, { isRecoveryAffected: true })],
      changes: [],
      metrics: {},
      ruleCheck: 'passed',
      ruleMessages: [],
      positioning: null,
    } as RecoveryOption

    const changes = buildRecoveryPairingPreview(option, [])

    expect(changes.map((change) => change.status)).toEqual(['modified', 'created'])
    expect(changes[0].beforeLabel).toContain('T1001')
    expect(changes[0].afterLabel).toContain('T1002')
    expect(changes[1].previewItem?.pairing.id).toBe(-501)
    expect(changes[1].previewItem?.pairing.assignmentGroup).toBe('DHD')
  })

  it('shows the adjusted base in the after state when a Destination Pairing is modified in place', () => {
    const beforeDhd = item(1, '1012', 135950, {
      base: 'YUL',
      assignmentGroup: 'FLY',
      assignment: 'DHD',
      segAssignment: 'DHD',
      depArp: 'YUL',
      arvArp: 'YYZ',
      schStrDtUtc: '2026-09-12T13:00:00Z',
      schEndDtUtc: '2026-09-12T14:28:00Z',
    })
    const beforeFlight = item(2, '1012', 135950, {
      base: 'YUL',
      depArp: 'YYZ',
      arvArp: 'YVR',
      schStrDtUtc: '2026-09-13T09:55:00Z',
      schEndDtUtc: '2026-09-13T15:05:00Z',
    })
    const beforeReturnDhd = item(3, '1012', 135950, {
      base: 'YUL',
      assignmentGroup: 'FLY',
      assignment: 'DHD',
      segAssignment: 'DHD',
      depArp: 'YYZ',
      arvArp: 'YUL',
      schStrDtUtc: '2026-09-16T18:00:00Z',
      schEndDtUtc: '2026-09-16T19:21:00Z',
    })
    const option = {
      id: 'destination-135950-296',
      mode: 'cross-base-destination',
      title: 'Destination-base Split 296',
      targetCrewId: '296',
      targetCrewName: 'Crew 296',
      sourceCrewId: '1012',
      sourcePairingId: 135950,
      targetPairingId: null,
      standbyTaskId: null,
      standbyWindow: null,
      timeDistanceMinutes: null,
      sameRank: true,
      sameBase: false,
      crossDivision: false,
      crossRole: false,
      localExecutable: true,
      reasons: [],
      beforeItems: [beforeDhd, beforeFlight, beforeReturnDhd],
      afterItems: [{ ...beforeFlight, id: -2, crewId: '296', base: 'YYZ', isRecoveryAffected: true }],
      changes: [],
      metrics: {},
      ruleCheck: 'passed',
      ruleMessages: [],
      positioning: null,
      destinationSplit: {
        destinationBase: 'YYZ',
        adjustedPairingBase: 'YYZ',
        sourcePairingId: 135950,
        createdPairingId: 135950,
        createsPairing: false,
        actingRank: 'CA',
        middleFlightIds: [77853],
        removedDhdFlightIds: [128642, 128643],
        dhdCostSavings: 0,
      },
    } as RecoveryOption

    const originalPairing = {
      pairing: {
        id: 135950,
        pairingLabel: '135950',
        base: 'YUL',
        segCount: 3,
        schStrDtUtc: '2026-09-12T13:00:00Z',
        schEndDtUtc: '2026-09-16T19:21:00Z',
        composition: [],
      },
      segments: [],
      flights: [],
      sessionTags: [],
    } as unknown as import('@/types/pairing').PairingItem
    const [change] = buildRecoveryPairingPreview(option, [originalPairing])

    expect(change.status).toBe('modified')
    expect(change.beforeSummary).toContain('Base YUL')
    expect(change.afterSummary).toContain('Base YYZ')
    expect(change.afterSummary).toContain('1 seg')
    expect(change.previewItem?.pairing.id).toBe(135950)
    expect(change.previewItem?.pairing.base).toBe('YYZ')
    expect(change.previewItem?.pairing.segments).toHaveLength(1)
    expect(change.previewItem?.pairing.segments?.[0]?.depArp).toBe('YYZ')
    expect(change.previewItem?.pairing.segments?.[0]?.arvArp).toBe('YVR')
  })

  it('flattens Pairing preview rows for every child of a combined option', () => {
    const child = {
      id: 'child-1',
      mode: 'transfer',
      title: 'Transfer 1',
      targetCrewId: 'T1002',
      targetCrewName: 'Crew 1002',
      sourceCrewId: 'T1001',
      sourcePairingId: 135559,
      targetPairingId: null,
      standbyTaskId: null,
      standbyWindow: null,
      timeDistanceMinutes: null,
      sameRank: true,
      sameBase: true,
      crossDivision: false,
      crossRole: false,
      localExecutable: true,
      reasons: [],
      beforeItems: [item(20, 'T1001', 135559, { isRecoveryAffected: true })],
      afterItems: [item(21, 'T1002', 135559, { isRecoveryAffected: true })],
      changes: [],
      metrics: {},
      ruleCheck: 'passed',
      ruleMessages: [],
      positioning: null,
    } as RecoveryOption
    const combined = { ...child, id: 'combined', subOptions: [child, { ...child, id: 'child-2', sourceCrewId: 'T1003', sourcePairingId: 135560 }] } as RecoveryOption

    expect(buildRecoveryPairingPreview(combined, []).length).toBe(2)
  })
})
