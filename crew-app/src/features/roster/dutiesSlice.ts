import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PortalDuty } from '../travel/portalCapture';
import {loadEkRosterSnapshot} from '../auth/ekRosterSnapshot';

// The full captured roster — every duty (FLY, MEETING, BLOCK, OFF, SBY, SIM, …),
// not just flights. Persisted so future features can use the whole roster.

interface DutiesState {
  duties: PortalDuty[];
}

const K_DUTIES = '@royce_duties';

const dutiesSlice = createSlice({
  name: 'duties',
  initialState: { duties: [] } as DutiesState,
  reducers: {
    setDuties(state, action: PayloadAction<PortalDuty[]>) {
      state.duties = action.payload;
    },
  },
});

export const { setDuties } = dutiesSlice.actions;

export async function saveDuties(duties: PortalDuty[]): Promise<void> {
  try {
    await AsyncStorage.setItem(K_DUTIES, JSON.stringify(duties));
  } catch {
    // non-fatal
  }
}

export async function loadDuties(): Promise<PortalDuty[]> {
  try {
    const snapshot = await loadEkRosterSnapshot();
    if (snapshot) {
      return snapshot.duties;
    }
    const raw = await AsyncStorage.getItem(K_DUTIES);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Wipe persisted duties (used on logout).
export async function clearStoredDuties(): Promise<void> {
  try {
    await AsyncStorage.removeItem(K_DUTIES);
  } catch {
    // non-fatal
  }
}

export default dutiesSlice.reducer;
