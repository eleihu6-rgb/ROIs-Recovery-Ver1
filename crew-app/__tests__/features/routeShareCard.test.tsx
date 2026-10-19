// Schedule ▸ Route map ▸ share flow.
//
// The crew taps the paper-plane control, sees the exact card that will be
// shared, and the confirm action hands a rendered PNG to the native sheet.
// Capture and the native hand-off are mocked here; their contracts are covered
// in routeShare.test.ts and the real sheet is exercised on the simulator.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import { RouteMapView } from '../../src/features/v2/RouteMapView';
import { PALETTES } from '../../src/theme/carrier';
import { buildMonth } from '../../src/features/v2/model';
import {
  captureSvgBase64,
  shareCaptureSize,
  shareImagePng,
} from '../../src/features/v2/routeShare';
import type { Trip } from '../../src/features/travel/tripCsv';

jest.mock('../../src/features/v2/routeShare', () => {
  const actual = jest.requireActual('../../src/features/v2/routeShare');
  return {
    ...actual,
    captureSvgBase64: jest.fn(),
    shareImagePng: jest.fn(),
  };
});

const lhrTrip: Trip = {
  id: 'pair-lhr',
  crewId: '35459',
  checkInDateUTC: '19 Sep 2026 1400',
  legs: [
    {
      crewId: '35459', fltNumber: 'TG920', flightDateUTC: '19 Sep 2026 1545',
      depArp: 'BKK', arvDateUTC: '20 Sep 2026 0445', arvArp: 'LHR', fleet: 'Boeing 777-300',
      hotel: 'Hilton Heathrow', localDepTime: '2026-09-19 22:45', localArvTime: '2026-09-20 05:45',
      assignment: 'FLY',
    },
  ],
};

const sinTrip: Trip = {
  id: 'pair-sin',
  crewId: '35459',
  checkInDateUTC: '26 Sep 2026 1700',
  legs: [{
    crewId: '35459', fltNumber: 'TG403', flightDateUTC: '26 Sep 2026 1730',
    depArp: 'BKK', arvDateUTC: '26 Sep 2026 2000', arvArp: 'SIN', fleet: 'Airbus A350-900',
    hotel: '', localDepTime: '2026-09-27 00:30', localArvTime: '2026-09-27 04:00', assignment: 'FLY',
  }],
};

const NOW = new Date('2026-09-12T09:00:00Z');
const month = buildMonth(
  2026, 8, [lhrTrip, sinTrip], [], [],
  'airport', 'Asia/Bangkok', {}, NOW, { minutesBefore: 8, mutedIds: [] },
);

const mockedCapture = captureSvgBase64 as jest.MockedFunction<typeof captureSvgBase64>;
const mockedShare = shareImagePng as jest.MockedFunction<typeof shareImagePng>;

/** SVG text renders as <Text><TSpan>…</TSpan></Text>; RNTL text queries stop at
 *  the host boundary, so flatten the element tree ourselves. */
function textOf(node: ReactTestInstance): string {
  const flatten = (value: unknown): string => {
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(flatten).join('');
    if (value && typeof value === 'object' && 'props' in value) {
      return flatten((value as { props?: { children?: unknown } }).props?.children);
    }
    return '';
  };
  return flatten(node.props.children);
}

function openShare() {
  const tree = render(
    <RouteMapView
      month={month}
      base="BKK"
      palette={PALETTES.sia}
      airlineCode="TG"
      airlineName="THAI"
    />,
  );
  fireEvent(tree.getByTestId('route-map'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 520 } },
  });
  fireEvent.press(tree.getByTestId('route-share'));
  return tree;
}

beforeEach(() => {
  mockedCapture.mockReset();
  mockedShare.mockReset();
  mockedCapture.mockResolvedValue('BASE64_PNG');
  mockedShare.mockResolvedValue(undefined);
});

describe('Route map · share card', () => {
  it('previews the month, year, base and destinations before sharing', () => {
    const tree = openShare();

    expect(tree.getByTestId('route-share-dialog')).toBeTruthy();
    const card = tree.getByTestId('route-share-card');
    expect(card).toBeTruthy();
    // The card's eyebrow is the roster month + year, not "today".
    expect(textOf(tree.getByTestId('route-share-card-month'))).toBe('SEP 2026');
    expect(textOf(tree.getByTestId('route-share-card-base'))).toBe('BKK · SUVARNABHUMI');
    expect(textOf(tree.getByTestId('route-share-card-flights'))).toBe('2');
    expect(textOf(tree.getByTestId('route-share-airline'))).toBe('THAI');
    expect(textOf(tree.getByTestId('route-share-stamp-LHR'))).toBe('LHR');
    expect(textOf(tree.getByTestId('route-share-stamp-SIN'))).toBe('SIN');
  });

  it('rasterises at 1080 × 1350 and hands the PNG to the share sheet', async () => {
    const tree = openShare();

    await act(async () => {
      fireEvent.press(tree.getByTestId('route-share-dialog-confirm'));
    });

    // Captured from the off-screen print-geometry copy, not the 210 pt preview.
    const captureSize = shareCaptureSize();
    expect(mockedCapture).toHaveBeenCalledWith(expect.anything(), captureSize.width, captureSize.height);
    expect(mockedShare).toHaveBeenCalledWith('BASE64_PNG');
    // A successful share closes the preview.
    expect(tree.queryByTestId('route-share-dialog')).toBeNull();
  });

  it('keeps the preview open with a retry message when sharing fails', async () => {
    mockedShare.mockRejectedValueOnce(new Error('no share sheet'));
    const tree = openShare();

    await act(async () => {
      fireEvent.press(tree.getByTestId('route-share-dialog-confirm'));
    });

    expect(tree.getByTestId('route-share-error')).toBeTruthy();
    expect(tree.getByTestId('route-share-error').props.children).toMatch(/could not prepare/i);
    expect(tree.getByTestId('route-share-dialog')).toBeTruthy();
  });
});
