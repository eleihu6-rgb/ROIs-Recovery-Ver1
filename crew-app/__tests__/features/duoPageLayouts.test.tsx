// iPhone Duo — a layout per page, designed from the page's content
// (docs/superpowers/specs/2026-10-07-crew-app-duo-per-page-layouts-design.md).
//
// `wide` = the unfolded inner screen in landscape (951x669), `tall` = the same
// screen rotated (669x951). The window is pinned to a regular iPhone in
// jest.setup.js, so each case mocks `useLayout` for the class under test, and
// the compact cases prove the phone layout is untouched.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { ScheduleScreen } from '../../src/features/v2/ScheduleScreen';
import { HomeScreen } from '../../src/features/v2/HomeScreen';
import { DestinationScreen } from '../../src/features/v2/DestinationScreen';
import { buildMonth, MON } from '../../src/features/v2/model';
import { daySummary } from '../../src/features/v2/schedView';
import { layoutFor } from '../../src/components/v2/useLayout';
import settingsReducer from '../../src/features/settings/settingsSlice';
import tripsReducer, { setTrips } from '../../src/features/travel/tripsSlice';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import dutiesReducer, { setDuties } from '../../src/features/roster/dutiesSlice';
import meetingsReducer from '../../src/features/meetings/meetingsSlice';
import notificationsReducer from '../../src/features/notifications/notificationsSlice';
import flightCalendarReducer from '../../src/features/calendar/flightCalendarSlice';
import type { Trip } from '../../src/features/travel/tripCsv';
import type { PortalDuty } from '../../src/features/travel/portalCapture';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
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

const withStore = (ui: React.ReactElement) => render(<Provider store={makeStore()}>{ui}</Provider>);

/** Schedule opens on this month; the fixtures live in the next one. The screen
 *  re-seats its focused day on a short timer after the month rolls, so wait for it. */
async function openNextMonth(tree: ReturnType<typeof render>) {
  fireEvent.press(tree.getByTestId('sched-next-month'));
  await act(async () => { await new Promise(r => setTimeout(r, 80)); });
}

beforeEach(() => {
  jest.clearAllMocks();
  asPhone();
});

