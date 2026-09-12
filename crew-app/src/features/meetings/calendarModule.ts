import { NativeModules, Platform } from 'react-native';
import type { Meeting } from './meetingSetup';
import { isFlightCalendarEvent } from '../calendar/flightCalendar';

// Bridge to the native CalendarModule (Swift / EventKit). Reads the meetings
// already synced onto the device from the crew's Exchange/Outlook account — no
// Microsoft login, no backend, data never leaves the phone. Falls back to a
// no-op when the native module isn't present (Android, or a build predating it).

interface CalendarNativeModule {
  /** Request EventKit access; resolves 'authorized' | 'denied'. */
  requestAccess(): Promise<'authorized' | 'denied'>;
  /** Events between two ISO instants (inclusive of overlap). */
  getEvents(
    startISO: string,
    endISO: string,
  ): Promise<
    Array<{
      id: string;
      title: string;
      startISO: string;
      endISO: string;
      timeZone: string;
      calendarTitle: string;
      allDay: boolean;
      url: string;
      location: string;
      notes: string;
    }>
  >;
  /**
   * Create events in the device's default calendar; resolves with their
   * eventIdentifiers in the same order. Used by "add flight to Calendar".
   */
  saveEvents?(
    events: Array<{
      title: string;
      startISO: string;
      endISO: string;
      timeZone: string;
      notes: string;
      /**
       * Marker URL (see flightCalendar's FLIGHT_EVENT_URL_PREFIX). Events the
       * app wrote for a duty carry it so they are never read back as meetings.
       */
      url?: string;
    }>,
  ): Promise<string[]>;
  /** Delete events by identifier; resolves with how many were actually removed. */
  removeEvents?(ids: string[]): Promise<number>;
  /**
   * Mirror the meeting-alarm config into native UserDefaults so the background
   * refresh task can arm alarms without the JS layer running. Best-effort.
   */
  saveBackgroundConfig?(config: { enabled: boolean; minutesBefore: number }): Promise<void>;
}

const native: CalendarNativeModule | undefined = NativeModules.CalendarModule;

export function isCalendarAvailable(): boolean {
  return Platform.OS === 'ios' && native != null;
}

export async function requestCalendarAccess(): Promise<'authorized' | 'denied'> {
  if (!native) {
    return 'denied';
  }
  return native.requestAccess();
}

/** Read upcoming meetings from the device calendar (default: next 30 days). */
export async function fetchMeetings(
  daysAhead = 30,
  now: Date = new Date(),
): Promise<Meeting[]> {
  if (!native) {
    return [];
  }
  // Strip milliseconds — toISOString() emits "...00.000Z", which a plain native
  // ISO8601DateFormatter rejects. "...00Z" parses everywhere.
  const noMs = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const startISO = noMs(now);
  const endISO = noMs(new Date(now.getTime() + daysAhead * 86_400_000));
  const raw = await native.getEvents(startISO, endISO);
  return raw
    // The device calendar is both the meetings source AND where "add this duty
    // to Calendar" writes. Our own flight entries must not come back as
    // Outlook/Exchange meetings (or arm a meeting alarm) — see flightCalendar.
    .filter(e => !isFlightCalendarEvent(e.url))
    .map(e => ({
      id: e.id,
      title: e.title ?? '',
      startISO: e.startISO,
      endISO: e.endISO,
      timeZone: e.timeZone || 'UTC',
      calendarTitle: e.calendarTitle ?? '',
      allDay: !!e.allDay,
      url: e.url ?? '',
      location: e.location ?? '',
      notes: e.notes ?? '',
    }));
}

/**
 * True when the native bridge can WRITE events (a build predating the flight →
 * calendar feature exposes CalendarModule but not saveEvents).
 */
export function isCalendarWriteAvailable(): boolean {
  return isCalendarAvailable() && typeof native?.saveEvents === 'function';
}

/** Create calendar events; resolves with their native identifiers. */
export async function saveCalendarEvents(
  events: Array<{
    title: string;
    startISO: string;
    endISO: string;
    timeZone: string;
    notes: string;
    url?: string;
  }>,
): Promise<string[]> {
  if (!native?.saveEvents || events.length === 0) {
    return [];
  }
  return native.saveEvents(events);
}

/** Delete calendar events by identifier; resolves with the number removed. */
export async function removeCalendarEvents(ids: string[]): Promise<number> {
  if (!native?.removeEvents || ids.length === 0) {
    return 0;
  }
  return native.removeEvents(ids);
}

/** Mirror config to native UserDefaults for the background refresh task. */
export async function saveBackgroundConfig(config: {
  enabled: boolean;
  minutesBefore: number;
}): Promise<void> {
  if (!native?.saveBackgroundConfig) {
    return;
  }
  try {
    await native.saveBackgroundConfig(config);
  } catch {
    // Best-effort — background refresh just falls back to the last config.
  }
}
