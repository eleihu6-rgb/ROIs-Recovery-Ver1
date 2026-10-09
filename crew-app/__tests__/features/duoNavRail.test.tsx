import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { PillDock } from '../../src/components/v2/PillDock';
import { layoutFor } from '../../src/components/v2/useLayout';
import { PALETTES } from '../../src/theme/carrier';
import rbotReducer from '../../src/features/rbot/rbotSlice';

const mockInsets = { current: { top: 0, right: 0, bottom: 0, left: 0 } };
const mockLayout = { current: layoutFor(420, 912) };
const mockStackNavigate = jest.fn();
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets.current,
}));
jest.mock('../../src/components/v2/useLayout', () => ({
  ...jest.requireActual('../../src/components/v2/useLayout'),
  useLayout: () => mockLayout.current,
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockStackNavigate }),
}));

const routes = [
  { key: 'home', name: 'Home' },
  { key: 'schedule', name: 'Schedule' },
  { key: 'global', name: 'Global' },
  { key: 'profile', name: 'Profile' },
];
const mockTabNavigate = jest.fn();
const mockEmit = jest.fn(() => ({ defaultPrevented: false }));
const props = {
  state: { index: 1, routes },
  descriptors: Object.fromEntries(routes.map(route => [route.key, { options: { tabBarLabel: route.name } }])),
  navigation: { emit: mockEmit, navigate: mockTabNavigate },
  palette: PALETTES.light,
} as unknown as React.ComponentProps<typeof PillDock>;

function mount(palette = PALETTES.light) {
  const store = configureStore({ reducer: { rbot: rbotReducer } });
  return render(<Provider store={store}><PillDock {...props} palette={palette} /></Provider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInsets.current = { top: 0, right: 0, bottom: 0, left: 0 };
  mockLayout.current = layoutFor(420, 912);
});

describe('Duo inner-screen right-edge navigation', () => {
  it('groups the tabs and AI in the right strip on the unfolded portrait screen', () => {
    mockInsets.current = { top: 0, right: 0, bottom: 20, left: 0 };
    mockLayout.current = layoutFor(669, 951);
    const tree = mount();
    const rail = tree.getByTestId('duo-nav-rail');
    expect(StyleSheet.flatten(rail.props.style)).toMatchObject({ right: 14, bottom: 82, width: 56 });
    for (const route of routes) {
      expect(within(rail).getByTestId(`tab-${route.name.toLowerCase()}`)).toBeTruthy();
    }
    expect(within(rail).queryByTestId('rail-rbot')).toBeNull();
    expect(tree.getByTestId('rail-rbot')).toBeTruthy();
    expect(tree.queryByTestId('dock-rbot')).toBeNull();
  });

  it('uses the same grouped right rail on the Duo outer portrait screen', () => {
    mockInsets.current = { top: 0, right: 0, bottom: 20, left: 0 };
    mockLayout.current = layoutFor(466, 678);
    const tree = mount();
    const rail = tree.getByTestId('duo-nav-rail');
    expect(StyleSheet.flatten(rail.props.style)).toMatchObject({ right: 14, bottom: 82, width: 56 });
    for (const route of routes) expect(within(rail).getByTestId(`tab-${route.name.toLowerCase()}`)).toBeTruthy();
    expect(within(rail).queryByTestId('rail-rbot')).toBeNull();
    expect(tree.getByTestId('rail-rbot')).toBeTruthy();
    expect(tree.queryByTestId('duo-cover-dock')).toBeNull();
    expect(tree.queryByTestId('dock-rbot')).toBeNull();
  });

  it('groups four tabs below page actions while AI remains separate, with working navigation', () => {
    mockInsets.current = { top: 0, right: 84, bottom: 20, left: 0 };
    mockLayout.current = layoutFor(951, 669);
    const tree = mount();
    const rail = tree.getByTestId('duo-nav-rail');
    expect(StyleSheet.flatten(rail.props.style)).toMatchObject({ right: 14, bottom: 82, width: 56 });
    for (const route of routes) {
      expect(within(rail).getByTestId(`tab-${route.name.toLowerCase()}`)).toBeTruthy();
    }
    expect(within(rail).queryByTestId('rail-rbot')).toBeNull();
    expect(tree.getByTestId('rail-rbot')).toBeTruthy();
    expect(tree.queryByTestId('dock-rbot')).toBeNull();
    expect(tree.getByTestId('tab-schedule').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(tree.getByTestId('tab-home'));
    expect(mockEmit).toHaveBeenCalledWith({ type: 'tabPress', target: 'home', canPreventDefault: true });
    expect(mockTabNavigate).toHaveBeenCalledWith('Home');
    fireEvent.press(tree.getByTestId('rail-rbot'));
    expect(mockStackNavigate).toHaveBeenCalledWith('RBot', { source: { route: 'Schedule', view: 'timeline' } });
  });

  it.each([
    [420, 912, 'regular iPhone'],
    [834, 1210, 'iPad portrait'],
    [1210, 834, 'iPad landscape'],
  ])('keeps the bottom dock at %i × %i (%s)', (width, height) => {
    mockInsets.current = { top: 0, right: 0, bottom: 20, left: 0 };
    mockLayout.current = layoutFor(width, height);
    const tree = mount();
    expect(tree.queryByTestId('duo-nav-rail')).toBeNull();
    expect(tree.getByTestId('dock-rbot')).toBeTruthy();
    expect(tree.queryByTestId('rail-rbot')).toBeNull();
  });

  it('keeps the bottom dock for a wide window without the Duo right status strip', () => {
    mockLayout.current = layoutFor(951, 669);
    const tree = mount();
    expect(tree.queryByTestId('duo-nav-rail')).toBeNull();
  });

  it('uses the dark palette for the rail and keeps the active tab legible', () => {
    mockInsets.current = { top: 0, right: 84, bottom: 20, left: 0 };
    mockLayout.current = layoutFor(951, 669);
    const tree = mount(PALETTES.sia);
    expect(StyleSheet.flatten(tree.getByTestId('duo-nav-rail').props.style)).toMatchObject({
      backgroundColor: PALETTES.sia.frost,
      borderColor: PALETTES.sia.frostLine,
    });
    expect(StyleSheet.flatten(tree.getByTestId('tab-schedule').props.style)).toMatchObject({
      backgroundColor: PALETTES.sia.btn,
    });
  });
});
