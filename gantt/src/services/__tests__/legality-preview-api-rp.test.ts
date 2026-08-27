import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  liveFilterState: vi.fn(),
  scenarioFilterState: vi.fn(),
  getLegalityState: vi.fn(),
  getRosterPeriodState: vi.fn(),
  getScenarioData: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  api: { post: mocks.apiPost },
}))

vi.mock('@/stores/filter-store', () => ({
  getFilterStore: (id: 'live' | number) => ({
    getState: () => (id === 'live' ? mocks.liveFilterState() : mocks.scenarioFilterState()),
  }),
}))

vi.mock('@/stores/legality-store', () => ({
  useLegalityStore: { getState: () => mocks.getLegalityState() },
}))

vi.mock('@/stores/roster-period-store', () => ({
  useRosterPeriodStore: { getState: () => mocks.getRosterPeriodState() },
}))

vi.mock('@/stores/scenario-gantt-store', () => ({
  getScenarioGanttStore: () => ({
    getState: () => ({ data: mocks.getScenarioData() }),
  }),
}))

import { legalityPreviewApi } from '@/services/legality-preview-api'

const augustFilter = {
  dateRange: {
    start: new Date('2026-08-01T00:00:00.000Z'),
    end: new Date('2026-08-31T23:59:59.000Z'),
  },
  selectedRosterPeriodIds: ['8'],
  selectedRosterPeriodRange: {
    startMs: Date.parse('2026-08-01T06:00:00.000Z'),
    endMs: Date.parse('2026-09-01T05:59:59.999Z'),
  },
}

const septemberFilter = {
  dateRange: {
    start: new Date('2026-09-01T00:00:00.000Z'),
    end: new Date('2026-09-30T23:59:59.000Z'),
  },
  selectedRosterPeriodIds: ['9'],
  selectedRosterPeriodRange: {
    startMs: Date.parse('2026-09-01T06:00:00.000Z'),
    endMs: Date.parse('2026-10-01T05:59:59.999Z'),
  },
}

