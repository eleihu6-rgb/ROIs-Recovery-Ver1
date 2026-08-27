// Unit tests for the dynamic rule-set resolver helpers in legality-recheck-core.mjs.
// Pure functions only (no DB / no Rust binaries here); the real-DB proof + Playwright
// cover the end-to-end recheck (§No-Illusion).
import test from 'node:test'
import assert from 'node:assert/strict'
import { epochSec, headerIndexer, scopeKeyOf, withParamRowPrefix, resolveDaysOffRpBounds, pickDaysOffAnchor, daysOffAnchorPairingId, rule8002, rule8004, rule8056, rule8071, rule8072, rule8030, rule7505, rule7507, rule7506, rule7501, rule7508, rule7503, rule7504 } from '../legality-recheck-core.mjs'


test('withParamRowPrefix prefixes 1-based Row N and is idempotent', () => {
  assert.equal(withParamRowPrefix(0, 'Crew base YYZ is invalid.'), 'Row 1: Crew base YYZ is invalid.')
  assert.equal(withParamRowPrefix(2, 'Cumulative BH exceeds limit.'), 'Row 3: Cumulative BH exceeds limit.')
  assert.equal(
    withParamRowPrefix(1, 'Row 2: already prefixed'),
    'Row 2: already prefixed',
  )
})

test('headerIndexer is case-insensitive and returns -1 for missing columns', () => {
  const H = headerIndexer(['Bases', 'Period', 'Max Limits', 'Type'])
  assert.equal(H('period'), 1)
  assert.equal(H('MAX LIMITS'), 2)
  assert.equal(H('Type'), 3)
  assert.equal(H('nope'), -1)
})

test('headerIndexer tolerates a null/empty header', () => {
  const H = headerIndexer(null)
  assert.equal(H('anything'), -1)
})

test('scopeKeyOf builds a Period+Unit window signature', () => {
  const H = headerIndexer(['Period', 'Unit'])
  assert.equal(scopeKeyOf(['28', 'CD'], H), '28CD')
  assert.equal(scopeKeyOf(['365', 'CD'], H), '365CD')
})

test('scopeKeyOf returns empty when Period/Unit are absent', () => {
  const H = headerIndexer(['Foo', 'Bar'])
  assert.equal(scopeKeyOf(['x', 'y'], H), '')
})

test('withParamRowPrefix prefixes 1-based Row N and is idempotent', () => {
  assert.equal(withParamRowPrefix(0, 'Crew base YYZ is invalid.'), 'Row 1: Crew base YYZ is invalid.')
  assert.equal(withParamRowPrefix(2, 'Cumulative BH exceeds limit.'), 'Row 3: Cumulative BH exceeds limit.')
  assert.equal(
    withParamRowPrefix(1, 'Row 2: already prefixed'),
    'Row 2: already prefixed',
  )
})


test('resolveDaysOffRpBounds prefers rpFrom/rpTo over padded dateFrom/dateTo', () => {
  assert.deepEqual(
    resolveDaysOffRpBounds({
      dateFrom: '2025-01-01',
      dateTo: '2027-01-01',
      rpFrom: '2026-07-01',
      rpTo: '2026-07-31',
    }),
    { rpFrom: '2026-07-01', rpTo: '2026-07-31' },
  )
  assert.deepEqual(
    resolveDaysOffRpBounds({ dateFrom: '2026-06-01', dateTo: '2026-06-30' }),
    { rpFrom: '2026-06-01', rpTo: '2026-06-30' },
  )
})

// rule8002 end-to-end (uses the real check-8002-full binary built at
// rule-engine-rs/target/release). Proves: instances+rows resolved from the rule
// set, output tagged with the resolved instance + scope_key, start_dt anchored
// to the pairing span (not the window start), the historical BH+CD message
// template preserved, and DP now COMPUTED (blockByDay-synthesized metrics carry
// dp=0 → the DP row runs but does not fire).
const HDR8002 = ['Bases', 'Ranks', 'Fleets', 'Crew Teams', 'Period', 'Unit', 'Prorated', 'Max Limits', 'Min Limits', 'Type']
const HDR7503 = ['WOCL Start', 'WOCL End']
const HDR7503_FULL = ['Bases', 'Ranks', 'Fleets', 'Crew Teams', 'WOCL Start', 'WOCL End', 'Max Consecutive WOCLs']
const HDR7504 = [
  'Prev Assignment Group', 'Next Assignment Group', 'Prev Assignment', 'Next Assignment',
  'Prev Attributes', 'Next Attributes', 'Apply Prelabelled Attributes', 'Utilize Post Rest',
  'Bases', 'Ranks', 'Fleets', 'Crew Teams', 'Level', 'Min Period', 'Unit',
]
const HDR7505 = [
  'Bases', 'Ranks', 'Fleets', 'Crew Teams', 'DO Assignment Group', 'Min DO',
  'Period', 'Unit', 'RP Days Range', 'Utilize Post Duty Rest',
  'Count Blank Day', 'Count Layover', 'Leave Assignments', 'Leave Days Range',
]
const HDR7507 = [
  'Bases', 'Ranks', 'Fleets', 'Crew Teams', 'DO Assignment Group', 'Min DO',
  'Period', 'Unit', 'RP Days Range', 'Utilize Post Duty Rest',
  'Count Blank Day', 'Count Layover', 'NUM FLY DAY', 'FLY ASSIGNMENTS',
  'NUM RESERVES', 'RES ASSIGNMENTS', 'Leave Assignments', 'Leave Days Range',
]
const HDR8071 = [
  'Bases', 'Ranks', 'Fleets', 'Crew Teams', 'Labels', 'Attributes', 'Override Duty Attributes',
  'Assignment Groups', 'Qualifiers', 'Flights', 'Destinations', 'Positions',
  'Period', 'Unit', 'Max Times', 'Min Times', 'Check Mode',
]
const HDR8072 = [
  'Flight Fleets', 'Flight Assignment Groups', 'Crew Teams', 'Crew Nationality',
  'Destination Countries', 'Acting Ranks', 'Flight Compositions', 'Required Qualifications',
  'Attributes', 'Dep', 'Arr', 'Min Limits', 'Max Limits',
]
const CTX_DATES = { dateFrom: '2026-06-01', dateTo: '2026-06-30' }
const epoch = (iso) => Math.floor(new Date(iso).getTime() / 1000)

test('rule7504 builds structured row fields for assignment and attribute filters', async () => {
  let captured
  let crewTeamsCalls = 0
  const source = {
    async crewOffsets() { return new Map([['C1', -360]]) },
    async crewBaseTimezone() { return new Map([['C1', 'America/Edmonton']]) },
    async crewTeams() {
      crewTeamsCalls += 1
      return new Map()
    },
    async flyDuties() {
      return [
        {
          crew_id: 'C1',
          pairing_id: 101,
          offset_min: -60,
          start_secs: 1_780_294_800,
          end_secs: 1_780_312_800,
          end_including_rest_secs: 1_780_316_400,
          day_ord: 20605,
          assignment_group: 'FLY',
          assignment: 'FLY',
          attributes: 'WOCL',
        },
        {
          crew_id: 'C1',
          pairing_id: 202,
          offset_min: 0,
          start_secs: 1_780_381_200,
          end_secs: 1_780_399_200,
          end_including_rest_secs: 1_780_402_800,
          day_ord: 20606,
          assignment_group: 'FLY',
          assignment: 'FLY',
          attributes: 'WOCL',
        },
      ]
    },
  }
  const ctx = {
    log: () => {},
    instancesOf: (fn) => {
      if (fn === 7503) return [{ instance: '001', header: HDR7503, rows: [['02:00', '05:59']] }]
      if (fn === 7504) return [{
        instance: '001',
        header: HDR7504,
        rows: [['FLY', 'FLY', 'FLY', 'FLY', 'WOCL', 'WOCL', 'Y', 'Y', '*', '*', '*', '*', 'D', '55', 'RH']],
      }]
      return []
    },
    runBin(bin, args, tsv) {
      captured = { bin, args, tsv }
      return []
    },
  }

  await rule7504(source, ctx)

  assert.equal(captured?.bin, 'check-7504')
  assert.equal(crewTeamsCalls, 0)
  assert.match(captured.tsv, /^R\tFLY\tFLY\tFLY\tFLY\tWOCL\tWOCL\tY\tY\t\*\t\*\t\*\t\*\tD\t55\tRH\t120\t359/m)
  assert.match(captured.tsv, /^D\tC1\t101\t1780294800\t1780312800\t1780316400\t20605\t-60\tFLY\tFLY\tWOCL\tN/m)
})

test('rule7504 warns and skips non-wildcard crew-team rows when source lacks crew team data', async () => {
  let ran = false
  const logs = []
  const source = {
    async crewOffsets() { return new Map([['C1', -360]]) },
    async crewBaseTimezone() { return new Map() },
    async flyDuties() {
      return [{
        crew_id: 'C1',
        pairing_id: 101,
        start_secs: 1_780_294_800,
        end_secs: 1_780_312_800,
        assignment_group: 'FLY',
        assignment: 'FLY',
        attributes: 'WOCL',
      }]
    },
  }
  const ctx = {
    log: (m) => logs.push(m),
    instancesOf: (fn) => {
      if (fn === 7503) return [{ instance: '001', header: HDR7503, rows: [['02:00', '05:59']] }]
      if (fn === 7504) return [{
        instance: '001',
        header: HDR7504,
        rows: [['FLY', 'FLY', 'FLY', 'FLY', 'WOCL', 'WOCL', 'Y', 'N', '*', '*', '*', 'TEAM-A', 'D', '55', 'RH']],
      }]
      return []
    },
    runBin() {
      ran = true
      return []
    },
  }

  const out = await rule7504(source, ctx)

  assert.deepEqual(out, [])
  assert.equal(ran, false)
  assert.ok(logs.some((m) => /skip 7504\/001.*Crew Teams=TEAM-A.*crew-team data/i.test(m)), logs.join('\n'))
})

test('rule7504 warns on missing qualification source and emits Q rows when available', async () => {
  const baseSource = {
    async crewOffsets() { return new Map([['C1', -360]]) },
    async crewBaseTimezone() { return new Map([['C1', 'America/Edmonton']]) },
    async flyDuties() {
      return [
        {
          crew_id: 'C1',
          pairing_id: 101,
          start_secs: 1_780_294_800,
          end_secs: 1_780_312_800,
          end_including_rest_secs: 1_780_316_400,
          day_ord: 20605,
          assignment_group: 'FLY',
          assignment: 'FLY',
          attributes: 'WOCL',
        },
        {
          crew_id: 'C1',
          pairing_id: 202,
          start_secs: 1_780_381_200,
          end_secs: 1_780_399_200,
          end_including_rest_secs: 1_780_402_800,
          day_ord: 20606,
          assignment_group: 'FLY',
          assignment: 'FLY',
          attributes: 'WOCL',
        },
      ]
    },
  }
  const ctxBase = (log, runBin) => ({
    log,
    instancesOf: (fn) => {
      if (fn === 7503) return [{ instance: '001', header: HDR7503, rows: [['02:00', '05:59']] }]
      if (fn === 7504) return [{
        instance: '001',
        header: HDR7504,
        rows: [['FLY', 'FLY', 'FLY', 'FLY', 'WOCL', 'WOCL', 'Y', 'N', 'YVR', 'CA', '737', '*', 'D', '55', 'RH']],
      }]
      return []
    },
    runBin,
  })

  const logs = []
  let ran = false
  const skipped = await rule7504(baseSource, ctxBase((m) => logs.push(m), () => { ran = true; return [] }))
  assert.deepEqual(skipped, [])
  assert.equal(ran, false)
  assert.ok(logs.some((m) => /skip 7504\/001.*qualification filters.*no crew qualification data/i.test(m)), logs.join('\n'))

  let captured
  await rule7504({
    ...baseSource,
    async crewQualEntries() {
      return [
        { crew_id: 'C1', dim: 'B', value: 'YVR', eff: '2026-01-01', exp: '2026-12-31' },
        { crew_id: 'C1', dim: 'R', value: 'CA', eff: '2026-01-01', exp: '2026-12-31' },
        { crew_id: 'C1', dim: 'F', value: '737', eff: '2026-01-01', exp: '2026-12-31' },
      ]
    },
  }, ctxBase(() => {}, (bin, args, tsv) => {
    captured = { bin, args, tsv }
    return []
  }))
  assert.equal(captured?.bin, 'check-7504')
  assert.match(captured.tsv, /^Q\tC1\tBASE\tYVR\t20454\t20818$/m)
  assert.match(captured.tsv, /^Q\tC1\tRANK\tCA\t20454\t20818$/m)
  assert.match(captured.tsv, /^Q\tC1\tFLEET\t737\t20454\t20818$/m)
})

