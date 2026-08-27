import { create } from 'zustand'
import { legalityApi } from '@/services/legality-api'
import { notify } from '@/utils/notify'
import type {
  LegalityCatalogRule,
  LegalityRule,
  LegalityRulesetSummary,
  UpdateRuleParamsResult,
  UpdateRuleMetaRequest,
} from '@/types/legality'

/**
 * The Legality tab lists every legacy ruleset (workset) that maps ≥1 rule and lets the
 * planner switch between them. Currently that's 433 "F8 Full Ruleset" (all 14 F8 rules)
 * and 103 "PBS Solver Ruleset" (the 2-rule 8002 subset kept for Rust-rule testing).
 * The list is fetched from GET /api/legality/rulesets (most-rules-first), so nothing is
 * hardcoded; selection defaults to the first/fullest ruleset.
 */
interface LegalityStore {
  sets: LegalityRulesetSummary[]
  selectedId: number | null
  worksetName: string | null
  rules: LegalityRule[]
  /** Full catalog from GET /api/legality/rules — shared by tree + instance params panel. */
  catalogRules: LegalityCatalogRule[]
  /** When set, the right panel shows this catalog instance's params instead of the set table. */
  selectedCatalogRuleId: number | null
  loadingList: boolean
  loadingRules: boolean
  loaded: boolean
  /**
   * Last successful param save — bridges the deep param editor (rendered per-row and in
   * the pop-out dialog) up to LegalityView, which owns the recheck indicator + date range.
   * `seq` is a monotonic counter so LegalityView can react to each save via useEffect.
   */
  lastSave: { seq: number; result: UpdateRuleParamsResult } | null
  init: () => Promise<void>
  selectSet: (id: number) => Promise<void>
  setCatalogRules: (rules: LegalityCatalogRule[]) => void
  selectCatalogRule: (id: number | null) => void
  /** Record a successful param save: update local param state AND publish the result for LegalityView. */
  recordParamSave: (ruleId: number, result: UpdateRuleParamsResult) => void
  // ── Rule Set management (admin) ──
  refreshSets: () => Promise<void>
  createSet: (data: { name: string; division?: string; type?: string[]; enabled?: boolean }) => Promise<void>
  editSet: (id: number, patch: { name?: string; division?: string; type?: string[]; enabled?: boolean }) => Promise<void>
  deleteSet: (id: number) => Promise<void>
  copySet: (id: number, name: string, mode: 'copy-rules' | 'share-rules') => Promise<void>
  addRule: (ruleId: number) => Promise<void>
  removeRule: (ruleId: number) => Promise<void>
  updateRuleMeta: (ruleId: number, patch: UpdateRuleMetaRequest) => Promise<void>
}

