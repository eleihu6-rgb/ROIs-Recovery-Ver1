// Home ▸ Quick actions ▸ Check-In — pure rules (nothing here renders).
//
// Mirrors the ROIS crew portal page `/portal/page/check-in` (PR TEST tenant,
// crew 421983), minus its "Check In Record" section. All times are LOCAL to the
// duty's departure airport, as on the portal ("All time in local").
//
// Data, in order of preference:
//  1. The portal's own task: GET /api/portal/checkIn/toCheckIn (checkInApi.ts).
//     `checkInStartTime` = earliest, `checkInEndTime` = scheduled (the roster
//     report time), `checkInLateTime` = latest, wall clocks in `dutyDepZoneId`.
//     When latest ≠ scheduled the portal shows "(Scheduled: …)" under latest.
//  2. No portal / portal unreachable → derived from the crew's roster (next trip
//     whose window has not closed), with these rules:
//       scheduled = the trip's report time (`checkInDateUTC`);
//                   if missing, STD − DEFAULT_REPORT_BEFORE_STD_MIN;
//       earliest  = scheduled − EARLIEST_BEFORE_SCHEDULED_MIN (2:00, as PR:
//                   17:15 → 15:15);
//       latest    = the first leg's STD. The portal's late window (PR: 22:44 for a
//                   19:00 STD) is a tenant setting the app cannot see offline, so
//                   the derived window never runs past the scheduled departure.
//
// Window phases (same as the portal's countdown):
//   before  now < earliest              count down to earliest, button disabled
//   open    earliest ≤ now ≤ scheduled  count down to latest,   button enabled
//   late    scheduled < now ≤ latest    count down to latest,   "Late check in"
//   closed  now > latest                no countdown,           button disabled
//
// The portal's locationVoList is the actual check-in point/geofence. The app
// has no live crew location source; the map never presents a fabricated one.
import { airportZone } from '../settings/airportZones';
import { hhmmInZone, parseRosterUTC, wallClockInZone } from '../settings/timeFormat';
import { positionOf, type LatLon } from '../v2/schedView';
import { MON } from '../v2/model';
import type { Trip } from '../travel/tripCsv';

export const EARLIEST_BEFORE_SCHEDULED_MIN = 120;
export const DEFAULT_REPORT_BEFORE_STD_MIN = 105;

// ─── Portal contract (/api/portal/checkIn/toCheckIn, captured on PR TEST) ─────
export interface ApiCheckInLocation { locationId?: number; radius?: number; longitude?: string; latitude?: string }
export interface ApiCheckInDetail {
  duty?: string;
  fltNum?: string | null;
  /** "14-Oct-2026 19:00", departure-airport local. */
  startTime?: string;
  /** "14-Oct-2026 23:40", arrival-airport local. */
  endTime?: string;
  dep?: string | null;
  arr?: string | null;
}
export interface ApiToCheckIn {
  dutyId?: number | string | null;
  /** "2026-10-14 15:15:00" — wall clocks in `dutyDepZoneId`. */
  checkInStartTime?: string | null;
  checkInEndTime?: string | null;
  checkInLateTime?: string | null;
  dutyDepZoneId?: string | null;
  lateCheckIn?: boolean;
  longitude?: string | null;
  latitude?: string | null;
  locationVoList?: ApiCheckInLocation[] | null;
  detailVoList?: ApiCheckInDetail[] | null;
}

// ─── App model ───────────────────────────────────────────────────────────────
export interface CheckInDutyRow {
  duty: string;
  fltNum: string;
  /** "19:00L" */
  start: string;
  dep: string;
  arr: string;
  /** "23:40L", "+1" appended when it lands on a later day than the card's day. */
  end: string;
}

export interface CheckInTask {
  dutyId: string;
  source: 'portal' | 'roster';
  /** IANA zone of the departure airport — the page's clock. */
  zone: string;
  earliestMs: number;
  scheduledMs: number;
  latestMs: number;
  /** "Wed 14 Oct" */
  dayLabel: string;
  /** "15:15L" / "17:15L" / "22:44L" */
  earliest: string;
  scheduled: string;
  latest: string;
  /** The check-in point (the departure airport), or null without coordinates. */
  location: LatLon | null;
  locationKind: 'checkin-point' | 'airport';
  locationRadiusM: number | null;
  dep: string;
  rows: CheckInDutyRow[];
}

export type CheckInPhase = 'before' | 'open' | 'late' | 'closed';

const pad = (n: number): string => String(n).padStart(2, '0');
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const local = (hhmm: string): string => `${hhmm}L`;

