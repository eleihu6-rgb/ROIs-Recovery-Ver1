#!/usr/bin/env node
// SSIM (IATA Chapter 7) flight schedule loader — parses type-3 flight leg records from a
// real SSIM file and loads them into the `flight` table, replacing any existing rows for
// the airline. Column map cross-checked against wcagreen/rusty-ssim (MIT,
// rusty-ssim-core/src/utils/ssim_parser.rs) — reference only, no code vendored.
//
// SSIM facts encoded here (verified against the ET 01-30SEP26 Sabre AirFlite export):
//  - The type-2 carrier record's column 2 is the TIME MODE flag: 'U' = every time in
//    the file is UTC, 'L' = local station time. This file is "2UET..." = UTC. The
//    per-station offsets (cols 48-52 / 66-70, e.g. "ADD03050305+0300") convert to
//    LOCAL (local = time + offset). Cross-checked: ET100 "0305+0300" = 03:05 UTC =
//    06:05 ADD local, matching the published local departure. Either mode converts
//    using only file-embedded offsets — no airport.zone_id / DST lookup involved.
//  - Each type-3 record is a date RANGE + days-of-week pattern (period cols 15-28,
//    days cols 29-35, Mon=1..Sun=7) that expands to individual dated flights.
//  - date_variation (cols 193-194): dep/arr day offsets relative to the operating
//    date. This file uses "00", "01" (arrive next day) and "11" (post-midnight leg
//    of a multi-leg flight: both dep and arr are op-date +1).
//  - service_type (col 14): J = scheduled pax -> flt_type PAX, F = freighter -> FRT.
//
// Usage:
//   node load-ssim-flights.mjs <ssim-file> [--fleets=788,789,738,73W,7M8] [--airline=ET]
//                              [--replace] [--dry-run] [--as-of=YYYY-MM-DD]
// Requires DATABASE_URL (source the target service .env first).

import pg from 'pg';
import fs from 'node:fs';

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const replace = args.includes('--replace');
const airline = (args.find((a) => a.startsWith('--airline='))?.slice(10) ?? 'ET').toUpperCase();
const fleetsArg = args.find((a) => a.startsWith('--fleets='))?.slice(9) ?? '788,789,738,73W,7M8';
const targetFleets = new Set(fleetsArg.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));
const asOfArg = args.find((a) => a.startsWith('--as-of='));
const asOf = asOfArg ? asOfArg.slice(8) : new Date().toISOString().slice(0, 10);

if (!filePath) {
  console.error('Usage: node load-ssim-flights.mjs <ssim-file> [--fleets=...] [--airline=ET] [--replace] [--dry-run] [--as-of=YYYY-MM-DD]');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set — source the target service .env first.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// SSIM type-3 parsing (0-indexed slices, identical to rusty-ssim's column map)
// ---------------------------------------------------------------------------
const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
const parseSsimDate = (s) => Date.UTC(2000 + Number(s.slice(5, 7)), MONTHS[s.slice(2, 5)], Number(s.slice(0, 2)));
const parseOffsetMin = (s) => {
  const m = s.match(/([+-])(\d{2})(\d{2})/);
  if (!m) throw new Error(`bad UTC offset field: "${s}"`);
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
};
// date_variation char: ' '/'0' = same day, '1'..'9' = +n days, 'A' = -1 day (SSIM spec).
const dateVarDays = (ch) => (ch === ' ' || ch === '0' ? 0 : ch === 'A' ? -1 : Number(ch));

function parseLeg(line) {
  return {
    operationalSuffix: line[1],
    airline: line.slice(2, 5).trim(),
    flightNumber: line.slice(5, 9).trim(),
    itineraryVariation: line.slice(9, 11),
    legSequence: line.slice(11, 13),
    serviceType: line[13],
    periodFrom: parseSsimDate(line.slice(14, 21)),
    periodTo: parseSsimDate(line.slice(21, 28)),
    daysOfOperation: line.slice(28, 35), // 'Mon=1 .. Sun=7', blank-padded
    frequencyRate: line[35], // ' '/'1' weekly, '2' biweekly
    depStation: line.slice(36, 39),
    depTimePax: line.slice(39, 43), // local HHMM
    depOffsetMin: parseOffsetMin(line.slice(47, 52)),
    arvStation: line.slice(54, 57),
    arvTimePax: line.slice(61, 65), // local HHMM
    arvOffsetMin: parseOffsetMin(line.slice(65, 70)),
    aircraftType: line.slice(72, 75).trim(),
    depDateVar: dateVarDays(line[192]),
    arvDateVar: dateVarDays(line[193]),
  };
}

const DAY_MS = 86_400_000;
const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const isoDow = (ms) => { const d = new Date(ms).getUTCDay(); return d === 0 ? 7 : d; };
// "2400" = midnight at the END of the operating day; Sabre pairs it with a date
// variation already pointing at the NEXT calendar day (the day whose 00:00 this is),
// so it maps to 00:00 of the flagged day — never add a day twice. (2 legs in the ET
// file: ET416 ADD->BEY "BEY24002400+0300" dv=01, ET512 ABJ->JFK dv=01.)
const hhmmToMin = (s, dateVar) => {
  if (s === '2400') {
    if (dateVar === 0) throw new Error('time "2400" with no date variation — ambiguous, inspect the record');
    return 0;
  }
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(2, 4));
};

