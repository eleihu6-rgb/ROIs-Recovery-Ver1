// ─── V2 (mock-mirror) view model ─────────────────────────────────────────────
// Pure derivations shared by the v2 Home / Schedule / Profile screens. Nothing
// here renders; everything is computed from the existing slices (trips, duties,
// alarms, meetings, settings) so the redesign changes presentation only.

import { classifyTrips, type Trip, type TripLeg } from '../travel/tripCsv';
import { classifyGroundDuties, type GroundDuty } from '../roster/dutyDisplay';
import type { PortalDuty } from '../travel/portalCapture';
import {
  deviceTimeZone,
  formatLegTime,
  hhmmForInstant,
  hhmmInZone,
  legDisplayDate,
  parseRosterUTC,
  withZoneSuffix,
} from '../settings/timeFormat';
import type { TimeZoneMode } from '../settings/settingsSlice';
import { alarmOptions, computeEffectiveAlarms, type EffectiveAlarm } from '../settings/alarmSetup';
import { airportZone } from '../settings/airportZones';
import type { DutyAlarmOverride } from '../alarms/alarmsSlice';
import { checkInHhmm } from '../travel/tripDisplay';
import { DEFAULT_MEETING_MINUTES, meetingJoinUrl, type Meeting } from '../meetings/meetingSetup';
import type { IconName } from '../../components/v2/icons';

export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

// ─── Greeting ────────────────────────────────────────────────────────────────
// Greeting follows the PHONE's local clock (Date() in the device timezone) on
// purpose — independent of the Time Zone display setting (airport/base/UTC):
// the crew is greeted for where they physically are. Bands: 05–11 morning ·
// 12–16 afternoon · 17–20 evening · 21–04 night.
export function greetingFor(now: Date): { text: string; icon: IconName } {
  const h = now.getHours();
  if (h < 5) return { text: 'Good night', icon: 'moon' };
  if (h < 12) return { text: 'Good morning', icon: 'sunrise' };
  if (h < 17) return { text: 'Good afternoon', icon: 'sun' };
  if (h < 21) return { text: 'Good evening', icon: 'sunset' };
  return { text: 'Good night', icon: 'moon' };
}

// ─── Leg / trip display ──────────────────────────────────────────────────────
export interface LegView {
  fltNumber: string;
  fleet: string;
  dep: string;
  arv: string;
  depTime: string;
  arvTime: string;
  /** "+1" when the arrival lands on a later calendar day than departure. */
  arvDayOffset: string;
  duration: string;
  /** Leave home / Ready (Get Ready or Wake Up) / Check-in, "HH:MM" or "—". */
  leaveHome: string;
  ready: string;
  readyWord: string;
  checkIn: string;
  /** Sortable local date key yyyymmdd of the departure (display mode). */
  dateKey: number;
  day: number;
  monthIdx: number;
  year: number;
  /** True for the duty's first leg — only that leg carries the report markers. */
  firstLeg: boolean;
}

/** Short fleet code: "Airbus A350-900" → "A350", "Boeing 787-9" → "B787". */
export function shortFleet(fleet: string | undefined): string {
  const f = (fleet || '').toUpperCase();
  const m = f.match(/\b([AB])\s?-?(\d{3})/);
  if (m) return `${m[1]}${m[2]}`;
  const b = f.match(/BOEING\s*(\d{3})/); // "Boeing 787-9" carries no letter → B787
  if (b) return `B${b[1]}`;
  return f.replace(/AIRBUS|BOEING/g, '').trim().split(/[\s-]/)[0] || '';
}

export function hhmmOnly(s: string): string {
  const m = s.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : s;
}

