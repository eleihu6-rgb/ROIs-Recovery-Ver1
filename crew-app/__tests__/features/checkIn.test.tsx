// Home ▸ Quick actions ▸ Check-In: the crew portal's Check In page (PR TEST,
// crew 421983, PR684 MNL→DOH on 14 Oct 2026) without its Check In Record section.
import React from 'react';
import { render, fireEvent, act, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { CheckInScreen } from '../../src/features/checkIn/CheckInScreen';
import { CheckInMap } from '../../src/features/checkIn/CheckInMap';
import { PALETTES } from '../../src/theme/carrier';
import checkInReducer from '../../src/features/checkIn/checkInSlice';
import authReducer, { publishEphemeralSession } from '../../src/features/auth/authSlice';
import tripsReducer, { setTrips } from '../../src/features/travel/tripsSlice';
import {
  canCheckIn, checkInPhase, countdownFor, formatCountdown, nowClock, taskFromApi, taskFromTrips,
  zonedWallToMs, type ApiToCheckIn,
} from '../../src/features/checkIn/checkInModel';
import type { Trip } from '../../src/features/travel/tripCsv';

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const NativeMap = (props: object) => React.createElement(View, props);
  return { __esModule: true, default: NativeMap, Marker: NativeMap, Circle: NativeMap };
});

type Node = { children: Array<Node | string> };
const textOf = (n: Node): string => n.children.map(c => (typeof c === 'string' ? c : textOf(c))).join('');

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
  useFocusEffect: jest.fn(),
}));
let mockWide = false;
jest.mock('../../src/components/v2/useLayout', () => ({
  ...jest.requireActual('../../src/components/v2/useLayout'),
  useLayout: () => ({ width: mockWide ? 951 : 390, height: mockWide ? 669 : 844, wide: mockWide, tall: false, layout: mockWide ? 'wide' : 'compact' }),
}));
const mockFetch = jest.fn();
jest.mock('../../src/features/checkIn/checkInApi', () => ({
  fetchToCheckIn: (...a: unknown[]) => mockFetch(...a),
}));

/** GET /api/portal/checkIn/toCheckIn for PR 421983 (PR TEST, captured 2026-10-08; IP/fingerprint fields trimmed). */
const PR684: ApiToCheckIn = {
  dutyId: 990084,
  checkInStartTime: '2026-10-14 15:15:00',
  checkInEndTime: '2026-10-14 17:15:00',
  checkInLateTime: '2026-10-14 22:44:00',
  dutyDepZoneId: 'Asia/Manila',
  lateCheckIn: true,
  longitude: '121.01391',
  latitude: '14.52071',
  locationVoList: [{ locationId: 2033671331835904, radius: 180, longitude: '121.00606', latitude: '14.52659' }],
  detailVoList: [{ duty: 'FLY', fltNum: 'PR684', startTime: '14-Oct-2026 19:00', endTime: '14-Oct-2026 23:40', dep: 'MNL', arr: 'DOH' }],
};

/** Manila wall clock → epoch ms (UTC+8, no DST). */
const manila = (wall: string): number => Date.parse(`${wall.replace(' ', 'T')}+08:00`);

// Roster fallback fixture: the same rotation as the crew flies it, MNL→DOH→MNL.
const ROTATION: Trip = {
  id: 'PR684-2026-10-14',
  crewId: '421983',
  checkInDateUTC: '14 Oct 2026 0915',
  legs: [
    { crewId: '421983', fltNumber: 'PR684', flightDateUTC: '14 Oct 2026 1100', depArp: 'MNL', arvDateUTC: '14 Oct 2026 2040', arvArp: 'DOH', fleet: 'A350', hotel: '' },
    { crewId: '421983', fltNumber: 'PR685', flightDateUTC: '16 Oct 2026 0100', depArp: 'DOH', arvDateUTC: '16 Oct 2026 1015', arvArp: 'MNL', fleet: 'A350', hotel: '' },
  ],
};