describe('legalityPreviewApi.checkDraft RP bounds', () => {
  beforeEach(() => {
    mocks.apiPost.mockReset()
    mocks.apiPost.mockResolvedValue({ allowed: true, violations: [] })
    mocks.getLegalityState.mockReturnValue({ selectedId: 103 })
    mocks.getScenarioData.mockReturnValue(null)
    mocks.getRosterPeriodState.mockReturnValue({
      items: [
        { id: 7, rosterPeriod: '2026RP07', name: '2026-07', rpStart: '2026-07-01', rpEnd: '2026-07-31', isCurrent: true },
        { id: 8, rosterPeriod: '2026RP08', name: '2026-08', rpStart: '2026-08-01', rpEnd: '2026-08-31', isCurrent: false },
        { id: 9, rosterPeriod: '2026RP09', name: '2026-09', rpStart: '2026-09-01', rpEnd: '2026-09-30', isCurrent: false },
      ],
    })
    mocks.liveFilterState.mockReturnValue({
      dateRange: {
        start: new Date('2026-06-24T00:00:00.000Z'),
        end: new Date('2026-08-07T23:59:59.000Z'),
      },
      selectedRosterPeriodIds: ['7'],
      // End-of-local-day for July 31 in UTC-6 lands on Aug 1 UTC — must NOT become rpTo.
      selectedRosterPeriodRange: {
        startMs: Date.parse('2026-07-01T06:00:00.000Z'),
        endMs: Date.parse('2026-08-01T05:59:59.999Z'),
      },
    })
    mocks.scenarioFilterState.mockReturnValue(septemberFilter)
  })

  it('forwards roster_period rpStart/rpEnd strings (not UTC-shifted end-of-day)', async () => {
    await legalityPreviewApi.checkDraft({
      contextType: 'live',
      affectedCrewIds: ['246'],
      afterItems: [{ id: 1, crewId: '246' } as never],
      focusPairingIds: [15676],
    })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/legality/preview-draft',
      expect.objectContaining({
        rpFrom: '2026-07-01',
        rpTo: '2026-07-31',
        rulesetId: 103,
        focusPairingIds: [15676],
      }),
      expect.any(Object),
    )
  })

  it('falls back to biased ms→YMD when no RP ids are selected', async () => {
    mocks.liveFilterState.mockReturnValue({
      dateRange: {
        start: new Date('2026-07-01T06:00:00.000Z'),
        end: new Date('2026-08-01T05:59:59.999Z'),
      },
      selectedRosterPeriodIds: [],
      selectedRosterPeriodRange: {
        startMs: Date.parse('2026-07-01T06:00:00.000Z'),
        endMs: Date.parse('2026-08-01T05:59:59.999Z'),
      },
    })

    await legalityPreviewApi.checkDraft({
      contextType: 'live',
      affectedCrewIds: ['246'],
      afterItems: [{ id: 1, crewId: '246' } as never],
    })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/legality/preview-draft',
      expect.objectContaining({ rpFrom: '2026-07-01', rpTo: '2026-07-31' }),
      expect.any(Object),
    )
  })

  it('keeps explicit rpFrom/rpTo when the caller already supplied them', async () => {
    await legalityPreviewApi.checkDraft({
      contextType: 'live',
      affectedCrewIds: ['246'],
      afterItems: [{ id: 1, crewId: '246' } as never],
      rpFrom: '2026-06-01',
      rpTo: '2026-06-30',
    })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/legality/preview-draft',
      expect.objectContaining({ rpFrom: '2026-06-01', rpTo: '2026-06-30' }),
      expect.any(Object),
    )
  })

  it('uses the scenario filter RP even when Live filter is on another month', async () => {
    // Live still on August (the SIT bug: scenario Sep assign posted Aug bounds).
    mocks.liveFilterState.mockReturnValue(augustFilter)
    mocks.scenarioFilterState.mockReturnValue(septemberFilter)

    await legalityPreviewApi.checkDraft({
      contextType: 'scenario',
      scenarioId: 740,
      affectedCrewIds: ['13645'],
      afterItems: [{ id: 1, crewId: '13645' } as never],
      focusPairingIds: [138766],
    })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/legality/preview-draft',
      expect.objectContaining({
        contextType: 'scenario',
        scenarioId: 740,
        rpFrom: '2026-09-01',
        rpTo: '2026-09-30',
      }),
      expect.any(Object),
    )
  })

  it('falls back to scenario strDtLoc/endDtLoc when scenario has no RP ids selected', async () => {
    mocks.liveFilterState.mockReturnValue(augustFilter)
    mocks.scenarioFilterState.mockReturnValue({
      dateRange: {
        start: new Date('2026-08-25T00:00:00.000Z'),
        end: new Date('2026-10-07T23:59:59.000Z'),
      },
      selectedRosterPeriodIds: [],
      selectedRosterPeriodRange: null,
    })
    mocks.getScenarioData.mockReturnValue({
      strDtLoc: '2026-09-01T04:00:00.000Z',
      endDtLoc: '2026-09-30T04:00:00.000Z',
    })

    await legalityPreviewApi.checkDraft({
      contextType: 'scenario',
      scenarioId: 740,
      affectedCrewIds: ['13645'],
      afterItems: [{ id: 1, crewId: '13645' } as never],
    })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/legality/preview-draft',
      expect.objectContaining({ rpFrom: '2026-09-01', rpTo: '2026-09-30' }),
      expect.any(Object),
    )
    const body = mocks.apiPost.mock.calls[0][1] as Record<string, unknown>
    expect(body.rpFrom).not.toBe('2026-08-25')
    expect(body.rpTo).not.toBe('2026-10-07')
  })

  it('omits rpFrom/rpTo when no official RP can be resolved (does not send padded dateRange)', async () => {
    mocks.liveFilterState.mockReturnValue({
      dateRange: {
        start: new Date('2026-08-25T00:00:00.000Z'),
        end: new Date('2026-10-07T23:59:59.000Z'),
      },
      selectedRosterPeriodIds: [],
      selectedRosterPeriodRange: null,
    })

    await legalityPreviewApi.checkDraft({
      contextType: 'live',
      affectedCrewIds: ['246'],
      afterItems: [{ id: 1, crewId: '246' } as never],
    })

    const body = mocks.apiPost.mock.calls[0][1] as Record<string, unknown>
    expect(body.rpFrom).toBeUndefined()
    expect(body.rpTo).toBeUndefined()
  })

  it('treats severity 2 draft violations as overridable so Continue stays available', () => {
    const [soft, hard] = legalityPreviewApi.toRuleViolations([
      {
        crewId: '246',
        pairingId: 15572,
        dutySeq: 1,
        ruleCode: '7504',
        ruleInstance: '001',
        scopeKey: '246:15572:1',
        severity: 2,
        startDt: null,
        endDt: null,
        message: 'soft warning',
      },
      {
        crewId: '246',
        pairingId: 15572,
        dutySeq: 1,
        ruleCode: '1001',
        ruleInstance: '001',
        scopeKey: '246:15572:1',
        severity: 3,
        startDt: null,
        endDt: null,
        message: 'hard stop',
      },
    ])

    expect(soft.canOverride).toBe(true)
    expect(hard.canOverride).toBe(false)
  })
})
