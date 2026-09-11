// ─── Meeting → alarm + display logic (EventKit meetings) ─────────────────────
// Pure logic that turns calendar meetings (read from the iOS Calendar via the
// native CalendarModule / EventKit — i.e. the Outlook/Exchange invites already
// synced to the phone) into two things:
//   • alarm models      — reusing the flight EffectiveAlarm shape so the SAME
//                          scheduler (scheduleEffectiveAlarms) arms them, with a
//                          single reminder N minutes before the meeting starts.
//   • ground-duty cards — reusing the GroundDuty 'meeting' card so they render
//                          interleaved with trips in My Trips, no new component.
//
// A meeting has only ONE reminder (start − N min), so it maps to an
// EffectiveAlarm with `wakeUp` = the reminder and `leaveHome` = null.

import {
  readyWord,
  toAlarmInstant,
  type EffectiveAlarm,
} from '../settings/alarmSetup';
import { deviceTimeZone } from '../settings/timeFormat';
import { groundDutyStartMs, type GroundDuty } from '../roster/dutyDisplay';

export interface Meeting {
  /** EventKit eventIdentifier — stable per event. */
  id: string;
  /** Event subject, e.g. "Crew briefing". */
  title: string;
  /** Absolute ISO-8601 start instant with offset, e.g. "2026-06-10T09:00:00+07:00". */
  startISO: string;
  endISO: string;
  /** IANA tz of the event if EventKit gave one, else the device tz at read time. */
  timeZone: string;
  /** Source calendar title (e.g. the Exchange account) — used to filter. */
  calendarTitle: string;
  /** All-day events get no reminder (no meaningful start time). */
  allDay: boolean;
  /** True when the organiser cancelled the event — no alarm, no card. */
  cancelled?: boolean;
  /** Event URL field — Outlook/Teams usually puts the join link here. */
  url?: string;
  /** Event location — sometimes carries the join link or a room name. */
  location?: string;
  /** Invite body (capped) — a join link may sit inside it. */
  notes?: string;
}

// Online-meeting join links we recognise. Teams is the primary target (the user
// asked for "team's meeting"); Zoom / Google Meet / Webex are covered too.
const JOIN_URL_RE =
  /(https:\/\/(?:teams\.microsoft\.com\/l\/meetup-join|teams\.live\.com\/meet|[\w.-]*zoom\.us\/j|[\w.-]*zoom\.us\/my|meet\.google\.com|[\w.-]*webex\.com)\/?\S*)/i;

/**
 * Extract an online-meeting join link from a meeting's url / location / notes,
 * or null if it isn't an online meeting. Checks the URL field first (where
 * Outlook/Teams puts the join link), then location, then the invite body.
 */
export function meetingJoinUrl(m: Meeting): string | null {
  for (const field of [m.url, m.location, m.notes]) {
    if (!field) {
      continue;
    }
    const match = field.match(JOIN_URL_RE);
    if (match) {
      // Trim trailing punctuation/quotes that often follow a link in notes.
      return match[1].replace(/[)>\]"'.,]+$/, '');
    }
  }
  return null;
}

/** Default reminder lead time — 8 minutes before the meeting (user-configurable). */
export const DEFAULT_MEETING_MINUTES = 8;

/** Selectable "minutes before the meeting" presets for the Profile picker. */
export const MEETING_MINUTES_PRESETS = [5, 8, 10, 15, 30, 45, 60];

/** Default lead time for the Dynamic Island countdown — 5 minutes before start. */
export const DEFAULT_ISLAND_MINUTES = 5;

/** Selectable lead times (minutes) for the Dynamic Island countdown. */
export const ISLAND_MINUTES_PRESETS = [2, 3, 5, 10, 15];

/**
 * The next meeting whose Dynamic Island countdown window has opened: it starts in
 * the future but within `leadMinutes`. Returns null when nothing is imminent.
 * Used to decide when to start the Live Activity (foreground + background sync).
 */
