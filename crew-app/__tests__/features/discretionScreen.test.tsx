import React from 'react';
import {Alert} from 'react-native';
import {render, fireEvent, act} from '@testing-library/react-native';
import {NotificationsScreen} from '../../src/features/notifications/NotificationsScreen';
import {loadNotifications, decideDiscretion} from '../../src/features/notifications/notificationsSlice';
const mockDispatch = jest.fn();
const mockState = {
  auth: {airline: 'F8', crewId: 'S21001', password: 'ephemeral-test-session'},
  settings: {timeZoneMode: 'utc', baseTimeZone: 'Asia/Singapore'},
  notifications: {notifications: [], status: 'ready', error: null, decidingId: null, openDiscretions: [{
    discretionId: 'request1', dutyId: '1', extensionRequestedMin: 60, state: 'pending',
    plannedFdpMin: 660, actualFdpMin: 660, schDep: '2026-09-28T04:00:00Z', schArv: '2026-09-28T15:15:00Z',
    estDep: '2026-09-28T04:00:00Z', estArv: '2026-09-28T15:15:00Z', proposal: {reason: 'Technical delay proposal'},
  }]},
};
jest.mock('../../src/store', () => ({useAppDispatch: () => mockDispatch, useAppSelector: (selector: (s: typeof mockState) => unknown) => selector(mockState)}));
jest.mock('react-native-safe-area-context', () => ({useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0})}));
jest.mock('@react-navigation/native', () => ({useNavigation: () => ({goBack: jest.fn()}), useFocusEffect: (callback: () => void) => {require('react').useEffect(callback, [callback]);}}));
jest.mock('../../src/features/notifications/notificationsSlice', () => ({loadNotifications: jest.fn(), decideDiscretion: jest.fn(), markNotificationReadThunk: jest.fn()}));
beforeEach(() => jest.clearAllMocks());
it('loads notifications using the active non-persisted crew session and displays honest proposal details', () => {
  const screen = render(<NotificationsScreen />);
  expect(loadNotifications).toHaveBeenCalledWith(mockDispatch, {credentials: mockState.auth});
  expect(screen.getByText('Before · UTC')).toBeTruthy();
  expect(screen.getByText('Proposed · UTC')).toBeTruthy();
  expect(screen.getByText('Regulatory assessment pending')).toBeTruthy();
  expect(screen.getByText('Technical delay proposal')).toBeTruthy();
});
it.each([['btn-accept', 'accept'], ['btn-reject', 'reject']] as const)('sends explicit %s using the currently authenticated crew', async (button, decision) => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (decideDiscretion as jest.Mock).mockResolvedValue({state: decision === 'accept' ? 'accepted' : 'rejected'});
  const screen = render(<NotificationsScreen />);
  fireEvent.press(screen.getByTestId(button));
  const confirmation = alert.mock.calls[0][2]?.[1];
  await act(async () => { confirmation?.onPress?.(); });
  expect(decideDiscretion).toHaveBeenCalledWith(mockDispatch, {discretionId: 'request1', decision, credentials: mockState.auth});
  alert.mockRestore();
});