describe('checkInModel', () => {
  const task = taskFromApi(PR684)!;

  it('reads the portal task: day, earliest / latest / scheduled (local), check-in point, duty row', () => {
    expect(zonedWallToMs('2026-10-14 15:15:00', 'Asia/Manila')).toBe(Date.parse('2026-10-14T07:15:00Z'));
    expect(task).toMatchObject({
      dutyId: '990084', source: 'portal', zone: 'Asia/Manila', dayLabel: 'Wed 14 Oct',
      earliest: '15:15L', scheduled: '17:15L', latest: '22:44L', dep: 'MNL',
      location: { lat: 14.52659, lon: 121.00606 },
      locationKind: 'checkin-point', locationRadiusM: 180,
    });
    expect(task.rows).toEqual([{ duty: 'FLY', fltNum: 'PR684', start: '19:00L', dep: 'MNL', arr: 'DOH', end: '23:40L' }]);
    expect(taskFromApi({ dutyId: null })).toBeNull();
  });

  it('derives the window from the roster: scheduled = report, earliest = −2:00, latest = STD', () => {
    const t = taskFromTrips([ROTATION], manila('2026-10-08 09:58:01'))!;
    expect(t).toMatchObject({ source: 'roster', zone: 'Asia/Manila', earliest: '15:15L', scheduled: '17:15L', latest: '19:00L', dep: 'MNL' });
    expect(t.rows.map(r => `${r.fltNum} ${r.dep}-${r.arr} ${r.start}→${r.end}`)).toEqual([
      'PR684 MNL-DOH 19:00L→23:40L',
      'PR685 DOH-MNL 04:00L +1→18:15L +1',
    ]);
    expect(t.location?.lat).toBeCloseTo(14.5, 0);
    // Once the first leg has departed, that rotation no longer offers a check-in.
    expect(taskFromTrips([ROTATION], manila('2026-10-14 19:01'))).toBeNull();
  });

  it('counts down to the earliest time before the window, to the latest inside it, and says when it closed', () => {
    const before = countdownFor(task, manila('2026-10-08 09:58:01'));
    expect(before).toEqual({ phase: 'before', value: '149:16:59', caption: 'to the earliest check in time' });
    expect(countdownFor(task, manila('2026-10-14 16:00'))).toEqual({ phase: 'open', value: '06:44:00', caption: 'to the latest check in time' });
    expect(countdownFor(task, manila('2026-10-14 18:00'))).toEqual({ phase: 'late', value: '04:44:00', caption: 'to the latest check in time · Late check in' });
    expect(countdownFor(task, manila('2026-10-14 22:45'))).toEqual({ phase: 'closed', value: '--:--:--', caption: 'Check-in window closed' });
    expect(formatCountdown(59)).toBe('00:00:59');
    expect(nowClock(manila('2026-10-08 09:58:01'), 'Asia/Manila')).toBe('09:58:01');
  });

  it('enables Check In only inside the window (edges included)', () => {
    const at = (w: string) => canCheckIn(checkInPhase(task, manila(w)));
    expect(at('2026-10-14 15:14:59')).toBe(false);
    expect(at('2026-10-14 15:15')).toBe(true);
    expect(at('2026-10-14 17:15')).toBe(true);
    expect(at('2026-10-14 22:44')).toBe(true);
    expect(at('2026-10-14 22:44:01')).toBe(false);
  });

  it('uses the portal geofence over top-level coordinates, then labels airport fallback honestly', () => {
    const fallback = taskFromApi({ ...PR684, locationVoList: [] })!;
    expect(fallback.locationKind).toBe('airport');
    expect(fallback.locationRadiusM).toBeNull();
    expect(fallback.location?.lat).toBeCloseTo(14.5, 0);
  });
});

