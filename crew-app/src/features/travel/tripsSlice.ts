import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Trip } from './tripCsv';
import { tripStartDate, tripEndDate } from './tripCsv';

interface TripsState {
  trips: Trip[];
}

const initialState: TripsState = {
  trips: [],
};

const tripsSlice = createSlice({
  name: 'trips',
  initialState,
  reducers: {
    setTrips(state, action: PayloadAction<Trip[]>) {
      state.trips = action.payload;
    },
    addTrips(state, action: PayloadAction<Trip[]>) {
      // Upsert by id (id is stable: crewId-checkInDateUTC-fltNumber). A fresh
      // capture of the same trip REPLACES the stored one, so re-capturing updates
      // existing cards with newly-enriched data (e.g. real dep/arv airports from
      // the roster report) instead of being skipped as a duplicate — which kept
      // stale DEP/ARR cards on screen forever.
      const byId = new Map(state.trips.map(t => [t.id, t]));
      for (const t of action.payload) {
        byId.set(t.id, t);
      }
      state.trips = Array.from(byId.values());
    },
    syncCapturedTrips(state, action: PayloadAction<Trip[]>) {
      // A roster capture is AUTHORITATIVE for each crew over the date span it
      // covers. Replace that crew's trips inside the captured window, then add
      // the fresh ones. Unlike addTrips (upsert by id), this REMOVES stale trips
      // that are no longer produced — e.g. when two single-leg cards are now
      // regrouped into one rotation (so the old TG402 card doesn't linger), or
      // when a duty was dropped from the republished roster. Other crews and any
      // history OUTSIDE the captured window are left untouched.
      const incoming = action.payload;
      if (!incoming.length) {
        return;
      }
      const crews = new Set(incoming.map(t => t.crewId));
      const starts = incoming.map(t => tripStartDate(t)?.getTime() ?? 0);
      const ends = incoming.map(
        t => tripEndDate(t)?.getTime() ?? tripStartDate(t)?.getTime() ?? 0,
      );
      const spanStart = Math.min(...starts);
      const spanEnd = Math.max(...ends);
      const kept = state.trips.filter(t => {
        if (!crews.has(t.crewId)) {
          return true; // different crew — keep
        }
        const s = tripStartDate(t)?.getTime();
        if (s == null) {
          return true; // undateable — can't tell if in-window, keep it
        }
        return s < spanStart || s > spanEnd; // outside the captured window — keep
      });
      const incomingById = new Map(incoming.map(t => [t.id, t]));
      state.trips = [...kept, ...incomingById.values()];
    },
    clearTrips(state) {
      state.trips = [];
    },
  },
});

export const { setTrips, addTrips, syncCapturedTrips, clearTrips } =
  tripsSlice.actions;
export default tripsSlice.reducer;
