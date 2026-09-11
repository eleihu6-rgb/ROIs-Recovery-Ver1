/**
 * Skill 143 cleanup — delete MANUAL ADD/DXB pairings that mix ET/EK with other airlines (Rule G),
 * then rebuild ET/EK base loops from freed legs via chooseRotations + pairing/build.
 *
 * Usage (from live-server/):
 *   node scripts/cleanup-mixed-airline-pairings.mjs --dry-run
 *   node scripts/cleanup-mixed-airline-pairings.mjs --execute
 */
import 'dotenv/config'
import pg from 'pg'
import Fastify from 'fastify'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq, and, asc, gte, lt, inArray, notExists, isNull, notInArray, or } from 'drizzle-orm'
import { chooseRotations, linkScope, scopeBounds, scopeFleetMatches, toRoundtripFlight, isRoundtripFlightCancelled } from '../dist/services/pairing/roundtrip-chooser.js'
import { pairingBuildService } from '../dist/services/pairing/pairing-build-service.js'
import { flight } from '../dist/models/flight/flight.js'
import { pairing } from '../dist/models/pairing/pairing.js'
import { pairingSegment } from '../dist/models/pairing/pairing-segment.js'
import { rosterFlight } from '../dist/models/roster/roster-flight.js'
import { pairingComposition } from '../dist/models/pairing/pairing-composition.js'
import { notDeleted } from '../dist/utils/db.js'
import profile from '../dist/config/roundtrip-profile.json' with { type: 'json' }

const EXECUTE = process.argv.includes('--execute')
const REBUILD_ONLY = process.argv.includes('--rebuild-only')
const USER = 'cleanup-mixed-airline'

const noopRedis = {
  del: async () => 0,
  keys: async () => [],
  set: async () => 'OK',
  scan: async () => ({ cursor: 0, keys: [] }),
}

const MIXED_SQL = `
  with man as (
    select id, base, pairing_label from pairing
    where source = 'MANUAL' and is_deleted = 0 and base in ('ADD', 'DXB')
  ),
  seg as (
    select ps.pairing_id, man.base, man.pairing_label,
           coalesce(nullif(ps.airline, ''), f.airline) airline,
           ps.flt_id, f.flt_num, f.fleet, f.airline flight_airline
    from pairing_segment ps
    join man on man.id = ps.pairing_id
    join flight f on f.id = ps.flt_id
    where ps.is_deleted = 0
  ),
  mixed as (
    select pairing_id, base, pairing_label,
           array_agg(distinct airline order by airline) airline_codes,
           count(*) seg_count
    from seg
    where airline is not null and airline <> ''
    group by pairing_id, base, pairing_label
    having count(distinct airline) > 1
  )
  select m.pairing_id, m.base, m.pairing_label, m.airline_codes, m.seg_count,
         exists(
           select 1 from roster_flight rf
           where rf.pairing_id = m.pairing_id and rf.is_deleted = 0
         ) as rostered
  from mixed m
  where ('ET' = any(m.airline_codes) or 'EK' = any(m.airline_codes))
    and array_length(m.airline_codes, 1) > 1
  order by m.pairing_id
`

const deletePairing = async (db, pairingId) => {
  await db.transaction(async (tx) => {
    await tx.delete(rosterFlight).where(eq(rosterFlight.pairingId, pairingId))
    await tx.delete(pairingComposition).where(eq(pairingComposition.pairingId, pairingId))
    await tx.delete(pairingSegment).where(eq(pairingSegment.pairingId, pairingId))
    await tx.delete(pairing).where(eq(pairing.id, pairingId))
  })
}

/** dev_live has no PK on pairing.id — F8 imports and MANUAL builds can share ids. Scope deletes to one header. */
const deleteManualPairing = async (db, pairingId, createdBy) => {
  await db.transaction(async (tx) => {
    await tx.delete(rosterFlight).where(eq(rosterFlight.pairingId, pairingId))
    await tx.delete(pairingComposition).where(eq(pairingComposition.pairingId, pairingId))
    await tx.delete(pairingSegment).where(and(eq(pairingSegment.pairingId, pairingId), eq(pairingSegment.createdBy, createdBy)))
    await tx.delete(pairing).where(and(eq(pairing.id, pairingId), eq(pairing.createdBy, createdBy), eq(pairing.source, 'MANUAL')))
  })
}

const bumpPairingIdentity = async (pool) => {
  const { rows } = await pool.query(`
    select setval(
      pg_get_serial_sequence('pairing', 'id'),
      greatest((select coalesce(max(id), 1) from pairing), 200000)
    ) as next_id
  `)
  console.log(`Bumped pairing id sequence → ${rows[0].next_id}`)
}

