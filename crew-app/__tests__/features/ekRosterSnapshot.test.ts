import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

import {loadDuties} from '../../src/features/roster/dutiesSlice';
import {clearSession, loadSession} from '../../src/features/auth/sessionStore';
import {
  commitEkRosterSnapshot,
  EK_ROSTER_SNAPSHOT_KEY,
  loadEkRosterSavedSession,
} from '../../src/features/auth/ekRosterSnapshot';
import {loadTrips} from '../../src/features/travel/tripsPersistence';

const trips = [{
  id: 'PROJ-90000503',
  crewId: 'C900001',
  checkInDateUTC: '04 Aug 2026 2250',
  legs: [{
    crewId: 'C900001',
    fltNumber: 'EK5',
    flightDateUTC: '05 Aug 2026 0050',
    depArp: 'DXB',
    arvDateUTC: '05 Aug 2026 0835',
    arvArp: 'LHR',
    fleet: 'A388',
    hotel: '',
  }],
}];
const session = {
  airline: 'EK', crewId: 'C900001', password: 'Pier2026', keepLogin: true,
};

describe('atomic EK roster snapshot', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (Keychain.setGenericPassword as jest.Mock).mockResolvedValue(true);
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
      username: session.crewId,
      password: session.password,
    });
    (Keychain.resetGenericPassword as jest.Mock).mockResolvedValue(true);
  });

  it('hydrates trips, duties, and the kept-login session from one committed snapshot', async () => {
    await commitEkRosterSnapshot({trips, duties: [], session});

    await expect(loadTrips()).resolves.toEqual(trips);
    await expect(loadDuties()).resolves.toEqual([]);
    await expect(loadSession()).resolves.toEqual(session);
    expect(Keychain.getGenericPassword).toHaveBeenCalledWith(expect.objectContaining({
      service: expect.stringContaining('.ek.'),
    }));
  });

  it('restores a kept-login F8 API roster session from snapshot and keychain', async () => {
    const f8Session = {
      airline: 'F8', crewId: '113', password: 'from-keychain', keepLogin: true,
    };
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
      username: f8Session.crewId,
      password: f8Session.password,
    });

    await commitEkRosterSnapshot({trips, duties: [], session: f8Session});

    await expect(loadEkRosterSavedSession()).resolves.toEqual(f8Session);
    expect(Keychain.getGenericPassword).toHaveBeenCalledWith(expect.objectContaining({
      service: expect.stringContaining('.F8.113'),
    }));
  });

  it('makes an AsyncStorage commit failure observable without publishing partial persistence', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

    await expect(commitEkRosterSnapshot({trips, duties: [], session}))
      .rejects.toThrow('disk full');

    await expect(AsyncStorage.getItem(EK_ROSTER_SNAPSHOT_KEY)).resolves.toBeNull();
    expect(Keychain.resetGenericPassword).toHaveBeenCalled();
  });

  it('aborts during credential staging before the roster snapshot is committed', async () => {
    const controller = new AbortController();
    (Keychain.setGenericPassword as jest.Mock).mockImplementationOnce(async () => {
      controller.abort();
      return true;
    });

    await expect(commitEkRosterSnapshot(
      {trips, duties: [], session},
      controller.signal,
    )).rejects.toMatchObject({name: 'AbortError'});

    await expect(AsyncStorage.getItem(EK_ROSTER_SNAPSHOT_KEY)).resolves.toBeNull();
    expect(Keychain.resetGenericPassword).toHaveBeenCalled();
  });

  it('still clears legacy TG/PR session keys when no EK snapshot can be read', async () => {
    await AsyncStorage.multiSet([
      ['@royce_airline', 'TG'],
      ['@royce_crewId', '35459'],
      ['@royce_keepLogin', 'true'],
    ]);
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('snapshot unavailable'));

    await clearSession();

    await expect(AsyncStorage.multiGet([
      '@royce_airline', '@royce_crewId', '@royce_keepLogin',
    ])).resolves.toEqual([
      ['@royce_airline', null],
      ['@royce_crewId', null],
      ['@royce_keepLogin', null],
    ]);
  });
});
