// ─── Clock alarm computation (Clock Setup Ver1) ──────────────────────────────
// Pure logic: from the crew's trips (duties), compute the Wake Up and Leave Home
// alarms for each duty, expressed in the departure airport's LOCAL time.
//
// Rules (per doc/Clock Setup Ver1):
//   • One alarm pair per check-in duty, anchored to the duty's FIRST flight.
//   • Wake Up / Get Ready = departure - 4h (default; wording per readyWord)
//   • Leave Home = departure - 3h (default)
//   • Check-in  = departure - 2h (shown in the label)
//   • Times are in the departure airport's local timezone.

import type { Trip } from '../travel/tripCsv';
import { AIRPORT_TZ } from './airportZones';

export interface AlarmOptions {
  wakeUpHoursBefore: number;
  leaveHomeHoursBefore: number;
  checkInHoursBefore: number;
}

export const DEFAULT_ALARM_OPTIONS: AlarmOptions = {
  wakeUpHoursBefore: 4,
  leaveHomeHoursBefore: 3,
  checkInHoursBefore: 2,
};

/** Selectable "hours before departure" presets, shared by every alarm picker. */
export const PRESET_HOURS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6];

/**
 * Build a full AlarmOptions from the user-chosen Wake Up / Leave Home offsets.
 * Check-in stays fixed at the default (the label-only −2h marker).
 */
export function alarmOptions(
  wakeUpHoursBefore: number,
  leaveHomeHoursBefore: number,
): AlarmOptions {
  return {
    wakeUpHoursBefore,
    leaveHomeHoursBefore,
    checkInHoursBefore: DEFAULT_ALARM_OPTIONS.checkInHoursBefore,
  };
}

export interface AlarmInstant {
  /** Absolute instant of the alarm. */
  instant: Date;
  /** Local wall-clock components in the departure timezone. */
  local: { year: number; month: number; day: number; hour: number; minute: number };
  /** "HH:MM" local 24h time, e.g. "07:00". */
  hhmm: string;
}

export interface DutyAlarm {
  dutyId: string;
  fltNumber: string;
  dep: string;
  arv: string;
  timeZone: string;
  departureUTC: string;
  wakeUp: AlarmInstant;
  leaveHome: AlarmInstant;
  /** Local check-in time, e.g. "03 Jun 0900". */
  checkInLabel: string;
  /** "Wake Up" or "Get Ready", chosen from the alarm's local hour (see readyWord). */
  wakeWord: ReadyWord;
  wakeUpLabel: string;
  leaveHomeLabel: string;
}

// IATA airport → IANA timezone. Extend as needed; covers the sample + common hubs.
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Parse a roster "Flight Date UTC" string ("03 Jun 2026 0300") as a real UTC
 * instant. (tripCsv.parseTripDate parses in local time, which is wrong for the
 * timezone math the alarms need.)
 */
export function parseRosterDateUTC(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const m = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2})(\d{2})$/);
  if (!m) {
    return null;
  }
  const day = parseInt(m[1], 10);
  const monKey = m[2][0].toUpperCase() + m[2].slice(1, 3).toLowerCase();
  const month = MONTHS.indexOf(monKey);
  if (month < 0) {
    return null;
  }
  const year = parseInt(m[3], 10);
  const hour = parseInt(m[4], 10);
  const minute = parseInt(m[5], 10);
  return new Date(Date.UTC(year, month, day, hour, minute));
}

export function airportTimeZone(iata: string): string {
  // Fall back to UTC for unknown airports so computation never throws.
  return AIRPORT_TZ[iata?.toUpperCase()] ?? 'UTC';
}

/** Break an absolute instant into local wall-clock parts for a timezone. */
function localParts(instant: Date, timeZone: string): AlarmInstant['local'] {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0';
  let hour = parseInt(get('hour'), 10);
  // Intl can emit "24" for midnight with hour12:false — normalise to 0.
  if (hour === 24) {
    hour = 0;
  }
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour,
    minute: parseInt(get('minute'), 10),
  };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toAlarmInstant(instant: Date, timeZone: string): AlarmInstant {
  const local = localParts(instant, timeZone);
  return {
    instant,
    local,
    hhmm: `${pad(local.hour)}:${pad(local.minute)}`,
  };
}

/** Format a local instant as "03 Jun 0900" for labels. */
export function shortLocal(instant: Date, timeZone: string): string {
  const p = localParts(instant, timeZone);
  return `${pad(p.day)} ${MONTHS[p.month - 1]} ${pad(p.hour)}${pad(p.minute)}`;
}

export function minusHours(d: Date, hours: number): Date {
  return new Date(d.getTime() - hours * 3600_000);
}

/** The two names the first (−Nh) alarm can carry. */
export type ReadyWord = 'Wake Up' | 'Get Ready';

/**
 * "Wake Up" only reads right when the alarm actually lands in the morning — an
 * afternoon or night duty's −4h alarm finds the crew already awake. Pick the
 * wording from the alarm's own LOCAL hour in the departure airport's timezone:
 * 02:00–10:59 → "Wake Up", everything else → "Get Ready".
 */
