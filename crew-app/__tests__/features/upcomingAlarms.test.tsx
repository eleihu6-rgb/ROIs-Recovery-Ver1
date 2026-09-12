// Upcoming Alarms · grouping.
// Ryan: "alarms would be grouped by flight, no need to repeat flight info
// multiple times."
import React from 'react';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import authReducer from '../../src/features/auth/authSlice';
import settingsReducer from '../../src/features/settings/settingsSlice';
import tripsReducer, { setTrips } from '../../src/features/travel/tripsSlice';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import dutiesReducer from '../../src/features/roster/dutiesSlice';
import meetingsReducer from '../../src/features/meetings/meetingsSlice';
import { UpcomingAlarmsScreen, groupAlarmsByFlight } from '../../src/features/v2/UpcomingAlarmsScreen';
import type { EffectiveAlarm } from '../../src/features/settings/alarmSetup';
import type { Trip } from '../../src/features/travel/tripCsv';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

function alarm(over: Partial<EffectiveAlarm> & { dutyId: string }): EffectiveAlarm {
  return {
    fltNumber: 'TG662',
    dep: 'BKK',
    arv: 'PVG',
    timeZone: 'Asia/Bangkok',
    departureUTC: '15 Sep 2026 2230',
    wakeUp: { hhmm: '20:30', local: { year: 2026, month: 9, day: 15, hour: 20, minute: 30 }, instant: 0, timeZone: 'Asia/Bangkok' } as never,
    leaveHome: { hhmm: '21:30', local: { year: 2026, month: 9, day: 15, hour: 21, minute: 30 }, instant: 0, timeZone: 'Asia/Bangkok' } as never,
    checkInLabel: '15 Sep 2230',
    wakeWord: 'Get Ready',
    wakeUpLabel: '',
    leaveHomeLabel: '',
    ...over,
  };
}

describe('groupAlarmsByFlight', () => {
  it('writes the flight once and lists its alarms underneath', () => {
    const groups = groupAlarmsByFlight([alarm({ dutyId: 'd1' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ fltNumber: 'TG662', dep: 'BKK', arv: 'PVG', when: '15 Sep 2230' });
    expect(groups[0].rows.map(r => `${r.label} ${r.hhmm}`)).toEqual([
      'Get Ready 20:30',
      'Leave Home 21:30',
      'Check-in 22:30',
    ]);
  });

  it('keeps two duties of the same flight on different dates apart', () => {
    const groups = groupAlarmsByFlight([
      alarm({ dutyId: 'd1' }),
      alarm({ dutyId: 'd2', checkInLabel: '16 Sep 2230' }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('merges repeat duties of the same flight and date into one group', () => {
    const groups = groupAlarmsByFlight([alarm({ dutyId: 'd1' }), alarm({ dutyId: 'd2' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(6);
  });

  it('drops rows the airline did not arm', () => {
    const groups = groupAlarmsByFlight([alarm({ dutyId: 'd1', leaveHome: null })]);
    expect(groups[0].rows.map(r => r.label)).toEqual(['Get Ready', 'Check-in']);
  });
});

describe('UpcomingAlarmsScreen', () => {
  const trip: Trip = {
    id: 'tg-pvg',
    crewId: '35459',
    checkInDateUTC: '15 Sep 2026 2230',
    legs: [{
      crewId: '35459',
      fltNumber: 'TG662',
      flightDateUTC: '15 Sep 2026 2330',
      depArp: 'BKK',
      arvDateUTC: '16 Sep 2026 0430',
      arvArp: 'PVG',
      fleet: '788',
      hotel: '',
      localDepTime: '2026-09-16 06:30',
      localArvTime: '2026-09-16 11:30',
      assignment: 'FLY',
    }],
  };

  it('renders one header per flight with the alarm lines under it', () => {
    const store = configureStore({
      reducer: {
        auth: authReducer,
        settings: settingsReducer,
        trips: tripsReducer,
        alarms: alarmsReducer,
        duties: dutiesReducer,
        meetings: meetingsReducer,
      },
      middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
    });
    store.dispatch(setTrips([trip]));

    const tree = render(
      <Provider store={store}>
        <UpcomingAlarmsScreen />
      </Provider>,
    );

    // The flight number is printed once (as the group header), not per alarm.
    expect(tree.getAllByText('TG662')).toHaveLength(1);
    expect(tree.getByTestId('alarm-group-TG662')).toBeTruthy();
    expect(tree.getByText('BKK → PVG')).toBeTruthy();
    expect(tree.getByText('Leave Home')).toBeTruthy();
  });
});
