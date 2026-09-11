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
import {publishPersistedSession} from './authSlice';
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

export function isEkRosterLoginAbortError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'AbortError';
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }
  const error = new Error('EK roster login cancelled');
  error.name = 'AbortError';
  throw error;
}

export async function loadEkRosterSession(
  params: EkLoginParams,
  dispatch: AppDispatch,
  signal?: AbortSignal,
): Promise<Trip[]> {
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
  await commitEkRosterSnapshot({trips, duties, session: params}, signal);
  try {
    throwIfAborted(signal);
  } catch (error) {
    await discardEkRosterSnapshot();
    throw error;
  }
  dispatch(setTrips(trips));
  dispatch(setDuties(duties));
  dispatch(publishPersistedSession(params));
  return trips;
}