/** "YYYY-MM-DD HH:mm[:ss]" read as a wall clock in `zone` → the real instant. */
export function zonedWallToMs(wall: string, zone: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(wall.trim());
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const offsetAt = (ms: number): number => {
    const w = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(wallClockInZone(new Date(ms), zone));
    return w ? Date.UTC(+w[1], +w[2] - 1, +w[3], +w[4], +w[5]) - ms : 0;
  };
  // Two passes settle a DST edge; the zones crews report in rarely have one.
  let ms = asUtc - offsetAt(asUtc);
  ms = asUtc - offsetAt(ms);
  return ms;
}

/** Wall-clock parts of an instant in a zone. */
function wallParts(ms: number, zone: string): { y: number; mo: number; d: number; hhmm: string } {
  const w = wallClockInZone(new Date(ms), zone);
  return { y: +w.slice(0, 4), mo: +w.slice(5, 7) - 1, d: +w.slice(8, 10), hhmm: w.slice(11, 16) };
}

function dayLabelOf(ms: number, zone: string): string {
  const p = wallParts(ms, zone);
  return `${DOW[new Date(Date.UTC(p.y, p.mo, p.d)).getUTCDay()]} ${p.d} ${MON[p.mo]}`;
}

const num = (s: string | null | undefined): number | null => {
  const v = s == null ? NaN : parseFloat(s);
  return Number.isFinite(v) ? v : null;
};

const validPoint = (lat: number | null, lon: number | null): LatLon | null =>
  lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;

/** "14-Oct-2026 19:00" → { dayKey, hhmm } (no zone math: the portal already localised it). */
function portalStamp(s: string | undefined): { dayKey: number; hhmm: string } | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}):(\d{2})/.exec((s ?? '').trim());
  if (!m) return null;
  const mo = MON.findIndex(x => x.toLowerCase() === m[2].toLowerCase());
  return { dayKey: +m[3] * 10000 + (mo + 1) * 100 + +m[1], hhmm: `${m[4]}:${m[5]}` };
}

const withOffset = (hhmm: string, dayKey: number, cardDayKey: number): string =>
  `${local(hhmm)}${dayKey > cardDayKey ? ' +1' : ''}`;

/** The portal's task → the page model; null when the portal has no task. */
export function taskFromApi(api: ApiToCheckIn | null | undefined, fallbackZone = 'UTC'): CheckInTask | null {
  if (!api || api.dutyId == null || !api.checkInStartTime || !api.checkInEndTime) return null;
  const zone = api.dutyDepZoneId || fallbackZone;
  const earliestMs = zonedWallToMs(api.checkInStartTime, zone);
  const scheduledMs = zonedWallToMs(api.checkInEndTime, zone);
  const latestMs = zonedWallToMs(api.checkInLateTime || api.checkInEndTime, zone);
  if (earliestMs == null || scheduledMs == null || latestMs == null) return null;
  const hhmm = (wall: string) => local(wall.trim().slice(11, 16));
  const start = wallParts(earliestMs, zone);
  const cardDayKey = start.y * 10000 + (start.mo + 1) * 100 + start.d;
  const details = api.detailVoList ?? [];
  const dep = (details[0]?.dep ?? '').toUpperCase();
  // Only locationVoList carries an explicit check-in geofence. The top-level
  // coordinates are a separate portal field and must not be labelled as it.
  const checkInPlace = api.locationVoList?.find(v => validPoint(num(v.latitude), num(v.longitude)) !== null);
  const explicitPoint = checkInPlace ? validPoint(num(checkInPlace.latitude), num(checkInPlace.longitude)) : null;
  return {
    dutyId: String(api.dutyId),
    source: 'portal',
    zone,
    earliestMs,
    scheduledMs,
    latestMs,
    dayLabel: dayLabelOf(earliestMs, zone),
    earliest: hhmm(api.checkInStartTime),
    scheduled: hhmm(api.checkInEndTime),
    latest: hhmm(api.checkInLateTime || api.checkInEndTime),
    location: explicitPoint ?? positionOf(dep),
    locationKind: explicitPoint ? 'checkin-point' : 'airport',
    locationRadiusM: explicitPoint && checkInPlace?.radius && checkInPlace.radius > 0 ? checkInPlace.radius : null,
    dep,
    rows: details.map(d => {
      const s = portalStamp(d.startTime);
      const e = portalStamp(d.endTime);
      return {
        duty: d.duty || '—',
        fltNum: d.fltNum || '—',
        start: s ? withOffset(s.hhmm, s.dayKey, cardDayKey) : '—',
        dep: (d.dep || '—').toUpperCase(),
        arr: (d.arr || '—').toUpperCase(),
        end: e ? withOffset(e.hhmm, e.dayKey, cardDayKey) : '—',
      };
    }),
  };
}

/**
 * Airports the shared zone table (settings/airportZones.ts) does not carry yet,
 * so the roster rule would read them as UTC. MNL is PR's base. The real fix is
 * adding them to AIRPORT_TZ (owned elsewhere); drop entries here once it does.
 */
