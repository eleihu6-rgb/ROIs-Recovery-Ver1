#!/usr/bin/env node
// Idempotent crew seed generator — creates a batch of crew for a new base/fleet/nationality.
// Usage:
//   node seed-crew.mjs <config.json> [--dry-run]
// Requires DATABASE_URL in the environment (source the target service's .env first).

import pg from 'pg';
import fs from 'node:fs';

const configPath = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!configPath) {
  console.error('Usage: node seed-crew.mjs <config.json> [--dry-run]');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set — source the target service .env first.');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function addDays(baseIso, days) {
  const d = new Date(baseIso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function pick(arr, i) {
  return arr[i % arr.length];
}

async function ensureAirport(client, a) {
  const { rows } = await client.query('select 1 from airport where airport = $1', [a.code]);
  if (rows.length) {
    console.log(`  airport ${a.code} already exists`);
    return;
  }
  console.log(`  + airport ${a.code} (${a.name})`);
  if (dryRun) return;
  await client.query(
    `insert into airport (airport, airport_name, airport_icao, city, dir, zone_id, utc_standard_offset, country)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [a.code, a.name, a.icao ?? null, a.city ?? a.code, a.dir ?? 'I', a.zoneId, a.utcOffsetMin, a.country]
  );
}

// `base` is a separate reference table (crew home-base master data, read by the
// Gantt filter dialog's "Base" dropdown via a 24h-cached API) — distinct from
// `airport`, which only describes the physical airport. Both must exist for a
// new base to be filterable/visible in the UI.
async function ensureBase(client, a, filiale) {
  const { rows } = await client.query('select 1 from base where filiale = $1 and base = $2', [filiale, a.code]);
  if (rows.length) {
    console.log(`  base ${a.code} already exists`);
    return;
  }
  console.log(`  + base ${a.code}`);
  if (dryRun) return;
  const { rows: maxRows } = await client.query('select coalesce(max(display_order),0) + 1 as next from base where filiale = $1', [filiale]);
  // Existing rows just repeat the 3-letter code as `name` (varchar(20)) — follow that convention
  // rather than the full airport name, which routinely overflows the column.
  await client.query(
    `insert into base (filiale, base, name, display_order, is_prime_display_base) values ($1,$2,$3,$4,0)`,
    [filiale, a.code, a.code, maxRows[0].next]
  );
}

async function ensureFleet(client, f) {
  const { rows } = await client.query('select 1 from fleet where fleet = $1', [f.code]);
  if (rows.length) {
    console.log(`  fleet ${f.code} already exists`);
    return;
  }
  console.log(`  + fleet ${f.code} (${f.description})`);
  if (dryRun) return;
  const { rows: maxRows } = await client.query('select coalesce(max(display_order),0) + 1 as next from fleet');
  await client.query(
    `insert into fleet (fleet, description, display_order, fleet_grp, ac_type, restfacility, market_ac_type, body)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      f.code,
      f.description,
      maxRows[0].next,
      f.fleetGrp ?? f.code,
      f.acType ?? f.code,
      f.restfacility ?? 0,
      f.marketAcType ?? null,
      f.body ?? null,
    ]
  );
}

// Returns the seat/position code to use on crew_rank (e.g. PIC/SIC), creating
// the rank + rank_position rows first if this rank code doesn't exist yet.
async function ensureRank(client, r) {
  const { rows } = await client.query('select 1 from rank where rank = $1', [r.code]);
  if (!rows.length) {
    console.log(`  + rank ${r.code} (${r.description})`);
    if (!dryRun) {
      const { rows: maxRows } = await client.query('select coalesce(max(display_order),0) + 1 as next from rank');
      await client.query(
        `insert into rank (rank, division, display_order, description, is_include_in_ft, is_acting_rank, is_crew_rank, is_must_crew_rank)
         values ($1,$2,$3,$4,1,1,1,0)`,
        [r.code, r.division, maxRows[0].next, r.description]
      );
    }
  } else {
    console.log(`  rank ${r.code} already exists`);
  }

  const { rows: posRows } = await client.query('select position from rank_position where rank = $1 limit 1', [r.code]);
  if (posRows.length) return posRows[0].position;

  const position = r.position ?? r.code;
  console.log(`  + rank_position ${r.code}/${position}`);
  if (!dryRun) {
    await client.query(
      `insert into rank_position (rank, position, division, display_order, description)
       select $1, $2, $3, coalesce((select max(display_order) + 1 from rank_position), 1), $4`,
      [r.code, position, r.division, r.description]
    );
  }
  return position;
}

async function crewExists(client, crewId) {
  const { rows } = await client.query('select 1 from crew where crew_id = $1', [crewId]);
  return rows.length > 0;
}

async function seedGroup(client, group) {
  console.log(`\n=== ${group.label} ===`);
  await ensureAirport(client, group.base);
  await ensureBase(client, group.base, group.filiale ?? 'F8');
  await ensureFleet(client, group.fleet);
  const caPosition = await ensureRank(client, group.ranks.CA);
  const foPosition = await ensureRank(client, group.ranks.FO);

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < group.count; i++) {
    const crewId = `${group.idPrefix}${group.idStart + i}`;
    const isCA = i < group.caCount;
    const rankCode = isCA ? 'CA' : 'FO';
    const position = isCA ? caPosition : foPosition;
    const gender = i % 3 === 0 ? 'F' : 'M';
    const firstNames = gender === 'F' ? group.names.femaleFirst : group.names.maleFirst;
    const firstName = pick(firstNames, i);
    const lastName = pick(group.names.last, i + 7);
    const emplDt = addDays(group.emplBaseDate, i * 6);

    if (await crewExists(client, crewId)) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  [dry-run] would create ${crewId} ${firstName} ${lastName} ${rankCode} ${group.base.code} ${group.fleet.code}`);
      created++;
      continue;
    }

    await client.query('BEGIN');
    try {
      await client.query(
        `insert into crew (crew_id, first_name, last_name, gender, division, empl_dt, nationality, filiale, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,0)`,
        [crewId, firstName, lastName, gender, 'P', emplDt, group.nationality, group.filiale ?? 'F8']
      );
      await client.query(
        `insert into crew_base (crew_id, base, eff_dt, is_prime_base) values ($1,$2,$3,1)`,
        [crewId, group.base.code, emplDt]
      );
      await client.query(
        `insert into crew_fleet (crew_id, fleet_specific, eff_dt) values ($1,$2,$3)`,
        [crewId, group.fleet.code, emplDt]
      );
      await client.query(
        `insert into crew_rank (crew_id, rank, eff_dt, position, division) values ($1,$2,$3,$4,$5)`,
        [crewId, rankCode, emplDt, position, 'P']
      );
      await client.query('COMMIT');
      created++;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }

  console.log(`  created ${created}, skipped (already existed) ${skipped}`);
}

async function main() {
  const client = await pool.connect();
  try {
    for (const group of config.groups) {
      await seedGroup(client, group);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
