import React from 'react';
import renderer from 'react-test-renderer';
import {Provider} from 'react-redux';
import {configureStore} from '@reduxjs/toolkit';
import {Text} from 'react-native';

import {NotificationsScreen} from '../../src/features/notifications/NotificationsScreen';
import notificationsReducer, {setFeed} from '../../src/features/notifications/notificationsSlice';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));

function renderWithPendingDiscretion() {
  const store = configureStore({reducer: {notifications: notificationsReducer}});
  store.dispatch(setFeed({
    cursor: 1,
    notifications: [],
    openDiscretions: [{
      discretionId: 'd-c90002',
      crewId: 'C90002',
      captainCrewId: 'C90002',
      pairingId: 'PROJ-90002513',
      dutyId: 'PROJ-90002513:1',
      createdUtc: '2026-08-20T05:20Z',
      extensionRequestedMin: 45,
      state: 'pending',
      plannedFdpMin: 585,
      actualFdpMin: 885,
      limitMin: 840,
      schDep: '2026-08-22T08:05:00Z',
      actDep: '2026-08-22T10:05:00Z',
      schArv: '2026-08-22T22:55:00Z',
      actArv: '2026-08-23T00:55:00Z',
      audit: [],
    }],
  }));

  return renderer.create(
    <Provider store={store}>
      <NotificationsScreen />
    </Provider>,
  );
}

function textContent(value: unknown): string {
  if (Array.isArray(value)) return value.map(textContent).join('');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
}

describe('NotificationsScreen', () => {
  it('shows pending C90002 FDP discretion details and yes/no actions', () => {
    const tree = renderWithPendingDiscretion();
    const text = tree.root
      .findAllByType(Text)
      .map(node => textContent(node.props.children))
      .join('\n');

    expect(text).toContain('ACTION REQUIRED');
    expect(text).toContain('Flight delayed 120 min');
    expect(text).toContain('FDP 9h45 (585m) → 14h45 (885m)');
    expect(text).toContain('Accept or reject 45 min FDP discretion.');
    expect(text).toContain('Reject');
    expect(text).toContain('Accept +45m');
  });
});
