// "Airline schedule → iOS Calendar" restored on the v2 Schedule timeline: the
// calendar icon the v1 flight card carried, writing the WHOLE duty (wake-up /
// leave home / check-in + one block per leg) and toggling it back off.
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { ScheduleScreen } from '../../src/features/v2/ScheduleScreen';
import settingsReducer from '../../src/features/settings/settingsSlice';
import tripsReducer, { setTrips } from '../../src/features/travel/tripsSlice';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import dutiesReducer from '../../src/features/roster/dutiesSlice';
import meetingsReducer from '../../src/features/meetings/meetingsSlice';
import notificationsReducer from '../../src/features/notifications/notificationsSlice';
import flightCalendarReducer from '../../src/features/calendar/flightCalendarSlice';
import type { Trip } from '../../src/features/travel/tripCsv';

const mockRequestAccess = jest.fn(async () => 'authorized' as 'authorized' | 'denied');
// Four markers + two legs — what the two-leg duty below writes.
const mockSaveEvents = jest.fn(async (_events: unknown[]) => ['ev-1', 'ev-2', 'ev-3', 'ev-4', 'ev-5']);
const mockRemoveEvents = jest.fn(async (_ids: string[]) => 5);

jest.mock('../../src/features/meetings/calendarModule', () => ({
  isCalendarAvailable: () => true,
  isCalendarWriteAvailable: () => true,
  requestCalendarAccess: () => mockRequestAccess(),
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

/** BKK → LHR on 19 Sep with the return on the 21st: one duty, two legs, two days. */
const lhrTrip: Trip = {
  id: 'pair-lhr',
  crewId: '35459',
  checkInDateUTC: '19 Sep 2026 1400',
  legs: [
    {
      crewId: '35459', fltNumber: 'TG920', flightDateUTC: '19 Sep 2026 1545',
      depArp: 'BKK', arvDateUTC: '20 Sep 2026 0445', arvArp: 'LHR', fleet: 'Boeing 777-300',
      hotel: 'Hilton Heathrow', localDepTime: '2026-09-19 22:45', localArvTime: '2026-09-20 05:45',
      assignment: 'FLY',
    },
    {
      crewId: '35459', fltNumber: 'TG911', flightDateUTC: '21 Sep 2026 1030',
      depArp: 'LHR', arvDateUTC: '21 Sep 2026 2230', arvArp: 'BKK', fleet: 'Boeing 777-300',
      hotel: '', localDepTime: '2026-09-21 11:30', localArvTime: '2026-09-22 05:30',
      assignment: 'FLY',
    },
  ],
};

/** Already flown on 8 Sep — a record, not something to calendar. */
const flownTrip: Trip = {
  id: 'pair-flown',
  crewId: '35459',
  checkInDateUTC: '08 Sep 2026 1100',
  legs: [{
    crewId: '35459', fltNumber: 'TG415', flightDateUTC: '08 Sep 2026 1300',
    depArp: 'BKK', arvDateUTC: '08 Sep 2026 1600', arvArp: 'SIN', fleet: 'Boeing 777-300',
    hotel: '', localDepTime: '2026-09-08 20:00', localArvTime: '2026-09-08 23:00', assignment: 'FLY',
  }],
};

function makeStore() {
  const store = configureStore({
    reducer: {
      auth: (state = { airline: 'TG', base: 'BKK', crewId: '35459' }) => state,
      settings: settingsReducer,
      trips: tripsReducer,
      alarms: alarmsReducer,
      duties: dutiesReducer,
      meetings: meetingsReducer,
      notifications: notificationsReducer,
      flightCalendar: flightCalendarReducer,
    },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setTrips([lhrTrip, flownTrip]));
  return store;
}

const renderSchedule = () =>
  render(
    <Provider store={makeStore()}>
      <ScheduleScreen />
    </Provider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy.mockClear();
});

describe('Schedule ▸ flight card → iOS Calendar', () => {
  it('offers the icon once per duty, on the first leg only', () => {
    const tree = renderSchedule();
    // Both legs of the LHR duty render (19 and 21 Sep), but the icon is
    // duty-level: it sits on the 19 Sep card alone.
    expect(tree.getByTestId('duty-TG920')).toBeTruthy();
    expect(tree.getByTestId('duty-TG911')).toBeTruthy();
    expect(tree.getAllByTestId('calendar-toggle-pair-lhr')).toHaveLength(1);
  });

  it('does not offer it for a duty that has already flown', () => {
    const tree = renderSchedule();
    expect(tree.getByTestId('duty-TG415')).toBeTruthy();
    expect(tree.queryByTestId('calendar-toggle-pair-flown')).toBeNull();
  });

  it('writes the whole duty, marked so it is never read back as a meeting', async () => {
    const tree = renderSchedule();
    await act(async () => {
      fireEvent.press(tree.getByTestId('calendar-toggle-pair-lhr'));
    });

    expect(mockRequestAccess).toHaveBeenCalled();
    expect(mockSaveEvents).toHaveBeenCalledTimes(1);
    const drafted = mockSaveEvents.mock.calls[0][0] as Array<{ url: string; title: string }>;
    expect(drafted).toHaveLength(5);
    expect(drafted.every(e => e.url === 'royce://flight/pair-lhr')).toBe(true);
    expect(drafted.map(e => e.title)).toEqual([
      expect.stringContaining('TG920'), // wake-up / get-ready marker
      expect.stringContaining('Leave Home'),
      expect.stringContaining('Check-in'),
      'TG920 · BKK → LHR',
      'TG911 · LHR → BKK',
    ]);
    expect(alertSpy).toHaveBeenCalledWith('Added to Calendar', expect.stringContaining('5 entries'));
  });

  it('toggles the same tap back off, deleting exactly what it wrote', async () => {
    const tree = renderSchedule();
    const icon = () => tree.getByTestId('calendar-toggle-pair-lhr');

    await act(async () => { fireEvent.press(icon()); });
    await act(async () => { fireEvent.press(icon()); });

    expect(mockRemoveEvents).toHaveBeenCalledWith(['ev-1', 'ev-2', 'ev-3', 'ev-4', 'ev-5']);
    expect(alertSpy).toHaveBeenCalledWith('Removed from Calendar', expect.any(String));
  });
});
