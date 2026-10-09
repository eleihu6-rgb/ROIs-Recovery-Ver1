// Check-In · the crew's own check-ins, recorded on this phone only (demo: no
// portal write). Keyed per airline + crew + duty so accounts never mix.
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface CheckInState {
  /** `${airline}:${crewId}:${dutyId}` → instant of the check-in (ms). */
  records: Record<string, number>;
}

const initialState: CheckInState = { records: {} };

export const checkInKey = (airline: string, crewId: string | null, dutyId: string): string =>
  `${airline}:${crewId ?? ''}:${dutyId}`;

const checkInSlice = createSlice({
  name: 'checkIn',
  initialState,
  reducers: {
    checkedIn(state, action: PayloadAction<{ key: string; at: number }>) {
      state.records[action.payload.key] = action.payload.at;
    },
  },
});

export const { checkedIn } = checkInSlice.actions;
export default checkInSlice.reducer;
