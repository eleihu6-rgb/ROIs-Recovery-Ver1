import test from 'node:test'
import assert from 'node:assert/strict'
import { memoizeSource } from '../legality-recheck-core.mjs'

const makeFake = () => {
  const calls = { crewTeams: 0, crewQuals: 0 }
  const src = {
    db: { name: 'fake-db' },
    async crewTeams(flag) { calls.crewTeams++; return [{ team: 'A', flag }] },
    async crewQuals() { calls.crewQuals++; return [{ q: 1 }] },
  }
  return { src, calls }
}

test('memoizeSource: same args call the underlying accessor once and share the Promise', async () => {
  const { src, calls } = makeFake()
  const memo = memoizeSource(src)
  const [p1, p2] = [memo.crewTeams(false), memo.crewTeams(false)]
  assert.equal(calls.crewTeams, 1)
  assert.equal(p1, p2, 'callers share the exact same Promise')
  const [r1, r2] = await Promise.all([p1, p2])
  assert.equal(r1, r2, 'callers receive the exact same resolved value')
  assert.deepEqual(r1, [{ team: 'A', flag: false }])
})

test('memoizeSource: different args call the underlying accessor once each', async () => {
  const { src, calls } = makeFake()
  const memo = memoizeSource(src)
  await memo.crewTeams(false)
  await memo.crewTeams(true)
  await memo.crewTeams(false)
  assert.equal(calls.crewTeams, 2)
  assert.equal(calls.crewQuals, 0)
  await memo.crewQuals()
  await memo.crewQuals()
  assert.equal(calls.crewQuals, 1)
})

test('memoizeSource: number vs string args do not collide', async () => {
  const { src, calls } = makeFake()
  const memo = memoizeSource(src)
  await memo.crewTeams(1)
  await memo.crewTeams('1')
  assert.equal(calls.crewTeams, 2)
})

test('memoizeSource: non-function props pass through untouched', async () => {
  const { src } = makeFake()
  const memo = memoizeSource(src)
  assert.equal(memo.db, src.db)
  assert.deepEqual(memo.db, { name: 'fake-db' })
})

test('memoizeSource: a rejected Promise is evicted so a later call retries', async () => {
  let calls = 0
  const src = {
    db: null,
    async flaky() {
      calls++
      if (calls === 1) throw new Error('boom')
      return 'ok'
    },
  }
  const memo = memoizeSource(src)
  await assert.rejects(() => memo.flaky(), /boom/)
  assert.equal(await memo.flaky(), 'ok')
  assert.equal(calls, 2)
})

test('memoizeSource: resolveCrewOffset collapses same UTC day to one call', async () => {
  let calls = 0
  const dayStart = Date.parse('2026-08-17T00:00:00Z') / 1000
  const laterSameDay = dayStart + 3600 * 6
  const src = {
    db: null,
    async resolveCrewOffset(crewId, utcSecs) {
      calls++
      return utcSecs
    },
  }
  const memo = memoizeSource(src)
  await memo.resolveCrewOffset('755', dayStart)
  await memo.resolveCrewOffset('755', laterSameDay)
  assert.equal(calls, 1)
  await memo.resolveCrewOffset('755', dayStart + 86400)
  assert.equal(calls, 2)
})
