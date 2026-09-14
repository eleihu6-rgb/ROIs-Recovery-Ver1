// Crew Recovery Story 101: the Absence quick action is a real sick-leave
// submission screen, not a static mock. Covers: sick selected by default with
// the other two types disabled, the "Affects" preview computed from the
// loaded roster, and submit → API → success/error handling.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { AbsenceScreen } from '../../src/features/v2/AbsenceScreen';
import authReducer, { login } from '../../src/features/auth/authSlice';
import tripsReducer, { setTrips } from '../../src/features/travel/tripsSlice';
import settingsReducer, { setTimeZoneMode } from '../../src/features/settings/settingsSlice';
import type { Trip } from '../../src/features/travel/tripCsv';
import type { AppDispatch } from '../../src/store';
import type { SubmitAbsenceResult } from '../../src/features/absence/absenceApi';

jest.mock('../../src/features/absence/absenceApi', () => ({
  // Keep the real date helper: the screen formats the submit range with it.
  ...jest.requireActual('../../src/features/absence/absenceApi'),
  submitAbsence: jest.fn(),
}));
import { submitAbsence } from '../../src/features/absence/absenceApi';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Roster "DD MMM YYYY HHMM" string for a LOCAL calendar date. In 'utc' display
 *  mode the screen reads this string's digits back with no zone conversion
 *  (see legDisplayDate mode==='utc' -> rosterDateOnly), so building the string
 *  from the device's own local Y/M/D lines it up exactly with the screen's
 *  default From/To ("today", also local Y/M/D) regardless of the CI machine's
 *  timezone. */
function rosterStr(date: Date, hhmm = '0630'): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mon = MONS[date.getMonth()];
  return `${dd} ${mon} ${date.getFullYear()} ${hhmm}`;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function tripOn(id: string, fltNumber: string, date: Date): Trip {
  const dep = rosterStr(date, '0630');
  const arv = rosterStr(date, '0830');
  return {
    id,
    crewId: '113',
    checkInDateUTC: dep,
    legs: [{
      crewId: '113',
      fltNumber,
      flightDateUTC: dep,
      depArp: 'ADD',
      arvDateUTC: arv,
      arvArp: 'JIB',
      fleet: 'Boeing 737-800',
      hotel: '',
    }],
  };
}

function runThunk(store: { dispatch: unknown }, thunk: (dispatch: AppDispatch) => Promise<void>) {
  return thunk(store.dispatch as AppDispatch);
}

