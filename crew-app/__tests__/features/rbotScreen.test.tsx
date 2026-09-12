// R'Bot chat screen: the first-run capability card, a real send (thread + crew
// context travel to ai-server), the applied-action chip, and the failure path.
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { RBotScreen } from '../../src/features/rbot/RBotScreen';
import settingsReducer from '../../src/features/settings/settingsSlice';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import tripsReducer from '../../src/features/travel/tripsSlice';
import rbotReducer from '../../src/features/rbot/rbotSlice';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate, goBack: mockGoBack}),
  useIsFocused: () => true,
  // Runs the effect body like a focused screen would (the cleanup only matters
  // on blur/pop, which the Maestro session flow exercises for real).
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(cb, [cb]);
  },
}));

function makeStore() {
  return configureStore({
    reducer: {
      auth: (state = {
        airline: 'TG', crewId: '35459', firstName: 'Kim', base: 'BKK',
      }) => state,
      settings: settingsReducer,
      alarms: alarmsReducer,
      trips: tripsReducer,
      rbot: rbotReducer,
    },
    middleware: getDefaultMiddleware => getDefaultMiddleware({serializableCheck: false}),
  });
}

function renderScreen() {
  const store = makeStore();
  return render(
    <Provider store={store}>
      <RBotScreen />
    </Provider>,
  );
}

function okJson(body: unknown) {
  return {ok: true, status: 200, json: async () => body};
}

describe("R'Bot chat screen", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockGoBack.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens on the greeting, the capability card and the suggestions', () => {
    const {getByTestId, getByText} = renderScreen();
    expect(getByTestId('rbot-screen')).toBeTruthy();
    expect(getByTestId('rbot-welcome')).toBeTruthy();
    expect(getByTestId('rbot-capabilities')).toBeTruthy();
    expect(getByText('What I can do for you')).toBeTruthy();
    expect(getByText('Get around')).toBeTruthy();
    expect(getByTestId('rbot-suggestion-0')).toBeTruthy();
    expect(getByText('Show my route map')).toBeTruthy();
  });

  it('sends the thread + crew context and shows the reply with its applied chip', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okJson({
      role: 'assistant',
      content: 'Opening your route map.',
      actions: [{type: 'navigate', target: 'route_map', label: 'Opened your route map'}],
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const {getByTestId, getByText} = renderScreen();
    fireEvent.changeText(getByTestId('rbot-input'), 'Show my route map');
    await act(async () => {
      fireEvent.press(getByTestId('rbot-send'));
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([{role: 'user', content: 'Show my route map'}]);
    expect(body.context.airline).toBe('TG');
    expect(body.context.crewId).toBe('35459');
    expect(body.context.crewName).toBe('Kim');
    expect(body.context.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await waitFor(() => expect(getByText('Opening your route map.')).toBeTruthy());
    expect(getByTestId('rbot-applied')).toBeTruthy();
    expect(getByText('Opened your route map')).toBeTruthy();
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', {
      screen: 'Schedule',
      params: {view: 'route', viewAt: expect.any(Number)},
    });
  });

  it('keeps the turn in the thread so the next send carries the history', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(okJson({content: 'First.', actions: []}))
      .mockResolvedValueOnce(okJson({content: 'Second.', actions: []}));
    global.fetch = fetchMock as unknown as typeof fetch;

    const {getByTestId, getByText} = renderScreen();
    const input = getByTestId('rbot-input');
    fireEvent.changeText(input, 'one');
    await act(async () => {
      fireEvent.press(getByTestId('rbot-send'));
    });
    await waitFor(() => expect(getByText('First.')).toBeTruthy());

    fireEvent.changeText(input, 'two');
    await act(async () => {
      fireEvent.press(getByTestId('rbot-send'));
    });
    await waitFor(() => expect(getByText('Second.')).toBeTruthy());

    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(second.messages).toEqual([
      {role: 'user', content: 'one'},
      {role: 'assistant', content: 'First.'},
      {role: 'user', content: 'two'},
    ]);
  });

  it('answers an unreachable service with a readable bubble', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network request failed')) as unknown as typeof fetch;

    const {getByTestId, getByText} = renderScreen();
    fireEvent.changeText(getByTestId('rbot-input'), 'hello');
    await act(async () => {
      fireEvent.press(getByTestId('rbot-send'));
    });
    await waitFor(() => expect(getByText('Network request failed')).toBeTruthy());
  });
});
