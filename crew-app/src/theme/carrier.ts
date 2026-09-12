import React from 'react';

export type CarrierPreset = 'sia' | 'thai' | 'emerald' | 'graphite' | 'altair';

/** The four colour themes a crew can pick in Profile ▸ Preferences ▸ Appearance.
 *  Exactly the four swatches of the sign-off mock (Ver9 "Airline background").
 *  'altair' is the login-page palette and is deliberately NOT selectable. */
export const THEME_PRESETS = ['sia', 'thai', 'emerald', 'graphite'] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

/** Display names — kept identical to the mock's swatch titles so the app, the
 *  mock and the test flows all use one vocabulary. */
export const THEME_LABELS: Record<CarrierPreset, string> = {
  sia: 'Reference blue',
  thai: 'Thai violet',
  emerald: 'Emerald',
  graphite: 'Graphite',
  altair: 'Altair sage',
};

export function isThemePreset(value: unknown): value is ThemePreset {
  return typeof value === 'string' && (THEME_PRESETS as readonly string[]).includes(value);
}

export interface CarrierPalette {
  g1: string;
  g2: string;
  g3: string;
  g4: string;
  btn: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  frost: string;
  frostLine: string;
  frostStrong: string;
  card: string;
  /** The card surface at (near-)full opacity — for UI that floats OVER a card
   *  (the Schedule roster-view menu), where the translucent `card` would let the
   *  content underneath read through. */
  cardSolid: string;
  cardInk: string;
  cardSoft: string;
  cardLine: string;
  /** Bottom dock when it floats over light content (Schedule's near-white duty
   *  cards): a light tint of the theme's ground + the theme's dark ink for the
   *  icons/labels. A fixed near-black bar read as a foreign slab against the
   *  page, so the bar now belongs to the crew's chosen colour. */
  dockLight: string;
  dockInk: string;
  crit: string;
  warn: string;
  good: string;
}

const shared = {
  ink: '#ffffff',
  inkSoft: 'rgba(255,255,255,.82)',
  inkFaint: 'rgba(255,255,255,.6)',
  frost: 'rgba(255,255,255,.14)',
  frostLine: 'rgba(255,255,255,.22)',
  frostStrong: 'rgba(255,255,255,.24)',
  // 20% translucent so the carrier ground shows through — a pure-white slab on the
  // dark gradient read as a hole punched in the screen (Ryan: "white card with 20%
  // more transparency, not pure white").
  card: 'rgba(241,245,249,0.8)',
  cardSolid: 'rgba(247,250,253,0.97)',
  cardInk: '#1e3a5a',
  cardSoft: '#6c7f93',
  cardLine: '#c9d5e1',
  crit: '#e2574b',
  warn: '#e9a53a',
  good: '#3fa66d',
} as const;

export const PALETTES: Record<CarrierPreset, CarrierPalette> = {
  sia: { g1: '#1e4a76', g2: '#2b6191', g3: '#4c82b2', g4: '#77a3cb', btn: '#2f6ba6', dockLight: '#adc8e0', dockInk: '#1e4a76', ...shared },
  thai: { g1: '#4a1670', g2: '#5e2a86', g3: '#8a4aa8', g4: '#b989cf', btn: '#7a3aa0', dockLight: '#d5b8e2', dockInk: '#4a1670', ...shared },
  emerald: { g1: '#14463c', g2: '#1f5c4e', g3: '#3d8270', g4: '#7fb3a3', btn: '#2a7461', dockLight: '#b2d1c8', dockInk: '#14463c', ...shared },
  graphite: { g1: '#1f272e', g2: '#2b353d', g3: '#4a5761', g4: '#7f8d98', btn: '#3f4f5c', dockLight: '#b2bbc1', dockInk: '#1f272e', ...shared },
  altair: { g1: '#1e3d38', g2: '#2c5a52', g3: '#4a8074', g4: '#87b3a6', btn: '#3d7367', dockLight: '#b7d1c9', dockInk: '#1e3d38', ...shared },
};

export function presetForAirline(code: string | null | undefined): CarrierPreset {
  switch (code) {
    case 'TG':
      return 'sia';
    case 'ET':
      return 'emerald';
    default:
      return 'sia';
  }
}

/** Single source of the theme precedence rule: an explicit crew choice wins,
 *  otherwise the logged-in airline's own colour. Used by V2Navigator, which
 *  feeds every screen through CarrierContext. */
export function resolveTheme(
  chosen: ThemePreset | null | undefined,
  airline: string | null | undefined,
): ThemePreset {
  if (chosen && isThemePreset(chosen)) {
    return chosen;
  }
  const airlinePreset = presetForAirline(airline);
  return isThemePreset(airlinePreset) ? airlinePreset : 'sia';
}

export function paletteFor(preset: CarrierPreset): CarrierPalette {
  return PALETTES[preset];
}

export const CarrierContext = React.createContext<CarrierPalette>(PALETTES.sia);

export function useCarrier(): CarrierPalette {
  return React.useContext(CarrierContext);
}
