#!/usr/bin/env node
/**
 * Seed a contiguous ADD 787-family pairing ladder for the auto-assign demo.
 *
 * WHY: the 787-family crew seeded for the demo (e.g. T2004/T2005) are qualified on the
 * family code `B787`, while the real SSIM-loaded schedule flies the variants `788`/`789`.
 * After the SSIM reload there were ZERO open B787 pairings and ZERO B787 flights, so the
 * auto-assign planner had nothing to give those crew. This script builds a chain of
 * rules-aware ADD rotations from the OPEN 788/789 flights, choosing them so consecutive
 * rotations cover the month back-to-back (no idle days between pairings).
 *
 * It drives the SAME public API the Gantt "Pairing Build Automation" dialog uses
 * (POST /api/pairing/roundtrip/search then /build), so every rotation still passes the
 * service's base-loop / single-fleet / rest / block-cap validation. Nothing here
 * re-implements build rules.
 *
 * Usage (from live-server/, live-server must be running on :3000):
 *   node scripts/seed-add-b787-pairing-ladder.mjs --month=2026-09 --count=10 --dry-run
 *   node scripts/seed-add-b787-pairing-ladder.mjs --month=2026-09 --count=10
 *
 * Flags: --month=YYYY-MM (default 2026-09) --base=ADD --fleets=788,789 --count=N (default 10)
 *        --composition=CA:2,FO:2 (default = wide body default) --timezone=Africa/Addis_Ababa
 *        --dry-run  --api=http://localhost:3000
 *
 * Writes real `pairing` rows for the whole ladder. Re-running builds ANOTHER ladder from
 * whatever flights are still open, so decide the count deliberately.
 */
const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [key, ...rest] = a.replace(/^--/, '').split('=')
    return [key, rest.length ? rest.join('=') : 'true']
  }),
)

const API = args.api ?? process.env.GANTT_API_URL ?? 'http://localhost:3000'
const USER = process.env.GANTT_TEST_USER ?? 'admin'
const PASS = process.env.GANTT_TEST_PASS ?? '123456'
const MONTH = args.month ?? '2026-09'
const BASE = args.base ?? 'ADD'
const FLEETS = (args.fleets ?? '788,789').split(',').map((f) => f.trim()).filter(Boolean)
const COUNT = Number(args.count ?? 10)
const TIMEZONE = args.timezone ?? 'Africa/Addis_Ababa'
const DRY_RUN = args['dry-run'] === 'true'
const COMPOSITION = (args.composition ?? 'CA:2,FO:2').split(',').map((slot) => {
  const [rank, plan] = slot.split(':')
  return { rank: rank.trim().toUpperCase(), plan: Number(plan) }
})
const RULES = { checkinMin: 120, debriefMin: 15, restMin: 720, maxDutyBlockMin: 480, singleLegExemption: true }

const [year, monthNum] = MONTH.split('-').map(Number)
const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate()
const START = `${MONTH}-01`
const END = `${MONTH}-${String(lastDay).padStart(2, '0')}`
const scope = {
  startDate: START, endDate: END, ganttStart: START, ganttEnd: END,
  timezone: TIMEZONE, base: BASE, fleets: FLEETS, composition: COMPOSITION, rules: RULES,
}