describe('CheckInMap theme', () => {
  it('switches the native map shell, geofence, pin, and controls with the carrier palette', () => {
    const props = { pin: { lat: 14.52659, lon: 121.00606 }, radiusM: 180, locationKind: 'checkin-point' as const, airport: 'MNL' };
    const screen = render(<CheckInMap {...props} palette={PALETTES.sia} />);
    const styles = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
    expect(screen.getByTestId('checkin-native-map').props.userInterfaceStyle).toBe('dark');
    expect(screen.getByTestId('checkin-native-map').props.mapType).toBe('mutedStandard');
    expect(screen.getByTestId('checkin-zoom-in')).toBeTruthy();
    expect(screen.getByTestId('checkin-zoom-out')).toBeTruthy();
    expect(styles('checkin-map-tint').backgroundColor).toBe(PALETTES.sia.g1);
    expect(styles('checkin-pin-hub').borderColor).toBe(PALETTES.sia.dockLight);
    expect(screen.getByTestId('checkin-radius').props.fillColor).toBe(`${PALETTES.sia.btn}55`);

    screen.rerender(<CheckInMap {...props} palette={PALETTES.thai} />);
    expect(styles('checkin-map').backgroundColor).toBe(PALETTES.thai.g1);
    expect(styles('checkin-map-tint').backgroundColor).toBe(PALETTES.thai.g1);
    expect(styles('checkin-pin-hub').borderColor).toBe(PALETTES.thai.dockLight);
    expect(screen.getByTestId('checkin-radius').props.fillColor).toBe(`${PALETTES.thai.btn}55`);

    screen.rerender(<CheckInMap {...props} palette={PALETTES.light} />);
    expect(screen.getByTestId('checkin-native-map').props.userInterfaceStyle).toBe('light');
    expect(styles('checkin-map').backgroundColor).toBe(PALETTES.light.mapBg);
    expect(styles('checkin-map-tint').backgroundColor).toBe(PALETTES.light.mapBg);
    expect(styles('checkin-map-tint').opacity).toBeLessThan(0.3);
    expect(styles('checkin-pin-hub').backgroundColor).toBe(PALETTES.light.mapRoute);
    expect(screen.getByTestId('checkin-radius').props.strokeColor).toBe(PALETTES.light.mapRoute);
    expect(styles('checkin-map-badge').backgroundColor).toBe(PALETTES.light.mapPanel);
    expect(StyleSheet.flatten(screen.getByTestId('checkin-location-label').props.style).color).toBe(PALETTES.light.cardInk);
    expect(styles('checkin-zoom-in').backgroundColor).toBe(PALETTES.light.cardSolid);

    screen.rerender(<CheckInMap {...props} palette={PALETTES.sia} />);
    expect(screen.getByTestId('checkin-native-map').props.userInterfaceStyle).toBe('dark');
    expect(styles('checkin-map-tint').opacity).toBe(0.3);
  });
});

