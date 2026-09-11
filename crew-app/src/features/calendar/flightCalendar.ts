// ─── Flight → iOS Calendar events ────────────────────────────────────────────
// Pure logic behind the calendar icon on each flight card: turn ONE duty into
// the set of events written to the device's default iOS calendar.
//
// Shape (option A3 — a separate entry per milestone, so the whole pre-flight
// timeline reads off the Day view without opening anything):
//
//   05:00  Wake Up · FA200          ← 15-min marker, duty-level (first leg)
//   06:00  Leave Home · FA200       ← 15-min marker, duty-level
//   07:00  Check-in FA200 · TPE     ← 15-min marker, duty-level
//   09:00  FA200 · TPE → YVR        ← real dep → arr block, ONE PER LEG
//
// Tapping the icon on any leg writes the whole duty (option B2): the Wake Up /
// Leave Home / Check-in markers exist once per duty — they're anchored to the
// first flight, exactly like the AlarmKit alarms — plus one block per leg.
//
// Offsets come from the crew's live alarm settings (option C1), including the
// per-duty override, so the calendar always agrees with the chips on the trip
// card. An override of `null` means "alarm removed for this duty" and that
// marker is left out of the calendar too.

import type { Trip, TripLeg } from '../travel/tripCsv';
import {
  airportTimeZone,
  minusHours,
  parseRosterDateUTC,
  readyWord,
  toAlarmInstant,
  type AlarmOptions,
  type DutyAlarmOverride,
} from '../settings/alarmSetup';

/** A calendar entry to create, in a shape the native EventKit bridge accepts. */
export interface CalendarEventDraft {
  /** Stable identity for the entry (debugging + test assertions). */
  key: string;
  title: string;
  /** Absolute instant, ISO-8601 with no milliseconds (native parses both). */
  startISO: string;
  endISO: string;
  /** IANA zone the event is pinned to — the DEPARTURE airport's. */
  timeZone: string;
  notes: string;
}

/** Duration of the Wake Up / Leave Home / Check-in markers. */
export const MARKER_MINUTES = 15;

/** Fallback block length when a leg has no parseable arrival time. */
const FALLBACK_FLIGHT_HOURS = 2;

function iso(d: Date): string {
  // Strip milliseconds — the native ISO8601DateFormatter is happier with
  // "…00Z" and it keeps the drafts readable in test failures.
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function plusMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

function hhmm(instant: Date, timeZone: string): string {
  return toAlarmInstant(instant, timeZone).hhmm;
}

/** Departure instant of a leg, or null when the roster row is unparseable. */
function legDeparture(leg: TripLeg): Date | null {
  return parseRosterDateUTC(leg.flightDateUTC);
}

/**
 * Arrival instant of a leg. Falls back to departure + 2h when the roster has no
 * usable arrival (or one that lands before departure), so a bad row still gets a
 * sane block instead of a zero-length or inverted event that iOS would reject.
 */
function legArrival(leg: TripLeg, dep: Date): Date {
  const arv = parseRosterDateUTC(leg.arvDateUTC);
  if (!arv || arv.getTime() <= dep.getTime()) {
    return new Date(dep.getTime() + FALLBACK_FLIGHT_HOURS * 3600_000);
  }
  return arv;
}

/**
 * The timeline pasted into every event's notes, so opening any one entry shows
 * the whole duty. Each time is LOCAL to its own airport, matching how the crew
 * portal presents the roster.
 */
function buildNotes(
  legs: TripLeg[],
  wakeAt: Date | null,
  leaveAt: Date | null,
  checkInAt: Date,
  depTz: string,
  word: string,
): string {
  const lines: string[] = [];
  if (wakeAt) {
    lines.push(`${word} ${hhmm(wakeAt, depTz)}`);
  }
  if (leaveAt) {
    lines.push(`Leave Home ${hhmm(leaveAt, depTz)}`);
  }
  lines.push(`Check-in ${hhmm(checkInAt, depTz)}`);

  const flights: string[] = [];
  for (const leg of legs) {
    const dep = legDeparture(leg);
    if (!dep) {
      continue;
    }
    const arv = legArrival(leg, dep);
    flights.push(
      `${leg.fltNumber}  ${leg.depArp} ${hhmm(dep, airportTimeZone(leg.depArp))}` +
        ` → ${leg.arvArp} ${hhmm(arv, airportTimeZone(leg.arvArp))}`,
    );
  }

  return [lines.join(' · '), ...flights, 'All times local to each airport.'].join('\n');
}

/**
 * Build every calendar entry for one duty. Returns [] when the duty has no legs
 * or its first flight has no parseable departure — there is nothing to anchor
 * the markers to.
 */
export function buildDutyCalendarEvents(
  trip: Trip,
  options: AlarmOptions,
  override?: DutyAlarmOverride,
): CalendarEventDraft[] {
  const first = trip.legs[0];
  if (!first) {
    return [];
  }
  const dep = legDeparture(first);
  if (!dep) {
    return [];
  }

  const depTz = airportTimeZone(first.depArp);
  const wakeHours = override !== undefined ? override.wakeUpHours : options.wakeUpHoursBefore;
  const leaveHours = override !== undefined ? override.leaveHomeHours : options.leaveHomeHoursBefore;
  const wakeAt = wakeHours !== null ? minusHours(dep, wakeHours) : null;
  const leaveAt = leaveHours !== null ? minusHours(dep, leaveHours) : null;
  const checkInAt = minusHours(dep, options.checkInHoursBefore);

  // Wording follows the alarm's own local hour; with the alarm removed, fall
  // back to where the global offset would have put it so the notes still read
  // sensibly for the remaining markers.
  const wordAt = wakeAt ?? minusHours(dep, options.wakeUpHoursBefore);
  const word = readyWord(toAlarmInstant(wordAt, depTz).local.hour);

  const notes = buildNotes(trip.legs, wakeAt, leaveAt, checkInAt, depTz, word);
  const marker = (key: string, title: string, at: Date): CalendarEventDraft => ({
    key,
    title,
    startISO: iso(at),
    endISO: iso(plusMinutes(at, MARKER_MINUTES)),
    timeZone: depTz,
    notes,
  });

  const events: CalendarEventDraft[] = [];
  if (wakeAt) {
    events.push(marker(`${trip.id}:wake`, `${word} · ${first.fltNumber}`, wakeAt));
  }
  if (leaveAt) {
    events.push(marker(`${trip.id}:leave`, `Leave Home · ${first.fltNumber}`, leaveAt));
  }
  events.push(
    marker(`${trip.id}:checkin`, `Check-in ${first.fltNumber} · ${first.depArp}`, checkInAt),
  );

  trip.legs.forEach((leg, i) => {
    const legDep = legDeparture(leg);
    if (!legDep) {
      return;
    }
    const legArv = legArrival(leg, legDep);
    events.push({
      key: `${trip.id}:flight:${i}`,
      title: `${leg.fltNumber} · ${leg.depArp} → ${leg.arvArp}`,
      startISO: iso(legDep),
      endISO: iso(legArv),
      timeZone: airportTimeZone(leg.depArp),
      notes,
    });
  });

  return events;
}
