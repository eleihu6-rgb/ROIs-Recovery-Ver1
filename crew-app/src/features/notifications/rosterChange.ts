// "Before → after" view model for a roster change (Crew Recovery Story 101 sick
// leave, plus any later Live duty change).
//
// live-server stores a structured payload on the crew_notification row, but the
// app used to receive only `title`/`body` — a sentence like "1 flight duty
// removed for 2026-09-11 – 2026-09-11; ILL added to your roster." A crew who
// wants to know what changed needs to SEE the duty they lost next to the duty
// they gained, so this module turns the payload into the two sides the alert
// renders. Parsing and formatting are pure here so the screen stays a shell and
// the behaviour is unit-testable without a simulator.
import {airportZone} from '../settings/airportZones';
import {formatLegTime, withZoneSuffix} from '../settings/timeFormat';
import type {TimeZoneMode} from '../settings/settingsSlice';
import {MON} from '../v2/model';

export interface RosterChangeLeg {
  fltNum: string;
  dep: string;
  arv: string;
  /** ISO-8601 UTC, from roster_flight.sch_str_dt_utc / sch_end_dt_utc. */
  std: string | null;
  sta: string | null;
  register: string;
  fleet: string;
}

export interface RosterChangeBefore {
  pairingId: number | null;
  /** Crew-base local date, YYYY-MM-DD. */
  date: string;
  legs: RosterChangeLeg[];
}

export interface RosterChangeAfter {
  /** Crew-base local date, YYYY-MM-DD. */
  date: string;
  assignment: string;
  label: string;
  base: string;
}

export interface RosterChange {
  kind: string;
  absenceType: string;
  assignment: string;
  fromDate: string;
  toDate: string;
  before: RosterChangeBefore[];
  after: RosterChangeAfter[];
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const num = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(str(value));
  return Number.isFinite(n) ? n : null;
};

function parseLeg(raw: unknown): RosterChangeLeg | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const dep = str(r.dep).toUpperCase();
  const arv = str(r.arv).toUpperCase();
  const fltNum = str(r.fltNum);
  // A leg with neither identity nor route cannot say anything useful.
  if (!fltNum && !dep && !arv) return null;
  return {
    fltNum,
    dep,
    arv,
    std: str(r.std) || null,
    sta: str(r.sta) || null,
    register: str(r.register),
    fleet: str(r.fleet),
  };
}

/**
 * Read the roster-change payload. Returns null when there is nothing to compare
 * — an older row written before the payload existed, a non-roster_change type,
 * or a stand-down with no duties removed and no day added.
 */
export function parseRosterChange(payload: unknown): RosterChange | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;

  const beforeRaw = Array.isArray(p.before) ? p.before : [];
  const before: RosterChangeBefore[] = [];
  for (const entry of beforeRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const legs = (Array.isArray(e.legs) ? e.legs : [])
      .map(parseLeg)
      .filter((leg): leg is RosterChangeLeg => leg !== null);
    if (legs.length === 0) continue;
    before.push({
      pairingId: num(e.pairingId),
      date: str(e.date),
      legs,
    });
  }

  const afterRaw = Array.isArray(p.after) ? p.after : [];
  const after: RosterChangeAfter[] = [];
  for (const entry of afterRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const assignment = str(e.assignment).toUpperCase();
    const label = str(e.label);
    if (!assignment && !label) continue;
    after.push({
      date: str(e.date),
      assignment,
      label,
      base: str(e.base).toUpperCase(),
    });
  }

  if (before.length === 0 && after.length === 0) return null;

  return {
    kind: str(p.kind),
    absenceType: str(p.absenceType),
    assignment: str(p.assignment).toUpperCase(),
    fromDate: str(p.fromDate),
    toDate: str(p.toDate),
    before,
    after,
  };
}

/** "2026-09-11" → "11 Sep" (the year is implied by the alert's own timestamp). */
export function formatDay(date: string): string {
  const m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return date || '';
  return `${Number(m[3])} ${MON[Number(m[2]) - 1] ?? ''}`.trim();
}

/** "ET422 · ADD → DMM" — only the parts the row actually carries. */
export function formatLegRoute(leg: RosterChangeLeg): string {
  const route = leg.dep && leg.arv ? `${leg.dep} → ${leg.arv}` : leg.dep || leg.arv;
  return [leg.fltNum, route].filter(Boolean).join(' · ');
}

/** "11 Sep 2026 0715" — the roster format the shared time formatter parses. */
function toRosterUtcString(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(
    d.getUTCHours(),
  )}${pad(d.getUTCMinutes())}`;
}

/**
 * "21:55L → 01:55L" in the crew's own display mode. Rendered through the shared
 * formatter so the alert, the schedule card and Trip Details can never disagree
 * about what a time means.
 */
export function formatLegWindow(
  leg: RosterChangeLeg,
  mode: TimeZoneMode,
  baseTz: string,
): string {
  const time = (iso: string | null, airport: string): string => {
    if (!iso) return '';
    const flightDateUTC = toRosterUtcString(iso);
    if (!flightDateUTC) return '';
    const hhmm = formatLegTime({
      flightDateUTC,
      mode,
      baseTz,
      airportTz: airportZone(airport),
    });
    const short = hhmm.match(/(\d{1,2}:\d{2})$/)?.[1] ?? hhmm;
    return withZoneSuffix(short, mode);
  };
  return [time(leg.std, leg.dep), time(leg.sta, leg.arv)].filter(Boolean).join(' → ');
}

/** "ILL · Sick leave" for the day the crew gained. */
export function formatAfterDuty(day: RosterChangeAfter): string {
  const label = day.label && day.label.toUpperCase() !== day.assignment ? day.label : '';
  return [day.assignment, label].filter(Boolean).join(' · ');
}

/**
 * One spoken sentence for a screen reader (and for a UI test): the alert row is
 * a single accessible element, so without this it would fall back to reading the
 * card's children in whatever order they happen to be laid out.
 */
export function describeRosterChange(
  change: RosterChange,
  mode: TimeZoneMode,
  baseTz: string,
): string {
  const before = change.before
    .flatMap(duty =>
      duty.legs.map(leg =>
        [formatLegRoute(leg), formatLegWindow(leg, mode, baseTz)].filter(Boolean).join(' '),
      ),
    )
    .join('; ');
  const after = change.after
    .map(day => [formatAfterDuty(day), formatDay(day.date)].filter(Boolean).join(' '))
    .join('; ');
  return [
    before ? `Before ${before}.` : '',
    after ? `After ${after}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
