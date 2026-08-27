import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import {
  getScenarioGanttStore,
  destroyScenarioGanttStore,
} from '@/stores/scenario-gantt-store'
import { useScenarioEditController } from '../scenario-edit-controller'
import type { GanttCapabilities } from '../gantt-pane-source'
import type { ScenarioGanttData, LockStatus, ScenarioGanttPairing } from '@/types/scenario-gantt'
import type { DraftLegalityPreviewResponse } from '@/services/legality-preview-api'
import type { RuleViolation } from '@/types/rule-check'

const mocks = vi.hoisted(() => ({
  checkDraft: vi.fn(),
  toRuleViolations: vi.fn(),
  showConfirmDialog: vi.fn(),
  setChecking: vi.fn(),
  confirmDialog: { open: false },
  confirmCrossRank: vi.fn(),
  notifyWarning: vi.fn(),
}))

vi.mock('@/services/legality-preview-api', () => ({
  legalityPreviewApi: {
    checkDraft: mocks.checkDraft,
    toRuleViolations: mocks.toRuleViolations,
  },
}))

vi.mock('@/utils/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: mocks.notifyWarning, info: vi.fn() },
}))

vi.mock('@/stores/rule-check-store', () => ({
  useRuleCheckStore: {
    getState: () => ({
      showConfirmDialog: mocks.showConfirmDialog,
      setChecking: mocks.setChecking,
      confirmDialog: mocks.confirmDialog,
    }),
  },
}))

vi.mock('@/components/scenario-gantt/cross-rank-confirm-dialog', () => ({
  useCrossRankConfirm: () => ({ confirmCrossRank: mocks.confirmCrossRank }),
}))

// Exercises the REAL per-scenario gantt store: execute() should push (or skip) an
// AssignmentPatch depending on capabilities + lock ownership. This is the regression
// guard for the capability/lock gate (PO scenario or a non-owner must never mutate).

const RO_CAPS: GanttCapabilities = {
  panes: ['roster', 'pairing'],
  defaultPanes: ['roster', 'pairing'],
  roster: { canAssign: true, canRemove: true, canReassign: true },
  pairing: { canEditSegments: false },
}

const PO_CAPS: GanttCapabilities = {
  panes: ['pairing', 'flight'],
  defaultPanes: ['pairing', 'flight'],
  roster: { canAssign: false, canRemove: false, canReassign: false },
  pairing: { canEditSegments: false },
}

const OWNER_LOCK: LockStatus = { locked: true, owner: 'me', ttl: 600, isOwner: true }
const FOREIGN_LOCK: LockStatus = { locked: true, owner: 'other', ttl: 600, isOwner: false }

type PreviewViolation = DraftLegalityPreviewResponse['violations'][number]

const pairing = (id: number): ScenarioGanttPairing => ({
  pairingId: id,
  pairingLabel: `P${id}`,
  base: 'YYZ',
  fleet: 'A320',
  schStrDtUtc: '2026-08-10T12:00:00Z',
  schEndDtUtc: '2026-08-10T18:00:00Z',
  assignmentGroup: 'FLY',
  assignment: `P${id}`,
  division: 'P',
  // One open CA slot by default so the assign rank gate passes for rank-CA crews.
  compositions: [{ rank: 'CA', plan: 1, fill: 0 }],
})

// Rank-effective CA history so the assign gate resolves a valid rank on 2026-08-10.
const makeCrew = (crewId: string) => ({
  crewId,
  base: 'YYZ',
  division: 'P',
  rank: 'CA',
  crewRank: 'CA',
  seniorityNum: null,
  crewName: crewId,
  ranks: [{ id: 1, crewId, rank: 'CA', effDt: '2026-01-01T00:00:00Z', expDt: null }],
})

const previewViolation = (overrides: Partial<PreviewViolation> = {}): PreviewViolation => ({
  crewId: 'C1',
  pairingId: 42,
  dutySeq: 1,
  ruleCode: '1001',
  ruleInstance: 'default',
  scopeKey: 'scope',
  severity: 2,
  startDt: '2026-08-10T12:00:00Z',
  endDt: '2026-08-10T18:00:00Z',
  message: 'violation',
  ...overrides,
})

const ruleViolation = (v: PreviewViolation): RuleViolation => ({
  ruleCode: v.ruleCode,
  ruleName: v.ruleInstance,
  severity: v.severity,
  canOverride: v.severity < 2,
  message: v.message,
  targetId: v.pairingId ?? v.crewId,
  targetType: v.pairingId == null ? 'crew' : 'pairing',
  crewId: v.crewId,
  anchorPairingId: v.pairingId,
  windowStartDt: v.startDt,
  windowEndDt: v.endDt,
  isNew: true,
})

