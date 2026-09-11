import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppDispatch } from '../../store';
import { DEFAULT_EXPLORE_PREFS } from '../explore/explorePlaces';

// ─── Time-zone display preference ─────────────────────────────────────────────
// Controls how every flight/duty time renders throughout the app:
//  • 'airport' — each leg shows its own departure/arrival airport local time
//  • 'base'    — all times shown in a single base timezone (default Bangkok)
//  • 'utc'     — all times in UTC
//  • 'device'  — all times in the phone's current local timezone
// Persisted to AsyncStorage so the choice survives restarts (pattern: alarmsSlice).

export type TimeZoneMode = 'airport' | 'base' | 'utc' | 'device';

export interface SettingsState {
  timeZoneMode: TimeZoneMode;
  baseTimeZone: string;
  // Explore (doc/Explore Ver1): crew-picked interests (category keys from
  // explorePlaces.EXPLORE_CATEGORIES) used to filter layover recommendations.
  explorePrefs: string[];
}

const TZMODE_KEY = '@royce_tzmode';
const EXPLORE_PREFS_KEY = '@royce_explore_prefs';

const initialState: SettingsState = {
  timeZoneMode: 'airport',
  baseTimeZone: 'Asia/Bangkok',
  explorePrefs: [...DEFAULT_EXPLORE_PREFS],
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    _setTimeZoneMode(state, action: PayloadAction<TimeZoneMode>) {
      state.timeZoneMode = action.payload;
    },
    _setBaseTimeZone(state, action: PayloadAction<string>) {
      state.baseTimeZone = action.payload;
    },
    _setExplorePrefs(state, action: PayloadAction<string[]>) {
      state.explorePrefs = action.payload;
    },
  },
});

// Thunks — persist the chosen mode to AsyncStorage so it survives restarts.
export function setTimeZoneMode(mode: TimeZoneMode) {
  return async (dispatch: AppDispatch) => {
    dispatch(settingsSlice.actions._setTimeZoneMode(mode));
    try {
      await AsyncStorage.setItem(TZMODE_KEY, JSON.stringify(mode));
    } catch {}
  };
}

/** Persist the crew's Explore interests so they survive restarts. */
export function setExplorePrefs(prefs: string[]) {
  return async (dispatch: AppDispatch) => {
    dispatch(settingsSlice.actions._setExplorePrefs(prefs));
    try {
      await AsyncStorage.setItem(EXPLORE_PREFS_KEY, JSON.stringify(prefs));
    } catch {}
  };
}

export function loadSettings() {
  return async (dispatch: AppDispatch) => {
    try {
      const val = await AsyncStorage.getItem(TZMODE_KEY);
      if (val !== null) {
        const mode = JSON.parse(val);
        if (mode === 'airport' || mode === 'base' || mode === 'utc' || mode === 'device') {
          dispatch(settingsSlice.actions._setTimeZoneMode(mode));
        }
      }
    } catch {}
    try {
      const raw = await AsyncStorage.getItem(EXPLORE_PREFS_KEY);
      if (raw !== null) {
        const prefs = JSON.parse(raw);
        if (Array.isArray(prefs) && prefs.every(p => typeof p === 'string')) {
          dispatch(settingsSlice.actions._setExplorePrefs(prefs));
        }
      }
    } catch {}
  };
}

export default settingsSlice.reducer;
