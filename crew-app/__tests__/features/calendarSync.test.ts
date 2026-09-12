// Profile ▸ Preferences ▸ "iOS Calendar sync" (option B): the master switch that
// keeps every upcoming duty in the iPhone calendar, on top of the per-duty icon.
import { configureStore } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';

import flightCalendarReducer, {
  loadFlightCalendar,
  setCalendarSyncAll,
  topUpCalendarSync,
  toggleDutyCalendar,
} from '../../src/features/calendar/flightCalendarSlice';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import tripsReducer, { setTrips } from '../../src/features/travel/tripsSlice';
import type { Trip, TripLeg } from '../../src/features/travel/tripCsv';

let seq = 0;
const mockRequestAccess = jest.fn(async () => 'authorized' as 'authorized' | 'denied');
const mockSaveEvents = jest.fn(async (events: unknown[]) =>
  events.map(() => `ev-${++seq}`));
const mockRemoveEvents = jest.fn(async (ids: string[]) => ids.length);

jest.mock('../../src/features/meetings/calendarModule', () => ({
  isCalendarAvailable: () => true,
  isCalendarWriteAvailable: () => true,
  requestCalendarAccess: () => mockRequestAccess(),
  saveCalendarEvents: (events: unknown[]) => mockSaveEvents(events),
  removeCalendarEvents: (ids: string[]) => mockRemoveEvents(ids),
  fetchMeetings: async () => [],
  saveBackgroundConfig: async () => {},
}));

const leg = (over: Partial<TripLeg> = {}): TripLeg => ({
  crewId: '35459',
  fltNumber: 'TG100',
  flightDateUTC: '20 Sep 2026 1000',
  depArp: 'BKK',
  arvDateUTC: '20 Sep 2026 1400',
  arvArp: 'SIN',
  fleet: '777',
  hotel: '',
  ...over,
});

const trip = (id: string, dep: string, legs = 1): Trip => ({
  id,
  crewId: '35459',
  checkInDateUTC: dep,
  legs: Array.from({ length: legs }, (_, i) =>
    leg({
      fltNumber: `TG10${i}`,
      flightDateUTC: dep,
      arvDateUTC: dep.replace(/ (\d{4})$/, (_, t) => ` ${Number(t) + 300}`),
      depArp: i % 2 ? 'SIN' : 'BKK',
      arvArp: i % 2 ? 'BKK' : 'SIN',
    }),
  ),
});

/** 20 & 25 Sep are inside the 60-day horizon; 1 Sep has flown and 20 Dec is far. */
const soon = trip('soon-1', '20 Sep 2026 1000', 2);
const soon2 = trip('soon-2', '25 Sep 2026 0700');
const flown = trip('flown', '01 Sep 2026 1000');
const farAway = trip('far', '20 Dec 2026 1000');

