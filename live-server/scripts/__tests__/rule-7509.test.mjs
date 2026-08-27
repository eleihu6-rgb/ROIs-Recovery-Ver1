import test from 'node:test'
import assert from 'node:assert/strict'

import { rule7509 } from '../legality-recheck-core.mjs'
import { liveSource } from '../live-legality.mjs'
import { scenarioSource } from '../scenario-legality.mjs'
import { buildSeedSource } from '../scenario-legality-source.mjs'

const HEADER = ['Crew A', 'Crew B', 'Eff Date', 'Exp Date']
const PARAM_ROW = ['A', 'B', '2026-08-01', '2026-08-31']

const baseContext = (rows = [PARAM_ROW]) => ({
  instancesOf: (fn) => fn === 7509 ? [{ instance: '001', header: HEADER, rows }] : [],
  log: () => {},
})

test('rule7509 sends normalized parameter rows and emits both affected crew members', async () => {
  let captured
  const source = {
    async avoidCoPairing(filters) {
      captured = filters
      return [
        {
          flight_id: 9001,
          flight_number: '604',
          dep_secs: 1_785_600_000,
          crew_id: 'A',
          pairing_id: 101,
          pairing_start_secs: 1_785_590_000,
          pairing_end_secs: 1_785_607_200,
          source_is_pa: false,
        },
        {
          flight_id: 9001,
          flight_number: '604',
          dep_secs: 1_785_600_000,
          crew_id: 'B',
          pairing_id: 202,
          pairing_start_secs: 1_785_590_000,
          pairing_end_secs: 1_785_607_200,
          source_is_pa: false,
        },
      ]
    },
  }
  const out = await rule7509(source, {
    ...baseContext(),
    focusPairingIds: [202],
    runBin: async (bin, args, tsv) => {
      assert.equal(bin, 'check-7509')
      assert.deepEqual(args, ['--emit-tsv'])
      assert.match(tsv, /^R\t0\tA\tB\t2026-08-01\t2026-08-31$/m)
      assert.match(tsv, /^M\t9001\tA\t101\t1785590000\t1785607200\tN$/m)
      assert.match(tsv, /^M\t9001\tB\t202\t1785590000\t1785607200\tN$/m)
      return [
        ['V', '0', 'A', 'B', '101', '9001'],
        ['V', '0', 'B', 'A', '202', '9001'],
      ]
    },
  })

  assert.deepEqual(captured, { crewIds: ['A', 'B'], focusPairingIds: [202] })
  assert.equal(out.length, 2)
  assert.equal(out[0].rule_code, '7509')
  assert.equal(out[0].rule_instance, '001')
  assert.match(out[0].scope_key, /^instance:001:row:0:pair:A-B:/)
  assert.match(out[0].message, /A.*B.*flight 604/i)
  assert.equal(out[1].crew_id, 'B')
})

test('rule7509 skips malformed rows, ignores self-pairs, and keeps row identity in diagnostics', async () => {
  const logs = []
  let sourceCalled = false
  const out = await rule7509({
    async avoidCoPairing() {
      sourceCalled = true
      return []
    },
  }, {
    ...baseContext([
      [' A ', 'A', '2026-08-01', '2026-08-31'],
      ['', 'B', '2026-08-01', '2026-08-31'],
      ['C', 'D', '2026-08-31', '2026-08-01'],
      ['E', 'F', 'not-a-date', '2026-08-31'],
    ]),
    log: (message) => logs.push(message),
  })
  assert.deepEqual(out, [])
  assert.equal(sourceCalled, false)
  assert.match(logs.join('\n'), /skip 7509\/001 row 1.*self-pair/i)
  assert.match(logs.join('\n'), /skip 7509\/001 row 2.*empty crew/i)
  assert.match(logs.join('\n'), /skip 7509\/001 row 3.*date range/i)
  assert.match(logs.join('\n'), /skip 7509\/001 row 4.*date range/i)
})