export function readyWord(localHour: number): ReadyWord {
  return localHour >= 2 && localHour < 11 ? 'Wake Up' : 'Get Ready';
}

// Per-duty override: null hours = alarm removed for that duty.
export interface DutyAlarmOverride {
  wakeUpHours: number | null;
  leaveHomeHours: number | null;
}

// Computed alarm for a single duty, with nullable wake/leave (null = disabled).
export interface EffectiveAlarm {
  dutyId: string;
  fltNumber: string;
  dep: string;
  arv: string;
  timeZone: string;
  departureUTC: string;
  wakeUp: AlarmInstant | null;
  leaveHome: AlarmInstant | null;
  checkInLabel: string;
  /** "Wake Up" or "Get Ready", chosen from the alarm's local hour (see readyWord). */
  wakeWord: ReadyWord;
  wakeUpLabel: string;
  leaveHomeLabel: string;
}

/**
 * Like computeDutyAlarms, but applies per-duty overrides so individual alarms
 * can use custom offsets or be disabled (null hours). Used for scheduling and
 * for displaying alarm times on trip cards.
 */
export function computeEffectiveAlarms(
  trips: Trip[],
  globalOptions: AlarmOptions,
  overrides: Record<string, DutyAlarmOverride> = {},
): EffectiveAlarm[] {
  const result: EffectiveAlarm[] = [];
  for (const trip of trips) {
    const first = trip.legs[0];
    if (!first) {
      continue;
    }
    const dep = parseRosterDateUTC(first.flightDateUTC);
    if (!dep) {
      continue;
    }
    const override = overrides[trip.id];
    const wakeHours = override !== undefined ? override.wakeUpHours : globalOptions.wakeUpHoursBefore;
    const leaveHours = override !== undefined ? override.leaveHomeHours : globalOptions.leaveHomeHoursBefore;

    const tz = airportTimeZone(first.depArp);
    const checkInInstant = minusHours(dep, globalOptions.checkInHoursBefore);
    const checkInLabel = shortLocal(checkInInstant, tz);
    const route = `${first.depArp} – ${first.arvArp}`;

    const wakeUp = wakeHours !== null ? toAlarmInstant(minusHours(dep, wakeHours), tz) : null;
    // With the alarm removed there is no instant to read the hour off — fall back
    // to what the global offset WOULD produce so the wording stays stable.
    const wordHour = (
      wakeUp ?? toAlarmInstant(minusHours(dep, globalOptions.wakeUpHoursBefore), tz)
    ).local.hour;
    const wakeWord = readyWord(wordHour);

    result.push({
      dutyId: trip.id,
      fltNumber: first.fltNumber,
      dep: first.depArp,
      arv: first.arvArp,
      timeZone: tz,
      departureUTC: first.flightDateUTC,
      wakeUp,
      leaveHome: leaveHours !== null ? toAlarmInstant(minusHours(dep, leaveHours), tz) : null,
      checkInLabel,
      wakeWord,
      wakeUpLabel: `${wakeWord} for Flight ${first.fltNumber}, ${route}, check in time at ${checkInLabel}`,
      leaveHomeLabel: `Leave Home for Flight ${first.fltNumber}, ${route}, check in time at ${checkInLabel}`,
    });
  }
  return result;
}

/**
 * Compute one Wake Up + Leave Home alarm pair per duty, anchored to the duty's
 * first flight, in the departure airport's local time. Duties whose first flight
 * has no parseable departure time are skipped.
 */
export function computeDutyAlarms(
  trips: Trip[],
  options: AlarmOptions = DEFAULT_ALARM_OPTIONS,
): DutyAlarm[] {
  const alarms: DutyAlarm[] = [];

  for (const trip of trips) {
    const first = trip.legs[0];
    if (!first) {
      continue;
    }
    const dep = parseRosterDateUTC(first.flightDateUTC);
    if (!dep) {
      continue;
    }

    const tz = airportTimeZone(first.depArp);
    const wakeUpInstant = minusHours(dep, options.wakeUpHoursBefore);
    const leaveHomeInstant = minusHours(dep, options.leaveHomeHoursBefore);
    const checkInInstant = minusHours(dep, options.checkInHoursBefore);
    const checkInLabel = shortLocal(checkInInstant, tz);

    const route = `${first.depArp} – ${first.arvArp}`;
    const wakeUp = toAlarmInstant(wakeUpInstant, tz);
    const wakeWord = readyWord(wakeUp.local.hour);

    alarms.push({
      dutyId: trip.id,
      fltNumber: first.fltNumber,
      dep: first.depArp,
      arv: first.arvArp,
      timeZone: tz,
      departureUTC: first.flightDateUTC,
      wakeUp,
      leaveHome: toAlarmInstant(leaveHomeInstant, tz),
      checkInLabel,
      wakeWord,
      wakeUpLabel: `${wakeWord} for Flight ${first.fltNumber}, ${route}, check in time at ${checkInLabel}`,
      leaveHomeLabel: `Leave Home for Flight ${first.fltNumber}, ${route}, check in time at ${checkInLabel}`,
    });
  }

  return alarms;
}
