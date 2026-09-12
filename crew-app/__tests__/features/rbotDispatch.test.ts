// R'Bot's "hands": every action type must land on the real nav/store call, and
// anything the phone cannot do must come back as null (no fake success chip).
//
// Uses a real Redux store (not a dispatch mock) so the alarm/setting assertions
// check the state a crew actually ends up with, not that a thunk was created.
import { configureStore } from '@reduxjs/toolkit';

import {
  avatarIndexFromValue,
  dispatchCrewAction,
  themeFromValue,
  type RbotDispatchDeps,
} from '../../src/features/rbot/dispatch-crew-action';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import settingsReducer from '../../src/features/settings/settingsSlice';
import tripsReducer, { setTrips } from '../../src/features/travel/tripsSlice';
import type { Trip } from '../../src/features/travel/tripCsv';
import type { RbotAction } from '../../src/features/rbot/types';

const NOW = new Date('2026-09-11T09:00:00Z');

const futureTrip: Trip = {
  id: 'pair-1',
  crewId: '35459',
  checkInDateUTC: '20 Sep 2026 0600',
  legs: [{
    crewId: '35459', fltNumber: 'TG920', flightDateUTC: '20 Sep 2026 0730',
    depArp: 'BKK', arvDateUTC: '20 Sep 2026 1400', arvArp: 'LHR', fleet: '77W',
    hotel: '', localDepTime: '2026-09-20 14:30', localArvTime: '2026-09-20 21:00',
    assignment: 'FLY',
  }],
};

function makeStore(trips: Trip[] = []) {
  const store = configureStore({
    reducer: {alarms: alarmsReducer, settings: settingsReducer, trips: tripsReducer},
    middleware: getDefaultMiddleware => getDefaultMiddleware({serializableCheck: false}),
  });
  if (trips.length) store.dispatch(setTrips(trips));
  return store;
}

function deps(store = makeStore()) {
  const navigate = jest.fn();
  const d: RbotDispatchDeps = {
    navigation: {navigate, goBack: jest.fn()} as unknown as RbotDispatchDeps['navigation'],
    dispatch: store.dispatch as unknown as RbotDispatchDeps['dispatch'],
    getState: store.getState as unknown as RbotDispatchDeps['getState'],
    now: NOW,
  };
  return {d, navigate, store};
}

/** The (name, params) of every navigation the dispatcher performed. */
function calls(navigate: jest.Mock): unknown[][] {
  return navigate.mock.calls.map(c => c as unknown[]);
}

describe("R'Bot navigation actions", () => {
  it('opens a roster view on the Schedule tab', async () => {
    const {d, navigate} = deps();
    const label = await dispatchCrewAction({type: 'navigate', target: 'route_map'}, d);
    expect(calls(navigate)).toEqual([['Tabs', {
      screen: 'Schedule',
      params: {view: 'route', viewAt: expect.any(Number)},
    }]]);
    expect(label).toBe('Opened your route map');
  });

  it('opens the calendar and the plain schedule', async () => {
    const {d, navigate} = deps();
    await dispatchCrewAction({type: 'navigate', target: 'roster_calendar'}, d);
    expect(calls(navigate)).toEqual([['Tabs', {
      screen: 'Schedule',
      params: {view: 'calendar-compact', viewAt: expect.any(Number)},
    }]]);

    const plain = deps();
    await dispatchCrewAction({type: 'navigate', target: 'schedule'}, plain.d);
    expect(calls(plain.navigate)).toEqual([['Tabs', {
      screen: 'Schedule',
      params: {view: 'timeline'},
    }]]);
  });

  it('routes the plain screens onto their stack routes', async () => {
    const routes: Array<[string, unknown[]]> = [
      ['alerts', ['Alerts']],
      ['upcoming_alarms', ['UpcomingAlarms']],
      ['alarm_settings', ['AlarmsSettings']],
      ['time_zone', ['TimeZone']],
      ['preferences', ['Preferences']],
      ['appearance', ['Appearance']],
      ['personal_info', ['PersonalInfo']],
      ['help', ['Spec', {id: 'help'}]],
      ['absence', ['Spec', {id: 'absence'}]],
      ['home', ['Tabs', {screen: 'Home'}]],
      ['explore', ['Tabs', {screen: 'Home'}]],
      ['profile', ['Tabs', {screen: 'Profile'}]],
      ['global', ['Tabs', {screen: 'Global'}]],
    ];
    for (const [target, expected] of routes) {
      const {d, navigate} = deps();
      await dispatchCrewAction({type: 'navigate', target: target as never}, d);
      expect(calls(navigate)).toEqual([expected]);
    }
  });

  it('opens the next trip, and reports nothing when the roster is empty', async () => {
    const withTrip = deps(makeStore([futureTrip]));
    const label = await dispatchCrewAction({type: 'navigate', target: 'next_trip'}, withTrip.d);
    expect(calls(withTrip.navigate)).toEqual([['TripDetails', {tripId: 'pair-1'}]]);
    expect(label).toBe('Opened that trip');

    const empty = deps();
    expect(await dispatchCrewAction({type: 'navigate', target: 'next_trip'}, empty.d)).toBeNull();
    expect(empty.navigate).not.toHaveBeenCalled();
  });

  it('honours an explicit trip id the crew named, and ignores an unknown one', async () => {
    const named = deps(makeStore([futureTrip]));
    await dispatchCrewAction({type: 'navigate', target: 'trip_details', tripId: 'pair-1'}, named.d);
    expect(calls(named.navigate)).toEqual([['TripDetails', {tripId: 'pair-1'}]]);

    const other = deps(makeStore([futureTrip]));
    expect(await dispatchCrewAction({type: 'navigate', target: 'trip_details', tripId: 'nope'}, other.d)).toBeNull();
    expect(other.navigate).not.toHaveBeenCalled();
  });
});

