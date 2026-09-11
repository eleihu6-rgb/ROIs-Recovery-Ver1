import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Trip } from './tripCsv';
import {loadEkRosterSnapshot} from '../auth/ekRosterSnapshot';

// Persist captured/imported trips so a kept-login session shows the last roster
// immediately on relaunch (doc/App Flow Ver1: "keep it live, no need to login again").

const K_TRIPS = '@royce_trips';

export async function saveTrips(trips: Trip[]): Promise<void> {
  try {
    await AsyncStorage.setItem(K_TRIPS, JSON.stringify(trips));
  } catch {
    // non-fatal
  }
}

export async function loadTrips(): Promise<Trip[]> {
  try {
    const snapshot = await loadEkRosterSnapshot();
    if (snapshot) {
      return snapshot.trips;
    }
    const raw = await AsyncStorage.getItem(K_TRIPS);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Wipe persisted trips (used on logout so the next crew starts clean).
export async function clearStoredTrips(): Promise<void> {
  try {
    await AsyncStorage.removeItem(K_TRIPS);
  } catch {
    // non-fatal
  }
}
