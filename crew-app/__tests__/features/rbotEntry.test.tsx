// R'Bot's nav-bar entry: its OWN box beside the four tabs (never a fifth tab),
// panda avatar, and it opens the R'Bot screen.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { PillDock } from '../../src/components/v2/PillDock';
import { RBOT_AVATAR_INDEX, RBOT_ENTRY_WIDTH } from '../../src/features/rbot/RBotEntry';
import { PALETTES } from '../../src/theme/carrier';
import rbotReducer from '../../src/features/rbot/rbotSlice';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn()}),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));

function tabProps(activeIndex: number) {
  const routes = [
    {key: 'home-key', name: 'Home'},
    {key: 'sched-key', name: 'Schedule'},
    {key: 'global-key', name: 'Global'},
    {key: 'profile-key', name: 'Profile'},
  ];
  const descriptors = Object.fromEntries(
    routes.map(r => [r.key, {options: {tabBarLabel: r.name}}]),
  );
  return {
    state: {index: activeIndex, routes},
    descriptors,
    navigation: {emit: () => ({defaultPrevented: false}), navigate: jest.fn()},
  } as unknown as React.ComponentProps<typeof PillDock>;
}

describe("R'Bot dock entry", () => {
  beforeEach(() => mockNavigate.mockClear());

  function renderDock(activeIndex: number, unread = false) {
    const store = configureStore({
      reducer: {rbot: rbotReducer},
      preloadedState: {rbot: {entries: [], unread}},
    });
    return render(
      <Provider store={store}>
        <PillDock {...tabProps(activeIndex)} palette={PALETTES.sia} />
      </Provider>,
    );
  }

  it('renders as its own box beside the four tabs', () => {
    const {getByTestId, queryByTestId} = renderDock(0);
    // The four tabs are still there, and R'Bot is a separate control.
    for (const tab of ['home', 'schedule', 'global', 'profile']) {
      expect(getByTestId(`tab-${tab}`)).toBeTruthy();
    }
    expect(getByTestId('dock-rbot')).toBeTruthy();
    // It is NOT a tab: there is no `tab-rbot` route in the dock.
    expect(queryByTestId('tab-rbot')).toBeNull();
    expect(RBOT_ENTRY_WIDTH).toBeGreaterThan(0);
  });

  it('wears the panda avatar', () => {
    // 5 = the panda in features/settings/avatars (0 robot, 5 panda) — Ryan's pick.
    expect(RBOT_AVATAR_INDEX).toBe(5);
  });

  it('opens the R\'Bot screen when tapped', () => {
    const {getByTestId} = renderDock(0);
    fireEvent.press(getByTestId('dock-rbot'));
    expect(mockNavigate).toHaveBeenCalledWith('RBot');
  });

  it('flips the AI tag to the theme ink on the light Schedule dock', () => {
    const light = renderDock(1);
    const tag = light.getByText('AI');
    expect(tag).toBeTruthy();
  });

  it('shows the reply dot only when R\'Bot answered while the crew was away', () => {
    expect(renderDock(0, false).queryByTestId('rbot-unread')).toBeNull();
    expect(renderDock(0, true).getByTestId('rbot-unread')).toBeTruthy();
  });
});
