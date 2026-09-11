// ─── Trip Trade · roster source ───────────────────────────────────────────────
// Maps the crew's ACTUAL captured roster (tripsSlice — populated by the TG/PR
// crew-portal capture) into the My Duty card shape. Pure + testable. No seed
// data: what the crew sees is their real duties.

import type { Trip, TripLeg } from '../travel/tripCsv';
import { checkInHhmm, fleetLabel } from '../travel/tripDisplay';
import type { TradeDuty } from './tripTradeModel';

const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_IDX: Record<string, number> = {};
MONTH.forEach((m, i) => { MONTH_IDX[m.toLowerCase()] = i; });

interface Ymd { y: number; mo: number; d: number; }

/** Extract calendar Y/M/D from "YYYY-MM-DD …" or "DD MMM YYYY …" (no timezone math). */
export function dateParts(s: string | undefined): Ymd | null {
  if (!s) {
    return null;
  }
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return { y: +m[1], mo: +m[2] - 1, d: +m[3] };
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (m) {
    const mo = MONTH_IDX[m[2].toLowerCase()];
    if (mo != null) {
      return { y: +m[3], mo, d: +m[1] };
    }
  }
  return null;
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
const isoOf = (p: Ymd) => `${p.y}-${pad2(p.mo + 1)}-${pad2(p.d)}`;
const dayCount = (p: Ymd) => Date.UTC(p.y, p.mo, p.d) / 86_400_000;

/** "TG640/TG641" → "TG640/641": keep the first number whole, strip the airline
 *  prefix from the rest so the pairing reads compactly. */
export function pairingLabel(legs: TripLeg[]): string {
  const nums = legs.map(l => l.fltNumber).filter(Boolean);
  if (nums.length === 0) {
    return 'Duty';
  }
  const [first, ...rest] = nums;
  return [first, ...rest.map(n => n.replace(/^[A-Za-z]+/, ''))].join('/');
}

/** The trip's display date string — prefer the airport-local dep, fall back to check-in / UTC. */
function tripDateStr(trip: Trip): string | undefined {
  const first = trip.legs[0];
  return first?.localDepTime || trip.checkInDateUTC || first?.flightDateUTC || undefined;
}

/** Map one captured trip into a My Duty card. Returns null if it has no usable date. */
export function tripToDuty(trip: Trip): TradeDuty | null {
  const legs = trip.legs ?? [];
  if (legs.length === 0) {
    return null;
  }
  const start = dateParts(tripDateStr(trip));
  if (!start) {
    return null;
  }
  const first = legs[0];
  const last = legs[legs.length - 1];
  const end = dateParts(last.localArvTime || last.arvDateUTC || last.flightDateUTC) ?? start;
  const durationDays = Math.max(1, dayCount(end) - dayCount(start) + 1);
  const jsDate = new Date(start.y, start.mo, start.d);
  const report =
    checkInHhmm(trip.checkInDateUTC) ||
    checkInHhmm(first.localDepTime || first.flightDateUTC || '') ||
    '';

  return {
    id: trip.id,
    date: isoOf(start),
    weekday: WEEKDAY[jsDate.getDay()],
    dayNum: pad2(start.d),
    monthLabel: MONTH[start.mo],
    pairing: pairingLabel(legs),
    dest: first.arvArp || last.arvArp || '',
    durationDays,
    report,
    fleet: fleetLabel(first.fleet || ''),
    published: false,
  };
}

/** Build the My Duty list from the captured roster for one crew, sorted by date. */
export function dutiesFromTrips(trips: Trip[], crewId?: string | null): TradeDuty[] {
  return trips
    .filter(t => !crewId || t.crewId === crewId)
    .map(tripToDuty)
    .filter((d): d is TradeDuty => d !== null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
