import { api } from './api'
import type {
  LegalityRuleset,
  LegalityRulesetSummary,
  LegalityRule,
  LegalityParamJson,
  LegalityRecheckStatus,
  UpdateRuleParamsResult,
  UpdateRuleMetaRequest,
  LegalityCatalogRule,
} from '@/types/legality'

export interface RuleSetTypeOption { code: string; name: string; value: string }

export const legalityApi = {
  /** List the legacy rulesets (worksets) that map ≥1 rule — currently 433 + 103. */
  listRulesets: (): Promise<LegalityRulesetSummary[]> =>
    api.get('/api/legality/rulesets') as Promise<LegalityRulesetSummary[]>,
  listRulesetTypes: (): Promise<RuleSetTypeOption[]> =>
    api.get('/api/legality/ruleset-types') as Promise<RuleSetTypeOption[]>,

  /** Load a legacy ruleset (workset) with its rules + faithful param JSON. */
  getRuleset: (worksetId: number): Promise<LegalityRuleset> =>
    api.get(`/api/legality/ruleset/${worksetId}`) as Promise<LegalityRuleset>,

  /** Update rule.param_json (admin only). */
  updateRuleParams: (ruleId: number, paramJson: LegalityParamJson): Promise<UpdateRuleParamsResult> =>
    api.patch(`/api/legality/rule/${ruleId}/params`, { paramJson }) as Promise<UpdateRuleParamsResult>,

  /**
   * Trigger a live recheck of the default ruleset for a date range (admin only).
   * @param ruleCodes optional subset to recompute (changed rule + dependents). Omit/null →
   *   whole group. Scoping makes a single-rule change recompute in seconds, not minutes.
   */
  triggerRecheck: (groupCode: string, from: string, to: string, ruleCodes?: string[] | null): Promise<{ status: string }> =>
    api.post('/api/legality/recheck', { groupCode, from, to, ruleCodes: ruleCodes ?? undefined }) as Promise<{ status: string }>,

  /** Poll the live recheck status + last-checked timestamp. */
  getRecheckStatus: (groupCode: string): Promise<LegalityRecheckStatus> =>
    api.get(`/api/legality/recheck-status?groupCode=${encodeURIComponent(groupCode)}`) as Promise<LegalityRecheckStatus>,

  /** Full rule catalog — templates (instance '001') + copies. */
  listRules: (): Promise<LegalityCatalogRule[]> =>
    api.get('/api/legality/rules') as Promise<LegalityCatalogRule[]>,

  /** Copy a rule (template or copy) into a new editable instance (admin only). */
  copyRule: (ruleId: number): Promise<LegalityCatalogRule> =>
    api.post(`/api/legality/rules/${ruleId}/copy`, {}) as Promise<LegalityCatalogRule>,

  /** Delete a copy (admin only; rejects templates + in-use rules). */
  deleteRule: (ruleId: number): Promise<{ id: number }> =>
    api.delete(`/api/legality/rules/${ruleId}`) as Promise<{ id: number }>,

  /** Update rule metadata (reference, category, division, severity, description). Admin only. */
  patchRuleMeta: (ruleId: number, patch: UpdateRuleMetaRequest): Promise<LegalityRule> =>
    api.patch(`/api/legality/rule/${ruleId}/meta`, patch) as Promise<LegalityRule>,

  // ── Rule Set (workset) management (admin only) ───────────────────────────
  /** type is a multi-select array (LIVE/PBS/RO), min 1; stored as a canonical comma string. */
  createRuleset: (data: { name: string; division?: string; type?: string[]; enabled?: boolean }): Promise<LegalityRulesetSummary> =>
    api.post('/api/legality/rulesets', data) as Promise<LegalityRulesetSummary>,

  updateRuleset: (worksetId: number, patch: { name?: string; division?: string; type?: string[]; enabled?: boolean }): Promise<{ id: number; name: string; type: string; division: string; enabled: boolean }> =>
    api.patch(`/api/legality/ruleset/${worksetId}`, patch) as Promise<{ id: number; name: string; type: string; division: string; enabled: boolean }>,

  deleteRuleset: (worksetId: number): Promise<{ id: number }> =>
    api.delete(`/api/legality/ruleset/${worksetId}`) as Promise<{ id: number }>,

  copyRuleset: (worksetId: number, name: string, mode: 'copy-rules' | 'share-rules'): Promise<LegalityRulesetSummary> =>
    api.post(`/api/legality/ruleset/${worksetId}/copy`, { name, mode }) as Promise<LegalityRulesetSummary>,

  addRuleToSet: (worksetId: number, ruleId: number): Promise<void> =>
    api.post(`/api/legality/ruleset/${worksetId}/rules/${ruleId}`, {}) as Promise<void>,

  removeRuleFromSet: (worksetId: number, ruleId: number): Promise<void> =>
    api.delete(`/api/legality/ruleset/${worksetId}/rules/${ruleId}`) as Promise<void>,
}
