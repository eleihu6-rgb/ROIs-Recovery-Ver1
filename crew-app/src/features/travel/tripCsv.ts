// ─── Trip CSV parsing & classification ───────────────────────────────────────
// Pure, dependency-light logic for the "Add Trip" feature (doc/Add Trip Ver1).
// Parses a crew-roster CSV (see data/Crew Roster Sample.csv), groups rows into
// trips by check-in date, and classifies each trip as upcoming or past.

import { parseRosterUTC } from '../settings/timeFormat';

export interface TripLeg {
  crewId: string;
  fltNumber: string;
  flightDateUTC: string;
  depArp: string;
  arvDateUTC: string;
  arvArp: string;
  fleet: string;
  hotel: string;
  // Airport-LOCAL wall-clock times ("YYYY-MM-DD HH:mm"), present for crew-portal
  // captures (doc/App Flow Ver1: THAI portal shows all timing as airport local).
  // When set, these drive display + alarm local times; flightDateUTC stays UTC.
  localDepTime?: string;
  localArvTime?: string;
  /** Duty assignment from the portal, e.g. "FLY". */
  assignment?: string;
  /** Full hotel booking detail when the leg has a layover hotel (from detailAll). */
  hotelBooking?: import('./portalCapture').HotelBooking;
}

export interface Trip {
  id: string;
  crewId: string;
  checkInDateUTC: string;
  legs: TripLeg[];
  /** Layover hours for multi-leg trips: (outbound dep − inbound arr) − 3h check-in buffer. */
  layoverHours?: number;
}

export interface ClassifiedTrips {
  upcoming: Trip[];
  past: Trip[];
}

// CSV uses e.g. "01 Jun 2026 0100" (day, abbreviated month, year, 24h time).
//
// These columns are literally named "… UTC" and every producer hands us UTC wall
// clock (portalCapture → roisBaseToUTC, ekRosterApi → toLegacyRosterUtc), so the
// parse MUST be UTC. date-fns `parse` reads the string in the DEVICE's timezone,
// which shifted the past/upcoming boundary by the phone's offset: on a Vancouver
// phone a duty that ended 15:00Z still counted as "upcoming" at 21:50Z, so it kept
// its wake-up / leave-home markers while the previous day's identical duty had
// none. alarmSetup already worked around this with its own UTC parser.
export function parseTripDate(value: string | undefined): Date | null {
  return parseRosterUTC(value);
}

/** Split a single CSV line, honouring simple double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

export interface RawRow extends TripLeg {
  checkInDateUTC: string;
}

/**
 * Parse roster CSV text into raw rows. Columns are matched by header name
 * (case-insensitive) so column order can vary.
 */
export function parseRosterCsv(text: string): RawRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) {
    return [];
  }

  const header = splitCsvLine(lines[0]).map(h => h.toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const idx = {
    crewId: col('Crew ID'),
    checkIn: col('Check in Date UTC'),
    flt: col('Flt Number'),
    flightDate: col('Flight Date UTC'),
    dep: col('Dep Arp'),
    arvDate: col('Arv Date UTC'),
    arv: col('Arv Arp'),
    fleet: col('Fleet'),
    hotel: col('Hotel'),
  };

  const rows: RawRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const get = (j: number) => (j >= 0 && j < cells.length ? cells[j] : '');
    // Skip blank/garbage rows that have neither a flight number nor a crew id.
    if (!get(idx.flt) && !get(idx.crewId)) {
      continue;
    }
    rows.push({
      crewId: get(idx.crewId),
      checkInDateUTC: get(idx.checkIn),
      fltNumber: get(idx.flt),
      flightDateUTC: get(idx.flightDate),
      depArp: get(idx.dep),
      arvDateUTC: get(idx.arvDate),
      arvArp: get(idx.arv),
      fleet: get(idx.fleet),
      hotel: get(idx.hotel),
    });
  }
  return rows;
}

/**
 * Parse a wall-clock datetime to epoch ms. Accepts the local "YYYY-MM-DD HH:mm"
 * form (appends ":00" so it's a valid ISO-ish string) and leaves already-second
 * or "T"-delimited strings untouched; other formats yield NaN (caller skips).
 */
function wallClockToMs(s: string): number {
  const hasSeconds = s.includes('T') || (s.includes(':') && s.length > 16);
  return new Date(s.replace(' ', 'T') + (hasSeconds ? '' : ':00')).getTime();
}

/**
 * Group rows into trips. A new trip starts whenever Check-in Date is non-empty;
 * rows with an empty check-in belong to the preceding trip (its later legs).
 */
