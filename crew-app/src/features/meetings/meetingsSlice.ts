import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppDispatch, RootState } from '../../store';
import type { Meeting } from './meetingSetup';
import {
  DEFAULT_MEETING_MINUTES,
  DEFAULT_ISLAND_MINUTES,
  nextImminentMeeting,
} from './meetingSetup';
import {
  isCalendarAvailable,
  requestCalendarAccess,
  fetchMeetings,
  saveBackgroundConfig,
} from './calendarModule';
import { startMeetingCountdown, endMeetingCountdown } from './liveActivity';
import { reconcileAlarms } from '../alarms/alarmsSlice';

// Personal calendar meetings (Outlook/Exchange invites synced to iOS Calendar),
// read via EventKit and shown as cards + armed as alarms. Separate from the
// flight-alarm toggle so meetings can be enabled independently.

interface MeetingsState {
  enabled: boolean;
  /** Minutes before the meeting start the reminder fires (default 8). */
  minutesBefore: number;
  /** Show a Dynamic Island countdown before a meeting. */
  islandCountdown: boolean;
  /** How many minutes before start the island countdown appears (default 5). */
  islandLeadMinutes: number;
  /** Live meetings read from the device calendar (not persisted — re-read). */
  meetings: Meeting[];
  /** EventKit event IDs whose alarms have been individually silenced by the user. */
  mutedIds: string[];
}

const ENABLED_KEY = '@royce_meetings_enabled';
const MINUTES_KEY = '@royce_meetings_minutes';
const ISLAND_KEY = '@royce_meetings_island';
const ISLAND_MIN_KEY = '@royce_meetings_island_minutes';
const MUTED_KEY = '@royce_meetings_muted';

const initialState: MeetingsState = {
  enabled: false,
  minutesBefore: DEFAULT_MEETING_MINUTES,
  islandCountdown: false,
  islandLeadMinutes: DEFAULT_ISLAND_MINUTES,
  meetings: [],
  mutedIds: [],
};

const meetingsSlice = createSlice({
  name: 'meetings',
  initialState,
  reducers: {
    _setEnabled(state, action: PayloadAction<boolean>) {
      state.enabled = action.payload;
    },
    _setMinutes(state, action: PayloadAction<number>) {
      state.minutesBefore = action.payload;
    },
    _setIsland(state, action: PayloadAction<boolean>) {
      state.islandCountdown = action.payload;
    },
    _setIslandMinutes(state, action: PayloadAction<number>) {
      state.islandLeadMinutes = action.payload;
    },
    _setMeetings(state, action: PayloadAction<Meeting[]>) {
      state.meetings = action.payload;
    },
    _toggleMutedId(state, action: PayloadAction<string>) {
      const idx = state.mutedIds.indexOf(action.payload);
      if (idx >= 0) {
        state.mutedIds.splice(idx, 1);
      } else {
        state.mutedIds.push(action.payload);
      }
    },
  },
});

/**
 * Read the device calendar and sync alarms. No-op (and clears the list) unless
 * meetings are enabled and EventKit access is granted. Mirrors the config to
 * native so the background refresh task can keep arming alarms when the app is
 * closed. Called on launch, on toggle, on offset change, and by foreground
 * focus — re-reading is cheap and keeps the cards + alarms fresh.
 */
export function syncMeetings() {
  return async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const { enabled, minutesBefore } = getState().meetings;
    await saveBackgroundConfig({ enabled, minutesBefore });
    if (!enabled || !isCalendarAvailable()) {
      if (getState().meetings.meetings.length) {
        dispatch(meetingsSlice.actions._setMeetings([]));
      }
      await dispatch(reconcileAlarms());
      return;
    }
    const auth = await requestCalendarAccess();
    if (auth !== 'authorized') {
      dispatch(meetingsSlice.actions._setMeetings([]));
      await dispatch(reconcileAlarms());
      return;
    }
    try {
      const meetings = await fetchMeetings();
      dispatch(meetingsSlice.actions._setMeetings(meetings));
    } catch {
      // Leave the previous list in place if a read fails.
    }
    await dispatch(reconcileAlarms());
    await dispatch(syncIslandCountdown());
  };
}

/**
 * Start (or clear) the Dynamic Island countdown for the next imminent meeting.
 * The island appears once a meeting is within `islandLeadMinutes` of starting and
 * counts down to it. Best-effort: starting precisely while the app is fully
 * closed needs the background refresh task to run, so the island lights up when
 * the app is open or when iOS next wakes the refresh task.
 */
