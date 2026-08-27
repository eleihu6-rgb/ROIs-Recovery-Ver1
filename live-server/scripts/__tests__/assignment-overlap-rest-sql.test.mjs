/**
 * Shared SQL fragments for rule 1001 assignmentOverlapRosters rest windows AND the
 * 7501/7503/7504 flyDuties duty bounds.
 *
 * end_rest_secs must include post-duty rest (Gantt duty_act_rest_min) on top of the DUTY end
 * (brief→debrief), not the last flight/pairing sch end.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  pairingEndRestSecsSql,
  pairingOverlapStartSecsSql,
  pairingOverlapEndDutySecsSql,
  endRestSecsFromDutyAndRestMin,
  dutyStartUtcExpr,
  dutyEndUtcExpr,
  firstFlightDepartureUtcExpr,
  lastFlightArrivalUtcExpr,
} from '../assignment-overlap-rest-sql.mjs'

test('endRestSecsFromDutyAndRestMin adds rest minutes to duty end', () => {
  const dutyEnd = Math.floor(Date.parse('2026-08-03T08:30:00.000Z') / 1000)
  const restMin = 720
  assert.equal(
    endRestSecsFromDutyAndRestMin(dutyEnd, restMin),
    dutyEnd + 720 * 60,
  )
  assert.equal(endRestSecsFromDutyAndRestMin(dutyEnd, null), dutyEnd)
  assert.equal(endRestSecsFromDutyAndRestMin(dutyEnd, 0), dutyEnd)
})

test('pairingEndRestSecsSql includes roster act_rest_min and segment duty rest', () => {
  const sql = pairingEndRestSecsSql({
    segmentTables: ['pairing_segment'],
    pairingIdExpr: 'rf.pairing_id',
    rosterAlias: 'rf',
  })
  assert.match(sql, /end_rest_secs/)
  assert.match(sql, /act_rest_min/)
  assert.match(sql, /duty_act_rest_min/)
  assert.match(sql, /duty_sch_rest_min/)
  assert.match(sql, /\* 60/)
})

test('pairingEndRestSecsSql anchors rest on the duty end, not the flight/pairing sch end', () => {
  const sql = pairingEndRestSecsSql({
    segmentTables: ['pairing_segment'],
    pairingIdExpr: 'rf.pairing_id',
    rosterAlias: 'rf',
  })
  const base = sql.slice(0, sql.indexOf('+ (coalesce('))
  assert.match(base, /duty_act_end_dt_utc/)
  assert.match(base, /duty_sch_end_dt_utc/)
  assert.match(base, /debrief_end_utc/)
  // The old base (pairing sch end first) must no longer be the preferred source.
  assert.doesNotMatch(base, /^extract\(epoch from coalesce\(max\(p\.sch_end_dt_utc\)/)
  const duty = base.indexOf('duty_act_end_dt_utc')
  const pairingSch = base.indexOf('max(p.sch_end_dt_utc)')
  assert.ok(duty >= 0 && pairingSch > duty, 'duty end must precede the pairing sch end fallback')
})

test('pairingEndRestSecsSql reuses a joined segment alias for the duty end when given one', () => {
  const sql = pairingEndRestSecsSql({
    segmentTables: ['pairing_segment'],
    pairingIdExpr: 'rf.pairing_id',
    rosterAlias: 'rf',
    segmentAlias: 'ps',
  })
  const base = sql.slice(0, sql.indexOf('+ (coalesce('))
  assert.match(base, /coalesce\(max\(coalesce\(ps\.duty_act_end_dt_utc, ps\.duty_sch_end_dt_utc, ps\.debrief_end_utc\)\),/)
  assert.doesNotMatch(base, /max\(p\.sch_end_dt_utc\)/)
})

test('pairingEndRestSecsSql keeps live fallback when a joined scenario segment alias is empty', () => {
  const sql = pairingEndRestSecsSql({
    segmentTables: ['scenario.pairing_segment', 'f8.pairing_segment'],
    pairingIdExpr: 'rf.pairing_id',
    rosterAlias: 'rf',
    segmentAlias: 'ps',
    scenarioIdParam: '$1',
  })
  const base = sql.slice(0, sql.indexOf('+ (coalesce('))
  assert.match(base, /coalesce\(max\(coalesce\(ps\.duty_act_end_dt_utc, ps\.duty_sch_end_dt_utc, ps\.debrief_end_utc\)\),/)
  assert.match(base, /from f8\.pairing_segment ps/)
  assert.match(base, /coalesce\(.*rf\.sch_end_dt_utc/s)
})

test('first/last flight SQL expressions use scheduled flight bounds with roster fallback', () => {
  const first = firstFlightDepartureUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
  const last = lastFlightArrivalUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })

  assert.match(first, /ps\.sch_str_dt_utc/)
  assert.match(first, /rf\.sch_str_dt_utc/)
  assert.match(last, /ps\.sch_end_dt_utc/)
  assert.match(last, /rf\.sch_end_dt_utc/)
})

test('pairingEndRestSecsSql falls back across scenario then live segment tables', () => {
  const sql = pairingEndRestSecsSql({
    segmentTables: ['scenario.pairing_segment', 'f8.pairing_segment'],
    pairingIdExpr: 'rf.pairing_id',
    rosterAlias: 'rf',
    scenarioIdParam: '$1',
  })
  assert.match(sql, /scenario\.pairing_segment/)
  assert.match(sql, /f8\.pairing_segment/)
})

test('dutyStartUtcExpr prefers act → sch → brief → roster sch', () => {
  const expr = dutyStartUtcExpr({})
  assert.match(expr, /ps\.duty_act_str_dt_utc/)
  assert.match(expr, /ps\.duty_sch_str_dt_utc/)
  assert.match(expr, /ps\.brief_start_utc/)
  assert.match(expr, /rf\.sch_str_dt_utc/)
  const act = expr.indexOf('duty_act_str_dt_utc')
  const sch = expr.indexOf('duty_sch_str_dt_utc')
  const brief = expr.indexOf('brief_start_utc')
  const flight = expr.indexOf('rf.sch_str_dt_utc')
  assert.ok(act < sch && sch < brief && brief < flight)
})

test('dutyStartUtcExpr drops the roster fallback when rosterAlias is null', () => {
  const expr = dutyStartUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })
  assert.equal(expr, 'coalesce(ps.duty_act_str_dt_utc, ps.duty_sch_str_dt_utc, ps.brief_start_utc)')
})

test('dutyEndUtcExpr prefers act → sch → debrief → roster sch', () => {
  const expr = dutyEndUtcExpr({})
  assert.match(expr, /ps\.duty_act_end_dt_utc/)
  assert.match(expr, /ps\.duty_sch_end_dt_utc/)
  assert.match(expr, /ps\.debrief_end_utc/)
  assert.match(expr, /rf\.sch_end_dt_utc/)
  const act = expr.indexOf('duty_act_end_dt_utc')
  const sch = expr.indexOf('duty_sch_end_dt_utc')
  const debrief = expr.indexOf('debrief_end_utc')
  const flight = expr.indexOf('rf.sch_end_dt_utc')
  assert.ok(act < sch && sch < debrief && debrief < flight)
})

test('dutyEndUtcExpr drops the roster fallback when rosterAlias is null', () => {
  const expr = dutyEndUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })
  assert.equal(expr, 'coalesce(ps.duty_act_end_dt_utc, ps.duty_sch_end_dt_utc, ps.debrief_end_utc)')
})

test('duty bound helpers honor custom aliases', () => {
  const start = dutyStartUtcExpr({ rosterAlias: 'r', segmentAlias: 'seg' })
  const end = dutyEndUtcExpr({ rosterAlias: 'r', segmentAlias: 'seg' })
  assert.match(start, /seg\.duty_act_str_dt_utc/)
  assert.match(start, /r\.sch_str_dt_utc/)
  assert.match(end, /seg\.duty_act_end_dt_utc/)
  assert.match(end, /r\.sch_end_dt_utc/)
})

test('pairingOverlapStartSecsSql uses duty report/brief, not first-flight STD', () => {
  const sql = pairingOverlapStartSecsSql({ rosterAlias: 'rf', segmentAlias: 'ps' })
  assert.match(sql, /as start_secs/)
  assert.match(sql, /duty_act_str_dt_utc/)
  assert.match(sql, /brief_start_utc/)
  assert.doesNotMatch(sql, /extract\(epoch from min\(rf\.sch_str_dt_utc\)\)/)
})

test('pairingOverlapEndDutySecsSql uses duty release/debrief, not last-flight STA', () => {
  const sql = pairingOverlapEndDutySecsSql({ rosterAlias: 'rf', segmentAlias: 'ps' })
  assert.match(sql, /as end_duty_secs/)
  assert.match(sql, /duty_act_end_dt_utc/)
  assert.match(sql, /debrief_end_utc/)
  assert.doesNotMatch(sql, /extract\(epoch from max\(rf\.sch_end_dt_utc\)\)/)
})

test('scenario 718 shape: duty report overlaps DO; first-flight STD does not', () => {
  const doEnd = Date.parse('2026-08-05T05:59:59.000Z') / 1000
  const dutyReport = Date.parse('2026-08-05T05:50:00.000Z') / 1000
  const firstFlight = Date.parse('2026-08-05T06:50:00.000Z') / 1000
  assert.ok(dutyReport < doEnd, 'report 23:50 local overlaps DO ending 23:59')
  assert.ok(firstFlight > doEnd, 'STD 00:50 next local day does not overlap DO')
})
