// Full-screen destination viewer + the new operational detail on Trip Details.
//
// Ryan 2026-09-11: tap a Home destination picture → almost-full-screen city view
// with ETD/ETA, ATD/ATA, gate, tail and (mocked when the roster has none) hotel
// info; swipe left/right between cities; same extra detail in Trip Details.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { Dimensions } from 'react-native';

import settingsReducer from '../../src/features/settings/settingsSlice';
import tripsReducer, { setTrips } from '../../src/features/travel/tripsSlice';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import dutiesReducer from '../../src/features/roster/dutiesSlice';
import { DestinationScreen } from '../../src/features/v2/DestinationScreen';
import { blockLabel, hotelFor, legOps, mockGate } from '../../src/features/travel/opsInfo';
import { PALETTES } from '../../src/theme/carrier';
import type { Trip } from '../../src/features/travel/tripCsv';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useFocusEffect: jest.fn(),
}));

/** ADD → DMM, ending away from base: a layover, so a hotel block is expected. */
const layoverTrip: Trip = {
  id: 'pair-dmm',
  crewId: 'J4002',
  checkInDateUTC: '13 Sep 2026 1955',
  layoverHours: 26,
  legs: [{
    crewId: 'J4002',
    fltNumber: 'ET422',
    flightDateUTC: '13 Sep 2026 2155',
    depArp: 'ADD',
    arvDateUTC: '14 Sep 2026 0155',
    arvArp: 'DMM',
    fleet: '7M8',
    hotel: '',
    localDepTime: '2026-09-13 21:55',
    localArvTime: '2026-09-14 01:55',
    assignment: 'FLY',
    register: 'ET-AVK',
    blockMinutes: 240,
    estDepUtc: '2026-09-13T22:05:00.000Z',
    estArvUtc: '2026-09-14T02:05:00.000Z',
    actDepUtc: '2026-09-13T22:12:00.000Z',
    actArvUtc: '2026-09-14T02:11:00.000Z',
  }],
};

/** ADD → BJM → ADD in one day: no hotel, and the return leg starts at the layover. */
const turnTrip: Trip = {
  id: 'pair-bjm',
  crewId: 'J4002',
  checkInDateUTC: '11 Sep 2026 1015',
  layoverHours: 0,
  legs: [
    {
      crewId: 'J4002', fltNumber: 'ET895', flightDateUTC: '11 Sep 2026 0715',
      depArp: 'ADD', arvDateUTC: '11 Sep 2026 1035', arvArp: 'BJM', fleet: '7M8', hotel: '',
      localDepTime: '2026-09-11 10:15', localArvTime: '2026-09-11 12:00', assignment: 'FLY',
    },
    {
      crewId: 'J4002', fltNumber: 'ET894', flightDateUTC: '11 Sep 2026 1435',
      depArp: 'BJM', arvDateUTC: '11 Sep 2026 1800', arvArp: 'ADD', fleet: '7M8', hotel: '',
      localDepTime: '2026-09-11 14:35', localArvTime: '2026-09-11 18:00', assignment: 'FLY',
    },
  ],
};

function makeStore(trips: Trip[]) {
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
  store.dispatch(setTrips(trips));
  return store;
}

const NOW = new Date('2026-09-12T09:00:00Z');

/** Every string in the rendered tree, in render order (row-order assertions). */
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

/** A second away-from-base rotation, so the viewer really has two pages. */
const darTrip: Trip = {
  id: 'pair-dar',
  crewId: 'J4002',
  checkInDateUTC: '15 Sep 2026 0530',
  legs: [{
    crewId: 'J4002',
    fltNumber: 'ET805',
    flightDateUTC: '15 Sep 2026 0730',
    depArp: 'ADD',
    arvDateUTC: '15 Sep 2026 1030',
    arvArp: 'DAR',
    fleet: '7M8',
    hotel: '',
    localDepTime: '2026-09-15 07:30',
    localArvTime: '2026-09-15 10:30',
    assignment: 'FLY',
  }],
};