describe("R'Bot absence request", () => {
  it('opens the pre-filled form instead of submitting anything', async () => {
    const {d, navigate, store} = deps();
    const before = store.getState();
    const label = await dispatchCrewAction({
      type: 'request_absence', fromDate: '2026-09-14', toDate: '2026-09-15', note: 'flu',
    }, d);
    expect(calls(navigate)).toEqual([['Spec', {
      id: 'absence', absenceFrom: '2026-09-14', absenceTo: '2026-09-15', absenceNote: 'flu',
    }]]);
    // Nothing was written: the crew still presses Submit on the form.
    expect(store.getState()).toBe(before);
    expect(label).toMatch(/review and submit/i);
  });
});

describe("R'Bot alarm actions", () => {
  it('enables alarms and persists the switch', async () => {
    const {d, store} = deps();
    const label = await dispatchCrewAction({type: 'set_alarm', action: 'enable'}, d);
    expect(store.getState().alarms.enabled).toBe(true);
    expect(label).toBe('Alarms on');
  });

  it('turns alarms off', async () => {
    const {d, store} = deps();
    await dispatchCrewAction({type: 'set_alarm', action: 'enable'}, d);
    await dispatchCrewAction({type: 'set_alarm', action: 'disable'}, d);
    expect(store.getState().alarms.enabled).toBe(false);
  });

  it('applies offsets, keeping the untouched one', async () => {
    const {d, store} = deps();
    const untouched = store.getState().alarms.leaveHomeHours;
    await dispatchCrewAction({type: 'set_alarm', action: 'set_offsets', wakeUpHours: 4}, d);
    expect(store.getState().alarms.wakeUpHours).toBe(4);
    expect(store.getState().alarms.leaveHomeHours).toBe(untouched);
  });

  it('refuses an offsets call with no offsets and a negative offset', async () => {
    const empty = deps();
    const before = empty.store.getState().alarms.wakeUpHours;
    expect(await dispatchCrewAction({type: 'set_alarm', action: 'set_offsets'}, empty.d)).toBeNull();
    expect(empty.store.getState().alarms.wakeUpHours).toBe(before);

    expect(await dispatchCrewAction({type: 'set_alarm', action: 'set_offsets', wakeUpHours: -3}, empty.d)).toBeNull();
    expect(empty.store.getState().alarms.wakeUpHours).toBe(before);
  });

  it('sets the agenda filter', async () => {
    const {d, store} = deps();
    await dispatchCrewAction({type: 'set_alarm', action: 'set_agenda_filter', filter: 'work'}, d);
    expect(store.getState().alarms.agendaFilter).toBe('work');
  });
});

describe("R'Bot setting actions", () => {
  it('maps a colour word to a theme preset', async () => {
    const {d, store} = deps();
    await dispatchCrewAction({type: 'change_setting', setting: 'theme', value: 'purple'}, d);
    expect(store.getState().settings.themePreset).toBe('thai');

    expect(themeFromValue('emerald')).toBe('emerald');
    expect(themeFromValue('Reference blue')).toBe('sia');
    expect(themeFromValue('Graphite')).toBe('graphite');
    expect(themeFromValue(0)).toBe('sia');
    expect(themeFromValue('chartreuse')).toBeNull();
  });

  it('accepts a time-zone mode, including the phone-local alias', async () => {
    const {d, store} = deps();
    await dispatchCrewAction({type: 'change_setting', setting: 'time_zone_mode', value: 'phone'}, d);
    expect(store.getState().settings.timeZoneMode).toBe('device');

    const bad = deps();
    expect(await dispatchCrewAction({type: 'change_setting', setting: 'time_zone_mode', value: 'mars'}, bad.d)).toBeNull();
    expect(bad.store.getState().settings.timeZoneMode).toBe('airport');
  });

  it('maps an avatar by name and rejects an unknown one', async () => {
    expect(avatarIndexFromValue('the fox one')).toBe(4);
    expect(avatarIndexFromValue(7)).toBe(7);
    expect(avatarIndexFromValue('dragon')).toBeNull();

    const {d, store} = deps();
    await dispatchCrewAction({type: 'change_setting', setting: 'avatar', value: 'owl'}, d);
    expect(store.getState().settings.avatarIndex).toBe(6);
  });

  it('normalizes explore interests and refuses an empty list', async () => {
    const {d, store} = deps();
    await dispatchCrewAction({type: 'change_setting', setting: 'explore_interests', value: [' Food ', 'Beach']}, d);
    expect(store.getState().settings.explorePrefs).toEqual(['food', 'beach']);

    const bad = deps();
    expect(await dispatchCrewAction({type: 'change_setting', setting: 'explore_interests', value: []}, bad.d)).toBeNull();
  });
});
