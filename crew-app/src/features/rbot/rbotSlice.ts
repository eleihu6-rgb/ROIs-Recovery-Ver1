// R'Bot's conversation session.
//
// The thread lives in the store, not in the chat screen, because R'Bot's own
// actions navigate: "change my theme" → "show me my calendar" → "now book
// tomorrow off" is ONE conversation, and the crew expects R'Bot to remember the
// first two steps after the chat screen has closed and been reopened (Ryan,
// 2026-09-11).
//
// A session, not a log: it is capped by entry count and by age, and it is
// cleared on logout so the next crew on the phone never sees the last crew's
// duties or requests.
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppDispatch } from '../../store';
import type { RbotThreadEntry } from './types';

const THREAD_KEY = '@royce_rbot_thread';
/** Persisted cap + age: a long chat must not grow the store or outlive the duty. */
export const MAX_STORED_ENTRIES = 40;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface RbotState {
  entries: RbotThreadEntry[];
  /** The crew left the chat while R'Bot was still answering. */
  unread: boolean;
}

const initialState: RbotState = {
  entries: [],
  unread: false,
};

const rbotSlice = createSlice({
  name: 'rbot',
  initialState,
  reducers: {
    _setEntries(state, action: PayloadAction<RbotThreadEntry[]>) {
      state.entries = action.payload;
    },
    /** `seen` is false when the reply lands while the crew is on another screen
     *  (the common case for a navigation action), which raises the dock dot. */
    appendEntry(state, action: PayloadAction<{entry: RbotThreadEntry; seen: boolean}>) {
      state.entries = [...state.entries, action.payload.entry].slice(-MAX_STORED_ENTRIES);
      if (action.payload.entry.role === 'assistant' && !action.payload.seen) {
        state.unread = true;
      }
    },
    markSeen(state) {
      state.unread = false;
    },
    /** "I answered, but you had already gone to another screen." */
    markUnread(state) {
      state.unread = true;
    },
    _clear(state) {
      state.entries = [];
      state.unread = false;
    },
  },
});

export const { appendEntry, markSeen, markUnread } = rbotSlice.actions;

/** Drops anything older than the session window, so a phone left overnight
 *  starts the next duty with a clean chat. */
function liveEntries(savedAt: number, entries: RbotThreadEntry[]): RbotThreadEntry[] {
  if (!Number.isFinite(savedAt) || Date.now() - savedAt > SESSION_TTL_MS) return [];
  return Array.isArray(entries) ? entries.slice(-MAX_STORED_ENTRIES) : [];
}

export function saveRbotThread() {
  return async (_dispatch: AppDispatch, getState: () => {rbot: RbotState}) => {
    const {entries} = getState().rbot;
    try {
      if (entries.length === 0) {
        await AsyncStorage.removeItem(THREAD_KEY);
        return;
      }
      await AsyncStorage.setItem(
        THREAD_KEY,
        JSON.stringify({savedAt: Date.now(), entries: entries.slice(-MAX_STORED_ENTRIES)}),
      );
    } catch {
      // Chat history is a convenience — never block a reply on storage.
    }
  };
}

export function loadRbotThread() {
  return async (dispatch: AppDispatch) => {
    try {
      const raw = await AsyncStorage.getItem(THREAD_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {savedAt?: number; entries?: RbotThreadEntry[]};
      dispatch(rbotSlice.actions._setEntries(
        liveEntries(Number(parsed.savedAt), parsed.entries ?? []),
      ));
    } catch {
      // A corrupt or unreadable thread just means an empty chat.
    }
  };
}

/** Logout: forget the conversation with it. */
export function clearRbotSession() {
  return async (dispatch: AppDispatch) => {
    dispatch(rbotSlice.actions._clear());
    try {
      await AsyncStorage.removeItem(THREAD_KEY);
    } catch {
      // non-fatal
    }
  };
}

export default rbotSlice.reducer;