export const MISSING_AIRPORT_ZONES: Record<string, string> = { MNL: 'Asia/Manila' };

/** IANA zone of an airport for the check-in clock. */
export function checkInZone(iata: string): string {
  const z = airportZone(iata);
  return z === 'UTC' ? MISSING_AIRPORT_ZONES[iata.trim().toUpperCase()] ?? z : z;
}

/** Derived from the roster: the first trip (by STD) whose window has not closed. */
export function taskFromTrips(trips: Trip[], nowMs: number, zoneOf: (iata: string) => string = checkInZone): CheckInTask | null {
  const candidates = trips
    .map(trip => {
      const first = trip.legs[0];
      const std = parseRosterUTC(first?.flightDateUTC)?.getTime();
      if (!first || std == null) return null;
      const scheduledMs = parseRosterUTC(trip.checkInDateUTC)?.getTime() ?? std - DEFAULT_REPORT_BEFORE_STD_MIN * 60000;
      return { trip, std, scheduledMs };
    })
    .filter((c): c is { trip: Trip; std: number; scheduledMs: number } => c !== null && c.std >= nowMs)
    .sort((a, b) => a.std - b.std);
  const next = candidates[0];
  if (!next) return null;
  const { trip, std, scheduledMs } = next;
  const dep = (trip.legs[0].depArp || '').toUpperCase();
  const zone = zoneOf(dep) || 'UTC';
  const earliestMs = scheduledMs - EARLIEST_BEFORE_SCHEDULED_MIN * 60000;
  const latestMs = Math.max(std, scheduledMs);
  const start = wallParts(earliestMs, zone);
  const cardDayKey = start.y * 10000 + (start.mo + 1) * 100 + start.d;
  const stamp = (ms: number | undefined, z: string): string => {
    if (ms == null) return '—';
    const p = wallParts(ms, z);
    return withOffset(p.hhmm, p.y * 10000 + (p.mo + 1) * 100 + p.d, cardDayKey);
  };
  return {
    dutyId: trip.id,
    source: 'roster',
    zone,
    earliestMs,
    scheduledMs,
    latestMs,
    dayLabel: dayLabelOf(earliestMs, zone),
    earliest: local(hhmmInZone(new Date(earliestMs), zone)),
    scheduled: local(hhmmInZone(new Date(scheduledMs), zone)),
    latest: local(hhmmInZone(new Date(latestMs), zone)),
    location: positionOf(dep),
    locationKind: 'airport',
    locationRadiusM: null,
    dep,
    rows: trip.legs.map(l => ({
      duty: l.assignment || 'FLY',
      fltNum: (l.fltNumber || '').trim() || '—',
      start: stamp(parseRosterUTC(l.flightDateUTC)?.getTime(), zoneOf((l.depArp || '').toUpperCase()) || zone),
      dep: (l.depArp || '—').toUpperCase(),
      arr: (l.arvArp || '—').toUpperCase(),
      end: stamp(parseRosterUTC(l.arvDateUTC)?.getTime(), zoneOf((l.arvArp || '').toUpperCase()) || zone),
    })),
  };
}

export function checkInPhase(task: CheckInTask, nowMs: number): CheckInPhase {
  if (nowMs < task.earliestMs) return 'before';
  if (nowMs <= task.scheduledMs) return 'open';
  if (nowMs <= task.latestMs) return 'late';
  return 'closed';
}

/** Check In is only possible inside the window (open or late). */
export function canCheckIn(phase: CheckInPhase): boolean {
  return phase === 'open' || phase === 'late';
}

/** Whole seconds → "149:16:59" (hours are not capped at 24, as on the portal). */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export interface Countdown { phase: CheckInPhase; value: string; caption: string }

export function countdownFor(task: CheckInTask, nowMs: number): Countdown {
  const phase = checkInPhase(task, nowMs);
  if (phase === 'before') {
    return { phase, value: formatCountdown((task.earliestMs - nowMs) / 1000), caption: 'to the earliest check in time' };
  }
  if (phase === 'closed') return { phase, value: '--:--:--', caption: 'Check-in window closed' };
  return {
    phase,
    value: formatCountdown((task.latestMs - nowMs) / 1000),
    caption: phase === 'late' ? 'to the latest check in time · Late check in' : 'to the latest check in time',
  };
}

/** "09:58:01" in the duty's departure zone (offsets are whole minutes, so seconds carry over). */
export function nowClock(nowMs: number, zone: string): string {
  return `${hhmmInZone(new Date(nowMs), zone)}:${pad(new Date(nowMs).getUTCSeconds())}`;
}

/** "HH:MM" of an instant in the duty's zone (the dialog's "Checked in at"). */
export function hhmmAt(ms: number, zone: string): string {
  return hhmmInZone(new Date(ms), zone);
}
