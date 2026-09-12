// Trip Details · operational rows, in the order the events actually happen.
// Ryan 2026-09-11: "recheck the seq of these info … std first, then etd, then atd.
// first wake up, then leave home, to check in."
import React from 'react';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import settingsReducer from '../../src/features/settings/settingsSlice';
import tripsReducer, { setTrips } from '../../src/features/travel/tripsSlice';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import dutiesReducer from '../../src/features/roster/dutiesSlice';
import { TripDetailsScreen } from '../../src/features/v2/TripDetailsScreen';
import type { Trip } from '../../src/features/travel/tripCsv';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: mockGoBack }),
  useFocusEffect: jest.fn(),
}));

/** Flown 8-9 Sep 2026 (actuals already in the past), overnight in DMM. */
const flownLayover: Trip = {
  id: 'pair-flown',
  crewId: 'J4002',
  checkInDateUTC: '08 Sep 2026 1955',
  layoverHours: 26,
  legs: [{
    crewId: 'J4002',
    fltNumber: 'ET422',
    flightDateUTC: '08 Sep 2026 2155',
    depArp: 'ADD',
    arvDateUTC: '09 Sep 2026 0155',
    arvArp: 'DMM',
    fleet: '7M8',
    hotel: '',
    localDepTime: '2026-09-08 21:55',
    localArvTime: '2026-09-09 01:55',
    assignment: 'FLY',
    register: 'ET-AVK',
    blockMinutes: 240,
    estDepUtc: '2026-09-08T22:05:00.000Z',
    estArvUtc: '2026-09-09T02:05:00.000Z',
    actDepUtc: '2026-09-08T22:12:00.000Z',
    actArvUtc: '2026-09-09T02:11:00.000Z',
  }],
};

/** Every string in the rendered tree, in render order. */
function textsInOrder(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach(n => textsInOrder(n, out));
    return out;
  }
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (!node || typeof node !== 'object') {
    return out;
  }
  const children = (node as { children?: unknown }).children;
  if (Array.isArray(children)) {
    children.forEach(c => textsInOrder(c, out));
  } else if (typeof children === 'string') {
    out.push(children);
  }
  return out;
}

function renderTrip(trip: Trip) {
  const store = configureStore({
    reducer: {
      auth: (state = { airline: 'ET', base: 'ADD', crewId: 'J4002' }) => state,
      settings: settingsReducer,
      trips: tripsReducer,
      alarms: alarmsReducer,
      duties: dutiesReducer,
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

describe('Trip Details · operational row order', () => {
  it('lists wake up → leave home → check-in, then STD → ETD → ATD', () => {
    const tree = renderTrip(flownLayover);
    const texts = textsInOrder(tree.toJSON());
    const at = (label: string) => texts.indexOf(label);

    // Duty markers first, in the order the crew lives them.
    expect(at('Get Ready')).toBeGreaterThanOrEqual(0);
    expect(at('Get Ready')).toBeLessThan(at('Leave home'));
    expect(at('Leave home')).toBeLessThan(at('Check-in / report'));

    // Then the flight: schedule, then estimate, then actual.
    expect(at('STD')).toBeGreaterThan(at('Check-in / report'));
    expect(at('STD')).toBeLessThan(at('ETD / ETA'));
    expect(at('ETD / ETA')).toBeLessThan(at('ATD / ATA'));
  });

  it('carries the live operational detail and the mocked transfer/hotel blocks', () => {
    const tree = renderTrip(flownLayover);
    const texts = textsInOrder(tree.toJSON()).join(' | ');

    expect(texts).toContain('ET-AVK');           // real tail from the flight row
    expect(texts).toContain('7M8 · ET-AVK');
    expect(texts).toContain('4h 00m');           // real block time
    expect(texts).toContain('Dammam');           // mocked hotel for the layover
    expect(texts).toContain('expected');
    // Mocked transfer block: times plus vehicle, plate, driver and contact.
    expect(texts).toMatch(/Toyota|Ford|Mercedes/);
    expect(texts).toMatch(/[A-Z]{2} \d{3}-\d{4}/);
    expect(texts).toMatch(/\+966 \d{2} \d{3} \d{4}/);
  });
});
