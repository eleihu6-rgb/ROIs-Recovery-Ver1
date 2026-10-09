// ─────────────────────────────────────────────────────────────────────────────
// DEMO DATA — airport-ops grid for one flight leg (Trip Details).
//
// Replace with a real airport-ops feed (A-CDM / AODB). Only STD is real (the
// leg's filed schedule); ETD is real when the roster carries an estimate (else
// it repeats STD). Everything else here is a plausible, DETERMINISTIC stand-in
// seeded from flight number + date + airport, so the same flight always shows
// the same values. Pure: no clock, no Math.random, no network.
//
// Rules (minutes relative to the departure anchor — ETD, which equals STD when
// the flight has no estimate, so a delayed flight's boarding moves with it):
//   • Check-in   counters OPEN  STD − 180 (international) / − 120 (domestic).
//                Anchored on STD, not ETD: counters open on the filed schedule.
//                Domestic = both airports in one country (small PR/TG/ET table,
//                else same IANA zone — demo heuristic).
//   • Boarding   starts ETD − 30 (narrowbody) / − 40 (widebody: B747/767/777/787,
//                A330/340/350/380).
//   • Door close ETD − 10.
//   • TCD        "target clearance/calculated departure" — read as the target
//                time ATC clearance is delivered, ETD − 5 + seeded 0…2.
//   • TSAT       target start-up approval time, ETD − 5 + seeded 0…3.
//   • Off-block  ETD + seeded 0…5.
//   • Terminal / gate / stand at the departure airport, belt at the ARRIVAL
//     airport (where the crew collects bags).
//
// Times are shifted on the leg's own displayed STD clock ("21:55L"), so they
// carry the same zone suffix as every other time on the screen; a shift that
// crosses midnight appends the app's day-offset convention ("23:40L -1",
// "00:05L +1").
// ─────────────────────────────────────────────────────────────────────────────
import { airportZone } from '../settings/airportZones';
import { parseRosterUTC } from '../settings/timeFormat';

export interface FlightOpsInput {
  fltNumber: string;
  /** Departure / arrival IATA codes. */
  dep: string;
  arv: string;
  /** Short fleet code ("A321", "B787", "7M8"). */
  fleet: string;
  /** Filed departure, roster UTC string ("08 Sep 2026 2155"). */
  stdUtc: string;
  /** Estimated (or actual) departure, ISO UTC, when the roster has one. */
  etdUtc?: string;
  /** STD as the app displays it, "HH:MM" + zone suffix ("21:55L"). */
  stdClock: string;
}

export interface FlightOpsCell {
  key: string;
  label: string;
  value: string;
}

/** 3 rows × 4 cells, in display order. */
export type FlightOpsGrid = FlightOpsCell[][];

/** FNV-1a — stable across renders and sessions. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Shift a displayed clock ("21:55L") by `deltaMin`, keeping its suffix and adding
 * " +1" / " -1" when the result lands on the next / previous day.
 */