function fmtDuration(depUTC: string | undefined, arvUTC: string | undefined): string {
  const a = parseRosterUTC(depUTC)?.getTime();
  const b = parseRosterUTC(arvUTC)?.getTime();
  if (a == null || b == null || b <= a) return '';
  const mins = Math.round((b - a) / 60000);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

export function legView(
  leg: TripLeg,
  trip: Trip,
  mode: TimeZoneMode,
  baseTz: string,
  alarm: EffectiveAlarm | undefined,
): LegView {
  // Report / leave-home / ready belong to the trip's first leg (check-in at base);
  // later legs of the same rotation don't repeat them.
  const isFirst = trip.legs[0] === leg;
  const depZone = airportZone(leg.depArp);
  const arvZone = airportZone(leg.arvArp);
  const depD = legDisplayDate({ flightDateUTC: leg.flightDateUTC, localTime: leg.localDepTime, mode, baseTz, airportTz: depZone });
  const arvD = legDisplayDate({ flightDateUTC: leg.arvDateUTC, localTime: leg.localArvTime, mode, baseTz, airportTz: arvZone });
  const dk = depD ? depD.year * 10000 + (depD.monthIdx + 1) * 100 + depD.day : 0;
  const ak = arvD ? arvD.year * 10000 + (arvD.monthIdx + 1) * 100 + arvD.day : dk;
  // Report (check-in) instant: the roster string is UTC; render it in the mode's zone.
  const checkInUtc = parseRosterUTC(trip.checkInDateUTC);
  return {
    fltNumber: (leg.fltNumber || '').trim(),
    fleet: shortFleet(leg.fleet),
    dep: (leg.depArp || '').toUpperCase(),
    arv: (leg.arvArp || '').toUpperCase(),
    // formatLegTime may include the date ("16 Sep 00:30"); the cards show HH:MM only, date lives on the day header.
    depTime: withZoneSuffix(hhmmOnly(formatLegTime({ flightDateUTC: leg.flightDateUTC, localTime: leg.localDepTime, mode, baseTz, airportTz: depZone })), mode),
    arvTime: withZoneSuffix(hhmmOnly(formatLegTime({ flightDateUTC: leg.arvDateUTC, localTime: leg.localArvTime, mode, baseTz, airportTz: arvZone })), mode),
    arvDayOffset: ak > dk ? '+1' : '',
    duration: fmtDuration(leg.flightDateUTC, leg.arvDateUTC),
    leaveHome: isFirst && alarm?.leaveHome
      ? hhmmForInstant(alarm.leaveHome.instant, mode, baseTz, depZone)
      : '—',
    ready: isFirst && alarm?.wakeUp
      ? hhmmForInstant(alarm.wakeUp.instant, mode, baseTz, depZone)
      : '—',
    readyWord: alarm?.wakeWord ?? 'Get Ready',
    checkIn: isFirst && trip.checkInDateUTC
      ? (checkInUtc
        ? hhmmForInstant(checkInUtc, mode, baseTz, depZone)
        : withZoneSuffix(checkInHhmm(trip.checkInDateUTC), mode))
      : '—',
    dateKey: dk,
    day: depD?.day ?? 0,
    monthIdx: depD?.monthIdx ?? 0,
    year: depD?.year ?? 0,
    firstLeg: isFirst,
  };
}

function alarmsFor(
  trips: Trip[],
  wakeUpHours: number,
  leaveHomeHours: number,
  overrides: Record<string, DutyAlarmOverride>,
): { byTrip: Record<string, EffectiveAlarm>; all: EffectiveAlarm[] } {
  const all = computeEffectiveAlarms(trips, alarmOptions(wakeUpHours, leaveHomeHours), overrides);
  const byTrip: Record<string, EffectiveAlarm> = {};
  for (const a of all) {
    if (!byTrip[a.dutyId]) byTrip[a.dutyId] = a;
  }
  return { byTrip, all };
}

/**
 * Alarms for the duties that have NOT finished yet — this drives what actually gets
 * scheduled on the iOS clock, so past duties must stay out of it.
 */
export function alarmsByTrip(
  trips: Trip[],
  wakeUpHours: number,
  leaveHomeHours: number,
  overrides: Record<string, DutyAlarmOverride>,
  now: Date,
): { byTrip: Record<string, EffectiveAlarm>; all: EffectiveAlarm[] } {
  return alarmsFor(classifyTrips(trips, now).upcoming, wakeUpHours, leaveHomeHours, overrides);
}

/**
 * The same markers for EVERY published duty — the Schedule/Trip-Details record
 * view. A card that already shows its check-in must not silently lose its wake-up
 * and leave-home cells just because the duty has flown (Ryan: "10 Sep, ET805 as
 * first seg in the duty, why no wake up and leave home time?").
 */
export function dutyAlarmsByTrip(
  trips: Trip[],
  wakeUpHours: number,
  leaveHomeHours: number,
  overrides: Record<string, DutyAlarmOverride>,
): { byTrip: Record<string, EffectiveAlarm>; all: EffectiveAlarm[] } {
  return alarmsFor(trips, wakeUpHours, leaveHomeHours, overrides);
}

/** Earliest upcoming flight trip (by real UTC instant), or null. */
export function nextTrip(trips: Trip[], now: Date): Trip | null {
  const upcoming = classifyTrips(trips, now).upcoming.slice();
  upcoming.sort((a, b) => tripStartMs(a) - tripStartMs(b));
  return upcoming[0] ?? null;
}

export function tripStartMs(trip: Trip): number {
  return Math.min(...trip.legs.map(l => parseRosterUTC(l.flightDateUTC)?.getTime() ?? Infinity));
}

export function tripEndMs(trip: Trip): number {
  return Math.max(...trip.legs.map(l => parseRosterUTC(l.arvDateUTC)?.getTime() ?? 0));
}

/** Whole days until the trip's first report; 0 = today. */
export function daysUntil(ms: number, now: Date): number {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.floor((ms - start) / 86400000));
}

