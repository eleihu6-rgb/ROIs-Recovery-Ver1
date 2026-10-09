// iPhone Duo fit: only the unfolded inner screen leaves the compact layout — a
// regular iPhone and the Duo's outer screen must stay on the existing layout.
// Landscape inner = wide (two columns), rotated inner = tall (one denser column).
import {
  ALL_ORIENTATIONS,
  TALL_MIN_WIDTH,
  WIDE_MIN_WIDTH,
  duoActionStripWidth,
  layoutClassFor,
  layoutFor,
} from '../../src/components/v2/useLayout';

describe('layoutFor (iPhone vs iPhone Duo)', () => {
  it('reserves the portrait inner action strip when rotation reports no right inset', () => {
    expect(duoActionStripWidth(669, 951, 0)).toBe(84);
    expect(duoActionStripWidth(951, 669, 84)).toBe(84);
    expect(duoActionStripWidth(420, 912, 0)).toBe(0);
    expect(duoActionStripWidth(466, 678, 0)).toBe(84);
    expect(duoActionStripWidth(834, 1210, 0)).toBe(0);
  });

  it('keeps a regular iPhone (iPhone Air 420x912) compact', () => {
    expect(layoutFor(420, 912)).toEqual({ width: 420, height: 912, wide: false, tall: false, layout: 'compact' });
  });

  it('keeps the Duo outer screen (~466x678) compact', () => {
    expect(layoutFor(466, 678).layout).toBe('compact');
  });

  it('switches the Duo inner screen (~951x669 landscape) to wide', () => {
    expect(layoutFor(951, 669)).toEqual({ width: 951, height: 669, wide: true, tall: false, layout: 'wide' });
  });

  it('switches the Duo inner screen rotated to portrait (~669x951) to tall', () => {
    expect(layoutFor(669, 951)).toEqual({ width: 669, height: 951, wide: false, tall: true, layout: 'tall' });
  });

  it('uses the documented breakpoints exactly', () => {
    expect(layoutClassFor(TALL_MIN_WIDTH - 1)).toBe('compact');
    expect(layoutClassFor(TALL_MIN_WIDTH)).toBe('tall');
    expect(layoutClassFor(WIDE_MIN_WIDTH - 1)).toBe('tall');
    expect(layoutClassFor(WIDE_MIN_WIDTH)).toBe('wide');
  });
});

describe('layoutFor (iPad reuses the Duo inner-screen layouts)', () => {
  it.each([744, 820, 1032, 1376])('uses wide at iPad window width %i', width => {
    expect(layoutFor(width, 1366).layout).toBe('wide');
  });
  it('puts iPad Pro 11-inch full screen on wide in both orientations (834x1210 / 1210x834)', () => {
    expect(layoutFor(834, 1210).layout).toBe('wide');
    expect(layoutFor(1210, 834).layout).toBe('wide');
  });

  it('follows the live window in Split View: 1/3 compact, 1/2 tall', () => {
    expect(layoutFor(320, 834).layout).toBe('compact');
    expect(layoutFor(597, 834).layout).toBe('tall');
  });
});

describe('Modal orientations', () => {
  it('allows every orientation so a dialog never snaps the inner screen (or an upside-down iPad) to portrait', () => {
    expect(ALL_ORIENTATIONS).toEqual(['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']);
  });
});