describe('destination viewer · operational info', () => {
  it('mocks a stable terminal + gate per flight and airport', () => {
    const a = mockGate('ADD', 'ET422');
    expect(a).toEqual(mockGate('ADD', 'ET422'));
    expect(a.terminal).toMatch(/^T[123]$/);
    expect(a.gate).toMatch(/^[A-E]\d{1,2}$/);
    expect(mockGate('DMM', 'ET422')).not.toEqual(a);
  });

  it('reports ETA/ETD from the live estimate and ATD/ATA only once flown', () => {
    // Before departure: the estimate is shown, the actual is not.
    const before = legOps(layoverTrip.legs[0], layoverTrip, 'airport', 'Africa/Addis_Ababa', { now: NOW });
    // 22:05Z shown on the airport clock (ADD = UTC+3) with the usual "L" marker.
    expect(before.etd).toBe('01:05L');
    expect(before.estimated).toBe(true);
    expect(before.atd).toBe('');
    expect(before.register).toBe('ET-AVK');
    expect(before.block).toBe('4h 00m');
    expect(before.dep.terminal).toMatch(/^T[123]$/);

    // After the leg has operated, the actuals appear.
    const after = legOps(layoverTrip.legs[0], layoverTrip, 'airport', 'Africa/Addis_Ababa', { now: new Date('2026-09-20T00:00:00Z') });
    expect(after.atd).not.toBe('');
    expect(after.ata).not.toBe('');
  });

  it('mocks a layover hotel only when the crew actually stays away', () => {
    const hotel = hotelFor(layoverTrip, 'ADD');
    expect(hotel).not.toBeNull();
    expect(hotel!.mocked).toBe(true);
    expect(hotel!.name).toContain('Dammam');
    // Same-day turn (ADD → BJM → ADD, both on the 11th): no hotel.
    expect(hotelFor(turnTrip, 'ADD')).toBeNull();
  });

  it('finds the overnight of a round trip that ends back at base', () => {
    // ADD → DMM on the 13th, DMM → ADD on the 14th: the crew sleeps in DMM even
    // though the rotation never ends away from base.
    const hotel = hotelFor(turnTrip, 'ADD');
    expect(hotel).toBeNull();
    const overnight: Trip = {
      ...turnTrip,
      legs: [
        { ...turnTrip.legs[0], arvArp: 'DMM', arvDateUTC: '13 Sep 2026 2255', localArvTime: '2026-09-14 01:55' },
        { ...turnTrip.legs[1], depArp: 'DMM', flightDateUTC: '14 Sep 2026 2355', localDepTime: '2026-09-15 02:55' },
      ],
    };
    const found = hotelFor(overnight, 'ADD');
    expect(found).not.toBeNull();
    expect(found!.airport).toBe('DMM');
    expect(found!.nights).toBe(1);
  });

  it('prefers the roster booking when one exists', () => {
    const booked: Trip = {
      ...layoverTrip,
      legs: [{ ...layoverTrip.legs[0], hotelBooking: { hotelName: 'Crew Inn', location: 'Airport Road', nights: 2, airport: 'DMM' } }],
    };
    const hotel = hotelFor(booked, 'ADD');
    expect(hotel).toMatchObject({ name: 'Crew Inn', address: 'Airport Road', nights: 2, mocked: false });
  });

  it('formats block minutes', () => {
    expect(blockLabel(165)).toBe('2h 45m');
    expect(blockLabel(45)).toBe('45m');
    expect(blockLabel(undefined)).toBe('');
  });
});

