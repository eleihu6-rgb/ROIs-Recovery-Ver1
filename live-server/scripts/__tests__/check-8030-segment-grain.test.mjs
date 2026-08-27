/**
 * Rule 8030 segment-grain smoke — drives the release check-8030 binary with a
 * handcrafted TSV where two over-age pilots share the same flt_id on different
 * pairings. Does not require live-server.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BIN = path.resolve(__dirname, '../../../rule-engine-rs/target/release/check-8030')

test('check-8030 merges over-age count across pairings that share flt_id', () => {
  const tsv = [
    '500\t10\t2026-06-10\tP1\tP\t1980-01-01',
    '500\t20\t2026-06-10\tP2\tP\t1985-01-01',
    '',
  ].join('\n')
  const res = spawnSync(
    BIN,
    ['--division', 'P', '--age-limit', '35', '--max-number', '1', '--emit-tsv'],
    { input: tsv, encoding: 'utf8' },
  )
  assert.equal(res.status, 0, res.stderr || String(res.error))
  const lines = res.stdout.trim().split('\n').filter(Boolean)
  assert.equal(lines.length, 2)
  const parsed = lines.map((l) => {
    const [crewId, pairingId, flightId, ageYears, count] = l.split('\t')
    return {
      crewId,
      pairingId: Number(pairingId),
      flightId: Number(flightId),
      ageYears: Number(ageYears),
      count: Number(count),
    }
  })
  assert.ok(parsed.every((v) => v.flightId === 500 && v.count === 2))
  const byCrew = Object.fromEntries(parsed.map((v) => [v.crewId, v.pairingId]))
  assert.equal(byCrew.P1, 10)
  assert.equal(byCrew.P2, 20)
})
