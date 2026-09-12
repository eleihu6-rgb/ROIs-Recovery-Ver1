import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppDispatch, RootState } from '../../store';
import type { Trip } from '../travel/tripCsv';
import { classifyTrips, tripStartDate } from '../travel/tripCsv';
import { alarmOptions } from '../settings/alarmSetup';
import {
  isCalendarWriteAvailable,
  requestCalendarAccess,
  removeCalendarEvents,
  saveCalendarEvents,
} from '../meetings/calendarModule';
import { buildDutyCalendarEvents } from './flightCalendar';

// ─── "Add flight to Calendar" state ──────────────────────────────────────────
// Remembers which native calendar events this app created for each duty, so the
// icon on the flight card is a TOGGLE: tap once to write the duty's events, tap
// again to delete exactly those (option D1). Without this a second tap would
// silently duplicate every entry.
//
// Only the event identifiers are stored — the events themselves live in the
// iOS calendar, and nothing leaves the device.

interface FlightCalendarState {
  /** dutyId (trip.id) → native eventIdentifiers this app created. */
  eventIds: Record<string, string[]>;
  /** Duty currently being written/removed, so the icon can't be double-tapped. */
  busyDutyId: string | null;
  /**
   * Profile ▸ Preferences ▸ "iOS Calendar sync": keep EVERY upcoming duty in the
   * calendar (option B — the master switch), with the per-duty icon still working
   * as the fine-grained control.
   */
  syncAll: boolean;
  /** A bulk sync/unsync is running — the toggle shows it rather than double-firing. */
  syncing: boolean;
  /**
   * True once the persisted map AND the sync flag have been read. The launch
   * top-up is gated on this: syncing against an empty map would duplicate every
   * duty that is already in the calendar.
   */
  hydrated: boolean;
}

const STORAGE_KEY = '@royce_flight_calendar';
const SYNC_KEY = '@royce_flight_calendar_sync';

const initialState: FlightCalendarState = {
  eventIds: {},
  busyDutyId: null,
  syncAll: false,
  syncing: false,
  hydrated: false,
};

const flightCalendarSlice = createSlice({
  name: 'flightCalendar',
  initialState,
  reducers: {
    _hydrate(state, action: PayloadAction<Record<string, string[]>>) {
      state.eventIds = action.payload;
    },
    _setEvents(state, action: PayloadAction<{ dutyId: string; ids: string[] }>) {
      state.eventIds[action.payload.dutyId] = action.payload.ids;
    },
    _clearEvents(state, action: PayloadAction<string>) {
      delete state.eventIds[action.payload];
    },
    _setBusy(state, action: PayloadAction<string | null>) {
      state.busyDutyId = action.payload;
    },
    _setSyncAll(state, action: PayloadAction<boolean>) {
      state.syncAll = action.payload;
    },
    _setSyncing(state, action: PayloadAction<boolean>) {
      state.syncing = action.payload;
    },
    _clearAll(state) {
      state.eventIds = {};
    },
    _setHydrated(state, action: PayloadAction<boolean>) {
      state.hydrated = action.payload;
    },
  },
});

async function persist(map: Record<string, string[]>): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

async function persistSyncFlag(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SYNC_KEY, JSON.stringify(enabled));
  } catch {}
}

export type CalendarToggleStatus =
  | 'added'
  | 'removed'
  | 'unavailable'
  | 'denied'
  | 'empty'
  | 'busy'
  | 'error';

export interface CalendarToggleResult {
  status: CalendarToggleStatus;
  /** Events written or removed. */
  count: number;
  /** Native error text, when status is 'error'. */
  message?: string;
}

/**
 * Toggle one duty's presence in the iOS calendar.
 *   • already added → delete the events we created, forget the ids
 *   • not added     → ask for calendar access, write the duty's events (option
 *     A3: Wake Up / Get Ready + Leave Home + Check-in markers and one block per
 *     leg), remember the ids
 *
 * Offsets come from the live alarm settings + this duty's override (option C1),
 * so what lands in the calendar matches the chips on the trip card.
 */
