// ─── Schedule tab: roster-view model (Ver11) ─────────────────────────────────
// Pure derivations for the three Schedule views. Everything here renders
// nothing and fetches nothing: the Calendar grid, the per-day timeline and the
// Route-map stats all read the SAME `MonthModel` the Timeline list already uses
// (`useMonth` → `buildMonth`), so the three views can never disagree about what
// the month contains.
//
// Reference: docs/superpowers/completed/crew-app-v2-mock.html (#mockVer 11) and
// docs/superpowers/specs/2026-09-11-crew-app-schedule-roster-views-design.md.

import { airportCoord } from '../settings/airportCoords';
import { parseRosterUTC } from '../settings/timeFormat';
import type { GroundDuty } from '../roster/dutyDisplay';
import type { IconName } from '../../components/v2/icons';
import { hasDutyCard, MON, type DayKind, type DayModel, type MonthModel } from './model';

/** Which of the three sibling views the Schedule tab shows. */
export type SchedViewMode = 'timeline' | 'calendar-compact' | 'calendar-detail' | 'route';

export interface SchedViewOption {
  mode: SchedViewMode;
  label: string;
  hint: string;
  /** Compact and detail are two modes of one roster view (menu shows one row). */
  picks: 'timeline' | 'calendar' | 'route';
}

/** The three rows of the "Roster view" menu (mock Ver11). */
export const SCHED_VIEWS: readonly SchedViewOption[] = [
  { mode: 'timeline', label: 'Timeline', hint: 'Scrolling duty list', picks: 'timeline' },
  { mode: 'calendar-compact', label: 'Calendar', hint: 'Month grid + day timeline', picks: 'calendar' },
  { mode: 'route', label: 'Route map', hint: 'Flown routes + month stats', picks: 'route' },
];

/** Which menu row is lit for a given view. */
export function viewPick(mode: SchedViewMode): SchedViewOption['picks'] {
  if (mode === 'calendar-compact' || mode === 'calendar-detail') return 'calendar';
  if (mode === 'route') return 'route';
  return 'timeline';
}

// ─── Geography ───────────────────────────────────────────────────────────────
/** Web-Mercator grid the generated world outline (`worldLand.ts`) is drawn in. */
export const MERCATOR_GRID = 1000;
const LAT_LIMIT = 85.05112878;
const EARTH_RADIUS_KM = 6371;
/** Card width ÷ height for the route map. Mercator is conformal, so the map is
 *  padded to this ratio rather than stretched. */
export const MAP_ASPECT = 1.35;
const MAP_PADDING = 60;

export function mercatorX(lon: number): number {
  return ((lon + 180) / 360) * MERCATOR_GRID;
}

export function mercatorY(lat: number): number {
  const clamped = Math.max(-LAT_LIMIT, Math.min(LAT_LIMIT, lat));
  const rad = (clamped * Math.PI) / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + rad / 2));
  return ((1 - y / Math.PI) / 2) * MERCATOR_GRID;
}

