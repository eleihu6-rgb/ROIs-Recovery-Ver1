// Trip Trade · My Duty — the destructive "remove a preference" confirm.
//
// Pop-up standard: a two-button confirmation is an AppDialog status card
// (outline Cancel + filled destructive Remove), not a native Alert.
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { MyDutyScreen } from '../../src/features/tripTrade/MyDutyScreen';
import authReducer from '../../src/features/auth/authSlice';
import tripsReducer from '../../src/features/travel/tripsSlice';
import tripTradeReducer, { tripTradeActions } from '../../src/features/tripTrade/tripTradeSlice';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

function makeStore() {
  return configureStore({
    reducer: { auth: authReducer, trips: tripsReducer, tripTrade: tripTradeReducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
  });
}

describe('MyDutyScreen · remove-preference confirm', () => {
  it('confirms in a destructive AppDialog and only removes on Remove', async () => {
    const store = makeStore();
    store.dispatch(tripTradeActions._addGenericWant({
      id: 'g-fra',
      wantsExactDuty: false,
      title: 'FRA layover',
      chips: ['FRA layover'],
      icon: 'target',
    }));

    let component!: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(
        <Provider store={store}>
          <MyDutyScreen />
        </Provider>,
      );
    });

    // Long-press the preference → the confirmation pop-up opens.
    act(() => {
      component.root.findByProps({ testID: 'want-g-fra' }).props.onLongPress();
    });

    expect(component.root.findByProps({ testID: 'myduty-dialog-title' }).props.children).toBe('Remove preference');
    expect(component.root.findByProps({ testID: 'myduty-dialog-message' }).props.children).toBe('Remove “FRA layover”?');
    // Cancel leaves the preference in place.
    act(() => {
      component.root.findByProps({ testID: 'myduty-dialog-cancel' }).props.onPress();
    });
    expect(store.getState().tripTrade.genericWants).toHaveLength(1);

    // Re-open and confirm → the preference is removed and the card closes.
    act(() => {
      component.root.findByProps({ testID: 'want-g-fra' }).props.onLongPress();
    });
    await act(async () => {
      component.root.findByProps({ testID: 'myduty-dialog-confirm' }).props.onPress();
    });
    expect(store.getState().tripTrade.genericWants).toHaveLength(0);
    expect(component.root.findAllByProps({ testID: 'myduty-dialog-title' })).toHaveLength(0);

    act(() => component.unmount());
  });
});
