// Trip Details · airport-ops grid (DEMO data, src/features/v2/flightOpsDemo.ts).
import React from 'react';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import settingsReducer from '../../src/features/settings/settingsSlice';
import tripsReducer, { setTrips } from '../../src/features/travel/tripsSlice';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import dutiesReducer from '../../src/features/roster/dutiesSlice';
import flightCalendarReducer from '../../src/features/calendar/flightCalendarSlice';
import { TripDetailsScreen } from '../../src/features/v2/TripDetailsScreen';
import { flightOpsDemo, shiftClock, isWidebody, isDomestic, type FlightOpsInput } from '../../src/features/v2/flightOpsDemo';
import type { Trip } from '../../src/features/travel/tripCsv';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

const base: FlightOpsInput = {
  fltNumber: 'PR102',
  dep: 'MNL',
  arv: 'LAX',
  fleet: 'A321',
  stdUtc: '08 Oct 2026 1200',
  stdClock: '20:00L',
};
const cell = (g: ReturnType<typeof flightOpsDemo>, key: string) =>
  g.flat().find(c => c.key === key)!.value;

describe('flightOpsDemo · pure derivation', () => {
  it('shifts the displayed clock and marks midnight crossings with the app day offset', () => {
    expect(shiftClock('20:00L', -30)).toBe('19:30L');
    expect(shiftClock('00:10L', -30)).toBe('23:40L -1');
    expect(shiftClock('23:58L', 5)).toBe('00:03L +1');
    expect(shiftClock('01:00Z', -180)).toBe('22:00Z -1');
    expect(shiftClock('—', 5)).toBe('—');
  });

  it('boarding STD−30, door close STD−10, international check-in STD−3h, ETD falls back to STD', () => {
    const g = flightOpsDemo(base);
    expect(cell(g, 'std')).toBe('20:00L');
    expect(cell(g, 'etd')).toBe('20:00L');
    expect(cell(g, 'boarding')).toBe('19:30L');
    expect(cell(g, 'door')).toBe('19:50L');
    expect(cell(g, 'checkin')).toBe('17:00L');
    expect(['19:55L', '19:56L', '19:57L']).toContain(cell(g, 'tcd'));
    expect(['19:55L', '19:56L', '19:57L', '19:58L']).toContain(cell(g, 'tsat'));
    expect(['20:00L', '20:01L', '20:02L', '20:03L', '20:04L', '20:05L']).toContain(cell(g, 'offblock'));
  });

  it('widebody boards at STD−40, domestic check-in opens STD−2h', () => {
    expect(isWidebody('B787')).toBe(true);
    expect(isWidebody('A350')).toBe(true);
    expect(isWidebody('A321')).toBe(false);
    expect(isWidebody('7M8')).toBe(false);
    expect(cell(flightOpsDemo({ ...base, fleet: 'B777' }), 'boarding')).toBe('19:20L');
    expect(isDomestic('MNL', 'CEB')).toBe(true);
    expect(cell(flightOpsDemo({ ...base, arv: 'CEB' }), 'checkin')).toBe('18:00L');
  });

  it('a midnight departure carries the previous-day offset on the derived times', () => {
    const g = flightOpsDemo({ ...base, stdClock: '00:15L' });
    expect(cell(g, 'boarding')).toBe('23:45L -1');
    expect(cell(g, 'door')).toBe('00:05L');
    expect(cell(g, 'checkin')).toBe('21:15L -1');
  });

  it('uses a real estimate for ETD and moves the ops times with it', () => {
    const g = flightOpsDemo({ ...base, etdUtc: '2026-10-08T12:25:00.000Z' });
    expect(cell(g, 'std')).toBe('20:00L');
    expect(cell(g, 'etd')).toBe('20:25L');
    expect(cell(g, 'boarding')).toBe('19:55L');
    expect(cell(g, 'door')).toBe('20:15L');
    expect(cell(g, 'checkin')).toBe('17:00L'); // counters run on the filed schedule
  });

  it('is deterministic per flight + date, and plausible for MNL', () => {
    expect(flightOpsDemo(base)).toEqual(flightOpsDemo({ ...base }));
    const g = flightOpsDemo(base);
    expect(['T1', 'T3']).toContain(cell(g, 'terminal'));
    expect(cell(g, 'gate')).toMatch(/^1\d{2}$/);
    expect(cell(g, 'stand')).toMatch(/^\d{3}$/);
    expect(cell(g, 'belt')).toMatch(/^\d{2}$/); // LAX: default plain belt numbers
    expect(cell(flightOpsDemo({ ...base, dep: 'CEB', arv: 'MNL' }), 'belt')).toMatch(/^M\d{2}$/);
    // Another date → another seed (at least one ops value differs over a few days).
    const others = ['09', '10', '11', '12'].map(d => flightOpsDemo({ ...base, stdUtc: `${d} Oct 2026 1200` }));
    expect(others.some(o => JSON.stringify(o.slice(2)) !== JSON.stringify(g.slice(2)))).toBe(true);
  });
});

const trip: Trip = {
  id: 'pr-trip',
  crewId: '433535',
  checkInDateUTC: '08 Oct 2026 1030',
  legs: [{
    crewId: '433535',
    fltNumber: 'PR102',
    flightDateUTC: '08 Oct 2026 1200',
    depArp: 'MNL',
    arvDateUTC: '08 Oct 2026 2330',
    arvArp: 'LAX',
    fleet: 'A321',
    hotel: '',
    localDepTime: '2026-10-08 20:00',
    localArvTime: '2026-10-08 16:30',
    assignment: 'FLY',
  }],
};

function renderTrip(t: Trip) {
  const store = configureStore({
    reducer: {
      auth: (state = { airline: 'PR', base: 'MNL', crewId: '433535' }) => state,
      settings: settingsReducer,
      trips: tripsReducer,
      alarms: alarmsReducer,
      duties: dutiesReducer,
      flightCalendar: flightCalendarReducer,
    },
    middleware: g => g({ serializableCheck: false }),
  });
  store.dispatch(setTrips([t]));
  return render(
    <Provider store={store}>
      <TripDetailsScreen route={{ key: 'k', name: 'TripDetails', params: { tripId: t.id } } as never} navigation={{} as never} />
    </Provider>,
  );
}

describe('Trip Details · airport-ops grid', () => {
  it('shows the departure / arrival / airport cells with their values on the leg card', () => {
    const screen = renderTrip(trip);
    const val = (id: string) => String(screen.getByTestId(id).props.children);
    expect(screen.getByTestId('flight-ops-grid-0')).toBeTruthy();
    const labels = ['STD', 'ETD', 'BOARDING', 'DOOR CLOSE', 'OFF-BLOCK', 'STA', 'ETA', 'BLOCK', 'TERMINAL', 'GATE', 'STAND', 'BELT'];
    for (const l of labels) expect(screen.getAllByText(l).length).toBeGreaterThan(0);
    // The passenger check-in time is not shown: it read as a second check-in.
    expect(screen.queryByText('CHECK-IN')).toBeNull();
    expect(val('ops-std-0')).toBe('20:00L');
    expect(val('ops-etd-0')).toBe('20:00L');
    expect(val('ops-boarding-0')).toBe('19:30L');
    expect(val('ops-door-0')).toBe('19:50L');
    expect(val('ops-terminal-0')).toMatch(/^T[13]$/);
    expect(val('ops-gate-0')).toMatch(/^1\d{2}$/);
    expect(val('ops-stand-0')).toMatch(/^\d{3}$/);
    expect(val('ops-belt-0')).toMatch(/^\d{2}$/);
  });
});
