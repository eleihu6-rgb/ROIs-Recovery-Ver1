// Crew Recovery Story 101 follow-up: the Absence Request history page.
// Covers: the current-calendar-month scope sent to live-server, the rows the
// crew reads (type, days, Active/Cancelled, note), the empty state, the error
// state with retry, and the guest case that must not call the API at all.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { AbsenceHistoryScreen } from '../../src/features/v2/AbsenceHistoryScreen';
import authReducer, { login } from '../../src/features/auth/authSlice';
import tripsReducer from '../../src/features/travel/tripsSlice';
import settingsReducer from '../../src/features/settings/settingsSlice';
import type { AbsenceRecord } from '../../src/features/absence/absenceApi';
import type { AppDispatch } from '../../src/store';

jest.mock('../../src/features/absence/absenceApi', () => ({
  ...jest.requireActual('../../src/features/absence/absenceApi'),
  listAbsences: jest.fn(),
}));
import { listAbsences } from '../../src/features/absence/absenceApi';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// The page scopes itself to the calendar month the device is in right now, so
// the expected window and labels are derived the same way the screen does.
const now = new Date();
const YEAR = now.getFullYear();
const MONTH = now.getMonth();
const MM = String(MONTH + 1).padStart(2, '0');
const MONTH_LABEL = `${MON[MONTH]} ${YEAR}`;
const LAST_DAY = new Date(YEAR, MONTH + 1, 0).getDate();

/** A crew-base local day inside the month under test. */
function isoDay(day: number): string {
  return `${YEAR}-${MM}-${String(day).padStart(2, '0')}`;
}
function dayLabel(day: number): string {
  return `${day} ${MON[MONTH]} ${YEAR}`;
}

/** The two rows ET J4002 really has this month on SIT: a live day and a
 *  cancelled one, the cancelled one carrying the recovery note. */
function record(over: Partial<AbsenceRecord> & { id: number; fromDate: string }): AbsenceRecord {
  return {
    absenceType: 'sick',
    assignment: 'ILL',
    toDate: over.fromDate,
    status: 'active',
    note: '',
    createdAt: `${over.fromDate}T09:00:00.000Z`,
    ...over,
  };
}

const cancelledRow = record({
  id: 10,
  fromDate: isoDay(24),
  status: 'cancelled',
  note: 'S1-20260912-J4002-RETAIN-DUTY-UI',
});
const activeRow = record({ id: 3, fromDate: isoDay(11) });

async function makeStore(session: { airline: string; crewId: string } | null = { airline: 'ET', crewId: 'J4002' }) {
  const store = configureStore({
    reducer: { auth: authReducer, trips: tripsReducer, settings: settingsReducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
  });
  await (login({
    airline: session?.airline ?? '',
    crewId: session?.crewId ?? '',
    password: session ? 'Pier2026' : '',
    keepLogin: false,
  })(store.dispatch as AppDispatch));
  return store;
}

function renderScreen(store: ReturnType<typeof configureStore>) {
  return render(
    <Provider store={store}>
      <AbsenceHistoryScreen />
    </Provider>,
  );
}

describe('AbsenceHistoryScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists this calendar month\'s requests with their outcome and note', async () => {
    (listAbsences as jest.Mock).mockResolvedValue([cancelledRow, activeRow]);
    const tree = renderScreen(await makeStore());

    await act(async () => {});

    expect(tree.getByTestId('page-absence-history')).toBeTruthy();
    expect(listAbsences).toHaveBeenCalledWith({
      airline: 'ET',
      crewId: 'J4002',
      password: 'Pier2026',
      fromDate: `${YEAR}-${MM}-01`,
      toDate: `${YEAR}-${MM}-${String(LAST_DAY).padStart(2, '0')}`,
    });
    expect(tree.getByText(`${MONTH_LABEL} · 2 requests`)).toBeTruthy();
    expect(tree.getByText(dayLabel(24))).toBeTruthy();
    // Both outcomes are on screen: the live request and the recovery cancellation.
    expect(tree.getByTestId('absence-history-status-10')).toBeTruthy();
    expect(tree.getByText('Cancelled')).toBeTruthy();
    expect(tree.getByTestId('absence-history-status-3')).toBeTruthy();
    expect(tree.getByText('Active')).toBeTruthy();
    expect(tree.getByText('S1-20260912-J4002-RETAIN-DUTY-UI')).toBeTruthy();
    expect(tree.getAllByText('Sick leave')).toHaveLength(2);
    expect(tree.queryByTestId('absence-history-empty')).toBeNull();
  });

  it('spans multi-day requests as a range', async () => {
    (listAbsences as jest.Mock).mockResolvedValue([
      record({ id: 4, fromDate: isoDay(11), toDate: isoDay(13) }),
    ]);
    const tree = renderScreen(await makeStore());

    await act(async () => {});

    expect(tree.getByText(`${dayLabel(11)} → ${dayLabel(13)}`)).toBeTruthy();
  });

  it('shows the loader while the month is being read', async () => {
    let resolveRows: (rows: AbsenceRecord[]) => void = () => {};
    (listAbsences as jest.Mock).mockReturnValue(
      new Promise<AbsenceRecord[]>(resolve => { resolveRows = resolve; }),
    );
    const tree = renderScreen(await makeStore());

    await act(async () => {});
    expect(tree.getByTestId('absence-history-loading')).toBeTruthy();

    await act(async () => { resolveRows([activeRow]); });

    expect(tree.queryByTestId('absence-history-loading')).toBeNull();
    expect(tree.getByTestId('absence-history-row-3')).toBeTruthy();
  });

  it('says the month is empty when the crew filed nothing', async () => {
    (listAbsences as jest.Mock).mockResolvedValue([]);
    const tree = renderScreen(await makeStore());

    await act(async () => {});

    expect(tree.getByTestId('absence-history-empty')).toBeTruthy();
    expect(tree.getByText(`No requests submitted in ${MONTH_LABEL}.`)).toBeTruthy();
    expect(tree.getByText(`${MONTH_LABEL} · 0 requests`)).toBeTruthy();
    expect(tree.queryByTestId('absence-history-retry')).toBeNull();
  });

  it('shows the server error and recovers on Try again', async () => {
    (listAbsences as jest.Mock)
      .mockRejectedValueOnce(new Error('Unable to load your submitted requests.'))
      .mockResolvedValueOnce([activeRow]);
    const tree = renderScreen(await makeStore());

    await act(async () => {});
    expect(tree.getByTestId('absence-history-error')).toBeTruthy();
    expect(tree.getByText('Unable to load your submitted requests.')).toBeTruthy();

    await act(async () => {
      fireEvent.press(tree.getByTestId('absence-history-retry'));
    });

    expect(tree.queryByTestId('absence-history-error')).toBeNull();
    expect(tree.queryByText('Unable to load your submitted requests.')).toBeNull();
    expect(tree.getByTestId('absence-history-row-3')).toBeTruthy();
    expect(listAbsences).toHaveBeenCalledTimes(2);
  });

  it('tells a guest to sign in instead of calling the API', async () => {
    const tree = renderScreen(await makeStore(null));

    await act(async () => {});

    expect(tree.getByTestId('absence-history-signed-out')).toBeTruthy();
    expect(tree.getByText('Sign in with your airline on Profile first.')).toBeTruthy();
    expect(listAbsences).not.toHaveBeenCalled();
    expect(tree.queryByTestId('absence-history-retry')).toBeNull();
  });
});
