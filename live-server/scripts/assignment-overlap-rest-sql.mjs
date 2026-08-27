/**
 * Shared SQL helpers for two consumers of pairing duty timing:
 * - rule 1001 pairing post-duty rest windows (assignmentOverlapRosters, flyByPairing)
 * - rules 7501/7503/7504 FLY duty bounds (flyDuties in the Live / Scenario legality loaders)
 *
 * Rest minutes: Gantt paints REST from pairing_segment.duty_act_rest_min (fallback
 * duty_sch_rest_min). assignmentOverlapRosters must use the same minutes so Rest Before=N
 * (rest window) prohibitions match what planners see. See
 * docs/superpowers/specs/2026-07-20-rule-1001-pairing-rest-window-design.md and
 * 2026-07-23-rule-1001-prohibition-window-design.md.
 *
 * Duty bounds: flyDuties and 1001 assignmentOverlapRosters use CARS / PBS PairingDuty
 * report/release (brief→debrief), not first-flight STD / last-flight STA. Rest is anchored
 * on that SAME duty end, so `end_rest_secs` stays `end_duty_secs` + rest — the SQL twin of
 * endRestSecsFromDutyAndRestMin. See docs/superpowers/plans/2026-08-02-flyduties-duty-bounds.md
 * and docs/superpowers/specs/2026-08-18-rule-1001-duty-report-release-bounds-design.md.
 */

/** Pairing-row start_secs: min duty report / brief (not first-flight STD). */
export function pairingOverlapStartSecsSql(opts = {}) {
  return `extract(epoch from min(${dutyStartUtcExpr(opts)}))::bigint as start_secs`
}

/** Pairing-row end_duty_secs: max duty release / debrief (not last-flight STA). */
export function pairingOverlapEndDutySecsSql(opts = {}) {
  return `extract(epoch from max(${dutyEndUtcExpr(opts)}))::bigint as end_duty_secs`
}

/** Pure: duty-end epoch seconds + rest minutes → rest-end epoch seconds. */
export function endRestSecsFromDutyAndRestMin(endDutySecs, restMin) {
  const duty = Number(endDutySecs) || 0
  const rest = Math.max(0, Number(restMin) || 0)
  return duty + rest * 60
}

/**
 * SQL expression aliased as end_rest_secs for a pairing_rows CTE.
 *
 * @param {{
 *   segmentTables: string[],
 *   pairingIdExpr: string,
 *   rosterAlias?: string,
 *   segmentAlias?: string,
 *   scenarioIdParam?: string,
 * }} opts
 * - segmentTables: tried in order (e.g. scenario then live for RO empty scenario segments)
 * - segmentAlias: set when the caller already joins pairing_segment scoped to the grouped
 *   duty (flyDuties); the duty end is then aggregated off that join instead of a
 *   correlated pairing-wide lookup
 * - scenarioIdParam: when set, each `schema.pairing_segment` that starts with `scenario.`
 *   also filters `ps.scenario_id = <param>`
 */