describe('daySummary — one line per day for the master list', () => {
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

describe('Schedule ▸ Timeline', () => {
  it('wide: master day list beside the selected day’s card, no horizontal strip', async () => {
    asWide();
    const tree = withStore(<ScheduleScreen />);
    await openNextMonth(tree);
    expect(tree.getByTestId('sched-master')).toBeTruthy();
    expect(tree.queryByTestId('sched-list')).toBeNull();
    // A month with no "today" opens on the 1st — a blank day, which says so
    // instead of showing some other day's card.
    expect(tree.getByText(/^Nothing published on/)).toBeTruthy();
    // Tapping a day in the master list fills the detail pane with its card(s) …
    fireEvent.press(tree.getByTestId('day-5'));
    expect(tree.getByTestId('day-card-5')).toBeTruthy();
    // … and another day swaps it.
    fireEvent.press(tree.getByTestId('day-7'));
    expect(tree.getByTestId('duty-TG920')).toBeTruthy();
    expect(tree.queryByTestId('day-card-5')).toBeNull();
  });

  it('compact (phone): the date strip and the scrolling list, unchanged', async () => {
    const tree = withStore(<ScheduleScreen />);
    await openNextMonth(tree);
    expect(tree.getByTestId('sched-list')).toBeTruthy();
    expect(tree.queryByTestId('sched-master')).toBeNull();
    expect(tree.getByTestId('day-7')).toBeTruthy();
  });
});

describe('Schedule ▸ Calendar', () => {
  const openCalendar = async (tree: ReturnType<typeof render>) => {
    await openNextMonth(tree);
    fireEvent.press(tree.getByTestId('sched-view-menu'));
    fireEvent.press(tree.getByTestId('sched-view-calendar'));
  };

  it('wide: month grid | the tapped day’s agenda and hour timeline, in one view', async () => {
    asWide();
    const tree = withStore(<ScheduleScreen />);
    await openCalendar(tree);
    expect(tree.getByTestId('cal-wide')).toBeTruthy();
    expect(tree.getByTestId('cal-grid')).toBeTruthy();
    expect(tree.queryByTestId('cal-to-detail')).toBeNull(); // no grid⇄timeline switch to make
    fireEvent.press(tree.getByTestId('cal-day-7'));
    expect(tree.getByTestId('cal-agenda-head').props.children).toMatch(/ 7 /);
    expect(tree.getByTestId('cal-day-pane')).toBeTruthy();
    expect(tree.getByTestId('cal-timeline')).toBeTruthy();
    expect(tree.getByTestId('cal-block-duty-pair-lhr')).toBeTruthy();
    // An agenda row selects its day (the layover) — still the same view.
    fireEvent.press(tree.getByTestId('cal-day-8'));
    expect(tree.getByTestId('cal-allday-layover-' + `${Y}${String(M + 1).padStart(2, '0')}08`)).toBeTruthy();
    expect(tree.queryByTestId('cal-timeline')).toBeNull();
    expect(tree.getByTestId('cal-wide')).toBeTruthy();
  });

  it('tall: the grid’s cells are square; compact keeps the flat cells', async () => {
    asTall();
    const tall = withStore(<ScheduleScreen />);
    await openCalendar(tall);
    const flat = (style: unknown) => [style].flat(3).some(s => s && (s as { aspectRatio?: number }).aspectRatio === 1);
    expect(flat(tall.getByTestId('cal-day-7').props.style)).toBe(true);
    expect(tall.queryByTestId('cal-wide')).toBeNull();

    asPhone();
    const phone = withStore(<ScheduleScreen />);
    await openCalendar(phone);
    expect(flat(phone.getByTestId('cal-day-7').props.style)).toBe(false);
    expect(phone.getByTestId('cal-to-detail')).toBeTruthy();
  });
});

describe('Home', () => {
  it('tall: the rotation sits inside the ticket and destinations form a grid', () => {
    asTall();
    const tree = withStore(<HomeScreen />);
    expect(tree.getByTestId('home-next-trip')).toBeTruthy();
    expect(tree.getByTestId('home-rotation')).toBeTruthy();
    expect(tree.getByText('LHR → BKK')).toBeTruthy(); // the return leg, not just the first
    expect(tree.getByTestId('home-dest-grid')).toBeTruthy();
  });

  it('wide: the rotation is its own card under the ticket', () => {
    asWide();
    const tree = withStore(<HomeScreen />);
    expect(tree.getByTestId('home-rotation')).toBeTruthy();
    expect(tree.queryByTestId('home-dest-grid')).toBeNull();
  });

  it('compact (phone): no rotation list, destinations as the horizontal strip', () => {
    const tree = withStore(<HomeScreen />);
    expect(tree.getByTestId('home-next-trip')).toBeTruthy();
    expect(tree.queryByTestId('home-rotation')).toBeNull();
    expect(tree.queryByTestId('home-dest-grid')).toBeNull();
  });
});

describe('Destination', () => {
  const screen = () => withStore(<DestinationScreen route={{ key: 'd', name: 'Destination', params: { index: 0 } }} navigation={{} as never} />);

  it('wide: photo pane (55 %) | info card; nothing written over the picture', () => {
    asWide();
    const tree = screen();
    const pane = tree.getByTestId('dest-photo-pane-wide');
    expect(pane.props.style.width).toBe(Math.round(951 * 0.55));
    expect(pane.props.style.height).toBe(669);
    expect(tree.getByTestId('dest-city')).toBeTruthy();
    expect(tree.queryByTestId('dest-split')).toBeNull();
  });

  it('tall: photo on the top half, hotel and transfer side by side below', () => {
    asTall();
    const tree = screen();
    const pane = tree.getByTestId('dest-photo-pane-tall');
    expect(pane.props.style.width).toBe(669);
    expect(pane.props.style.height).toBe(Math.round(951 * 0.5));
    expect(tree.getByTestId('dest-split')).toBeTruthy();
  });

  it('compact (phone): the full-window pager with the type on the photo', () => {
    const tree = screen();
    expect(tree.queryByTestId('dest-photo-pane-wide')).toBeNull();
    expect(tree.queryByTestId('dest-photo-pane-tall')).toBeNull();
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
  it('tall: one centred column; phone: plain', () => {
    asTall();
    expect(withFull(<ProfileScreen />).getByTestId('profile-tall')).toBeTruthy();
    asPhone();
    expect(withFull(<ProfileScreen />).queryByTestId('profile-tall')).toBeNull();
  });
});

describe('Route map', () => {
  const month = buildMonth(Y, M, [lhrTrip, sinTrip], [], [], 'airport', 'Asia/Bangkok', {}, NOW, { minutesBefore: 8, mutedIds: [] });
  it('tall: seven stats on one row, routes in two columns, a taller map', () => {
    asTall();
    const tree = render(<RouteMapView month={month} base="BKK" palette={PALETTES.thai} />);
    expect(tree.getByTestId('route-stat-row')).toBeTruthy();
    expect(tree.queryByTestId('route-stat-counts')).toBeNull();
    expect(tree.getByTestId('route-grid')).toBeTruthy();
    expect(tree.getByTestId('route-svg').props.height).toBe(Math.round((669 - 44) * 0.62));
  });
  it('phone: the two-tier stats and the single-column routes, 240pt map', () => {
    const tree = render(<RouteMapView month={month} base="BKK" palette={PALETTES.thai} />);
    expect(tree.getByTestId('route-stat-totals')).toBeTruthy();
    expect(tree.getByTestId('route-stat-counts')).toBeTruthy();
    expect(tree.queryByTestId('route-grid')).toBeNull();
    expect(tree.getByTestId('route-svg').props.height).toBe(240);
  });
});

describe('Trip details', () => {
  const screen = () => withFull(<TripDetailsScreen route={{ key: 't', name: 'TripDetails', params: { tripId: 'pair-lhr' } } as never} navigation={{} as never} />);
  it('tall: calendar and hotel cards side by side under the hero; phone: stacked', () => {
    asTall();
    const tall = screen();
    expect(tall.getByTestId('trip-tall-cards')).toBeTruthy();
    expect(tall.getByTestId('trip-calendar-toggle')).toBeTruthy();
    asPhone();
    expect(screen().queryByTestId('trip-tall-cards')).toBeNull();
  });
});
