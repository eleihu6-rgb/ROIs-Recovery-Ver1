// Guest + social login (Ryan 2026-09-12):
//   1. the login page carries "Or" plus Login as Guest below the Log in button
//   2. Google / Apple / Facebook are offered, and a build without their SDK says
//      so instead of faking a sign-in
//   3. the provider's name reaches the Profile page
//   4. a guest skips the airline login AND the roster pull, but every other
//      feature (alarms, meetings, time zone, preferences) stays reachable
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { Alert, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

import authReducer, {
  loadAuthSession,
  loginAsGuest,
  loginWithIdentity,
  logout,
  selectIsGuest,
} from '../../src/features/auth/authSlice';
import tripsReducer from '../../src/features/travel/tripsSlice';
import dutiesReducer from '../../src/features/roster/dutiesSlice';
import settingsReducer from '../../src/features/settings/settingsSlice';
import notificationsReducer from '../../src/features/notifications/notificationsSlice';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import meetingsReducer from '../../src/features/meetings/meetingsSlice';
import { loadSession } from '../../src/features/auth/sessionStore';
import { isProviderConfigured } from '../../src/features/auth/socialAuth';
import { LoginScreen } from '../../src/features/auth/LoginScreen';
import { ProfileScreen } from '../../src/features/v2/ProfileScreen';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), push: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

const makeStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
      trips: tripsReducer,
      duties: dutiesReducer,
      settings: settingsReducer,
      notifications: notificationsReducer,
      alarms: alarmsReducer,
      meetings: meetingsReducer,
    },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
  });

type Store = ReturnType<typeof makeStore>;

const nav = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };
const navigation = nav as never;
const route = { key: 'Login', name: 'Login', params: undefined } as never;

/** Dispatch a thunk on a hand-rolled test store. The thunks are typed against
 *  the app's AppDispatch; this store carries the same reducers, so only the
 *  dispatch signature is cast — never the reducer behaviour under test. */
function dispatchThunk(store: Store, thunk: unknown): Promise<void> {
  return store.dispatch(thunk as never) as unknown as Promise<void>;
}

function renderLogin(store: Store) {
  return render(
    <Provider store={store}>
      <LoginScreen navigation={navigation} route={route} />
    </Provider>,
  );
}

function renderProfile(store: Store) {
  return render(
    <Provider store={store}>
      <ProfileScreen />
    </Provider>,
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockNavigate.mockClear();
  nav.navigate.mockClear();
  jest.restoreAllMocks();
});

describe('login page — guest + provider entry', () => {
  it('offers Login as Guest and the three providers under the Or rule', () => {
    const { getByTestId, getByText, queryByText } = renderLogin(makeStore());
    // The crew entry says what it is (Ryan 2026-09-12), and the helper line under
    // the guest button is gone.
    expect(getByText('Login As Crew')).toBeTruthy();
    expect(queryByText(/No airline sign-in needed/)).toBeNull();
    expect(getByText('Login as Guest')).toBeTruthy();
    // Capital-O "Or", matching the reference crop's divider label.
    expect(getByText('Or')).toBeTruthy();
    expect(getByTestId('guest-login')).toBeTruthy();
    expect(getByTestId('social-google')).toBeTruthy();
    expect(getByTestId('social-apple')).toBeTruthy();
    expect(getByTestId('social-facebook')).toBeTruthy();
  });

  it('wears the same button as Login As Crew, so the pair cannot drift', () => {
    const { getByTestId } = renderLogin(makeStore());
    const crew = StyleSheet.flatten(getByTestId('login-btn').props.style) ?? {};
    const guest = StyleSheet.flatten(getByTestId('guest-login').props.style) ?? {};
    expect(guest.backgroundColor).toBe(crew.backgroundColor);
    expect(guest.paddingVertical).toBe(crew.paddingVertical);
    expect(guest.borderRadius).toBe(crew.borderRadius);
    expect(guest.borderWidth).toBeUndefined();
  });
});