const fetchOpenEtEkFlights = async (db, scope) => {
  const bounds = scopeBounds(scope)
  const linkBounds = scopeBounds(linkScope(scope))
  const covered = db
    .select({ id: pairingSegment.id })
    .from(pairingSegment)
    .innerJoin(pairing, and(eq(pairing.id, pairingSegment.pairingId), notDeleted(pairing.isDeleted)))
    .where(and(
      eq(pairingSegment.fltId, flight.id),
      eq(pairing.division, 'P'),
      notDeleted(pairingSegment.isDeleted),
      or(isNull(pairingSegment.segAssignment), notInArray(pairingSegment.segAssignment, ['DH', 'DHD'])),
    ))
  const rows = await db
    .select()
    .from(flight)
    .where(and(
      inArray(flight.airline, ['ET', 'EK']),
      notDeleted(flight.isDeleted),
      gte(flight.schDepDtUtc, linkBounds.start),
      lt(flight.schArvDtUtc, linkBounds.end),
      notExists(covered),
    ))
    .orderBy(asc(flight.schDepDtUtc), asc(flight.id))
  const active = rows.filter((f) => !isRoundtripFlightCancelled(f))
  return active
    .filter((f) => f.schDepDtUtc >= bounds.start && f.schArvDtUtc < bounds.end && scopeFleetMatches(scope, f.fleet))
    .map(toRoundtripFlight)
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const app = Fastify({ logger: false })
  app.decorate('db', drizzle(pool))
  app.decorate('redis', noopRedis)

  try {
    if (!REBUILD_ONLY) {
      const client = await pool.connect()
      let targets
      try {
        ;({ rows: targets } = await client.query(MIXED_SQL))
      } finally {
        client.release()
      }

      console.log(`=== Mixed ET/EK MANUAL pairings at ADD/DXB: ${targets.length} ===`)
      console.log(`Rostered: ${targets.filter((r) => r.rostered).length}, unrostered: ${targets.filter((r) => !r.rostered).length}`)
      if (!EXECUTE) {
        console.log('Dry run — pass --execute to delete and rebuild, or --rebuild-only after delete.')
        for (const row of targets.slice(0, 20)) {
          console.log(`  #${row.pairing_id} ${row.base} ${row.pairing_label} airlines=${JSON.stringify(row.airline_codes)} rostered=${row.rostered}`)
        }
        if (targets.length > 20) console.log(`  … and ${targets.length - 20} more`)
        return
      }

      let deleted = 0
      for (const row of targets) {
        await deletePairing(app.db, Number(row.pairing_id))
        deleted++
        if (deleted % 25 === 0) console.log(`Deleted ${deleted}/${targets.length}…`)
      }
      console.log(`Deleted ${deleted} mixed-airline pairings.`)
    } else {
      console.log('=== Rebuild-only mode (skip delete) ===')
      const rollback = await pool.query(`
        select id, created_by from pairing
        where created_by = $1 and is_deleted = 0 and source = 'MANUAL'
      `, [USER])
      for (const row of rollback.rows) {
        await deleteManualPairing(app.db, Number(row.id), row.created_by)
      }
      if (rollback.rows.length > 0) {
        console.log(`Rolled back ${rollback.rows.length} prior ${USER} pairings before rebuild.`)
      }
    }

    await bumpPairingIdentity(pool)

    const scopeByBase = {
      ADD: {
        startDate: '2026-08-29',
        endDate: '2026-09-04',
        ganttStart: '2026-08-29',
        ganttEnd: '2026-09-04',
        timezone: 'UTC',
        base: 'ADD',
        fleets: ['ALL'],
        composition: profile.composition.narrow,
        rules: { ...profile.defaults },
      },
      DXB: {
        startDate: '2026-08-29',
        endDate: '2026-09-04',
        ganttStart: '2026-08-29',
        ganttEnd: '2026-09-04',
        timezone: 'UTC',
        base: 'DXB',
        fleets: ['ALL'],
        composition: profile.composition.wide,
        rules: { ...profile.defaults },
      },
    }

    let built = 0
    let buildErrors = 0
    for (const [base, scopeTemplate] of Object.entries(scopeByBase)) {
      const airline = base === 'ADD' ? 'ET' : 'EK'
      const scope = linkScope(scopeTemplate)
      const flights = (await fetchOpenEtEkFlights(app.db, scopeTemplate)).filter((f) => f.airline === airline)
      const rotations = chooseRotations(flights, scopeTemplate)
      console.log(`${base}/${airline}: ${flights.length} open legs → ${rotations.length} rotations`)
      for (const rot of rotations) {
        try {
          await pairingBuildService.build(app, rot.flightIds, USER, scope)
          built++
        } catch (err) {
          buildErrors++
          console.warn(`  build skip ${rot.flightIds.join(',')}: ${err.message}`)
        }
      }
    }

    const verify = await pool.query(`
      with man as (select id, created_by from pairing where source='MANUAL' and is_deleted=0 and base in ('ADD','DXB')),
      seg as (
        select ps.pairing_id, coalesce(nullif(ps.airline,''), f.airline) airline
        from pairing_segment ps
        join man on man.id = ps.pairing_id and ps.created_by = man.created_by
        join flight f on f.id = ps.flt_id
        where ps.is_deleted = 0
      )
      select count(*) from (
        select pairing_id from seg where airline is not null and airline <> ''
        group by pairing_id having count(distinct airline) > 1
          and (bool_or(airline = 'ET') or bool_or(airline = 'EK'))
      ) x
    `)
    console.log(`Rebuild complete: ${built} pairings built, ${buildErrors} build skips.`)
    console.log(`Remaining ADD/DXB mixed-airline MANUAL pairings: ${verify.rows[0].count}`)
  } finally {
    await app.close()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
