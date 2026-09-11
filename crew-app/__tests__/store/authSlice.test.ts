import { configureStore } from '@reduxjs/toolkit';

// Mock the persistence layer (Keychain + AsyncStorage) so the slice logic can be
// tested without native modules.
jest.mock('../../src/features/auth/sessionStore', () => ({
  saveSession: jest.fn(async () => {}),
  loadSession: jest.fn(async () => null),
  clearSession: jest.fn(async () => {}),
}));

import authReducer, {
  login,
  logout,
  loadAuthSession,
} from '../../src/features/auth/authSlice';
import * as sessionStore from '../../src/features/auth/sessionStore';

const makeStore = () => configureStore({ reducer: { auth: authReducer } });

describe('authSlice', () => {
  beforeEach(() => jest.clearAllMocks());

  it('has correct defaults', () => {
    const { auth } = makeStore().getState();
    expect(auth.loggedIn).toBe(false);
    expect(auth.hydrated).toBe(false);
    expect(auth.airline).toBe('TG');
    expect(auth.crewId).toBeNull();
  });

  it('login sets the session live and persists it', async () => {
    const store = makeStore();
    await store.dispatch(
      login({ airline: 'TG', crewId: '35459', password: 'pw', keepLogin: true }) as any,
    );
    const { auth } = store.getState();
    expect(auth.loggedIn).toBe(true);
    expect(auth.crewId).toBe('35459');
    expect(sessionStore.saveSession).toHaveBeenCalledWith({
      airline: 'TG',
      crewId: '35459',
      password: 'pw',
      keepLogin: true,
    });
  });

  it('logout clears the session', async () => {
    const store = makeStore();
    await store.dispatch(
      login({ airline: 'TG', crewId: '35459', password: 'pw', keepLogin: true }) as any,
    );
    await store.dispatch(logout() as any);
    const { auth } = store.getState();
    expect(auth.loggedIn).toBe(false);
    expect(auth.crewId).toBeNull();
    expect(sessionStore.clearSession).toHaveBeenCalled();
  });

  it('loadAuthSession marks hydrated and restores a saved session', async () => {
    (sessionStore.loadSession as jest.Mock).mockResolvedValueOnce({
      airline: 'TG',
      crewId: '35459',
      password: 'pw',
      keepLogin: true,
    });
    const store = makeStore();
    await store.dispatch(loadAuthSession() as any);
    const { auth } = store.getState();
    expect(auth.hydrated).toBe(true);
    expect(auth.loggedIn).toBe(true);
    expect(auth.crewId).toBe('35459');
  });

  it('loadAuthSession with no saved session stays logged out but hydrated', async () => {
    const store = makeStore();
    await store.dispatch(loadAuthSession() as any);
    const { auth } = store.getState();
    expect(auth.hydrated).toBe(true);
    expect(auth.loggedIn).toBe(false);
  });
});
