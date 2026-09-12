// Where the installed build identifies itself (Ryan, 2026-09-12): the app
// version moved from Profile ▸ Preferences ▸ About to Profile ▸ Help & Support,
// so the number a crew quotes to support sits on the support page itself.
import React from 'react';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import authReducer from '../../src/features/auth/authSlice';
import settingsReducer from '../../src/features/settings/settingsSlice';
import rbotReducer from '../../src/features/rbot/rbotSlice';
import { SpecPage } from '../../src/features/v2/SpecPage';
import { PreferencesScreen } from '../../src/features/v2/PreferencesScreen';
import { APP_VERSION } from '../../src/version';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: jest.fn(), navigate: jest.fn(), push: jest.fn()}),
  useFocusEffect: jest.fn(),
}));

function makeStore() {
  return configureStore({
    reducer: {auth: authReducer, settings: settingsReducer, rbot: rbotReducer},
    middleware: getDefaultMiddleware => getDefaultMiddleware({serializableCheck: false}),
  });
}

const navigation = {push: jest.fn(), goBack: jest.fn(), navigate: jest.fn()};

describe('app version display', () => {
  it('shows the installed version on Profile ▸ Help & Support', () => {
    const {getByText, getByTestId} = render(
      <Provider store={makeStore()}>
        <SpecPage
          navigation={navigation as never}
          route={{key: 'Spec-1', name: 'Spec', params: {id: 'help'}} as never}
        />
      </Provider>,
    );

    expect(getByTestId('page-help')).toBeTruthy();
    expect(getByText('App version')).toBeTruthy();
    expect(getByText(String(APP_VERSION))).toBeTruthy();
  });

  it('no longer prints the version on Preferences', () => {
    const {queryByText} = render(
      <Provider store={makeStore()}>
        <PreferencesScreen />
      </Provider>,
    );

    expect(queryByText('Version')).toBeNull();
    expect(queryByText(String(APP_VERSION))).toBeNull();
  });
});
