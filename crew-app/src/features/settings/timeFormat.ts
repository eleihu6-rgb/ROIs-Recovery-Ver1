// ─── Time-zone aware leg-time formatter ───────────────────────────────────────
// Pure formatting helpers that turn a leg's stored times into a "DD MMM HH:MM"
// label according to the user's chosen display mode (settingsSlice).

import type { TimeZoneMode } from './settingsSlice';
import { FIXED_OFFSET_MIN } from './airportZones';

const MON = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const MON_INDEX: Record<string, number> = MON.reduce(
  (acc, m, i) => ((acc[m.toLowerCase()] = i), acc),
  {} as Record<string, number>,
);

/**
 * Parse a roster datetime ("DD MMM YYYY HHMM", e.g. "03 Jun 2026 0900") as a
 * real UTC instant. Returns null if the string doesn't match.
 */
export function parseRosterUTC(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const m = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2})(\d{2})$/);
  if (!m) {
    return null;
  }
  const [, d, mon, y, hh, mm] = m;
  const monIdx = MON_INDEX[mon.toLowerCase()];
  if (monIdx === undefined) {
    return null;
  }
  return new Date(
    Date.UTC(
      parseInt(y, 10),
      monIdx,
      parseInt(d, 10),
      parseInt(hh, 10),
      parseInt(mm, 10),
    ),
  );
}

/**
 * Parse an airport-local time ("YYYY-MM-DD HH:mm", e.g. "2026-06-03 16:00")
 * into a "DD MMM HH:MM" wall-clock label. Returns null if it doesn't match.
 */
function formatLocalWallClock(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) {
    return null;
  }
  const [, , mo, d, h, mi] = m;
  return `${d} ${MON[parseInt(mo, 10) - 1]} ${h}:${mi}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * UTC offset (minutes) of `timeZone` at `date`. Tries the engine's IANA tz data
 * first (DST-correct — same data timeanddate.com uses); falls back to a fixed
 * table for known no-DST zones. Returns null if neither is available.
 */
function offsetMinutes(date: Date, timeZone: string): number | null {
  try {
    // toLocaleString is more widely supported than formatToParts on Hermes.
    const s = date.toLocaleString('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      let h = parseInt(m[4], 10);
      if (h === 24) {
        h = 0; // some engines emit 24:00 for midnight
      }
      const asUTC = Date.UTC(
        parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10),
        h, parseInt(m[5], 10), m[6] ? parseInt(m[6], 10) : 0,
      );
      return Math.round((asUTC - date.getTime()) / 60000);
    }
  } catch {
    // fall through to fixed table
  }
  return FIXED_OFFSET_MIN[timeZone] ?? null;
}

/** Format a UTC instant in a given IANA timezone as "DD MMM HH:MM" (DST-aware). */
function formatInZone(date: Date, timeZone: string): string {
  const off = offsetMinutes(date, timeZone);
  if (off == null) {
    // Unknown zone with no engine support — show the raw UTC time rather than a date-only string.
    return `${pad2(date.getUTCDate())} ${MON[date.getUTCMonth()]} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
  }
  // Apply the offset manually, then read UTC fields (no further Intl needed).
  const shifted = new Date(date.getTime() + off * 60000);
  return `${pad2(shifted.getUTCDate())} ${MON[shifted.getUTCMonth()]} ${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
}

/**
 * The phone's current IANA timezone (for the 'device' display mode). Falls back
 * to UTC if the engine can't resolve it. Overridable in tests via opts.deviceTz.
 */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * The marker appended to every displayed duty time so the crew can see which
 * clock it is on (doc: time convention agreed 2026-09-11):
 *   L = airport local · B = base time · Z = UTC · '' for phone-local (the crew
 * knows their own phone's zone, so it carries no marker).
 */
export function zoneSuffix(mode: TimeZoneMode): string {
  if (mode === 'airport') {
    return 'L';
  }
  if (mode === 'base') {
    return 'B';
  }
  if (mode === 'utc') {
    return 'Z';
  }
  return '';
}

/** "HH:MM" + the mode marker, e.g. "10:10L" — never marks a dash/placeholder. */
export function withZoneSuffix(hhmm: string, mode: TimeZoneMode): string {
  return /^\d{2}:\d{2}$/.test(hhmm) ? `${hhmm}${zoneSuffix(mode)}` : hhmm;
}

/** "HH:MM" of a real instant in one IANA zone (DST-aware, fixed-table fallback). */
export function hhmmInZone(instant: Date, timeZone: string): string {
  const off = offsetMinutes(instant, timeZone) ?? 0;
  const shifted = new Date(instant.getTime() + off * 60000);
  return `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
}

/** "YYYY-MM-DD HH:mm" wall clock of an instant in one IANA zone. */
export function wallClockInZone(instant: Date, timeZone: string): string {
  const off = offsetMinutes(instant, timeZone) ?? 0;
  const s = new Date(instant.getTime() + off * 60000);
  return `${s.getUTCFullYear()}-${pad2(s.getUTCMonth() + 1)}-${pad2(s.getUTCDate())}`
    + ` ${pad2(s.getUTCHours())}:${pad2(s.getUTCMinutes())}`;
}

/**
 * "HH:MM" of an instant in whichever zone the display mode selects, marker
 * included. Used for the duty markers (report / wake up / leave home) that are
 * stored as instants rather than roster strings.
 */