export function syncIslandCountdown() {
  return async (_dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const { islandCountdown, islandLeadMinutes, meetings } = getState().meetings;
    if (!islandCountdown) {
      await endMeetingCountdown();
      return;
    }
    const next = nextImminentMeeting(meetings, islandLeadMinutes, new Date());
    if (next) {
      await startMeetingCountdown({ id: next.id, title: next.title, startISO: next.startISO });
    } else {
      await endMeetingCountdown();
    }
  };
}

/** Flip the meetings switch: persist, then read the calendar / clear + reconcile. */
export function setMeetingsEnabled(enabled: boolean) {
  return async (dispatch: AppDispatch): Promise<void> => {
    dispatch(meetingsSlice.actions._setEnabled(enabled));
    try {
      await AsyncStorage.setItem(ENABLED_KEY, JSON.stringify(enabled));
    } catch {}
    await dispatch(syncMeetings());
  };
}

/** Change the reminder lead time, persist it, and re-arm the meeting alarms. */
export function setMeetingMinutes(minutes: number) {
  return async (dispatch: AppDispatch): Promise<void> => {
    dispatch(meetingsSlice.actions._setMinutes(minutes));
    try {
      await AsyncStorage.setItem(MINUTES_KEY, JSON.stringify(minutes));
    } catch {}
    await dispatch(syncMeetings());
  };
}

/** Toggle the Dynamic Island countdown; persist and refresh the island state. */
export function setIslandCountdown(enabled: boolean) {
  return async (dispatch: AppDispatch): Promise<void> => {
    dispatch(meetingsSlice.actions._setIsland(enabled));
    try {
      await AsyncStorage.setItem(ISLAND_KEY, JSON.stringify(enabled));
    } catch {}
    await dispatch(syncIslandCountdown());
  };
}

/** Toggle the per-meeting alarm mute: silences or re-enables a single meeting's alarm. */
export function toggleMeetingMute(meetingId: string) {
  return async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    dispatch(meetingsSlice.actions._toggleMutedId(meetingId));
    try {
      await AsyncStorage.setItem(
        MUTED_KEY,
        JSON.stringify(getState().meetings.mutedIds),
      );
    } catch {}
    await dispatch(reconcileAlarms());
  };
}

/** Change the island countdown lead time; persist and refresh the island state. */
export function setIslandLeadMinutes(minutes: number) {
  return async (dispatch: AppDispatch): Promise<void> => {
    dispatch(meetingsSlice.actions._setIslandMinutes(minutes));
    try {
      await AsyncStorage.setItem(ISLAND_MIN_KEY, JSON.stringify(minutes));
    } catch {}
    await dispatch(syncIslandCountdown());
  };
}

/** Hydrate the persisted enabled flag + minutes on launch. */
export function loadMeetingsSettings() {
  return async (dispatch: AppDispatch): Promise<void> => {
    try {
      const val = await AsyncStorage.getItem(ENABLED_KEY);
      if (val !== null) {
        dispatch(meetingsSlice.actions._setEnabled(JSON.parse(val)));
      }
    } catch {}
    try {
      const raw = await AsyncStorage.getItem(MINUTES_KEY);
      if (raw !== null) {
        const m = JSON.parse(raw);
        if (typeof m === 'number' && m > 0) {
          dispatch(meetingsSlice.actions._setMinutes(m));
        }
      }
    } catch {}
    try {
      const val = await AsyncStorage.getItem(ISLAND_KEY);
      if (val !== null) {
        dispatch(meetingsSlice.actions._setIsland(JSON.parse(val)));
      }
    } catch {}
    try {
      const raw = await AsyncStorage.getItem(ISLAND_MIN_KEY);
      if (raw !== null) {
        const m = JSON.parse(raw);
        if (typeof m === 'number' && m > 0) {
          dispatch(meetingsSlice.actions._setIslandMinutes(m));
        }
      }
    } catch {}
    try {
      const raw = await AsyncStorage.getItem(MUTED_KEY);
      if (raw !== null) {
        const ids = JSON.parse(raw);
        if (Array.isArray(ids)) {
          for (const id of ids) {
            if (typeof id === 'string') {
              dispatch(meetingsSlice.actions._toggleMutedId(id));
            }
          }
        }
      }
    } catch {}
  };
}

// Exposed for syncMeetings' internal use and for seeding in tests. Calendar
// meetings are normally set only by syncMeetings reading EventKit.
export const { _setMeetings: setMeetings } = meetingsSlice.actions;

export default meetingsSlice.reducer;