test('rule7504 warns and skips post-rest rows when duties lack post-rest end data', async () => {
  const logs = []
  let ran = false
  const source = {
    async crewOffsets() { return new Map([['C1', -360]]) },
    async crewBaseTimezone() { return new Map() },
    async flyDuties() {
      return [
        {
          crew_id: 'C1',
          pairing_id: 101,
          start_secs: 1_780_294_800,
          end_secs: 1_780_312_800,
          day_ord: 20605,
          assignment_group: 'FLY',
          assignment: 'FLY',
          attributes: 'WOCL',
        },
        {
          crew_id: 'C1',
          pairing_id: 202,
          start_secs: 1_780_381_200,
          end_secs: 1_780_399_200,
          day_ord: 20606,
          assignment_group: 'FLY',
          assignment: 'FLY',
          attributes: 'WOCL',
        },
      ]
    },
  }
  const ctx = {
    log: (m) => logs.push(m),
    instancesOf: (fn) => {
      if (fn === 7503) return [{ instance: '001', header: HDR7503, rows: [['02:00', '05:59']] }]
      if (fn === 7504) return [{
        instance: '001',
        header: HDR7504,
        rows: [['FLY', 'FLY', 'FLY', 'FLY', 'WOCL', 'WOCL', 'Y', 'Y', '*', '*', '*', '*', 'D', '55', 'RH']],
      }]
      return []
    },
    runBin() {
      ran = true
      return []
    },
  }

  const out = await rule7504(source, ctx)

  assert.deepEqual(out, [])
  assert.equal(ran, false)
  assert.ok(logs.some((m) => /skip 7504\/001.*Utilize Post Rest=Y.*post-rest end data/i.test(m)), logs.join('\n'))
})

