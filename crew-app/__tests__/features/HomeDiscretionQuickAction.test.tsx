// Home ▸ Quick actions now carries a "Discretion" tile (Ryan, 2026-09-13) that
// opens the crew's own FDP-discretion page — pending requests and history, the
// same pattern as Absence.
import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';

import {HomeScreen} from '../../src/features/v2/HomeScreen';

const mockNavigate = jest.fn();
const mockState = {
  auth: {airline: 'F8', crewId: 'S21001', password: 'pw', mode: 'crew', carrier: 'F8', base: 'ADD'},
  settings: {timeZoneMode: 'utc', baseTimeZone: 'Asia/Addid_Ababa'},
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

it('opens the Discretion page from a Home quick action', () => {
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByTestId('qa-discretion'));
  expect(mockNavigate).toHaveBeenCalledWith('Discretion');
});