export const useLegalityStore = create<LegalityStore>((set, get) => ({
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

  /** Load the ruleset list once, then select the first (fullest) ruleset. */
  init: async () => {
    if (get().loaded || get().loadingList) return
    set({ loadingList: true })
    try {
      const sets = await legalityApi.listRulesets()
      set({ sets, loaded: true })
      if (sets.length > 0) {
        const livePilot = sets.find((s) => s.type.split(',').includes('LIVE') && s.division === 'P' && s.enabled)
        await get().selectSet((livePilot ?? sets[0]).id)
      }
    } catch {
      notify.error('Failed to load legality rulesets')
    } finally {
      set({ loadingList: false })
    }
  },

  selectSet: async (id: number) => {
    set({ selectedId: id, selectedCatalogRuleId: null, loadingRules: true })
    // Keep Alert Center / WS join in sync with the toolbar ruleset — publish uses
    // violations:{schema}:{worksetId} and only reaches clients that set_rule_group.
    const { useRuleCheckStore } = await import('./rule-check-store')
    useRuleCheckStore.getState().setRuleGroup(String(id))
    try {
      const data = await legalityApi.getRuleset(id)
      // Guard against an out-of-order response if the user clicked another set meanwhile.
      if (get().selectedId !== id) return
      set({ worksetName: data.workset.name, rules: data.rules })
    } catch {
      notify.error('Failed to load legality ruleset')
    } finally {
      if (get().selectedId === id) set({ loadingRules: false })
    }
  },

  setCatalogRules: (rules) => set({ catalogRules: rules }),

  selectCatalogRule: (id) => set({ selectedCatalogRuleId: id }),

  recordParamSave: (ruleId, result) => {
    set((s) => ({
      rules: s.rules.map((r) => r.id === ruleId ? { ...r, paramJson: result.paramJson } : r),
      catalogRules: s.catalogRules.map((r) => r.id === ruleId ? { ...r, paramJson: result.paramJson } : r),
      lastSave: { seq: (s.lastSave?.seq ?? 0) + 1, result },
    }))
  },

  refreshSets: async () => {
    try { set({ sets: await legalityApi.listRulesets() }) } catch { /* keep last list */ }
  },

  createSet: async (data) => {
    try {
      const s = await legalityApi.createRuleset(data)
      await get().refreshSets()
      // A brand-new empty workset has 0 rules → excluded from GET /rulesets (HAVING count > 0).
      // Inject it so it appears in the sidebar until the user adds rules and a refresh includes it.
      if (!get().sets.find((x) => x.id === s.id)) {
        set((prev) => ({ sets: [...prev.sets, s] }))
      }
      await get().selectSet(s.id)
      notify.success('Rule set created')
      if (data.type?.includes('LIVE') && data.enabled === true) {
        notify.info('LIVE legality alerts are being refreshed in the background. Alerts may be temporarily empty until the refresh completes.')
      }
    } catch (e) { notify.error(e instanceof Error ? e.message : 'Create failed') }
  },

  editSet: async (id, patch) => {
    try {
      const current = get().sets.find((s) => s.id === id)
      await legalityApi.updateRuleset(id, patch)
      await get().refreshSets()
      if (patch.name !== undefined) set({ worksetName: patch.name })
      notify.success('Rule set updated')
      const currentTypes = current?.type?.split(',') ?? []
      const nextTypes = patch.type ?? currentTypes
      const nextEnabled = patch.enabled ?? current?.enabled
      const liveRefresh = nextTypes.includes('LIVE') && nextEnabled === true &&
        (!currentTypes.includes('LIVE') || current?.enabled !== true || patch.type !== undefined || patch.division !== undefined || patch.enabled === true)
      if (liveRefresh) {
        notify.info('LIVE legality alerts are being refreshed in the background. Alerts may be temporarily empty until the refresh completes.')
      }
    } catch (e) { notify.error(e instanceof Error ? e.message : 'Update failed') }
  },

  deleteSet: async (id) => {
    try {
      await legalityApi.deleteRuleset(id)
      await get().refreshSets()
      const first = get().sets[0]
      if (first) await get().selectSet(first.id)
      else set({ selectedId: null, selectedCatalogRuleId: null, worksetName: null, rules: [] })
      notify.success('Rule set deleted')
    } catch (e) { notify.error(e instanceof Error ? e.message : 'Delete failed') }
  },

  copySet: async (id, name, mode) => {
    try {
      const s = await legalityApi.copyRuleset(id, name, mode)
      await get().refreshSets()
      await get().selectSet(s.id)
      notify.success('Rule set copied')
    } catch (e) { notify.error(e instanceof Error ? e.message : 'Copy failed') }
  },

  addRule: async (ruleId) => {
    const id = get().selectedId
    if (id == null) return
    try { await legalityApi.addRuleToSet(id, ruleId); await get().selectSet(id); await get().refreshSets() }
    catch (e) { notify.error(e instanceof Error ? e.message : 'Add failed') }
  },

  removeRule: async (ruleId) => {
    const id = get().selectedId
    if (id == null) return
    try { await legalityApi.removeRuleFromSet(id, ruleId); await get().selectSet(id); await get().refreshSets() }
    catch (e) { notify.error(e instanceof Error ? e.message : 'Remove failed') }
  },

  updateRuleMeta: async (ruleId, patch) => {
    const updated = await legalityApi.patchRuleMeta(ruleId, patch)
    set((s) => ({
      rules: s.rules.map((r) => (r.id === ruleId ? { ...r, ...updated } : r)),
      // Keep catalog tree + instance header in sync (preserve isTemplate).
      catalogRules: s.catalogRules.map((r) =>
        r.id === ruleId ? { ...r, ...updated, isTemplate: r.isTemplate } : r,
      ),
    }))
  },
}))