describe('destination viewer · screen', () => {
  const renderScreen = (index = 0) => {
    const store = makeStore([layoverTrip, darTrip]);
    return {
      store,
      tree: render(
        <Provider store={store}>
          <DestinationScreen
            route={{ key: 'k', name: 'Destination', params: { index } } as never}
            navigation={{} as never}
          />
        </Provider>,
      ),
    };
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    mockNavigate.mockClear();
    mockGoBack.mockClear();
  });

  afterEach(() => jest.useRealTimers());

  it('blends the Duo photo into its pane and keeps the black scrim only on compact phones', () => {
    const original = Dimensions.get('window');
    const store = makeStore([turnTrip, layoverTrip, darTrip]);
    const tree = render(<Provider store={store}><DestinationScreen route={{ params: { index: 0 } } as never} navigation={{} as never} /></Provider>);
    try {
      for (const [width, height, photoWidth, photoHeight] of [
        [1210, 834, Math.round(1210 * 0.55), 834],
        [669, 951, 669, Math.round(951 * 0.5)],
        [420, 912, 420, 912],
      ]) {
        act(() => Dimensions.set({ window: { ...original, width, height } }));
        const duo = width >= 560;
        const paint = tree.getByTestId(duo ? 'dest-photo-blend-paint' : 'dest-scrim-paint');
        expect(paint.props.width).toBe(photoWidth);
        expect(paint.props.height).toBe(photoHeight);
        expect(tree.queryByTestId(duo ? 'dest-scrim-paint' : 'dest-photo-blend-paint')).toBeNull();
      }
    } finally {
      tree.unmount();
      act(() => Dimensions.set({ window: original }));
    }
  });

  it('opens the tapped city almost full screen with its detail rows', () => {
    const { tree } = renderScreen(0);
    expect(tree.getByTestId('page-destination')).toBeTruthy();
    expect(tree.getByTestId('dest-city')).toBeTruthy();
    expect(tree.getByTestId('dest-position')).toBeTruthy();
    // Flight details stay visible while unavailable hotel/transfer data stays hidden.
    const texts = textsInOrder(tree.toJSON()).join(' | ');
    expect(texts).toContain('STD ');
    expect(texts).toContain('ETD');
    expect(texts).toContain('Gate ');
    expect(texts).not.toContain('Sheraton Dammam');
    expect(texts).not.toContain('crew van');
    expect(texts).toContain('expected');
  });

  it('pages to the next city on a horizontal swipe', async () => {
    const { tree } = renderScreen(0);
    expect(tree.getByTestId('dest-position').props.children).toBe('1 / 2');
    const pager = tree.getByTestId('dest-pager');
    await act(async () => {
      pager.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: Dimensions.get('window').width } } });
    });
    expect(tree.getByTestId('dest-position').props.children).toBe('2 / 2');
  });

  it('orders the flight rows schedule → estimate → actual', () => {
    const { tree } = renderScreen(0);
    const texts = textsInOrder(tree.toJSON());
    const at = (needle: string) => texts.findIndex(t => t.startsWith(needle));
    expect(at('STD ')).toBeGreaterThanOrEqual(0);
    expect(at('STD ')).toBeLessThan(at('ETD'));
    expect(texts.join(' | ')).not.toMatch(/Toyota|Ford|Mercedes/);
  });

  it('shows booked hotel data, but omits missing estimates and hotel placeholders', () => {
    const booked: Trip = {
      ...layoverTrip,
      legs: [{ ...layoverTrip.legs[0], estDepUtc: undefined, estArvUtc: undefined,
        hotelBooking: { hotelName: 'Crew Inn', location: 'Airport Road', nights: 2, airport: 'DMM' } }],
    };
    const store = makeStore([booked, turnTrip]);
    const tree = render(<Provider store={store}><DestinationScreen route={{ params: { index: 0 } } as never} navigation={{} as never} /></Provider>);
    const texts = textsInOrder(tree.toJSON()).join(' | ');
    expect(texts).toContain('Crew Inn');
    expect(texts).not.toContain('ETD');
    expect(texts).not.toContain('no update yet');
    expect(texts).not.toContain('crew van');
    expect(tree.getByTestId('dest-page-indicator')).toBeTruthy();
    expect(tree.getByTestId('dest-trip-details').props.accessibilityLabel).toBe('Trip details');
  });

  it('leaves out the hotel row on a same-day return', () => {
    jest.setSystemTime(new Date('2026-09-10T09:00:00Z'));
    const store = makeStore([turnTrip]);
    const tree = render(<Provider store={store}><DestinationScreen route={{ params: { index: 0 } } as never} navigation={{} as never} /></Provider>);
    const texts = textsInOrder(tree.toJSON()).join(' | ');
    expect(texts).toContain('STD ');
    expect(texts).not.toContain('Day return — no hotel');
    expect(texts).not.toContain('Sheraton Dammam');
  });

  it('hands off to the full trip details page', () => {
    const { tree } = renderScreen(0);
    fireEvent.press(tree.getByTestId('dest-trip-details'));
    expect(mockNavigate).toHaveBeenCalledWith('TripDetails', { tripId: 'pair-dmm' });
  });

  it('uses the wide side pane for real crew markers and onward legs only', () => {
    jest.setSystemTime(new Date('2026-09-10T09:00:00Z'));
    const original = Dimensions.get('window');
    act(() => Dimensions.set({ window: { ...original, width: 1210, height: 834 } }));
    try {
      const store = makeStore([turnTrip]);
      const tree = render(<Provider store={store}><DestinationScreen route={{ params: { index: 0 } } as never} navigation={{} as never} /></Provider>);
      expect(tree.getByTestId('dest-trip-extra')).toBeTruthy();
      const extra = textsInOrder(tree.toJSON()).join(' | ');
      expect(extra).toContain('ADD → BJM → ADD');
      expect(extra).toContain('Crew report');
      expect(extra).toContain('ET894 · BJM → ADD');
      expect(extra).not.toContain('Sheraton');
      tree.unmount();
    } finally {
      act(() => Dimensions.set({ window: original }));
    }
    const compact = render(<Provider store={makeStore([turnTrip])}><DestinationScreen route={{ params: { index: 0 } } as never} navigation={{} as never} /></Provider>);
    expect(compact.queryByTestId('dest-trip-extra')).toBeNull();
  });

  it('is themed by the carrier palette it is given', () => {
    // The panel/CTA use the carrier palette rather than fixed chrome colours.
    expect(PALETTES.emerald.btn).toBe('#2a7461');
  });
});
