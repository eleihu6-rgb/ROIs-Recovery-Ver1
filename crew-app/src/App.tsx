import React, { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider } from 'react-redux';
import { store, useAppDispatch, useAppSelector } from './store';
import { RootNavigator } from './navigation/RootNavigator';
import { loadAuthSession } from './features/auth/authSlice';
import { setTrips } from './features/travel/tripsSlice';
import { loadTrips, saveTrips } from './features/travel/tripsPersistence';
import { setDuties, loadDuties } from './features/roster/dutiesSlice';
import { loadSettings } from './features/settings/settingsSlice';
import { loadEnabled } from './features/alarms/alarmsSlice';
import { loadMeetingsSettings, syncMeetings } from './features/meetings/meetingsSlice';
import { loadFlightCalendar } from './features/calendar/flightCalendarSlice';
import { loadTripTrade } from './features/tripTrade/tripTradeSlice';
import { login } from './features/auth/authSlice';
import type { Trip } from './features/travel/tripCsv';

// Dev-only seeding for simulator visual testing (gated). OFF for normal bootstrap
// so real hydration/login/persistence/empty-state behaviour is exercised. Flip to
// `__DEV__ && true` locally when you need seeded trips in the simulator.
// Gated with __DEV__ so a release build can NEVER seed demo data, even if the
// trailing boolean is flipped true by a local edit (enhance-Ver5 #1).
const DEV_SEED = __DEV__ && false;
const SEED_TRIPS: Trip[] = [
  // Upcoming layover (14–16 Jun) — Chitose. Drives the Explore tab (CTS places).
  {
    id: 'demo-cts', crewId: '42596', checkInDateUTC: '2026-06-14 14:00', layoverHours: 23,
    legs: [
      { crewId: '42596', fltNumber: 'TG670', flightDateUTC: '14 Jun 2026 1655', depArp: 'BKK', arvDateUTC: '14 Jun 2026 2330', arvArp: 'CTS', fleet: '789', hotel: 'ANA CROWNE PLAZA CHITOSE', localDepTime: '2026-06-14 23:55', localArvTime: '2026-06-15 08:30', assignment: 'FLY',
        hotelBooking: { hotelName: 'ANA CROWNE PLAZA CHITOSE', location: '2-2-1 HOKUEI CHITOSE HOKKAIDO', airport: 'CTS', dateIn: '2026-06-15', dateOut: '2026-06-16', nights: 1, arrivalFlight: 'TG670', departureFlight: 'TG671' } },
      { crewId: '42596', fltNumber: 'TG671', flightDateUTC: '16 Jun 2026 0130', depArp: 'CTS', arvDateUTC: '16 Jun 2026 0900', arvArp: 'BKK', fleet: '789', hotel: '', localDepTime: '2026-06-16 10:30', localArvTime: '2026-06-16 16:00', assignment: 'FLY' },
    ],
  },
  // Upcoming layover (20–22 Jun) — Milan. Second Explore card (MXP places).
  {
    id: 'demo-mxp', crewId: '42596', checkInDateUTC: '2026-06-20 06:00', layoverHours: 30,
    legs: [
      { crewId: '42596', fltNumber: 'TG940', flightDateUTC: '20 Jun 2026 0010', depArp: 'BKK', arvDateUTC: '20 Jun 2026 0650', arvArp: 'MXP', fleet: '77W', hotel: 'UNAHOTELS SCANDINAVIA MILANO', localDepTime: '2026-06-20 07:10', localArvTime: '2026-06-20 13:50', assignment: 'FLY',
        hotelBooking: { hotelName: 'UNAHOTELS SCANDINAVIA MILANO', location: 'VIA SCHIAPARELLI 9, MILANO', airport: 'MXP', dateIn: '2026-06-20', dateOut: '2026-06-21', nights: 1, arrivalFlight: 'TG940', departureFlight: 'TG941' } },
      { crewId: '42596', fltNumber: 'TG941', flightDateUTC: '21 Jun 2026 1310', depArp: 'MXP', arvDateUTC: '22 Jun 2026 0540', arvArp: 'BKK', fleet: '77W', hotel: '', localDepTime: '2026-06-21 14:10', localArvTime: '2026-06-22 06:40', assignment: 'FLY' },
    ],
  },
];

// Restores the persisted session + trips on launch and keeps trips persisted
// (doc/App Flow Ver1: "keep it live, no need to login again").
function Bootstrap() {
  const dispatch = useAppDispatch();
  const trips = useAppSelector(s => s.trips.trips);
  const firstRun = useRef(true);

  useEffect(() => {
    if (DEV_SEED) {
      dispatch(setTrips(SEED_TRIPS));
      dispatch(login({ airline: 'TG', crewId: '42596', password: 'demo', keepLogin: false }));
      dispatch(loadSettings());
      dispatch(loadEnabled()); // hydrate alarm enabled + offsets (drives My Trips chips)
      dispatch(loadFlightCalendar()); // which duties are already in the iOS calendar
      // Hydrate the meeting-alarm settings, THEN read the device calendar so
      // meeting cards + alarms reflect the persisted toggle/offset.
      dispatch(loadMeetingsSettings()).then(() => dispatch(syncMeetings()));
      dispatch(loadAuthSession()); // sets `hydrated` so we leave the splash
      return;
    }
    (async () => {
      const [savedTrips, savedDuties] = await Promise.all([loadTrips(), loadDuties()]);
      if (savedTrips.length) {
        dispatch(setTrips(savedTrips));
      }
      if (savedDuties.length) {
        dispatch(setDuties(savedDuties));
      }
      dispatch(loadAuthSession());
      dispatch(loadSettings());
      dispatch(loadEnabled()); // hydrate alarm enabled + offsets so My Trips shows
                               // the Get Ready / Leave Home chips on first launch.
      dispatch(loadFlightCalendar()); // which duties are already in the iOS calendar
      dispatch(loadTripTrade()); // restore Trip Trade publish/trade choices

      // Hydrate meeting settings then read the calendar (EventKit) so meeting
      // cards show and their alarms arm on launch, even if the app then closes.
      await dispatch(loadMeetingsSettings());
      dispatch(syncMeetings());
    })();
  }, [dispatch]);

  // Re-sync meetings whenever the app returns to the foreground so new invites,
  // edits, and cancellations from the device calendar are picked up immediately.
  useEffect(() => {
    const handler = (next: AppStateStatus) => {
      if (next === 'active') {
        dispatch(syncMeetings());
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [dispatch]);

  // Persist trips when they change, debounced so a bulk import writes once after
  // the final store update (skip the very first hydrate render).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(() => saveTrips(trips), 400);
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, [trips]);

  return <RootNavigator />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Provider store={store}>
        <SafeAreaProvider>
          <NavigationContainer>
            <Bootstrap />
          </NavigationContainer>
        </SafeAreaProvider>
      </Provider>
    </GestureHandlerRootView>
  );
}
