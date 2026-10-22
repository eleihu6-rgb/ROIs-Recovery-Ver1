import React from 'react';
import { act, render } from '@testing-library/react-native';

import { LoginCaptureScreen } from '../../src/features/auth/LoginCaptureScreen';
import { saveDuties } from '../../src/features/roster/dutiesSlice';
import { saveTrips } from '../../src/features/travel/tripsPersistence';

const mockDispatch = jest.fn();
let captureProps: Record<string, unknown> | undefined;

jest.mock('../../src/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: { settings: { themePreset: null } }) => unknown) =>
    selector({ settings: { themePreset: null } }),
}));

jest.mock('../../src/features/travel/PortalCaptureScreen', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    PortalCaptureScreen: (props: Record<string, unknown>) => {
      captureProps = props;
      return ReactModule.createElement(View, { testID: 'portal-capture-stub' });
    },
  };
});

jest.mock('../../src/features/travel/tripsPersistence', () => ({
  saveTrips: jest.fn(async () => undefined),
}));

jest.mock('../../src/features/roster/dutiesSlice', () => {
  const actual = jest.requireActual('../../src/features/roster/dutiesSlice');
  return { ...actual, saveDuties: jest.fn(async () => undefined) };
});

const route = {
  params: {
    airline: 'PR',
    crewId: '433535',
    password: 'secure-runtime-value',
    keepLogin: false,
  },
} as never;

const navigation = { goBack: jest.fn() } as never;

describe('LoginCaptureScreen airline isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    captureProps = undefined;
  });

  it('replaces trips and empty duties at a fresh login boundary', async () => {
    render(<LoginCaptureScreen route={route} navigation={navigation} />);
    const trips = [{ id: 'pr-trip', crewId: '433535', legs: [] }];

    await act(async () => {
      await (captureProps?.onCaptured as (
        nextTrips: unknown[],
        nextDuties: unknown[],
      ) => Promise<void>)(trips, []);
    });

    expect(mockDispatch).toHaveBeenNthCalledWith(1, {
      type: 'trips/setTrips',
      payload: trips,
    });
    expect(mockDispatch).toHaveBeenNthCalledWith(2, {
      type: 'duties/setDuties',
      payload: [],
    });
    expect(saveTrips).toHaveBeenCalledWith(trips);
    expect(saveDuties).toHaveBeenCalledWith([]);
    expect(mockDispatch).toHaveBeenLastCalledWith(expect.any(Function));
  });
});
