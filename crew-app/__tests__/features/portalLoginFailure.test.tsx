import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PortalCaptureScreen } from '../../src/features/travel/PortalCaptureScreen';
import { createPortalClient } from '../../src/features/portal/portalClient';
import { buildInjectedJS } from '../../src/features/travel/portalInjectedJs';

jest.mock('../../src/features/portal/portalClient', () => ({
  createPortalClient: jest.fn(),
}));

jest.mock('../../src/features/travel/portalInjectedJs', () => ({
  buildInjectedJS: jest.fn(() => 'injected-script'),
  ROSTER_MONTH_OFFSETS: [-1, 0, 1],
}));

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) =>
      React.createElement(View, { ...props, ref }),
    ),
  };
});

const mockedCreatePortalClient = jest.mocked(createPortalClient);
const mockedBuildInjectedJS = jest.mocked(buildInjectedJS);

describe('PortalCaptureScreen native login failure', () => {
  const onClose = jest.fn();
  const onCaptured = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a recoverable error and the exact crew identity when native login rejects', async () => {
    const token = jest.fn().mockRejectedValue(new Error('ERROR_WRONG_PASSWORD'));
    mockedCreatePortalClient.mockReturnValue({
      token,
    } as never);

    const screen = render(
      <PortalCaptureScreen
        onClose={onClose}
        onCaptured={onCaptured}
        portalUrl="https://crew-pal-sea-tst.roiscloud.com/pefg/portal/login"
        crewId="486541"
        password="test-only"
        carrier="PR"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('portal-login-error')).toBeTruthy());
    expect(screen.getByTestId('portal-login-error').props.children).toMatch(/password/i);
    expect(screen.getByTestId('portal-login-identity').props.children).toBe('486541');
    expect(screen.queryByTestId('portal-capture-web')).toBeNull();
    expect(token).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('portal-login-back'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('passes nativeAuth to the injected script after native login succeeds', async () => {
    mockedCreatePortalClient.mockReturnValue({
      token: jest.fn().mockResolvedValue('test-session-token'),
    } as never);

    render(
      <PortalCaptureScreen
        onClose={onClose}
        onCaptured={onCaptured}
        portalUrl="https://crew-pal-sea-tst.roiscloud.com/pefg/portal/login"
        crewId="486541"
        password="test-only"
        carrier="PR"
      />,
    );

    await waitFor(() => expect(mockedBuildInjectedJS).toHaveBeenCalled());
    expect(mockedBuildInjectedJS).toHaveBeenCalledWith(
      '486541',
      'test-only',
      true,
      expect.objectContaining({ nativeAuth: true }),
    );
  });
});
