// ─── Trip Trade · Page 1 (My Duty) — Redux slice ──────────────────────────────
// The crew's publish/trade OVERLAY on top of their real captured roster. Duties
// come from tripsSlice (the TG/PR crew-portal capture) — this slice only stores
// which of those duties are published, any per-duty trade, and the dateless
// generic wants. Keyed by duty id (ids embed crewId, so TG and PR never mix).

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppDispatch, RootState } from '../../store';
import { emptyOverlay, type Trade, type TradeOverlay } from './tripTradeModel';

const STORAGE_KEY = '@royce_trip_trade_overlay';

const initialState: TradeOverlay = emptyOverlay();

const tripTradeSlice = createSlice({
  name: 'tripTrade',
  initialState,
  reducers: {
    _setPublished(state, action: PayloadAction<{ id: string; value: boolean }>) {
      state.published[action.payload.id] = action.payload.value;
    },
    _setManyPublished(state, action: PayloadAction<{ ids: string[]; value: boolean }>) {
      for (const id of action.payload.ids) {
        state.published[id] = action.payload.value;
      }
    },
    _setTrade(state, action: PayloadAction<{ id: string; trade: Trade }>) {
      state.trades[action.payload.id] = action.payload.trade;
    },
    _clearTrade(state, action: PayloadAction<string>) {
      delete state.trades[action.payload];
    },
    _addGenericWant(state, action: PayloadAction<Trade>) {
      state.genericWants.push(action.payload);
    },
    _removeGenericWant(state, action: PayloadAction<string>) {
      state.genericWants = state.genericWants.filter(w => w.id !== action.payload);
    },
    _hydrate(state, action: PayloadAction<TradeOverlay>) {
      state.published = action.payload.published;
      state.trades = action.payload.trades;
      state.genericWants = action.payload.genericWants;
    },
  },
});

const {
  _setPublished, _setManyPublished, _setTrade, _clearTrade,
  _addGenericWant, _removeGenericWant, _hydrate,
} = tripTradeSlice.actions;

async function persist(state: TradeOverlay) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function loadTripTrade() {
  return async (dispatch: AppDispatch) => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const saved = JSON.parse(raw) as Partial<TradeOverlay>;
      dispatch(_hydrate({
        published: saved.published ?? {},
        trades: saved.trades ?? {},
        genericWants: Array.isArray(saved.genericWants) ? saved.genericWants : [],
      }));
    } catch {}
  };
}

// ─── Mutation thunks — update then persist ────────────────────────────────────
export function toggleDutyPublished(id: string, current: boolean) {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(_setPublished({ id, value: !current }));
    persist(getState().tripTrade);
  };
}

export function publishAllDuties(ids: string[], value: boolean) {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(_setManyPublished({ ids, value }));
    persist(getState().tripTrade);
  };
}

export function setDutyTrade(id: string, trade: Trade) {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(_setTrade({ id, trade }));
    persist(getState().tripTrade);
  };
}

export function clearDutyTrade(id: string) {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(_clearTrade(id));
    persist(getState().tripTrade);
  };
}

export function addGenericWant(want: Trade) {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(_addGenericWant(want));
    persist(getState().tripTrade);
  };
}

export function removeGenericWant(id: string) {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(_removeGenericWant(id));
    persist(getState().tripTrade);
  };
}

// Exposed for tests.
export const tripTradeActions = tripTradeSlice.actions;
export default tripTradeSlice.reducer;
