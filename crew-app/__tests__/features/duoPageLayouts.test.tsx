// iPhone Duo — a layout per page, designed from the page's content
// (docs/superpowers/specs/2026-10-07-crew-app-duo-per-page-layouts-design.md).
//
// `wide` = the unfolded inner screen in landscape (951x669), `tall` = the same
// screen rotated (669x951). The window is pinned to a regular iPhone in
// jest.setup.js, so each case mocks `useLayout` for the class under test, and
// the compact cases prove the phone layout is untouched.
import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { render, fireEvent, act, within } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ScheduleScreen } from '../../src/features/v2/ScheduleScreen';
import { HomeScreen } from '../../src/features/v2/HomeScreen';
import { DestinationScreen } from '../../src/features/v2/DestinationScreen';
import { cityForAirport } from '../../src/features/home/cities';
import { buildMonth, MON } from '../../src/features/v2/model';
import { daySummary } from '../../src/features/v2/schedView';
import { bottomDockClearance, layoutFor } from '../../src/components/v2/useLayout';
import settingsReducer from '../../src/features/settings/settingsSlice';
import tripsReducer, { setTrips } from '../../src/features/travel/tripsSlice';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import dutiesReducer, { setDuties } from '../../src/features/roster/dutiesSlice';
import meetingsReducer from '../../src/features/meetings/meetingsSlice';
import notificationsReducer from '../../src/features/notifications/notificationsSlice';
import flightCalendarReducer from '../../src/features/calendar/flightCalendarSlice';
import type { Trip } from '../../src/features/travel/tripCsv';
import type { PortalDuty } from '../../src/features/travel/portalCapture';
import type { AppleWeatherState } from '../../src/features/weather/weatherModule';

const mockWeatherState: AppleWeatherState = {
  base: 'LHR',
  status: 'unavailable',
  day: null,
  outlook: [],
  hours: [],
  attribution: null,
  retry: jest.fn(),
};
const mockUseAppleWeather = jest.fn(
  (_base: string, _year: number, _monthIdx: number, _day: number | null): AppleWeatherState => mockWeatherState,
);
jest.mock('../../src/features/weather/weatherModule', () => ({
  ...jest.requireActual('../../src/features/weather/weatherModule'),
  useAppleWeather: (base: string, year: number, monthIdx: number, day: number | null) =>
    mockUseAppleWeather(base, year, monthIdx, day),
}));

const mockInsets = { current: { top: 0, right: 0, bottom: 0, left: 0 } };
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets.current,
}));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

/** The layout class under test; the real hook is swapped for this value. */
const mockLayout = { current: layoutFor(420, 912) };
jest.mock('../../src/components/v2/useLayout', () => ({
  ...jest.requireActual('../../src/components/v2/useLayout'),
  useLayout: () => mockLayout.current,
}));
const asPhone = () => { mockLayout.current = layoutFor(420, 912); };
const asWide = () => { mockLayout.current = layoutFor(951, 669); };
const asTall = () => { mockLayout.current = layoutFor(669, 951); };

