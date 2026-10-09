// Home ▸ Quick actions ▸ Check-In opens the Check-In page (no longer the Spec preview).
import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';

import {HomeScreen} from '../../src/features/v2/HomeScreen';

const mockNavigate = jest.fn();
const mockState = {
  auth: {airline: 'PR', crewId: '421983', password: 'pw', mode: 'crew', carrier: 'PR', base: 'MNL'},
  settings: {timeZoneMode: 'airport', baseTimeZone: 'Asia/Manila'},
  notifications: {notifications: []},
  alarms: {enabled: false},
  trips: {trips: []},
  duties: {duties: []},
  meetings: {meetings: []},
};

jest.mock('../../src/store', () => ({
  useAppSelector: (selector: (s: typeof mockState) => unknown) => selector(mockState),
}));
jest.mock('react-native-safe-area-context', () => ({useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0})}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn()}),
  useFocusEffect: jest.fn(),
}));
beforeEach(() => jest.clearAllMocks());

it('opens the Check-In page from a Home quick action', () => {
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByTestId('qa-check-in'));
  expect(mockNavigate).toHaveBeenCalledWith('CheckIn');
  expect(mockNavigate).not.toHaveBeenCalledWith('Spec', {id: 'checkin'});
});