export function nextImminentMeeting(
  meetings: Meeting[],
  leadMinutes: number,
  now: Date = new Date(),
): Meeting | null {
  let best: { m: Meeting; start: number } | null = null;
  const cutoff = now.getTime() + leadMinutes * 60_000;
  for (const m of meetings) {
    if (m.allDay || m.cancelled) {
      continue;
    }
    const start = meetingStart(m);
    if (!start) {
      continue;
    }
    const t = start.getTime();
    if (t > now.getTime() && t <= cutoff && (!best || t < best.start)) {
      best = { m, start: t };
    }
  }
  return best?.m ?? null;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Absolute start instant of a meeting, or null if unparseable. */
export function meetingStart(m: Meeting): Date | null {
  const t = Date.parse(m.startISO);
  return Number.isNaN(t) ? null : new Date(t);
}

/** Absolute end instant of a meeting (falls back to start). */
export function meetingEnd(m: Meeting): Date | null {
  const t = Date.parse(m.endISO);
  return Number.isNaN(t) ? meetingStart(m) : new Date(t);
}

/**
 * A timezone Intl can actually use, else 'UTC'. EventKit can hand back a tz
 * identifier (or a floating/empty one) that `Intl.DateTimeFormat` rejects with a
 * RangeError — which would otherwise throw out of the whole render. Falls back so
 * a single odd meeting can never blank the My Trips list.
 */
function safeTz(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/** A real UTC instant → roster string "DD MMM YYYY HHMM" (GroundDutyCard format). */
function rosterUTC(d: Date | null): string {
  if (!d) {
    return '';
  }
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(
    d.getUTCHours(),
  )}${pad(d.getUTCMinutes())}`;
}

/** A real instant → "YYYY-MM-DD HH:mm" wall clock in the event timezone. */
function localStamp(d: Date | null, timeZone: string): string {
  if (!d) {
    return '';
  }
  const p = toAlarmInstant(d, timeZone).local;
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Alarm fire time (HH:MM in the device's current timezone) for a single meeting,
 * or null if the meeting has no sensible alarm (all-day / cancelled / unparseable).
 * Used by the UI to display the scheduled alarm time on each meeting card.
 * Pass displayTz to override the device timezone (useful in tests).
 */
export function meetingAlarmHhmm(m: Meeting, minutesBefore: number, displayTz?: string): string | null {
  if (m.allDay || m.cancelled) {
    return null;
  }
  const start = meetingStart(m);
  if (!start) {
    return null;
  }
  const tz = displayTz ?? deviceTimeZone();
  const fire = new Date(start.getTime() - minutesBefore * 60_000);
  return toAlarmInstant(fire, tz).hhmm;
}

/**
 * Compute alarm models for the given meetings: one reminder each, firing
 * `minutesBefore` minutes before the meeting start. Times are expressed in the
 * device's current timezone so notification labels show the correct local time
 * when the user is traveling. The EffectiveAlarm.timeZone field still carries
 * the event's own timezone for scheduling context. All-day and unparseable
 * meetings are skipped, as are meetings that have already started relative to
 * `now`. Meetings whose ID is in `mutedIds` are individually silenced.
 * Pass displayTz to override the device timezone (useful in tests).
 */
export function computeMeetingAlarms(
  meetings: Meeting[],
  minutesBefore: number,
  now: Date = new Date(),
  mutedIds: ReadonlySet<string> = new Set(),
  displayTz?: string,
): EffectiveAlarm[] {
  const deviceTz = displayTz ?? deviceTimeZone();
  const out: EffectiveAlarm[] = [];
  for (const m of meetings) {
    try {
      if (m.allDay || m.cancelled || mutedIds.has(m.id)) {
        continue;
      }
      const start = meetingStart(m);
      if (!start || start.getTime() <= now.getTime()) {
        continue;
      }
      const fire = new Date(start.getTime() - minutesBefore * 60_000);
      const fireLocal = toAlarmInstant(fire, deviceTz);
      const startLocal = toAlarmInstant(start, deviceTz);
      const title = (m.title || 'Meeting').trim() || 'Meeting';
      const label = `${title} — meeting at ${startLocal.hhmm}`;
      out.push({
        dutyId: `meeting:${m.id}`,
        fltNumber: title,
        dep: '',
        arv: '',
        timeZone: deviceTz,
        departureUTC: m.startISO,
        wakeUp: fireLocal,
        leaveHome: null,
        checkInLabel: startLocal.hhmm,
        // Meetings carry their own label (wakeUpLabel below) — wakeWord is only
        // filled to satisfy the shared shape.
        wakeWord: readyWord(fireLocal.local.hour),
        wakeUpLabel: label,
        leaveHomeLabel: label,
      });
    } catch {
      // Skip a single malformed event rather than dropping every alarm.
    }
  }
  return out;
}

/**
 * Turn a meeting into a GroundDuty so it renders as a 'meeting' card.
 * Times are expressed in the device's current timezone so the card shows the
 * correct local time regardless of where the event was originally created.
 * Pass displayTz to override the device timezone (useful in tests).
 */
export function meetingToGroundDuty(m: Meeting, displayTz?: string): GroundDuty {
  const start = meetingStart(m);
  const end = meetingEnd(m);
  const tz = displayTz ?? deviceTimeZone();
  return {
    id: `meeting:${m.id}`,
    code: 'MEETING',
    category: 'meeting',
    label: (m.title || 'Meeting').trim() || 'Meeting',
    localStart: localStamp(start, tz),
    localEnd: localStamp(end, tz),
    startRosterUTC: rosterUTC(start),
    endRosterUTC: rosterUTC(end),
    allDay: m.allDay,
    joinUrl: meetingJoinUrl(m) ?? undefined,
    crewId: '',
  };
}

export interface ClassifiedMeetings {
  upcoming: GroundDuty[];
  past: GroundDuty[];
}

/**
 * Split meetings into upcoming/past ground-duty cards (a meeting is past once it
 * has fully ended). Upcoming soonest-first, past most-recent-first — matching
 * classifyGroundDuties / classifyTrips so they interleave cleanly.
 * Pass displayTz to override the device timezone (useful in tests).
 */
export function classifyMeetings(meetings: Meeting[], now: Date, displayTz?: string): ClassifiedMeetings {
  const upcoming: GroundDuty[] = [];
  const past: GroundDuty[] = [];
  for (const m of meetings) {
    try {
      if (m.cancelled || m.allDay) {
        continue;
      }
      const end = meetingEnd(m) ?? meetingStart(m);
      const g = meetingToGroundDuty(m, displayTz);
      if (end && end.getTime() < now.getTime()) {
        past.push(g);
      } else {
        upcoming.push(g);
      }
    } catch {
      // A single malformed event must never blank the whole list — skip it.
    }
  }
  upcoming.sort((a, b) => groundDutyStartMs(a) - groundDutyStartMs(b));
  past.sort((a, b) => groundDutyStartMs(b) - groundDutyStartMs(a));
  return { upcoming, past };
}
