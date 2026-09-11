import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

import type {PortalDuty} from '../travel/portalCapture';
import type {Trip} from '../travel/tripCsv';

export const EK_ROSTER_SNAPSHOT_KEY = '@royce_ek_roster_session_v1';
const KEYCHAIN_SERVICE_PREFIX = 'com.royce.crewportal.ek';
const API_ROSTER_AIRLINES = new Set(['EK', 'F8', 'ET']);

export interface EkRosterSnapshotSession {
  airline: string;
  crewId: string;
  password: string;
  keepLogin: boolean;
}

export interface EkRosterSnapshotInput {
  trips: Trip[];
  duties: PortalDuty[];
  session: EkRosterSnapshotSession;
}

interface StoredEkRosterSnapshot {
  version: 1;
  trips: Trip[];
  duties: PortalDuty[];
  session: Omit<EkRosterSnapshotSession, 'password'> & {keychainService: string | null};
}

function abortError(): Error {
  const error = new Error('EK roster login cancelled');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

function parseStoredSnapshot(raw: string | null): StoredEkRosterSnapshot | null {
  if (!raw) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as Partial<StoredEkRosterSnapshot>;
    if (value.version !== 1
      || !Array.isArray(value.trips)
      || !Array.isArray(value.duties)
      || typeof value.session !== 'object'
      || value.session === null
      || typeof value.session.airline !== 'string'
      || !API_ROSTER_AIRLINES.has(value.session.airline)
      || typeof value.session.crewId !== 'string'
      || typeof value.session.keepLogin !== 'boolean') {
      return null;
    }
    return value as StoredEkRosterSnapshot;
  } catch {
    return null;
  }
}

export async function loadEkRosterSnapshot(): Promise<StoredEkRosterSnapshot | null> {
  return parseStoredSnapshot(await AsyncStorage.getItem(EK_ROSTER_SNAPSHOT_KEY));
}

async function restoreSnapshot(raw: string | null): Promise<void> {
  if (raw === null) {
    await AsyncStorage.removeItem(EK_ROSTER_SNAPSHOT_KEY);
  } else {
    await AsyncStorage.setItem(EK_ROSTER_SNAPSHOT_KEY, raw);
  }
}

export async function commitEkRosterSnapshot(
  input: EkRosterSnapshotInput,
  signal?: AbortSignal,
): Promise<void> {
  const previousRaw = await AsyncStorage.getItem(EK_ROSTER_SNAPSHOT_KEY);
  const previous = parseStoredSnapshot(previousRaw);
  const keychainService = input.session.keepLogin
    ? `${KEYCHAIN_SERVICE_PREFIX}.${input.session.airline}.${input.session.crewId}.${Date.now()}.${Math.random().toString(36).slice(2)}`
    : null;
  let attemptedSnapshotCommit = false;

  try {
    throwIfAborted(signal);
    if (keychainService) {
      const saved = await Keychain.setGenericPassword(
        input.session.crewId,
        input.session.password,
        {service: keychainService},
      );
      if (!saved) {
        throw new Error('Unable to stage EK login credentials');
      }
    }
    throwIfAborted(signal);

    const snapshot: StoredEkRosterSnapshot = {
      version: 1,
      trips: input.trips,
      duties: input.duties,
      session: {
        airline: input.session.airline,
        crewId: input.session.crewId,
        keepLogin: input.session.keepLogin,
        keychainService,
      },
    };
    attemptedSnapshotCommit = true;
    await AsyncStorage.setItem(EK_ROSTER_SNAPSHOT_KEY, JSON.stringify(snapshot));
    throwIfAborted(signal);
  } catch (error) {
    if (attemptedSnapshotCommit) {
      // Best effort: the rollback writes to the same storage that just failed
      // (e.g. the app's data container was reclaimed while the app was
      // running), so a rollback failure must not mask the original error.
      await restoreSnapshot(previousRaw).catch(() => undefined);
    }
    if (keychainService) {
      await Keychain.resetGenericPassword({service: keychainService}).catch(() => undefined);
    }
    throw error;
  }

  const oldService = previous?.session.keychainService;
  if (oldService && oldService !== keychainService) {
    try {
      await Keychain.resetGenericPassword({service: oldService});
    } catch {
      // The new snapshot is already authoritative; an orphaned old credential
      // cannot be discovered without its removed service identifier.
    }
  }
}

export async function loadEkRosterSavedSession(): Promise<EkRosterSnapshotSession | null> {
  const snapshot = await loadEkRosterSnapshot();
  if (!snapshot?.session.keepLogin || !snapshot.session.keychainService) {
    return null;
  }
  const credentials = await Keychain.getGenericPassword({
    service: snapshot.session.keychainService,
  });
  if (!credentials) {
    return null;
  }
  return {
    airline: snapshot.session.airline,
    crewId: snapshot.session.crewId,
    password: credentials.password,
    keepLogin: true,
  };
}

export async function discardEkRosterSnapshot(): Promise<void> {
  const snapshot = await loadEkRosterSnapshot();
  await AsyncStorage.removeItem(EK_ROSTER_SNAPSHOT_KEY);
  if (snapshot?.session.keychainService) {
    await Keychain.resetGenericPassword({service: snapshot.session.keychainService});
  }
}
