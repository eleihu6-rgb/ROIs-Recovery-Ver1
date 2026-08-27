/**
 * Guards flyDuties loaders against regressing to bare rf.sch_* duty bounds.
 * Reads source text (no DB) — same style as assignment-overlap-rest-sql tests.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const loaders = [
  '../live-legality.mjs',
  '../scenario-legality.mjs',
  '../scenario-legality-source.mjs',
]

for (const rel of loaders) {
  test(`${path.basename(rel)} flyDuties uses duty bound helpers and duty_seq gate`, () => {
    const src = fs.readFileSync(path.join(dir, rel), 'utf8')
    assert.match(src, /dutyStartUtcExpr/)
    assert.match(src, /dutyEndUtcExpr/)
    // Must not leave the old bare aggregation as the only start/end source inside flyDuties.
    const flyIdx = src.indexOf('async flyDuties')
    assert.ok(flyIdx >= 0, 'flyDuties missing')
    const nextMethod = src.indexOf('async ', flyIdx + 1)
    const block = src.slice(flyIdx, nextMethod > flyIdx ? nextMethod : undefined)
    assert.match(block, /dutyStartUtcExpr/)
    assert.match(block, /dutyEndUtcExpr/)
    // The duty_seq gate is unconditional: it must sit on the pairing_segment join line and
    // never behind a byDutySeq ternary, or byDutySeq=false bounds bleed across sibling duties.
    assert.match(block, /left join [^\n]*pairing_segment ps[^\n]*ps\.duty_seq = rf\.duty_seq/)
    assert.doesNotMatch(block, /dutySeqJoin/)
    // Rest must start at the duty end the same join produces (end_rest_secs = end_secs + rest).
    assert.match(block, /segmentAlias:\s*'ps'/)
    assert.doesNotMatch(
      block,
      /extract\(epoch from min\(rf\.sch_str_dt_utc\)\)::bigint as start_secs/,
    )
    assert.doesNotMatch(
      block,
      /extract\(epoch from max\(rf\.sch_end_dt_utc\)\)::bigint as end_secs/,
    )
  })
}

test('scenario-legality assignmentsAll uses duty release end, not bare sch_end', async () => {
  const { scenarioSource } = await import('../scenario-legality.mjs')
  const captured = []
  const db = {
    query: async (text, values) => {
      captured.push({ text, values })
      return { rows: [] }
    },
  }
  await scenarioSource(db, 740, {}).assignmentsAll()
  const sql = captured.at(-1)?.text ?? ''
  assert.match(sql, /pairing_id/)
  assert.match(sql, /dutyEndUtcExpr|duty_act_end_dt_utc/)
  assert.match(sql, /duty_sch_end_dt_utc|debrief_end_utc/)
  assert.match(sql, /pairing_segment/)
  assert.match(sql, /f8\.pairing_segment|live fallback|lps\.duty_/) // scenario live fallback present
  // Must not be the old one-liner that only reads roster sch_end for e:
  assert.doesNotMatch(
    sql,
    /select crew_id, pairing_id, assignment as code, extract\(epoch from sch_str_dt_utc\)::bigint as s,\s*extract\(epoch from sch_end_dt_utc\)::bigint as e/i,
  )
  assert.doesNotMatch(
    sql,
    /extract\(epoch from sch_end_dt_utc\)::bigint \+ coalesce\(act_rest_min/,
  )
})

test('live-legality assignmentsAll uses duty release end', async () => {
  // Read source text of async assignmentsAll block.
  const src = fs.readFileSync(path.join(dir, '../live-legality.mjs'), 'utf8')
  const idx = src.indexOf('async assignmentsAll')
  assert.ok(idx >= 0)
  const next = src.indexOf('async ', idx + 1)
  const block = src.slice(idx, next > idx ? next : undefined)
  assert.match(block, /dutyEndUtcExpr/)
  assert.match(block, /pairing_segment/)
  assert.match(block, /duty_act_end_dt_utc|duty_sch_end_dt_utc/)
  assert.doesNotMatch(
    block,
    /extract\(epoch from sch_end_dt_utc\)::bigint as e,\s*extract\(epoch from sch_end_dt_utc\)::bigint \+ coalesce\(act_rest_min/,
  )
})

test('seed legality assignmentsAll uses live duty release end', async () => {
  const src = fs.readFileSync(path.join(dir, '../scenario-legality-source.mjs'), 'utf8')
  const idx = src.indexOf('async assignmentsAll')
  assert.ok(idx >= 0)
  const next = src.indexOf('async ', idx + 1)
  const block = src.slice(idx, next > idx ? next : undefined)
  assert.match(block, /dutyEndUtcExpr/)
  assert.match(block, /pairing_segment/)
  assert.doesNotMatch(block, /from scenario\.pairing_segment/)
})

test('scenario-legality flyDuties falls back to live pairing segments for missing scenario duties', async () => {
  const { scenarioSource } = await import('../scenario-legality.mjs')
  const captured = []
  const db = {
    query: async (text, values) => {
      captured.push({ text, values })
      return { rows: [] }
    },
  }

  await scenarioSource(db, 718, {}).flyDuties(true)

  const sql = captured.at(-1)?.text ?? ''
  assert.match(sql, /left join scenario\.pairing_segment ps/)
  assert.match(sql, /left join f8\.pairing_segment lps/)
  assert.match(sql, /not exists \(/)
  assert.match(sql, /lps\.duty_act_str_dt_utc/)
  assert.match(sql, /lps\.duty_act_end_dt_utc/)
})

test('seed legality source keeps live roster SQL free of scenario-id predicates', async () => {
  const { buildSeedSource } = await import('../scenario-legality-source.mjs')
  const captured = []
  const db = {
    query: async (text, values) => {
      captured.push({ text, values })
      return { rows: [] }
    },
  }

  await buildSeedSource(db, 718, {
    seedCrewIds: ['568'],
    seedPairingIds: [15461],
  }).flyDuties(true)

  const sql = captured.at(-1)?.text ?? ''
  assert.doesNotMatch(sql, /from scenario\.pairing_segment/)
  assert.doesNotMatch(sql, /ps\.scenario_id = \$1/)
  assert.match(sql, /from f8\.pairing_segment/)
})