export function groupIntoTrips(rows: RawRow[]): Trip[] {
  const trips: Trip[] = [];
  let current: Trip | null = null;

  for (const r of rows) {
    const leg: TripLeg = {
      crewId: r.crewId,
      fltNumber: r.fltNumber,
      flightDateUTC: r.flightDateUTC,
      depArp: r.depArp,
      arvDateUTC: r.arvDateUTC,
      arvArp: r.arvArp,
      fleet: r.fleet,
      hotel: r.hotel,
      ...(r.localDepTime !== undefined ? { localDepTime: r.localDepTime } : {}),
      ...(r.localArvTime !== undefined ? { localArvTime: r.localArvTime } : {}),
      ...(r.assignment !== undefined ? { assignment: r.assignment } : {}),
    };

    if (r.checkInDateUTC.trim() !== '') {
      current = {
        id: `${r.crewId}-${r.checkInDateUTC}-${r.fltNumber}`,
        crewId: r.crewId,
        checkInDateUTC: r.checkInDateUTC,
        legs: [leg],
      };
      trips.push(current);
    } else if (current) {
      current.legs.push(leg);
    } else {
      current = {
        id: `${r.crewId}-ungrouped-${r.fltNumber}`,
        crewId: r.crewId,
        checkInDateUTC: '',
        legs: [leg],
      };
      trips.push(current);
    }
  }
  // Compute layover hours for multi-leg trips that have a hotel.
  // Formula: (outbound local dep time) − (inbound local arr time) − 3h buffer.
  // We look for the leg with a hotel (inbound) and the next leg (outbound).
  for (const trip of trips) {
    if (trip.legs.length < 2) continue;
    const hotelLegIdx = trip.legs.findIndex(l => l.hotel && l.hotel.trim().length > 0);
    if (hotelLegIdx < 0) continue;
    const inbound = trip.legs[hotelLegIdx];
    const outbound = trip.legs[hotelLegIdx + 1];
    if (!outbound) continue;
    const inArr  = inbound.localArvTime  || inbound.arvDateUTC;
    const outDep = outbound.localDepTime || outbound.flightDateUTC;
    if (!inArr || !outDep) continue;
    const arrMs  = wallClockToMs(inArr);
    const depMs  = wallClockToMs(outDep);
    if (isNaN(arrMs) || isNaN(depMs)) continue;
    const diffHours = (depMs - arrMs) / 3600000 - 3; // subtract 3h check-in buffer
    if (diffHours > 0) trip.layoverHours = Math.floor(diffHours);
  }

  return trips;
}

/** Earliest known datetime of a trip (check-in, else first departure). */
export function tripStartDate(trip: Trip): Date | null {
  const dates = [
    parseTripDate(trip.checkInDateUTC),
    ...trip.legs.map(l => parseTripDate(l.flightDateUTC)),
  ].filter((d): d is Date => d !== null);
  return dates.length
    ? new Date(Math.min(...dates.map(d => d.getTime())))
    : null;
}

/** Latest arrival datetime of a trip. */
export function tripEndDate(trip: Trip): Date | null {
  const dates = trip.legs
    .map(l => parseTripDate(l.arvDateUTC))
    .filter((d): d is Date => d !== null);
  return dates.length
    ? new Date(Math.max(...dates.map(d => d.getTime())))
    : null;
}

/**
 * Split trips into upcoming vs past relative to `now`. A trip is "past" once its
 * final arrival is before now; otherwise it is "upcoming". Upcoming trips are
 * sorted soonest-first, past trips most-recent-first.
 */
export function classifyTrips(trips: Trip[], now: Date): ClassifiedTrips {
  const nowMs = now.getTime();
  const upcoming: Trip[] = [];
  const past: Trip[] = [];

  // Parse each trip's start/end ONCE here — the sort comparators below would
  // otherwise re-parse every leg date O(n log n) times (date-fns parse is not
  // cheap). The cached start ms also feeds the comparators.
  const startMsByTrip = new Map<Trip, number>();
  for (const t of trips) {
    const start = tripStartDate(t);
    startMsByTrip.set(t, start?.getTime() ?? 0);
    const end = tripEndDate(t) ?? start;
    if (end && end.getTime() < nowMs) {
      past.push(t);
    } else {
      upcoming.push(t);
    }
  }

  const startMs = (t: Trip) => startMsByTrip.get(t) ?? 0;
  upcoming.sort((a, b) => startMs(a) - startMs(b));
  past.sort((a, b) => startMs(b) - startMs(a));

  return { upcoming, past };
}

/** Convenience: CSV text → classified trips. */
export function parseAndClassify(text: string, now: Date): ClassifiedTrips {
  return classifyTrips(groupIntoTrips(parseRosterCsv(text)), now);
}