async function makeStore(trips: Trip[] = []) {
  const store = configureStore({
    reducer: { auth: authReducer, trips: tripsReducer, settings: settingsReducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
  });
  await runThunk(store, login({ airline: 'F8', crewId: '113', password: 'Pier2026', keepLogin: false }));
  // 'utc' mode makes the roster-string digits the calendar date directly (see
  // rosterStr above) — deterministic across whatever timezone the test runs in.
  await runThunk(store, setTimeZoneMode('utc'));
  store.dispatch(setTrips(trips));
  return store;
}

const navigation = { goBack: jest.fn(), navigate: jest.fn() } as unknown as Parameters<typeof AbsenceScreen>[0]['navigation'];
const route = { key: 'spec-absence', name: 'Spec', params: { id: 'absence' } } as unknown as Parameters<typeof AbsenceScreen>[0]['route'];

function renderScreen(store: ReturnType<typeof configureStore>) {
  return render(
    <Provider store={store}>
      <AbsenceScreen navigation={navigation} route={route} />
    </Provider>,
  );
}

describe('AbsenceScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('selects Sick leave by default and disables Emergency/Personal as coming soon', async () => {
    const store = await makeStore([]);
    const tree = renderScreen(store);

    expect(tree.getByTestId('absence-type-sick')).toBeTruthy();
    expect(tree.getByTestId('absence-type-emergency')).toBeTruthy();
    expect(tree.getByTestId('absence-type-personal')).toBeTruthy();
    expect(tree.getAllByText('Coming soon')).toHaveLength(2);
  });

  it('lists duties overlapping the default (today) range under Affects', async () => {
    const today = new Date();
    const farAway = addDays(today, -10);
    const store = await makeStore([
      tripOn('t-in-range', 'ET462', today),
      tripOn('t-out-of-range', 'ET999', farAway),
    ]);
    const tree = renderScreen(store);

    expect(tree.getByText('ET462')).toBeTruthy();
    expect(tree.queryByText('ET999')).toBeNull();
  });

  it('shows "No duties in range" when nothing overlaps', async () => {
    const store = await makeStore([]);
    const tree = renderScreen(store);

    expect(tree.getByText('No duties in range')).toBeTruthy();
  });

  it('extending "To" by one day pulls in the next day\'s duty', async () => {
    const today = new Date();
    const tomorrow = addDays(today, 1);
    const store = await makeStore([tripOn('t-tomorrow', 'ET470', tomorrow)]);
    const tree = renderScreen(store);

    expect(tree.queryByText('ET470')).toBeNull();
    await act(async () => {
      fireEvent.press(tree.getByTestId('absence-to-inc'));
    });
    expect(tree.getByText('ET470')).toBeTruthy();
  });

  it('submits sick leave and confirms with the success pop-up before leaving the form', async () => {
    const mockResult: SubmitAbsenceResult = {
      absenceId: 12,
      assignment: 'ILL',
      fromDate: '2026-09-14',
      toDate: '2026-09-14',
      removedPairingIds: [],
      retainedPairingIds: [151614],
      groundDays: 1,
      notificationId: 'absence-12',
    };
    (submitAbsence as jest.Mock).mockResolvedValue(mockResult);
    const store = await makeStore([]);
    const tree = renderScreen(store);

    fireEvent.changeText(tree.getByTestId('absence-note'), 'flu');
    await act(async () => {
      fireEvent.press(tree.getByTestId('absence-submit'));
    });

    expect(submitAbsence).toHaveBeenCalledTimes(1);
    const call = (submitAbsence as jest.Mock).mock.calls[0][0];
    expect(call).toMatchObject({
      airline: 'F8',
      crewId: '113',
      password: 'Pier2026',
      type: 'sick',
      note: 'flu',
    });
    expect(call.fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(call.toDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Pop-up standard: a success status card, and the crew stays on the form
    // until they acknowledge it (the old alert navigated away immediately).
    expect(tree.getByTestId('absence-dialog-title')).toBeTruthy();
    expect(tree.getByText('Request submitted')).toBeTruthy();
    expect(tree.getByText('Sick leave added. Original duties remain assigned pending Crew Control recovery.')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();

    fireEvent.press(tree.getByTestId('absence-dialog-confirm'));

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('opens the submitted-request history from the header icon', async () => {
    const store = await makeStore([]);
    const tree = renderScreen(store);

    fireEvent.press(tree.getByTestId('absence-history'));

    expect(navigation.navigate).toHaveBeenCalledWith('AbsenceHistory');
  });

  it('shows the server error in a destructive pop-up and stays on the screen', async () => {
    (submitAbsence as jest.Mock).mockRejectedValue(
      new Error('An absence already covers part of this range.'),
    );
    const store = await makeStore([]);
    const tree = renderScreen(store);

    await act(async () => {
      fireEvent.press(tree.getByTestId('absence-submit'));
    });

    expect(tree.getByText('Unable to submit')).toBeTruthy();
    expect(tree.getByText('An absence already covers part of this range.')).toBeTruthy();

    // Dismissing the failure returns the crew to the form, not away from it.
    fireEvent.press(tree.getByTestId('absence-dialog-confirm'));

    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('tells a guest to sign in with a warning pop-up instead of submitting', async () => {
    const store = await makeStore([]);
    await runThunk(store, login({ airline: '', crewId: '', password: '', keepLogin: false }));
    const tree = renderScreen(store);

    await act(async () => {
      fireEvent.press(tree.getByTestId('absence-submit'));
    });

    expect(submitAbsence).not.toHaveBeenCalled();
    expect(tree.getByText('Airline sign-in needed')).toBeTruthy();
    expect(tree.getByText('Reporting an absence needs your crew ID. Sign in with your airline on Profile first.')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
