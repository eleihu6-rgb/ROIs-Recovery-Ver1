import test from 'node:test'
import assert from 'node:assert/strict'
import {
  pickEffectiveCrewBase,
  crewOffsetsFromBaseMap,
  asOfDateOnly,
  buildCrewBaseTimeline,
  resolveBaseAt,
  resolveOffsetAt,
  resolveOffsetAtUtc,
  midpointDateOnly,
  offsetForDuty,
  resolveCrewOffsetOrFallback,
} from '../legality-recheck-core.mjs'

test('asOfDateOnly trims ISO to YYYY-MM-DD', () => {
  assert.equal(asOfDateOnly('2026-08-01T00:00:00.000Z'), '2026-08-01')
  assert.equal(asOfDateOnly('2026-08-01'), '2026-08-01')
})

test('pickEffectiveCrewBase prefers current YYC over future YYZ prime', () => {
  const rows = [
    {
      crew_id: '2314',
      base: 'YYZ',
      is_prime_base: 1,
      eff_dt: '2026-12-01T00:00:00.000Z',
      exp_dt: '2056-02-14T23:59:59.000Z',
    },
    {
      crew_id: '2314',
      base: 'YYC',
      is_prime_base: 1,
      eff_dt: '2024-02-12T00:00:00.000Z',
      exp_dt: '2026-11-30T23:59:59.000Z',
    },
  ]
  const baseByCrew = pickEffectiveCrewBase(rows, '2026-08-01')
  assert.equal(baseByCrew.get('2314'), 'YYC')
  assert.equal(crewOffsetsFromBaseMap(baseByCrew).get('2314'), -360)
})

test('pickEffectiveCrewBase switches to YYZ after YYC expires', () => {
  const rows = [
    {
      crew_id: '2314',
      base: 'YYZ',
      is_prime_base: 1,
      eff_dt: '2026-12-01T00:00:00.000Z',
      exp_dt: '2056-02-14T23:59:59.000Z',
    },
    {
      crew_id: '2314',
      base: 'YYC',
      is_prime_base: 1,
      eff_dt: '2024-02-12T00:00:00.000Z',
      exp_dt: '2026-11-30T23:59:59.000Z',
    },
  ]
  const baseByCrew = pickEffectiveCrewBase(rows, '2026-12-15')
  assert.equal(baseByCrew.get('2314'), 'YYZ')
  assert.equal(crewOffsetsFromBaseMap(baseByCrew).get('2314'), -240)
})

test('pickEffectiveCrewBase prefers prime among overlapping effective rows', () => {
  const rows = [
    {
      crew_id: 'C1',
      base: 'YVR',
      is_prime_base: 0,
      eff_dt: '2026-01-01',
      exp_dt: null,
    },
    {
      crew_id: 'C1',
      base: 'YYC',
      is_prime_base: 1,
      eff_dt: '2026-01-01',
      exp_dt: null,
    },
  ]
  assert.equal(pickEffectiveCrewBase(rows, '2026-08-01').get('C1'), 'YYC')
})

const crew755Rows = [
  {
    crew_id: '755',
    base: 'YYZ',
    is_prime_base: 1,
    eff_dt: '2025-11-01',
    exp_dt: '2026-06-30',
  },
  {
    crew_id: '755',
    base: 'YEG',
    is_prime_base: 1,
    eff_dt: '2026-07-01',
    exp_dt: '2043-04-04',
  },
]

test('resolveOffsetAt follows 755 YYZ→YEG switch', () => {
  const timeline = buildCrewBaseTimeline(crew755Rows)
  assert.equal(resolveBaseAt(timeline, '755', '2026-06-30'), 'YYZ')
  assert.equal(resolveOffsetAt(timeline, '755', '2026-06-30'), -240)
  assert.equal(resolveBaseAt(timeline, '755', '2026-07-01'), 'YEG')
  assert.equal(resolveOffsetAt(timeline, '755', '2026-08-15'), -360)
})

test('resolveOffsetAt keeps 2314 on YYC in August (future YYZ does not win)', () => {
  const rows = [
    {
      crew_id: '2314',
      base: 'YYZ',
      is_prime_base: 1,
      eff_dt: '2026-12-01',
      exp_dt: '2056-02-14',
    },
    {
      crew_id: '2314',
      base: 'YYC',
      is_prime_base: 1,
      eff_dt: '2024-02-12',
      exp_dt: '2026-11-30',
    },
  ]
  const timeline = buildCrewBaseTimeline(rows)
  assert.equal(resolveOffsetAt(timeline, '2314', '2026-08-01'), -360)
  assert.equal(resolveOffsetAt(timeline, '2314', '2026-12-15'), -240)
})

test('midpointDateOnly averages window dates', () => {
  assert.equal(midpointDateOnly('2026-06-01', '2026-10-31'), '2026-08-16')
})

test('midpoint fallback would be YEG for Jun–Oct window while June 15 resolve stays YYZ', () => {
  const timeline = buildCrewBaseTimeline(crew755Rows)
  const mid = midpointDateOnly('2026-06-01', '2026-10-31')
  assert.equal(resolveOffsetAt(timeline, '755', mid), -360) // Aug midpoint → YEG
  assert.equal(resolveOffsetAt(timeline, '755', '2026-06-15'), -240)
})

test('offsetForDuty treats null row offset as missing and resolves', async () => {
  const augDutyStart = Date.parse('2026-08-17T06:01:00Z') / 1000
  const timeline = buildCrewBaseTimeline(crew755Rows)
  const withResolve = {
    async resolveCrewOffset(crewId, utcSecs) {
      return resolveOffsetAtUtc(timeline, crewId, utcSecs)
    },
  }
  assert.equal(await offsetForDuty(withResolve, '755', augDutyStart, null), -360)
})

test('offsetForDuty prefers row offset then resolveCrewOffset then crewOffsets', async () => {
  const augDutyStart = Date.parse('2026-08-17T06:01:00Z') / 1000
  const timeline = buildCrewBaseTimeline(crew755Rows)
  let crewOffsetsCalls = 0

  assert.equal(await offsetForDuty({ async crewOffsets() { crewOffsetsCalls += 1; return new Map() } }, '755', augDutyStart, -420), -420)

  const withResolve = {
    async resolveCrewOffset(crewId, utcSecs) {
      return resolveOffsetAtUtc(timeline, crewId, utcSecs)
    },
    async crewOffsets() {
      crewOffsetsCalls += 1
      return new Map([['755', -240]])
    },
  }
  assert.equal(await offsetForDuty(withResolve, '755', augDutyStart, undefined), -360)
  assert.equal(crewOffsetsCalls, 0, 'resolveCrewOffset should win without calling crewOffsets')

  assert.equal(
    await offsetForDuty({ async crewOffsets() { return new Map([['755', -240]]) } }, '755', augDutyStart, undefined),
    -240,
  )
})

test('resolveCrewOffsetOrFallback uses preloaded map when resolveCrewOffset absent', async () => {
  const dayStart = Date.parse('2026-08-01T00:00:00Z') / 1000
  const timeline = buildCrewBaseTimeline(crew755Rows)
  assert.equal(
    await resolveCrewOffsetOrFallback(
      { async resolveCrewOffset(c, s) { return resolveOffsetAtUtc(timeline, c, s) } },
      '755',
      dayStart,
      new Map([['755', -240]]),
    ),
    -360,
  )
  assert.equal(
    await resolveCrewOffsetOrFallback({}, '755', dayStart, new Map([['755', -240]])),
    -240,
  )
})
