import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  fetchScenarioLegality,
  applyScenarioLegalityResponse,
  refreshScenarioLegality,
  recheckScenarioLegality,
} from '../scenario-legality-api'
import { getScenarioViolationStore } from '@/stores/scenario-violation-store'
import { api } from '@/services/api'

vi.mock('@/services/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

vi.mock('@/stores/scenario-gantt-store', () => ({
  getScenarioGanttStore: vi.fn(() => ({ getState: () => ({ data: null }) })),
}))

const SCENARIO_ID = 683001

const initialState = {
  violations: new Map(),
  legalityStatus: null,
  computedAt: null,
  errorText: null,
  paramsStale: false,
  persistedRaw: [],
  computingSince: null,
}

describe('scenario-legality-api', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    getScenarioViolationStore(SCENARIO_ID).setState(initialState)
  })

  it('fetchScenarioLegality GETs the persisted legality', async () => {
    vi.mocked(api.get).mockResolvedValue({ status: 'READY', violations: [] })
    const res = await fetchScenarioLegality(SCENARIO_ID)
    expect(api.get).toHaveBeenCalledWith(`/api/scenario/${SCENARIO_ID}/legality`)
    expect(res.status).toBe('READY')
  })

  it('recheckScenarioLegality POSTs the recompute trigger', async () => {
    vi.mocked(api.post).mockResolvedValue({ status: 'COMPUTING' })
    await recheckScenarioLegality(SCENARIO_ID)
    expect(api.post).toHaveBeenCalledWith(`/api/scenario/${SCENARIO_ID}/legality/recheck`)
  })

  it('applyScenarioLegalityResponse applies READY violations into the store', () => {
    applyScenarioLegalityResponse(SCENARIO_ID, {
      status: 'READY',
      violations: [{
        crew_id: 'F8', pairing_id: 1, duty_seq: 1, rule_code: '8002', rule_instance: null,
        severity: 2, actual_value: null, limit_value: null, unit: null, message: 'x',
        start_dt: '2026-07-01', end_dt: '2026-07-01',
      }],
    })
    const st = getScenarioViolationStore(SCENARIO_ID).getState()
    expect(st.legalityStatus).toBe('READY')
    expect(st.persistedRaw).toHaveLength(1)
  })

  it('refreshScenarioLegality fetches and applies into the store', async () => {
    vi.mocked(api.get).mockResolvedValue({
      status: 'READY',
      violations: [{
        crew_id: '13372', pairing_id: null, duty_seq: null, rule_code: '8002', rule_instance: '001',
        severity: 2, actual_value: null, limit_value: null, unit: null, message: 'block',
        start_dt: '2026-09-01', end_dt: '2026-09-30',
      }],
    })
    await refreshScenarioLegality(SCENARIO_ID)
    const st = getScenarioViolationStore(SCENARIO_ID).getState()
    expect(api.get).toHaveBeenCalledWith(`/api/scenario/${SCENARIO_ID}/legality`)
    expect(st.legalityStatus).toBe('READY')
    expect(st.persistedRaw).toHaveLength(1)
    expect(st.persistedRaw[0]?.rule_code).toBe('8002')
  })

  it('refreshScenarioLegality applies COMPUTING and clears prior READY rows', async () => {
    applyScenarioLegalityResponse(SCENARIO_ID, {
      status: 'READY',
      violations: [{
        crew_id: '13372', pairing_id: null, duty_seq: null, rule_code: '7505', rule_instance: '001',
        severity: 2, actual_value: 2, limit_value: 4, unit: 'day', message: 'min gdo',
        start_dt: '2026-09-01', end_dt: '2026-09-30',
      }],
    })
    vi.mocked(api.get).mockResolvedValue({ status: 'COMPUTING', violations: [] })
    await refreshScenarioLegality(SCENARIO_ID)
    const st = getScenarioViolationStore(SCENARIO_ID).getState()
    expect(st.legalityStatus).toBe('COMPUTING')
    expect(st.persistedRaw).toEqual([])
    expect(st.violations.size).toBe(0)
  })
})