// ─── Month model (Schedule tab) ──────────────────────────────────────────────
export type DayKind = 'flight' | 'layover' | 'standby' | 'training' | 'ground' | 'off';

export interface DayMeeting {
  id: string;
  title: string;
  hhmm: string;
  where: string;
  /** Start instant (ms) — used to order several meetings on one day. */
  startMs: number;
  /** End instant (ms) — the day timeline draws the event as a real block, so it
   *  needs the length, not just the start. */
  endMs: number;
  /** End "HH:MM" on the SAME clock as `hhmm` (the meeting's display zone), so a
   *  duration is never recomputed from the device's own timezone. */
  endHhmm: string;
  /** Online-meeting join link (Teams / Zoom / Meet / Webex) or null for a
   *  meeting with no link in its URL, location or invite body. */
  joinUrl: string | null;
  /** When the reminder for this meeting rings (HH:MM, display zone). */
  alarmHhmm: string;
  /** The crew silenced this meeting's reminder by tapping its alarm chip. */
  muted: boolean;
}

/** Meeting reminder settings the Schedule tab needs to render a card. */
export interface MeetingPrefs {
  minutesBefore: number;
  mutedIds: readonly string[];
}

export interface DayModel {
  key: number; // yyyymmdd
  day: number;
  dow: string;
  isToday: boolean;
  kind: DayKind;
  /** Flight legs departing this day (display mode). */
  legs: Array<{ leg: LegView; trip: Trip }>;
  ground: GroundDuty | null;
  /** Layover: the trip we're away with, when this day sits between its legs. */
  layoverTrip: Trip | null;
  meetings: DayMeeting[];
}

