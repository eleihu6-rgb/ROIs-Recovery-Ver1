import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

const renderCapture = (node: React.ReactElement) => render(
  <SafeAreaProvider initialMetrics={safeAreaMetrics}>{node}</SafeAreaProvider>,
);

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

    const screen = renderCapture(
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

  it('does not build or mount the WebView path for PR native login', async () => {
    const raw = jest.fn(async () => ({ code: 0, message: null, data: [] }));
    mockedCreatePortalClient.mockReturnValue({
      token: jest.fn().mockResolvedValue('test-session-token'),
      raw,
    } as never);

    const screen = renderCapture(
      <PortalCaptureScreen
        onClose={onClose}
        onCaptured={onCaptured}
        portalUrl="https://crew-pal-sea-tst.roiscloud.com/pefg/portal/login"
        crewId="452320"
        password="test-only"
        carrier="PR"
      />,
    );

    await waitFor(() => expect(raw).toHaveBeenCalledTimes(9));
    expect(mockedBuildInjectedJS).not.toHaveBeenCalled();
    expect(screen.queryByTestId('portal-capture-web')).toBeNull();
  });
});
