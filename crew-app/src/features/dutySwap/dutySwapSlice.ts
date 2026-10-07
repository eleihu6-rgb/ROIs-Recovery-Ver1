// Duty Swap screen state. Kept in Redux (not component state) because R'Bot
// reads it ("sees the screen") and changes it (filters / crews / selection) —
// spec §6. Not persisted: live portal data, re-fetched on open; cleared on logout.
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SearchOptions } from './dutySwapApi';
import type { ApiCompare, SwapCrew, SwapFilters } from './dutySwapModel';

/** One R'Bot turn on the Duty Swap screen (kept here so rotation/fold keeps the thread). */
export interface SwapRbotEntry { role: 'user' | 'assistant'; content: string; chips?: string[]; local?: boolean }

export interface DutySwapState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  filters: SwapFilters | null;
  /** Search result rows; the signed-in crew is always first. */
  crews: SwapCrew[];
  /** `selectTaskCompareList` per other crew (routes, legs, KPI fields). */
  details: Record<string, ApiCompare>;
  /** Duty keys I give / take. Everything taken belongs to `crewB`. */
  give: string[];
  take: string[];
  crewB: string | null;
  disclaimerAccepted: boolean;
  options: SearchOptions | null;
  rbot: SwapRbotEntry[];
}

const initialState: DutySwapState = {
  status: 'idle', error: null, filters: null, crews: [], details: {},
  give: [], take: [], crewB: null, disclaimerAccepted: false, options: null, rbot: [],
};

const slice = createSlice({
  name: 'dutySwap',
  initialState,
  reducers: {
    searchStarted(state, a: PayloadAction<SwapFilters>) {
      // Compare detail depends on the search window/filters: refetch per search.
      if (JSON.stringify(state.filters) !== JSON.stringify(a.payload)) state.details = {};
      state.filters = a.payload;
      state.status = 'loading';
      state.error = null;
    },
    searchSucceeded(state, a: PayloadAction<SwapCrew[]>) {
      state.status = 'ready';
      state.crews = a.payload;
      // Keep only selections that still exist in the new result.
      const keys = new Set(a.payload.flatMap(c => c.duties.map(d => d.key)));
      state.give = state.give.filter(k => keys.has(k));
      state.take = state.take.filter(k => keys.has(k));
      if (state.crewB && !a.payload.some(c => c.crewId === state.crewB)) { state.crewB = null; state.take = []; }
    },
    searchFailed(state, a: PayloadAction<string>) {
      // Keep the last result on screen (and in R'Bot's view); the error shows over it.
      state.status = 'error';
      state.error = a.payload;
    },
    detailLoaded(state, a: PayloadAction<{ crewId: string; compare: ApiCompare }>) {
      state.details[a.payload.crewId] = a.payload.compare;
    },
    toggleGive(state, a: PayloadAction<string>) {
      const i = state.give.indexOf(a.payload);
      if (i >= 0) state.give.splice(i, 1); else state.give.push(a.payload);
    },
    /** Taking a duty from another crew makes them crew B (and drops duties taken from a previous crew B). */
    toggleTake(state, a: PayloadAction<{ crewId: string; key: string }>) {
      if (state.crewB !== a.payload.crewId) { state.crewB = a.payload.crewId; state.take = []; }
      const i = state.take.indexOf(a.payload.key);
      if (i >= 0) state.take.splice(i, 1); else state.take.push(a.payload.key);
    },
    /** R'Bot picks: set (not toggle) the duties given / taken. */
    setGive(state, a: PayloadAction<string[]>) {
      state.give = a.payload;
    },
    setTake(state, a: PayloadAction<{ crewId: string; keys: string[] }>) {
      state.crewB = a.payload.crewId;
      state.take = a.payload.keys;
    },
    selectCrewB(state, a: PayloadAction<string | null>) {
      if (state.crewB !== a.payload) state.take = [];
      state.crewB = a.payload;
    },
    clearSelection(state) {
      state.give = []; state.take = []; state.crewB = null;
    },
    acceptDisclaimer(state) {
      state.disclaimerAccepted = true;
    },
    optionsLoaded(state, a: PayloadAction<SearchOptions>) {
      state.options = a.payload;
    },
    rbotAppend(state, a: PayloadAction<SwapRbotEntry>) {
      state.rbot.push(a.payload);
    },
    clearDutySwap() {
      return initialState;
    },
  },
});

export const {
  searchStarted, searchSucceeded, searchFailed, detailLoaded, toggleGive, toggleTake, setGive, setTake, selectCrewB, clearSelection,
  acceptDisclaimer, optionsLoaded, rbotAppend, clearDutySwap,
} = slice.actions;
export default slice.reducer;
