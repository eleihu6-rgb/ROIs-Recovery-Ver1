import { beforeEach, describe, expect, it } from 'vitest'
import { buildBestFitPairingOptions } from '@/utils/best-fit-candidates'
import { useBestFitStore, selectionKey } from '@/stores/best-fit-store'
import type { PairingItem } from '@/types/pairing'
import * as assignOp from '@/utils/assign-pairing-op'
import * as bringToTop from '@/utils/bring-matches-to-top'
import { vi } from 'vitest'

// The apply path must reuse the SAME assign entry point a drag-drop uses.
vi.mock('@/utils/assign-pairing-op', () => ({ assignPairingDraft: vi.fn() }))
vi.mock('@/utils/bring-matches-to-top', () => ({ bringPairingIdToTop: vi.fn().mockResolvedValue(undefined) }))

/**
 * Best-fit entry-point orchestration.
 *
 * The pairing canvas right-click is unreliable in demo data (playbook §11.4), so
 * the Entry-1 path ("Find best-fit crew…" on one open pairing row) is covered here
 * at the logic level: which pairings are offered, and what the dialog preselects.
 */

const item = (
  id: number,
  over: Partial<PairingItem['pairing']> = {},
  composition: Array<{ rank: string; plan: number; fill: number }> = [{ rank: 'CA', plan: 1, fill: 0 }],
): PairingItem => ({
  pairing: {
    id,
    pairingLabel: `PA-${id}`,
    filiale: 'F8',
    division: 'P',
    base: 'YVR',
    fleet: '737',
    assignmentGroup: 'FLY',
    assignment: 'FLY',
    schStrDtUtc: '2026-09-20T08:00:00.000Z',
    schEndDtUtc: '2026-09-20T18:00:00.000Z',
    actStrDtUtc: '2026-09-20T08:00:00.000Z',
    actEndDtUtc: '2026-09-20T18:00:00.000Z',
    durationDays: 1,
    tafb: 1,
    dutyCount: 1,
    segCount: 2,
    blockMinutes: 300,
    ver: 1,
    isDeleted: 0,
    source: null,
    tags: null,
    comments: null,
    pairingDt: '2026-09-20',
    composition,
    isFull: false,
    ...over,
  },
  flights: [],
  segments: [],
  sessionTags: [],
})

describe('best-fit pairing options', () => {
  it('offers only pairings that still need crew', () => {
    const options = buildBestFitPairingOptions([
      item(1),
      item(2, {}, [{ rank: 'CA', plan: 1, fill: 1 }]),
      item(3, {}, [{ rank: 'CA', plan: 1, fill: 0 }, { rank: 'FO', plan: 1, fill: 1 }]),
    ])
    expect(options.map((option) => option.pairingId)).toEqual([1, 3])
  })

  it('summarises the open slots per pairing', () => {
    const [option] = buildBestFitPairingOptions([
      item(1, {}, [{ rank: 'CA', plan: 1, fill: 0 }, { rank: 'FO', plan: 2, fill: 1 }]),
    ])
    expect(option!.openSlots).toBe('CA ×1 · FO ×1')
  })

  it('orders by earliest departure so a batch starts with the most urgent work', () => {
    const options = buildBestFitPairingOptions([
      item(1, { schStrDtUtc: '2026-09-25T08:00:00.000Z' }),
      item(2, { schStrDtUtc: '2026-09-21T08:00:00.000Z' }),
      item(3, { schStrDtUtc: '2026-09-23T08:00:00.000Z' }),
    ])
    expect(options.map((option) => option.pairingId)).toEqual([2, 3, 1])
  })

  it('honours a rank-scoped pane filter', () => {
    const options = buildBestFitPairingOptions(
      [item(1, {}, [{ rank: 'CA', plan: 1, fill: 1 }, { rank: 'FO', plan: 1, fill: 0 }])],
      ['CA'],
    )
    // Scoped to CA, which is filled → nothing to fit even though FO is short.
    expect(options).toEqual([])
  })
})

describe('best-fit dialog entry state', () => {
  beforeEach(() => useBestFitStore.getState().reset())

  it('Entry 1 preselects exactly the right-clicked pairing', () => {
    const options = buildBestFitPairingOptions([item(101), item(102), item(103)])
    useBestFitStore.getState().openWith(options, [102])
    const state = useBestFitStore.getState()
    expect(state.open).toBe(true)
    expect([...state.selected]).toEqual([102])
    expect(state.activePairingId).toBe(102)
  })

  it('Entry 2 preselects a runnable batch rather than the whole month', () => {
    const options = buildBestFitPairingOptions(
      Array.from({ length: 40 }, (_, index) => item(200 + index)),
    )
    useBestFitStore.getState().openWith(options)
    expect(useBestFitStore.getState().selected.size).toBe(5)
  })

  it('shortlisting a crew invalidates a previously completed combined check', () => {
    useBestFitStore.getState().openWith(buildBestFitPairingOptions([item(1)]))
    useBestFitStore.setState({
      combined: {
        ok: true,
        hardViolations: [],
        softViolations: [],
        conflicts: [],
        crew: [],
        totalCost: { amount: 0, currencyCode: 'USD', status: 'priced' },
        comparison: 'complete',
        generatedAt: '2026-09-11T00:00:00.000Z',
      },
      combinedStale: false,
    })
    useBestFitStore.getState().selectCandidate(1, 'CA', '1455')
    expect(useBestFitStore.getState().choices[selectionKey(1, 'CA')]).toBe('1455')
    expect(useBestFitStore.getState().combinedStale).toBe(true)
  })
})

