// Floating limit summary on the Schedule tab — responsive geometry, the three
// visible figures, the all-limits sheet, and the shared selected date.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { ScheduleScreen } from '../../src/features/v2/ScheduleScreen';
import { ScheduleKpiPanel } from '../../src/features/v2/ScheduleKpiPanel';
import { buildScheduleKpi } from '../../src/features/v2/scheduleKpi';
import { kpiPanelGeometry, layoutFor } from '../../src/components/v2/useLayout';
import { kpiProfileFor } from '../../src/features/roster/kpiProfile';
import type { Trip } from '../../src/features/travel/tripCsv';
import settingsReducer from '../../src/features/settings/settingsSlice';
import tripsReducer, { setTrips } from '../../src/features/travel/tripsSlice';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import dutiesReducer from '../../src/features/roster/dutiesSlice';
import meetingsReducer from '../../src/features/meetings/meetingsSlice';
import notificationsReducer from '../../src/features/notifications/notificationsSlice';
import flightCalendarReducer from '../../src/features/calendar/flightCalendarSlice';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

/** Live layout stub so a test can rotate the window mid-session. */
const mockLayout = { current: layoutFor(420, 912) };
jest.mock('../../src/components/v2/useLayout', () => ({
  ...jest.requireActual('../../src/components/v2/useLayout'),
  useLayout: () => mockLayout.current,
}));

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function roster(date: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(date.getUTCDate())} ${MON[date.getUTCMonth()]} ${date.getUTCFullYear()} ${p2(date.getUTCHours())}${p2(date.getUTCMinutes())}`;
}

/** One out-and-back duty with the portal's published totals on both legs. */
function duty(id: string, start: Date, blockMinutes = 240, dpMinutes = 480): Trip {
  const at = (h: number) => new Date(start.getTime() + h * 3600_000);
  return {
    id,
    crewId: '35459',
    checkInDateUTC: roster(start),
    legs: [
      {
        crewId: '35459', fltNumber: 'TG409', flightDateUTC: roster(at(2)), depArp: 'BKK',
        arvDateUTC: roster(at(4)), arvArp: 'SIN', fleet: 'Boeing 777-300', hotel: '',
        assignment: 'FLY', dutyReportUTC: roster(start),
        dutyDpMinutes: dpMinutes, dutyBlockMinutes: blockMinutes,
      },
      {
        crewId: '35459', fltNumber: 'TG410', flightDateUTC: roster(at(6)), depArp: 'SIN',
        arvDateUTC: roster(at(8)), arvArp: 'BKK', fleet: 'Boeing 777-300', hotel: '',
        assignment: 'FLY', dutyReportUTC: roster(start),
        dutyDpMinutes: dpMinutes, dutyBlockMinutes: blockMinutes,
      },
    ],
  };
}

const TRIPS = [
  duty('sep-22', new Date('2026-09-22T06:00:00Z')),
  duty('oct-02', new Date('2026-10-02T06:00:00Z')),
  duty('oct-05', new Date('2026-10-05T06:00:00Z')),
  duty('oct-06', new Date('2026-10-06T06:00:00Z')),
];

const NOW = new Date('2026-10-05T09:00:00Z');
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(NOW); });
afterEach(() => { act(() => { jest.runOnlyPendingTimers(); }); jest.useRealTimers(); });

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
  store.dispatch(setTrips(TRIPS));
  return store;
}

function renderSchedule(store = makeStore()) {
  return render(
    <Provider store={store}>
      <ScheduleScreen />
    </Provider>,
  );
}

describe('floating summary geometry', () => {
  const iphone = kpiPanelGeometry(420, 912, { bottom: 34 }, false);
  const air = kpiPanelGeometry(912, 420, { bottom: 0 }, false);
  const duo = kpiPanelGeometry(951, 669, { bottom: 0 }, false);
  const ipad = kpiPanelGeometry(1210, 834, { bottom: 20 }, false);

  it('keeps the portrait card at the selected Floating Summary size', () => {
    expect(iphone.landscape).toBe(false);
    expect(iphone.width).toBeGreaterThanOrEqual(340);
    expect(iphone.width).toBeLessThanOrEqual(420);
    expect(iphone.valueSize).toBeLessThan(air.valueSize);
  });

  it('enlarges the panel and its contents in landscape on all three devices', () => {
    // Landing targets from the spec: ~480–500 / ~520–560 / ~620–660.
    expect(air.width).toBeGreaterThanOrEqual(480);
    expect(air.width).toBeLessThanOrEqual(505);
    expect(duo.width).toBeGreaterThanOrEqual(518);
    expect(duo.width).toBeLessThanOrEqual(560);
    expect(ipad.width).toBeGreaterThanOrEqual(620);
    expect(ipad.width).toBeLessThanOrEqual(660);

    // Value typography grows with the panel: 22–24 / 24–26 / 26–28.
    expect(air.valueSize).toBeGreaterThanOrEqual(22);
    expect(air.valueSize).toBeLessThanOrEqual(24);
    expect(duo.valueSize).toBeGreaterThanOrEqual(24);
    expect(duo.valueSize).toBeLessThanOrEqual(26);
    expect(ipad.valueSize).toBeGreaterThanOrEqual(26);
    expect(ipad.valueSize).toBeLessThanOrEqual(28);
    expect(ipad.padding).toBeGreaterThan(air.padding);
  });

  it('keeps the panel clear of the dock and the Duo action strip', () => {
    expect(iphone.bottom).toBeGreaterThan(34 + 54);
    // With the Duo right rail there is no bottom dock: the panel sits above the
    // home indicator only.
    const rail = kpiPanelGeometry(951, 669, { bottom: 20 }, true);
    expect(rail.bottom).toBeLessThan(iphone.bottom);
  });
});

describe('floating summary on the Schedule tab', () => {
  it('shows the three figures for the selected day', () => {
    const tree = renderSchedule();
    expect(tree.getByTestId('sched-kpi')).toBeTruthy();
    expect(tree.getByTestId('kpi-anchor').props.children.join('')).toBe('Through 5 Oct 2026');
    // 28-day flight: 3 duties × 4h = 12h used of 100h.
    expect(tree.getByTestId('kpi-value-flight28').props.children).toBe('88.0h left');
    // 7-day duty: 2 duties × 8h = 16h used of 60h.
    expect(tree.getByTestId('kpi-value-duty7').props.children).toBe('44.0h left');
    // 6 operating flights through the selected day → a proven lower bound of
    // +3 over the minimum of 3 (older flights may exist before the history).
    expect(tree.getByTestId('kpi-value-takeoffs').props.children).toBe('+3');
    expect(tree.getByTestId('kpi-value-landings').props.children).toBe('+3');
    expect(tree.getByTestId('kpi-sub-takeoffs').props.children).toBe('≥ 6 / 3 minimum');
    // Take-offs and landings keep their own labelled row inside the group.
    expect(tree.getByTestId('kpi-takeoffs')).toBeTruthy();
    expect(tree.getByTestId('kpi-landings')).toBeTruthy();
  });

  it('moves the summary with a calendar tap', () => {
    const tree = renderSchedule();
    fireEvent.press(tree.getByTestId('day-6'));
    expect(tree.getByTestId('kpi-anchor').props.children.join('')).toBe('Through 6 Oct 2026');
    expect(tree.getByTestId('kpi-value-duty7').props.children).toBe('36.0h left');
    expect(tree.getByTestId('kpi-value-flight28').props.children).toBe('84.0h left');
  });

  it('moves the summary when the duty list settles on another day', () => {
    const tree = renderSchedule();
    // The programmatic mount scroll locks viewability for 700ms; after that a
    // real drag drives the selection.
    act(() => { jest.advanceTimersByTime(800); });
    act(() => {
      fireEvent(tree.getByTestId('sched-list'), 'onScrollBeginDrag');
      fireEvent(tree.getByTestId('sched-list'), 'onViewableItemsChanged', {
        viewableItems: [{ index: 2, isViewable: true }],
      });
    });
    expect(tree.getByTestId('kpi-anchor').props.children.join('')).toBe('Through 6 Oct 2026');
    expect(tree.getByTestId('kpi-value-duty7').props.children).toBe('36.0h left');
  });

  it('keeps the selected day when the device rotates', () => {
    // The Duo rotating portrait → landscape changes the column count; the
    // month re-seat must not snap the crew back to today.
    mockLayout.current = layoutFor(420, 912);
    const store = makeStore();
    const tree = renderSchedule(store);
    fireEvent.press(tree.getByTestId('day-6'));
    expect(tree.getByTestId('kpi-anchor').props.children.join('')).toBe('Through 6 Oct 2026');

    mockLayout.current = layoutFor(951, 669);
    tree.rerender(
      <Provider store={store}>
        <ScheduleScreen />
      </Provider>,
    );
    // The reflow re-fires viewability at the top of the list; it must not move
    // the selection with it, however late that event arrives.
    act(() => {
      fireEvent(tree.getByTestId('sched-grid'), 'onViewableItemsChanged', {
        viewableItems: [{ index: 0, isViewable: true }],
      });
    });
    expect(tree.getByTestId('kpi-anchor').props.children.join('')).toBe('Through 6 Oct 2026');
    expect(tree.getByTestId('kpi-value-duty7').props.children).toBe('36.0h left');

    // A real drag releases the hold and scroll-driven selection resumes.
    act(() => {
      fireEvent(tree.getByTestId('sched-grid'), 'onScrollBeginDrag');
      fireEvent(tree.getByTestId('sched-grid'), 'onViewableItemsChanged', {
        viewableItems: [{ index: 0, isViewable: true }],
      });
    });
    expect(tree.getByTestId('kpi-anchor').props.children.join('')).toBe('Through 2 Oct 2026');
    mockLayout.current = layoutFor(420, 912);
  });

  it('opens all six windows and both recency lines in the detail sheet', () => {
    const tree = renderSchedule();
    fireEvent.press(tree.getByTestId('sched-kpi'));

    expect(tree.getByTestId('kpi-sheet')).toBeTruthy();
    expect(tree.getByTestId('kpi-sheet-anchor').props.children.join('')).toBe(
      'Through 5 Oct 2026 · Asia/Bangkok · projected',
    );
    ['flight28', 'flightYear', 'flight12m', 'duty7', 'duty14', 'duty28', 'takeoffs', 'landings']
      .forEach(id => expect(tree.getByTestId(`kpi-sheet-row-${id}`)).toBeTruthy());
    // Exact window dates live only in the sheet.
    expect(tree.getByText('1 Nov 2025–5 Oct 2026')).toBeTruthy();
    expect(tree.getByText('29 Sep–5 Oct')).toBeTruthy();
    // Year/12-month history is not in the captured roster — say so.
    expect(tree.getByTestId('kpi-sheet-history')).toBeTruthy();

    fireEvent.press(tree.getByTestId('kpi-sheet-close'));
    expect(tree.queryByTestId('kpi-sheet')).toBeNull();
  });

  it('flags a breach in a window the floating card does not show', () => {
    // Eight 14-hour duties from 4 Oct: 112h in the 14-day window. The two
    // figures on the floating card (28-day flight, 7-day duty) stay inside.
    const heavy = Array.from({ length: 8 }, (_, i) =>
      duty(`heavy-${i}`, new Date(`2026-10-${String(4 + i).padStart(2, '0')}T06:00:00Z`), 60, 840));
    const kpi = buildScheduleKpi({
      trips: heavy,
      duties: [],
      selected: { year: 2026, monthIdx: 9, day: 17 },
      zone: 'Asia/Bangkok',
      profile: kpiProfileFor('TG')!,
      now: NOW,
      crewId: '35459',
      coverage: { startYmd: 20250101, endYmd: 20261231, source: 'declared' },
    });
    // The 7-day window (11–17 Oct) holds one 14h duty; the 14-day window is over.
    expect(kpi.duty[0].status).toBe('ok');
    expect(kpi.duty[1].status).toBe('over');
    const tree = render(
      <ScheduleKpiPanel kpi={kpi} geometry={kpiPanelGeometry(420, 912, { bottom: 34 }, false)} />,
    );
    expect(tree.getByTestId('kpi-value-duty7').props.children).toBe('46.0h left');
    expect(tree.getByTestId('kpi-alert')).toBeTruthy();
  });
});
