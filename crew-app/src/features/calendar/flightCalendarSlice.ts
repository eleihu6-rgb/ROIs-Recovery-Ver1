import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppDispatch, RootState } from '../../store';
import type { Trip } from '../travel/tripCsv';
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
}

const STORAGE_KEY = '@royce_flight_calendar';

const initialState: FlightCalendarState = {
  eventIds: {},
  busyDutyId: null,
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
  },
});

async function persist(map: Record<string, string[]>): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
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
        drafts.map(({ title, startISO, endISO, timeZone, notes }) => ({
          title,
          startISO,
          endISO,
          timeZone,
          notes,
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

/** Hydrate the created-event map on launch so the icons show the added state. */
export function loadFlightCalendar() {
  return async (dispatch: AppDispatch): Promise<void> => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw == null) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        dispatch(flightCalendarSlice.actions._hydrate(parsed));
      }
    } catch {}
  };
}

export default flightCalendarSlice.reducer;
