import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { HomeScreen } from '../../src/features/v2/HomeScreen';

const mockNavigate = jest.fn();
const mockState = {
  auth: { airline: 'TG', crewId: '35459', password: 'pw', mode: 'crew', carrier: 'TG', base: 'BKK' },
  settings: { timeZoneMode: 'utc', baseTimeZone: 'Asia/Bangkok' },
  notifications: { notifications: [] },
  alarms: { enabled: false },
  trips: { trips: [] },
  duties: { duties: [] },
  meetings: { meetings: [] },
};

type Node = { children: Array<Node | string> };
const textOf = (node: Node): string => node.children.map(child => typeof child === 'string' ? child : textOf(child)).join('');

jest.mock('../../src/store', () => ({
  useAppSelector: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

it('opens Duty Analyzer from the Home quick action and removes the placeholder More tile', () => {
  const screen = render(<HomeScreen />);
  expect(textOf(screen.getByTestId('qa-analyzer') as unknown as Node)).toBe('Analyzer');
  expect(screen.queryByTestId('qa-more')).toBeNull();
  fireEvent.press(screen.getByTestId('qa-analyzer'));
  expect(mockNavigate).toHaveBeenCalledWith('DutyAnalyzer');
});
