// The Schedule tab must honour the roster view R'Bot asks for. (The absence
// pre-fill hand-off is covered by rbotAbsencePrefill.test.tsx, which lives with
// the Story-101 absence screen it drives.)
import React from 'react';
import { render } from '@testing-library/react-native';
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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: jest.fn(), goBack: jest.fn()}),
  useFocusEffect: jest.fn(),
}));

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

function makeStore() {
  const store = configureStore({
    reducer: {
      auth: (state = {airline: 'TG', base: 'BKK', crewId: '35459', password: 'pw'}) => state,
      settings: settingsReducer,
      trips: tripsReducer,
      alarms: alarmsReducer,
      duties: dutiesReducer,
      meetings: meetingsReducer,
      notifications: notificationsReducer,
      flightCalendar: flightCalendarReducer,
    },
    middleware: getDefaultMiddleware => getDefaultMiddleware({serializableCheck: false}),
  });
  store.dispatch(setTrips([lhrTrip]));
  return store;
}

describe("R'Bot -> Schedule roster view", () => {
  beforeAll(() => {
    // Local construction: the screens read local calendar dates, so pinning an
    // exact local wall clock keeps the assertions true on any machine timezone.
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 12, 9, 0, 0));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('opens the route map the assistant asked for', () => {
    const {getByTestId} = render(
      <Provider store={makeStore()}>
        <ScheduleScreen route={{params: {view: 'route', viewAt: 1}}} />
      </Provider>,
    );
    expect(getByTestId('route-view')).toBeTruthy();
  });

  it('opens the calendar the assistant asked for', () => {
    const {getByTestId, queryByTestId} = render(
      <Provider store={makeStore()}>
        <ScheduleScreen route={{params: {view: 'calendar-compact', viewAt: 1}}} />
      </Provider>,
    );
    // The calendar renders the day grid; the route map must not be mounted.
    expect(queryByTestId('route-view')).toBeNull();
    expect(getByTestId('sched-title')).toBeTruthy();
  });

  it('stays on the timeline with no request (a plain tab tap changes nothing)', () => {
    const {queryByTestId} = render(
      <Provider store={makeStore()}>
        <ScheduleScreen />
      </Provider>,
    );
    expect(queryByTestId('route-view')).toBeNull();
  });
});
