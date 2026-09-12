// Crew-app login page — Ryan 2026-09-11 polish pass:
//   1. the app name ("ROIs Altair") sits under the logo, not the lowercase wordmark
//   2. the three fields are drawn as portal-style rows (glyph · divider · label/value)
//   3. the "You'll sign in securely on …" footnote is gone
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { LoginScreen } from '../../src/features/auth/LoginScreen';
import authReducer from '../../src/features/auth/authSlice';
import tripsReducer from '../../src/features/travel/tripsSlice';
import dutiesReducer from '../../src/features/roster/dutiesSlice';
import settingsReducer from '../../src/features/settings/settingsSlice';
import notificationsReducer from '../../src/features/notifications/notificationsSlice';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import meetingsReducer from '../../src/features/meetings/meetingsSlice';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const navigation = { navigate: jest.fn() } as never;
const route = { key: 'Login', name: 'Login', params: undefined } as never;

// The page now dispatches its guest/social entry (Ryan 2026-09-12), so the
// login screen renders inside a store like it does in the app.
const renderLogin = () =>
  render(
    <Provider
      store={configureStore({
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
      })}>
      <LoginScreen navigation={navigation} route={route} />
    </Provider>,
  );

describe('LoginScreen', () => {
  it('shows the product name and tagline under the logo', () => {
    const { getByText } = renderLogin();
    expect(getByText('ROIs Altair')).toBeTruthy();
    expect(getByText('ALWAYS A WAY FORWARD')).toBeTruthy();
  });

  // Ryan 2026-09-11 (superseding the earlier "no placeholder" pass): each field's
  // name is its placeholder, and nothing is labelled above the box — the Airline
  // row is the same idea, its value says what it is.
  it('names every field inside the box instead of labelling above it', () => {
    const { getByText, queryByText } = renderLogin();
    expect(queryByText('Airline')).toBeNull();
    expect(queryByText('Crew ID')).toBeNull();
    expect(queryByText('Password')).toBeNull();
    expect(getByText('ROIs Altair')).toBeTruthy(); // sanity: the screen really rendered
  });

  it('keeps the inputs editable and the actions tappable', () => {
    const { getByTestId } = renderLogin();
    expect(getByTestId('crew-id')).toBeTruthy();
    expect(getByTestId('crew-pw')).toBeTruthy();
    expect(getByTestId('keep-login')).toBeTruthy();
    expect(getByTestId('login-btn')).toBeTruthy();
  });

  it('uses the field name as its placeholder', () => {
    const { getByTestId } = renderLogin();
    expect(getByTestId('crew-id').props.placeholder).toBe('Crew ID');
    expect(getByTestId('crew-pw').props.placeholder).toBe('Password');
  });

  // Ryan 2026-09-11: the reveal control is an eye glyph, not a "Show"/"Hide" text link.
  it('reveals the password with the eye toggle', () => {
    const { getByTestId, queryByText } = renderLogin();
    expect(getByTestId('crew-pw').props.secureTextEntry).toBe(true);
    fireEvent.press(getByTestId('toggle-pw'));
    expect(getByTestId('crew-pw').props.secureTextEntry).toBe(false);
    expect(queryByText('Show')).toBeNull();
    expect(getByTestId('toggle-pw').props.accessibilityLabel).toBe('Hide password');
  });

  it('no longer carries the "sign in securely" footnote', () => {
    const { queryByText } = renderLogin();
    expect(queryByText(/sign in securely/i)).toBeNull();
    expect(queryByText(/own crew portal/i)).toBeNull();
  });

  it('keeps the rows working: airline opens the picker, Crew ID accepts typing', () => {
    const { getByTestId, queryByTestId } = renderLogin();
    expect(queryByTestId('airline-search')).toBeNull();
    fireEvent.press(getByTestId('airline-dropdown'));
    expect(getByTestId('airline-search')).toBeTruthy();
    fireEvent.changeText(getByTestId('crew-id'), 'J4002');
    expect(getByTestId('crew-id').props.value).toBe('J4002');
  });
});
