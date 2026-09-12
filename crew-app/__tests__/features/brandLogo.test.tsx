// Home header brand row: a carrier we have artwork for gets its logo; a carrier
// we do not (PR, F8) gets the app's own Altair mark — never a generic jet
// glyph plus a code the theme already implies (Ryan, 2026-09-11).
import React from 'react';
import { render } from '@testing-library/react-native';

import { BrandLogo } from '../../src/components/v2/BrandLogo';

describe('Home brand row', () => {
  it('falls back to our own mark when the airline logo is not available', () => {
    const tree = render(<BrandLogo airline="PR" />);
    // The carrier is still announced for screen readers…
    expect(tree.getByLabelText('PR')).toBeTruthy();
    // …but the header does not print the code a second time.
    expect(tree.queryByText('PR')).toBeNull();
  });

  it('keeps the airline’s own logo when we have the artwork', () => {
    const tree = render(<BrandLogo airline="TG" />);
    expect(tree.queryByLabelText('TG')).toBeNull();
  });

  // Ryan, 2026-09-11: "EK crew shows ET logo" — a UAE crew (K1003) whose roster
  // is Emirates must carry the Emirates mark, so EK is artwork-driven now.
  it('draws the Emirates mark for EK instead of the generic Altair fallback', () => {
    const tree = render(<BrandLogo airline="EK" />);
    expect(tree.queryByLabelText('EK')).toBeNull();
    expect(tree.toJSON()).toBeTruthy();
  });
});