function makeStore() {
  const store = configureStore({
    reducer: {
      alarms: alarmsReducer,
      trips: tripsReducer,
      flightCalendar: flightCalendarReducer,
    },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setTrips([soon, soon2, flown, farAway]));
  return store;
}

beforeEach(async () => {
  seq = 0;
  jest.clearAllMocks();
  // The AsyncStorage mock is one in-memory store shared by the whole file.
  await AsyncStorage.clear();
});

describe('setCalendarSyncAll — on', () => {
  it('writes every upcoming duty inside the horizon, and nothing else', async () => {
    const store = makeStore();
    const result = await store.dispatch(setCalendarSyncAll(true) as any);

    expect(result.status).toBe('enabled');
    // Two duties: 5 entries for the two-leg duty, 4 for the single-leg one.
    expect(result.duties).toBe(2);
    expect(result.added).toBe(9);
    expect(Object.keys(store.getState().flightCalendar.eventIds).sort()).toEqual(['soon-1', 'soon-2']);
    expect(store.getState().flightCalendar.syncAll).toBe(true);
  });

  it('never writes a duty twice — the crew’s own icon-add is left alone', async () => {
    const store = makeStore();
    await store.dispatch(toggleDutyCalendar(soon) as any);
    const before = mockSaveEvents.mock.calls.length;

    const result = await store.dispatch(setCalendarSyncAll(true) as any);

    expect(result.duties).toBe(1); // only soon-2 was missing
    expect(mockSaveEvents).toHaveBeenCalledTimes(before + 1);
    expect(store.getState().flightCalendar.eventIds['soon-1']).toHaveLength(5);
  });

  it('reports "already in sync" when the calendar matches the roster', async () => {
    const store = makeStore();
    await store.dispatch(setCalendarSyncAll(true) as any);
    const result = await store.dispatch(setCalendarSyncAll(true) as any);

    expect(result.status).toBe('in-sync');
    expect(result.added).toBe(0);
  });

  it('stays off when the crew denies calendar access', async () => {
    mockRequestAccess.mockResolvedValueOnce('denied');
    const store = makeStore();
    const result = await store.dispatch(setCalendarSyncAll(true) as any);

    expect(result.status).toBe('denied');
    expect(store.getState().flightCalendar.syncAll).toBe(false);
    expect(mockSaveEvents).not.toHaveBeenCalled();
  });
});

describe('setCalendarSyncAll — off', () => {
  it('removes exactly what it wrote and forgets the map', async () => {
    const store = makeStore();
    await store.dispatch(setCalendarSyncAll(true) as any);
    const ids = Object.values(store.getState().flightCalendar.eventIds).flat();

    const result = await store.dispatch(setCalendarSyncAll(false) as any);

    expect(result.status).toBe('disabled');
    expect(result.removed).toBe(9);
    expect(mockRemoveEvents).toHaveBeenCalledWith(ids);
    expect(store.getState().flightCalendar.eventIds).toEqual({});
    expect(store.getState().flightCalendar.syncAll).toBe(false);
  });
});

describe('topUpCalendarSync — the launch / roster-refresh top-up', () => {
  it('stays silent before hydration — an empty map would duplicate the calendar', async () => {
    const store = makeStore();
    await store.dispatch(setCalendarSyncAll(true) as any);
    mockSaveEvents.mockClear();

    const result = await store.dispatch(topUpCalendarSync() as any);

    expect(result).toBeNull();
    expect(mockSaveEvents).not.toHaveBeenCalled();
  });

  it('stays silent when the switch is off', async () => {
    const store = makeStore();
    await store.dispatch(loadFlightCalendar() as any);
    expect(await store.dispatch(topUpCalendarSync() as any)).toBeNull();
  });

  it('re-adds a duty the crew removed from the calendar by hand', async () => {
    const store = makeStore();
    await store.dispatch(loadFlightCalendar() as any); // hydrated
    await store.dispatch(setCalendarSyncAll(true) as any);
    await store.dispatch(toggleDutyCalendar(soon2) as any); // tap the icon again → removed
    mockSaveEvents.mockClear();

    const result = await store.dispatch(topUpCalendarSync() as any);

    expect(result?.added).toBe(4);
    expect(store.getState().flightCalendar.eventIds['soon-2']).toHaveLength(4);
  });

  it('adds a duty that appears in a later roster, and only that one', async () => {
    const store = makeStore();
    await store.dispatch(loadFlightCalendar() as any);
    await store.dispatch(setCalendarSyncAll(true) as any);
    const newDuty = trip('later', '28 Sep 2026 0600');
    store.dispatch(setTrips([soon, soon2, flown, farAway, newDuty]));
    mockSaveEvents.mockClear();

    await store.dispatch(topUpCalendarSync() as any);

    expect(mockSaveEvents).toHaveBeenCalledTimes(1);
    expect(store.getState().flightCalendar.eventIds['later']).toBeDefined();
  });
});

describe('loadFlightCalendar — persistence', () => {
  it('restores the switch and the written map, and marks hydration done', async () => {
    const first = makeStore();
    await first.dispatch(setCalendarSyncAll(true) as any);

    const second = makeStore(); // fresh store, same (mocked) storage
    await second.dispatch(loadFlightCalendar() as any);

    const state = second.getState().flightCalendar;
    expect(state.hydrated).toBe(true);
    expect(state.syncAll).toBe(true);
    expect(Object.keys(state.eventIds).sort()).toEqual(['soon-1', 'soon-2']);
  });
});
