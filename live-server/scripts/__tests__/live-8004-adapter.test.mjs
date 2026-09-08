import test from 'node:test'
import assert from 'node:assert/strict'
import { liveSource } from '../live-legality.mjs'

function captureDb() {
  const captured = []
  return {
    captured,
    query: async (queryConfig, values) => {
      captured.push({ text: typeof queryConfig === 'string' ? queryConfig : queryConfig?.text, values })
      return { rows: [] }
    },
  }
}

test('Live 8004 adapter reads segment fleet and crew fleet qualification data', async () => {
  const db = captureDb()
  const source = liveSource(db, '2026-09-01', '2026-10-01')

  assert.equal(typeof source.fleetSegments, 'function')
  assert.equal(typeof source.fleetQuals, 'function')

  await source.fleetSegments(['1012'])
  const segments = db.captured.at(-1)
  assert.match(segments.text, /ps\.fleet_seg/)
  assert.match(segments.text, /f\.fleet/)
  assert.match(segments.text, /where rf\.is_deleted = 0/)
  assert.match(segments.text, /rf\.crew_id = any\(\$3::varchar\[\]\)/)
  assert.deepEqual(segments.values?.[2], ['1012'])

  await source.fleetQuals(['1012'])
  const quals = db.captured.at(-1)
  assert.match(quals.text, /from crew_fleet/)
  assert.match(quals.text, /fleet_specific/)
  assert.match(quals.text, /ac_type/)
  assert.match(quals.text, /fleet_grp/)
  assert.deepEqual(quals.values?.[0], ['1012'])
  assert.doesNotMatch(quals.text, /is_valid/)

  await source.baseQuals(['1012'])
  const bases = db.captured.at(-1)
  assert.match(bases.text, /from crew_base/)
  assert.doesNotMatch(bases.text, /f8\.crew_base/)
  assert.deepEqual(bases.values?.[0], ['1012'])
})