const seed = (
  id: number,
  caps: GanttCapabilities,
  lock: LockStatus | null,
  overrides: Partial<ScenarioGanttData> = {},
) => {
  getScenarioGanttStore(id).setState({
    data: {
      capabilities: caps,
      crew: [makeCrew('C1'), makeCrew('C2'), makeCrew('C3')],
      pairings: [pairing(42), pairing(7), pairing(9)],
      assignments: [],
      pairingSegments: [],
      groundItems: [],
      ...overrides,
    } as unknown as ScenarioGanttData,
    lockStatus: lock,
    pendingChanges: [],
    isDirty: false,
  })
}

// Render the hook once and capture its execute fn (per-scenario stable).
const captureExecute = (id: number): ((op: Parameters<ReturnType<typeof useScenarioEditController>['execute']>[0]) => Promise<void>) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let execute!: ReturnType<typeof useScenarioEditController>['execute']
  const Probe = () => {
    execute = useScenarioEditController(id).execute
    return null
  }
  act(() => { createRoot(container).render(React.createElement(Probe)) })
  document.body.removeChild(container)
  return execute
}

describe('useScenarioEditController', () => {
  beforeEach(() => {
    for (const id of [991001, 991002, 991003, 991004, 991005, 991006, 991007, 991008, 991009, 991010, 991011, 991012, 991013, 991020, 991021]) {
      destroyScenarioGanttStore(id)
    }
    vi.clearAllMocks()
    mocks.checkDraft.mockReset()
    mocks.checkDraft.mockResolvedValue({ allowed: true, violations: [] })
    mocks.toRuleViolations.mockImplementation((violations: PreviewViolation[]) =>
      violations.map(ruleViolation),
    )
    mocks.showConfirmDialog.mockResolvedValue(true)
    mocks.confirmCrossRank.mockReset()
    mocks.confirmCrossRank.mockResolvedValue(true)
    mocks.notifyWarning.mockReset()
  })

  it('RO + owner: roster-assign pushes an add patch', async () => {
    const id = 991001
    seed(id, RO_CAPS, OWNER_LOCK)
    const execute = captureExecute(id)
    await act(async () => { await execute({ type: 'roster-assign', pairingId: 42, toCrewId: 'C1' }) })
    expect(getScenarioGanttStore(id).getState().pendingChanges).toEqual([
      { op: 'add', crewId: 'C1', pairingId: 42, rosterActingRank: 'CA' },
    ])
  })

  it('RO + owner: CR roster-remove and roster-reassign map to remove/reassign patches', async () => {
    const id = 991002
    seed(id, RO_CAPS, OWNER_LOCK, {
      assignments: [
        { crewId: 'C2', pairingId: 7, source: 'CR' },
        { crewId: 'C2', pairingId: 9, source: 'CR' },
      ] as ScenarioGanttData['assignments'],
    })
    const execute = captureExecute(id)
    await act(async () => {
      await execute({ type: 'roster-remove', pairingId: 7, crewId: 'C2' })
      await execute({ type: 'roster-reassign', pairingId: 9, fromCrewId: 'C2', toCrewId: 'C3' })
    })
    expect(getScenarioGanttStore(id).getState().pendingChanges).toEqual([
      { op: 'remove', crewId: 'C2', pairingId: 7 },
      { op: 'reassign', crewId: 'C2', pairingId: 9, toCrewId: 'C3' },
    ])
  })

  it('does not remove or reassign non-CR/MA roster tasks (PA/IMP immutable)', async () => {
    const id = 991005
    seed(id, RO_CAPS, OWNER_LOCK, {
      assignments: [
        { crewId: 'C2', pairingId: 7, source: 'PA' },
        { crewId: 'C2', pairingId: 9, source: 'IMP' },
      ] as ScenarioGanttData['assignments'],
    })
    const execute = captureExecute(id)
    await act(async () => {
      await execute({ type: 'roster-remove', pairingId: 7, crewId: 'C2' })
      await execute({ type: 'roster-reassign', pairingId: 9, fromCrewId: 'C2', toCrewId: 'C3' })
    })
    expect(getScenarioGanttStore(id).getState().pendingChanges).toEqual([])
  })

  it('MA (user-assigned) roster tasks can be removed and reassigned', async () => {
    const id = 991013
    seed(id, RO_CAPS, OWNER_LOCK, {
      assignments: [
        { crewId: 'C2', pairingId: 7, source: 'MA' },
        { crewId: 'C2', pairingId: 9, source: 'MA' },
      ] as ScenarioGanttData['assignments'],
    })
    const execute = captureExecute(id)
    await act(async () => {
      await execute({ type: 'roster-remove', pairingId: 7, crewId: 'C2' })
      await execute({ type: 'roster-reassign', pairingId: 9, fromCrewId: 'C2', toCrewId: 'C3' })
    })
    expect(getScenarioGanttStore(id).getState().pendingChanges).toEqual([
      { op: 'remove', crewId: 'C2', pairingId: 7 },
      { op: 'reassign', crewId: 'C2', pairingId: 9, toCrewId: 'C3' },
    ])
  })

  it('PO scenario (no roster capability): execute is a no-op even when lock-owned', async () => {
    const id = 991003
    seed(id, PO_CAPS, OWNER_LOCK)
    const execute = captureExecute(id)
    await act(async () => { await execute({ type: 'roster-assign', pairingId: 1, toCrewId: 'C1' }) })
    expect(getScenarioGanttStore(id).getState().pendingChanges).toEqual([])
  })

  it('Non-owner (foreign lock): RO capability present but execute is a no-op', async () => {
    const id = 991004
    seed(id, RO_CAPS, FOREIGN_LOCK)
    const execute = captureExecute(id)
    await act(async () => { await execute({ type: 'roster-remove', pairingId: 5, crewId: 'C9' }) })
    expect(getScenarioGanttStore(id).getState().pendingChanges).toEqual([])
  })

  it('unrelated pre-existing hard violations do not block assign (Live-aligned filter)', async () => {
    const id = 991006
    seed(id, RO_CAPS, OWNER_LOCK)
    // Fresh assign: beforeItems empty → only after checkDraft. Unrelated hard must not block.
    mocks.checkDraft.mockResolvedValueOnce({
      allowed: false,
      violations: [previewViolation({
        pairingId: 999,
        severity: 2,
        ruleCode: '1001',
        // Different calendar window than the assigned pairing — must not count as related.
        startDt: '2026-03-10T12:00:00Z',
        endDt: '2026-03-10T18:00:00Z',
      })],
    })
    const execute = captureExecute(id)
    await act(async () => { await execute({ type: 'roster-assign', pairingId: 42, toCrewId: 'C1' }) })
    expect(mocks.showConfirmDialog).not.toHaveBeenCalled()
    expect(getScenarioGanttStore(id).getState().pendingChanges).toEqual([
      { op: 'add', crewId: 'C1', pairingId: 42, rosterActingRank: 'CA' },
    ])
    expect(mocks.checkDraft.mock.calls.every((call) => call[0].contextType === 'scenario')).toBe(true)
    expect(mocks.checkDraft.mock.calls.every((call) => call[0].scenarioId === id)).toBe(true)
  })

  it('related soft violations open confirm and still apply when user proceeds', async () => {
    const id = 991007
    seed(id, RO_CAPS, OWNER_LOCK)
    const soft = previewViolation({ pairingId: 42, severity: 1, ruleCode: '8002' })
    // Fresh assign: beforeItems empty → only one checkDraft (after).
    mocks.checkDraft.mockResolvedValueOnce({ allowed: true, violations: [soft] })
    mocks.showConfirmDialog.mockResolvedValueOnce(true)
    const execute = captureExecute(id)
    await act(async () => { await execute({ type: 'roster-assign', pairingId: 42, toCrewId: 'C1' }) })
    expect(mocks.showConfirmDialog).toHaveBeenCalledOnce()
    expect(getScenarioGanttStore(id).getState().pendingChanges).toEqual([
      { op: 'add', crewId: 'C1', pairingId: 42, rosterActingRank: 'CA' },
    ])
  })

  it('related hard violations open confirm; the optimistic patch is applied then rolled back', async () => {
    const id = 991008
    seed(id, RO_CAPS, OWNER_LOCK)
    const hard = previewViolation({ pairingId: 42, severity: 2, ruleCode: '1001' })
    let resolveCheck!: (v: DraftLegalityPreviewResponse) => void
    mocks.checkDraft.mockImplementationOnce(() => new Promise<DraftLegalityPreviewResponse>((resolve) => { resolveCheck = resolve }))
    mocks.showConfirmDialog.mockResolvedValueOnce(true)
    const execute = captureExecute(id)
    let run!: Promise<void>
    await act(async () => { run = execute({ type: 'roster-assign', pairingId: 42, toCrewId: 'C1' }) })
    // Optimistic: the patch is already on the roster while the legality preview is pending.
    expect(getScenarioGanttStore(id).getState().pendingChanges).toEqual([
      { op: 'add', crewId: 'C1', pairingId: 42, rosterActingRank: 'CA' },
    ])
    await act(async () => {
      resolveCheck({ allowed: false, violations: [hard] })
      await run
    })
    expect(mocks.showConfirmDialog).toHaveBeenCalledOnce()
    // Blocking violation → rolled back: no patch left, warning toast shown.
    expect(getScenarioGanttStore(id).getState().pendingChanges).toEqual([])
    expect(mocks.notifyWarning).toHaveBeenCalled()
  })

  it('optimistic: the add patch is applied before the legality preview resolves and kept when legal', async () => {
    const id = 991020
    seed(id, RO_CAPS, OWNER_LOCK)
    let resolveCheck!: (v: DraftLegalityPreviewResponse) => void
    mocks.checkDraft.mockImplementationOnce(() => new Promise<DraftLegalityPreviewResponse>((resolve) => { resolveCheck = resolve }))
    const execute = captureExecute(id)
    let run!: Promise<void>
    await act(async () => { run = execute({ type: 'roster-assign', pairingId: 42, toCrewId: 'C1' }) })
    // Optimistic apply is synchronous — the patch is visible while the check is pending.
    expect(getScenarioGanttStore(id).getState().pendingChanges).toEqual([
      { op: 'add', crewId: 'C1', pairingId: 42, rosterActingRank: 'CA' },
    ])
    await act(async () => {
      resolveCheck({ allowed: true, violations: [] })
      await run
    })
    // Legal → the optimistic patch stays, no rollback warning.
    expect(getScenarioGanttStore(id).getState().pendingChanges).toEqual([
      { op: 'add', crewId: 'C1', pairingId: 42, rosterActingRank: 'CA' },
    ])
    expect(mocks.notifyWarning).not.toHaveBeenCalled()
  })

  // ── Regression: rule-check-store.checking must be flipped around the async
  //    legality preview so the toolbar's Save / Undo stay disabled during the
  //    brief window between addPatch and the confirm dialog appearing (SIT
  //    drag-pairing-onto-crew flicker — the dialog opens ~1s after addPatch).
  it('locks the toolbar BEFORE addPatch and releases it after a clean legal preview', async () => {
    const id = 991030
    seed(id, RO_CAPS, OWNER_LOCK)
    mocks.checkDraft.mockResolvedValueOnce({ allowed: true, violations: [] })
    const execute = captureExecute(id)
    await act(async () => { await execute({ type: 'roster-assign', pairingId: 42, toCrewId: 'C1' }) })
    // setChecking(true) must precede setChecking(false); release happens on the
    // success branch. Without this, Save flickers enabled during the 1-2s
    // preview window.
    const calls = mocks.setChecking.mock.calls.map((c) => c[0])
    expect(calls).toEqual([true, false])
  })

  it('leaves setChecking(true) when the confirm dialog owns the flag', async () => {
    const id = 991031
    seed(id, RO_CAPS, OWNER_LOCK)
    const hard = previewViolation({ pairingId: 42, severity: 2, ruleCode: '1001' })
    mocks.checkDraft.mockResolvedValueOnce({ allowed: false, violations: [hard] })
    mocks.showConfirmDialog.mockResolvedValueOnce(true)
    // Simulate showConfirmDialog leaving the confirm dialog open (it sets
    // confirmDialog.open=true on its own — the controller must respect that).
    mocks.confirmDialog.open = true
    try {
      const execute = captureExecute(id)
      await act(async () => { await execute({ type: 'roster-assign', pairingId: 42, toCrewId: 'C1' }) })
      const calls = mocks.setChecking.mock.calls.map((c) => c[0])
      expect(calls).toEqual([true])
    } finally {
      mocks.confirmDialog.open = false
    }
  })

  it('releases setChecking on the rollback path when no dialog is open', async () => {
    const id = 991032
    seed(id, RO_CAPS, OWNER_LOCK)
    const hard = previewViolation({ pairingId: 42, severity: 2, ruleCode: '1001' })
    mocks.checkDraft.mockResolvedValueOnce({ allowed: false, violations: [hard] })
    mocks.showConfirmDialog.mockResolvedValueOnce(false) // user cancelled
    mocks.confirmDialog.open = false
    const execute = captureExecute(id)
    await act(async () => { await execute({ type: 'roster-assign', pairingId: 42, toCrewId: 'C1' }) })
    // Even though we rolled back, the toolbar must be unlocked — the user
    // cancelled the dialog and the patch was reverted, so they can act again.
    const calls = mocks.setChecking.mock.calls.map((c) => c[0])
    expect(calls).toEqual([true, false])
  })

  it('assign gate: no valid CrewRank for the task date blocks with no patch', async () => {
    const id = 991009
    seed(id, RO_CAPS, OWNER_LOCK, {
      crew: [{ ...makeCrew('C1'), ranks: [] }, makeCrew('C2'), makeCrew('C3')],
    } as ScenarioGanttData)
    const execute = captureExecute(id)
    await act(async () => { await execute({ type: 'roster-assign', pairingId: 42, toCrewId: 'C1' }) })
    expect(getScenarioGanttStore(id).getState().pendingChanges).toEqual([])
    expect(mocks.checkDraft).not.toHaveBeenCalled()
  })

  it('assign gate: pairing with no open position blocks with no patch', async () => {
    const id = 991010
    seed(id, RO_CAPS, OWNER_LOCK, {
      // CA slot is locally filled by an existing assignment → not open for C1.
      assignments: [{ crewId: 'C2', pairingId: 42, source: 'CR', rosterActingRank: 'CA' }],
    } as ScenarioGanttData)
    const execute = captureExecute(id)
    await act(async () => { await execute({ type: 'roster-assign', pairingId: 42, toCrewId: 'C1' }) })
    expect(getScenarioGanttStore(id).getState().pendingChanges).toEqual([])
    expect(mocks.checkDraft).not.toHaveBeenCalled()
  })

  it('assign gate: cross-rank confirmed → patch carries the open-slot rank', async () => {
    const id = 991011
    seed(id, RO_CAPS, OWNER_LOCK, {
      crew: [
        { ...makeCrew('C1'), rank: 'FO', crewRank: 'FO', ranks: [{ id: 1, crewId: 'C1', rank: 'FO', effDt: '2026-01-01T00:00:00Z', expDt: null }] },
        makeCrew('C2'), makeCrew('C3'),
      ],
    } as ScenarioGanttData)
    mocks.confirmCrossRank.mockResolvedValueOnce(true)
    const execute = captureExecute(id)
    await act(async () => { await execute({ type: 'roster-assign', pairingId: 42, toCrewId: 'C1' }) })
    expect(mocks.confirmCrossRank).toHaveBeenCalledWith(
      expect.objectContaining({ crewId: 'C1', crewRank: 'FO', actingRank: 'CA', pairingLabel: 'P42' }),
    )
    expect(getScenarioGanttStore(id).getState().pendingChanges).toEqual([
      { op: 'add', crewId: 'C1', pairingId: 42, rosterActingRank: 'CA' },
    ])
  })

  it('assign gate: cross-rank declined → no patch', async () => {
    const id = 991012
    seed(id, RO_CAPS, OWNER_LOCK, {
      crew: [
        { ...makeCrew('C1'), rank: 'FO', crewRank: 'FO', ranks: [{ id: 1, crewId: 'C1', rank: 'FO', effDt: '2026-01-01T00:00:00Z', expDt: null }] },
        makeCrew('C2'), makeCrew('C3'),
      ],
    } as ScenarioGanttData)
    mocks.confirmCrossRank.mockResolvedValueOnce(false)
    const execute = captureExecute(id)
    await act(async () => { await execute({ type: 'roster-assign', pairingId: 42, toCrewId: 'C1' }) })
    expect(mocks.confirmCrossRank).toHaveBeenCalledOnce()
    expect(getScenarioGanttStore(id).getState().pendingChanges).toEqual([])
    expect(mocks.checkDraft).not.toHaveBeenCalled()
  })

  it('roster-remove of a pending add cancels the add instead of emitting a remove patch', async () => {
    const id = 991021
    seed(id, RO_CAPS, OWNER_LOCK)
    const execute = captureExecute(id)

    await act(async () => { await execute({ type: 'roster-assign', pairingId: 42, toCrewId: 'C1' }) })
    expect(getScenarioGanttStore(id).getState().pendingChanges).toEqual([
      { op: 'add', crewId: 'C1', pairingId: 42, rosterActingRank: 'CA' },
    ])

    // Deleting the just-added (unsaved) task cancels the add — no [add, remove] batch.
    await act(async () => { await execute({ type: 'roster-remove', crewId: 'C1', pairingId: 42 }) })
    expect(getScenarioGanttStore(id).getState().pendingChanges).toEqual([])
  })
})