test('rule7504 scenario source uses live fallback pairing segments for duty bounds', async () => {
  const { pairingEndRestSecsSql } = await import('../assignment-overlap-rest-sql.mjs')
  const sql = pairingEndRestSecsSql({
    segmentTables: ['scenario.pairing_segment', 'f8.pairing_segment'],
    pairingIdExpr: 'rf.pairing_id',
    rosterAlias: 'rf',
    segmentAlias: 'ps',
    scenarioIdParam: '$1',
  })
  assert.match(sql, /scenario\.pairing_segment/)
  assert.match(sql, /f8\.pairing_segment/)
  assert.match(sql, /coalesce\(max\(coalesce\(ps\.duty_act_end_dt_utc, ps\.duty_sch_end_dt_utc, ps\.debrief_end_utc\)\),/)
})

test('rule8002 enumerates BH instances/rows, tags instance+scope_key, computes DP, anchors start_dt', async () => {
  const span = new Map([['C1', { id: 9, startIso: '2026-06-10T00:00:00.000Z', endIso: '2026-06-10T12:00:00.000Z' }]])
  const source = {
    db: {},
    async blockByDay() { return [{ crew_id: 'C1', day: '2026-06-10', blk: 60 * 60 }] }, // 60h on one day
    async firstPairingSpanByCrew() { return span },
    async pairingSpansByCrew() { return new Map([['C1', [span.get('C1')]]]) },
    async crewBaseTimezone() { return new Map([['C1', 'UTC']]) },
  }
  const logs = []
  const ctx = {
    ...CTX_DATES,
    log: (m) => logs.push(m),
    instancesOf: (fn) => fn === 8002 ? [
      { instance: '001', header: HDR8002, rows: [
        ['*', '*', '*', '*', '28', 'CD', 'Y', '59:00', '00:00', 'BH'],  // 60h > 59h → breach
        ['*', '*', '*', '*', '90', 'CD', 'Y', '300:00', '00:00', 'BH'], // 60h < 300h → no breach
      ] },
      // DP row runs against the synthesized metrics (dp=0) → no finding, no skip log.
      { instance: '002', header: HDR8002, rows: [['*', '*', '*', '*', '7', 'CD', 'Y', '60:00', '00:00', 'DP']] },
    ] : [],
  }
  const out = await rule8002(source, ctx)
  assert.equal(out.length, 1, 'only the 28CD BH window breaches')
  assert.equal(out[0].rule_code, '8002')
  assert.equal(out[0].rule_instance, '001')
  assert.equal(out[0].scope_key, '28CD')
  assert.equal(out[0].pairing_id, 9)
  assert.equal(out[0].start_dt, '2026-06-10T00:00:00.000Z', 'anchored to pairing span, not window start')
  assert.match(out[0].message, /^Row 1: Cumulative block 60:00 exceeds 59:00 in the 28-day window /, 'BH message uses HH:MM matching manday with Row prefix')
  assert.ok(!logs.some((m) => m.includes('Type=DP')), 'DP is computed now — no skip log')
})

test('rule8002 anchors to the latest pairing overlapping the violating window, not the first pairing', async () => {
  const first = new Map([['C1', { id: 1, startIso: '2026-06-01T00:00:00.000Z', endIso: '2026-06-01T12:00:00.000Z' }]])
  const all = new Map([['C1', [
    { id: 1, startIso: '2026-06-01T00:00:00.000Z', endIso: '2026-06-01T12:00:00.000Z' },
    { id: 2, startIso: '2026-06-25T00:00:00.000Z', endIso: '2026-06-25T12:00:00.000Z' },
  ]]])
  const source = {
    db: {},
    async blockByDay() { return [{ crew_id: 'C1', day: '2026-06-25', blk: 60 * 60 }] },
    async firstPairingSpanByCrew() { return first },
    async pairingSpansByCrew() { return all },
    async crewBaseTimezone() { return new Map([['C1', 'UTC']]) },
  }
  const ctx = {
    ...CTX_DATES,
    log: () => {},
    instancesOf: (fn) => fn === 8002
      ? [{ instance: '001', header: HDR8002, rows: [['*', '*', '*', '*', '28', 'CD', 'Y', '59:00', '00:00', 'BH']] }]
      : [],
  }
  const out = await rule8002(source, ctx)
  assert.equal(out.length, 1)
  assert.equal(out[0].pairing_id, 2)
  assert.equal(out[0].start_dt, '2026-06-25T00:00:00.000Z')
  assert.equal(out[0].window_start_dt, '2026-05-29T00:00:00.000Z')
  assert.equal(out[0].window_end_dt, '2026-06-25T00:00:00.000Z')
})

test('rule8002 persists the effective rolling window separately from the anchor pairing', async () => {
  const first = new Map([['C1', { id: 1, startIso: '2026-06-01T00:00:00.000Z', endIso: '2026-06-01T12:00:00.000Z' }]])
  const all = new Map([['C1', [
    { id: 1, startIso: '2026-06-20T00:00:00.000Z', endIso: '2026-06-20T12:00:00.000Z' },
    { id: 2, startIso: '2026-07-13T00:00:00.000Z', endIso: '2026-07-13T12:00:00.000Z' },
  ]]])
  const source = {
    db: {},
    async blockByDay() {
      return [
        { crew_id: 'C1', day: '2026-06-16', blk: 30 * 60 },
        { crew_id: 'C1', day: '2026-07-13', blk: 31 * 60 },
      ]
    },
    async firstPairingSpanByCrew() { return first },
    async pairingSpansByCrew() { return all },
    async crewBaseTimezone() { return new Map([['C1', 'UTC']]) },
  }
  const ctx = {
    dateFrom: '2026-06-01',
    dateTo: '2026-07-13',
    log: () => {},
    instancesOf: (fn) => fn === 8002
      ? [{ instance: '001', header: HDR8002, rows: [['*', '*', '*', '*', '28', 'CD', 'Y', '60:00', '00:00', 'BH']] }]
      : [],
  }
  const out = await rule8002(source, ctx)
  assert.equal(out.length, 1)
  assert.equal(out[0].pairing_id, 2)
  assert.equal(out[0].start_dt, '2026-07-13T00:00:00.000Z')
  assert.equal(out[0].window_start_dt, '2026-06-16T00:00:00.000Z')
  assert.equal(out[0].window_end_dt, '2026-07-13T00:00:00.000Z')
})

// Qualification gate — the B1 regression: a Ranks=CA row must fire for the CA
// crew and stay silent for the FO crew (matching happens in the Rust binary).
test('rule8002 rank-gated row fires for CA crew only', async () => {
  const span = new Map([
    ['CA1', { id: 1, startIso: '2026-06-10T00:00:00.000Z', endIso: '2026-06-10T12:00:00.000Z' }],
    ['FO1', { id: 2, startIso: '2026-06-10T00:00:00.000Z', endIso: '2026-06-10T12:00:00.000Z' }],
  ])
  const source = {
    db: {},
    async blockByDay() { return [] },
    async mandayMetricsByDay() {
      const day = (crew) => ({ crew_id: crew, day: '2026-06-10', blh: 200, ft: 0, dp: 0, credit_min: 0, sby: 0, int_blh: 0, aug_blh: 0, duty_aloft: 0, cross_tz: 0 })
      return [day('CA1'), day('FO1')]
    },
    async crewQualEntries() {
      return [
        { crew_id: 'CA1', dim: 'R', value: 'CA', eff: '2020-01-01', exp: null },
        { crew_id: 'FO1', dim: 'R', value: 'FO', eff: '2020-01-01', exp: null },
      ]
    },
    async firstPairingSpanByCrew() { return span },
    async crewBaseTimezone() { return new Map() },
  }
  const ctx = {
    ...CTX_DATES,
    log: () => {},
    instancesOf: (fn) => fn === 8002
      ? [{ instance: '001', header: HDR8002, rows: [['*', 'CA', '*', '*', '1', 'CD', 'Y', '02:00', '00:00', 'BH']] }]
      : [],
  }
  const out = await rule8002(source, ctx)
  assert.equal(out.length, 1, 'only the CA crew breaches the CA-gated row')
  assert.equal(out[0].crew_id, 'CA1')
})

test('rule8002 emits Q T rows for Crew Teams gated rows', async () => {
  let captured = null
  const source = {
    async blockByDay() { return [{ crew_id: 'C1', day: '2026-06-10', blk: 60 * 60 }] },
    async firstPairingSpanByCrew() { return new Map([['C1', { id: 9, startIso: '2026-06-10T00:00:00.000Z', endIso: '2026-06-10T12:00:00.000Z' }]]) },
    async pairingSpansByCrew() { return new Map() },
    async crewBaseTimezone() { return new Map([['C1', 'UTC']]) },
    async crewTeams() { return new Map([['C1', ['TEAM1']]]) },
  }
  const out = await rule8002(source, {
    ...CTX_DATES,
    log: () => {},
    runBin(bin, args, input) {
      captured = { bin, args, input }
      return [['V', 'C1', '0', 'BH', '1', 'CD', '3600', '3000', '0', '1781049600', '1781135999', '1', '0']]
    },
    instancesOf: (fn) => fn === 8002
      ? [{ instance: '001', header: HDR8002, rows: [['*', '*', '*', 'TEAM1', '1', 'CD', 'Y', '50:00', '00:00', 'BH']] }]
      : [],
  })

  assert.equal(captured.bin, 'check-8002-full')
  assert.ok(captured.input.includes('U\t0\t*\t*\t*\tTEAM1\t1\tCD'), captured.input)
  assert.ok(captured.input.includes('Q\tC1\tT\tTEAM1\t-1000000\t-1'), captured.input)
  assert.equal(out.length, 1)
})

test('rule8002 emits P rows for RP unit rows', async () => {
  let captured = null
  const source = {
    async blockByDay() { return [{ crew_id: 'C1', day: '2026-06-10', blk: 60 * 60 }] },
    async firstPairingSpanByCrew() { return new Map([['C1', { id: 9, startIso: '2026-06-10T00:00:00.000Z', endIso: '2026-06-10T12:00:00.000Z' }]]) },
    async pairingSpansByCrew() { return new Map() },
    async crewBaseTimezone() { return new Map([['C1', 'UTC']]) },
    async rosterPeriods() { return [{ start: '2026-06-01', end: '2026-06-30' }] },
  }
  await rule8002(source, {
    ...CTX_DATES,
    log: () => {},
    runBin(bin, args, input) {
      captured = { bin, args, input }
      return []
    },
    instancesOf: (fn) => fn === 8002
      ? [{ instance: '001', header: HDR8002, rows: [['*', '*', '*', '*', '1', 'RP', 'Y', '50:00', '00:00', 'BH']] }]
      : [],
  })

  assert.ok(captured.input.includes('P\t20605\t20634'), captured.input)
})

// DP from manday metrics — the live DP hole is closed: a 7CD/60:00 DP cap fires
// on manday dp minutes, aggregated to ONE worst window per crew×row.
test('rule8002 skips B/R/F gated rows when qualification source is missing', async () => {
  let ran = false
  const logs = []
  const source = {
    async blockByDay() { return [{ crew_id: 'C1', day: '2026-06-10', blk: 60 * 60 }] },
    async firstPairingSpanByCrew() { return new Map([['C1', { id: 9, startIso: '2026-06-10T00:00:00.000Z', endIso: '2026-06-10T12:00:00.000Z' }]]) },
    async pairingSpansByCrew() { return new Map() },
    async crewBaseTimezone() { return new Map([['C1', 'UTC']]) },
  }
  const out = await rule8002(source, {
    ...CTX_DATES,
    log: (message) => logs.push(message),
    runBin() { ran = true; return [] },
    instancesOf: (fn) => fn === 8002
      ? [{ instance: '001', header: HDR8002, rows: [['YYZ', '*', '*', '*', '1', 'CD', 'Y', '50:00', '00:00', 'BH']] }]
      : [],
  })

  assert.deepEqual(out, [])
  assert.equal(ran, false)
  assert.ok(logs.some((message) => /skip 8002\/001.*qualification filters.*no crew qualification data/i.test(message)), logs.join('\n'))
})

test('rule8002 DP row fires from manday dp metrics (worst window aggregated)', async () => {
  const span = new Map([['C1', { id: 9, startIso: '2026-06-10T00:00:00.000Z', endIso: '2026-06-10T12:00:00.000Z' }]])
  const source = {
    db: {},
    async blockByDay() { return [] },
    async mandayMetricsByDay() {
      return [
        { crew_id: 'C1', day: '2026-06-10', blh: 0, ft: 0, dp: 2000, credit_min: 0, sby: 0, int_blh: 0, aug_blh: 0, duty_aloft: 0, cross_tz: 0 },
        { crew_id: 'C1', day: '2026-06-12', blh: 0, ft: 0, dp: 1800, credit_min: 0, sby: 0, int_blh: 0, aug_blh: 0, duty_aloft: 0, cross_tz: 0 },
      ]
    },
    async crewQualEntries() { return [] },
    async firstPairingSpanByCrew() { return span },
    async crewBaseTimezone() { return new Map([['C1', 'UTC']]) },
  }
  const ctx = {
    ...CTX_DATES,
    log: () => {},
    instancesOf: (fn) => fn === 8002
      ? [{ instance: '002', header: HDR8002, rows: [['*', '*', '*', '*', '7', 'CD', 'Y', '60:00', '00:00', 'DP']] }]
      : [],
  }
  const out = await rule8002(source, ctx)
  assert.equal(out.length, 1, 'many violating 7-day windows aggregate to ONE bell')
  assert.equal(out[0].actual_value, 3800, 'worst window sums both dp days')
  assert.equal(out[0].scope_key, '7CD')
  assert.match(out[0].message, /^Row \d+: Cumulative DP 63:20 exceeds 60:00/)
})

// Min Limits (editor semantics): an under-min month fires with the generic template.
test('rule8002 Min Limits under-min fires with the generic message', async () => {
  const span = new Map([['C1', { id: 9, startIso: '2026-06-10T00:00:00.000Z', endIso: '2026-06-10T12:00:00.000Z' }]])
  const source = {
    db: {},
    async blockByDay() { return [] },
    async mandayMetricsByDay() {
      return [{ crew_id: 'C1', day: '2026-06-10', blh: 600, ft: 0, dp: 0, credit_min: 0, sby: 0, int_blh: 0, aug_blh: 0, duty_aloft: 0, cross_tz: 0 }]
    },
    async crewQualEntries() { return [] },
    async firstPairingSpanByCrew() { return span },
    async crewBaseTimezone() { return new Map([['C1', 'UTC']]) },
  }
  const ctx = {
    ...CTX_DATES,
    log: () => {},
    instancesOf: (fn) => fn === 8002
      ? [{ instance: '001', header: HDR8002, rows: [['*', '*', '*', '*', '1', 'CM', 'Y', '*', '20:00', 'BH']] }]
      : [],
  }
  const out = await rule8002(source, ctx)
  assert.ok(out.length >= 1, 'under-min month fires')
  assert.equal(out[0].limit_value, 20 * 60, 'limit_value = min limit when under')
  // The worst window aggregation picks the emptier month (the trailing partial
  // month overlapping the checked end — C++ enumerates and checks it too).
  assert.match(out[0].message, /^Row \d+: Cumulative BH 00:00 is below 20:00 in the 1CM window/)
})

// rule8004 end-to-end (real check-8004 binary). Proves the message embeds the
// roster's start date converted to the CREW-BASE local timezone, not the raw
// UTC date — the roster starts 2026-06-10T02:00:00Z, which in America/Vancouver
// (UTC-7) is still 2026-06-09 local. An unqualified base (no matching Q row)
// must fire; the message must show the Vancouver date, never the UTC one.
test('rule8004 message embeds the roster start date in the crew base local timezone', async () => {
  const startSecs = Math.floor(Date.UTC(2026, 5, 10, 2, 0, 0) / 1000) // 2026-06-10T02:00:00Z
  const source = {
    db: {},
    async assignmentsRaw() {
      return [{ crew_id: 'C1', pairing_id: 500, base: 'YYZ', start_date: '2026-06-10', end_date: '2026-06-10', start_secs: startSecs, end_secs: startSecs + 3600 }]
    },
    async baseQuals() { return [] }, // no qualification anywhere → base is invalid
    async crewBaseTimezone() { return new Map([['C1', 'America/Vancouver']]) },
  }
  const HDR = ['Grace Period']
  const ctx = {
    log: () => {},
    instancesOf: (fn) => fn === 8004 ? [{ instance: '001', header: HDR, rows: [['0']] }] : [],
  }
  const out = await rule8004(source, ctx)
  assert.equal(out.length, 1)
  assert.equal(out[0].rule_code, '8004')
  assert.match(out[0].message, /^Row 1: /, 'message starts with Row 1: for the sole param row')
  assert.match(out[0].message, /\(2026-06-09\)/, 'message uses the Vancouver LOCAL date, not the UTC date (2026-06-10)')
  assert.ok(!out[0].message.includes('2026-06-10'), 'the raw UTC date must not leak into the message')
})

// Crew with no timezone on record (crewBaseTimezone() misses it) must degrade
// to the UTC date instead of throwing.
test('rule8004 falls back to the UTC date when the crew has no known base timezone', async () => {
  const startSecs = Math.floor(Date.UTC(2026, 5, 10, 2, 0, 0) / 1000)
  const source = {
    db: {},
    async assignmentsRaw() {
      return [{ crew_id: 'C2', pairing_id: 501, base: 'YYZ', start_date: '2026-06-10', end_date: '2026-06-10', start_secs: startSecs, end_secs: startSecs + 3600 }]
    },
    async baseQuals() { return [] },
    async crewBaseTimezone() { return new Map() }, // C2 not found
  }
  const ctx = {
    log: () => {},
    instancesOf: (fn) => fn === 8004 ? [{ instance: '001', header: ['Grace Period'], rows: [['0']] }] : [],
  }
  const out = await rule8004(source, ctx)
  assert.equal(out.length, 1)
  assert.match(out[0].message, /^Row 1: /)
  assert.match(out[0].message, /\(2026-06-10\)/, 'falls back to the UTC date')
})

test('rule8002 emits nothing + logs when the function has no instances (no silent fallback)', async () => {
  const logs = []
  const out = await rule8002({ db: {}, async blockByDay() { return [] }, async firstPairingSpanByCrew() { return new Map() }, async crewBaseTimezone() { return new Map() } },
    { log: (m) => logs.push(m), instancesOf: () => [] })
  assert.deepEqual(out, [])
  assert.ok(logs.some((m) => m.includes('no instances')))
})

const HDR8056_FULL = [
  'Bases', 'Ranks', 'Fleets', 'Crew Teams',
  'Attribute A', 'Label A', 'Assignment Group A', 'Assignment A', 'Qualifier A', 'Airport A', 'Roles A', 'Is Requested A',
  'Attribute B', 'Label B', 'Assignment Group B', 'Assignment B', 'Qualifier B', 'Airport B', 'Roles B', 'Is Requested B',
  'Space', 'Unit', 'Directional', 'Is Location Equal Base A', 'Is Location Equal Base B', 'Utilize Post Duty Rest',
]

// rule8056: structured input carries all rule params plus Q/T crew context. The data layer still
// receives the groups/codes the rule set references so it can load the exact candidate duties.
test('rule8056 builds structured R/D/Q/T input with full 8056 params and crew scope', async () => {
  const S = Math.floor(Date.UTC(2026, 5, 10, 0, 0, 0) / 1000)
  let receivedGroups = null, receivedCodes = null, captured
  const source = {
    async flyByPairing(groups, codes) {
      receivedGroups = groups; receivedCodes = codes
      return [
        {
          crew_id: 'C1', pairing_id: 100, start_secs: S, end_secs: S + 3600, end_rest_secs: S + 3600,
          label: 'FLY:P100', assignment_group: 'FLY', assignment: 'FLT', attributes: 'A', qualifier: 'FLT',
          airport: 'YYZ', role: 'CA', is_requested: 1, location: 'YYZ', crew_base: 'YYZ', is_pre_assigned: 'N',
          offset_min: -240, zone_id: 'America/Toronto',
        },
        {
          crew_id: 'C1', pairing_id: 0, start_secs: S + 3600 + 1800, end_secs: S + 7200, end_rest_secs: S + 7200,
          label: 'VAC', assignment_group: 'GRD', assignment: 'VAC', attributes: 'B', qualifier: 'VAC',
          airport: 'YVR', role: 'FO', is_requested: 0, location: 'YVR', crew_base: 'YYZ', is_pre_assigned: false,
          offset_min: -240, zone_id: 'America/Toronto',
        },
      ]
    },
    async crewQualEntries() {
      return [
        { crew_id: 'C1', dim: 'B', value: 'YYZ', eff: '2026-01-01', exp: null },
        { crew_id: 'C1', dim: 'R', value: 'CA', eff: '2026-01-01', exp: null },
        { crew_id: 'C1', dim: 'F', value: '320', eff: '2026-01-01', exp: null },
      ]
    },
    async crewTeams() { return new Map([['C1', ['TEAM1']]]) },
  }
  const ctx = {
    log: () => {},
    runBin(bin, args, input) {
      captured = { bin, args, input }
      return [['C1', '100', String(S + 3600), String(S + 3600 + 1800), '30', 'FLY:P100', 'VAC', '0']]
    },
    instancesOf: (fn) => fn === 8056
      ? [{ instance: '001', header: HDR8056_FULL, rows: [[
          'YYZ', 'CA', '320', 'TEAM1',
          'A', '*', 'FLY', 'FLT', 'FLT', 'YYZ', 'CA', 'Y',
          'B', '*', 'GRD', 'VAC', 'VAC', 'YVR', 'FO', 'N',
          '13', 'RH', 'Y', 'Y', 'N', 'Y',
        ]] }]
      : [],
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
  }
  const out = await rule8056(source, ctx)
  assert.equal(captured.bin, 'check-8056')
  assert.deepEqual(captured.args, ['--emit-tsv'])
  const lines = captured.input.split('\n')
  assert.equal(lines.filter((line) => line.startsWith('R\t')).length, 1)
  assert.ok(lines.some((line) => line === 'Q\tC1\tB\tYYZ\t20454\t-1'), lines.join('\n'))
  assert.ok(lines.some((line) => line === 'Q\tC1\tR\tCA\t20454\t-1'), lines.join('\n'))
  assert.ok(lines.some((line) => line === 'Q\tC1\tF\t320\t20454\t-1'), lines.join('\n'))
  assert.ok(lines.some((line) => line === 'T\tC1\tTEAM1'), lines.join('\n'))
  assert.ok(lines.some((line) => line.includes('\tFLY:P100\tFLY\tFLT\tA\tFLT\tYYZ\tCA\tY\tYYZ\tYYZ\tN\t-240')), lines.join('\n'))
  assert.ok(lines.some((line) => line.includes('\tVAC\tGRD\tVAC\tB\tVAC\tYVR\tFO\tN\tYVR\tYYZ\tN\t-240')), lines.join('\n'))
  assert.ok(receivedGroups?.includes('GRD'), 'flyByPairing must receive GRD from the param (no hardcode)')
  assert.ok(receivedGroups?.includes('FLY'))
  assert.ok(receivedCodes?.includes('FLT') && receivedCodes?.includes('VAC'))
  assert.equal(out.length, 1)
  assert.equal(out[0].rule_code, '8056')
  assert.equal(out[0].rule_instance, '001')
  assert.equal(out[0].limit_value, 13)
  assert.match(out[0].message, /VAC/)
})

// rule8056: a row may match by specific assignment CODE (param "Assignment A/B") with the
// group wildcard — e.g. assignment FLY → assignment VAC, independent of the GRD bucket.
// Multiple rows in one instance each fire independently with a distinct scope_key.
test('rule8056 matches by assignment code (FLY→VAC), distinct from a group row; multi-row', async () => {
  const S = Math.floor(Date.UTC(2026, 5, 10, 0, 0, 0) / 1000)
  let receivedGroups = null, receivedCodes = null
  const source = {
    async flyByPairing(groups, codes) {
      receivedGroups = groups; receivedCodes = codes
      return [
        { crew_id: 'C1', pairing_id: 100, start_secs: S, end_secs: S + 3600, label: 'FLY:P100', assignment_group: 'FLY', assignment: 'FLY' },
        { crew_id: 'C1', pairing_id: 0, start_secs: S + 5400, end_secs: S + 9000, label: 'VAC', assignment_group: 'GRD', assignment: 'VAC' }, // 30m after → < 13h
        { crew_id: 'C1', pairing_id: 0, start_secs: S + 5400, end_secs: S + 9000, label: 'DO', assignment_group: 'GRD', assignment: 'DO' }, // same gap, but code DO
      ]
    },
  }
  // Two rows: [0] group-based FLY→GRD; [1] code-based FLY→VAC (groups wildcard).
  const HDR = ['Assignment Group A', 'Assignment A', 'Assignment Group B', 'Assignment B', 'Space', 'Unit']
  const ctx = {
    log: () => {},
    instancesOf: (fn) => fn === 8056 ? [{ instance: '001', header: HDR, rows: [
      ['FLY', '*', 'GRD', '*', '13', 'RH'],
      ['*', 'FLY', '*', 'VAC', '13', 'RH'],
    ] }] : [],
  }
  const out = await rule8056(source, ctx)
  // Data layer received both the referenced group (GRD) and the referenced codes (FLY, VAC).
  assert.ok(receivedGroups?.includes('GRD'))
  assert.ok(receivedCodes?.includes('FLY') && receivedCodes?.includes('VAC'), 'codes from Assignment A/B reach the data layer')
  // Group row [0]: FLY→GRD matches BOTH VAC and DO (both group GRD) → 2 violations.
  // Code row [1]: FLY→VAC matches only VAC → 1 violation. Total 3, two distinct scope_keys.
  const codeRow = out.filter((v) => v.scope_key === 'FLY>VAC')
  const groupRow = out.filter((v) => v.scope_key === 'FLY>GRD')
  assert.equal(codeRow.length, 1, 'code row FLY→VAC fires once (VAC only, not DO)')
  assert.match(codeRow[0].message, /VAC/)
  assert.equal(groupRow.length, 2, 'group row FLY→GRD fires for both ground duties')
  assert.equal(out.length, 3)
})

test('rule8056 emits nothing + logs when the function has no instances (no silent fallback)', async () => {
  const logs = []
  let called = false
  const out = await rule8056({ async flyByPairing() { called = true; return [] } },
    { log: (m) => logs.push(m), instancesOf: () => [] })
  assert.deepEqual(out, [])
  assert.equal(called, false, 'must not query data when the rule set has no 8056 instance')
  assert.ok(logs.some((m) => m.includes('no instances')))
})

test('rule8071 maps F8 default row into persisted 8071 violations', async () => {
  const S = Math.floor(Date.UTC(2026, 5, 1, 0, 0, 0) / 1000)
  let receivedFilters = null
  const rows = Array.from({ length: 12 }, (_, i) => ({
    crew_id: 'C1',
    pairing_id: 100 + i,
    duty_seq: 1,
    segment_id: 1000 + i,
    start_utc: S + i * 86_400,
    end_utc: S + i * 86_400 + 3600,
    bases: 'YYZ',
    ranks: 'CA',
    fleets: '777',
    teams: '*',
    label: 'P',
    attributes: '*',
    override_duty_attributes: '*',
    assignment_group: 'FLY',
    qualifier: '*',
    flight_number: i % 2 === 0 ? '0031' : '9999',
    destination: 'YVR',
    position: 'CA',
  }))
  const source = {
    async rosterProperties(filters) {
      receivedFilters = filters
      return rows
    },
  }
  const ctx = {
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
    log: () => {},
    instancesOf: (fn) => fn === 8071
      ? [{ instance: '001', header: HDR8071, rows: [['*', '*', '*', '*', '*', '*', '*', 'FLY', '*', '*', '*', '*', '1', 'CM', '11', '0', '*']] }]
      : [],
  }
  const out = await rule8071(source, ctx)
  assert.equal(receivedFilters.groups[0], 'FLY')
  assert.deepEqual(receivedFilters.flights, [], 'Flights=* must not restrict source rows')
  assert.equal(out.length, 1)
  assert.equal(out[0].rule_code, '8071')
  assert.equal(out[0].rule_instance, '001')
  assert.equal(out[0].scope_key, '1CM:*:FLY:R')
  assert.equal(out[0].actual_value, 12)
  assert.equal(out[0].limit_value, 11)
  assert.equal(out[0].unit, 'COUNT')
  assert.match(
    out[0].message,
    /^Row 1: Roster Period \[2026-06-01, 2026-06-30\]: The number of matching rosters \(12\) does NOT meet the allowed range of \[0, 11\]/,
  )
})

test('rule8071 forwards all rule fields, crew teams, and RP periods', async () => {
  const S = Math.floor(Date.UTC(2026, 5, 1, 0, 0, 0) / 1000)
  let captured = null
  const source = {
    async crewTeams() { return new Map([['C1', ['TEAM1']]]) },
    async rosterPeriods() { return [{ start: '2026-06-01', end: '2026-06-30' }] },
    async rosterProperties() {
      return [{
        crew_id: 'C1',
        pairing_id: 700,
        duty_seq: 1,
        segment_id: 7001,
        start_utc: S,
        end_utc: S + 3600,
        bases: 'YYZ',
        ranks: 'CA',
        fleets: '777',
        teams: '*',
        label: 'LABEL',
        attributes: 'ATTR',
        override_duty_attributes: 'OVR',
        assignment_group: 'FLY',
        qualifier: 'QUAL',
        flight_number: '0031',
        destination: 'YVR',
        position: 'CA',
      }]
    },
  }
  const ctx = {
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
    log: () => {},
    runBin(bin, args, input) {
      captured = { bin, args, input }
      return []
    },
    instancesOf: (fn) => fn === 8071
      ? [{ instance: '001', header: HDR8071, rows: [[
          'YYZ', 'CA', '777', 'TEAM1', 'LABEL', 'ATTR', 'OVR',
          'FLY', 'QUAL', '0031', 'YVR', 'CA', '1', 'RP', '11', '2', 'R',
        ]] }]
      : [],
  }

  await rule8071(source, ctx)

  assert.equal(captured.bin, 'check-8071')
  assert.ok(captured.input.includes(
    'R\t0\tYYZ\tCA\t777\tTEAM1\tLABEL\tATTR\tOVR\tFLY\tQUAL\t0031\tYVR\tCA\t1\tRP\t11\t2\tR',
  ), captured.input)
  assert.ok(captured.input.includes(
    'A\tC1\t700\t1\t7001\t' +
    `${S}\t${S + 3600}\tYYZ\tCA\t777\tTEAM1\tLABEL\tATTR\tOVR\tFLY\tQUAL\t0031\tYVR\tCA`,
  ), captured.input)
  // 8071 P lines are roster-period bounds in epoch seconds (not day_ord).
  assert.ok(
    captured.input.includes(`P\t${epochSec('2026-06-01T00:00:00Z')}\t${epochSec('2026-06-30T00:00:00Z')}`),
    captured.input,
  )
})

test('rule8071 skips team-gated and RP rows when required sources are missing', async () => {
  let ran = false
  const logs = []
  const source = {
    async rosterProperties() { return [] },
  }
  const ctx = {
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
    log: (message) => logs.push(message),
    runBin() { ran = true; return [] },
    instancesOf: (fn) => fn === 8071
      ? [{ instance: '001', header: HDR8071, rows: [
          ['*', '*', '*', 'TEAM1', '*', '*', '*', '*', '*', '*', '*', '*', '1', 'CD', '1', '0', 'R'],
          ['*', '*', '*', '*', '*', '*', '*', '*', '*', '*', '*', '*', '1', 'RP', '1', '0', 'R'],
        ] }]
      : [],
  }

  const out = await rule8071(source, ctx)

  assert.deepEqual(out, [])
  assert.equal(ran, false)
  assert.equal(logs.filter((message) => message.includes('skip 8071/001')).length, 2, logs.join('\n'))
})

test('rule8071 keeps nonmatching roster rows available for editor under-min checks', async () => {
  const S = Math.floor(Date.UTC(2026, 5, 1, 0, 0, 0) / 1000)
  let receivedFilters = null
  const nonmatchingRows = [{
    crew_id: 'C1',
    pairing_id: 700,
    duty_seq: 1,
    segment_id: 7001,
    start_utc: S,
    end_utc: S + 3600,
    bases: 'YYZ',
    ranks: 'CA',
    fleets: '777',
    teams: '*',
    label: 'P',
    attributes: '*',
    override_duty_attributes: '*',
    assignment_group: 'SBY',
    qualifier: '*',
    flight_number: '1234',
    destination: 'YVR',
    position: 'CA',
  }]
  const source = {
    async rosterProperties(filters) {
      receivedFilters = filters
      return filters.groups?.length ? [] : nonmatchingRows
    },
  }
  const ctx = {
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
    log: () => {},
    instancesOf: (fn) => fn === 8071
      ? [{ instance: '001', header: HDR8071, rows: [['*', '*', '*', '*', '*', '*', '*', 'FLY', '*', '*', '*', '*', '1', 'CM', '99', '1', '*']] }]
      : [],
  }

  const out = await rule8071(source, ctx)

  assert.deepEqual(receivedFilters.groups, [], 'Min Times rows need the full crew roster population')
  assert.equal(out.length, 1)
  assert.equal(out[0].rule_code, '8071')
  assert.equal(out[0].actual_value, 0)
  assert.equal(out[0].limit_value, 1)
  assert.equal(out[0].pairing_id, 700)
})

test('rule8071 emits nothing and does not query source when absent from ruleset', async () => {
  const logs = []
  let called = false
  const out = await rule8071({ async rosterProperties() { called = true; return [] } }, {
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
    log: (m) => logs.push(m),
    instancesOf: () => [],
  })
  assert.deepEqual(out, [])
  assert.equal(called, false)
  assert.ok(logs.some((m) => m.includes('no instances')))
})

test('rule8072 maps F8 default row into persisted 8072 violations', async () => {
  const source = {
    async qualificationFlightSegments() {
      return [{
        segment_id: 9001,
        pairing_id: 7001,
        duty_seq: 1,
        seg_seq: 1,
        flight_id: 3001,
        flight_number: 'F8001',
        flight_date: '2026-06-01',
        start_utc: 1780000000,
        end_utc: 1780007200,
        fleet: '737',
        dep: 'YYZ',
        arr: 'YVR',
        assignment: 'FLY',
        assignment_group: 'FLY',
        composition: 'STD',
        attributes: 'LONG',
        destination_country: 'CA',
        planned_by_rank: 'CA:1|FO:1',
        filled_by_rank: 'CA:1|FO:1',
        crews: [
          { crew_id: 'C1', division: 'P', acting_rank: 'CA', assignment: 'FLY', assignment_group: 'FLY', nationality: 'CA', teams: 'A', source: 'CR', qualifications: 'FC-GREEN' },
          { crew_id: 'C2', division: 'P', acting_rank: 'FO', assignment: 'FLY', assignment_group: 'FLY', nationality: 'CA', teams: 'A', source: 'CR', qualifications: 'FC-GREEN' },
        ],
      }]
    },
  }
  const logs = []
  const ctx = {
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
    log: (m) => logs.push(m),
    instancesOf: (fn) => fn === 8072
      ? [{ instance: '001', header: HDR8072, rows: [['*', 'FLY', '*', '*', '*', '*', '*', 'FC-GREEN', '*', '*', '*', '0', '1']] }]
      : [],
  }
  const out = await rule8072(source, ctx)
  assert.equal(out.length, 1)
  assert.equal(out[0].rule_code, '8072')
  assert.equal(out[0].rule_instance, '001')
  assert.equal(out[0].pairing_id, 7001)
  assert.equal(out[0].segment_id, 9001)
  assert.equal(out[0].actual_value, 2)
  assert.equal(out[0].limit_value, 1)
  assert.equal(
    out[0].message,
    'Row 1: Crew count out of range (Current: 2, Allowed: 0–1).',
  )
})

test('rule8072 scope key distinguishes same-duty segment violations for upsert', async () => {
  const segment = (segmentId, flightNumber) => ({
    segment_id: segmentId,
    pairing_id: 7001,
    duty_seq: 1,
    seg_seq: segmentId,
    flight_id: 3000 + segmentId,
    flight_number: flightNumber,
    flight_date: '2026-06-01',
    start_utc: 1780000000,
    end_utc: 1780007200,
    fleet: '737',
    dep: 'YYZ',
    arr: 'YVR',
    assignment: 'FLY',
    assignment_group: 'FLY',
    composition: 'STD',
    attributes: 'LONG',
    destination_country: 'CA',
    planned_by_rank: 'CA:1',
    filled_by_rank: 'CA:1',
    crews: [
      { crew_id: 'C1', division: 'P', acting_rank: 'CA', assignment: 'FLY', assignment_group: 'FLY', nationality: 'CA', teams: 'A', source: 'CR', qualifications: 'FC-GREEN' },
    ],
  })
  const source = {
    async qualificationFlightSegments() {
      return [segment(9001, 'F8001'), segment(9002, 'F8002')]
    },
  }
  const ctx = {
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
    log: () => {},
    instancesOf: (fn) => fn === 8072
      ? [{ instance: '001', header: HDR8072, rows: [['*', 'FLY', '*', '*', '*', '*', '*', 'FC-GREEN', '*', '*', '*', '0', '0']] }]
      : [],
  }
  const out = await rule8072(source, ctx)
  assert.equal(out.length, 2)
  assert.notEqual(out[0].scope_key, out[1].scope_key)
  assert.ok(out.every((v) => v.scope_key.startsWith('seg:')))
})

test('rule8072 accepts normalized source rows with multiple crew records', async () => {
  let filtersSeen = null
  const source = {
    async qualificationFlightSegments(filters) {
      filtersSeen = filters
      return [{
        segment_id: 1,
        pairing_id: 2,
        duty_seq: 3,
        seg_seq: 4,
        flight_id: 5,
        flight_number: 'F8001',
        flight_date: '2026-06-01',
        start_utc: 1780000000,
        end_utc: 1780007200,
        fleet: '737',
        dep: 'YYZ',
        arr: 'YVR',
        assignment: 'FLY',
        assignment_group: 'FLY',
        composition: 'STD',
        attributes: '*',
        destination_country: 'CA',
        planned_by_rank: 'CA:1|FO:1',
        filled_by_rank: 'CA:1|FO:1',
        crews: [
          { crew_id: 'C1', division: 'P', acting_rank: 'CA', assignment: 'FLY', assignment_group: 'FLY', nationality: 'CA', teams: '*', source: 'CR', qualifications: 'FC-GREEN' },
          { crew_id: 'C2', division: 'P', acting_rank: 'FO', assignment: 'FLY', assignment_group: 'FLY', nationality: 'CA', teams: '*', source: 'CR', qualifications: 'FC-GREEN' },
        ],
      }]
    },
  }
  const ctx = {
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
    log() {},
    instancesOf: (fn) => fn === 8072
      ? [{ instance: '001', header: HDR8072, rows: [['*', 'FLY', '*', '*', '*', '*', '*', 'FC-GREEN', '*', '*', '*', '0', '1']] }]
      : [],
  }
  const out = await rule8072(source, ctx)
  assert.equal(filtersSeen.groups[0], 'FLY')
  assert.equal(out.length, 1)
})

test('rule8072 emits nothing and does not query source when absent from ruleset', async () => {
  let called = false
  const out = await rule8072({ async qualificationFlightSegments() { called = true; return [] } }, {
    instancesOf: () => [],
    log() {},
  })
  assert.deepEqual(out, [])
  assert.equal(called, false)
})

test('rule8072 skips malformed param rows before querying source', async () => {
  const logs = []
  let called = false
  const out = await rule8072({ async qualificationFlightSegments() { called = true; return [] } }, {
    instancesOf: (fn) => fn === 8072
      ? [{ instance: '001', header: ['Flight Fleets'], rows: [['*']] }]
      : [],
    log: (m) => logs.push(m),
  })
  assert.deepEqual(out, [])
  assert.equal(called, false)
  assert.ok(logs.some((m) => m.includes('missing Required Qualifications')))
})

test('rule8056 skips malformed param rows before querying source', async () => {
  const logs = []
  let called = false
  const out = await rule8056({ async flyByPairing() { called = true; return [] } }, {
    instancesOf: (fn) => fn === 8056
      ? [{
          instance: '001',
          header: ['Assignment Group A', 'Assignment Group B', 'Space'],
          rows: [['FLY', 'GRD', '']],
        }]
      : [],
    log: (m) => logs.push(m),
  })
  assert.deepEqual(out, [])
  assert.equal(called, false)
  assert.ok(logs.some((m) => m.includes('missing Space')))
})

test('rule8030 skips malformed params before querying source', async () => {
  const logs = []
  let called = false
  const out = await rule8030({ async pilotAge() { called = true; return [] } }, {
    instancesOf: (fn) => fn === 8030
      ? [{ instance: '004', header: ['Division', 'Age Define', 'Max Number'], rows: [['P', '', '1']] }]
      : [],
    log: (m) => logs.push(m),
  })
  assert.deepEqual(out, [])
  assert.equal(called, false)
  assert.ok(logs.some((m) => m.includes('missing Division/Age Define/Max Number')))
})

test('resolve8030FlightLabel prefers flt_num over flt_id', async () => {
  const { resolve8030FlightLabel, format8030ViolationMessage } = await import('../legality-recheck-core.mjs')
  assert.equal(resolve8030FlightLabel(77370, '605'), '605')
  assert.equal(resolve8030FlightLabel(77370, 'F8604', 'F8'), '604')
  assert.equal(resolve8030FlightLabel(77370, '605', 'F8'), '605')
  assert.equal(resolve8030FlightLabel(77370, 'OBDO'), 'OBDO')
  assert.equal(resolve8030FlightLabel(77370, '  '), '77370')
  assert.equal(resolve8030FlightLabel(77370, null), '77370')
  assert.match(
    format8030ViolationMessage({
      ageYears: 58, flightLabel: '605', onFlightCount: 2, ageLimit: 50, maxNumber: 1,
    }),
    /^Row 1: Pilot aged 58 on flight 605 carrying 2 crew aged 50\+ \(limit 1\)\.$/,
  )
  assert.match(
    format8030ViolationMessage({
      ageYears: 58, flightLabel: '605', onFlightCount: 2, ageLimit: 60, maxNumber: 1,
      depLocalDate: '2026-09-07',
    }),
    /^Row 1: Pilot aged 58 on flight 605 \(2026-09-07\) carrying 2 crew aged 60\+ \(limit 1\)\.$/,
  )
})

test('toTsv for 8030 includes flt_id before pairing_id', async () => {
  const { toTsv } = await import('../check-8030-age.mjs')
  const tsv = toTsv([
    {
      flt_id: 500,
      pairing_id: 10,
      start_date: '2026-06-10',
      crew_id: 'P1',
      division: 'P',
      birth_date: '1980-01-01',
    },
    {
      flt_id: 500,
      pairing_id: 20,
      start_date: '2026-06-10',
      crew_id: 'P2',
      division: 'P',
      birth_date: '1985-01-01',
    },
  ])
  assert.equal(
    tsv.trim(),
    '500\t10\t2026-06-10\tP1\tP\t1980-01-01\n500\t20\t2026-06-10\tP2\tP\t1985-01-01',
  )
})

const HDR7506 = ['Bases', 'Ranks', 'Fleets', 'Crew Teams', 'Assignments']

/** SIM + FLY check-ins on the same UTC calendar day (offset 0 → same local day). */
function checkinsSimFlySameDay() {
  const simStart = Date.parse('2026-07-14T10:00:00Z') / 1000
  const flyStart = Date.parse('2026-07-14T17:27:00Z') / 1000
  return [
    { crew_id: '379', pairing_id: 0, duty: 'SIM', start_secs: simStart, end_secs: simStart + 6 * 3600 },
    { crew_id: '379', pairing_id: 13824, duty: 'FLY', start_secs: flyStart, end_secs: flyStart + 3600 },
  ]
}

test('rule7506 fires when Assignments=FLY|SIM and both check in on the same local day', async () => {
  const source = {
    async crewOffsets() { return new Map([['379', 0]]) },
    async crewBaseTimezone() { return new Map([['379', 'UTC']]) },
    async checkins() { return checkinsSimFlySameDay() },
  }
  const ctx = {
    log: () => {},
    instancesOf: (fn) => fn === 7506
      ? [{ instance: '001', header: HDR7506, rows: [['*', '*', '*', '*', 'FLY|SIM']] }]
      : [],
  }
  const out = await rule7506(source, ctx)
  assert.equal(out.length, 1, 'SIM+FLY same local day must violate under FLY|SIM')
  assert.equal(out[0].rule_code, '7506')
  assert.equal(out[0].rule_instance, '001')
  assert.equal(out[0].pairing_id, 13824)
  assert.equal(out[0].message, 'Row 1: Multiple check-ins per day (2026-07-14).')
})

test('rule7506 ignores SIM when Assignments=FLY only', async () => {
  const source = {
    async crewOffsets() { return new Map([['379', 0]]) },
    async crewBaseTimezone() { return new Map([['379', 'UTC']]) },
    async checkins() { return checkinsSimFlySameDay() },
  }
  const ctx = {
    log: () => {},
    instancesOf: (fn) => fn === 7506
      ? [{ instance: '001', header: HDR7506, rows: [['*', '*', '*', '*', 'FLY']] }]
      : [],
  }
  const out = await rule7506(source, ctx)
  assert.equal(out.length, 0, 'SIM must not count when Assignments is FLY-only')
})

test('rule7506 message uses crew-base local YYYY-MM-DD', async () => {
  // YVR PDT (−420): local Jul 14 10:00 / 17:27 → UTC Jul 14 17:00 / Jul 15 00:27
  const simStart = Date.parse('2026-07-14T17:00:00Z') / 1000
  const flyStart = Date.parse('2026-07-15T00:27:00Z') / 1000
  const source = {
    async crewOffsets() { return new Map([['379', -420]]) },
    async crewBaseTimezone() { return new Map([['379', 'America/Vancouver']]) },
    async checkins() {
      return [
        { crew_id: '379', pairing_id: 0, duty: 'SIM', start_secs: simStart, end_secs: simStart + 6 * 3600 },
        { crew_id: '379', pairing_id: 13824, duty: 'FLY', start_secs: flyStart, end_secs: flyStart + 3600 },
      ]
    },
  }
  const ctx = {
    log: () => {},
    instancesOf: (fn) => fn === 7506
      ? [{ instance: '001', header: HDR7506, rows: [['*', '*', '*', '*', 'FLY|SIM']] }]
      : [],
  }
  const out = await rule7506(source, ctx)
  assert.equal(out.length, 1)
  assert.equal(out[0].message, 'Row 1: Multiple check-ins per day (2026-07-14).')
})

test('rule7506 skips missing Assignments before querying source', async () => {
  const calls = []
  const source = {
    async crewOffsets() { calls.push('crewOffsets'); return new Map() },
    async crewBaseTimezone() { calls.push('crewBaseTimezone'); return new Map() },
    async checkins() { calls.push('checkins'); return [] },
  }
  const logs = []
  const out = await rule7506(source, {
    instancesOf: (fn) => fn === 7506
      ? [{ instance: '001', header: HDR7506, rows: [['*', '*', '*', '*', '']] }]
      : [],
    log: (m) => logs.push(m),
  })
  assert.deepEqual(out, [])
  assert.deepEqual(calls, [])
  assert.ok(logs.some((m) => m.includes('missing Assignments')))
})

test('rule7506 skips one malformed instance but still evaluates a valid instance', async () => {
  const source = {
    async crewOffsets() { return new Map([['379', 0]]) },
    async crewBaseTimezone() { return new Map([['379', 'UTC']]) },
    async checkins() { return checkinsSimFlySameDay() },
  }
  const logs = []
  const out = await rule7506(source, {
    instancesOf: (fn) => fn === 7506
      ? [
          { instance: 'bad', header: HDR7506, rows: [['*', '*', '*', '*', '']] },
          { instance: 'good', header: HDR7506, rows: [['*', '*', '*', '*', 'FLY|SIM']] },
        ]
      : [],
    log: (m) => logs.push(m),
  })
  assert.equal(out.length, 1)
  assert.equal(out[0].rule_instance, 'good')
  assert.ok(logs.some((m) => m.includes('skip 7506/bad: missing Assignments')))
})

test('rule7501 skips when 2014 Local Night is missing before querying source', async () => {
  const calls = []
  const source = {
    async crewOffsets() { calls.push('crewOffsets'); return new Map() },
    async crewBaseTimezone() { calls.push('crewBaseTimezone'); return new Map() },
    async flyDuties() { calls.push('flyDuties'); return [] },
    async groundWork() { calls.push('groundWork'); return [] },
  }
  const logs = []
  const out = await rule7501(source, {
    ...CTX_DATES,
    instancesOf: (fn) => fn === 7501
      ? [{ instance: '004', header: ['Period', 'Unit', 'Duty End Buffer', 'Min Limits'], rows: [['168', 'RH', '00:30', '1']] }]
      : [],
    log: (m) => logs.push(m),
  })
  assert.deepEqual(out, [])
  assert.deepEqual(calls, [])
  assert.ok(logs.some((m) => m.includes('2014 Local Night definition missing')))
})

test('rule7501 skips missing Period/Unit/Duty End Buffer/Min Limits before querying source', async () => {
  const calls = []
  const source = {
    async crewOffsets() { calls.push('crewOffsets'); return new Map() },
    async crewBaseTimezone() { calls.push('crewBaseTimezone'); return new Map() },
    async flyDuties() { calls.push('flyDuties'); return [] },
    async groundWork() { calls.push('groundWork'); return [] },
  }
  const logs = []
  const out = await rule7501(source, {
    ...CTX_DATES,
    instancesOf: (fn) => {
      if (fn === 2014) return [{ instance: '014', header: ['Night Start', 'Night End', 'Min Rest'], rows: [['02:00', '05:59', '04:00']] }]
      if (fn === 7501) return [{ instance: '004', header: ['Period', 'Unit', 'Duty End Buffer', 'Min Limits'], rows: [['', 'RH', '00:30', '1']] }]
      return []
    },
    log: (m) => logs.push(m),
  })
  assert.deepEqual(out, [])
  assert.deepEqual(calls, [])
  assert.ok(logs.some((m) => m.includes('missing Period/Unit/Duty End Buffer/Min Limits')))
})

test('rule7501 maps structured row ids back to the matching instance', async () => {
  const S = Math.floor(Date.UTC(2026, 5, 10, 0, 0, 0) / 1000)
  let captured = null
  const source = {
    async crewOffsets() { return new Map([['C1', 0]]) },
    async crewBaseTimezone() { return new Map([['C1', 'UTC']]) },
    async flyDuties() {
      return [{ crew_id: 'C1', pairing_id: 100, start_secs: S, end_secs: S + 3600 }]
    },
    async groundWork() { return [] },
  }
  const out = await rule7501(source, {
    ...CTX_DATES,
    instancesOf: (fn) => {
      if (fn === 2014) return [{ instance: '014', header: ['Night Start', 'Night End', 'Min Rest'], rows: [['22:00', '06:00', '08:00']] }]
      if (fn === 7501) return [
        { instance: '004', header: ['Period', 'Unit', 'Duty End Buffer', 'Min Limits'], rows: [['168', 'RH', '00:00', '3']] },
        { instance: '005', header: ['Period', 'Unit', 'Duty End Buffer', 'Min Limits'], rows: [['168', 'RH', '00:00', '4']] },
      ]
      return []
    },
    log: () => {},
    runBin(bin, args, input) {
      captured = { bin, args, input }
      return [['1', 'C1', String(S), String(S + 168 * 3600), '1', '4', '168', 'RH', '100']]
    },
  })
  assert.equal(captured.bin, 'check-7501')
  assert.deepEqual(captured.args.slice(0, 1), ['--emit-tsv'])
  assert.ok(captured.input.includes('R\t0\t*\t*\t*\t*\t168\tRH\t0\t3'), captured.input)
  assert.ok(captured.input.includes('R\t1\t*\t*\t*\t*\t168\tRH\t0\t4'), captured.input)
  assert.equal(out.length, 1)
  assert.equal(out[0].rule_instance, '005')
  assert.equal(out[0].limit_value, 4)
})

test('rule7501 forwards ctx.focusIntervals to check-7501 args', async () => {
  const S = Math.floor(Date.UTC(2026, 5, 10, 0, 0, 0) / 1000)
  let captured = null
  const source = {
    async crewOffsets() { return new Map([['C1', 0]]) },
    async crewBaseTimezone() { return new Map([['C1', 'UTC']]) },
    async flyDuties() {
      return [{ crew_id: 'C1', pairing_id: 100, start_secs: S, end_secs: S + 3600 }]
    },
    async groundWork() { return [] },
  }
  await rule7501(source, {
    ...CTX_DATES,
    focusIntervals: [{ startSecs: 100, endSecs: 200 }],
    focusCrewIds: ['C1', 'C2'],
    instancesOf: (fn) => {
      if (fn === 2014) return [{ instance: '014', header: ['Night Start', 'Night End', 'Min Rest'], rows: [['22:00', '06:00', '08:00']] }]
      if (fn === 7501) return [{ instance: '004', header: ['Period', 'Unit', 'Duty End Buffer', 'Min Limits'], rows: [['168', 'RH', '00:00', '3']] }]
      return []
    },
    log: () => {},
    runBin(bin, args) {
      captured = { bin, args }
      return []
    },
  })
  assert.equal(captured.bin, 'check-7501')
  const i = captured.args.indexOf('--focus-start-secs')
  assert.ok(i >= 0)
  assert.equal(captured.args[i + 1], '100')
  assert.equal(captured.args[i + 2], '--focus-end-secs')
  assert.equal(captured.args[i + 3], '200')
  const crewIdx = captured.args.indexOf('--focus-crew-ids')
  assert.ok(crewIdx >= 0)
  assert.equal(captured.args[crewIdx + 1], 'C1,C2')
})

test('rule7508 uses duty-level rows and persists the configured instance', async () => {
  const start = epoch('2026-06-10T00:00:00Z')
  let captured = null
  const source = {
    async crewOffsets() { return new Map([['C1', -420]]) },
    async crewBaseTimezone() { return new Map([['C1', 'America/Vancouver']]) },
    async flyDuties(byDutySeq) {
      assert.equal(byDutySeq, true)
      return [
        {
          crew_id: 'C1',
          pairing_id: 100,
          start_secs: start + 6 * 3600,
          end_secs: start + 12 * 3600,
          first_flight_departure_secs: start + 7 * 3600,
          last_flight_arrival_secs: start + 11 * 3600,
          offset_min: -420,
          end_offset_min: -420,
          is_pre_assigned: true,
        },
      ]
    },
    async groundWork(includeRest) {
      assert.equal(includeRest, true)
      return [{
        crew_id: 'C1',
        pairing_id: 0,
        start_secs: start + 24 * 3600,
        end_secs: start + 48 * 3600,
        first_flight_departure_secs: start + 24 * 3600,
        last_flight_arrival_secs: start + 48 * 3600,
        offset_min: -420,
        end_offset_min: -420,
        is_rest: true,
        is_pre_assigned: true,
      }]
    },
  }
  const out = await rule7508(source, {
    ...CTX_DATES,
    instancesOf: (fn) => {
      if (fn === 2014) {
        return [{ instance: '001', header: ['Local Night Start', 'Local Night End', 'Min Interval Hours'], rows: [['22:30', '09:30', '09:00']] }]
      }
      if (fn === 7508) {
        return [{ instance: '001', header: ['Bases', 'Ranks', 'Fleets', 'Crew Teams', 'Period', 'Unit', 'Duty Report', 'Duty Release', 'Duty End Buffer', 'Min Limits'], rows: [['*', '*', '*', '*', '168', 'RH', 'N', 'Y', '01:30', '1']] }]
      }
      return []
    },
    log: () => {},
    runBin(bin, args, input) {
      captured = { bin, args, input }
      return [['0', 'C1', String(start), String(start + 7 * 86400), '0', '1', '168', 'RH', '100']]
    },
  })

  assert.equal(captured.bin, 'check-7508')
  assert.ok(captured.args.includes('--checked-start-secs'))
  assert.ok(captured.input.includes(`R\t0\t*\t*\t*\t*\t168\tRH\tN\tY\t90\t1`))
  assert.ok(captured.input.includes(`D\tC1\t100\t${start + 6 * 3600}\t${start + 12 * 3600}\t${start + 7 * 3600}\t${start + 11 * 3600}\t-420\t-420\t-420\t0\t1`))
  assert.ok(captured.input.includes(`D\tC1\t0\t${start + 24 * 3600}\t${start + 48 * 3600}\t${start + 24 * 3600}\t${start + 48 * 3600}\t-420\t-420\t-420\t1\t1`))
  assert.equal(out[0].rule_code, '7508')
  assert.equal(out[0].rule_instance, '001')
  assert.equal(out[0].limit_value, 1)
})

test('rule7508 defaults missing Duty Report and Duty Release to Y', async () => {
  const start = epoch('2026-06-10T00:00:00Z')
  let captured = null
  const source = {
    async crewOffsets() { return new Map([['C1', -420]]) },
    async flyDuties() {
      return [{
        crew_id: 'C1',
        pairing_id: 100,
        start_secs: start + 6 * 3600,
        end_secs: start + 12 * 3600,
        first_flight_departure_secs: start + 7 * 3600,
        last_flight_arrival_secs: start + 11 * 3600,
        offset_min: -420,
        end_offset_min: -420,
      }]
    },
    async groundWork() { return [] },
  }
  await rule7508(source, {
    ...CTX_DATES,
    instancesOf: (fn) => {
      if (fn === 2014) return [{ instance: '001', header: ['Local Night Start', 'Local Night End', 'Min Interval Hours'], rows: [['22:30', '09:30', '09:00']] }]
      if (fn === 7508) return [{ instance: '001', header: ['Period', 'Unit', 'Duty End Buffer', 'Min Limits'], rows: [['168', 'RH', '00:00', '1']] }]
      return []
    },
    log: () => {},
    runBin(bin, args, input) {
      captured = input
      return []
    },
  })

  assert.ok(captured.includes('R\t0\t*\t*\t*\t*\t168\tRH\tY\tY\t0\t1'))
})

test('rule7503 skips when 2014 Local Night is missing before querying source', async () => {
  const calls = []
  const source = {
    async crewOffsets() { calls.push('crewOffsets'); return new Map() },
    async flyDuties() { calls.push('flyDuties'); return [] },
    async groundWork() { calls.push('groundWork'); return [] },
  }
  const logs = []
  const out = await rule7503(source, {
    instancesOf: (fn) => fn === 7503
      ? [{ instance: '003', header: ['WOCL Start', 'WOCL End', 'Max Consecutive WOCLs'], rows: [['02:00', '05:59', '2']] }]
      : [],
    log: (m) => logs.push(m),
  })
  assert.deepEqual(out, [])
  assert.deepEqual(calls, [])
  assert.ok(logs.some((m) => m.includes('2014 Local Night definition missing')))
})

test('rule7503 skips missing Max Consecutive WOCLs before querying source', async () => {
  const calls = []
  const source = {
    async crewOffsets() { calls.push('crewOffsets'); return new Map() },
    async flyDuties() { calls.push('flyDuties'); return [] },
    async groundWork() { calls.push('groundWork'); return [] },
  }
  const logs = []
  const out = await rule7503(source, {
    instancesOf: (fn) => {
      if (fn === 2014) return [{ instance: '014', header: ['Night Start', 'Night End', 'Min Rest'], rows: [['02:00', '05:59', '04:00']] }]
      if (fn === 7503) return [{ instance: '003', header: ['WOCL Start', 'WOCL End', 'Max Consecutive WOCLs'], rows: [['02:00', '05:59', '']] }]
      return []
    },
    log: (m) => logs.push(m),
  })
  assert.deepEqual(out, [])
  assert.deepEqual(calls, [])
  assert.ok(logs.some((m) => m.includes('missing Max Consecutive WOCLs')))
})

test('rule7503 forwards every parameter in structured R/D/Q/T input for multiple rows', async () => {
  const captured = []
  const source = {
    async crewOffsets() { return new Map([['C1', -360]]) },
    async flyDuties() {
      return [
        { crew_id: 'C1', pairing_id: 101, start_secs: epoch('2026-06-01T03:00:00Z'), end_secs: epoch('2026-06-01T05:00:00Z') },
        { crew_id: 'C1', pairing_id: 202, start_secs: epoch('2026-06-02T03:00:00Z'), end_secs: epoch('2026-06-02T05:00:00Z') },
      ]
    },
    async groundWork() { return [] },
    async crewQualEntries() {
      return [
        { crew_id: 'C1', dim: 'B', value: 'YVR', eff: '2026-01-01', exp: '2026-12-31' },
        { crew_id: 'C1', dim: 'R', value: 'CA', eff: '2026-01-01', exp: '2026-12-31' },
        { crew_id: 'C1', dim: 'F', value: '737', eff: '2026-01-01', exp: '2026-12-31' },
      ]
    },
    async crewTeams() { return new Map([['C1', ['TEAM1']]]) },
  }
  const out = await rule7503(source, {
    ...CTX_DATES,
    log: () => {},
    runBin(bin, args, input) {
      captured.push({ bin, args, input })
      return []
    },
    instancesOf: (fn) => fn === 2014
      ? [{ instance: '014', header: ['Local Night Start', 'Local Night End', 'Min Interval Hours'], rows: [['22:00', '08:00', '08:00']] }]
      : fn === 7503
        ? [{
            instance: '001',
            header: HDR7503_FULL,
            rows: [
              ['YVR', 'CA', '737', 'TEAM1', '02:00', '05:59', '2'],
              ['*', '*', '*', '*', '01:00', '04:59', '3'],
            ],
          }]
        : [],
  })

  assert.deepEqual(out, [])
  assert.equal(captured.length, 2, 'each parameter row keeps independent output metadata')
  assert.equal(captured[0].bin, 'check-7503')
  assert.deepEqual(captured[0].args, [
    '--emit-tsv',
    '--wocl-start-min', '120',
    '--wocl-end-min', '359',
    '--max-consecutive', '2',
    '--night-start-min', '1320',
    '--night-end-min', '480',
    '--min-rest-min', '480',
  ])
  assert.match(captured[0].input, /^R\tYVR\tCA\t737\tTEAM1\t120\t359\t2$/m)
  assert.match(captured[0].input, /^Q\tC1\tBASE\tYVR\t20454\t20818$/m)
  assert.match(captured[0].input, /^Q\tC1\tRANK\tCA\t20454\t20818$/m)
  assert.match(captured[0].input, /^Q\tC1\tFLEET\t737\t20454\t20818$/m)
  assert.match(captured[0].input, /^T\tC1\tTEAM1$/m)
  assert.match(captured[0].input, /^D\tC1\t101\t/m)
})

test('rule7503 skips a non-wildcard Crew Teams row when the team source is unavailable', async () => {
  const calls = []
  const logs = []
  const source = {
    async crewOffsets() { calls.push('crewOffsets'); return new Map() },
    async flyDuties() { calls.push('flyDuties'); return [] },
    async groundWork() { calls.push('groundWork'); return [] },
  }
  const out = await rule7503(source, {
    log: (message) => logs.push(message),
    runBin() { calls.push('runBin'); return [] },
    instancesOf: (fn) => fn === 2014
      ? [{ instance: '014', header: ['Local Night Start', 'Local Night End', 'Min Interval Hours'], rows: [['22:00', '08:00', '08:00']] }]
      : fn === 7503
        ? [{ instance: '001', header: HDR7503_FULL, rows: [['*', '*', '*', 'TEAM1', '02:00', '05:59', '2']] }]
        : [],
  })

  assert.deepEqual(out, [])
  assert.deepEqual(calls, [])
  assert.ok(logs.some((message) => /skip 7503\/001.*Crew Teams=TEAM1.*crew-team data/i.test(message)), logs.join('\n'))
})

test('rule7503 uses the formal Crew Teams header and does not accept Teams as a scope alias', async () => {
  const captured = []
  const source = {
    async crewOffsets() { return new Map([['C1', 0]]) },
    async flyDuties() { return [] },
    async groundWork() { return [] },
  }
  await rule7503(source, {
    log: () => {},
    runBin(bin, args, input) {
      captured.push({ bin, args, input })
      return []
    },
    instancesOf: (fn) => fn === 2014
      ? [{ instance: '014', header: ['Local Night Start', 'Local Night End', 'Min Interval Hours'], rows: [['22:00', '08:00', '08:00']] }]
      : fn === 7503
        ? [{ instance: '001', header: ['Bases', 'Ranks', 'Fleets', 'Teams', 'WOCL Start', 'WOCL End', 'Max Consecutive WOCLs'], rows: [['*', '*', '*', 'TEAM1', '02:00', '05:59', '2']] }]
        : [],
  })

  assert.equal(captured.length, 1)
  assert.match(captured[0].input, /^R\t\*\t\*\t\*\t\*\t120\t359\t2$/m)
})

test('rule7506 forwards all scope and assignment parameters in structured R/D/Q/T input', async () => {
  const captured = []
  const start = epoch('2026-07-14T10:00:00Z')
  const source = {
    async crewOffsets() { return new Map([['C1', 0]]) },
    async crewBaseTimezone() { return new Map([['C1', 'UTC']]) },
    async checkins() {
      return [
        { crew_id: 'C1', pairing_id: 0, duty: 'SIM', start_secs: start, end_secs: start + 3600 },
        { crew_id: 'C1', pairing_id: 101, duty: 'FLY', start_secs: start + 7 * 3600, end_secs: start + 8 * 3600 },
      ]
    },
    async crewQualEntries() {
      return [
        { crew_id: 'C1', dim: 'B', value: 'YVR', eff: '2026-01-01', exp: '2026-12-31' },
        { crew_id: 'C1', dim: 'R', value: 'CA', eff: '2026-01-01', exp: '2026-12-31' },
        { crew_id: 'C1', dim: 'F', value: '737', eff: '2026-01-01', exp: '2026-12-31' },
      ]
    },
    async crewTeams() { return new Map([['C1', ['TEAM1']]]) },
  }
  const dayStart = start - ((start % (24 * 3600)) + (24 * 3600)) % (24 * 3600)
  const out = await rule7506(source, {
    ...CTX_DATES,
    log: () => {},
    runBin(bin, args, input) {
      captured.push({ bin, args, input })
      return [['C1', String(dayStart), String(start), String(start + 8 * 3600), 'FLY|SIM']]
    },
    instancesOf: (fn) => fn === 7506
      ? [{
          instance: '001',
          header: ['Bases', 'Ranks', 'Fleets', 'Crew Teams', 'Assignments'],
          rows: [['YVR', 'CA', '737', 'TEAM1', 'FLY|SIM'], ['*', '*', '*', '*', 'FLY']],
        }]
      : [],
  })

  assert.equal(captured.length, 2)
  assert.match(captured[0].input, /^R\tYVR\tCA\t737\tTEAM1\tFLY\|SIM$/m)
  assert.match(captured[0].input, /^D\tC1\tSIM\t/m)
  assert.match(captured[0].input, /^D\tC1\tFLY\t/m)
  assert.match(captured[0].input, /^Q\tC1\tBASE\tYVR\t20454\t20818$/m)
  assert.match(captured[0].input, /^T\tC1\tTEAM1$/m)
  assert.match(captured[1].input, /^R\t\*\t\*\t\*\t\*\tFLY$/m)
  assert.equal(out.length, 2)
})

test('rule7506 skips a non-wildcard qualification row when the qualification source is unavailable', async () => {
  const calls = []
  const logs = []
  const source = {
    async crewOffsets() { calls.push('crewOffsets'); return new Map() },
    async checkins() { calls.push('checkins'); return [] },
  }
  const out = await rule7506(source, {
    log: (message) => logs.push(message),
    runBin() { calls.push('runBin'); return [] },
    instancesOf: (fn) => fn === 7506
      ? [{ instance: '001', header: ['Bases', 'Ranks', 'Fleets', 'Crew Teams', 'Assignments'], rows: [['YVR', '*', '*', '*', 'FLY']] }]
      : [],
  })

  assert.deepEqual(out, [])
  assert.deepEqual(calls, [])
  assert.ok(logs.some((message) => /skip 7506\/001.*qualification filters.*no crew qualification data/i.test(message)), logs.join('\n'))
})

test('rule7505 skips missing Min DO/RP Days Range before querying source', async () => {
  const calls = []
  const source = {
    async crewOffsets() { calls.push('crewOffsets'); return new Map() },
    async assignmentsAll() { calls.push('assignmentsAll'); return [] },
  }
  const logs = []
  const out = await rule7505(source, {
    ...CTX_DATES,
    instancesOf: (fn) => fn === 7505
      ? [{ instance: '002', header: ['Min DO', 'Period', 'Unit'], rows: [['7', '1', 'RP']] }]
      : [],
    log: (m) => logs.push(m),
  })
  assert.deepEqual(out, [])
  assert.deepEqual(calls, [])
  assert.ok(logs.some((m) => m.includes('missing Min DO / RP Days Range')))
})

test('rule7505 emits structured scope rows for check-7505', async () => {
  let captured
  const source = {
    async crewOffsets() { return new Map([['C1', -360]]) },
    async crewQualEntries() {
      return [
        { crew_id: 'C1', dim: 'B', value: 'YYZ', eff: '2026-01-01', exp: '2026-12-31' },
        { crew_id: 'C1', dim: 'R', value: 'CA', eff: '2026-01-01', exp: '2026-12-31' },
        { crew_id: 'C1', dim: 'F', value: '737', eff: '2026-01-01', exp: '2026-12-31' },
      ]
    },
    async crewTeams() { return new Map([['C1', ['TEAM1']]]) },
    async assignmentsAll() {
      return [{
        crew_id: 'C1',
        pairing_id: 101,
        code: 'FLY',
        s: epoch('2026-06-01T06:00:00Z'),
        e: epoch('2026-07-01T06:00:00Z'),
        end_rest_secs: epoch('2026-07-01T06:00:00Z'),
      }]
    },
  }

  await rule7505(source, {
    ...CTX_DATES,
    instancesOf: (fn) => fn === 7505
      ? [{ instance: '002', header: HDR7505, rows: [['YYZ', 'CA', '737', 'TEAM1', 'DO', '7', '1', 'RP', '30-30', 'N', 'N', 'N', '*', '0-0']] }]
      : [],
    log: () => {},
    runBin(bin, args, tsv) {
      captured = { bin, args, tsv }
      return []
    },
  })

  assert.equal(captured.bin, 'check-7505')
  assert.ok(captured.args.includes('--do-start-min'))
  assert.equal(captured.args[captured.args.indexOf('--do-start-min') + 1], '0')
  assert.match(captured.tsv, /^R\tYYZ\tCA\t737\tTEAM1\t7\t30\t30\t0\t0\tDO\t\t0\t0\t1\tRP\t0$/m)
  assert.match(captured.tsv, /^Q\tC1\tB\tYYZ\t20454\t20818$/m)
  assert.match(captured.tsv, /^Q\tC1\tR\tCA\t20454\t20818$/m)
  assert.match(captured.tsv, /^Q\tC1\tF\t737\t20454\t20818$/m)
  assert.match(captured.tsv, /^T\tC1\tTEAM1$/m)
  assert.match(captured.tsv, /^A\tC1\tFLY\t\d+\t\d+\t\d+\t101$/m)
})

test('rule7505 uses ctx.rpFrom/rpTo when preview supplies Gantt RP bounds', async () => {
  let capturedArgs
  const source = {
    async crewOffsets() { return new Map([['C1', -360]]) },
    async assignmentsAll() {
      return [{
        crew_id: 'C1',
        pairing_id: 101,
        code: 'FLY',
        s: epoch('2026-07-02T12:00:00Z'),
        e: epoch('2026-07-02T18:00:00Z'),
        end_rest_secs: epoch('2026-07-02T18:00:00Z'),
      }]
    },
  }

  await rule7505(source, {
    dateFrom: '2025-07-02',
    dateTo: '2026-08-02',
    rpFrom: '2026-07-01',
    rpTo: '2026-07-31',
    instancesOf: (fn) => fn === 7505
      ? [{ instance: '001', header: HDR7505, rows: [['*', '*', '*', '*', 'DO', '13', '1', 'RP', '31-31', 'N', 'N', 'N', '*', '0-0']] }]
      : [],
    log: () => {},
    runBin(_bin, args) {
      capturedArgs = args
      return []
    },
  })

  // 31-day July RP at YYC offset -360 → not the padded ~396-day preview window.
  const rpStart = Number(capturedArgs[capturedArgs.indexOf('--rp-start') + 1])
  const rpEnd = Number(capturedArgs[capturedArgs.indexOf('--rp-end') + 1])
  const rpDays = Math.ceil((rpEnd - rpStart) / 86_400)
  assert.equal(rpDays, 31)
})

test('rule7505 evaluates each calendar month when the check window is padded', async () => {
  const rpDayCounts = []
  const source = {
    async crewOffsets() { return new Map([['C1', -360]]) },
    async assignmentsAll() {
      return [
        {
          crew_id: 'C1',
          pairing_id: 101,
          code: 'FLY',
          s: epoch('2026-06-15T12:00:00Z'),
          e: epoch('2026-06-15T18:00:00Z'),
          end_rest_secs: epoch('2026-06-15T18:00:00Z'),
        },
        {
          crew_id: 'C1',
          pairing_id: 102,
          code: 'FLY',
          s: epoch('2026-07-02T12:00:00Z'),
          e: epoch('2026-07-02T18:00:00Z'),
          end_rest_secs: epoch('2026-07-02T18:00:00Z'),
        },
        {
          crew_id: 'C1',
          pairing_id: 103,
          code: 'FLY',
          s: epoch('2026-08-10T12:00:00Z'),
          e: epoch('2026-08-10T18:00:00Z'),
          end_rest_secs: epoch('2026-08-10T18:00:00Z'),
        },
      ]
    },
  }

  await rule7505(source, {
    dateFrom: '2026-06-29',
    dateTo: '2026-08-01',
    instancesOf: (fn) => fn === 7505
      ? [{ instance: '001', header: HDR7505, rows: [['*', '*', '*', '*', 'DO', '13', '1', 'RP', '31-31', 'N', 'N', 'N', '*', '0-0']] }]
      : [],
    log: () => {},
    runBin(_bin, args) {
      const rpStart = Number(args[args.indexOf('--rp-start') + 1])
      const rpEnd = Number(args[args.indexOf('--rp-end') + 1])
      rpDayCounts.push(Math.ceil((rpEnd - rpStart) / 86_400))
      return []
    },
  })

  assert.deepEqual(rpDayCounts, [30, 31, 31])
})

test('rule7505 applies non-wildcard Crew Teams rows to matching crew', async () => {
  const source = {
    async crewOffsets() { return new Map([['C1', -360]]) },
    async crewTeams() { return new Map([['C1', ['TEAM1']]]) },
    async assignmentsAll() {
      return [{
        crew_id: 'C1',
        pairing_id: 101,
        code: 'FLY',
        s: epoch('2026-06-01T06:00:00Z'),
        e: epoch('2026-07-01T06:00:00Z'),
        end_rest_secs: epoch('2026-07-01T06:00:00Z'),
      }]
    },
  }

  const out = await rule7505(source, {
    ...CTX_DATES,
    instancesOf: (fn) => fn === 7505
      ? [{ instance: '002', header: HDR7505, rows: [['*', '*', '*', 'TEAM1', 'DO', '7', '1', 'RP', '30-30', 'N', 'N', 'N', '*', '0-0']] }]
      : [],
    log: () => {},
  })

  assert.equal(out.length, 1)
  assert.equal(out[0].crew_id, 'C1')
  assert.equal(out[0].rule_code, '7505')
  assert.equal(out[0].scope_key, 'TEAM1|1RP')
})

test('rule7505 persists calendar window_* distinct from crew-local start/end', async () => {
  const source = {
    async crewOffsets() { return new Map([['C1', -240]]) },
    async assignmentsAll() {
      return [{
        crew_id: 'C1',
        pairing_id: 101,
        code: 'FLY',
        s: epoch('2026-06-01T12:00:00Z'),
        e: epoch('2026-06-01T18:00:00Z'),
        end_rest_secs: epoch('2026-06-01T18:00:00Z'),
      }]
    },
  }
  const out = await rule7505(source, {
    ...CTX_DATES,
    instancesOf: (fn) => fn === 7505
      ? [{ instance: '001', header: HDR7505, rows: [['*', '*', '*', '*', 'DO', '13', '1', 'RP', '30-30', 'N', 'N', 'N', '*', '0-0']] }]
      : [],
    log: () => {},
    runBin() {
      return [['C1', '1780286400', '1782878400', '3', '12', '1', 'RP']]
    },
  })
  assert.equal(out.length, 1)
  assert.equal(out[0].start_dt, '2026-06-01T04:00:00.000Z')
  assert.equal(out[0].end_dt, '2026-07-01T03:59:59.000Z')
  assert.equal(out[0].window_start_dt, '2026-06-01T00:00:00.000Z')
  assert.equal(out[0].window_end_dt, '2026-06-30T23:59:59.999Z')
})

test('rule7505 skips nonmatching Crew Teams rows', async () => {
  const source = {
    async crewOffsets() { return new Map([['C1', -360]]) },
    async crewTeams() { return new Map([['C1', ['TEAM2']]]) },
    async assignmentsAll() {
      return [{
        crew_id: 'C1',
        pairing_id: 101,
        code: 'FLY',
        s: epoch('2026-06-01T06:00:00Z'),
        e: epoch('2026-07-01T06:00:00Z'),
        end_rest_secs: epoch('2026-07-01T06:00:00Z'),
      }]
    },
  }

  const out = await rule7505(source, {
    ...CTX_DATES,
    instancesOf: (fn) => fn === 7505
      ? [{ instance: '002', header: HDR7505, rows: [['*', '*', '*', 'TEAM1', 'DO', '7', '1', 'RP', '30-30', 'N', 'N', 'N', '*', '0-0']] }]
      : [],
    log: () => {},
  })

  assert.deepEqual(out, [])
})

test('rule7505 applies Bases/Ranks/Fleets scoped rows to matching crew', async () => {
  const source = {
    async crewOffsets() { return new Map([['C1', -360]]) },
    async crewQualEntries() {
      return [
        { crew_id: 'C1', dim: 'B', value: 'YYZ' },
        { crew_id: 'C1', dim: 'R', value: 'CA' },
        { crew_id: 'C1', dim: 'F', value: '737' },
      ]
    },
    async assignmentsAll() {
      return [{
        crew_id: 'C1',
        pairing_id: 101,
        code: 'FLY',
        s: epoch('2026-06-01T06:00:00Z'),
        e: epoch('2026-07-01T06:00:00Z'),
        end_rest_secs: epoch('2026-07-01T06:00:00Z'),
      }]
    },
  }

  const out = await rule7505(source, {
    ...CTX_DATES,
    instancesOf: (fn) => fn === 7505
      ? [{ instance: '002', header: HDR7505, rows: [['YYZ', 'CA', '737', '*', 'DO', '7', '1', 'RP', '30-30', 'N', 'N', 'N', '*', '0-0']] }]
      : [],
    log: () => {},
  })

  assert.equal(out.length, 1)
  assert.equal(out[0].crew_id, 'C1')
  assert.equal(out[0].scope_key, 'YYZ|CA|737|1RP')
})

test('rule7505 skips nonmatching Bases/Ranks/Fleets scoped rows', async () => {
  const source = {
    async crewOffsets() { return new Map([['C1', -360]]) },
    async crewQualEntries() {
      return [
        { crew_id: 'C1', dim: 'B', value: 'YYZ' },
        { crew_id: 'C1', dim: 'R', value: 'FO' },
        { crew_id: 'C1', dim: 'F', value: '737' },
      ]
    },
    async assignmentsAll() {
      return [{
        crew_id: 'C1',
        pairing_id: 101,
        code: 'FLY',
        s: epoch('2026-06-01T06:00:00Z'),
        e: epoch('2026-07-01T06:00:00Z'),
        end_rest_secs: epoch('2026-07-01T06:00:00Z'),
      }]
    },
  }

  const out = await rule7505(source, {
    ...CTX_DATES,
    instancesOf: (fn) => fn === 7505
      ? [{ instance: '002', header: HDR7505, rows: [['YYZ', 'CA', '737', '*', 'DO', '7', '1', 'RP', '30-30', 'N', 'N', 'N', '*', '0-0']] }]
      : [],
    log: () => {},
  })

  assert.deepEqual(out, [])
})

test('rule7505 skips Bases/Ranks/Fleets scoped rows when source lacks crew qualification data', async () => {
  const calls = []
  const source = {
    async crewOffsets() { calls.push('crewOffsets'); return new Map([['C1', -360]]) },
    async assignmentsAll() { calls.push('assignmentsAll'); return [] },
  }
  const logs = []

  const out = await rule7505(source, {
    ...CTX_DATES,
    instancesOf: (fn) => fn === 7505
      ? [{ instance: '002', header: HDR7505, rows: [['YYZ', '*', '*', '*', 'DO', '7', '1', 'RP', '30-30', 'N', 'N', 'N', '*', '0-0']] }]
      : [],
    log: (m) => logs.push(m),
  })

  assert.deepEqual(out, [])
  assert.deepEqual(calls, [])
  assert.ok(logs.some((m) => /skip 7505\/002.*Bases\/Ranks\/Fleets.*crew qualification data/i.test(m)), logs.join('\n'))
})

test('rule7505 skips non-wildcard Crew Teams rows when source lacks crew-team data', async () => {
  const calls = []
  const source = {
    async crewOffsets() { calls.push('crewOffsets'); return new Map([['C1', -360]]) },
    async assignmentsAll() { calls.push('assignmentsAll'); return [] },
  }
  const logs = []

  const out = await rule7505(source, {
    ...CTX_DATES,
    instancesOf: (fn) => fn === 7505
      ? [{ instance: '002', header: HDR7505, rows: [['*', '*', '*', 'TEAM1', 'DO', '7', '1', 'RP', '30-30', 'N', 'N', 'N', '*', '0-0']] }]
      : [],
    log: (m) => logs.push(m),
  })

  assert.deepEqual(out, [])
  assert.deepEqual(calls, [])
  assert.ok(logs.some((m) => /skip 7505\/002.*Crew Teams=TEAM1.*crew-team data/i.test(m)), logs.join('\n'))
})

test('rule7507 emits fly/reserve filter columns for check-7507', async () => {
  let captured
  const source = {
    async crewOffsets() { return new Map([['C1', -360]]) },
    async assignmentsAll() {
      return [{
        crew_id: 'C1',
        pairing_id: 101,
        code: 'FLY',
        s: epoch('2026-06-01T06:00:00Z'),
        e: epoch('2026-07-01T06:00:00Z'),
        end_rest_secs: epoch('2026-07-01T06:00:00Z'),
      }]
    },
  }

  await rule7507(source, {
    ...CTX_DATES,
    instancesOf: (fn) => fn === 7507
      ? [{
        instance: '001',
        header: HDR7507,
        rows: [['*', '*', '*', '*', 'DO', '0', '1', 'RP', '0-31', 'Y', 'Y', 'N', '2-10', 'FLY', '0-5', 'RES|CRAM', '*', '0-31']],
      }]
      : [],
    log: () => {},
    runBin(bin, args, tsv) {
      captured = { bin, args, tsv }
      return []
    },
  })

  assert.equal(captured.bin, 'check-7507')
  assert.match(
    captured.tsv,
    /^R\t\*\t\*\t\*\t\*\t0\t0\t31\t0\t31\tDO\t\t1\t1\t1\tRP\t2\t10\tFLY\t0\t5\tRES,CRAM\t0$/m,
  )
  assert.match(captured.tsv, /^A\tC1\tFLY\t\d+\t\d+\t\d+\t101$/m)
})

test('rule7507 maps check-7507 violations to rule_code 7507', async () => {
  const source = {
    async crewOffsets() { return new Map([['C1', -360]]) },
    async assignmentsAll() {
      return [{
        crew_id: 'C1',
        pairing_id: 101,
        code: 'FLY',
        s: epoch('2026-06-01T06:00:00Z'),
        e: epoch('2026-07-01T06:00:00Z'),
        end_rest_secs: epoch('2026-07-01T06:00:00Z'),
      }]
    },
  }
  const out = await rule7507(source, {
    ...CTX_DATES,
    instancesOf: (fn) => fn === 7507
      ? [{
        instance: '001',
        header: HDR7507,
        rows: [['*', '*', '*', '*', 'DO', '0', '1', 'RP', '0-31', 'Y', 'Y', 'N', '0-31', '*', '0-31', '*', '*', '0-31']],
      }]
      : [],
    log: () => {},
    runBin() {
      return [['C1', '1748750400', '1751342400', '2', '10', '1', 'RP']]
    },
  })
  assert.equal(out.length, 1)
  assert.equal(out[0].rule_code, '7507')
  assert.equal(out[0].rule_instance, '001')
  assert.equal(out[0].actual_value, 2)
  assert.equal(out[0].limit_value, 10)
  assert.equal(out[0].window_start_dt, '2026-06-01T00:00:00.000Z')
  assert.equal(out[0].window_end_dt, '2026-06-30T23:59:59.999Z')
})

test('pickDaysOffAnchor falls back to ground rows when pairing_id is null', () => {
  const start = epoch('2026-09-01T04:00:00Z')
  const end = epoch('2026-10-01T04:00:00Z')
  const ground = {
    crew_id: '13645',
    pairing_id: null,
    code: 'CRAM',
    s: epoch('2026-09-05T07:00:00Z'),
    e: epoch('2026-09-05T19:00:00Z'),
  }
  const fly = {
    crew_id: '13645',
    pairing_id: 55,
    code: 'FLY',
    s: epoch('2026-09-10T12:00:00Z'),
    e: epoch('2026-09-10T18:00:00Z'),
  }
  assert.equal(pickDaysOffAnchor([ground], start, end), ground)
  assert.equal(pickDaysOffAnchor([ground, fly], start, end), fly)
  assert.equal(daysOffAnchorPairingId(ground), null)
  assert.equal(daysOffAnchorPairingId(fly), 55)
})

test('rule7507 still runs for CRAM-only months with pairing_id null', async () => {
  let invoked = 0
  const source = {
    async crewOffsets() { return new Map([['13645', -240]]) },
    async assignmentsAll() {
      return [{
        crew_id: '13645',
        pairing_id: null,
        code: 'CRAM',
        s: epoch('2026-09-05T07:00:00Z'),
        e: epoch('2026-09-05T19:00:00Z'),
        end_rest_secs: epoch('2026-09-05T19:00:00Z'),
      }]
    },
  }
  const out = await rule7507(source, {
    dateFrom: '2026-09-01',
    dateTo: '2026-09-30',
    rpFrom: '2026-09-01',
    rpTo: '2026-09-30',
    instancesOf: (fn) => fn === 7507
      ? [{
        instance: '001',
        header: HDR7507,
        rows: [['*', '*', '*', '*', 'DO', '10', '1', 'RP', '30-30', 'Y', 'Y', 'N', '0-0', 'FLY', '0-31', 'CRAM|CRPM', '*', '0-0']],
      }]
      : [],
    log: () => {},
    runBin() {
      invoked += 1
      return [['13645', '1756704000', '1759295999', '9', '10', '1', 'RP']]
    },
  })
  assert.equal(invoked, 1)
  assert.equal(out.length, 1)
  assert.equal(out[0].rule_code, '7507')
  assert.equal(out[0].pairing_id, null)
  assert.match(out[0].message, /days off\(9\) must be at least 10/)
})