export function toggleDutyCalendar(trip: Trip) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<CalendarToggleResult> => {
    const state = getState();
    const { eventIds, busyDutyId } = state.flightCalendar;
    if (busyDutyId != null) {
      return { status: 'busy', count: 0 };
    }

    const existing = eventIds[trip.id];
    if (existing && existing.length > 0) {
      dispatch(flightCalendarSlice.actions._setBusy(trip.id));
      try {
        const removed = await removeCalendarEvents(existing);
        dispatch(flightCalendarSlice.actions._clearEvents(trip.id));
        const next = { ...getState().flightCalendar.eventIds };
        await persist(next);
        return { status: 'removed', count: removed };
      } catch (err) {
        return { status: 'error', count: 0, message: (err as Error).message };
      } finally {
        dispatch(flightCalendarSlice.actions._setBusy(null));
      }
    }

    if (!isCalendarWriteAvailable()) {
      return { status: 'unavailable', count: 0 };
    }

    const { wakeUpHours, leaveHomeHours, overrides } = state.alarms;
    const drafts = buildDutyCalendarEvents(
      trip,
      alarmOptions(wakeUpHours, leaveHomeHours),
      overrides[trip.id],
    );
    if (drafts.length === 0) {
      return { status: 'empty', count: 0 };
    }

    dispatch(flightCalendarSlice.actions._setBusy(trip.id));
    try {
      const access = await requestCalendarAccess();
      if (access !== 'authorized') {
        return { status: 'denied', count: 0 };
      }
      const ids = await saveCalendarEvents(
        drafts.map(({ title, startISO, endISO, timeZone, notes, url }) => ({
          title,
          startISO,
          endISO,
          timeZone,
          notes,
          url,
        })),
      );
      if (ids.length === 0) {
        return { status: 'error', count: 0, message: 'The calendar returned no events.' };
      }
      dispatch(flightCalendarSlice.actions._setEvents({ dutyId: trip.id, ids }));
      await persist(getState().flightCalendar.eventIds);
      return { status: 'added', count: ids.length };
    } catch (err) {
      return { status: 'error', count: 0, message: (err as Error).message };
    } finally {
      dispatch(flightCalendarSlice.actions._setBusy(null));
    }
  };
}

// ─── Bulk sync — Profile ▸ Preferences ▸ "iOS Calendar sync" (option B) ──────
// The per-duty icon stays the fine-grained control; this is the master switch
// that keeps EVERY upcoming duty in the calendar, including ones that appear as
// the roster is refreshed.

/**
 * How far ahead the bulk sync reaches. Beyond the roster window the data is not
 * trustworthy and the calendar just gets noisy; 60 days covers a monthly roster
 * plus its next-month overlap.
 */
export const CALENDAR_SYNC_HORIZON_DAYS = 60;

export type CalendarSyncStatus =
  | 'enabled'
  | 'in-sync'
  | 'disabled'
  | 'unavailable'
  | 'denied'
  | 'error';

export interface CalendarSyncResult {
  status: CalendarSyncStatus;
  /** Entries this run wrote. */
  added: number;
  /** Entries this run deleted. */
  removed: number;
  /** Duties this run wrote (a duty is several entries). */
  duties: number;
  /** Duties that failed. Successful ones stay in the calendar. */
  failed: number;
  message?: string;
}

/** Upcoming duties inside the sync horizon, earliest first. */
function dutiesToSync(state: RootState, now = new Date()): Trip[] {
  const until = now.getTime() + CALENDAR_SYNC_HORIZON_DAYS * 86_400_000;
  return classifyTrips(state.trips.trips, now).upcoming.filter(trip => {
    const start = tripStartDate(trip);
    // An unparseable start still belongs to the crew's roster — keep it rather
    // than silently dropping the duty.
    return start == null || start.getTime() <= until;
  });
}

/**
 * Write every upcoming duty the app is not already tracking. Idempotent, so it
 * is safe to run on launch and after a roster refresh.
 */
async function writeMissingDuties(
  dispatch: AppDispatch,
  getState: () => RootState,
): Promise<{ added: number; duties: number; failed: number; message?: string }> {
  const state = getState();
  const offsets = alarmOptions(state.alarms.wakeUpHours, state.alarms.leaveHomeHours);
  let added = 0;
  let duties = 0;
  let failed = 0;
  let message: string | undefined;

  for (const trip of dutiesToSync(state)) {
    if ((getState().flightCalendar.eventIds[trip.id]?.length ?? 0) > 0) {
      continue; // already in the calendar — never write a duty twice
    }
    try {
      const drafts = buildDutyCalendarEvents(trip, offsets, state.alarms.overrides[trip.id]);
      if (drafts.length === 0) {
        continue; // no usable departure — nothing to anchor
      }
      const ids = await saveCalendarEvents(
        drafts.map(({ title, startISO, endISO, timeZone, notes, url }) => ({
          title,
          startISO,
          endISO,
          timeZone,
          notes,
          url,
        })),
      );
      if (ids.length === 0) {
        throw new Error('The calendar returned no events.');
      }
      dispatch(flightCalendarSlice.actions._setEvents({ dutyId: trip.id, ids }));
      added += ids.length;
      duties += 1;
    } catch (err) {
      // One bad duty must not abandon the rest of the roster.
      failed += 1;
      message = message ?? (err as Error).message;
    }
  }

  if (added > 0) {
    await persist(getState().flightCalendar.eventIds);
  }
  return { added, duties, failed, message };
}