export function shiftClock(clock: string, deltaMin: number): string {
  const m = clock.match(/^(\d{2}):(\d{2})(.*)$/);
  if (!m) return '—';
  const total = Number(m[1]) * 60 + Number(m[2]) + Math.round(deltaMin);
  const day = Math.floor(total / 1440);
  const mins = ((total % 1440) + 1440) % 1440;
  const offset = day === 0 ? '' : ` ${day > 0 ? '+' : ''}${day}`;
  return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}${m[3]}${offset}`;
}

export function isWidebody(fleet: string): boolean {
  return /^[AB]?(7[4678]|3[345]|38)/.test((fleet || '').toUpperCase());
}

/** Home-carrier domestic networks (PR / TG / ET); other airports fall back to the zone. */
const COUNTRY: Record<string, string> = Object.fromEntries([
  ...['MNL', 'CEB', 'DVO', 'ILO', 'KLO', 'BCD', 'TAG', 'PPS', 'ZAM', 'CRK', 'GES', 'TAC', 'CGY', 'USU'].map(c => [c, 'PH']),
  ...['BKK', 'DMK', 'CNX', 'HKT', 'KBV', 'USM', 'HDY', 'CEI', 'UTH', 'KKC', 'UBP'].map(c => [c, 'TH']),
  ...['ADD', 'DIR', 'BJR', 'GDQ', 'MQX', 'AWA', 'JIM', 'AXU', 'GMB', 'ASO'].map(c => [c, 'ET']),
]);

/** Domestic when both ends are in the same country (table above, else same known IANA zone). */
export function isDomestic(dep: string, arv: string): boolean {
  const d = (dep || '').toUpperCase(), r = (arv || '').toUpperCase();
  if (COUNTRY[d] || COUNTRY[r]) return COUNTRY[d] === COUNTRY[r];
  const a = airportZone(d);
  return a !== 'UTC' && a === airportZone(r);
}

interface AirportStyle {
  terminals: string[];
  /** Gate numbering: letter piers ("C3"), 3-digit ("112"), or plain ("19"). */
  gate: 'pier' | 'hundreds' | 'plain';
  beltPrefix: string;
}

const AIRPORT_STYLE: Record<string, AirportStyle> = {
  MNL: { terminals: ['T1', 'T3'], gate: 'hundreds', beltPrefix: 'M' },
  CEB: { terminals: ['T1', 'T2'], gate: 'plain', beltPrefix: 'C' },
  BKK: { terminals: ['T1'], gate: 'pier', beltPrefix: '' },
  DMK: { terminals: ['T1', 'T2'], gate: 'plain', beltPrefix: '' },
  ADD: { terminals: ['T2'], gate: 'plain', beltPrefix: '' },
  HKG: { terminals: ['T1'], gate: 'plain', beltPrefix: '' },
  SIN: { terminals: ['T1', 'T2', 'T3'], gate: 'pier', beltPrefix: '' },
  NRT: { terminals: ['T1', 'T2'], gate: 'plain', beltPrefix: '' },
  HND: { terminals: ['T3'], gate: 'hundreds', beltPrefix: '' },
  DXB: { terminals: ['T1', 'T3'], gate: 'pier', beltPrefix: '' },
};
const DEFAULT_STYLE: AirportStyle = { terminals: ['T1', 'T2'], gate: 'plain', beltPrefix: '' };

const styleFor = (iata: string) => AIRPORT_STYLE[(iata || '').toUpperCase()] ?? DEFAULT_STYLE;

function gateFor(style: AirportStyle, seed: number): string {
  if (style.gate === 'pier') return `${'ABCDEFG'[seed % 7]}${(seed >> 3) % 9 + 1}`;
  if (style.gate === 'hundreds') return String(101 + ((seed >> 3) % 35));
  return String(1 + ((seed >> 3) % 30));
}

export function flightOpsDemo(input: FlightOpsInput): FlightOpsGrid {
  const dep = (input.dep || '').toUpperCase();
  const arv = (input.arv || '').toUpperCase();
  const std = parseRosterUTC(input.stdUtc);
  const etd = input.etdUtc ? new Date(input.etdUtc) : null;
  // ETD relative to STD in minutes (0 when there is no usable estimate).
  const etdDelta = std && etd && !Number.isNaN(etd.getTime())
    ? Math.round((etd.getTime() - std.getTime()) / 60000)
    : 0;
  const seed = hash(`${input.fltNumber.trim()}|${input.stdUtc}|${dep}`);
  const at = (delta: number) => shiftClock(input.stdClock, delta);

  const depStyle = styleFor(dep);
  const arvStyle = styleFor(arv);
  const beltSeed = hash(`belt|${input.fltNumber.trim()}|${input.stdUtc}|${arv}`);

  return [
    [
      { key: 'std', label: 'STD', value: at(0) },
      { key: 'etd', label: 'ETD', value: at(etdDelta) },
      { key: 'tcd', label: 'TCD', value: at(etdDelta - 5 + (seed % 3)) },
      { key: 'tsat', label: 'TSAT', value: at(etdDelta - 5 + ((seed >> 2) % 4)) },
    ],
    [
      { key: 'checkin', label: 'Check-in', value: at(isDomestic(dep, arv) ? -120 : -180) },
      { key: 'boarding', label: 'Boarding', value: at(etdDelta - (isWidebody(input.fleet) ? 40 : 30)) },
      { key: 'door', label: 'Door close', value: at(etdDelta - 10) },
      { key: 'offblock', label: 'Off-block', value: at(etdDelta + ((seed >> 4) % 6)) },
    ],
    [
      { key: 'terminal', label: 'Terminal', value: depStyle.terminals[seed % depStyle.terminals.length] },
      { key: 'gate', label: 'Gate', value: gateFor(depStyle, seed) },
      { key: 'stand', label: 'Stand', value: String(101 + ((seed >> 6) % 199)) },
      { key: 'belt', label: 'Belt', value: `${arvStyle.beltPrefix}${pad2(1 + (beltSeed % 12))}` },
    ],
  ];
}
