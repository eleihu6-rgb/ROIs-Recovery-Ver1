import React from 'react';
import { act, render } from '@testing-library/react-native';
import { PortalCaptureScreen } from '../../src/features/travel/PortalCaptureScreen';
import { createPortalClient } from '../../src/features/portal/portalClient';
import { parsePortalCaptures } from '../../src/features/travel/portalCapture';

let mockWebViewProps: Record<string, any> | undefined;

jest.mock('../../src/features/portal/portalClient', () => ({
  createPortalClient: jest.fn(),
}));

jest.mock('../../src/features/travel/portalCapture', () => ({
  parsePortalCaptures: jest.fn(),
}));

jest.mock('../../src/features/travel/portalDebug', () => ({
  debugSetJson: jest.fn(),
}));

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: React.forwardRef((props: Record<string, any>, ref: React.Ref<unknown>) => {
      mockWebViewProps = props;
      React.useImperativeHandle(ref, () => ({ injectJavaScript: jest.fn() }));
      return React.createElement(View, { testID: props.testID });
    }),
  };
});

const mockedCreatePortalClient = jest.mocked(createPortalClient);
const mockedParsePortalCaptures = jest.mocked(parsePortalCaptures);
const trips = [{ id: 'trip-test', legs: [{ fltNumber: 'PR123' }] }] as never[];
const duties = [] as never[];

function sendCapture(url: string, body = '{"payload":"test"}') {
  act(() => mockWebViewProps?.onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'capture', url, body }) } }));
}

async function mountCapture(portalUrl = 'https://crew-pal-sea-tst.roiscloud.com/pefg/portal/login') {
  const onCaptured = jest.fn();
  const token = jest.fn().mockResolvedValue('test-token');
  mockedCreatePortalClient.mockReturnValue({ token } as never);
  mockedParsePortalCaptures.mockReturnValue({ trips, legCount: 24, duties } as never);
  const screen = render(
    <PortalCaptureScreen
      onClose={jest.fn()}
      onCaptured={onCaptured}
      portalUrl={portalUrl}
      crewId="crew-test"
      password="test-password"
      carrier="PR"
    />,
  );
  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
  expect(token).toHaveBeenCalledTimes(portalUrl.includes('roiscloud') ? 1 : 0);
  expect(mockWebViewProps?.onMessage).toEqual(expect.any(Function));
  if (portalUrl.includes('roiscloud')) expect(screen.getByText('Loading roster…')).toBeTruthy();
  return onCaptured;
}

describe('PortalCaptureScreen completion timing', () => {
  it('preserves automatic capture for other portal endpoint names', async () => {
    const onCaptured = await mountCapture('https://portal.example.test/login');
    sendCapture('/custom/roster');
    await act(async () => { jest.advanceTimersByTime(4000); });
    expect(onCaptured).toHaveBeenCalledTimes(1);
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockWebViewProps = undefined;
  });

  afterEach(() => jest.useRealTimers());

  it('completes once after a roster capture despite unrelated JSON chatter', async () => {
    const onCaptured = await mountCapture();
    sendCapture('/api/rosterFlight/selectPortalCalendar?month=one');

    for (let tick = 0; tick < 9; tick += 1) {
      await act(async () => {
        jest.advanceTimersByTime(500);
        sendCapture(`/unrelated/heartbeat/${tick}`, `{"heartbeat":${tick}}`);
      });
    }

    expect(onCaptured).toHaveBeenCalledTimes(1);
    expect(onCaptured).toHaveBeenCalledWith(trips, duties);
  });

  it('completes quickly after all nine roster payloads and cannot complete twice', async () => {
    const onCaptured = await mountCapture();
    const urls = [
      'selectPortalCalendar?month=a', 'selectCrewRosterReport?month=a', 'selectPortalCalendarDetailAll?month=a',
      'selectPortalCalendar?month=b', 'selectCrewRosterReport?month=b', 'selectPortalCalendarDetailAll?month=b',
      'selectPortalCalendar?month=c', 'selectCrewRosterReport?month=c', 'selectPortalCalendarDetailAll?month=c',
    ];
    urls.forEach(url => sendCapture(`/api/rosterFlight/${url}`));
    expect(mockedParsePortalCaptures).toHaveBeenCalledTimes(9);

    await act(async () => { jest.advanceTimersByTime(600); });
    expect(onCaptured).toHaveBeenCalledTimes(1);

    sendCapture('/api/rosterFlight/selectCrewRosterReport?month=late', '{"late":"extra"}');
    await act(async () => { jest.advanceTimersByTime(5_000); });
    expect(onCaptured).toHaveBeenCalledTimes(1);
  });

  it('does not treat repeated responses from one roster URL as complete, and keeps the original fallback deadline', async () => {
    const onCaptured = await mountCapture();
    const url = '/api/rosterFlight/selectPortalCalendar?month=same';
    sendCapture(url, '{"rev":0}');
    for (let revision = 1; revision <= 8; revision += 1) {
      sendCapture(url, JSON.stringify({ revision, payload: 'x'.repeat(revision) }));
    }

    await act(async () => { jest.advanceTimersByTime(600); });
    expect(onCaptured).not.toHaveBeenCalled();

    for (let revision = 9; revision <= 14; revision += 1) {
      await act(async () => {
        jest.advanceTimersByTime(500);
        sendCapture(url, JSON.stringify({ revision, payload: 'x'.repeat(revision) }));
      });
    }
    expect(onCaptured).not.toHaveBeenCalled();

    await act(async () => { jest.advanceTimersByTime(400); });
    expect(onCaptured).toHaveBeenCalledTimes(1);
    expect(onCaptured).toHaveBeenCalledWith(trips, duties);
  });
});
