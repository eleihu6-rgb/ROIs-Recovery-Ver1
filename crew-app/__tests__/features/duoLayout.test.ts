// iPhone Duo fit: only the unfolded inner screen gets the wide layout; a regular
// iPhone and the Duo's outer screen must stay on the existing compact layout.
import { ALL_ORIENTATIONS, WIDE_MIN_WIDTH, layoutFor } from '../../src/components/v2/useLayout';

describe('layoutFor (iPhone vs iPhone Duo)', () => {
  it('keeps a regular iPhone (iPhone Air 420x912) compact', () => {
    expect(layoutFor(420, 912).wide).toBe(false);
  });

  it('keeps the Duo outer screen (~466x678) compact', () => {
    expect(layoutFor(466, 678).wide).toBe(false);
  });

  it('switches the Duo inner screen (~951x669 landscape) to wide', () => {
    expect(layoutFor(951, 669)).toEqual({ width: 951, height: 669, wide: true });
  });

  it('uses the documented breakpoint exactly', () => {
    expect(layoutFor(WIDE_MIN_WIDTH - 1, 800).wide).toBe(false);
    expect(layoutFor(WIDE_MIN_WIDTH, 800).wide).toBe(true);
  });
});

describe('Modal orientations', () => {
  it('allows every orientation so a dialog never snaps the inner screen to portrait', () => {
    expect(ALL_ORIENTATIONS).toEqual(['portrait', 'landscape', 'landscape-left', 'landscape-right']);
  });
});
