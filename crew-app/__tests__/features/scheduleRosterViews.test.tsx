// Schedule tab ▸ Roster view (Ver11): the header menu swaps the tab between the
// Timeline list, the Calendar (grid + day timeline) and the Route map, and the
// Alerts entry point that used to live on the bell survives inside that menu.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { ScheduleScreen } from '../../src/features/v2/ScheduleScreen';
import { RouteMapView } from '../../src/features/v2/RouteMapView';
import { PALETTES } from '../../src/theme/carrier';
import { buildMonth } from '../../src/features/v2/model';
import settingsReducer from '../../src/features/settings/settingsSlice';
import tripsReducer, { setTrips } from '../../src/features/travel/tripsSlice';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import dutiesReducer from '../../src/features/roster/dutiesSlice';
import { setDuties } from '../../src/features/roster/dutiesSlice';
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

/** BKK → LHR on 19 Sep with the return on the 21st: one rotation, one layover,
 *  two destinations for the map. Times are real UTC for the local clock shown. */
const lhrTrip: Trip = {
  id: 'pair-lhr',
  crewId: '35459',
  checkInDateUTC: '19 Sep 2026 1400',
  legs: [
    {
      crewId: '35459', fltNumber: 'TG920', flightDateUTC: '19 Sep 2026 1545',
      depArp: 'BKK', arvDateUTC: '20 Sep 2026 0445', arvArp: 'LHR', fleet: 'Boeing 777-300',
      hotel: 'Hilton Heathrow', localDepTime: '2026-09-19 22:45', localArvTime: '2026-09-20 05:45',
      assignment: 'FLY',
    },
    {
      crewId: '35459', fltNumber: 'TG911', flightDateUTC: '21 Sep 2026 1030',
      depArp: 'LHR', arvDateUTC: '21 Sep 2026 2230', arvArp: 'BKK', fleet: 'Boeing 777-300',
      hotel: '', localDepTime: '2026-09-21 11:30', localArvTime: '2026-09-22 05:30',
      assignment: 'FLY',
    },
  ],
};

const sinTrip: Trip = {
  id: 'pair-sin',
  crewId: '35459',
  checkInDateUTC: '26 Sep 2026 1700',
  legs: [{
    crewId: '35459', fltNumber: 'TG403', flightDateUTC: '26 Sep 2026 1730',
    depArp: 'BKK', arvDateUTC: '26 Sep 2026 2000', arvArp: 'SIN', fleet: 'Airbus A350-900',
    hotel: '', localDepTime: '2026-09-27 00:30', localArvTime: '2026-09-27 04:00', assignment: 'FLY',
  }],
};

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
  store.dispatch(setTrips([lhrTrip, sinTrip]));
  return store;
}

/** Pin "now" inside September 2026 so the month under test is the open one. */
const NOW = new Date('2026-09-12T09:00:00Z');

function renderSchedule() {
  const store = makeStore();
  return render(
    <Provider store={store}>
      <ScheduleScreen />
    </Provider>,
  );
}