// ─── Fixtures: next month, so the rotation is upcoming whatever today is ──────
const NOW = new Date();
const NEXT = new Date(NOW.getFullYear(), NOW.getMonth() + 1, 1);
const Y = NEXT.getFullYear();
const M = NEXT.getMonth();
const roster = (d: number, hhmm: string) => `${String(d).padStart(2, '0')} ${MON[M]} ${Y} ${hhmm}`;
const local = (d: number, hhmm: string) => `${Y}-${String(M + 1).padStart(2, '0')}-${String(d).padStart(2, '0')} ${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;

/** BKK → LHR on the 7th, back on the 9th: one rotation, one layover night. (Days
 *  stay inside FlatList's first render window, which is what Jest sees.) */
const lhrTrip: Trip = {
  id: 'pair-lhr',
  crewId: '35459',
  checkInDateUTC: roster(7, '1400'),
  layoverHours: 30,
  legs: [
    {
      crewId: '35459', fltNumber: 'TG920', flightDateUTC: roster(7, '1545'),
      depArp: 'BKK', arvDateUTC: roster(8, '0445'), arvArp: 'LHR', fleet: 'Boeing 777-300',
      hotel: 'Hilton Heathrow', localDepTime: local(7, '2245'), localArvTime: local(8, '0545'),
      assignment: 'FLY',
    },
    {
      crewId: '35459', fltNumber: 'TG911', flightDateUTC: roster(9, '1030'),
      depArp: 'LHR', arvDateUTC: roster(9, '2230'), arvArp: 'BKK', fleet: 'Boeing 777-300',
      hotel: '', localDepTime: local(9, '1130'), localArvTime: local(10, '0530'),
      assignment: 'FLY',
    },
  ],
};
const sinTrip: Trip = {
  id: 'pair-sin',
  crewId: '35459',
  checkInDateUTC: roster(26, '1700'),
  layoverHours: 0,
  legs: [{
    crewId: '35459', fltNumber: 'TG403', flightDateUTC: roster(26, '1730'),
    depArp: 'BKK', arvDateUTC: roster(26, '2000'), arvArp: 'SIN', fleet: 'Airbus A350-900',
    hotel: '', localDepTime: local(27, '0030'), localArvTime: local(27, '0400'), assignment: 'FLY',
  }],
};
const standby: PortalDuty = {
  id: 'sby-5', assignment: 'SBY', fltNum: '', dutyType: 'SBY',
  localStart: local(5, '0600'), localEnd: local(5, '1400'),
  startUTC: roster(5, '0600'), endUTC: roster(5, '1400'), briefStart: '', crewId: '35459',
  carrier: 'TG', baseOffsetMin: 420, airportCode: 'BKK', raw: {},
};

function makeStore() {
  const store = configureStore({
    reducer: {
      auth: (state = { airline: 'TG', base: 'BKK', crewId: '35459', carrier: 'TG' }) => state,
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
  store.dispatch(setTrips([lhrTrip, sinTrip]));
  store.dispatch(setDuties([standby]));
  return store;
}

const withStore = (ui: React.ReactElement) => render(<GestureHandlerRootView><Provider store={makeStore()}>{ui}</Provider></GestureHandlerRootView>);

/** Schedule opens on this month; the fixtures live in the next one. The screen
 *  re-seats its focused day on a short timer after the month rolls, so wait for it. */
async function openNextMonth(tree: ReturnType<typeof render>) {
  fireEvent.press(tree.getByTestId('sched-next-month'));
  await act(async () => { await new Promise(r => setTimeout(r, 80)); });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWeatherState.base = 'LHR';
  mockWeatherState.status = 'unavailable';
  mockWeatherState.day = null;
  mockWeatherState.outlook = [];
  mockWeatherState.hours = [];
  mockWeatherState.attribution = null;
  mockInsets.current = { top: 0, right: 0, bottom: 0, left: 0 };
  asPhone();
});

describe('daySummary — one line per day', () => {
  const month = buildMonth(Y, M, [lhrTrip, sinTrip], [standby], [], 'airport', 'Asia/Bangkok', {}, NOW, { minutesBefore: 8, mutedIds: [] });
  const on = (d: number) => month.days[d - 1];

  it('leads with the flight: number, route and departure time', () => {
    expect(daySummary(on(7))).toEqual({ icon: 'plane', text: 'TG920 · BKK → LHR', time: '22:45' });
  });
  it('names a layover day by its city and a ground duty by its label and window', () => {
    expect(daySummary(on(8))).toEqual({ icon: 'bed', text: 'Layover · LHR', time: '' });
    expect(daySummary(on(5))).toMatchObject({ icon: 'clock', time: '06:00–14:00' });
  });
  it('marks a blank roster day as nothing published (no icon)', () => {
    expect(daySummary(on(3))).toEqual({ icon: null, text: '', time: '' });
  });
});

/** The day-card FlatList itself (the testID lands on its inner scroll view). */
const dayList = (tree: ReturnType<typeof render>, id: string) =>
  tree.UNSAFE_getAllByType(FlatList).find(l => l.props.testID === id)!;

describe('Schedule ▸ Timeline', () => {
  it('iPad: keeps the view toolbar below the top status-bar safe area', () => {
    mockLayout.current = layoutFor(834, 1210);
    mockInsets.current = { top: 24, right: 0, bottom: 20, left: 0 };
    const tree = withStore(<ScheduleScreen />);
    const safeRail = tree.getByTestId('sched-view-rail-safe');
    expect(StyleSheet.flatten(safeRail.props.style).paddingTop).toBe(24);
    expect(within(safeRail).getByTestId('sched-view-calendar')).toBeTruthy();
  });

  it('wide: the date strip on top, the day cards in two columns, the roster views in a right-side toolbar', async () => {
    asWide();
    const tree = withStore(<ScheduleScreen />);
    await openNextMonth(tree);
    // The same date strip the phone has — the picker is back on top.
    expect(tree.getByTestId('day-7')).toBeTruthy();
    expect(dayList(tree, 'sched-grid').props.numColumns).toBe(2);
    expect(tree.queryByTestId('sched-list')).toBeNull();
    expect(tree.queryByTestId('sched-master')).toBeNull();
    expect(tree.getByTestId('duty-TG920')).toBeTruthy();
    // No hamburger: each view is one tap on the toolbar, the current one lit.
    expect(tree.queryByTestId('sched-view-menu')).toBeNull();
    const rail = tree.getByTestId('sched-view-rail');
    expect(within(rail).getByTestId('sched-view-timeline').props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(within(rail).getByTestId('sched-view-route'));
    expect(tree.getByTestId('route-map')).toBeTruthy();
    expect(tree.queryByTestId('sched-grid')).toBeNull();
    expect(within(rail).getByTestId('sched-view-route').props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(within(rail).getByTestId('sched-alerts'));
    expect(mockNavigate).toHaveBeenCalledWith('Alerts');
    fireEvent.press(within(rail).getByTestId('sched-view-timeline'));
    expect(tree.getByTestId('sched-grid')).toBeTruthy();
  });

  it('wide: two flights on the final unpaired day share one row of normal-width tickets', async () => {
    asWide();
    const store = makeStore();
    store.dispatch(setDuties([]));
    store.dispatch(setTrips([{ ...sinTrip, legs: [
      sinTrip.legs[0],
      { ...sinTrip.legs[0], fltNumber: 'TG404', flightDateUTC: roster(26, '2100'),
        depArp: 'SIN', arvArp: 'BKK', arvDateUTC: roster(26, '2330'),
        localDepTime: local(27, '0400'), localArvTime: local(27, '0630') },
    ] }]));
    const tree = render(<Provider store={store}><ScheduleScreen /></Provider>);
    await openNextMonth(tree);
    const row = tree.getByTestId('sched-two-leg-row');
    expect(StyleSheet.flatten(row.props.style).flexDirection).toBe('row');
    expect(within(row).getByTestId('duty-TG403')).toBeTruthy();
    expect(within(row).getByTestId('duty-TG404')).toBeTruthy();

    asPhone();
    const compact = render(<Provider store={store}><ScheduleScreen /></Provider>);
    await openNextMonth(compact);
    expect(compact.queryByTestId('sched-two-leg-row')).toBeNull();
  });

  it('wide on the Duo: the toolbar sits in the right-edge status strip, under the clock', async () => {
    asWide();
    // The Duo inner screen in landscape: an 84pt status strip down the right edge.
    mockInsets.current = { top: 0, right: 84, bottom: 21, left: 0 };
    const tree = withStore(<ScheduleScreen />);
    await openNextMonth(tree);
    expect(StyleSheet.flatten(tree.getByTestId('sched-header').props.style).paddingTop).toBe(8);
    const edge = tree.getByTestId('sched-view-rail-edge');
    const rail = within(edge).getByTestId('sched-view-rail');
    expect(StyleSheet.flatten(edge.props.style)).toMatchObject({ position: 'absolute', right: 0, width: 84 });
    expect(StyleSheet.flatten(edge.props.style).top).toBeGreaterThan(90); // clear of the clock + Wi-Fi
    // The cards keep out of the strip: the screen pads by the inset itself.
    expect(StyleSheet.flatten(tree.getByTestId('sched-shell').props.style)).toMatchObject({ paddingRight: 84 });
    expect(within(tree.getByTestId('sched-shell')).queryByTestId('sched-view-rail')).toBeNull();
    fireEvent.press(within(rail).getByTestId('sched-view-calendar'));
    expect(tree.getByTestId('cal-month-detail')).toBeTruthy();
    fireEvent.press(tree.getByTestId('cal-mode-toggle'));
    expect(tree.getByTestId('cal-grid')).toBeTruthy();
    expect(tree.getByTestId('cal-agenda-head')).toBeTruthy();
  });

  it('compact on the Duo outer screen: the same right-edge switcher replaces the menu', async () => {
    mockLayout.current = layoutFor(466, 678);
    mockInsets.current = { top: 0, right: 84, bottom: 21, left: 0 };
    const tree = withStore(<ScheduleScreen />);
    await openNextMonth(tree);
    expect(StyleSheet.flatten(tree.getByTestId('sched-header').props.style).paddingTop).toBe(8);
    expect(tree.queryByTestId('sched-view-menu')).toBeNull();
    expect(dayList(tree, 'sched-list').props.numColumns).toBe(1);
    const edge = tree.getByTestId('sched-view-rail-edge');
    expect(StyleSheet.flatten(edge.props.style).top).toBe(165);
    const rail = within(edge).getByTestId('sched-view-rail');
    fireEvent.press(within(rail).getByTestId('sched-view-route'));
    expect(tree.getByTestId('route-map')).toBeTruthy();
    fireEvent.press(within(rail).getByTestId('sched-alerts'));
    expect(mockNavigate).toHaveBeenCalledWith('Alerts');
  });

  it('compact (phone): the date strip and the scrolling list, unchanged', async () => {
    const tree = withStore(<ScheduleScreen />);
    await openNextMonth(tree);
    expect(dayList(tree, 'sched-list').props.numColumns).toBe(1);
    expect(tree.queryByTestId('sched-view-rail')).toBeNull();
    expect(tree.getByTestId('sched-view-menu')).toBeTruthy();
    expect(tree.getByTestId('day-7')).toBeTruthy();
  });

  it('Duo: the day list ends at the screen edge instead of reserving the phone dock band', async () => {
    asWide();
    mockInsets.current = { top: 0, right: 84, bottom: 21, left: 0 };
    const tree = withStore(<ScheduleScreen />);
    await openNextMonth(tree);
    // No bottom dock on the Duo — navigation is the right-edge rail — so only
    // the home-indicator inset remains under the last card, plus the band the
    // floating limit summary reserves (14pt gap; the card's own measured height
    // is 0 until a real layout pass).
    expect(StyleSheet.flatten(dayList(tree, 'sched-grid').props.contentContainerStyle).paddingBottom).toBe(21 + 14);

    asPhone();
    mockInsets.current = { top: 0, right: 0, bottom: 0, left: 0 };
    const phone = withStore(<ScheduleScreen />);
    await openNextMonth(phone);
    // Same reserved band under the phone's floating dock.
    expect(StyleSheet.flatten(dayList(phone, 'sched-list').props.contentContainerStyle).paddingBottom).toBe(120 + 14);
  });
});

describe('Schedule ▸ Calendar', () => {
  const openCalendar = async (tree: ReturnType<typeof render>) => {
    await openNextMonth(tree);
    // Phone / tall: through the menu; wide: straight from the toolbar.
    if (tree.queryByTestId('sched-view-menu')) fireEvent.press(tree.getByTestId('sched-view-menu'));
    fireEvent.press(tree.getByTestId('sched-view-calendar'));
  };

  it('wide: progresses from full month to month + day to selected week + day', async () => {
    asWide();
    const tree = withStore(<ScheduleScreen />);
    await openCalendar(tree);
    expect(within(tree.getByTestId('sched-header')).getByTestId('cal-header-actions')).toBeTruthy();
    expect(within(tree.getByTestId('sched-header')).getByTestId('cal-mode-toggle')).toBeTruthy();
    expect(within(tree.getByTestId('sched-header')).getByTestId('cal-to-detail')).toBeTruthy();
    fireEvent.press(tree.getByTestId('cal-mode-toggle'));
    expect(tree.getByTestId('cal-grid')).toBeTruthy();
    expect(tree.getByTestId('cal-to-detail')).toBeTruthy();
    fireEvent.press(tree.getByTestId('cal-day-7'));
    expect(tree.getByTestId('cal-agenda-head').props.children).toMatch(/ 7 /);
    fireEvent.press(tree.getByTestId('cal-day-8'));
    expect(tree.getByTestId('cal-row-layover-' + `${Y}${String(M + 1).padStart(2, '0')}08`)).toBeTruthy();
    fireEvent.press(tree.getByTestId('cal-mode-toggle'));
    expect(tree.getByTestId('cal-week-grid')).toBeTruthy();
    expect(tree.getAllByTestId(/^cal-grid-week-/)).toHaveLength(1);
    expect(tree.queryByTestId('cal-timeline')).toBeNull();
    fireEvent.press(tree.getByTestId('cal-to-detail'));
    expect(tree.getByTestId('cal-detail')).toBeTruthy();
    expect(tree.getByTestId('cal-allday-layover-' + `${Y}${String(M + 1).padStart(2, '0')}08`)).toBeTruthy();
  });

  it('iPad: uses the same progressive calendar and opens hours explicitly', async () => {
    mockLayout.current = layoutFor(834, 1210);
    const tree = withStore(<ScheduleScreen />);
    await openCalendar(tree);
    expect(within(tree.getByTestId('sched-header')).getByTestId('cal-header-actions')).toBeTruthy();
    expect(tree.getByTestId('cal-month-detail')).toBeTruthy();
    fireEvent.press(tree.getByTestId('cal-mode-toggle'));
    expect(tree.getByTestId('cal-grid')).toBeTruthy();
    fireEvent.press(tree.getByTestId('cal-day-7'));
    expect(tree.getByTestId('cal-agenda-head').props.children).toMatch(/ 7 /);
    fireEvent.press(tree.getByTestId('cal-to-detail'));
    expect(tree.getByTestId('cal-timeline')).toBeTruthy();
  });

  it('tall and compact: stacked cells stay compact to leave room for the agenda', async () => {
    asTall();
    const tall = withStore(<ScheduleScreen />);
    await openCalendar(tall);
    const flat = (style: unknown) => [style].flat(3).some(s => s && (s as { aspectRatio?: number }).aspectRatio === 1);
    expect(flat(tall.getByTestId('cal-day-7').props.style)).toBe(false);
    expect(tall.getByTestId('cal-month-detail')).toBeTruthy();

    asPhone();
    const phone = withStore(<ScheduleScreen />);
    await openCalendar(phone);
    expect(within(phone.getByTestId('sched-header')).getByTestId('cal-header-actions')).toBeTruthy();
    expect(within(phone.getByTestId('sched-header')).getByTestId('cal-mode-toggle')).toBeTruthy();
    expect(within(phone.getByTestId('sched-header')).getByTestId('cal-to-detail')).toBeTruthy();
    expect(within(phone.getByTestId('cal-compact')).queryByTestId('cal-mode-toggle')).toBeNull();
    expect(StyleSheet.flatten(phone.getByTestId('sched-header').props.style).paddingHorizontal).toBe(8);
    expect(phone.getByTestId('sched-prev-month').props.hitSlop).toBe(7);
    expect(phone.getByTestId('sched-next-month').props.hitSlop).toBe(7);
    expect(phone.getByTestId('cal-mode-toggle').props.hitSlop).toBe(5);
    expect(flat(phone.getByTestId('cal-day-7').props.style)).toBe(false);
    expect(phone.getByTestId('cal-to-detail')).toBeTruthy();
  });

  it('Duo: the month and day agenda fill the height below the header instead of a dock band', async () => {
    asWide();
    mockInsets.current = { top: 0, right: 84, bottom: 21, left: 0 };
    const duo = withStore(<ScheduleScreen />);
    await openCalendar(duo);
    // Month-detail: the whole calendar column scrolls, so the reserve lives on
    // the content container.
    expect(StyleSheet.flatten(duo.getByTestId('cal-compact').props.contentContainerStyle).paddingBottom).toBe(21);
    // Month + day: the selected day's agenda is a fixed pane; the same edge applies.
    fireEvent.press(duo.getByTestId('cal-mode-toggle'));
    expect(StyleSheet.flatten(duo.getByTestId('cal-compact').props.style).paddingBottom).toBe(21);

    asPhone();
    mockInsets.current = { top: 0, right: 0, bottom: 0, left: 0 };
    const phone = withStore(<ScheduleScreen />);
    await openCalendar(phone);
    expect(StyleSheet.flatten(phone.getByTestId('cal-compact').props.contentContainerStyle).paddingBottom).toBe(130);
    fireEvent.press(phone.getByTestId('cal-mode-toggle'));
    expect(StyleSheet.flatten(phone.getByTestId('cal-compact').props.style).paddingBottom).toBe(100);
  });
});

describe('Home', () => {
  it('leaves ordinary scroll padding when the Duo cover navigation moves to the right rail', () => {
    mockLayout.current = layoutFor(466, 678);
    const tree = withStore(<HomeScreen />);
    expect(StyleSheet.flatten(tree.getByTestId('home-screen').props.contentContainerStyle).paddingBottom).toBe(24);
  });

  it('tall portrait: trip details owns the rotation and destinations grow into the remaining height', () => {
    asTall();
    mockInsets.current = { top: 0, right: 84, bottom: 21, left: 0 };
    const tree = withStore(<HomeScreen />);
    expect(tree.getByTestId('home-next-trip')).toBeTruthy();
    expect(tree.queryByTestId('home-rotation')).toBeNull();
    expect(tree.queryByText('LHR → BKK')).toBeNull();
    expect(tree.queryByText('View Trip Details')).toBeNull();
    expect(tree.getByText('Trip details')).toBeTruthy();
    const strip = tree.getByTestId('home-explore-strip');
    expect(strip.props.horizontal).toBe(true);
    fireEvent(tree.getByTestId('home-tall-explore'), 'layout', { nativeEvent: { layout: { x: 0, y: 500, width: 625, height: 250 } } });
    fireEvent(tree.getByTestId('home-quick-actions'), 'layout', { nativeEvent: { layout: { x: 0, y: 764, width: 625, height: 120 } } });
    expect(StyleSheet.flatten(tree.getAllByTestId(/^dest-/)[0].props.style)).toMatchObject({ width: 200, height: 253 });
    fireEvent.press(tree.getByTestId('home-trip-details-link'));
    expect(mockNavigate).toHaveBeenCalledWith('TripDetails', { tripId: lhrTrip.id });
    fireEvent.press(tree.getByTestId('home-trip-qr'));
    expect(mockNavigate).toHaveBeenCalledWith('TripDetails', { tripId: lhrTrip.id });
    expect(StyleSheet.flatten(tree.getByTestId('home-trip-qr').props.style).width).toBe(44);
  });

  it.each([[912, 420], [951, 669], [1194, 834]])('landscape %ix%i: trip and Quick actions share the dashboard strip above Explore', (width, height) => {
    mockLayout.current = layoutFor(width, height);
    const tree = withStore(<HomeScreen />);
    const dashboard = within(tree.getByTestId('home-landscape-dashboard'));
    expect(dashboard.getByTestId('home-next-trip')).toBeTruthy();
    expect(dashboard.getByTestId('home-quick-actions')).toBeTruthy();
    expect(dashboard.queryByTestId('home-explore')).toBeNull();
    expect(tree.getByTestId('home-landscape-header')).toBeTruthy();
    expect(tree.getByTestId('home-explore-strip').props.horizontal).toBe(true);
    expect(tree.queryByTestId('home-wide-row-1')).toBeNull();
    expect(tree.queryByTestId('home-ipad-quick-row')).toBeNull();

    fireEvent(tree.getByTestId('home-landscape-explore'), 'layout', { nativeEvent: { layout: { x: 0, y: 324, width: 800, height: 154 } } });
    fireEvent(tree.getByTestId('home-explore-strip'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 800, height: 154 } } });
    const tiles = tree.getAllByTestId(/^dest-/);
    expect(tiles.length).toBeGreaterThan(0);
    const tile = StyleSheet.flatten(tiles[0].props.style);
    expect(tile.width * 4 + 36).toBeLessThanOrEqual(800);
    const bottomClear = bottomDockClearance(
      width,
      height,
      mockInsets.current,
      height >= 700 ? 130 : 100,
    );
    expect(tile.height).toBe(Math.max(154, height - 324 - 59 - bottomClear));
  });

  it('Duo landscape: grows landmarks to the bottom rail boundary when iOS reports no right inset', () => {
    asWide();
    mockInsets.current = { top: 0, right: 0, bottom: 21, left: 0 };
    const tree = withStore(<HomeScreen />);
    fireEvent(tree.getByTestId('home-landscape-explore'), 'layout', { nativeEvent: { layout: { x: 0, y: 324, width: 800, height: 154 } } });
    expect(StyleSheet.flatten(tree.getAllByTestId(/^dest-/)[0].props.style).height).toBe(265);
    expect(StyleSheet.flatten(tree.getByTestId('home-screen').props.contentContainerStyle).paddingBottom).toBe(21);
  });

  it('landscape: shows the nearest arrival-hour Apple Weather inline beside the airport', () => {
    asWide();
    mockWeatherState.status = 'ready';
    mockWeatherState.day = {
      date: `${Y}-${String(M + 1).padStart(2, '0')}-08`,
      symbolName: 'cloud.sun.fill',
      condition: 'Partly Cloudy',
      highC: 18,
      lowC: 11,
    };
    mockWeatherState.hours = [
      { date: `${Y}-${String(M + 1).padStart(2, '0')}-08`, hour: 3, symbolName: 'cloud.fill', temperatureC: 12 },
      { date: `${Y}-${String(M + 1).padStart(2, '0')}-08`, hour: 6, symbolName: 'cloud.sun.fill', temperatureC: 13.6 },
    ];
    mockWeatherState.attribution = {
      serviceName: 'Apple Weather',
      legalPageURL: 'https://weatherkit.apple.com/legal-attribution.html',
      combinedMarkDarkURL: 'https://example.test/dark.png',
      combinedMarkLightURL: 'https://example.test/light.png',
    };
    const tree = withStore(<HomeScreen />);

    expect(mockUseAppleWeather).toHaveBeenLastCalledWith('LHR', Y, M, 8);
    expect(tree.getByText('14°')).toBeTruthy();
    expect(tree.getByTestId('home-weather-attribution')).toBeTruthy();
    expect(tree.getByTestId('home-arrival-weather').props.accessibilityLabel).toBe('LHR arrival weather, 14 degrees Celsius');
    expect(tree.queryByText(/Weather unavailable|forecast not yet available|weather loading/i)).toBeNull();
  });

  it.each(['loading', 'unavailable', 'out-of-range'] as const)('landscape: keeps the arrival block clean when weather is %s', status => {
    asWide();
    mockWeatherState.status = status;
    const tree = withStore(<HomeScreen />);

    expect(tree.getAllByText('LHR').length).toBeGreaterThan(0);
    expect(tree.queryByTestId('home-arrival-weather')).toBeNull();
    expect(tree.queryByText(/Weather unavailable|forecast not yet available|weather loading/i)).toBeNull();
  });

  it('iPad portrait: keeps the existing two panels and separate Quick actions row', () => {
    mockLayout.current = layoutFor(834, 1194);
    const tree = withStore(<HomeScreen />);
    expect(StyleSheet.flatten(tree.getByTestId('home-screen').props.contentContainerStyle).minHeight).toBe(1194);
    expect(StyleSheet.flatten(tree.getByTestId('home-screen').props.contentContainerStyle).paddingBottom).toBe(130);
    expect(tree.getByTestId('home-wide-row-1')).toBeTruthy();
    expect(tree.getByTestId('home-ipad-quick-row')).toBeTruthy();
    expect(tree.queryByTestId('home-landscape-dashboard')).toBeNull();
    expect(tree.queryByTestId('home-landscape-header')).toBeNull();
    expect(tree.queryByTestId('home-arrival-weather')).toBeNull();
    expect(tree.getByTestId('home-explore-strip').props.horizontal).toBe(true);
    fireEvent(tree.getByTestId('home-explore-strip'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 190 } } });
    expect(StyleSheet.flatten(tree.getAllByTestId(/^dest-/)[0].props.style).width).toBe(174);
  });

  it('iPad portrait: keeps the Duo-style columns content-sized instead of stretching the cards to the viewport', () => {
    mockLayout.current = layoutFor(834, 1194);
    const tree = withStore(<HomeScreen />);
    const row = tree.getByTestId('home-wide-row-1');
    expect(StyleSheet.flatten(row.props.style).flexGrow).toBeUndefined();
    expect(StyleSheet.flatten(tree.getByTestId('home-explore').props.style).flexGrow).toBeUndefined();
    expect(StyleSheet.flatten(tree.getByTestId('home-next-trip').props.style).flex).toBeUndefined();
    expect(tree.getByTestId('home-ipad-quick-row')).toBeTruthy();
  });

  it.each([
    ['compact phone portrait', 420, 912],
    ['Duo portrait', 669, 951],
    ['iPad portrait', 834, 1194],
  ])('%s: requests and shows arrival weather inline beside the airport', (_label, width, height) => {
    mockLayout.current = layoutFor(width, height);
    mockWeatherState.status = 'ready';
    mockWeatherState.day = {
      date: `${Y}-${String(M + 1).padStart(2, '0')}-08`,
      symbolName: 'cloud.sun.fill',
      condition: 'Partly Cloudy',
      highC: 18,
      lowC: 11,
    };
    mockWeatherState.hours = [
      { date: `${Y}-${String(M + 1).padStart(2, '0')}-08`, hour: 6, symbolName: 'cloud.sun.fill', temperatureC: 13.6 },
    ];
    const tree = withStore(<HomeScreen />);

    expect(tree.getByTestId('home-next-trip')).toBeTruthy();
    expect(mockUseAppleWeather).toHaveBeenLastCalledWith('LHR', Y, M, 8);
    expect(tree.getByTestId('home-arrival-weather').props.accessibilityLabel).toBe('LHR arrival weather, 14 degrees Celsius');
    expect(tree.getByText('14°')).toBeTruthy();
  });

  it('compact phone portrait: keeps the existing Home structure around arrival weather', () => {
    const tree = withStore(<HomeScreen />);
    expect(tree.getByTestId('home-next-trip')).toBeTruthy();
    expect(tree.queryByTestId('home-rotation')).toBeNull();
    expect(tree.queryByTestId('home-dest-grid')).toBeNull();
    expect(tree.queryByTestId('home-landscape-dashboard')).toBeNull();
    expect(tree.getByTestId('home-trip-details-link')).toBeTruthy();
    expect(tree.getByTestId('home-trip-qr')).toBeTruthy();
  });
});

describe('Destination', () => {
  const screen = () => withStore(<DestinationScreen route={{ key: 'd', name: 'Destination', params: { index: 0 } }} navigation={{} as never} />);

  it('iPad: keeps the trip-details action above the scrolling information panel', () => {
    mockLayout.current = layoutFor(834, 1210);
    const tree = screen();
    expect(StyleSheet.flatten(tree.getByTestId('dest-header').props.style).zIndex).toBeGreaterThan(0);
    fireEvent.press(tree.getByTestId('dest-trip-details'));
    expect(mockNavigate).toHaveBeenCalledWith('TripDetails', { tripId: lhrTrip.id });
  });

  it('wide: photo pane (55 %) | info card; nothing written over the picture', () => {
    asWide();
    const tree = screen();
    const pane = tree.getByTestId('dest-photo-pane-wide');
    expect(pane.props.style.width).toBe(Math.round(951 * 0.55));
    expect(pane.props.style.height).toBe(669);
    expect(StyleSheet.flatten(tree.getByTestId('page-destination').props.style).backgroundColor).toBe(cityForAirport('LHR').panelColor);
    expect(tree.getByTestId('dest-photo-blend-paint')).toBeTruthy();
    expect(tree.queryByTestId('dest-scrim-paint')).toBeNull();
    expect(tree.getByTestId('dest-city')).toBeTruthy();
    expect(tree.queryByTestId('dest-split')).toBeNull();
  });

  it('tall: photo on the top half, with only available details below', () => {
    asTall();
    const tree = screen();
    const pane = tree.getByTestId('dest-photo-pane-tall');
    expect(pane.props.style.width).toBe(669);
    expect(pane.props.style.height).toBe(Math.round(951 * 0.5));
    expect(StyleSheet.flatten(tree.getByTestId('page-destination').props.style).backgroundColor).toBe(cityForAirport('LHR').panelColor);
    expect(tree.getByTestId('dest-photo-blend-paint')).toBeTruthy();
    expect(tree.queryByTestId('dest-scrim-paint')).toBeNull();
    expect(tree.queryByTestId('dest-split')).toBeNull();
  });

  it('compact (phone): the full-window pager with the type on the photo', () => {
    const tree = screen();
    expect(tree.queryByTestId('dest-photo-pane-wide')).toBeNull();
    expect(tree.queryByTestId('dest-photo-pane-tall')).toBeNull();
    expect(tree.getByTestId('dest-scrim-paint')).toBeTruthy();
    expect(tree.queryByTestId('dest-photo-blend-paint')).toBeNull();
    expect(tree.queryByTestId('dest-split')).toBeNull();
    expect(tree.getByTestId('dest-city')).toBeTruthy();
  });
});

// ─── Stage 3 / 4 pages ────────────────────────────────────────────────────────
// eslint-disable-next-line import/first
import { NotificationsScreen } from '../../src/features/notifications/NotificationsScreen';
// eslint-disable-next-line import/first
import { setFeed } from '../../src/features/notifications/notificationsSlice';
// eslint-disable-next-line import/first
import { DiscretionCard } from '../../src/features/notifications/DiscretionCard';
// eslint-disable-next-line import/first
import type { DiscretionRequest } from '../../src/features/notifications/notificationsApi';
// eslint-disable-next-line import/first
import { RBotScreen } from '../../src/features/rbot/RBotScreen';
// eslint-disable-next-line import/first
import rbotReducer from '../../src/features/rbot/rbotSlice';
// eslint-disable-next-line import/first
import { LoginScreen } from '../../src/features/auth/LoginScreen';
// eslint-disable-next-line import/first
import authReducer from '../../src/features/auth/authSlice';
// eslint-disable-next-line import/first
import { TimeZoneScreen } from '../../src/features/v2/TimeZoneScreen';
// eslint-disable-next-line import/first
import { ProfileScreen } from '../../src/features/v2/ProfileScreen';
import { CrewAvatar } from '../../src/features/settings/avatars';
// eslint-disable-next-line import/first
import { RouteMapView } from '../../src/features/v2/RouteMapView';
// eslint-disable-next-line import/first
import { TripDetailsScreen } from '../../src/features/v2/TripDetailsScreen';
// eslint-disable-next-line import/first
import { PALETTES } from '../../src/theme/carrier';

const PENDING: DiscretionRequest = {
  discretionId: 'req-1', crewId: '35459', captainCrewId: '', pairingId: 'pair-lhr',
  dutyId: '1', createdUtc: `${Y}-${String(M + 1).padStart(2, '0')}-07T02:00:00Z`, extensionRequestedMin: 90, state: 'pending',
  plannedFdpMin: 840, actualFdpMin: 930,
  duty: {
    pairingId: 'pair-lhr', pairingLabel: 'TG920/TG911', dutySeq: '1',
    reportUtc: `${Y}-${String(M + 1).padStart(2, '0')}-07T14:00:00Z`, releaseUtc: `${Y}-${String(M + 1).padStart(2, '0')}-08T05:00:00Z`,
    fdpBeforeMin: 840, fdpAfterMin: 930,
    legs: [
      { fltNum: 'TG920', depArp: 'BKK', arvArp: 'LHR', schDepUtc: '2026-09-29T04:00:00Z', schArvUtc: '2026-09-29T08:00:00Z', revisedDepUtc: '2026-09-29T04:00:00Z', revisedArvUtc: '2026-09-29T08:00:00Z', delayMin: 0, operated: false },
    ],
  },
} as unknown as DiscretionRequest;

function makeFullStore() {
  const store = configureStore({
    reducer: {
      auth: (state = { airline: 'TG', base: 'BKK', crewId: '35459', carrier: 'TG', password: 'x', firstName: 'Kim' }) => state,
      settings: settingsReducer,
      trips: tripsReducer,
      alarms: alarmsReducer,
      duties: dutiesReducer,
      meetings: meetingsReducer,
      notifications: notificationsReducer,
      flightCalendar: flightCalendarReducer,
      rbot: rbotReducer,
      dutySwap: (state = {step: 'search', status: 'idle', filters: null, crews: [], crewB: null}) => state,
    },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setTrips([lhrTrip, sinTrip]));
  store.dispatch(setFeed({
    cursor: 2,
    notifications: [
      {
        notifId: 'n-1', crewId: '35459', type: 'info', createdUtc: '2026-10-01T02:54:56Z', title: 'Roster published',
        body: 'Your November roster is out.', status: 'unread', readUtc: null, seq: 1,
        relatedPairingId: null, relatedFlightId: null, relatedDutyId: null, discretionId: null, payload: null,
      },
      {
        notifId: 'n-2', crewId: '35459', type: 'flight_change', createdUtc: '2026-10-02T02:54:56Z', title: 'TG920 retimed',
        body: 'Departure now 23:15.', status: 'read', readUtc: '2026-10-02T03:00:00Z', seq: 2,
        relatedPairingId: null, relatedFlightId: null, relatedDutyId: null, discretionId: null, payload: null,
      },
    ] as never,
    openDiscretions: [PENDING],
  } as never));
  return store;
}
const withFull = (ui: React.ReactElement) => render(<Provider store={makeFullStore()}>{ui}</Provider>);

describe('PageShell — explainer beside the body (wide), one centred column (tall)', () => {
  it('uses the Duo side status strip without pushing the whole page downward', () => {
    asTall();
    mockInsets.current = { top: 96, right: 84, bottom: 21, left: 0 };
    const duo = withFull(<TimeZoneScreen />);
    expect(StyleSheet.flatten(duo.getByTestId('page-header').props.style).paddingTop).toBe(8);

    mockLayout.current = layoutFor(834, 1210);
    mockInsets.current = { top: 24, right: 0, bottom: 20, left: 0 };
    const ipad = withFull(<TimeZoneScreen />);
    expect(StyleSheet.flatten(ipad.getByTestId('page-header').props.style).paddingTop).toBe(32);
  });
  it('wide: the Time Zone explainer is the left column, the options the right', () => {
    asWide();
    const tree = withFull(<TimeZoneScreen />);
    expect(tree.getByTestId('page-columns')).toBeTruthy();
    expect(tree.getByTestId('timezone-legend-toggle')).toBeTruthy();
  });
  it('tall: one column, centred; phone: neither', () => {
    asTall();
    expect(withFull(<TimeZoneScreen />).getByTestId('page-centred')).toBeTruthy();
    asPhone();
    const phone = withFull(<TimeZoneScreen />);
    expect(phone.queryByTestId('page-columns')).toBeNull();
    expect(phone.queryByTestId('page-centred')).toBeNull();
  });
});

describe('Alerts', () => {
  it('wide: list | detail — the open decision is read on the right, a tapped alert replaces it', () => {
    asWide();
    const tree = withFull(<NotificationsScreen />);
    expect(tree.getByTestId('alerts-wide')).toBeTruthy();
    // The open FDP decision is the default detail; the list only names it.
    expect(tree.getByTestId('discretion-card')).toBeTruthy();
    expect(tree.getByTestId('btn-accept')).toBeTruthy();
    // Tapping an alert shows its full card in the detail pane (title now twice: row + detail).
    fireEvent.press(tree.getAllByTestId('notif-row')[0]);
    expect(tree.getAllByText('TG920 retimed')).toHaveLength(2);
    expect(tree.getByText('Departure now 23:15.')).toBeTruthy();
    expect(tree.queryByTestId('discretion-card')).toBeNull();
  });
  it('compact (phone): one list with the decision card inline, unchanged', () => {
    const tree = withFull(<NotificationsScreen />);
    expect(tree.queryByTestId('alerts-wide')).toBeNull();
    expect(tree.getByTestId('discretion-card')).toBeTruthy();
    expect(tree.getByText('Departure now 23:15.')).toBeTruthy();
  });
});

describe('Discretion card', () => {
  it('wide: figures | legs + decision; phone: stacked', () => {
    asWide();
    const wide = render(<DiscretionCard request={PENDING} palette={PALETTES.thai} onDecide={jest.fn()} />);
    expect(wide.getByTestId('disc-wide')).toBeTruthy();
    expect(wide.getByTestId('disc-legs')).toBeTruthy();
    expect(wide.getByTestId('btn-accept')).toBeTruthy();
    asPhone();
    const phone = render(<DiscretionCard request={PENDING} palette={PALETTES.thai} onDecide={jest.fn()} />);
    expect(phone.queryByTestId('disc-wide')).toBeNull();
    expect(phone.getByTestId('disc-legs')).toBeTruthy();
  });
});

describe('R’Bot', () => {
  it('wide: a context panel with the next duty and the chips beside the thread', () => {
    asWide();
    const tree = withFull(<RBotScreen />);
    expect(tree.getByTestId('rbot-context')).toBeTruthy();
    expect(tree.getByTestId('rbot-next-duty')).toBeTruthy();
    expect(tree.getByText('TG920 · BKK → LHR')).toBeTruthy();
    // Chips once — in the panel, not also in the welcome.
    expect(tree.getAllByTestId('rbot-suggestion-0')).toHaveLength(1);
  });
  it('compact (phone): no panel, chips in the welcome', () => {
    const tree = withFull(<RBotScreen />);
    expect(tree.queryByTestId('rbot-context')).toBeNull();
    expect(tree.getAllByTestId('rbot-suggestion-0')).toHaveLength(1);
  });
});

describe('Login airline picker', () => {
  const open = () => {
    const tree = render(
      <Provider store={configureStore({ reducer: { auth: authReducer, trips: tripsReducer, duties: dutiesReducer, settings: settingsReducer, notifications: notificationsReducer, alarms: alarmsReducer, meetings: meetingsReducer } })}>
        <LoginScreen navigation={{ navigate: jest.fn() } as never} route={{ key: 'Login', name: 'Login', params: undefined } as never} />
      </Provider>,
    );
    fireEvent.press(tree.getByTestId('airline-dropdown'));
    return tree;
  };
  // FlatList hands its testID to the inner scroll view, so the columns are read
  // off a row: a half-width row means two columns.
  const halfWidth = (style: unknown) => [style].flat(3).some(st => st && (st as { maxWidth?: string }).maxWidth === '50%');
  it('wide: two columns of airlines; phone: one', () => {
    asWide();
    expect(halfWidth(open().getByTestId('airline-EK').props.style)).toBe(true);
    asPhone();
    expect(halfWidth(open().getByTestId('airline-EK').props.style)).toBe(false);
  });
});

describe('Profile', () => {
  it('short Duo cover keeps compact account spacing beside the right rail', () => {
    mockLayout.current = layoutFor(466, 678);
    const cover = withFull(<ProfileScreen />);
    expect(StyleSheet.flatten(cover.getByTestId('profile-block-hours').props.style).marginTop).toBe(12);
    expect(StyleSheet.flatten(cover.getByTestId('profile-logout').props.style).marginTop).toBe(4);
    mockLayout.current = layoutFor(420, 912);
    const phone = withFull(<ProfileScreen />);
    expect(StyleSheet.flatten(phone.getByTestId('profile-block-hours').props.style).marginTop).toBe(26);
    expect(StyleSheet.flatten(phone.getByTestId('profile-logout').props.style).marginTop).toBe(26);
  });

  it.each([[834, 1210], [1210, 834], [1032, 1376]])('iPad %ix%i: smaller avatar and bounded settings panel', (width, height) => {
    mockLayout.current = layoutFor(width, height);
    const tree = withFull(<ProfileScreen />);
    expect(tree.UNSAFE_getAllByType(CrewAvatar)[0].props.size).toBe(64);
    expect(StyleSheet.flatten(tree.getByTestId('profile-wide').props.style)).toMatchObject({ flex: 0, maxWidth: 1040 });
    expect(StyleSheet.flatten(tree.getByTestId('profile-id-card').props.style)).toMatchObject({ flex: 0, flexDirection: 'row' });
    fireEvent.press(tree.getByTestId('profile-avatar'));
    expect(StyleSheet.flatten(tree.getByTestId('profile-avatar-picker').props.style).maxWidth).toBe(520);
  });

  it('wide Duo: menu stays left, selected settings open right, account actions live on the edge rail', () => {
    asWide();
    const tree = withFull(<ProfileScreen />);
    expect(tree.UNSAFE_getAllByType(CrewAvatar)[0].props.size).toBe(48);
    const wide = within(tree.getByTestId('profile-wide'));
    expect(wide.getByTestId('profile-menu')).toBeTruthy();
    expect(wide.getByTestId('profile-detail')).toBeTruthy();
    const rail = within(tree.getByTestId('profile-rail'));
    expect(StyleSheet.flatten(tree.getByTestId('profile-rail').props.style).position).toBe('absolute');
    expect(rail.getByTestId('profile-avatar')).toBeTruthy();
    expect(rail.getByTestId('profile-logout')).toBeTruthy();
    expect(rail.getByTestId('profile-block-hours')).toBeTruthy();
    expect(within(wide.getByTestId('profile-menu')).getByTestId('row-help')).toBeTruthy();
    expect(within(wide.getByTestId('profile-detail')).getByTestId('page-personal')).toBeTruthy();
    fireEvent.press(wide.getByTestId('row-timezone'));
    expect(within(wide.getByTestId('profile-detail')).getByTestId('page-timezone')).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalledWith('TimeZone');
    const grows = (style: unknown) => [style].flat(3).some(st => st && ((st as { flex?: number; flexGrow?: number }).flex === 1 || (st as { flexGrow?: number }).flexGrow === 1));
    // The page grows to the screen, while the selected detail owns its column.
    expect(grows(tree.getByTestId('profile-screen').props.contentContainerStyle)).toBe(true);
    expect(tree.queryByTestId('profile-id-card')).toBeNull();
    asPhone();
    const phone = withFull(<ProfileScreen />);
    expect(phone.UNSAFE_getAllByType(CrewAvatar)[0].props.size).toBe(80);
    expect(phone.queryByTestId('profile-wide')).toBeNull();
    expect(phone.queryByTestId('profile-id-card')).toBeNull();
    expect(grows(phone.getByTestId('profile-screen').props.contentContainerStyle)).toBe(false);
  });
  it('tall: one centred column; phone: plain', () => {
    asTall();
    expect(withFull(<ProfileScreen />).getByTestId('profile-tall')).toBeTruthy();
    asPhone();
    expect(withFull(<ProfileScreen />).queryByTestId('profile-tall')).toBeNull();
  });
});

describe('Route map', () => {
  const month = buildMonth(Y, M, [lhrTrip, sinTrip], [], [], 'airport', 'Asia/Bangkok', {}, NOW, { minutesBefore: 8, mutedIds: [] });
  it('wide: keeps the summary low and translucent so routes remain visible on the map', () => {
    asWide();
    const tree = render(<RouteMapView month={month} base="BKK" palette={PALETTES.light} />);
    const stats = tree.getByTestId('route-stats');
    const flat = (value: unknown) => StyleSheet.flatten(value as never) as Record<string, unknown>;
    expect(flat(stats.props.style).paddingVertical).toBe(8);
    expect(flat(stats.props.style).backgroundColor).toBe(PALETTES.light.mapPanel);
    expect(tree.queryByText(`${MON[M]} ${Y} summary`)).toBeNull();
    expect(flat(tree.getByTestId('route-stat-totals').props.style).marginTop).toBe(0);
    expect(flat(tree.getByTestId('route-stat-counts').props.style).marginTop).toBe(7);
    // The map now owns the whole content area: no separate destinations panel.
    expect(flat(tree.getByTestId('route-view').props.style).flex).toBe(1);
    expect(tree.queryByTestId('route-details')).toBeNull();
    asPhone();
  });
  it('Duo: the map fills the height the right rail frees; the phone keeps its dock clearance', () => {
    asWide();
    mockInsets.current = { top: 0, right: 84, bottom: 21, left: 0 };
    const duo = render(<RouteMapView month={month} base="BKK" palette={PALETTES.light} />);
    expect(StyleSheet.flatten(duo.getByTestId('route-view').props.style).paddingBottom).toBe(21);

    asPhone();
    mockInsets.current = { top: 0, right: 0, bottom: 0, left: 0 };
    const phone = render(<RouteMapView month={month} base="BKK" palette={PALETTES.light} />);
    expect(StyleSheet.flatten(phone.getByTestId('route-view').props.style).paddingBottom).toBe(110);
  });
  it('tall: seven stats on one row, and the map fills the available height', () => {
    asTall();
    const tree = render(<RouteMapView month={month} base="BKK" palette={PALETTES.thai} />);
    expect(tree.getByTestId('route-stat-row')).toBeTruthy();
    expect(tree.queryByTestId('route-stat-counts')).toBeNull();
    expect(tree.queryByTestId('route-grid')).toBeNull();
    expect(tree.getByTestId('route-svg').props.height).toBe('100%');
  });
  it('phone: the two-tier summary overlays the full-height map', () => {
    const tree = render(<RouteMapView month={month} base="BKK" palette={PALETTES.thai} />);
    expect(tree.getByTestId('route-stat-totals')).toBeTruthy();
    expect(tree.getByTestId('route-stat-counts')).toBeTruthy();
    expect(tree.queryByTestId('route-grid')).toBeNull();
    expect(tree.queryByTestId('route-details')).toBeNull();
    expect(tree.getByTestId('route-svg').props.height).toBe('100%');
  });
});

describe('Trip details', () => {
  const screen = () => withFull(<TripDetailsScreen route={{ key: 't', name: 'TripDetails', params: { tripId: 'pair-lhr' } } as never} navigation={{} as never} />);
  it('one timeline on tall, wide and phone; the calendar action stays reachable', () => {
    asTall();
    const tall = screen();
    expect(tall.getByTestId('trip-timeline')).toBeTruthy();
    expect(tall.getByTestId('trip-calendar-toggle')).toBeTruthy();
    expect(tall.queryByTestId('trip-tall-cards')).toBeNull();

    asWide();
    const wide = screen();
    expect(wide.getByTestId('trip-timeline')).toBeTruthy();
    expect(wide.getByTestId('trip-calendar-toggle')).toBeTruthy();

    asPhone();
    const phone = screen();
    expect(phone.getByTestId('trip-timeline')).toBeTruthy();
    expect(phone.getByTestId('trip-calendar-toggle')).toBeTruthy();
    expect(phone.queryByTestId('trip-tall-cards')).toBeNull();
  });
});
