// R'Bot -> the Absence form: the dates and note the assistant extracted must be
// on screen, and the request must still be the crew's own Submit.
//
// Lives beside the Story-101 absence screen it drives: this file is committed
// with that screen, not with the R'Bot feature.
import React from 'react';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { AbsenceScreen } from '../../src/features/v2/AbsenceScreen';
import settingsReducer from '../../src/features/settings/settingsSlice';
import tripsReducer from '../../src/features/travel/tripsSlice';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import dutiesReducer from '../../src/features/roster/dutiesSlice';
import meetingsReducer from '../../src/features/meetings/meetingsSlice';
import notificationsReducer from '../../src/features/notifications/notificationsSlice';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: jest.fn(), goBack: jest.fn()}),
  useFocusEffect: jest.fn(),
}));

function makeStore() {
  return configureStore({
    reducer: {
      auth: (state = {airline: 'TG', base: 'BKK', crewId: '35459', password: 'pw'}) => state,
      settings: settingsReducer,
      trips: tripsReducer,
      alarms: alarmsReducer,
      duties: dutiesReducer,
      meetings: meetingsReducer,
      notifications: notificationsReducer,
    },
    middleware: getDefaultMiddleware => getDefaultMiddleware({serializableCheck: false}),
  });
}

describe("R'Bot -> pre-filled absence request", () => {
  beforeAll(() => {
    // Local construction: the screen reads local calendar dates.
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 12, 9, 0, 0));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it("starts the form on the dates R'Bot extracted", () => {
    const {getByTestId} = render(
      <Provider store={makeStore()}>
        <AbsenceScreen
          navigation={{goBack: jest.fn()} as never}
          route={{
            key: 'Spec-1',
            name: 'Spec',
            params: {
              id: 'absence',
              absenceFrom: '2026-09-14',
              absenceTo: '2026-09-16',
              absenceNote: 'food poisoning',
            },
          } as never}
        />
      </Provider>,
    );
    expect(getByTestId('absence-from').props.children).toBe('14 Sep 2026');
    expect(getByTestId('absence-to').props.children).toBe('16 Sep 2026');
    expect(getByTestId('absence-note').props.value).toBe('food poisoning');
    // Nothing is submitted for the crew: the button is still the manual submit.
    expect(getByTestId('absence-submit')).toBeTruthy();
  });

  it('falls back to today when the pre-fill is malformed', () => {
    const {getByTestId} = render(
      <Provider store={makeStore()}>
        <AbsenceScreen
          navigation={{goBack: jest.fn()} as never}
          route={{
            key: 'Spec-2',
            name: 'Spec',
            params: {id: 'absence', absenceFrom: 'not-a-date', absenceTo: '2026-02-30'},
          } as never}
        />
      </Provider>,
    );
    // 2026-02-30 is not a real date, so both fields fall back to today.
    expect(getByTestId('absence-from').props.children).toBe('12 Sep 2026');
    expect(getByTestId('absence-to').props.children).toBe('12 Sep 2026');
  });
});