describe('Schedule tab · roster-view menu', () => {
  it('never prints a duty code twice on one card', () => {
    // PR's rosters label a duty with its own code ("X", "EXAM"), which used to
    // come out as the card title AND the note line underneath it.
    const duties: PortalDuty[] = [
      {
        id: 'pr-x', assignment: 'X', fltNum: '', dutyType: 'X',
        localStart: '2026-09-01 00:00', localEnd: '2026-09-01 23:59',
        startUTC: '01 Sep 2026 0000', endUTC: '01 Sep 2026 2359', briefStart: '', crewId: '433535',
        carrier: 'PR', baseOffsetMin: 480, airportCode: 'MNL', raw: {},
      },
      {
        id: 'pr-exam', assignment: 'EXAM', fltNum: '', dutyType: 'EXAM',
        localStart: '2026-09-02 02:00', localEnd: '2026-09-02 03:00',
        startUTC: '02 Sep 2026 0200', endUTC: '02 Sep 2026 0300', briefStart: '', crewId: '433535',
        carrier: 'PR', baseOffsetMin: 480, airportCode: 'MNL', raw: {},
      },
    ];
    const store = makeStore();
    store.dispatch(setDuties(duties));
    const tree = render(
      <Provider store={store}>
        <ScheduleScreen />
      </Provider>,
    );
    expect(tree.getAllByText('EXAM')).toHaveLength(1);
    expect(tree.getAllByText('X')).toHaveLength(1);
  });

  it('opens on the Timeline and offers the three views plus Alerts', () => {
    const tree = renderSchedule();
    expect(tree.getByTestId('sched-list')).toBeTruthy();
    expect(tree.queryByTestId('cal-grid')).toBeNull();
    expect(tree.queryByTestId('route-map')).toBeNull();

    fireEvent.press(tree.getByTestId('sched-view-menu'));
    expect(tree.getByTestId('sched-view-menu-panel')).toBeTruthy();
    expect(tree.getByText('Timeline')).toBeTruthy();
    expect(tree.getByText('Calendar')).toBeTruthy();
    expect(tree.getByText('Route map')).toBeTruthy();
    // The bell's old job: alerts stay reachable from this tab.
    expect(tree.getByTestId('sched-alerts')).toBeTruthy();

    fireEvent.press(tree.getByTestId('sched-alerts'));
    expect(mockNavigate).toHaveBeenCalledWith('Alerts');
  });

  it('switches to the Calendar and hides the timeline’s own controls', () => {
    const tree = renderSchedule();
    fireEvent.press(tree.getByTestId('sched-view-menu'));
    fireEvent.press(tree.getByTestId('sched-view-calendar'));

    expect(tree.getByTestId('cal-grid')).toBeTruthy();
    expect(tree.queryByTestId('sched-list')).toBeNull();
    // No date strip left underneath the calendar (the mock calls this out).
    expect(tree.queryByTestId('day-19')).toBeNull();
  });

  it('scopes the agenda to a tapped day and opens that day’s timeline', () => {
    const tree = renderSchedule();
    fireEvent.press(tree.getByTestId('sched-view-menu'));
    fireEvent.press(tree.getByTestId('sched-view-calendar'));
    // Opens on the day the Timeline list would open on (12 Sep is a blank roster
    // day here, so the focus is the next duty: 19 Sep).
    expect(tree.getByTestId('cal-agenda-head').props.children).toBe('SAT 19 SEP');
    expect(tree.getByTestId('cal-row-flight-20260919-TG920')).toBeTruthy();
    expect(tree.queryByTestId('cal-row-flight-20260927-TG403')).toBeNull();

    // Another day scopes to that day…
    fireEvent.press(tree.getByTestId('cal-day-27'));
    expect(tree.getByTestId('cal-agenda-head').props.children).toBe('SUN 27 SEP');
    expect(tree.getByTestId('cal-row-flight-20260927-TG403')).toBeTruthy();
    expect(tree.queryByTestId('cal-row-flight-20260919-TG920')).toBeNull();
    // …and tapping the selected day clears back to the whole month.
    fireEvent.press(tree.getByTestId('cal-day-27'));
    expect(tree.getByTestId('cal-agenda-head').props.children).toBe('MONTH');
    expect(tree.getByTestId('cal-row-flight-20260919-TG920')).toBeTruthy();

    fireEvent.press(tree.getByTestId('cal-day-19'));
    fireEvent.press(tree.getByTestId('cal-to-detail'));
    expect(tree.getByTestId('cal-timeline')).toBeTruthy();
    expect(tree.getByTestId('cal-block-duty-pair-lhr')).toBeTruthy();

    // A rest day inside the layover is a chip, not a full-height block on an
    // empty hour grid — reached the way a crew would: grid → agenda row.
    fireEvent.press(tree.getByTestId('cal-to-compact'));
    fireEvent.press(tree.getByTestId('cal-day-20'));
    fireEvent.press(tree.getByTestId('cal-row-layover-20260920'));
    expect(tree.getByTestId('cal-allday-layover-20260920')).toBeTruthy();
    expect(tree.queryByTestId('cal-timeline')).toBeNull();
  });

  it('switches to the Route map and keeps the timeline list unmounted', () => {
    const tree = renderSchedule();
    fireEvent.press(tree.getByTestId('sched-view-menu'));
    fireEvent.press(tree.getByTestId('sched-view-route'));

    expect(tree.getByTestId('route-map')).toBeTruthy();
    expect(tree.getByTestId('route-stats')).toBeTruthy();
    expect(tree.queryByTestId('sched-list')).toBeNull();
    expect(tree.getByTestId('route-LHR')).toBeTruthy();
  });

  it('dismisses the menu on an outside tap', () => {
    const tree = renderSchedule();
    fireEvent.press(tree.getByTestId('sched-view-menu'));
    fireEvent.press(tree.getByTestId('sched-view-menu-backdrop'));
    expect(tree.queryByTestId('sched-view-menu-panel')).toBeNull();
  });
});

describe('Route map view', () => {
  const month = buildMonth(
    2026, 8, [lhrTrip, sinTrip], [], [],
    'airport', 'Asia/Bangkok', {}, NOW, { minutesBefore: 8, mutedIds: [] },
  );

  it('summarises the month and lists every destination reached from base', () => {
    const tree = render(
      <RouteMapView month={month} base="BKK" palette={PALETTES.thai} />,
    );
    expect(tree.getByText('Sep 2026 summary')).toBeTruthy();
    expect(tree.getAllByText('Routes').length).toBeGreaterThan(0);
    expect(tree.getByText('Airports')).toBeTruthy();
    expect(tree.getByText('Countries')).toBeTruthy();
    expect(tree.getByTestId('route-LHR')).toBeTruthy();
    expect(tree.getByTestId('route-SIN')).toBeTruthy();
    // One line per destination from base — the return leg does not add a second
    // London row.
    expect(tree.getAllByText('BKK → LHR')).toHaveLength(1);
  });

  it('zooms the map and highlights a selected destination', () => {
    const tree = render(
      <RouteMapView month={month} base="BKK" palette={PALETTES.thai} />,
    );
    // Zoom controls are live (the maths behind them is unit-tested in
    // schedRosterViews.test.ts) …
    act(() => {
      fireEvent.press(tree.getByTestId('route-zoom-in'));
      fireEvent.press(tree.getByTestId('route-zoom-in'));
      fireEvent.press(tree.getByTestId('route-zoom-out'));
    });
    // … and tapping a route names that city on the map.
    expect(tree.queryByText(/^LHR ·/)).toBeNull();
    fireEvent.press(tree.getByTestId('route-LHR'));
    expect(tree.getByText(/^LHR · .* km · \d leg/)).toBeTruthy();
  });

  it('says so plainly when the month has nothing to map', () => {
    const empty = buildMonth(
      2026, 8, [], [], [], 'airport', 'Asia/Bangkok', {}, NOW, { minutesBefore: 8, mutedIds: [] },
    );
    const tree = render(<RouteMapView month={empty} base="BKK" palette={PALETTES.thai} />);
    expect(tree.getByTestId('route-empty')).toBeTruthy();
    expect(tree.queryByTestId('route-map')).toBeNull();
  });
});
