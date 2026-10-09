// Home ▸ Quick actions carries a "Meal" tile that opens the meal-preference page.
import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';

import {HomeScreen} from '../../src/features/v2/HomeScreen';

const mockNavigate = jest.fn();
const mockState = {
  auth: {airline: 'TG', crewId: '35459', password: 'pw', mode: 'crew', carrier: 'TG', base: 'BKK'},
  settings: {timeZoneMode: 'utc', baseTimeZone: 'Asia/Bangkok'},
  notifications: {notifications: []},
  alarms: {enabled: false},
  trips: {trips: []},
  duties: {duties: []},
  meetings: {meetings: []},
};
type Node = { children: Array<Node | string> };
/** Concatenated text under a node (jest-native matchers are not loaded here). */
const textOf = (n: Node): string => n.children.map(c => (typeof c === 'string' ? c : textOf(c))).join('');

jest.mock('../../src/store', () => ({
  useAppSelector: (selector: (s: typeof mockState) => unknown) => selector(mockState),
}));
jest.mock('react-native-safe-area-context', () => ({useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0})}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn()}),
  useFocusEffect: jest.fn(),
}));
beforeEach(() => jest.clearAllMocks());

it('opens the Meal page from a Home quick action', () => {
  const screen = render(<HomeScreen />);
  expect(textOf(screen.getByTestId('qa-meal') as unknown as Node)).toMatch('Meal');
  fireEvent.press(screen.getByTestId('qa-meal'));
  expect(mockNavigate).toHaveBeenCalledWith('Meal');
});