export function pairingEndRestSecsSql(opts) {
  const rosterAlias = opts.rosterAlias ?? 'rf'
  const pairingIdExpr = opts.pairingIdExpr
  const scenarioIdParam = opts.scenarioIdParam
  const segmentTables = opts.segmentTables ?? []
  const scenarioFilterFor = (table) =>
    table.includes('scenario.') && scenarioIdParam ? ` and ps.scenario_id = ${scenarioIdParam}` : ''

  const rosterRest = `(array_agg(${rosterAlias}.act_rest_min order by ${rosterAlias}.sch_end_dt_utc desc nulls last))[1]`

  const segmentLookups = segmentTables.map((table) =>
    // Prefer act rest (Gantt), then sch rest — coalesce(null, sch) still picks sch when act is null.
    `(select coalesce(ps.duty_act_rest_min, ps.duty_sch_rest_min, 0)
               from ${table} ps
              where ps.pairing_id = ${pairingIdExpr}
                and coalesce(ps.is_deleted, 0) = 0${scenarioFilterFor(table)}
              order by ps.sch_end_dt_utc desc nulls last, ps.duty_seq desc, ps.seg_seq desc
              limit 1)`)

  const restMin = ['coalesce(', [rosterRest, ...segmentLookups, '0'].join(',\n                  '), ')'].join('')

  // Rest runs from DUTY end (debrief), not the last flight/pairing sch end, so end_rest_secs
  // stays duty end + rest — the SQL twin of endRestSecsFromDutyAndRestMin.
  const dutyEndLookups = segmentTables.map((table) =>
    `(select max(${dutyEndUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })})
               from ${table} ps
              where ps.pairing_id = ${pairingIdExpr}
                and coalesce(ps.is_deleted, 0) = 0${scenarioFilterFor(table)})`)

  const joinedDutyEnd = opts.segmentAlias
    ? `max(${dutyEndUtcExpr({ rosterAlias: null, segmentAlias: opts.segmentAlias })})`
    : null
  const dutyEnd = opts.segmentAlias
    ? ['coalesce(', [joinedDutyEnd, ...dutyEndLookups, `max(${rosterAlias}.sch_end_dt_utc)`]
      .join(',\n                  '), ')'].join('')
    : ['coalesce(', [...dutyEndLookups, 'max(p.sch_end_dt_utc)', `max(${rosterAlias}.sch_end_dt_utc)`]
      .join(',\n                  '), ')'].join('')

  return `extract(epoch from ${dutyEnd})::bigint
                  + (${restMin}) * 60 as end_rest_secs`
}

/**
 * SQL timestamp expression: FLY duty start (CARS / PBS PairingDuty aligned).
 * Prefer act duty → sch duty → brief → roster flight sch.
 */
export function dutyStartUtcExpr(opts = {}) {
  const rf = opts.rosterAlias === null ? null : (opts.rosterAlias ?? 'rf')
  const ps = opts.segmentAlias ?? 'ps'
  const parts = [`${ps}.duty_act_str_dt_utc`, `${ps}.duty_sch_str_dt_utc`, `${ps}.brief_start_utc`]
  if (rf) parts.push(`${rf}.sch_str_dt_utc`)
  return `coalesce(${parts.join(', ')})`
}

/**
 * SQL timestamp expression: FLY duty end (CARS / PBS PairingDuty aligned).
 * Prefer act duty → sch duty → debrief end → roster flight sch.
 *
 * `rosterAlias: null` drops the roster fallback, for segment-only subqueries where no
 * roster row is in scope (see the duty-end lookups in pairingEndRestSecsSql).
 */
export function dutyEndUtcExpr(opts = {}) {
  const ps = opts.segmentAlias ?? 'ps'
  const rf = opts.rosterAlias === null ? null : (opts.rosterAlias ?? 'rf')
  const parts = [`${ps}.duty_act_end_dt_utc`, `${ps}.duty_sch_end_dt_utc`, `${ps}.debrief_end_utc`]
  if (rf) parts.push(`${rf}.sch_end_dt_utc`)
  return `coalesce(${parts.join(', ')})`
}

/** SQL timestamp expression: first scheduled flight departure inside a duty. */
export function firstFlightDepartureUtcExpr(opts = {}) {
  const ps = opts.segmentAlias ?? 'ps'
  const rf = opts.rosterAlias === null ? null : (opts.rosterAlias ?? 'rf')
  const parts = [`${ps}.sch_str_dt_utc`]
  if (rf) parts.push(`${rf}.sch_str_dt_utc`)
  return `coalesce(${parts.join(', ')})`
}

/** SQL timestamp expression: last scheduled flight arrival inside a duty. */
export function lastFlightArrivalUtcExpr(opts = {}) {
  const ps = opts.segmentAlias ?? 'ps'
  const rf = opts.rosterAlias === null ? null : (opts.rosterAlias ?? 'rf')
  const parts = [`${ps}.sch_end_dt_utc`]
  if (rf) parts.push(`${rf}.sch_end_dt_utc`)
  return `coalesce(${parts.join(', ')})`
}
