jest.mock('../../src/features/travel/ekRosterApi');
jest.mock('../../src/features/roster/dutiesSlice', () => ({
  setDuties: (payload: unknown) => ({type: 'duties/setDuties', payload}),
}));
jest.mock('../../src/features/auth/ekRosterSnapshot', () => ({
  commitEkRosterSnapshot: jest.fn(),
  discardEkRosterSnapshot: jest.fn(),
}));
jest.mock('../../src/features/auth/authSlice', () => ({
  publishPersistedSession: (payload: unknown) => ({
    type: 'auth/publishPersistedSession', payload,
  }),
}));

import {
  fetchEkRoster,
  mapEkRosterToDuties,
  mapEkRosterToTrips,
} from '../../src/features/travel/ekRosterApi';
import {
  commitEkRosterSnapshot,
  discardEkRosterSnapshot,
} from '../../src/features/auth/ekRosterSnapshot';
import {
  isEkRosterLoginAbortError,
  loadEkRosterSession,
} from '../../src/features/auth/ekRosterLogin';

const params = {airline: 'EK', crewId: 'C900001', password: 'Pier2026', keepLogin: true};
const trips = [{
  id: 'PROJ-90000503', crewId: 'C900001', checkInDateUTC: '2026-08-04T22:50', legs: [],
}];
const duties = [{
  id: 'ground-1', dutyId: 'ground-1', airline: 'F8', crewId: '113',
  label: 'TRAINING', dutyType: 'GROUND', startUTC: '2026-08-05T08:00:00.000Z',
  endUTC: '2026-08-05T16:00:00.000Z', baseOffsetMin: 0,
}];
const response = {
  apiVersion: '1',
  airline: 'EK',
  crew: {crewId: 'C900001', firstName: 'Amina', lastName: 'Khan', base: 'DXB', rank: 'FO'},
  pairings: [],
  groundDuties: [],
};

describe('EK roster login transaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchEkRoster as jest.Mock).mockResolvedValue(response);
    (mapEkRosterToTrips as jest.Mock).mockReturnValue(trips);
    (mapEkRosterToDuties as jest.Mock).mockReturnValue(duties);
    (commitEkRosterSnapshot as jest.Mock).mockResolvedValue(undefined);
    (discardEkRosterSnapshot as jest.Mock).mockResolvedValue(undefined);
  });

  it('loads F8 through the API-backed roster transaction with mapped duties', async () => {
    const f8Params = {airline: 'F8', crewId: '113', password: 'test-password', keepLogin: true};
    const dispatch = jest.fn();

    await loadEkRosterSession(f8Params, dispatch as never);

    expect(fetchEkRoster).toHaveBeenCalledWith(
      expect.any(String),
      {airline: 'F8', crewId: '113', password: 'test-password'},
      undefined,
    );
    expect(commitEkRosterSnapshot).toHaveBeenCalledWith({
      trips,
      duties,
      session: f8Params,
    }, undefined);
    expect(dispatch).toHaveBeenCalledWith({type: 'duties/setDuties', payload: duties});
  });

  it('commits one snapshot before publishing roster and session state together', async () => {
    const events: string[] = [];
    const actions: Array<{type: string; payload: unknown}> = [];
    (commitEkRosterSnapshot as jest.Mock).mockImplementation(async () => events.push('commit'));
    const dispatch: jest.Mock = jest.fn(async action => {
      actions.push(action);
      events.push(action.type);
      return action;
    });

    const result = await loadEkRosterSession(params, dispatch as never);

    expect(result).toBe(trips);
    expect(actions).toEqual([
      {type: 'trips/setTrips', payload: trips},
      {type: 'duties/setDuties', payload: duties},
      {type: 'auth/publishPersistedSession', payload: params},
    ]);
    expect(commitEkRosterSnapshot).toHaveBeenCalledWith({
      trips,
      duties,
      session: params,
    }, undefined);
    expect(events).toEqual([
      'commit',
      'trips/setTrips',
      'duties/setDuties',
      'auth/publishPersistedSession',
    ]);
  });

  it.each(['API', 'schema'] as const)(
    'does not dispatch, persist, or log in after %s failure',
    async failureBoundary => {
      const error = failureBoundary === 'API'
        ? new Error('Invalid crew credentials')
        : new Error('Unsupported roster API version');
      if (failureBoundary === 'API') {
        (fetchEkRoster as jest.Mock).mockRejectedValue(error);
      } else {
        (mapEkRosterToTrips as jest.Mock).mockImplementation(() => {
          throw error;
        });
      }
      const dispatch = jest.fn();

      await expect(loadEkRosterSession(params, dispatch as never)).rejects.toThrow(error.message);

      expect(dispatch).not.toHaveBeenCalled();
      expect(commitEkRosterSnapshot).not.toHaveBeenCalled();
    },
  );

  it('does not publish any Redux state when atomic persistence fails', async () => {
    (commitEkRosterSnapshot as jest.Mock).mockRejectedValue(new Error('disk full'));
    const dispatch = jest.fn();

    await expect(loadEkRosterSession(params, dispatch as never)).rejects.toThrow('disk full');

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('cancels after mapping without mutating or persisting roster state', async () => {
    const controller = new AbortController();
    (mapEkRosterToTrips as jest.Mock).mockImplementation(() => {
      controller.abort();
      return trips;
    });
    const dispatch = jest.fn();

    await expect(
      loadEkRosterSession(params, dispatch as never, controller.signal),
    ).rejects.toMatchObject({name: 'AbortError', message: 'EK roster login cancelled'});

    expect(dispatch).not.toHaveBeenCalled();
    expect(commitEkRosterSnapshot).not.toHaveBeenCalled();
  });

  it('discards a committed snapshot if cancellation wins before Redux publication', async () => {
    const controller = new AbortController();
    (commitEkRosterSnapshot as jest.Mock).mockImplementation(async () => controller.abort());
    const dispatch = jest.fn();

    await expect(
      loadEkRosterSession(params, dispatch as never, controller.signal),
    ).rejects.toMatchObject({name: 'AbortError', message: 'EK roster login cancelled'});

    expect(commitEkRosterSnapshot).toHaveBeenCalled();
    expect(discardEkRosterSnapshot).toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('EK roster login cancellation classification', () => {
  it('recognizes only actual AbortError failures', () => {
    const namedError = new Error('EK roster login cancelled');
    namedError.name = 'AbortError';

    expect(isEkRosterLoginAbortError(namedError)).toBe(true);
    expect(isEkRosterLoginAbortError({name: 'AbortError'})).toBe(true);
    expect(isEkRosterLoginAbortError(new Error('Persistence failed'))).toBe(false);
    expect(isEkRosterLoginAbortError({name: 'NetworkError'})).toBe(false);
    expect(isEkRosterLoginAbortError(null)).toBe(false);
  });
});
