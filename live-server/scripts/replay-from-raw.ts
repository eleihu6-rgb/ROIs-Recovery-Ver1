/**
 * One-shot replay: re-import F8 Live (2025-01-01 .. 2026-09-30) from the raw JSON
 * files already saved by the connector (no re-fetch from the upstream interface).
 *
 * Reuses the connector transforms + the LIVE worker process functions directly
 * (from source, so the FIXED pairing-inbound logic — synthesized flights carry no
 * interface_flt_id — is what runs, regardless of the running service's build).
 *
 * Order: crew → flight → pairing → roster_ground → roster_flight.
 *   - crew first: roster/roster_ground need crewSet.
 *   - flight before pairing: pairing_segment.flt_id resolution.
 *   - pairing before roster: roster resolves pairing_id via interface_id.
 *   - roster_flight as one full-range job (the worker's stale-delete wipes the
 *     window then re-inserts the job's records; chunking with a full-range window
 *     would drop earlier chunks).
 *
 * Usage:  node --env-file=.env node_modules/.bin/tsx scripts/replay-from-raw.ts [entity]
 *         (entity optional: crew|flight|pairing|roster_ground|roster_flight|all)
 */
import 'dotenv/config'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { transformF8Crew } from '../../connector-server/src/transform/f8/db/transform-crew.js'
import { transformF8Flights } from '../../connector-server/src/transform/f8/db/transform-flight.js'
import { transformF8Pairings } from '../../connector-server/src/transform/f8/db/transform-pairing.js'
import { transformF8RosterFlight } from '../../connector-server/src/transform/f8/db/transform-roster.js'
import { transformF8RosterGround } from '../../connector-server/src/transform/f8/db/transform-roster-ground.js'
import { loadCrewSet } from '../../connector-server/src/utils/db-lookup.js'

import { processCrewImportJob } from '../src/workers/crew-inbound-worker.js'
import { processFlightImportJob } from '../src/workers/flight-inbound-worker.js'
import { processPairingImportJob } from '../src/workers/pairing-inbound-worker.js'
import { processRosterImportJob } from '../src/workers/roster-inbound-worker.js'
import { processRosterGroundImportJob } from '../src/workers/roster-ground-inbound-worker.js'
import { env } from '../src/config/index.js'

const RANGE: [string, string] = ['2025-01-01', '2026-09-30']
const FILIALE = 'F8'
const DATA = resolve(__dirname, '../../connector-server/data/raw/f8')
const PAIRING_CHUNK = 300

const readJson = (entity: string): unknown[] => {
  const dir = join(DATA, entity)
  const out: unknown[] = []
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    out.push(...(JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown[]))
  }
  return out
}
const chunkArr = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
const dedupBy = <T,>(items: T[], key: (x: T) => string): T[] => {
  const m = new Map<string, T>()
  for (const it of items) {
    const k = key(it)
    if (k) m.set(k, it) // later file wins
  }
  return [...m.values()]
}
const meta = { syncId: 'replay-from-raw', filiale: FILIALE, syncRangeDt: RANGE }

const log = (msg: string): void => console.log(`[${new Date().toISOString()}] ${msg}`)

async function importCrew(db: ReturnType<typeof drizzle>): Promise<void> {
  const raw = readJson('crew')
  const records = transformF8Crew(raw, FILIALE)
  log(`crew: ${raw.length} raw → ${records.length} records`)
  const r = await processCrewImportJob({ ...meta, records }, db, { pbsSchema: env.PBS_SCHEMA })
  log(`crew done: ${r.imported} imported, ${r.errors.length} errors`)
}

async function importFlight(db: ReturnType<typeof drizzle>): Promise<void> {
  const raw = readJson('flight')
  const all = transformF8Flights(raw, FILIALE)
  const records = dedupBy(all, (r) => (r as { interfaceFltId?: string }).interfaceFltId ?? '')
  log(`flight: ${raw.length} raw → ${records.length} unique`)
  const r = await processFlightImportJob({ ...meta, records }, db)
  log(`flight done: ${r.imported} imported, ${r.errors.length} errors`)
}