describe('best-fit apply (shortlist → assign draft)', () => {
  const passingCombined = (over: Partial<Awaited<ReturnType<typeof import('@/services/best-fit-api').bestFitApi.combinedPreview>>> = {}) => ({
    ok: true,
    hardViolations: [],
    softViolations: [],
    conflicts: [],
    crew: [],
    totalCost: { amount: 0, currencyCode: 'USD', status: 'priced' as const },
    comparison: 'complete' as const,
    generatedAt: '2026-09-11T00:00:00.000Z',
    ...over,
  })

  beforeEach(() => {
    useBestFitStore.getState().reset()
    vi.mocked(assignOp.assignPairingDraft).mockReset()
    vi.mocked(bringToTop.bringPairingIdToTop).mockReset().mockResolvedValue(undefined)
  })

  it('replays every shortlisted seat through the normal assign path', async () => {
    vi.mocked(assignOp.assignPairingDraft).mockResolvedValue({ ok: true, opId: 'op-1' })
    useBestFitStore.setState({
      open: true,
      candidates: [
        { pairingId: 1, label: 'PA-1', base: 'YVR', fleet: '737', departsLocal: 'x', openSlots: 'CA ×1' },
        { pairingId: 2, label: 'PA-2', base: 'YVR', fleet: '737', departsLocal: 'x', openSlots: 'FO ×1' },
      ],
      selected: new Set([1, 2]),
      choices: { [selectionKey(1, 'CA')]: '1455', [selectionKey(2, 'FO')]: '1512' },
      // The re-check that guards the apply returns a passing verdict.
      checkCombined: async () => useBestFitStore.setState({ combined: passingCombined(), combinedStale: false }),
    })

    await useBestFitStore.getState().applyShortlist()

    expect(vi.mocked(assignOp.assignPairingDraft).mock.calls).toEqual([
      [1, '1455'],
      [2, '1512'],
    ])
    expect(useBestFitStore.getState().applyResult).toEqual({ assigned: 2, failed: 0 })
    expect(useBestFitStore.getState().applying).toBe(false)
  })

  it('refuses to assign when the fresh combined check does not pass', async () => {
    useBestFitStore.setState({
      open: true,
      candidates: [{ pairingId: 1, label: 'PA-1', base: 'YVR', fleet: '737', departsLocal: 'x', openSlots: 'CA ×1' }],
      selected: new Set([1]),
      choices: { [selectionKey(1, 'CA')]: '1455' },
      checkCombined: async () =>
        useBestFitStore.setState({ combined: passingCombined({ ok: false }), combinedStale: false }),
    })

    await useBestFitStore.getState().applyShortlist()

    expect(vi.mocked(assignOp.assignPairingDraft)).not.toHaveBeenCalled()
    expect(useBestFitStore.getState().error).toMatch(/did not pass/)
  })

  it('reports a step refused by the live check instead of silently completing', async () => {
    vi.mocked(assignOp.assignPairingDraft)
      .mockResolvedValueOnce({ ok: true, opId: 'op-1' })
      .mockResolvedValueOnce({ ok: false, reason: 'Assignment reverted — legality check did not approve' })
    useBestFitStore.setState({
      open: true,
      candidates: [
        { pairingId: 1, label: 'PA-1', base: 'YVR', fleet: '737', departsLocal: 'x', openSlots: 'CA ×1' },
        { pairingId: 2, label: 'PA-2', base: 'YVR', fleet: '737', departsLocal: 'x', openSlots: 'FO ×1' },
      ],
      selected: new Set([1, 2]),
      choices: { [selectionKey(1, 'CA')]: '1455', [selectionKey(2, 'FO')]: '1512' },
      checkCombined: async () => useBestFitStore.setState({ combined: passingCombined(), combinedStale: false }),
    })

    await useBestFitStore.getState().applyShortlist()

    expect(useBestFitStore.getState().applyResult).toEqual({ assigned: 1, failed: 1 })
    expect(useBestFitStore.getState().applySteps.at(-1)?.ok).toBe(false)
  })
})
