// Schedule ▸ Route map ▸ share card model.
//
// The card must say the same thing as the map: same destinations, same month,
// same distance. The stamp overflow rule is the only layout decision that can
// hide information, so it is tested explicitly.
import { PixelRatio } from 'react-native';
import { buildMonth } from '../../src/features/v2/model';
import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  buildRouteShareModel,
  captureSvgBase64,
  shareCaptureSize,
  shareImagePng,
  shareStamps,
} from '../../src/features/v2/routeShare';
import type { RouteDestination } from '../../src/features/v2/schedView';
import type { Trip } from '../../src/features/travel/tripCsv';

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
    {
      crewId: '35459', fltNumber: 'TG911', flightDateUTC: '21 Sep 2026 1030',
      depArp: 'LHR', arvDateUTC: '21 Sep 2026 2230', arvArp: 'BKK', fleet: 'Boeing 777-300',
      hotel: '', localDepTime: '2026-09-21 11:30', localArvTime: '2026-09-22 05:30',
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

function fakeRoute(code: string): RouteDestination {
  return {
    code,
    label: code,
    country: 'TH',
    legs: 2,
    km: 1000,
    position: { lat: 0, lon: 0 },
  };
}

describe('route share card · model', () => {
  it('mirrors the map’s month, base and destinations', () => {
    const model = buildRouteShareModel(month, 'BKK');
    expect(model.monthLabel).toBe('Sep 2026');
    // Month AND year, uppercased for the card's eyebrow.
    expect(model.monthStamp).toBe('SEP 2026');
    expect(model.baseCode).toBe('BKK');
    expect(model.baseLabel).toBe('Suvarnabhumi');
    expect(model.routes.map(route => route.code)).toEqual(['SIN', 'LHR']);
    expect(model.stats.flights).toBe(3);
    expect(model.stats.countries).toBe(3);
    expect(model.stats.km).toBeGreaterThan(0);
  });

  it('is a 4:5 Instagram portrait', () => {
    expect(SHARE_CARD_WIDTH).toBe(1080);
    expect(SHARE_CARD_HEIGHT).toBe(1350);
    expect(SHARE_CARD_WIDTH / SHARE_CARD_HEIGHT).toBeCloseTo(0.8, 5);
  });

  it('draws one stamp per destination while they fit', () => {
    const routes = ['SIN', 'LHR', 'NRT'].map(fakeRoute);
    expect(shareStamps(routes).map(stamp => stamp.code)).toEqual(['SIN', 'LHR', 'NRT']);
    expect(shareStamps(routes).every(stamp => stamp.km !== null)).toBe(true);
  });

  it('turns the last slot into +N when the month has more than eight airports', () => {
    const routes = Array.from({ length: 11 }, (_, i) => fakeRoute(`A${String(i).padStart(2, '0')}`));
    const stamps = shareStamps(routes);
    expect(stamps).toHaveLength(8);
    expect(stamps.slice(0, 7).map(stamp => stamp.code)).toEqual(routes.slice(0, 7).map(route => route.code));
    expect(stamps[7]).toEqual({ code: '+4', km: null });
  });
});

describe('route share card · raster capture', () => {
  it('lays the capture copy out at the print size in points', () => {
    // The native rasteriser draws at the view's own bounds and sizes the canvas
    // by the screen scale, so a 3× phone needs a 360 × 450 pt card to get an
    // exactly 1080 × 1350 PNG.
    jest.spyOn(PixelRatio, 'get').mockReturnValue(3);
    expect(shareCaptureSize()).toEqual({ width: 360, height: 450 });
    jest.spyOn(PixelRatio, 'get').mockReturnValue(2);
    expect(shareCaptureSize()).toEqual({ width: 540, height: 675 });
  });

  it('asks for the size the card is laid out at and strips line wraps out of the base64', async () => {
    const toDataURL = jest.fn((callback: (base64: string) => void, options?: { width: number; height: number }) => {
      expect(options).toEqual({ width: 360, height: 450 });
      callback(' iVBORw0KGgo\nAAAANSUhEUg ==\n');
    });

    await expect(captureSvgBase64({ toDataURL }, 360, 450))
      .resolves.toBe('iVBORw0KGgoAAAANSUhEUg==');
    expect(toDataURL).toHaveBeenCalledTimes(1);
  });

  it('fails loudly when the card is not mounted or renders nothing', async () => {
    await expect(captureSvgBase64(null, 1080, 1350)).rejects.toThrow(/not ready/i);
    await expect(
      captureSvgBase64({ toDataURL: callback => callback('') }, 1080, 1350),
    ).rejects.toThrow(/could not be rendered/i);
  });

  it('reports a build without the native share module instead of silently doing nothing', async () => {
    await expect(shareImagePng('iVBORw0KGgo=')).rejects.toThrow(/not available/i);
  });
});