// Expand one leg record into dated legs; returns flight-row fragments.
// timeMode 'U': record times are UTC (dates/days-of-op are UTC dates); local instants
// derive as time + offset. timeMode 'L': record times are local; UTC derives as
// time - offset.
function expandLeg(leg, timeMode) {
  const out = [];
  const step = leg.frequencyRate === '2' ? 14 * DAY_MS : DAY_MS;
  for (let d = leg.periodFrom; d <= leg.periodTo; d += step) {
    if (!leg.daysOfOperation.includes(String(isoDow(d)))) continue;
    const depDateMs = d + leg.depDateVar * DAY_MS;
    const arvDateMs = d + leg.arvDateVar * DAY_MS;
    const depMin = hhmmToMin(leg.depTimePax, leg.depDateVar);
    const arvMin = hhmmToMin(leg.arvTimePax, leg.arvDateVar);
    const depUtcMs = timeMode === 'U'
      ? depDateMs + depMin * 60_000
      : depDateMs + (depMin - leg.depOffsetMin) * 60_000;
    const arvUtcMs = timeMode === 'U'
      ? arvDateMs + arvMin * 60_000
      : arvDateMs + (arvMin - leg.arvOffsetMin) * 60_000;
    // Local departure date (flight.flt_dt is the LOCAL date): shift the UTC instant
    // by the file's own station offset.
    const depLocalDateMs = Math.floor((depUtcMs + leg.depOffsetMin * 60_000) / DAY_MS) * DAY_MS;
    const blkMin = Math.round((arvUtcMs - depUtcMs) / 60_000);
    if (blkMin < 0 || blkMin > 20 * 60) {
      throw new Error(`implausible block ${blkMin}min for ${leg.airline}${leg.flightNumber} ${isoDate(d)} ${leg.depStation}->${leg.arvStation} — check date_variation/time-mode handling`);
    }
    out.push({ opDateMs: d, depLocalDateMs, depUtcMs, arvUtcMs, blkMin });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reference data the load may need to add (only inserted when actually
// referenced by a loaded flight and missing from the DB).
// ---------------------------------------------------------------------------
const KNOWN_AIRPORTS = {
  AWA: { name: 'Hawassa', zone: 'Africa/Addis_Ababa', offset: 180, country: 'ET' },
  DSS: { name: 'Dakar Blaise Diagne Intl', zone: 'Africa/Dakar', offset: 0, country: 'SN' },
  FBM: { name: 'Lubumbashi Intl', zone: 'Africa/Lubumbashi', offset: 120, country: 'CD' },
  FIH: { name: "Kinshasa N'djili Intl", zone: 'Africa/Kinshasa', offset: 60, country: 'CD' },
  GGR: { name: 'Garowe Intl', zone: 'Africa/Mogadishu', offset: 180, country: 'SO' },
  NBJ: { name: 'Luanda Agostinho Neto Intl', zone: 'Africa/Luanda', offset: 60, country: 'AO' },
  BYY: { name: 'Bekoji', zone: 'Africa/Addis_Ababa', offset: 180, country: 'ET' },
  NEK: { name: 'Nekemte', zone: 'Africa/Addis_Ababa', offset: 180, country: 'ET' },
  SZE: { name: 'Semera', zone: 'Africa/Addis_Ababa', offset: 180, country: 'ET' },
};

const KNOWN_FLEETS = {
  788: { description: 'Boeing 787-8', fleetGrp: 'B787', body: 'W', market: 'Boeing 787-8 Dreamliner' },
  789: { description: 'Boeing 787-9', fleetGrp: 'B787', body: 'W', market: 'Boeing 787-9 Dreamliner' },
  738: { description: 'Boeing 737-800', fleetGrp: '737', body: null, market: 'Boeing 737-800' },
  '73W': { description: 'Boeing 737-800 (winglets)', fleetGrp: '737', body: null, market: 'Boeing 737-800' },
  '7M8': { description: 'Boeing 737 MAX 8', fleetGrp: '7M8', body: null, market: 'Boeing 737 MAX 8' },
};

// ---------------------------------------------------------------------------
const COLUMNS = [
  'airline', 'flt_dt', 'flt_dt_utc', 'flt_num', 'dep_arp', 'arv_arp',
  'sch_dep_dt_utc', 'sch_arv_dt_utc', 'act_dep_dt_utc', 'act_arv_dt_utc',
  'act_dep_arp', 'act_arv_arp', 'flight_flag', 'blk_min',
  'fleet', 'register', 'seg_type', 'flt_type', 'voyage_status', 'is_locked',
  'sch_id', 'vr_add', 'scenario_id', 'is_deleted', 'manual_comp_flag', 'flight_key',
];

async function insertRows(client, rows) {
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = [];
    const tuples = chunk.map((row, ri) => {
      const placeholders = COLUMNS.map((_, ci) => `$${ri * COLUMNS.length + ci + 1}`);
      values.push(...COLUMNS.map((c) => row[c]));
      return `(${placeholders.join(',')})`;
    });
    await client.query(`insert into flight (${COLUMNS.join(',')}) values ${tuples.join(',')}`, values);
  }
}

async function main() {
  const raw = fs.readFileSync(filePath, 'latin1').split(/\r?\n/);
  const legRecords = raw.filter((l) => l[0] === '3').map(parseLeg);
  const carrierLine = raw.find((l) => l[0] === '2');
  if (!carrierLine) throw new Error('no type-2 carrier record — cannot determine the time mode (UTC vs local)');
  const timeMode = carrierLine[1]; // col 2: 'U' = all times UTC, 'L' = local station times
  if (timeMode !== 'U' && timeMode !== 'L') throw new Error(`unknown time mode "${timeMode}" in carrier record — expected U or L`);
  console.log(`SSIM: ${legRecords.length} type-3 leg records, carrier record: ${carrierLine.slice(0, 40).trim()}`);
  console.log(`time mode: ${timeMode} (${timeMode === 'U' ? 'all times UTC; offsets derive local' : 'local station times; offsets derive UTC'})`);

  const kept = legRecords.filter((l) => l.airline === airline && targetFleets.has(l.aircraftType));
  const skippedTypes = {};
  for (const l of legRecords.filter((l) => l.airline === airline && !targetFleets.has(l.aircraftType))) {
    skippedTypes[l.aircraftType] = (skippedTypes[l.aircraftType] || 0) + 1;
  }
  console.log(`kept ${kept.length} leg records on fleets [${[...targetFleets].join(',')}]; skipped equipment:`, skippedTypes);

  // Expand to dated flight rows.
  const rows = [];
  const perFleet = {};
  const airportsUsed = new Set();
  const seenKeys = new Set();
  for (const leg of kept) {
    airportsUsed.add(leg.depStation);
    airportsUsed.add(leg.arvStation);
    for (const e of expandLeg(leg, timeMode)) {
      const fltDt = isoDate(e.depLocalDateMs);
      const fltNum = `${airline}${leg.flightNumber}`;
      const key = `${fltNum}-${fltDt}-${leg.depStation}`;
      if (seenKeys.has(key)) throw new Error(`duplicate flight_key ${key} — overlapping itinerary variations?`);
      seenKeys.add(key);
      const dep = new Date(e.depUtcMs).toISOString();
      const arv = new Date(e.arvUtcMs).toISOString();
      perFleet[leg.aircraftType] = (perFleet[leg.aircraftType] || 0) + 1;
      rows.push({
        airline,
        flt_dt: fltDt,
        flt_dt_utc: dep.slice(0, 10),
        flt_num: fltNum,
        dep_arp: leg.depStation,
        arv_arp: leg.arvStation,
        sch_dep_dt_utc: dep,
        sch_arv_dt_utc: arv,
        // No ops feed for this schedule import — actuals mirror schedule, and
        // flight_flag distinguishes elapsed (A) vs upcoming (S) dates.
        act_dep_dt_utc: dep,
        act_arv_dt_utc: arv,
        act_dep_arp: leg.depStation,
        act_arv_arp: leg.arvStation,
        flight_flag: fltDt <= asOf ? 'A' : 'S',
        blk_min: e.blkMin,
        fleet: leg.aircraftType,
        register: null, // schedule-only: no tail assigned; Gantt bin-packs by fleet
        seg_type: 'PENDING', // resolved below from airport countries
        flt_type: leg.serviceType === 'F' ? 'FRT' : 'PAX',
        voyage_status: 0,
        is_locked: 0,
        sch_id: 0,
        vr_add: 0,
        scenario_id: 0,
        is_deleted: 0,
        manual_comp_flag: 0,
        flight_key: key,
      });
    }
  }
  const dates = rows.map((r) => r.flt_dt).sort();
  console.log(`expanded to ${rows.length} dated flights, ${dates[0]} -> ${dates[dates.length - 1]}, per fleet:`, perFleet);

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    // seg_type: D when both endpoints are in the carrier's home country, else I.
    const { rows: apRows } = await client.query('select airport, country from airport where airport = any($1)', [[...airportsUsed]]);
    const countryByAirport = new Map(apRows.map((r) => [r.airport, r.country]));
    const missingAirports = [...airportsUsed].filter((a) => !countryByAirport.has(a)).sort();
    const unknown = missingAirports.filter((a) => !KNOWN_AIRPORTS[a]);
    if (unknown.length) throw new Error(`airports missing from DB with no reference entry: ${unknown.join(', ')}`);
    for (const a of missingAirports) countryByAirport.set(a, KNOWN_AIRPORTS[a].country);
    const homeCountry = countryByAirport.get(rows[0]?.dep_arp) && airline === 'ET' ? 'ET' : airline;
    for (const r of rows) {
      r.seg_type = countryByAirport.get(r.dep_arp) === homeCountry && countryByAirport.get(r.arv_arp) === homeCountry ? 'D' : 'I';
    }
    const segCount = rows.reduce((m, r) => ((m[r.seg_type] = (m[r.seg_type] || 0) + 1), m), {});
    console.log('seg_type split:', segCount, '| flt_type FRT rows:', rows.filter((r) => r.flt_type === 'FRT').length);

    // Fleet reference rows to add (dropdown options come from this table).
    const { rows: fleetRows } = await client.query('select fleet from fleet');
    const haveFleets = new Set(fleetRows.map((r) => r.fleet));
    const fleetsToAdd = [...new Set(rows.map((r) => r.fleet))].filter((f) => !haveFleets.has(f)).sort();
    for (const f of fleetsToAdd) if (!KNOWN_FLEETS[f]) throw new Error(`fleet ${f} missing from DB with no reference entry`);
    console.log('fleet rows to add:', fleetsToAdd.join(', ') || 'none', '| airport rows to add:', missingAirports.join(', ') || 'none');

    const { rows: [{ n: existing }] } = await client.query('select count(*)::int n from flight where airline = $1', [airline]);
    console.log(`existing ${airline} flight rows${replace ? ' (will be deleted)' : ''}:`, existing);

    if (dryRun) {
      console.log('[dry-run] sample row:', rows[0]);
      console.log('[dry-run] sample overnight row:', rows.find((r) => r.sch_arv_dt_utc.slice(0, 10) > r.sch_dep_dt_utc.slice(0, 10)));
      return;
    }

    await client.query('begin');
    // Imported reference rows on this DB carry ids ahead of their identity sequences
    // (airport_pkey duplicate on plain insert) — resync before inserting.
    for (const tbl of ['airport', 'fleet', 'flight']) {
      await client.query(`select setval(pg_get_serial_sequence('${tbl}','id'), greatest((select coalesce(max(id),1) from ${tbl}), 1))`);
    }
    if (replace) {
      const del = await client.query('delete from flight where airline = $1', [airline]);
      console.log(`deleted ${del.rowCount} existing ${airline} flight rows`);
    }
    const { rows: [{ maxord }] } = await client.query('select coalesce(max(display_order),0)::int maxord from fleet');
    let ord = maxord;
    for (const f of fleetsToAdd) {
      const k = KNOWN_FLEETS[f];
      await client.query(
        `insert into fleet (fleet, description, display_order, fleet_grp, ac_type, restfacility, market_ac_type, body, created_by, updated_by)
         values ($1,$2,$3,$4,$5,0,$6,$7,'ssim-load','ssim-load')`,
        [f, k.description, ++ord, k.fleetGrp, f, k.market, k.body],
      );
    }
    for (const a of missingAirports) {
      const k = KNOWN_AIRPORTS[a];
      await client.query(
        `insert into airport (airport, airport_name, city, dir, zone_id, utc_standard_offset, country, created_by, updated_by)
         values ($1,$2,$1,'I',$3,$4,$5,'ssim-load','ssim-load')`,
        [a, k.name, k.zone, k.offset, k.country],
      );
    }
    await insertRows(client, rows);
    await client.query('commit');
    console.log(`inserted ${rows.length} flights, ${fleetsToAdd.length} fleet rows, ${missingAirports.length} airport rows`);
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
