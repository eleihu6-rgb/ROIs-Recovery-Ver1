import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatUserModule, resolveActorFromArgv } from '../_user-module.mjs'

test('formatUserModule: user(module)', () => {
  assert.equal(formatUserModule('tiao', 'legality_recheck'), 'tiao(legality_recheck)')
})

test('formatUserModule: empty user → system', () => {
  assert.equal(formatUserModule('', 'legality_recheck'), 'system(legality_recheck)')
  assert.equal(formatUserModule(null, 'legality_recheck'), 'system(legality_recheck)')
  assert.equal(formatUserModule(undefined, 'legality_recheck'), 'system(legality_recheck)')
})

test('formatUserModule: empty module → unknown', () => {
  assert.equal(formatUserModule('tiao', ''), 'tiao(unknown)')
})

test('formatUserModule: overflow trims user with …', () => {
  const long = 'x'.repeat(80)
  const out = formatUserModule(long, 'legality_recheck')
  assert.ok(out.length <= 50, `len=${out.length}`)
  assert.ok(out.includes('…'))
  assert.ok(out.endsWith('(legality_recheck)'))
})

test('resolveActorFromArgv: defaults to system', () => {
  delete process.env.LEGALITY_USER
  assert.equal(resolveActorFromArgv(['node', 'script.mjs']), 'system')
})

test('resolveActorFromArgv: --user wins', () => {
  delete process.env.LEGALITY_USER
  assert.equal(resolveActorFromArgv(['node', 'script.mjs', '--user', 'tiao']), 'tiao')
})

test('resolveActorFromArgv: env fallback', () => {
  process.env.LEGALITY_USER = 'env_user'
  assert.equal(resolveActorFromArgv(['node', 'script.mjs']), 'env_user')
  delete process.env.LEGALITY_USER
})
