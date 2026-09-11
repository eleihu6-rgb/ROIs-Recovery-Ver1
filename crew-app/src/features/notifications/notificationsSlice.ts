// Crew-app notifications + FDP-discretion state.
//
// Follows the house pattern: a pure `createSlice` with synchronous reducers,
// plus standalone async orchestrators (`loadNotifications`, `decideDiscretion`)
// that call the api client and dispatch plain actions — the same split used by
// ../auth/ekRosterLogin.ts. Loading/error is kept in-slice here (a small,
// deliberate addition) because the Alerts screen needs to reflect fetch and
// decision progress inline.
import {createSlice, PayloadAction} from '@reduxjs/toolkit';

import {airlineByCode} from '../auth/airlines';
import {loadEkRosterSavedSession} from '../auth/ekRosterSnapshot';
import type {AppDispatch} from '../../store';
import {
  CrewNotification,
  CrewNotifyCredentials,
  DecisionChoice,
  DiscretionRequest,
  fetchNotifications,
  markNotificationRead,
  submitDiscretionDecision,
} from './notificationsApi';

export interface NotificationsState {
  notifications: CrewNotification[];
  openDiscretions: DiscretionRequest[];
  cursor: number;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  // discretionId currently being decided (drives per-card spinner / disable)
  decidingId: string | null;
}

const initialState: NotificationsState = {
  notifications: [],
  openDiscretions: [],
  cursor: 0,
  status: 'idle',
  error: null,
  decidingId: null,
};

const slice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    setLoading(state) {
      state.status = 'loading';
      state.error = null;
    },
    setFeed(
      state,
      action: PayloadAction<{
        notifications: CrewNotification[];
        openDiscretions: DiscretionRequest[];
        cursor: number;
      }>,
    ) {
      state.notifications = action.payload.notifications;
      state.openDiscretions = action.payload.openDiscretions;
      state.cursor = action.payload.cursor;
      state.status = 'ready';
      state.error = null;
    },
    setError(state, action: PayloadAction<string>) {
      state.status = 'error';
      state.error = action.payload;
    },
    setDeciding(state, action: PayloadAction<string | null>) {
      state.decidingId = action.payload;
    },
    // Replace an open discretion with its decided form (removes it from the
    // open list once terminal) and mark any matching notification read.
    applyDecision(state, action: PayloadAction<DiscretionRequest>) {
      const decided = action.payload;
      state.openDiscretions = state.openDiscretions.filter(
        d => d.discretionId !== decided.discretionId,
      );
      state.decidingId = null;
    },
    markRead(state, action: PayloadAction<string>) {
      const n = state.notifications.find(x => x.notifId === action.payload);
      if (n) {
        n.status = 'read';
      }
    },
    clearNotifications() {
      return initialState;
    },
  },
});

export const {
  setLoading,
  setFeed,
  setError,
  setDeciding,
  applyDecision,
  markRead,
  clearNotifications,
} = slice.actions;

export default slice.reducer;

// ── async orchestrators ──────────────────────────────────────────────────────

async function resolveCredentials(
  explicit?: CrewNotifyCredentials,
): Promise<{apiBaseUrl: string; credentials: CrewNotifyCredentials}> {
  let credentials = explicit;
  if (!credentials) {
    const saved = await loadEkRosterSavedSession();
    if (!saved) {
      throw new Error('Sign in to view notifications');
    }
    credentials = {
      airline: saved.airline,
      crewId: saved.crewId,
      password: saved.password,
    };
  }
  const airline = airlineByCode(credentials.airline);
  const apiBaseUrl = airline.apiBaseUrl;
  if (airline.portalKind !== 'rois-api' || !apiBaseUrl) {
    throw new Error(`${airline.name} crew API is not configured`);
  }
  return {apiBaseUrl, credentials};
}

export async function loadNotifications(
  dispatch: AppDispatch,
  options: {credentials?: CrewNotifyCredentials; since?: number; signal?: AbortSignal} = {},
): Promise<void> {
  dispatch(setLoading());
  try {
    const {apiBaseUrl, credentials} = await resolveCredentials(options.credentials);
    const feed = await fetchNotifications(
      apiBaseUrl,
      credentials,
      options.since,
      options.signal,
    );
    dispatch(
      setFeed({
        notifications: feed.notifications,
        openDiscretions: feed.openDiscretions,
        cursor: feed.cursor,
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }
    dispatch(setError(error instanceof Error ? error.message : 'Unable to load notifications'));
  }
}

// A stable idempotency key per (discretion, decision) so a double-tap on a laggy
// link never applies the extension twice — the backend replays the first result.
function decisionKey(discretionId: string, decision: DecisionChoice): string {
  return `${discretionId}:${decision}`;
}

export async function decideDiscretion(
  dispatch: AppDispatch,
  args: {
    discretionId: string;
    decision: DecisionChoice;
    credentials?: CrewNotifyCredentials;
    reason?: string;
    signal?: AbortSignal;
  },
): Promise<DiscretionRequest> {
  dispatch(setDeciding(args.discretionId));
  try {
    const {apiBaseUrl, credentials} = await resolveCredentials(args.credentials);
    const decided = await submitDiscretionDecision(
      apiBaseUrl,
      credentials,
      args.discretionId,
      args.decision,
      decisionKey(args.discretionId, args.decision),
      args.reason,
      args.signal,
    );
    dispatch(applyDecision(decided));
    // Refresh so the fdp_update summary lands in history immediately.
    await loadNotifications(dispatch, {credentials, signal: args.signal});
    return decided;
  } catch (error) {
    dispatch(setDeciding(null));
    throw error;
  }
}

export async function markNotificationReadThunk(
  dispatch: AppDispatch,
  args: {notifId: string; credentials?: CrewNotifyCredentials; signal?: AbortSignal},
): Promise<void> {
  try {
    const {apiBaseUrl, credentials} = await resolveCredentials(args.credentials);
    await markNotificationRead(apiBaseUrl, credentials, args.notifId, args.signal);
    dispatch(markRead(args.notifId));
  } catch {
    // Best-effort — a failed read-receipt must not disrupt the feed.
  }
}