export interface LatLon {
  lat: number;
  lon: number;
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Position of an IATA code, or null when the reference table has no coordinate. */
export function positionOf(code: string | null | undefined): LatLon | null {
  const c = airportCoord(code);
  if (!c || c.lat === null || c.lon === null) return null;
  return { lat: c.lat, lon: c.lon };
}

const GREAT_CIRCLE_SAMPLES = 48;

/**
 * Great-circle (orthodrome) between two airports, sampled and projected into the
 * world outline's space — the curved line a crew actually flies, not the straight
 * line a flat map would draw. The path restarts ("M") when a step jumps the
 * antimeridian, so a trans-Pacific route never shoots back across the whole map.
 */
export function greatCirclePath(a: LatLon, b: LatLon, samples = GREAT_CIRCLE_SAMPLES): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const phi1 = toRad(a.lat);
  const lam1 = toRad(a.lon);
  const phi2 = toRad(b.lat);
  const lam2 = toRad(b.lon);
  const d = 2 * Math.asin(
    Math.sqrt(
      Math.sin((phi2 - phi1) / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin((lam2 - lam1) / 2) ** 2,
    ),
  );
  if (!Number.isFinite(d) || d === 0) {
    return `M${round1(mercatorX(a.lon))} ${round1(mercatorY(a.lat))}L${round1(mercatorX(b.lon))} ${round1(mercatorY(b.lat))}`;
  }
  let out = '';
  let prevX = Number.NaN;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const A = Math.sin((1 - t) * d) / Math.sin(d);
    const B = Math.sin(t * d) / Math.sin(d);
    const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
    const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
    const z = A * Math.sin(phi1) + B * Math.sin(phi2);
    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    const lon = toDeg(Math.atan2(y, x));
    const px = mercatorX(lon);
    const py = mercatorY(lat);
    const jump = Number.isFinite(prevX) && Math.abs(px - prevX) > MERCATOR_GRID / 3;
    out += `${out === '' || jump ? 'M' : 'L'}${round1(px)} ${round1(py)}`;
    prevX = px;
  }
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * The map's view box: everything the month touched, padded, at the card's aspect
 * ratio, then narrowed by `zoom` around its centre. Coordinates are the same
 * 0…1000 web-Mercator space the generated world outline lives in.
 */
export function routeViewBox(home: LatLon, points: LatLon[], zoom: number): string {
  const xs = [mercatorX(home.lon), ...points.map(p => mercatorX(p.lon))];
  const ys = [mercatorY(home.lat), ...points.map(p => mercatorY(p.lat))];
  let minX = Math.min(...xs) - MAP_PADDING;
  let maxX = Math.max(...xs) + MAP_PADDING;
  let minY = Math.min(...ys) - MAP_PADDING;
  let maxY = Math.max(...ys) + MAP_PADDING;
  let w = Math.max(1, maxX - minX);
  let h = Math.max(1, maxY - minY);
  if (w / h < MAP_ASPECT) {
    const target = h * MAP_ASPECT;
    minX -= (target - w) / 2;
    w = target;
  } else {
    const target = w / MAP_ASPECT;
    minY -= (target - h) / 2;
    h = target;
  }
  const cx = minX + w / 2;
  const cy = minY + h / 2;
  w /= Math.max(1, zoom);
  h /= Math.max(1, zoom);
  return `${round1(cx - w / 2)} ${round1(cy - h / 2)} ${round1(w)} ${round1(h)}`;
}

/** "12,480 km" — thousands separated, the unit crew talk in for route distance. */
export function formatKm(km: number): string {
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

/** "45:05" — hours:minutes, the roster's own duration shape. */
export function formatHM(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// ─── Month routes + summary (Route-map view) ─────────────────────────────────
export interface RouteDestination {
  code: string;
  label: string;
  country: string | null;
  /** Legs flown to this airport this month (a round trip counts 2). */
  legs: number;
  /** Great-circle distance from base, km. */
  km: number;
  position: LatLon;
}

export interface MonthStats {
  flights: number;
  km: number;
  blockMinutes: number;
  /** Report-to-release over every trip this month + counted ground duties. */
  dutyMinutes: number;
  routes: number;
  airports: number;
  countries: number;
}

interface LegLite {
  dep: string;
  arv: string;
}

/** Every leg of the month, in calendar order, with the airports as flown. */
export function monthLegs(month: MonthModel): LegLite[] {
  const out: LegLite[] = [];
  for (const day of month.days) {
    for (const { leg } of day.legs) {
      out.push({ dep: leg.dep, arv: leg.arv });
    }
  }
  return out;
}

/**
 * Destinations flown this month from the crew's base — ONE entry per airport, so
 * a return trip to the same city is one line on the map, not two overlapping
 * ones. Sorted nearest-first so the list under the map reads like the month's
 * reach. Airports the airline's reference table has no coordinate for are
 * counted in the stats but draw no line, so they are skipped here.
 */
export function monthRoutes(month: MonthModel, base: string): RouteDestination[] {
  const home = String(base || '').toUpperCase();
  const homePos = positionOf(home);
  const byCode = new Map<string, RouteDestination>();
  for (const leg of monthLegs(month)) {
    const code = leg.arv === home ? leg.dep : leg.arv;
    if (!code || code === home) continue;
    const pos = positionOf(code);
    if (!pos) continue;
    const existing = byCode.get(code);
    if (existing) {
      existing.legs += 1;
      continue;
    }
    const coord = airportCoord(code);
    byCode.set(code, {
      code,
      label: coord?.label || code,
      country: coord?.country ?? null,
      legs: 1,
      km: homePos ? haversineKm(homePos, pos) : 0,
      position: pos,
    });
  }
  return [...byCode.values()].sort((a, b) => a.km - b.km || a.code.localeCompare(b.code));
}

function groundMinutes(g: GroundDuty): number {
  const a = parseRosterUTC(g.startRosterUTC)?.getTime();
  const b = parseRosterUTC(g.endRosterUTC)?.getTime();
  if (a == null || b == null || b <= a) return 0;
  return Math.round((b - a) / 60000);
}

/**
 * Duty time on ONE day: report (the roster's check-in on the duty's first leg,
 * else an hour before the first departure) to the day's last arrival, with a
 * past-midnight arrival counted as the next day. A rest day inside a layover is
 * therefore no duty time, and an early report opens the figure as the crew
 * experiences it. A timed ground duty counts its own window.
 */
export function dayDutyMinutes(day: DayModel): number {
  if (day.legs.length) {
    const first = day.legs[0].leg;
    const last = day.legs[day.legs.length - 1].leg;
    const checkInMin = first.checkIn === '—' ? NaN : minutesOfDay(first.checkIn);
    const depMin = minutesOfDay(first.depTime);
    const endMark = minutesOfDay(last.arvTime);
    const start = Number.isFinite(checkInMin) ? checkInMin : depMin - 60;
    if (!Number.isFinite(start) || !Number.isFinite(endMark)) return 0;
    const end = endMark + (last.arvDayOffset ? 24 * 60 : 0);
    return Math.max(0, end - start);
  }
  if (day.ground && !day.ground.allDay) return groundMinutes(day.ground);
  return 0;
}

/**
 * Duty minutes for the month: the sum of every day's own duty window (see
 * dayDutyMinutes), so a multi-day rotation contributes its flying days and its
 * layover rest day contributes nothing.
 */
export function monthDutyMinutes(month: MonthModel): number {
  return month.days.reduce((total, day) => total + dayDutyMinutes(day), 0);
}

/** Month summary shown under the map: flights / distance / block / duty and the
 *  routes / airports / countries coverage. Distance and duty are derived here
 *  because `MonthModel` only carries the flight count and block minutes. */
export function monthStats(month: MonthModel, base: string): MonthStats {
  const home = String(base || '').toUpperCase();
  let km = 0;
  const airports = new Set<string>();
  const countries = new Set<string>();
  if (home) {
    airports.add(home);
    const c = airportCoord(home)?.country;
    if (c) countries.add(c);
  }
  for (const leg of monthLegs(month)) {
    const a = positionOf(leg.dep);
    const b = positionOf(leg.arv);
    if (a && b) km += haversineKm(a, b);
    for (const code of [leg.dep, leg.arv]) {
      if (!code) continue;
      airports.add(code);
      const c = airportCoord(code)?.country;
      if (c) countries.add(c);
    }
  }
  return {
    flights: month.flightCount,
    km,
    blockMinutes: month.blockMinutes,
    dutyMinutes: monthDutyMinutes(month),
    routes: monthRoutes(month, base).length,
    airports: airports.size,
    countries: countries.size,
  };
}

// ─── Calendar: month grid ────────────────────────────────────────────────────
export interface CalendarCell {
  day: number;
  key: number;
  kind: DayKind;
  isToday: boolean;
  /** Something is published for the day (duty, layover or a synced meeting). */
  hasContent: boolean;
  /** The airline actually published a flight — gets the plane glyph. */
  isFlight: boolean;
}

/** Month laid out as calendar weeks (Sunday-first) with nulls for the days of
 *  the first/last week that belong to another month. */
export function calendarWeeks(month: MonthModel): Array<Array<CalendarCell | null>> {
  const weeks: Array<Array<CalendarCell | null>> = [];
  let week: Array<CalendarCell | null> = [];
  const firstDow = new Date(month.year, month.monthIdx, 1).getDay();
  for (let i = 0; i < firstDow; i++) week.push(null);
  for (const day of month.days) {
    week.push({
      day: day.day,
      key: day.key,
      kind: day.kind,
      isToday: day.isToday,
      hasContent: hasDutyCard(day),
      isFlight: day.kind === 'flight',
    });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/**
 * Tapping the already-selected day clears the filter back to the whole month
 * (mock behaviour — a second tap is not a no-op). Tapping another day selects it.
 */
export function toggleCalendarSelection(selected: number | null, day: number): number | null {
  return selected === day ? null : day;
}

// ─── Calendar: agenda ────────────────────────────────────────────────────────
export interface AgendaRow {
  id: string;
  /** Day this row belongs to — tapping it opens that day's timeline. */
  day: number;
  icon: IconName;
  title: string;
  /** Date line on the month agenda, plus the calendar-event source. */
  sub: string;
  /** "07:15–08:35", or "" when the event has no window (layover). */
  time: string;
}

const KIND_ICON: Record<DayKind, IconName> = {
  flight: 'jet',
  layover: 'bed',
  standby: 'clock',
  training: 'book',
  ground: 'house',
  off: 'house',
};

function hhmm(local: string, fallbackRoster?: string): string {
  const m = String(local || '').match(/(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  const d = parseRosterUTC(fallbackRoster);
  return d ? `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` : '';
}

function minutesOfDay(text: string): number {
  const m = String(text || '').match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/** "HH:MM–HH:MM", or "" when either end is unknown. */
function window(from: string, to: string): string {
  return from && to ? `${from}–${to}` : '';
}

/**
 * Rows for one day, or for the whole month when `selected` is null (the mock's
 * deselect-to-month behaviour). Read straight off the day model the Timeline
 * view renders — a flight day lists its legs, a duty day its duty, a layover its
 * city, and every day its synced calendar events.
 */
export function agendaRows(month: MonthModel, selected: number | null): AgendaRow[] {
  const scope = selected === null ? month.days : month.days.filter(d => d.day === selected);
  const rows: AgendaRow[] = [];
  for (const d of scope) {
    const dateLine = `${d.dow} ${d.day} ${MON[month.monthIdx]}`;
    // The agenda header already names the day when one is selected, so the row
    // only repeats the date on the whole-month agenda.
    const sub = (extra?: string) => [selected === null ? dateLine : '', extra].filter(Boolean).join(' · ');
    for (const { leg } of d.legs) {
      rows.push({
        id: `flight-${d.key}-${leg.fltNumber}`,
        day: d.day,
        icon: 'jet',
        title: `${leg.fltNumber} ${leg.dep} → ${leg.arv}`,
        sub: sub(),
        time: window(leg.depTime, leg.arvTime),
      });
    }
    if (d.legs.length === 0 && d.kind === 'layover') {
      const code = d.layoverTrip?.legs[0]?.arvArp ?? '';
      rows.push({
        id: `layover-${d.key}`,
        day: d.day,
        icon: KIND_ICON.layover,
        title: `Layover${code ? ` · ${code}` : ''}`,
        sub: sub(),
        time: '',
      });
    }
    if (d.ground && d.legs.length === 0) {
      const g = d.ground;
      rows.push({
        id: `ground-${g.id}`,
        day: d.day,
        icon: KIND_ICON[d.kind],
        title: g.label || d.kind,
        sub: sub(),
        time: g.allDay ? '' : window(hhmm(g.localStart, g.startRosterUTC), hhmm(g.localEnd, g.endRosterUTC)),
      });
    }
    for (const m of d.meetings) {
      rows.push({
        id: `meet-${m.id}`,
        day: d.day,
        icon: 'cal',
        title: m.title,
        sub: sub(m.where ? `${m.where} · iOS Cal` : 'iOS Cal'),
        time: window(m.hhmm, m.endHhmm),
      });
    }
  }
  return rows;
}

// ─── Calendar: per-day timeline (detail mode) ────────────────────────────────
export type TimelineKind = 'duty' | 'meeting' | 'ground' | 'layover';

export interface TimelineBlock {
  id: string;
  kind: TimelineKind;
  title: string;
  sub: string;
  /** Minutes since local midnight; may exceed 24 h for a duty past midnight. */
  startMin: number;
  endMin: number;
  /** What the block's own time label reads when it differs from the drawn
   *  window — a duty that reported before midnight is drawn from 00:00 on this
   *  day but still reports its real window ("22:45–05:45"). */
  labelStartMin?: number;
  labelEndMin?: number;
  /** Whole-day band (layover / all-day duty) — drawn edge to edge. */
  allDay: boolean;
}

export interface DayTimeline {
  /** First hour of the axis, e.g. 6 → 06:00 (the mock's default). */
  startHour: number;
  /** Last hour of the axis, e.g. 24 → 24:00. Extends itself when a duty starts
   *  before 06:00 or runs past midnight, so a real block is never clipped. */
  endHour: number;
  blocks: TimelineBlock[];
}

export const TIMELINE_DEFAULT_START_HOUR = 6;
export const TIMELINE_DEFAULT_END_HOUR = 24;
const MAX_TIMELINE_HOUR = 30;

/**
 * The day's blocks for the hour timeline: the report→release duty block, any
 * ground duty, and every synced calendar event — each with a start/end minute
 * on the day's own clock. Blocks that run past midnight extend past 24:00
 * instead of being truncated.
 */
export function dayTimeline(day: DayModel): DayTimeline {
  const blocks: TimelineBlock[] = [];
  const dutyLegs = day.legs;
  if (dutyLegs.length) {
    const first = dutyLegs[0].leg;
    const last = dutyLegs[dutyLegs.length - 1].leg;
    const reportMark = minutesOfDay(stripZone(first.checkIn !== '—' ? first.checkIn : first.depTime));
    const landMark = minutesOfDay(stripZone(last.arvTime));
    if (Number.isFinite(reportMark)) {
      const land = Number.isFinite(landMark) ? landMark + (last.arvDayOffset ? 24 * 60 : 0) : reportMark + 60;
      // A midnight departure (report 22:45, wheels up 00:30) was already under
      // way when this day began: draw it from 00:00 but keep the real window in
      // the label, instead of drawing a 30-minute sliver at the bottom.
      const crossesMidnight = reportMark > land;
      blocks.push({
        id: `duty-${dutyLegs[0].trip.id}`,
        kind: 'duty',
        title: first.fltNumber,
        sub: `${first.dep} → ${last.arv}`,
        startMin: crossesMidnight ? 0 : reportMark,
        endMin: Math.max(land, crossesMidnight ? 30 : reportMark + 30),
        labelStartMin: reportMark,
        labelEndMin: land,
        allDay: false,
      });
    }
  }
  if (day.kind === 'layover' && !dutyLegs.length) {
    blocks.push({
      id: `layover-${day.key}`,
      kind: 'layover',
      title: 'Layover',
      sub: day.layoverTrip?.legs[0]?.arvArp ?? '',
      startMin: 0,
      endMin: 24 * 60,
      allDay: true,
    });
  }
  if (day.ground && !dutyLegs.length) {
    const g = day.ground;
    if (g.allDay) {
      blocks.push({
        id: `ground-${g.id}`,
        kind: 'ground',
        title: g.label || 'Duty',
        sub: '',
        startMin: 0,
        endMin: 24 * 60,
        allDay: true,
      });
    } else {
      const startMin = minutesOfDay(hhmm(g.localStart, g.startRosterUTC));
      const endMin = minutesOfDay(hhmm(g.localEnd, g.endRosterUTC));
      if (Number.isFinite(startMin)) {
        blocks.push({
          id: `ground-${g.id}`,
          kind: 'ground',
          title: g.label || 'Duty',
          sub: g.detail ?? '',
          startMin,
          endMin: Number.isFinite(endMin) && endMin > startMin ? endMin : startMin + 60,
          allDay: false,
        });
      }
    }
  }
  for (const m of day.meetings) {
    const startMin = minutesOfDay(m.hhmm);
    if (!Number.isFinite(startMin)) continue;
    const rawEnd = minutesOfDay(m.endHhmm);
    blocks.push({
      id: `meet-${m.id}`,
      kind: 'meeting',
      title: m.title,
      sub: m.where,
      startMin,
      endMin: Number.isFinite(rawEnd) && rawEnd > startMin ? rawEnd : startMin + 30,
      allDay: false,
    });
  }
  let startHour = TIMELINE_DEFAULT_START_HOUR;
  let endHour = TIMELINE_DEFAULT_END_HOUR;
  for (const b of blocks) {
    if (b.allDay) continue;
    startHour = Math.min(startHour, Math.max(0, Math.floor(b.startMin / 60)));
    endHour = Math.max(endHour, Math.min(MAX_TIMELINE_HOUR, Math.ceil(b.endMin / 60)));
  }
  return { startHour, endHour, blocks };
}

/** "07:15" / "07:15 UTC" → "07:15" (the axis is one clock; the suffix is noise here). */
function stripZone(text: string): string {
  const m = String(text || '').match(/(\d{1,2}:\d{2})/);
  return m ? m[1] : String(text || '');
}

/** Hour axis labels: "06:00" … "24:00" (the mock's last line, still the same
 *  day) and "+1" once the axis runs into the next one. */
export function timelineHourLabel(hour: number): string {
  // 24:00 stays "24:00" (the end of the day the axis starts on); anything past
  // it belongs to the next day and wraps with a +1 marker.
  const h = hour === 24 ? 24 : ((hour % 24) + 24) % 24;
  const label = `${String(h).padStart(2, '0')}:00`;
  return hour > 24 ? `${label} +1` : label;
}

/** Position (0…1) of a minute inside the axis, for absolute block placement. */
export function timelineOffset(minute: number, startHour: number, endHour: number): number {
  const span = Math.max(1, (endHour - startHour) * 60);
  return Math.min(1, Math.max(0, (minute - startHour * 60) / span));
}

/** "HH:MM" on the day axis, marked "+1" once it belongs to the next day. */
function clockLabel(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const mark = minute >= 24 * 60 ? ' +1' : '';
  return `${String(h).padStart(2, '0')}:${String(Math.round(minute) % 60).padStart(2, '0')}${mark}`;
}

/** The window a timeline block prints: its real report→land times, which for a
 *  pre-midnight report differ from the part drawn on this day's axis. */
export function timelineBlockLabel(block: TimelineBlock): string {
  if (block.allDay) return 'all day';
  return `${clockLabel(block.labelStartMin ?? block.startMin)}–${clockLabel(block.labelEndMin ?? block.endMin)}`;
}
