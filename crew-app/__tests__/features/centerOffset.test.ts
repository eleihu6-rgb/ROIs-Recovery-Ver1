import { centerOffset } from '../../src/components/centerOffset';

// The alarm offset pickers must open with the CURRENT value centred (not
// off-screen to the right). centerOffset computes the scroll x for that.
describe('centerOffset', () => {
  it('centres a chip within the visible strip', () => {
    // chip at x=240 width=60 (centre 270), strip width 300 (half 150) ⇒ 120.
    expect(centerOffset(240, 60, 300)).toBe(120);
  });

  it('never scrolls past the start (clamps to 0)', () => {
    // First chip near the left can't be centred without a negative offset.
    expect(centerOffset(0, 50, 300)).toBe(0);
    expect(centerOffset(10, 40, 300)).toBe(0);
  });

  it('scrolls a far-right active chip into view', () => {
    // The 4h chip (index 6) sitting well to the right gets a positive offset.
    expect(centerOffset(420, 56, 320)).toBeGreaterThan(0);
  });
});