const login = await fetch(`${API}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userCode: USER, password: PASS }),
})
if (!login.ok) throw new Error(`login failed: ${login.status} ${await login.text()}`)
const token = (await login.json()).data.token
const authHeaders = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

const search = await fetch(`${API}/api/pairing/roundtrip/search`, {
  method: 'POST', headers: authHeaders, body: JSON.stringify({ scope }),
})
const searchBody = await search.json()
if (!search.ok) throw new Error(`search failed: ${search.status} ${searchBody?.message ?? ''}`)

const flightById = new Map(searchBody.data.flights.map((f) => [Number(f.id), f]))
const rotations = searchBody.data.rotations.map((rotation) => ({
  flightIds: rotation.flightIds.map(Number),
  start: new Date(flightById.get(Number(rotation.flightIds[0])).schDepDtUtc).getTime(),
  end: new Date(flightById.get(Number(rotation.flightIds.at(-1))).schArvDtUtc).getTime(),
}))
console.log(`scope ${BASE} ${FLEETS.join('/')} ${START}..${END}: ${searchBody.data.flights.length} open flights, ${rotations.length} rotations`)

// Month cover for ONE crew, tiled ONE rotation per week bucket.
//
// Two constraints have to hold together:
//  1. A crew cannot fly two overlapping rotations, so the ladder must be a non-overlapping chain.
//  2. The auto-assign planner balances flying across 7-day week buckets and takes the LIGHTEST
//     week first — with several candidates in one bucket it can take the first, skip the rest as
//     overlaps, and leave a day empty. Tiling exactly one rotation per week removes that
//     ambiguity, so every ladder rotation is needed and every one gets assigned.
const monthStart = Date.parse(`${START}T00:00:00Z`)
// Coverage is per CALENDAR DAY: a rotation covers the last day as soon as it runs into that
// day, so the target is the START of the last day, not the last millisecond of the month.
const lastDayStart = Date.parse(`${END}T00:00:00Z`)
const DAY = 86_400_000
const WEEK = 7 * DAY
const ladder = []
let cursor = monthStart
let latestStart = 0
while (ladder.length < COUNT && cursor < lastDayStart) {
  const weekEnd = Math.min(cursor + WEEK, lastDayStart)
  const startsBy = cursor + DAY // tolerate a rotation that starts the morning after the cursor day
  const pool = rotations.filter((r) => !ladder.includes(r) && r.start >= latestStart)
  // In the final week prefer a rotation that actually reaches the last day of the month, so the
  // month is not left a day or two short; otherwise prefer the tightest rotation that still
  // carries the crew to the end of this week…
  const finalWeek = cursor + WEEK >= lastDayStart
  const coverToEnd = pool.filter((r) => r.start <= startsBy && r.end >= lastDayStart)
  const covering = (finalWeek && coverToEnd.length ? coverToEnd : pool.filter((r) => r.start <= startsBy && r.end >= weekEnd))
    .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0]
  // …otherwise advance as tightly as possible: taking the SHORTEST reachable rotation leaves the
  // most room for the remaining days instead of locking in a long one that strands the tail.
  const fallback = pool
    .filter((r) => r.start <= startsBy && r.end > cursor)
    .sort((a, b) => a.end - b.end)[0]
  const next = covering ?? fallback
  if (!next) break
  ladder.push(next)
  latestStart = next.end
  cursor = next.end
}
const coveredTo = ladder.length ? ladder.at(-1).end : monthStart

const day = (ms) => new Date(ms).toISOString().slice(0, 10)
const gapDays = coveredTo >= lastDayStart ? 1 : Math.round((coveredTo - lastDayStart) / 86_400_000)
console.log(`ladder: ${ladder.length} rotations covering ${day(ladder[0]?.start ?? monthStart)} -> ${day(coveredTo)}` +
  (gapDays < 0 ? `  (STOPS ${-gapDays} day(s) short of month end)` : "  (reaches month end)"))
for (const r of ladder) console.log(`  ${day(r.start)} -> ${day(r.end)}  (${r.flightIds.length} legs)`)
if (DRY_RUN) {
  console.log('dry run — nothing built')
  process.exit(0)
}

const built = []
for (const rotation of ladder) {
  const res = await fetch(`${API}/api/pairing/roundtrip/build`, {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ scope, flightIds: rotation.flightIds }),
  })
  const body = await res.json()
  if (!res.ok) { console.error(`  build failed ${day(rotation.start)}: ${body?.message ?? res.status}`); continue }
  built.push({ pairingId: body.data.pairingId, label: body.data.label, start: day(rotation.start), end: day(rotation.end) })
  console.log(`  built #${body.data.pairingId} ${body.data.label} ${day(rotation.start)} -> ${day(rotation.end)}`)
}
console.log(`built ${built.length}/${ladder.length} pairings`)
console.log(JSON.stringify({ base: BASE, fleets: FLEETS, month: MONTH, built }, null, 2))
