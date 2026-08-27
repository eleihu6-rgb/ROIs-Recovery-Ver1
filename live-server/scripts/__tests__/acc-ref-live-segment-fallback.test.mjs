import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { buildAccRefUpdates } from '../acc-ref-tz.mjs'

const read = (name) => fs.readFileSync(path.resolve(import.meta.dirname, '..', name), 'utf8')
const readSrc = (rel) => fs.readFileSync(path.resolve(import.meta.dirname, '../..', rel), 'utf8')

test('loadAccRefRows supports live pairing_segment fallback for dep/arr airports', () => {
  const source = read('acc-ref-tz.mjs')
  assert.match(source, /livePairingSegmentTable/)
  assert.match(source, /nullif\(lps\.dep_arp/)
  assert.match(source, /nullif\(lps\.arv_arp/)
  assert.match(
    source,
    /coalesce\(nullif\(rf\.dep_arp, ''\), nullif\(ps\.dep_arp, ''\), nullif\(lps\.dep_arp, ''\)\)/,
  )
})

test('scenario preview wires livePairingSegmentTable for acc-ref', () => {
  const preview = readSrc('src/services/rule/legality-preview.ts')
  assert.match(preview, /livePairingSegmentTable:\s*`\$\{live\}\.pairing_segment`/)
  const scenario = read('scenario-legality.mjs')
  assert.match(scenario, /livePairingSegmentTable:\s*`\$\{LIVE_SCHEMA\}\.pairing_segment`/)
})

test('scenario TypeScript acc-ref service falls back to live pairing_segment', () => {
  const source = readSrc('src/services/rule-check/acc-ref-tz-service.ts')
  assert.match(source, /nullif\(lps\.dep_arp/)
  assert.match(source, /ps\.scenario_id = rf\.scenario_id/)
})

test('UTC default zones write duty_ref_tz=0; airport zones do not (7504 false-WOCL root cause)', () => {
  const params = { stayPerMin: 1440, adjustMin: 60 }
  const base = {
    crew_id: '568',
    pairing_id: 15461,
    duty_seq: 2,
    start_utc: '2026-08-08T16:55:00Z',
    end_utc: '2026-08-09T04:40:00Z',
  }
  const utc = buildAccRefUpdates(
    [{ ...base, dep_zone_id: 'UTC', arr_zone_id: 'UTC' }],
    params,
  )
  const yyz = buildAccRefUpdates(
    [{ ...base, dep_zone_id: 'America/Toronto', arr_zone_id: 'America/Toronto' }],
    params,
  )
  assert.equal(utc[0]?.duty_ref_tz, 0)
  assert.notEqual(yyz[0]?.duty_ref_tz, 0)
  assert.ok((yyz[0]?.duty_ref_tz ?? 0) < 0, 'YYZ summer offset must be west of UTC')
})