export function hhmmForInstant(
  instant: Date,
  mode: TimeZoneMode,
  baseTz: string,
  airportTz: string,
  deviceTz?: string,
): string {
  const tz = mode === 'airport'
    ? airportTz
    : mode === 'base'
      ? baseTz
      : mode === 'device'
        ? deviceTz || deviceTimeZone()
        : 'UTC';
  return withZoneSuffix(hhmmInZone(instant, tz), mode);
}

export interface FormatLegTimeOpts {
  /** Roster UTC time "DD MMM YYYY HHMM" (real UTC for portal-captured legs). */
  flightDateUTC: string;
  /** Optional airport-local time "YYYY-MM-DD HH:mm" (crew-portal legs only). */
  localTime?: string;
  mode: TimeZoneMode;
  baseTz: string;
  /**
   * IANA zone of the airport this time belongs to (departure airport for a
   * departure, arrival airport for an arrival). Required for 'airport' mode
   * when `localTime` is absent — without it the only honest answer is UTC.
   */
  airportTz?: string;
  /** Override the phone timezone for 'device' mode (tests). */
  deviceTz?: string;
}

/**
 * Format a leg's departure/arrival time as "DD MMM HH:MM" per the display mode.
 *  • 'airport' — prefer the airport-local time; else fall back to the UTC roster
 *                time (CSV legs have no local time).
 *  • 'utc'     — show the UTC roster time as-is.
 *  • 'base'    — convert the UTC instant into the base timezone.
 */
export function formatLegTime(opts: FormatLegTimeOpts): string {
  const { flightDateUTC, localTime, mode, baseTz, airportTz } = opts;

  if (mode === 'airport') {
    const local = formatLocalWallClock(localTime);
    if (local) {
      return local;
    }
    // API-fed rosters carry UTC only, so resolve the airport's own zone rather
    // than printing the UTC clock under an airport label.
    const utc = parseRosterUTC(flightDateUTC);
    if (utc && airportTz) {
      return formatInZone(utc, airportTz);
    }
    return formatRosterShort(flightDateUTC);
  }

  if (mode === 'utc') {
    return formatRosterShort(flightDateUTC);
  }

  // mode === 'base' | 'device' — convert the UTC instant into the target zone.
  const tz = mode === 'device' ? opts.deviceTz || deviceTimeZone() : baseTz;
  const utc = parseRosterUTC(flightDateUTC);
  if (!utc) {
    return formatRosterShort(flightDateUTC);
  }
  return formatInZone(utc, tz);
}

// ─── Calendar date per display mode ───────────────────────────────────────────
// The postcard (Home) shows only a date range, but it MUST land on the same
// calendar day the trip cards show — so it has to follow the same mode logic as
// formatLegTime above (airport → local wall-clock date, utc → roster date,
// base → the UTC instant shifted into the base timezone).

export interface DisplayDate {
  year: number;
  monthIdx: number; // 0-11
  day: number;
}

/** Date part of an airport-local "YYYY-MM-DD HH:mm" string. */
function localWallClockDate(value: string | undefined): DisplayDate | null {
  if (!value) {
    return null;
  }
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    return null;
  }
  return { year: parseInt(m[1], 10), monthIdx: parseInt(m[2], 10) - 1, day: parseInt(m[3], 10) };
}

/** Date part of the roster "DD MMM YYYY HHMM" string, no timezone shift. */
function rosterDateOnly(value: string | undefined): DisplayDate | null {
  const utc = parseRosterUTC(value);
  if (!utc) {
    return null;
  }
  return { year: utc.getUTCFullYear(), monthIdx: utc.getUTCMonth(), day: utc.getUTCDate() };
}

/**
 * The calendar date a leg's departure/arrival is displayed on, per the chosen
 * mode. Mirrors {@link formatLegTime} so summary dates (e.g. the Home postcard)
 * line up exactly with the per-leg times on the trip cards.
 */
export function legDisplayDate(opts: FormatLegTimeOpts): DisplayDate | null {
  const { flightDateUTC, localTime, mode, baseTz, airportTz } = opts;

  if (mode === 'airport') {
    const local = localWallClockDate(localTime);
    if (local) {
      return local;
    }
    const utc = airportTz ? parseRosterUTC(flightDateUTC) : null;
    if (utc && airportTz) {
      const off = offsetMinutes(utc, airportTz) ?? 0;
      const shifted = new Date(utc.getTime() + off * 60000);
      return { year: shifted.getUTCFullYear(), monthIdx: shifted.getUTCMonth(), day: shifted.getUTCDate() };
    }
    return rosterDateOnly(flightDateUTC);
  }
  if (mode === 'utc') {
    return rosterDateOnly(flightDateUTC);
  }
  // mode === 'base' | 'device' — shift the real UTC instant into the target zone.
  const tz = mode === 'device' ? opts.deviceTz || deviceTimeZone() : baseTz;
  const utc = parseRosterUTC(flightDateUTC);
  if (!utc) {
    return rosterDateOnly(flightDateUTC);
  }
  const off = offsetMinutes(utc, tz) ?? 0;
  const shifted = new Date(utc.getTime() + off * 60000);
  return { year: shifted.getUTCFullYear(), monthIdx: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

/** "DD MMM YYYY HHMM" → "DD MMM HH:MM" without timezone conversion. */
function formatRosterShort(value: string): string {
  const m = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+\d{4}\s+(\d{2})(\d{2})$/);
  if (!m) {
    return value;
  }
  const [, d, mon, hh, mm] = m;
  const dd = d.padStart(2, '0');
  return `${dd} ${mon} ${hh}:${mm}`;
}
