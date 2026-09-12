#!/usr/bin/env node
/**
 * Generates `src/features/settings/airportCoords.ts` — the IATA → coordinate
 * lookup the Route-map view (great-circle lines, distance stat) needs.
 *
 * Source of truth is the LIVE `airport` table (lat/lon, name, country), not a
 * hand-typed list, so coverage matches the airports crew actually fly to. The
 * table is materialised at build time instead of fetched at runtime because the
 * app must render the map offline and for carriers whose roster arrives through
 * portal capture (TG / PR) rather than the mobile roster API (ET / F8).
 *
 * Regenerate:
 *   psql "$DATABASE_URL" -t -A -F$'\t' -c "
 *     with nets as (select distinct dep_arp a from flight union select distinct arv_arp from flight),
 *          rn   as (select distinct dep_arp a from roster_flight union select distinct arv_arp from roster_flight)
 *     select n.a, ap.airport_name, ap.country, ap.latitude, ap.longitude
 *       from (select a from nets union select a from rn) n
 *       left join airport ap on ap.airport = n.a
 *      order by n.a" > /tmp/crew_airports.tsv
 *   node scripts/genAirportCoords.mjs /tmp/crew_airports.tsv
 *
 * `scripts/data/extraAirports.txt` adds codes a captured portal roster can carry
 * that the SIT `flight` table never had (see that file's header). Those codes are
 * looked up in the same way, so one psql dump covers both sets:
 *   psql "$DATABASE_URL" -t -A -F$'\t' -c "
 *     select ap.airport, ap.airport_name, ap.country, ap.latitude, ap.longitude
 *       from airport ap where ap.airport in (...codes...)
 *      order by ap.airport" >> /tmp/crew_airports.tsv
 *
 * The 6 airports the live table carries without coordinates stay `null` here on
 * purpose (no invented values) — they are counted in the month stats but draw no
 * route line.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const input = process.argv[2] || '/tmp/crew_airports.tsv';
const extraPath = process.argv[3] || path.join(here, 'data', 'extraAirports.txt');
const out = path.join(here, '..', 'src', 'features', 'settings', 'airportCoords.ts');

/** "Addis Ababa Bole International Airport" → "Addis Ababa Bole"; keeps names
 *  that carry no noise word intact. */
function shortName(raw) {
  return String(raw || '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s+(International|Intl\.?|Regional|Municipal|Air\s?field)?\s*Airport.*$/i, '')
    .replace(/\s+(International|Intl\.?)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const lines = fs.readFileSync(input, 'utf8').split('\n').filter(l => l.trim());
if (fs.existsSync(extraPath)) {
  const extra = fs
    .readFileSync(extraPath, 'utf8')
    .split('\n')
    .map(l => l.replace(/#.*$/, '').trim().toUpperCase())
    .filter(l => /^[A-Z]{3}$/.test(l));
  const have = new Set(lines.map(l => l.split('\t')[0].trim().toUpperCase()));
  const missing = extra.filter(c => !have.has(c));
  if (missing.length) {
    console.warn(`note: ${missing.length} extra code(s) not present in the dump: ${missing.join(', ')}`);
  }
}
const rows = [];
for (const line of lines) {
  const [code, name, _city, country, lat, lon] = line.split('\t');
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) continue;
  const latN = Number.parseFloat(lat);
  const lonN = Number.parseFloat(lon);
  const hasCoord = Number.isFinite(latN) && Number.isFinite(lonN);
  rows.push({
    code: c,
    label: shortName(name) || c,
    country: String(country || '').trim().toUpperCase() || null,
    lat: hasCoord ? Math.round(latN * 10000) / 10000 : null,
    lon: hasCoord ? Math.round(lonN * 10000) / 10000 : null,
  });
}
rows.sort((a, b) => a.code.localeCompare(b.code));

const body = rows
  .map(r =>
    `  ${r.code}: { label: ${JSON.stringify(r.label)}, country: ${r.country ? JSON.stringify(r.country) : 'null'}, ` +
    `lat: ${r.lat === null ? 'null' : r.lat}, lon: ${r.lon === null ? 'null' : r.lon} },`)
  .join('\n');

const file = `// ─── IATA airport → coordinate + label ───────────────────────────────────────
// GENERATED FILE — do not edit by hand: node scripts/genAirportCoords.mjs <tsv>
// Source: the live \`airport\` table (latitude / longitude / airport_name / country)
// for every airport in \`flight\` ∪ \`roster_flight\`. ${rows.length} airports.
//
// Consumers: the Schedule tab's Route-map view (great-circle lines, distance
// stat, route list). A null lat/lon means the airline's own reference table has
// no coordinate for that airport yet — the airport still counts in the stats but
// draws no line.

export interface AirportCoord {
  /** Human label without the "…International Airport" noise: "Addis Ababa Bole". */
  label: string;
  /** ISO-3166 alpha-2 country, for the month's "countries" stat. */
  country: string | null;
  lat: number | null;
  lon: number | null;
}

export const AIRPORT_COORDS: Record<string, AirportCoord> = {
${body}
};

/** Coordinate for an IATA code, or null when the airport (or its position) is unknown. */
export function airportCoord(code: string | null | undefined): AirportCoord | null {
  if (!code) return null;
  return AIRPORT_COORDS[code.trim().toUpperCase()] ?? null;
}

/** Airport label for display: the table's short name, else the code itself. */
export function airportLabel(code: string | null | undefined): string {
  const c = String(code || '').trim().toUpperCase();
  return airportCoord(c)?.label || c;
}
`;

fs.writeFileSync(out, file);
const withCoords = rows.filter(r => r.lat !== null).length;
console.log(`wrote ${path.relative(process.cwd(), out)} — ${rows.length} airports, ${withCoords} with coordinates`);
