// AppDialog pop-up polish — Ryan 2026-09-13:
//   1. the header band uses the carrier theme colour (p.btn), not the flooded
//      tone colour, so the pop-up sits inside the app theme;
//   2. the semantic tone moves onto the glyph badge;
//   3. `icon` overrides the tone's default glyph so the header matches the
//      action (e.g. `logout` for the sign-out confirm — never a bare X).
import React from 'react';
import { render, within } from '@testing-library/react-native';
import { AppDialog } from '../../src/components/v2/AppDialog';
import { CarrierContext, PALETTES } from '../../src/theme/carrier';

const p = PALETTES.thai;

const renderDialog = (props: Partial<React.ComponentProps<typeof AppDialog>>) =>
  render(
    <CarrierContext.Provider value={p}>
      <AppDialog visible onClose={() => {}} title="Log out" {...props} />
    </CarrierContext.Provider>,
  );

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...(Array.isArray(style) ? style : [style]).filter(Boolean));

describe('AppDialog polish', () => {
  it('paints the header band in the carrier theme colour, not the tone colour', () => {
    const { getByTestId } = renderDialog({ tone: 'destructive' });
    const band = flatten(getByTestId('app-dialog-band').props.style);
    expect(band.backgroundColor).toBe(p.btn); // theme-aligned
    expect(band.backgroundColor).not.toBe(p.crit); // no flooded red block
  });

  it('carries the semantic tone on the glyph badge', () => {
    const { getByTestId } = renderDialog({ tone: 'destructive' });
    const glyph = flatten(getByTestId('app-dialog-glyph').props.style);
    expect(glyph.backgroundColor).toBe(p.crit); // destructive badge stays red
  });

  const LOGOUT_PATH = 'M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l5 4-5 4M20 12H9';
  const TRIANGLE_PATH = 'M10.3 4.3 2.6 17.6A2 2 0 0 0 4.3 20.6h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z';
  const CLOSE_PATH = 'M6.5 6.5l11 11M17.5 6.5l-11 11';

  it('renders the action icon in the badge when `icon` is passed, overriding the tone glyph', () => {
    const { getByTestId } = renderDialog({ tone: 'destructive', icon: 'logout' });
    const badge = within(getByTestId('app-dialog-glyph'));
    // door-with-arrow logout mark present, tone's default triangle absent.
    expect(badge.UNSAFE_queryAllByProps({ d: LOGOUT_PATH }).length).toBeGreaterThan(0);
    expect(badge.UNSAFE_queryAllByProps({ d: TRIANGLE_PATH })).toHaveLength(0);
  });

  it('falls back to a caution glyph (not a bare X) for a destructive confirm', () => {
    const { getByTestId } = renderDialog({ tone: 'destructive' });
    const badge = within(getByTestId('app-dialog-glyph'));
    // The header badge shows the caution triangle, never the bare close X.
    expect(badge.UNSAFE_queryAllByProps({ d: TRIANGLE_PATH }).length).toBeGreaterThan(0);
    expect(badge.UNSAFE_queryAllByProps({ d: CLOSE_PATH })).toHaveLength(0);
  });
});