async function importPairing(db: ReturnType<typeof drizzle>): Promise<void> {
  const raw = readJson('pairing')
  const all = transformF8Pairings(raw)
  const uniq = dedupBy(all, (p) => (p as { interfaceId?: string }).interfaceId ?? '')
  log(`pairing: ${raw.length} raw → ${uniq.length} unique, chunks=${Math.ceil(uniq.length / PAIRING_CHUNK)}`)
  let imported = 0
  let errors = 0
  for (const chunk of chunkArr(uniq, PAIRING_CHUNK)) {
    const r = await processPairingImportJob({ ...meta, pairings: chunk }, db)
    imported += r.imported
    errors += r.errors.length
  }
  log(`pairing done: ${imported} imported, ${errors} errors`)
}

async function importRosterGround(db: ReturnType<typeof drizzle>): Promise<void> {
  const dir = join(DATA, 'roster_ground')
  const groundRaw: unknown[] = []
  const singleLegRaw: unknown[] = []
  let ignoredPaired = 0
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const isFlight = /_Flight\.json$/i.test(f)
    const arr = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Array<Record<string, unknown>>
    for (const rec of arr) {
      if (isFlight) {
        const pid = Number(rec['pairingId'] ?? 0)
        if (pid === 0) singleLegRaw.push(rec)
        else ignoredPaired++
      } else {
        groundRaw.push(rec)
      }
    }
  }
  log(`roster_ground: groundRaw=${groundRaw.length}, singleLegRaw=${singleLegRaw.length}, ignoredPaired=${ignoredPaired}`)
  const crewSet = await loadCrewSet(db)
  const { groundRecords, singleLegRecords, rejected } = transformF8RosterGround(groundRaw, singleLegRaw, crewSet, FILIALE)
  // Raw files overlap windows (10-day + monthly + per-assignment-type), so the same
  // ground/single-leg record appears in many files. The worker dedupes against EXISTING
  // rows but not within the job's own records — dedupe here or a full-range replay stacks
  // duplicate ground rows (which mass-trigger rule1001 overlap alerts).
  const ground = dedupBy(groundRecords, (r) => `${r.crewId}|${r.assignment}|${r.strDtUtc}|${r.endDtUtc}`)
  const single = dedupBy(singleLegRecords, (r) => `${r.crewId}|${r.interfaceFltId}|${r.strDtUtc}|${r.endTimeUtc}`)
  log(`roster_ground transformed: ground=${ground.length}/${groundRecords.length}, singleLeg=${single.length}/${singleLegRecords.length}, rejected=${rejected.length}`)
  const r = await processRosterGroundImportJob({
    ...meta, groundRecords: ground, singleLegRecords: single, filteredCount: rejected.length, rejectionFile: null,
  }, db)
  log(`roster_ground done: ${r.imported} imported, ${r.errors.length} errors`)
}

async function importRoster(db: ReturnType<typeof drizzle>): Promise<void> {
  const raw = readJson('roster_flight')
  log(`roster_flight: ${raw.length} raw`)
  const crewSet = await loadCrewSet(db)
  const { records, rejected } = transformF8RosterFlight(raw, crewSet, FILIALE)
  log(`roster_flight transformed: ${records.length} records, ${rejected.length} rejected`)
  const r = await processRosterImportJob({
    ...meta, records, filteredCount: rejected.length, rejectionFile: null,
  }, db)
  log(`roster_flight done: ${r.imported} imported, ${r.errors.length} errors, ${r.warnings.length} warnings`)
}

async function main(): Promise<void> {
  const entity = process.argv[2] ?? 'all'
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
  const db = drizzle(pool)
  try {
    const steps: Array<[string, (d: typeof db) => Promise<void>]> = [
      ['crew', importCrew],
      ['flight', importFlight],
      ['pairing', importPairing],
      ['roster_ground', importRosterGround],
      ['roster_flight', importRoster],
    ]
    for (const [name, fn] of steps) {
      if (entity === 'all' || entity === name) {
        log(`═══ START ${name} ═══`)
        const t0 = Date.now()
        await fn(db)
        log(`═══ ${name} done in ${((Date.now() - t0) / 1000).toFixed(1)}s ═══`)
      }
    }
    log('replay complete')
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
