// Trip Details · "Add to iPhone Calendar" row — the discoverable half of the
// restored airline-schedule → iOS Calendar feature (the Schedule flight card
// carries the icon; the duty page carries the labelled action).
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import settingsReducer from '../../src/features/settings/settingsSlice';
import tripsReducer, { setTrips } from '../../src/features/travel/tripsSlice';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import dutiesReducer from '../../src/features/roster/dutiesSlice';
import flightCalendarReducer from '../../src/features/calendar/flightCalendarSlice';
import { TripDetailsScreen } from '../../src/features/v2/TripDetailsScreen';
import type { Trip } from '../../src/features/travel/tripCsv';

const mockSaveEvents = jest.fn(async (_events: unknown[]) => ['ev-1', 'ev-2', 'ev-3', 'ev-4']);
const mockRemoveEvents = jest.fn(async (_ids: string[]) => 4);

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

const trip: Trip = {
  id: 'pair-lhr',
  crewId: '35459',
  checkInDateUTC: '19 Sep 2026 1400',
  legs: [{
    crewId: '35459', fltNumber: 'TG920', flightDateUTC: '19 Sep 2026 1545',
    depArp: 'BKK', arvDateUTC: '20 Sep 2026 0445', arvArp: 'LHR', fleet: 'Boeing 777-300',
    hotel: 'Hilton Heathrow', localDepTime: '2026-09-19 22:45', localArvTime: '2026-09-20 05:45',
    assignment: 'FLY',
  }],
};

function renderTrip() {
  const store = configureStore({
    reducer: {
      auth: (state = { airline: 'TG', base: 'BKK', crewId: '35459' }) => state,
      settings: settingsReducer,
      trips: tripsReducer,
      alarms: alarmsReducer,
      duties: dutiesReducer,
      flightCalendar: flightCalendarReducer,
    },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setTrips([trip]));
  return render(
    <Provider store={store}>
      <TripDetailsScreen
        route={{ key: 'k', name: 'TripDetails', params: { tripId: trip.id } } as never}
        navigation={{} as never}
      />
    </Provider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy.mockClear();
});

describe('Trip Details ▸ iPhone Calendar', () => {
  it('offers to add the duty, then reports it is in the calendar', async () => {
    const tree = renderTrip();
    expect(tree.getByText('Add to iPhone Calendar')).toBeTruthy();
    expect(tree.queryByText('In your iPhone Calendar')).toBeNull();

    await act(async () => {
      fireEvent.press(tree.getByTestId('trip-calendar-toggle'));
    });

    expect(mockSaveEvents).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith('Added to Calendar', expect.stringContaining('4 entries'));
    expect(tree.getByText('In your iPhone Calendar')).toBeTruthy();
  });

  it('removes the entries on a second tap', async () => {
    const tree = renderTrip();
    await act(async () => { fireEvent.press(tree.getByTestId('trip-calendar-toggle')); });
    await act(async () => { fireEvent.press(tree.getByTestId('trip-calendar-toggle')); });

    expect(mockRemoveEvents).toHaveBeenCalledWith(['ev-1', 'ev-2', 'ev-3', 'ev-4']);
    expect(tree.getByText('Add to iPhone Calendar')).toBeTruthy();
  });
});
