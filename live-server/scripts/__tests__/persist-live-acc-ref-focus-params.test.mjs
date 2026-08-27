/**
 * Regression: focused live recheck (draft Save passes --focus-crew-ids) used to
 * prepend clearValues into the unnest UPDATE params while SQL only referenced
 * $2..$6 → Postgres 42P18 "could not determine data type of parameter $1".
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const source = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../live-legality.mjs'),
  'utf8',
)

test('persistLiveAccRef unnest UPDATE binds $1..$5 without unused focus clearValues', () => {
  const fnStart = source.indexOf('const persistLiveAccRef')
  assert.ok(fnStart >= 0)
  const fnEnd = source.indexOf('\nconst invalidateLivePairingCaches', fnStart)
  const body = source.slice(fnStart, fnEnd)
  assert.match(body, /\$1::varchar\[]/)
  assert.match(body, /\$2::bigint\[]/)
  assert.match(body, /\$5::integer\[]/)
  assert.doesNotMatch(body, /\$\{offset \+ 1\}/)
  assert.doesNotMatch(body, /\[\.\.\.clearValues,/)
  // Clear-phase still scopes by focus crews when provided.
  assert.match(body, /any\(\$1::varchar\[]\)/)
})
