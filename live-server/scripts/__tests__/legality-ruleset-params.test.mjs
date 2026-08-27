import test from 'node:test'
import assert from 'node:assert/strict'
import { headerIndexer, fieldRaw } from '../legality-ruleset-params.mjs'

test('headerIndexer is case-insensitive', () => {
  const H = headerIndexer(['Bases', 'Min Limits', 'Space'])
  assert.equal(H('min limits'), 1)
  assert.equal(H('SPACE'), 2)
  assert.equal(H('missing'), -1)
})

test('fieldRaw returns trimmed cell or fallback', () => {
  const header = ['Space', 'Unit']
  const row = ['14', 'RH']
  assert.equal(fieldRaw(row, header, 'Space'), '14')
  assert.equal(fieldRaw(['', 'RH'], header, 'Space', '24'), '24')
  assert.equal(fieldRaw(row, header, 'Missing', '*'), '*')
})