test('rule7509 scope keys keep identical rows from different instances distinct', async () => {
  const source = {
    async avoidCoPairing() {
      return [
        {
          flight_id: 9001,
          flight_number: '604',
          crew_id: 'A',
          pairing_id: 101,
          pairing_start_secs: 1_785_590_000,
          pairing_end_secs: 1_785_607_200,
          source_is_pa: false,
        },
        {
          flight_id: 9001,
          flight_number: '604',
          crew_id: 'B',
          pairing_id: 202,
          pairing_start_secs: 1_785_590_000,
          pairing_end_secs: 1_785_607_200,
          source_is_pa: false,
        },
      ]
    },
  }
  const out = await rule7509(source, {
    instancesOf: (fn) => fn === 7509
      ? [
        { instance: '001', header: HEADER, rows: [PARAM_ROW] },
        { instance: '002', header: HEADER, rows: [PARAM_ROW] },
      ]
      : [],
    log: () => {},
    runBin: async () => [
      ['V', '0', 'A', 'B', '101', '9001'],
      ['V', '0', 'B', 'A', '202', '9001'],
      ['V', '1', 'A', 'B', '101', '9001'],
      ['V', '1', 'B', 'A', '202', '9001'],
    ],
  })
  assert.equal(new Set(out.map((row) => row.scope_key)).size, 2)
})

function captureDb() {
  const captured = []
  return {
    captured,
    query: async (queryConfig, values) => {
      const text = typeof queryConfig === 'string' ? queryConfig : queryConfig?.text
      captured.push({ text, values })
      return { rows: [] }
    },
  }
}

for (const [label, createSource] of [
  ['live', (db) => liveSource(db, '2026-08-01', '2026-09-01')],
  ['scenario', (db) => scenarioSource(db, 718, { dateFrom: '2026-08-01', dateTo: '2026-08-31' })],
  ['seed', (db) => buildSeedSource(db, 0, {
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31',
    seedCrewIds: ['A'],
    seedPairingIds: [101],
  })],
]) {
  test(`${label} avoidCoPairing SQL loads report/release spans and physical-flight complements`, async () => {
    const db = captureDb()
    const source = createSource(db)
    await source.avoidCoPairing({ crewIds: ['A', 'B'], focusPairingIds: [101] })
    const call = db.captured.at(-1)
    const sql = call?.text ?? ''
    assert.match(sql, /assignment_group\s*=\s*'FLY'/i)
    assert.match(sql, /pairing_id\s+is\s+not\s+null/i)
    assert.match(sql, /flt_id/i)
    assert.match(sql, /sch_str_dt_utc|duty_.*str/i)
    assert.match(sql, /sch_end_dt_utc|duty_.*end/i)
    assert.match(sql, /member_pairings|pairing_spans/i)
    assert.match(sql, /source/i)
    assert.match(sql, /focusPairingIds|cardinality\(\$\d+::bigint\[\]\)|any\(\$\d+::bigint\[\]\)/i)
    if (label === 'scenario') {
      assert.deepEqual(call.values, [718, [101], ['A', 'B'], '2026-08-31', '2026-08-01'])
      assert.match(sql, /having[\s\S]*\$4::timestamptz[\s\S]*\$5::timestamptz/i)
    }
    if (label === 'seed') {
      const membersRaw = sql.match(/members_raw as \(([\s\S]*?)\),\s*members as/i)?.[1] ?? ''
      assert.notEqual(membersRaw, '', 'seed members_raw CTE must exist')
      assert.doesNotMatch(membersRaw, /crew_id\s*=\s*any\(\$1::varchar\[\]\)/i)
      assert.doesNotMatch(membersRaw, /pairing_id\s*=\s*any\(\$2::bigint\[\]\)/i)
    }
  })
}

test('scenario avoidCoPairing SQL includes live mate fallback', async () => {
  const db = captureDb()
  await scenarioSource(db, 718, {}).avoidCoPairing({ crewIds: ['A'], focusPairingIds: [] })
  const sql = db.captured.at(-1)?.text ?? ''
  assert.match(sql, /f8\.roster_flight/i)
  assert.match(sql, /union all/i)
  assert.match(sql, /scenario\.roster_flight/i)
  assert.match(sql, /where not exists\s*\(\s*select 1\s+from scenario_members_raw/i)
})
