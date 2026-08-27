/**
 * Regression: importing live-legality.mjs as a library (preview-draft) must not
 * process.exit when argv has no --group. An unguarded RULESET_ID check used to
 * print `invalid --group: ... "undefined"` and kill the live-server process.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const liveServerRoot = path.resolve(here, '../..')

test('importing live-legality.mjs without --group does not exit the process', () => {
  const probe = `
    import { liveSource } from './scripts/live-legality.mjs'
    if (typeof liveSource !== 'function') process.exit(3)
    console.log('import-ok')
  `
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
    cwd: liveServerRoot,
    encoding: 'utf8',
    env: process.env,
  })
  assert.equal(res.status, 0, `stderr=${res.stderr}\nstdout=${res.stdout}`)
  assert.match(res.stdout, /import-ok/)
  assert.doesNotMatch(res.stderr ?? '', /invalid --group/)
})

test('CLI entry still rejects missing/invalid --group', () => {
  const script = path.join(liveServerRoot, 'scripts/live-legality.mjs')
  const res = spawnSync(process.execPath, [script, '--from', '2026-07-01', '--to', '2026-08-01'], {
    cwd: liveServerRoot,
    encoding: 'utf8',
    env: process.env,
  })
  assert.equal(res.status, 2)
  assert.match(res.stderr ?? '', /--group|invalid --group|usage:/)
})
