import { create } from 'zustand'
import { legalityApi } from '@/services/legality-api'
import { notify } from '@/utils/notify'
import type { LegalityCatalogRule, LegalityParamJson } from '@/types/legality'

/**
 * The Rule Instances page = the global rule catalog (Model A `rule` rows): templates
 * (instance '001') + copies. Loaded from GET /api/legality/rules. Admins can copy any
 * rule into a new editable instance, edit params (templates included — gated by
 * the LEGALITY_RULE_SETS / LEGALITY_RULE_INSTANCES permission ctls; admins get
 * every ctl via buildAdminContext() in live-server).
 * in the row, not by `locked`), and delete copies.
 */
export type RuleInstanceFocus = {
  functionCode: string
  instanceCode: string | null
}

interface RuleInstancesStore {
  rules: LegalityCatalogRule[]
  loading: boolean
  loaded: boolean
  /** Set by Alert Center Rule ID click; consumed by Rule Templates view. */
  pendingFocus: RuleInstanceFocus | null
  init: () => Promise<void>
  refresh: () => Promise<void>
  copy: (ruleId: number) => Promise<void>
  remove: (ruleId: number) => Promise<void>
  /** Update one rule's params locally after an inline save (avoids a full refetch). */
  applyParamSave: (ruleId: number, paramJson: LegalityParamJson) => void
  requestFocus: (focus: RuleInstanceFocus) => void
  clearPendingFocus: () => void
}

export const useRuleInstancesStore = create<RuleInstancesStore>((set, get) => ({
  rules: [],
  loading: false,
  loaded: false,
  pendingFocus: null,

  init: async () => {
    if (get().loaded || get().loading) return
    await get().refresh()
  },

  refresh: async () => {
    set({ loading: true })
    try {
      set({ rules: await legalityApi.listRules(), loaded: true })
    } catch {
      notify.error('Failed to load rule instances')
    } finally {
      set({ loading: false })
    }
  },

  copy: async (ruleId) => {
    try {
      await legalityApi.copyRule(ruleId)
      await get().refresh()
      notify.success('Rule copied to a new instance')
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Copy failed')
    }
  },

  remove: async (ruleId) => {
    try {
      await legalityApi.deleteRule(ruleId)
      await get().refresh()
      notify.success('Instance deleted')
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Delete failed')
    }
  },

  applyParamSave: (ruleId, paramJson) => {
    set((s) => ({
      rules: s.rules.map((r) => (r.id === ruleId ? { ...r, paramJson } : r)),
    }))
  },

  requestFocus: (focus) => set({ pendingFocus: focus }),
  clearPendingFocus: () => set({ pendingFocus: null }),
}))
