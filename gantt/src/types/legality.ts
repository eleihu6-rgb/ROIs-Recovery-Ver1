/**
 * Legality tab types — the LEGACY rule model (rule / rule_set / workset) served by
 * GET /api/legality/ruleset/:worksetId. Each rule's params are the faithful CSV-mirror
 * JSON stored in rule.param_json, preserving the applicability columns
 * (Bases/Ranks/Fleets/Crew Teams) the new rule_instance model dropped.
 */

/** One parameter table = header row + data rows, all strings, faithful to the legacy CSV. */
export interface LegalityParamTable {
  header: string[]
  rows: string[][]
}

/** Faithful param mirror — one element per legacy sub-table (most rules have 1; Acc State has 2). */
export interface LegalityParamJson {
  tables: LegalityParamTable[]
}

export interface LegalityRule {
  id: number
  /** Legacy function code, e.g. 8002 */
  function: number
  /** Legacy instance code, e.g. '006' */
  instance: string | null
  reference: string | null
  category: string | null
  description: string | null
  detail: string | null
  /** Numeric 1=Soft / 2=Overridable / 3=Hard */
  severity: number
  overridability: string | null
  division: string | null
  owner: string | null
  locked: string | null
  updatedBy?: string | null
  /** null when the legacy rule has no params (e.g. 7272/7505/7506 — values come from C++). */
  paramJson: LegalityParamJson | null
}

export interface LegalityRuleset {
  workset: { id: number; name: string; category: string | null }
  rules: LegalityRule[]
}

/**
 * One row of the global rule catalog (GET /api/legality/rules). isTemplate = the
 * canonical instance '001' (read-only for non-admins; admins can still edit).
 */
export interface LegalityCatalogRule extends LegalityRule {
  isTemplate: boolean
}

/** One entry in the ruleset picker (left list) — a legacy workset that maps ≥1 rule. */
export interface LegalityRulesetSummary {
  id: number
  name: string
  category: string | null
  /** Comma-separated claimed types, e.g. 'LIVE,PBS,RO' (formerly a single LIVE/RO/PBS code). */
  type: string
  division: string
  enabled: boolean
  updatedBy?: string | null
  ruleCount: number
  /** True for the workset matching the gantt's default GANTT rule_group (pbs_solver_ruleset → 103). */
  isDefault: boolean
}

export interface UpdateRuleParamsRequest {
  paramJson: LegalityParamJson
}

export interface UpdateRuleMetaRequest {
  reference?: string | null
  category?: string | null
  division?: string | null
  severity?: 1 | 2 | 3
  description?: string | null
}

export interface LegalityRecheckStatus {
  status: 'idle' | 'computing' | 'done' | 'failed'
  lastCheckedAt: string | null
  error: string | null
}

export interface UpdateRuleParamsResult {
  paramJson: LegalityParamJson
  affectsLiveDefault: boolean
  scenarioCount: number
  /** Engine rule codes to recompute for this change (changed rule + dependents); null = whole group. */
  recheckRuleCodes: string[] | null
}
