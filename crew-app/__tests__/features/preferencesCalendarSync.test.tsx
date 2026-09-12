// Profile ▸ Preferences ▸ Sync ▸ "iOS Calendar sync" — the master switch the
// approved v2 mock always had but the shipped screen was missing.
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { PreferencesScreen } from '../../src/features/v2/PreferencesScreen';
import settingsReducer from '../../src/features/settings/settingsSlice';
import tripsReducer, { setTrips } from '../../src/features/travel/tripsSlice';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import meetingsReducer from '../../src/features/meetings/meetingsSlice';
import flightCalendarReducer from '../../src/features/calendar/flightCalendarSlice';
import type { Trip } from '../../src/features/travel/tripCsv';

const mockSaveEvents = jest.fn(async (events: unknown[]) => events.map((_, i) => `ev-${i}`));
const mockRemoveEvents = jest.fn(async (ids: string[]) => ids.length);

jest.mock('../../src/features/meetings/calendarModule', () => ({
  isCalendarAvailable: () => true,
  isCalendarWriteAvailable: () => true,
  requestCalendarAccess: async () => 'authorized',
  saveCalendarEvents: (events: unknown[]) => mockSaveEvents(events),
  removeCalendarEvents: (ids: string[]) => mockRemoveEvents(ids),
  fetchMeetings: async () => [],
  saveBackgroundConfig: async () => {},
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const upcoming: Trip = {
  id: 'soon-1',
  crewId: '35459',
  checkInDateUTC: '20 Sep 2026 0800',
  legs: [{
    crewId: '35459', fltNumber: 'TG100', flightDateUTC: '20 Sep 2026 1000',
    depArp: 'BKK', arvDateUTC: '20 Sep 2026 1400', arvArp: 'SIN', fleet: '777',
    hotel: '', assignment: 'FLY',
  }],
};

function renderPrefs() {
  const store = configureStore({
    reducer: {
      auth: (state = { airline: 'TG', base: 'BKK', crewId: '35459' }) => state,
      settings: settingsReducer,
      trips: tripsReducer,
      alarms: alarmsReducer,
      meetings: meetingsReducer,
      flightCalendar: flightCalendarReducer,
    },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setTrips([upcoming]));
  const tree = render(
    <Provider store={store}>
      <PreferencesScreen />
    </Provider>,
  );
  return { tree, store };
}

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy.mockClear();
});

describe('Preferences ▸ iOS Calendar sync', () => {
  it('offers the switch with an honest explanation', () => {
    const { tree } = renderPrefs();
    expect(tree.getByText('iOS Calendar sync')).toBeTruthy();
    expect(tree.getByText(/Keep every upcoming duty in your iPhone Calendar/)).toBeTruthy();
  });

  it('turning it on writes the upcoming roster and says what happened', async () => {
    const { tree, store } = renderPrefs();

    await act(async () => {
      fireEvent(tree.getByTestId('pref-calendar-sync'), 'valueChange', true);
    });

    expect(mockSaveEvents).toHaveBeenCalledTimes(1);
    expect(store.getState().flightCalendar.syncAll).toBe(true);
    expect(alertSpy).toHaveBeenCalledWith('Calendar sync on', expect.stringContaining('4 entries'));
  });

  it('turning it off removes exactly what it wrote', async () => {
    const { tree, store } = renderPrefs();
    await act(async () => {
      fireEvent(tree.getByTestId('pref-calendar-sync'), 'valueChange', true);
    });

    await act(async () => {
      fireEvent(tree.getByTestId('pref-calendar-sync'), 'valueChange', false);
    });

    expect(mockRemoveEvents).toHaveBeenCalledWith(['ev-0', 'ev-1', 'ev-2', 'ev-3']);
    expect(store.getState().flightCalendar.eventIds).toEqual({});
    expect(alertSpy).toHaveBeenCalledWith('Calendar sync off', expect.stringContaining('4 entries'));
  });
});
