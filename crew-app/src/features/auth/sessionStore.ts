import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import {
  discardEkRosterSnapshot,
  loadEkRosterSavedSession,
} from './ekRosterSnapshot';

// Persistence for the crew login session (doc/App Flow Ver1, "Keep Login").
// The password is stored in the device Keychain (secure); the airline + crew id
// + the keep-login flag live in AsyncStorage.

const K_AIRLINE = '@royce_airline';
const K_CREW = '@royce_crewId';
const K_KEEP = '@royce_keepLogin';
const KEYCHAIN_SERVICE = 'com.royce.crewportal';

export interface SavedSession {
  airline: string;
  crewId: string;
  password: string;
  keepLogin: boolean;
}

export async function saveSession(s: SavedSession): Promise<void> {
  if (!s.keepLogin) {
    await clearSession();
    return;
  }
  try {
    await AsyncStorage.multiSet([
      [K_AIRLINE, s.airline],
      [K_CREW, s.crewId],
      [K_KEEP, 'true'],
    ]);
    await Keychain.setGenericPassword(s.crewId, s.password, { service: KEYCHAIN_SERVICE });
  } catch {
    // Non-fatal: a failed persist just means the crew logs in again next time.
  }
}

export async function loadSession(): Promise<SavedSession | null> {
  try {
    const ekSession = await loadEkRosterSavedSession();
    if (ekSession) {
      return ekSession;
    }
    const [[, airline], [, crewId], [, keep]] = await AsyncStorage.multiGet([
      K_AIRLINE,
      K_CREW,
      K_KEEP,
    ]);
    if (keep !== 'true' || !crewId) {
      return null;
    }
    const creds = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
    if (!creds) {
      return null;
    }
    return {
      airline: airline || 'TG',
      crewId,
      password: creds.password,
      keepLogin: true,
    };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await discardEkRosterSnapshot();
  } catch {
    // EK snapshot cleanup is independent from the legacy TG/PR session keys.
  }
  try {
    await AsyncStorage.multiRemove([K_AIRLINE, K_CREW, K_KEEP]);
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
  } catch {
    // ignore
  }
}
