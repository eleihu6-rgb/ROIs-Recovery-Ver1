import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AppDispatch } from '../../store';
import { DEFAULT_AIRLINE } from './airlines';
import { saveSession, loadSession, clearSession } from './sessionStore';
import { clearTrips } from '../travel/tripsSlice';
import { clearStoredTrips } from '../travel/tripsPersistence';
import { setDuties, clearStoredDuties } from '../roster/dutiesSlice';
import { reconcileAlarms } from '../alarms/alarmsSlice';

// Crew-portal login session (doc/App Flow Ver1). Replaces the old Google/Firebase
// stub. The crew picks an airline and signs in to that airline's crew portal; the
// session can be persisted ("Keep Login") so the app skips login next launch.

interface AuthState {
  airline: string;
  crewId: string | null;
  /** In-memory only (loaded from Keychain when keepLogin) — used to re-auth/refresh. */
  password: string | null;
  keepLogin: boolean;
  loggedIn: boolean;
  /** True once the persisted session has been checked on launch. */
  hydrated: boolean;
}

const initialState: AuthState = {
  airline: DEFAULT_AIRLINE,
  crewId: null,
  password: null,
  keepLogin: false,
  loggedIn: false,
  hydrated: false,
};

interface SessionPayload {
  airline: string;
  crewId: string;
  password: string;
  keepLogin: boolean;
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    _setSession(state, action: PayloadAction<SessionPayload>) {
      state.airline = action.payload.airline;
      state.crewId = action.payload.crewId;
      state.password = action.payload.password;
      state.keepLogin = action.payload.keepLogin;
      state.loggedIn = true;
    },
    _clearSession(state) {
      state.crewId = null;
      state.password = null;
      state.keepLogin = false;
      state.loggedIn = false;
    },
    _setHydrated(state) {
      state.hydrated = true;
    },
  },
});

const { _setSession, _clearSession, _setHydrated } = authSlice.actions;

// EK persists its roster + session metadata transactionally before Redux is
// published. This action completes that already-persisted login without running
// the legacy TG/PR persistence path a second time.
export function publishPersistedSession(payload: SessionPayload) {
  return _setSession(payload);
}

// Restore a persisted "Keep Login" session on app launch.
export function loadAuthSession() {
  return async (dispatch: AppDispatch) => {
    try {
      const saved = await loadSession();
      if (saved) {
        dispatch(_setSession(saved));
      }
    } finally {
      dispatch(_setHydrated());
    }
  };
}

// Log in: mark the session live and persist it when keepLogin is set.
export function login(payload: SessionPayload) {
  return async (dispatch: AppDispatch) => {
    dispatch(_setSession(payload));
    await saveSession(payload);
  };
}

// Log out: clear the CREW-PORTAL data only — trips, duties, scheduled flight
// alarms, and the persisted session — so the next crew starts clean and no stale
// per-flight alarms keep firing. Calendar meetings come from the DEVICE
// (Outlook/Exchange synced to iOS Calendar), not the crew portal, so they and
// their alarms are deliberately kept across logout: a different login doesn't own
// your personal meetings.
export function logout() {
  return async (dispatch: AppDispatch) => {
    // Crew-portal roster data: drop from Redux and from AsyncStorage.
    dispatch(clearTrips());
    dispatch(setDuties([]));
    await clearStoredTrips();
    await clearStoredDuties();
    // Re-sync alarms now that the trips are gone: reconcileAlarms clears every
    // flight alarm (no trips remain) but RE-ARMS the meeting alarms when meeting
    // reminders are enabled — so flight alarms vanish while meeting alarms stay.
    try {
      await dispatch(reconcileAlarms());
    } catch {
      // non-fatal
    }
    // Session: keychain password + airline/crew/keep flags.
    await clearSession();
    dispatch(_clearSession());
  };
}

export default authSlice.reducer;