describe('guest login', () => {
  it('opens a roster-less session without touching the airline portal', async () => {
    const store = makeStore();
    const { getByTestId } = renderLogin(store);

    await act(async () => {
      fireEvent.press(getByTestId('guest-login'));
    });

    const auth = store.getState().auth;
    expect(auth.loggedIn).toBe(true);
    expect(auth.mode).toBe('guest');
    expect(auth.provider).toBe('guest');
    expect(auth.crewId).toBe('');
    expect(auth.airline).toBe('');
    expect(selectIsGuest(store.getState())).toBe(true);
    // No roster pull: nothing was captured, and the login never handed off to
    // the Capture / EkRoster portal screens.
    expect(store.getState().trips.trips).toEqual([]);
    expect(store.getState().duties.duties).toEqual([]);
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('is remembered on the next launch when Keep me logged in is ticked', async () => {
    const store = makeStore();
    const { getByTestId } = renderLogin(store);

    await act(async () => {
      fireEvent.press(getByTestId('guest-login')); // the checkbox starts ticked
    });

    const restored = await loadSession();
    expect(restored).toMatchObject({ mode: 'guest', provider: 'guest', crewId: '', keepLogin: true });

    // A fresh launch hydrates straight back into the guest session.
    const relaunched = makeStore();
    await act(async () => {
      await dispatchThunk(relaunched, loadAuthSession());
    });
    expect(relaunched.getState().auth.loggedIn).toBe(true);
    expect(selectIsGuest(relaunched.getState())).toBe(true);
    expect(relaunched.getState().auth.hydrated).toBe(true);
  });

  it('is not persisted when the crew clears Keep me logged in', async () => {
    const store = makeStore();
    const { getByTestId } = renderLogin(store);

    fireEvent.press(getByTestId('keep-login')); // untick
    await act(async () => {
      fireEvent.press(getByTestId('guest-login'));
    });

    expect(store.getState().auth.loggedIn).toBe(true); // the run is live …
    expect(await loadSession()).toBeNull(); // … but nothing was stored
  });

  it('clears the guest session on logout', async () => {
    const store = makeStore();
    await act(async () => {
      await dispatchThunk(store, loginAsGuest({ keepLogin: true }));
    });
    expect(await loadSession()).not.toBeNull();

    await act(async () => {
      await dispatchThunk(store, logout());
    });

    expect(store.getState().auth.loggedIn).toBe(false);
    expect(store.getState().auth.mode).toBe('crew');
    expect(await loadSession()).toBeNull();
  });

  // Regression: the first device run lost the guest session because the persist
  // path cleared the stale crew credential through the Keychain BEFORE writing,
  // and this simulator's Keychain rejected the call ("Internal error when a
  // required entitlement isn't present."). Hygiene must never sink the payload.
  it('still stores the session when the device Keychain refuses', async () => {
    const spy = jest
      .spyOn(Keychain, 'resetGenericPassword')
      .mockRejectedValueOnce(
        new Error("Internal error when a required entitlement isn't present."),
      );
    const store = makeStore();
    const { getByTestId } = renderLogin(store);

    await act(async () => {
      fireEvent.press(getByTestId('guest-login'));
    });

    expect(await loadSession()).toMatchObject({
      mode: 'guest',
      provider: 'guest',
      keepLogin: true,
    });
    spy.mockRestore();
  });
});

describe('social sign-in', () => {
  it('reports what this build is missing instead of faking a session', async () => {
    // Nothing is provisioned yet, so every provider is honestly "not ready".
    expect(isProviderConfigured('google')).toBe(false);
    expect(isProviderConfigured('facebook')).toBe(false);

    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const store = makeStore();
    const { getByTestId } = renderLogin(store);

    await act(async () => {
      fireEvent.press(getByTestId('social-google'));
    });

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toBe('Not available yet');
    expect(String(alert.mock.calls[0][1])).toContain('GoogleIosClientId');
    expect(store.getState().auth.loggedIn).toBe(false);
  });

  it('puts the provider name and email on the Profile page', async () => {
    const store = makeStore();
    await act(async () => {
      await dispatchThunk(
        store,
        loginWithIdentity(
          {
            provider: 'google',
            displayName: 'Ada Lovelace',
            email: 'ada@example.com',
            photoUrl: null,
          },
          { keepLogin: true },
        ),
      );
    });

    const { getByTestId } = renderProfile(store);
    expect(getByTestId('profile-crew-name').props.children).toBe('Ada Lovelace');
    expect(getByTestId('profile-provider-chip').props.children).toBe('Google');
    expect(getByTestId('profile-crew-meta').props.children).toBe('ada@example.com · No airline account');

    // …and it survives the next launch.
    const restored = await loadSession();
    expect(restored).toMatchObject({ displayName: 'Ada Lovelace', email: 'ada@example.com', provider: 'google' });
  });
});

describe('guest Profile', () => {
  it('names the anonymous session and offers the way back to the airline login', async () => {
    const store = makeStore();
    await act(async () => {
      await dispatchThunk(store, loginAsGuest({ keepLogin: true }));
    });

    const { getByTestId, queryByTestId, queryByText } = renderProfile(store);
    expect(getByTestId('profile-crew-name').props.children).toBe('Guest');
    expect(getByTestId('profile-provider-chip').props.children).toBe('Guest');
    expect(getByTestId('profile-add-airline')).toBeTruthy();
    // No roster means no block-hours card to report.
    expect(queryByTestId('profile-block-hours')).toBeNull();
    expect(queryByText('Sign in with your airline')).toBeTruthy();
  });

  it('keeps alarms, meetings, time zone and preferences reachable', async () => {
    const store = makeStore();
    await act(async () => {
      await dispatchThunk(store, loginAsGuest({ keepLogin: false }));
    });

    const { getByTestId } = renderProfile(store);
    expect(getByTestId('row-alarms')).toBeTruthy();
    expect(getByTestId('row-timezone')).toBeTruthy();
    expect(getByTestId('row-preferences')).toBeTruthy();
    expect(getByTestId('row-personal')).toBeTruthy();
  });
});
