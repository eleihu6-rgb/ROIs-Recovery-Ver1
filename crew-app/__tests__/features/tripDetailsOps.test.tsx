// Trip Details · the duty timeline, in the order the events actually happen.
// Ryan 2026-09-11: "recheck the seq of these info … std first, then etd, then atd.
// first wake up, then leave home, to check in."
// Redesigned 2026-10-19 (trip timeline): the duty band carries the report and
// markers, each sector pass carries STD/STA then the ops matrix.
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

/** Real TG HND rotation (report/calendar fixtures): TG660 out, hotel, TG661 back. */
const hndRotation: Trip = {
  id: 'pair-hnd',
  crewId: '35459',
  checkInDateUTC: '12 May 2026 0415',
  legs: [
    {
      crewId: '35459', fltNumber: 'TG660', flightDateUTC: '12 May 2026 0610',
      depArp: 'BKK', arvDateUTC: '12 May 2026 1200', arvArp: 'HND', fleet: 'B777',
      hotel: '', assignment: 'FLY', dutyReportUTC: '12 May 2026 0415',
      dutyFdpMinutes: 495, dutyDpMinutes: 495, dutyBlockMinutes: 350,
    },
    {
      crewId: '35459', fltNumber: 'TG661', flightDateUTC: '13 May 2026 1501',
      depArp: 'HND', arvDateUTC: '13 May 2026 2134', arvArp: 'BKK', fleet: 'B777',
      hotel: 'Hilton Tokyo', assignment: 'FLY', dutyReportUTC: '13 May 2026 1420',
      dutyFdpMinutes: 464, dutyDpMinutes: 464, dutyBlockMinutes: 393, dutyRestHours: 26.33,
    },
  ],
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

describe('Trip Details · operational timeline', () => {
  it('groups the pass ops matrix into departure-first, then progress, then block', () => {
    const tree = renderTrip(flownLayover);
    const labels = (row: number) => textsInOrder(tree.getByTestId(`flight-ops-row-0-${row}`))
      .filter(text => ['ETD', 'ATD', 'ETA', 'ATA', 'BOARDING', 'DOOR CLOSE', 'OFF-BLOCK', 'BLK'].includes(text));

    // Times first (departure, then arrival), then the ground sequence + block.
    expect(labels(0)).toEqual(['ETD', 'ETA', 'ATD', 'ATA']);
    expect(labels(1)).toEqual(['BOARDING', 'DOOR CLOSE', 'OFF-BLOCK', 'BLK']);
  });

  it('keeps each ops cell header with its own value after the ATD/ETA swap', () => {
    const tree = renderTrip(flownLayover);
    const cell = (key: string) => textsInOrder(tree.getByTestId(`ops-cell-${key}-0`));
    const localEq = (utc: string) => new Date(utc).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Addis_Ababa',
    }) + 'L';
    // Order: ETD | ETA | ATD | ATA — each header sits on its own value.
    expect(cell('eta')).toEqual(['ETA', localEq('2026-09-09T02:05:00.000Z')]);
    expect(cell('atd')).toEqual(['ATD', localEq('2026-09-08T22:12:00.000Z')]);
  });

  it('runs duty markers, then STD/STA, then the sector matrix, each value once', () => {
    const tree = renderTrip(flownLayover);
    const texts = textsInOrder(tree.toJSON());
    const at = (label: string) => texts.indexOf(label);

    // Duty level: wake-up, leave home, report — before the first sector.
    expect(at('GET READY')).toBeGreaterThanOrEqual(0);
    expect(at('LEAVE')).toBeGreaterThan(at('GET READY'));
    expect(at('REPORT')).toBeGreaterThan(at('LEAVE'));
    expect(at('ET422')).toBeGreaterThan(at('REPORT'));
    // Route block: STD then STA; the matrix then starts with ETD.
    expect(at('STD')).toBeGreaterThan(at('ET422'));
    expect(at('STA')).toBeGreaterThan(at('STD'));
    expect(at('ETD')).toBeGreaterThan(at('STA'));
    expect(at('ETA')).toBeGreaterThan(at('ETD'));
    expect(at('ATD')).toBeGreaterThan(at('ETA'));
    expect(at('ATA')).toBeGreaterThan(at('ETA'));
    expect(at('BOARDING')).toBeGreaterThan(at('ATA'));
    expect(at('DOOR CLOSE')).toBeGreaterThan(at('BOARDING'));
    expect(at('OFF-BLOCK')).toBeGreaterThan(at('DOOR CLOSE'));
    expect(at('BLK')).toBeGreaterThan(at('OFF-BLOCK'));
    // Where: departure terminal/gate, then the arrival belt.
    expect(at('Terminal ')).toBeGreaterThan(at('BLK'));
    expect(at('Belt ')).toBeGreaterThan(at('Terminal '));

    // No value reads twice; obsolete row labels are gone.
    for (const label of ['GET READY', 'LEAVE', 'REPORT', 'STD', 'STA', 'ETD', 'ATD', 'ETA', 'ATA', 'BOARDING', 'DOOR CLOSE', 'OFF-BLOCK', 'BLK']) {
      expect(texts.filter(t => t === label).length).toBe(1);
    }
    for (const old of ['Leave home', 'Check-in / report', 'STD / STA', 'ETD / ETA', 'ATD / ATA', 'Gate', 'Arrival gate', 'Aircraft', 'CHECK-IN', 'TCD', 'TSAT']) {
      expect(texts).not.toContain(old);
    }
  });

  it('carries the live operational detail and the mocked hotel/transfer on the rail', () => {
    const tree = renderTrip(flownLayover);
    const texts = textsInOrder(tree.toJSON()).join(' | ');

    expect(texts).toContain('ET-AVK');           // real tail from the flight row
    expect(texts).toContain('7M8 · ET-AVK');
    expect(texts).toContain('4h 00m');           // real block time
    expect(texts).toContain('Dammam');           // mocked hotel for the layover
    expect(texts).toContain('expected');
    // The layover sits on the timeline rail, after the duty.
    expect(tree.getByTestId('rest-stop-after-duty')).toBeTruthy();
    // Mocked transfer block: times plus vehicle, plate, driver and contact.
    expect(texts).toMatch(/Toyota|Ford|Mercedes/);
    expect(texts).toMatch(/[A-Z]{2} \d{3}-\d{4}/);
    expect(texts).toMatch(/\+966 \d{2} \d{3} \d{4}/);
  });

  it('marks duty level vs sectors on the rail and shows the published duty totals', () => {
    const tree = renderTrip(hndRotation);

    // Rail hierarchy: square duty nodes, round sector nodes inside each duty.
    expect(tree.getByTestId('duty-node-0')).toBeTruthy();
    expect(tree.getByTestId('duty-node-1')).toBeTruthy();
    expect(tree.getByTestId('segment-node-0-0')).toBeTruthy();
    expect(tree.getByTestId('segment-node-1-0')).toBeTruthy();
    expect(tree.getByTestId('rest-stop-1')).toBeTruthy();
    // The off-duty spine is an SVG dash, not `borderStyle: 'dashed'` (RN warns
    // "Unsupported dashed / dotted border style" for single-side dashed borders).
    expect(tree.getByTestId('rest-rail-dashed')).toBeTruthy();

    const texts = textsInOrder(tree.toJSON());
    // Published FDP / DP / Block and the rest between the two duties.
    expect(texts.filter(t => t === 'FDP').length).toBe(2);
    expect(texts.filter(t => t === 'DP').length).toBe(2);
    expect(texts).toContain('8h 15m');
    expect(texts).toContain('5h 50m');
    expect(texts).toContain('7h 44m');
    expect(texts).toContain('6h 33m');
    expect(texts).toContain('26h 20m');
  });
});