function ymd(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/**
 * The zone a meeting's clock is shown in, following the app's Time-Zone setting
 * so meetings read on the same clock as the duties around them. A meeting has no
 * airport, so 'airport' mode means the event's OWN zone (Outlook writes the
 * meeting's zone into EventKit) — the closest honest equivalent.
 */
function meetingZone(mode: TimeZoneMode, baseTz: string, eventTz: string | undefined): string {
  if (mode === 'airport') {
    return eventTz || deviceTimeZone();
  }
  if (mode === 'base') {
    return baseTz;
  }
  if (mode === 'device') {
    return deviceTimeZone();
  }
  return 'UTC';
}

/**
 * Card-list index to open for a tapped day-strip index, or null when there is
 * nothing to scroll to. A month the airline has published nothing for has an
 * EMPTY card list, and `FlatList.scrollToIndex` throws on an out-of-range index
 * ("scrollToIndex out of range: item length 0 but minimum is 1") — that crashed
 * the Schedule tab as soon as a crew browsed back to such a month.
 *
 * A day with no card of its own (a blank roster day) opens the month's first
 * card; the strip and the list re-sync from the viewability callback.
 */
export function resolveCardIndex(
  cardsByStripIndex: Map<number, number>,
  stripIndex: number,
  cardCount: number,
): number | null {
  if (cardCount <= 0) {
    return null;
  }
  const index = cardsByStripIndex.get(stripIndex);
  if (index == null) {
    return 0;
  }
  return index < cardCount ? index : cardCount - 1;
}

/**
 * Whether a calendar day earns a card in the Schedule list. A day qualifies when
 * something is actually published for it: flight legs, an airline ground duty
 * (day off / leave / standby / training / …), a layover, or a meeting. A blank
 * roster day is NOT a day off — the airline has simply published nothing — so it
 * gets no card (the date strip still shows the day, without a duty dot).
 */
export function hasDutyCard(day: DayModel): boolean {
  return day.legs.length > 0 || day.ground !== null || day.kind === 'layover' || day.meetings.length > 0;
}

function groundKind(g: GroundDuty): DayKind {
  const c = String(g.category);
  // Rosters (TG) carry explicit day-off rows ("OFF", "Day Off", "DO", "REST") — render them as days off.
  if (/^(OFF|DO|DOFF|REST|RD)$/i.test(g.code.trim()) || /day ?off|rest day|^off$/i.test(g.label) || /off|rest/i.test(c)) return 'off';
  if (/standby|sby|reserve/i.test(c) || /SBY|STBY|RSV/i.test(g.code)) return 'standby';
  if (/train|sim|course|ground school|recur/i.test(c) || /SIM|TRN|GS|CRM|SEP/i.test(g.code)) return 'training';
  return 'ground';
}

function localKeyOf(local: string | undefined): number {
  const m = (local || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? parseInt(m[1] + m[2] + m[3], 10) : 0;
}

export interface MonthModel {
  year: number;
  monthIdx: number;
  days: DayModel[];
  /** Index of the day to open on: today if it holds a duty, else the next duty, else today. */
  focusIndex: number;
  flightCount: number;
  /** Sum of block minutes this month (display). */
  blockMinutes: number;
}

export function buildMonth(
  year: number,
  monthIdx: number,
  trips: Trip[],
  duties: PortalDuty[],
  meetings: Meeting[],
  mode: TimeZoneMode,
  baseTz: string,
  alarms: Record<string, EffectiveAlarm>,
  now: Date,
  meetingPrefs: MeetingPrefs = { minutesBefore: DEFAULT_MEETING_MINUTES, mutedIds: [] },
): MonthModel {
  const count = new Date(year, monthIdx + 1, 0).getDate();
  const todayKey = ymd(now);
  const days: DayModel[] = [];
  for (let d = 1; d <= count; d++) {
    const date = new Date(year, monthIdx, d);
    days.push({
      key: ymd(date), day: d, dow: DOW[date.getDay()], isToday: ymd(date) === todayKey,
      kind: 'off', legs: [], ground: null, layoverTrip: null, meetings: [],
    });
  }
  const byKey = new Map(days.map(x => [x.key, x] as const));
  let flightCount = 0;
  let blockMinutes = 0;

  for (const trip of trips) {
    const views = trip.legs.map(leg => ({ leg: legView(leg, trip, mode, baseTz, alarms[trip.id]), trip }));
    for (const v of views) {
      const dm = byKey.get(v.leg.dateKey);
      if (dm) {
        dm.legs.push(v);
        dm.kind = 'flight';
        flightCount++;
        const a = parseRosterUTC(trip.legs[views.indexOf(v)]?.flightDateUTC)?.getTime();
        const b = parseRosterUTC(trip.legs[views.indexOf(v)]?.arvDateUTC)?.getTime();
        if (a != null && b != null && b > a) blockMinutes += Math.round((b - a) / 60000);
      }
    }
    // Days strictly between the first and last leg of a multi-leg trip = layover.
    const keys = views.map(v => v.leg.dateKey).filter(Boolean).sort();
    if (keys.length > 1) {
      for (const dm of days) {
        if (dm.key > keys[0] && dm.key < keys[keys.length - 1] && dm.legs.length === 0 && dm.kind === 'off') {
          dm.kind = 'layover';
          dm.layoverTrip = trip;
        }
      }
    }
  }
  const ground = classifyGroundDuties(duties, new Date(0));
  for (const g of [...ground.upcoming, ...ground.past]) {
    const dm = byKey.get(localKeyOf(g.localStart));
    if (dm && dm.legs.length === 0) {
      // Keep the duty even when it IS a days-off row: an explicit airline days-off
      // duty is the one case where a "Day Off" card is correct. A day with no duty
      // at all stays blank and gets no card (see hasDutyCard).
      dm.ground = g;
      dm.kind = groundKind(g);
    }
  }
  for (const m of meetings) {
    // All-day events have no meaningful start, and a cancelled event is gone —
    // same rule the reminder scheduler uses (computeMeetingAlarms).
    if (m.allDay || m.cancelled) continue;
    const startMs = Date.parse(m.startISO);
    if (Number.isNaN(startMs)) continue;
    const dm = byKey.get(ymd(new Date(startMs)));
    if (!dm) continue;
    const zone = meetingZone(mode, baseTz, m.timeZone);
    const endMs = Date.parse(m.endISO);
    const safeEndMs = Number.isNaN(endMs) ? startMs + DEFAULT_MEETING_MINUTES * 60_000 : endMs;
    dm.meetings.push({
      id: m.id,
      title: m.title,
      where: m.calendarTitle,
      startMs,
      // A meeting with no parsable end still gets a block: the calendar's own
      // default length, so the timeline never draws a zero-height event.
      endMs: safeEndMs,
      hhmm: hhmmInZone(new Date(startMs), zone),
      endHhmm: hhmmInZone(new Date(safeEndMs), zone),
      joinUrl: meetingJoinUrl(m),
      alarmHhmm: hhmmInZone(
        new Date(startMs - meetingPrefs.minutesBefore * 60_000),
        zone,
      ),
      muted: meetingPrefs.mutedIds.includes(m.id),
    });
  }
  for (const dm of days) dm.legs.sort((a, b) => a.leg.depTime.localeCompare(b.leg.depTime));
  for (const dm of days) dm.meetings.sort((a, b) => a.startMs - b.startMs);

  const isDuty = (dm: DayModel) => dm.kind !== 'off' && dm.kind !== 'layover';
  const todayIdx = days.findIndex(x => x.isToday);
  let focusIndex = todayIdx >= 0 ? todayIdx : 0;
  if (todayIdx >= 0 && !isDuty(days[todayIdx])) {
    const next = days.findIndex((x, i) => i > todayIdx && x.kind === 'flight');
    if (next >= 0) focusIndex = next;
  }
  return { year, monthIdx, days, focusIndex, flightCount, blockMinutes };
}

/** "63" credit display: block hours rounded; credit ≈ block hours until the roster carries credit. */
export function creditLabel(blockMinutes: number): string {
  return String(Math.round(blockMinutes / 60));
}

export function isAllDayMeeting(m: Meeting): boolean {
  return !!m.allDay;
}