describe('CheckInScreen', () => {
  const makeStore = () => configureStore({
    reducer: { auth: authReducer, trips: tripsReducer, checkIn: checkInReducer },
    preloadedState: {
      auth: { ...authReducer(undefined, { type: '@@init' }), airline: 'PR', crewId: '421983', password: 'pw', mode: 'crew' as const },
    },
    middleware: g => g({ serializableCheck: false }),
  });
  const mount = async (store: ReturnType<typeof makeStore>) => {
    const screen = render(<Provider store={store}><CheckInScreen /></Provider>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    return screen;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockFetch.mockReset().mockResolvedValue(PR684);
  });
  afterEach(() => { jest.useRealTimers(); mockWide = false; });

  it('Duo wide: times and map align in a row, with duty spanning below', async () => {
    jest.setSystemTime(manila('2026-10-14 16:00'));
    mockWide = true;
    const screen = await mount(makeStore());
    const side = within(screen.getByTestId('checkin-side'));
    const times = within(screen.getByTestId('checkin-times'));
    expect(side.getByTestId('checkin-map')).toBeTruthy();
    expect(within(screen.getByTestId('checkin-top-row')).queryByTestId('checkin-duty-0')).toBeNull();
    expect(screen.getByTestId('checkin-duty-0')).toBeTruthy();
    expect(times.getByTestId('checkin-countdown')).toBeTruthy();
    expect(side.queryByTestId('checkin-countdown')).toBeNull();
  });

  it('compact: one column, no side column', async () => {
    jest.setSystemTime(manila('2026-10-14 16:00'));
    const screen = await mount(makeStore());
    expect(screen.queryByTestId('checkin-side')).toBeNull();
    expect(screen.getByTestId('checkin-map')).toBeTruthy();
  });

  it('shows PR684 with the portal location pin and radius; Check In is disabled before the window', async () => {
    jest.setSystemTime(manila('2026-10-08 09:58:01'));
    const screen = await mount(makeStore());
    const t = (id: string) => textOf(screen.getByTestId(id) as unknown as Node);
    expect(mockFetch).toHaveBeenCalledWith({ airline: 'PR', crewId: '421983', password: 'pw' });
    expect(t('checkin-day')).toBe('Wed 14 Oct');
    expect(t('checkin-earliest')).toBe('15:15L');
    expect(t('checkin-latest')).toBe('22:44L');
    expect(t('checkin-scheduled')).toBe('(Scheduled: 17:15L)');
    expect(t('checkin-now')).toBe('Now: 09:58:01');
    expect(t('checkin-countdown')).toBe('149:16:59');
    expect(t('checkin-countdown-caption')).toBe('to the earliest check in time');
    expect(textOf(screen.getByTestId('checkin-duty-0') as unknown as Node)).toBe('FLYPR68419:00LMNLDOH23:40L');
    expect(screen.getByTestId('checkin-map')).toBeTruthy();
    expect(screen.getByTestId('checkin-airport-pin').props.coordinate).toEqual({ latitude: 14.52659, longitude: 121.00606 });
    expect(screen.getByTestId('checkin-radius').props.radius).toBe(180);
    expect(t('checkin-location-label')).toBe('CHECK-IN POINT');
    expect(screen.queryByText(/DEMO LOCATION/)).toBeNull();
    expect(screen.queryByText(/Check In Record/i)).toBeNull();
    expect(screen.queryByText(/Search|Record/)).toBeNull();

    // Ticks every second.
    act(() => { jest.advanceTimersByTime(1000); });
    expect(t('checkin-countdown')).toBe('149:16:58');
    expect(t('checkin-now')).toBe('Now: 09:58:02');

    // Disabled: a tap does nothing.
    expect(screen.getByTestId('checkin-button').props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(screen.getByTestId('checkin-button'));
    expect(screen.queryByTestId('checkin-dialog')).toBeNull();
  });

  it('inside the window: Check In confirms with the success dialog and records the time locally', async () => {
    jest.setSystemTime(manila('2026-10-14 16:20'));
    const store = makeStore();
    const screen = await mount(store);
    expect(textOf(screen.getByTestId('checkin-countdown') as unknown as Node)).toBe('06:24:00');
    expect(textOf(screen.getByTestId('checkin-countdown-caption') as unknown as Node)).toBe('to the latest check in time');
    expect(screen.getByTestId('checkin-button').props.accessibilityState).toEqual({ disabled: false });

    fireEvent.press(screen.getByTestId('checkin-button'));
    expect(textOf(screen.getByTestId('checkin-dialog-title') as unknown as Node)).toBe('Checked in at 16:20');
    expect(store.getState().checkIn.records).toEqual({ 'PR:421983:990084': manila('2026-10-14 16:20') });

    fireEvent.press(screen.getByTestId('checkin-dialog-confirm'));
    expect(screen.queryByTestId('checkin-dialog')).toBeNull();
    // Recorded: the button now reads the check-in and stays disabled.
    expect(textOf(screen.getByTestId('checkin-button') as unknown as Node)).toBe('Checked in · 16:20L');
    expect(screen.getByTestId('checkin-button').props.accessibilityState).toEqual({ disabled: true });
  });

  it('falls back to the roster rule when the portal is unreachable', async () => {
    jest.setSystemTime(manila('2026-10-14 16:00'));
    mockFetch.mockRejectedValue(new Error('offline'));
    const store = makeStore();
    store.dispatch(setTrips([ROTATION]));
    const screen = await mount(store);
    expect(textOf(screen.getByTestId('checkin-latest') as unknown as Node)).toBe('19:00L');
    expect(textOf(screen.getByTestId('checkin-scheduled') as unknown as Node)).toBe('(Scheduled: 17:15L)');
    expect(textOf(screen.getByTestId('checkin-duty-1') as unknown as Node)).toContain('PR685');
    expect(textOf(screen.getByTestId('checkin-location-label') as unknown as Node)).toBe('AIRPORT AREA');
    expect(screen.queryByTestId('checkin-radius')).toBeNull();
  });

  it('clears PR check-in details immediately when the crew switches to TG', async () => {
    jest.setSystemTime(manila('2026-10-08 09:58:01'));
    const store = makeStore();
    const screen = await mount(store);
    expect(screen.getByText('PR684')).toBeTruthy();
    let finishTG!: (value: null) => void;
    mockFetch.mockImplementationOnce(() => new Promise<null>(resolve => { finishTG = resolve; }));
    act(() => {
      store.dispatch(publishEphemeralSession({ airline: 'TG', crewId: '35459', password: 'pw', keepLogin: false }));
    });
    expect(screen.getByTestId('checkin-loading')).toBeTruthy();
    expect(screen.queryByText('PR684')).toBeNull();
    await act(async () => { finishTG(null); await Promise.resolve(); });
    expect(screen.getByTestId('checkin-empty')).toBeTruthy();
  });
});
