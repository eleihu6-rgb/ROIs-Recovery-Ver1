// Flight-number badge colours (fewer-colours rule): every flight uses the SINGLE
// purple brand accent — soft purple tint fill + purple text/border. There is no
// separate short/long-haul hue anymore (the old blue was a second accent).

import { routeColor, routeTintBg } from '../../src/features/travel/tripDisplay';
import { colors } from '../../src/theme';

describe('flight-number badge colours', () => {
  const cases: Array<[string, string]> = [
    ['BKK', 'LHR'], ['BKK', 'SIN'], ['CDG', 'BKK'], ['BKK', 'HKG'], ['BKK', 'CTS'],
  ];

  it('every route uses the purple accent for text/border', () => {
    for (const [d, a] of cases) {
      expect(routeColor(d, a)).toBe(colors.accent);
    }
  });

  it('every route uses the soft purple tint for the badge fill', () => {
    for (const [d, a] of cases) {
      expect(routeTintBg(d, a)).toBe(colors.tintBgSoft);
    }
  });

  it('the fill is a soft tint, never the saturated accent', () => {
    expect(routeTintBg('BKK', 'LHR')).not.toBe(routeColor('BKK', 'LHR'));
  });
});
