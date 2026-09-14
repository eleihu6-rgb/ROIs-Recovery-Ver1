import React from 'react';
import renderer from 'react-test-renderer';
import {Provider} from 'react-redux';
import {configureStore} from '@reduxjs/toolkit';
import {Text} from 'react-native';

import {NotificationsScreen} from '../../src/features/notifications/NotificationsScreen';
import notificationsReducer, {
  setFeed,
} from '../../src/features/notifications/notificationsSlice';
import authReducer from '../../src/features/auth/authSlice';
import settingsReducer from '../../src/features/settings/settingsSlice';

// The Alerts screen moved onto the v2 surface: it now carries its own back
// chevron, so it reads the navigation object.
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useNavigation: () => ({canGoBack: () => true, goBack: mockGoBack}),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));

function renderWithPendingDiscretion() {
  const store = configureStore({
    // The screen reads the active crew session (auth) to attach credentials, so
    // the store must carry the auth slice — it was missing and the test crashed.
    reducer: {notifications: notificationsReducer, settings: settingsReducer, auth: authReducer},
  });
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

/** The sick-leave stand-down the crew actually receives (Crew Recovery Story 101). */
function renderWithRosterChange() {
  const store = configureStore({
    reducer: {notifications: notificationsReducer, settings: settingsReducer, auth: authReducer},
  });
  store.dispatch(setFeed({
    cursor: 4,
    notifications: [{
      notifId: 'absence-3',
      crewId: 'J4002',
      type: 'roster_change',
      createdUtc: '2026-09-12T02:54:56.950Z',
      title: 'Sick leave recorded',
      body: '1 flight duty removed for 2026-09-11 – 2026-09-11; ILL added to your roster.',
      status: 'unread',
      readUtc: null,
      seq: 4,
      relatedPairingId: '151529',
      relatedFlightId: null,
      relatedDutyId: null,
      discretionId: null,
      payload: {
        kind: 'absence',
        absenceId: 3,
        absenceType: 'sick',
        assignment: 'ILL',
        fromDate: '2026-09-11',
        toDate: '2026-09-11',
        removedPairingIds: [151529],
        before: [{
          pairingId: 151529,
          date: '2026-09-11',
          legs: [
            {
              fltNum: 'ET422',
              dep: 'ADD',
              arv: 'DMM',
              std: '2026-09-11T07:15:00.000Z',
              sta: '2026-09-11T10:00:00.000Z',
              register: 'ET-AVK',
              fleet: 'B738',
            },
            {
              fltNum: 'ET423',
              dep: 'DMM',
              arv: 'ADD',
              std: '2026-09-11T12:35:00.000Z',
              sta: '2026-09-11T15:00:00.000Z',
              register: 'ET-AVK',
              fleet: 'B738',
            },
          ],
        }],
        after: [{
          date: '2026-09-11',
          assignment: 'ILL',
          label: 'Sick leave',
          base: 'ADD',
        }],
      },
    }],
    openDiscretions: [],
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
  beforeEach(() => mockGoBack.mockClear());

  it('shows pending C90002 FDP discretion details and yes/no actions', () => {
    const tree = renderWithPendingDiscretion();
    const text = tree.root
      .findAllByType(Text)
      .map(node => textContent(node.props.children))
      .join('\n');

    // FDP is a duty property: the card carries the check-in/release window and
    // the single current → proposed FDP row without repeating the proposed value.
    expect(text).toContain('ACTION REQUIRED');
    expect(text).toContain('FDP discretion · Duty PROJ-90002513:1');
    expect(text).toContain('Check-in (report)');
    expect(text).toContain('22 Aug 08:05z');
    expect(text).toContain('9h45');
    expect(text).not.toContain('Revised schedule recalculates FDP');
    expect(text).toContain('Plan limit 14h00 · exceed by 45m');
    expect(text).toContain('Do you agree to a 45 min FDP extension?');
    // Yes sits left of No, so the affirmative is 'Yes · +45m'.
    expect(text).toContain('Yes · +45m');
    expect(text).toContain('No');
  });

  it('lays a roster change out as BEFORE → AFTER, not as prose', () => {
    const tree = renderWithRosterChange();
    const text = tree.root
      .findAllByType(Text)
      .map(node => textContent(node.props.children))
      .join('\n');

    expect(text).toContain('BEFORE');
    expect(text).toContain('AFTER');
    // The duty the crew lost, both legs, with route/date/times/tail.
    expect(text).toContain('ET422 · ADD → DMM');
    expect(text).toContain('ET423 · DMM → ADD');
    // Times follow the crew's own display mode (default 'airport'), so ADD legs
    // read in Addis local time, never as a raw UTC clock.
    expect(text).toContain('11 Sep · 10:15L → 13:00L');
    // The duty they gained.
    expect(text).toContain('ILL · Sick leave');
    expect(text).toContain('11 Sep · ADD');
    // The one-line prose is replaced by the comparison.
    expect(text).not.toContain('1 flight duty removed for 2026-09-11');
  });

  it('gives the pushed screen a way back to Home', () => {
    const tree = renderWithRosterChange();
    const back = tree.root.findByProps({testID: 'alerts-back'});
    back.props.onPress();
    expect(mockGoBack).toHaveBeenCalled();
  });
});
