/**
 * Shared RULE-workset param resolution for live check-/persist- harnesses.
 *
 * Authority = `rule_set` membership of a RULE `workset` (same preference as
 * live-legality / legality-preview: prefer workset id 103). Never hardcode
 * `rule.instance` — F8 currently ships mostly `001` instances; older harness
 * comments still mention 002/003/004/006.
 *
 * Usage:
 *   const rulesetId = await resolveDefaultRulesetId(client)
 *   const rule = await loadRulesetRule(client, 7501)           // first instance
 *   const all = await loadRulesetRules(client, 8002)           // every instance
 *   const night = await loadRulesetRule(client, 2014, { rulesetId })
 */

/** Prefer workset 103, else lowest RULE workset id. */
export async function resolveDefaultRulesetId(client) {
  const r = await client.query(
    `select id from workset
      where category = 'RULE'
      order by case when id = 103 then 0 else 1 end, id
      limit 1`,
  )
  const id = r.rows[0]?.id
  if (id == null) throw new Error('No RULE workset found for legality param resolution')
  return Number(id)
}

/**
 * Every (instance, header, rows) for `function` in the RULE workset.
 * @param {import('pg').Client | { query: Function }} client
 * @param {number} functionNumber e.g. 7501
 * @param {{ rulesetId?: number }} [opts]
 * @returns {Promise<Array<{ instance: string, header: string[], rows: unknown[][], severity: number | null }>>}
 */
export async function loadRulesetRules(client, functionNumber, opts = {}) {
  const fn = Number(functionNumber)
  if (!Number.isFinite(fn)) throw new Error(`Invalid rule function ${functionNumber}`)
  const rulesetId = opts.rulesetId != null && Number.isFinite(Number(opts.rulesetId))
    ? Number(opts.rulesetId)
    : await resolveDefaultRulesetId(client)

  const { rows } = await client.query(
    `select coalesce(r.instance, '') as instance,
            r.severity,
            r.param_json#>'{tables,0,header}' as header,
            r.param_json#>'{tables,0,rows}' as rows
       from rule_set rs
       join rule r on r.rule_id = rs.rule_id
      where rs.workset_id = $1 and r.function = $2
      order by r.instance`,
    [rulesetId, fn],
  )
  return rows.map((r) => ({
    rulesetId,
    instance: String(r.instance ?? ''),
    severity: r.severity == null ? null : Number(r.severity),
    header: Array.isArray(r.header) ? r.header : [],
    rows: Array.isArray(r.rows) ? r.rows : [],
  }))
}

/**
 * First instance of `function` in the RULE workset (throws if none / empty table).
 * @param {import('pg').Client | { query: Function }} client
 * @param {number} functionNumber
 * @param {{ rulesetId?: number, allowEmptyRows?: boolean }} [opts]
 */
export async function loadRulesetRule(client, functionNumber, opts = {}) {
  const rules = await loadRulesetRules(client, functionNumber, opts)
  if (!rules.length) {
    const rulesetId = opts.rulesetId ?? '(default RULE workset)'
    throw new Error(`No rule function=${functionNumber} in RULE workset ${rulesetId} (rule_set)`)
  }
  const rule = rules[0]
  if (!opts.allowEmptyRows && (!rule.header.length || !rule.rows.length)) {
    throw new Error(
      `Rule ${functionNumber}/${rule.instance} in workset ${rule.rulesetId} has empty param_json tables[0]`,
    )
  }
  return rule
}

/** Case-insensitive header → index helper (same contract as legality-recheck-core). */
export const headerIndexer = (header) => (name) =>
  (header ?? []).findIndex((h) => String(h).toUpperCase() === String(name).toUpperCase())

/** Read a named cell from a param row; empty → fallback. */
export function fieldRaw(row, header, name, fallback = '') {
  const H = headerIndexer(header)
  const i = H(name)
  if (i < 0) return fallback
  const v = String(row?.[i] ?? '').trim()
  return v || fallback
}

/** Rule 2015 Start Time HH:MM cell (legacy header "DO Start Time" still accepted). */
export function rule2015StartTimeRaw(rule) {
  if (!rule?.rows?.[0]) return null
  const row = rule.rows[0]
  const H = headerIndexer(rule.header)
  for (const name of ['Start Time', 'DO Start Time']) {
    const i = H(name)
    if (i >= 0) return row[i]
  }
  return row[0]
}
