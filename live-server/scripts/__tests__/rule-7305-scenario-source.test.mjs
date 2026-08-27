import test from 'node:test'
import assert from 'node:assert/strict'
import { scenarioSource } from '../scenario-legality.mjs'

test('scenario rule7305 rosterDuties uses the generated rest-end SQL fragment', async () => {
  let capturedSql = ''
  const source = scenarioSource({
    async query(sql) {
      capturedSql = sql
      return { rows: [] }
    },
  }, 123, {})

  await source.rosterDuties()

  assert.match(capturedSql, /end_rest_secs/)
  assert.doesNotMatch(capturedSql, /\$\{pairingEnd\}|pairingEnd/)
})
