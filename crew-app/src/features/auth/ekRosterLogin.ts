import type {AppDispatch} from '../../store';
import {setDuties} from '../roster/dutiesSlice';
import {
  fetchEkRoster,
  mapEkRosterToDuties,
  mapEkRosterToTrips,
} from '../travel/ekRosterApi';
import type {Trip} from '../travel/tripCsv';
import {setTrips} from '../travel/tripsSlice';
import {airlineByCode} from './airlines';
import {publishEphemeralSession, publishPersistedSession, setCrewBase, setCrewProfile} from './authSlice';
import {setBaseTimeZone} from '../settings/settingsSlice';
import {airportZone} from '../settings/airportZones';
import {
  commitEkRosterSnapshot,
  discardEkRosterSnapshot,
} from './ekRosterSnapshot';

export interface EkLoginParams {
  airline: 'EK' | string;
  crewId: string;
  password: string;
  keepLogin: boolean;
}

export interface EkRosterLoadResult {
  trips: Trip[];
  /**
   * False when the roster loaded but this device could not remember the
   * roster/session (Keychain or AsyncStorage failure). The crew is signed in
   * for this run either way; only the next launch differs.
   */
  persisted: boolean;
  persistenceError: Error | null;
}

export function isEkRosterLoginAbortError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'AbortError';
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }
  const error = new Error('EK roster login cancelled');
  error.name = 'AbortError';
  throw error;
}

// Sign in to a crew portal and publish the roster.
//
// The roster fetch IS the login: if it fails, the crew is not signed in and the
// error reaches the screen. Writing the snapshot is only how the session is
// REMEMBERED, so it is best effort — a failed commit (e.g. the simulator
// reclaiming the app's data container under a running app leaves AsyncStorage
// unable to create its temp file: NSCocoaErrorDomain 4 / ENOENT) must not throw
// away a roster the crew already authenticated for. Those failures publish an
// in-memory session instead and report `persisted: false`.
export async function loadEkRosterSession(
  params: EkLoginParams,
  dispatch: AppDispatch,
  signal?: AbortSignal,
): Promise<EkRosterLoadResult> {
  const airline = airlineByCode(params.airline);
  if (airline.portalKind !== 'rois-api' || !airline.apiBaseUrl) {
    throw new Error(`${airline.name} roster service is not configured`);
  }
  const response = await fetchEkRoster(
    airline.apiBaseUrl,
    {airline: airline.code, crewId: params.crewId, password: params.password},
    signal,
  );
  const trips = mapEkRosterToTrips(response);
  const duties = mapEkRosterToDuties(response);
  throwIfAborted(signal);

  let persistenceError: Error | null = null;
  try {
    await commitEkRosterSnapshot({trips, duties, session: params}, signal);
  } catch (error) {
    // Cancellation still wins over a partially staged snapshot.
    if (isEkRosterLoginAbortError(error) || signal?.aborted) {
      await discardEkRosterSnapshot().catch(() => undefined);
      throwIfAborted(signal);
      throw error;
    }
    persistenceError = toError(error);
    console.warn(
      '[ekRosterLogin] roster loaded but the session snapshot was not persisted:',
      persistenceError.message,
    );
  }

  try {
    throwIfAborted(signal);
  } catch (error) {
    if (!persistenceError) {
      await discardEkRosterSnapshot().catch(() => undefined);
    }
    throw error;
  }

  dispatch(setTrips(trips));
  dispatch(setDuties(duties));
  // "Base time" must be the crew's own base — the setting shipped hardcoded to
  // Bangkok for the TG app, which quietly mislabels every ET time. Set it with
  // the rest of the roster so a cancelled login still publishes nothing.
  dispatch(setCrewBase(response.crew.base));
  dispatch(setCrewProfile({
    firstName: response.crew.firstName,
    lastName: response.crew.lastName,
    nationality: response.crew.nationality,
  }));
  dispatch(setBaseTimeZone(airportZone(response.crew.base)));
  dispatch(
    persistenceError
      ? publishEphemeralSession(params)
      : publishPersistedSession(params),
  );
  return {trips, persisted: persistenceError === null, persistenceError};
}
