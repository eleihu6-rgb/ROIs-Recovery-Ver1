// iPhone Duo fit: only the unfolded inner screen leaves the compact layout — a
// regular iPhone and the Duo's outer screen must stay on the existing layout.
// Landscape inner = wide (two columns), rotated inner = tall (one denser column).
import {
  ALL_ORIENTATIONS,
  TALL_MIN_WIDTH,
  WIDE_MIN_WIDTH,
  layoutClassFor,
  layoutFor,
} from '../../src/components/v2/useLayout';

describe('layoutFor (iPhone vs iPhone Duo)', () => {
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

describe('Modal orientations', () => {
  it('allows every orientation so a dialog never snaps the inner screen to portrait', () => {
    expect(ALL_ORIENTATIONS).toEqual(['portrait', 'landscape', 'landscape-left', 'landscape-right']);
  });
});
