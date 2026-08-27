import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/legality-api', () => ({
  legalityApi: {
    getRuleset: vi.fn().mockResolvedValue({
      workset: { id: 2, name: 'Other Set', category: null },
      rules: [],
    }),
    listRulesets: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/utils/notify', () => ({
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

import { useLegalityStore } from '../legality-store'
import type { LegalityCatalogRule, UpdateRuleParamsResult } from '@/types/legality'

const catalogRule = (id: number, fn: number, inst: string): LegalityCatalogRule => ({
  id,
  function: fn,
  instance: inst,
  reference: 'Flair',
  category: 'Rest',
  description: 'Roster Spacing',
  detail: null,
  severity: 2,
  overridability: null,
  division: 'FD',
  owner: null,
  locked: null,
  paramJson: {
    tables: [{ header: ['Space', 'Unit'], rows: [['10', 'RH']] }],
  },
  isTemplate: inst === '001',
})

describe('legality store catalog selection', () => {
  beforeEach(() => {
    useLegalityStore.setState({
      sets: [],
      selectedId: null,
      worksetName: null,
      rules: [],
      catalogRules: [],
      selectedCatalogRuleId: null,
      loadingList: false,
      loadingRules: false,
      loaded: false,
      lastSave: null,
    })
  })

  it('selectCatalogRule sets selectedCatalogRuleId', () => {
    useLegalityStore.getState().setCatalogRules([catalogRule(10, 8056, '001')])
    useLegalityStore.getState().selectCatalogRule(10)
    expect(useLegalityStore.getState().selectedCatalogRuleId).toBe(10)
  })

  it('selectSet clears selectedCatalogRuleId', async () => {
    useLegalityStore.setState({
      selectedId: 1,
      selectedCatalogRuleId: 10,
      catalogRules: [catalogRule(10, 8056, '001')],
    })
    await useLegalityStore.getState().selectSet(2)
    expect(useLegalityStore.getState().selectedCatalogRuleId).toBeNull()
    expect(useLegalityStore.getState().selectedId).toBe(2)
  })

  it('recordParamSave updates catalogRules paramJson', () => {
    useLegalityStore.getState().setCatalogRules([catalogRule(10, 8056, '001')])
    const result: UpdateRuleParamsResult = {
      paramJson: { tables: [{ header: ['Space', 'Unit'], rows: [['12', 'RH']] }] },
      affectsLiveDefault: false,
      scenarioCount: 0,
      recheckRuleCodes: null,
    }
    useLegalityStore.getState().recordParamSave(10, result)
    expect(useLegalityStore.getState().catalogRules[0]?.paramJson?.tables[0]?.rows[0]?.[0]).toBe('12')
  })
})
