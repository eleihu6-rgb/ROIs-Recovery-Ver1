import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const liveLegalitySrc = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../live-legality.mjs'),
  'utf8',
)

test('8004 assignmentsRaw qualifies roster_flight filters after pairing_segment join', () => {
  const start = liveLegalitySrc.indexOf('async assignmentsRaw()')
  const end = liveLegalitySrc.indexOf('async baseQuals(crewIds)', start)
  const block = liveLegalitySrc.slice(start, end)
  assert.match(block, /where rf\.is_deleted=0 and rf\.sch_str_dt_utc >= \$1 and rf\.sch_str_dt_utc < \$2/)
  assert.doesNotMatch(block, /where \$\{W\}/, 'bare W would make is_deleted ambiguous with pairing_segment')
})