/**
 * Flip the Profile ▸ Preferences "iOS Calendar sync" switch.
 *   • on  → write every upcoming duty (idempotent), then keep topping up
 *   • off → delete every entry the app wrote and forget the map
 */
export function setCalendarSyncAll(enabled: boolean) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<CalendarSyncResult> => {
    const idle: CalendarSyncResult = { status: 'error', added: 0, removed: 0, duties: 0, failed: 0 };

    if (!enabled) {
      dispatch(flightCalendarSlice.actions._setSyncing(true));
      try {
        const ids = Object.values(getState().flightCalendar.eventIds).flat();
        const removed = await removeCalendarEvents(ids);
        dispatch(flightCalendarSlice.actions._clearAll());
        await persist({});
        dispatch(flightCalendarSlice.actions._setSyncAll(false));
        await persistSyncFlag(false);
        return { status: 'disabled', added: 0, removed, duties: 0, failed: 0 };
      } catch (err) {
        return { ...idle, message: (err as Error).message };
      } finally {
        dispatch(flightCalendarSlice.actions._setSyncing(false));
      }
    }

    if (!isCalendarWriteAvailable()) {
      return { ...idle, status: 'unavailable' };
    }

    dispatch(flightCalendarSlice.actions._setSyncing(true));
    try {
      const access = await requestCalendarAccess();
      if (access !== 'authorized') {
        return { ...idle, status: 'denied' };
      }
      const written = await writeMissingDuties(dispatch, getState);
      dispatch(flightCalendarSlice.actions._setSyncAll(true));
      await persistSyncFlag(true);
      return {
        status: written.added > 0 ? 'enabled' : 'in-sync',
        added: written.added,
        removed: 0,
        duties: written.duties,
        failed: written.failed,
        message: written.message,
      };
    } catch (err) {
      return { ...idle, message: (err as Error).message };
    } finally {
      dispatch(flightCalendarSlice.actions._setSyncing(false));
    }
  };
}

/**
 * Top-up for a sync that is already on: adds duties published since the last
 * run. Called on launch (after hydration) and whenever the roster changes.
 * Returns null when there is nothing to do, so callers can stay quiet.
 */
export function topUpCalendarSync() {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<CalendarSyncResult | null> => {
    const s = getState().flightCalendar;
    if (!s.syncAll || !s.hydrated || s.syncing || s.busyDutyId != null) {
      return null;
    }
    if (!isCalendarWriteAvailable()) {
      return null;
    }
    dispatch(flightCalendarSlice.actions._setSyncing(true));
    try {
      const access = await requestCalendarAccess();
      if (access !== 'authorized') {
        return { status: 'denied', added: 0, removed: 0, duties: 0, failed: 0 };
      }
      const written = await writeMissingDuties(dispatch, getState);
      return {
        status: 'enabled',
        added: written.added,
        removed: 0,
        duties: written.duties,
        failed: written.failed,
        message: written.message,
      };
    } catch (err) {
      return { status: 'error', added: 0, removed: 0, duties: 0, failed: 0, message: (err as Error).message };
    } finally {
      dispatch(flightCalendarSlice.actions._setSyncing(false));
    }
  };
}

/** Hydrate the created-event map on launch so the icons show the added state. */
export function loadFlightCalendar() {
  return async (dispatch: AppDispatch): Promise<void> => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw != null) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          dispatch(flightCalendarSlice.actions._hydrate(parsed));
        }
      }
    } catch {}
    try {
      const raw = await AsyncStorage.getItem(SYNC_KEY);
      if (raw != null) {
        dispatch(flightCalendarSlice.actions._setSyncAll(JSON.parse(raw) === true));
      }
    } catch {}
    // Only now may an auto top-up run — see `hydrated` on the state.
    dispatch(flightCalendarSlice.actions._setHydrated(true));
  };
}

export default flightCalendarSlice.reducer;
