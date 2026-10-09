import React from 'react';

export type CarrierPreset = 'sia' | 'thai' | 'emerald' | 'emirates' | 'graphite' | 'altair' | 'light';

/** The four airline swatches plus Daylight in Profile ▸ Preferences ▸ Appearance.
 *  'altair' is the login-page palette and is deliberately NOT selectable. */
export const THEME_PRESETS = ['sia', 'thai', 'emerald', 'graphite', 'light'] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

/** Display names — kept identical to the mock's swatch titles so the app, the
 *  mock and the test flows all use one vocabulary. */
export const THEME_LABELS: Record<CarrierPreset, string> = {
  sia: 'Reference blue',
  thai: 'Thai violet',
  emerald: 'Emerald',
  emirates: 'Emirates red',
  graphite: 'Graphite',
  altair: 'Altair sage',
  light: 'Daylight',
};

export function isThemePreset(value: unknown): value is ThemePreset {
  return typeof value === 'string' && (THEME_PRESETS as readonly string[]).includes(value);
}

/** Any preset we have a palette for — a crew-selectable theme OR a carrier-only
 *  default such as Emirates red, which must never appear as a swatch. */
function isCarrierPreset(value: unknown): value is CarrierPreset {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PALETTES, value);
}

export interface CarrierPalette {
  isLight: boolean;
  mapBg: string;
  mapLand: string;
  mapRoute: string;
  mapMutedRoute: string;
  mapPanel: string;
  mapLabel: string;
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
  /** Lighter glass for selected controls and tiles sitting on a card. */
  cardInset: string;
  /** Stronger glass for floating panels and dialogs. */
  cardSolid: string;
  /** Readable backing when a panel floats over other text. */
  cardOverlay: string;
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
  isLight: false,
  mapBg: '#143f39',
  mapLand: '#87b3a6',
  mapRoute: '#d2e9ef',
  mapMutedRoute: '#8eb3be',
  mapPanel: 'rgba(0,0,0,0.45)',
  mapLabel: '#e0eff2',
  ink: '#ffffff',
  inkSoft: 'rgba(255,255,255,.82)',
  inkFaint: 'rgba(255,255,255,.6)',
  frost: 'rgba(255,255,255,.14)',
  frostLine: 'rgba(255,255,255,.22)',
  frostStrong: 'rgba(255,255,255,.24)',
  // The main schedule surface is 55% opaque (45% transparent). The 48%-opaque
  // inset tiles compound to about 77% opacity when they sit on a card.
  card: 'rgba(241,245,249,0.55)',
  cardInset: 'rgba(247,250,253,0.48)',
  cardSolid: 'rgba(247,250,253,0.70)',
  cardOverlay: 'rgba(247,250,253,0.97)',
  cardInk: '#061624',
  cardSoft: '#061624',
  cardLine: '#c9d5e1',
  crit: '#e2574b',
  warn: '#e9a53a',
  good: '#3fa66d',
} as const;

export const PALETTES: Record<CarrierPreset, CarrierPalette> = {
  sia: { g1: '#1e4a76', g2: '#2b6191', g3: '#4c82b2', g4: '#77a3cb', btn: '#2f6ba6', dockLight: '#adc8e0', dockInk: '#1e4a76', ...shared },
  thai: { g1: '#4a1670', g2: '#5e2a86', g3: '#8a4aa8', g4: '#b989cf', btn: '#7a3aa0', dockLight: '#d5b8e2', dockInk: '#4a1670', ...shared },
  emerald: { g1: '#14463c', g2: '#1f5c4e', g3: '#3d8270', g4: '#7fb3a3', btn: '#2a7461', dockLight: '#b2d1c8', dockInk: '#14463c', ...shared },
  // Emirates' own red ground, so a UAE crew (K1003) never reads as Ethiopian.
  // A carrier default only — it is not an Appearance swatch.
  emirates: { g1: '#4a1013', g2: '#661a1f', g3: '#94303a', g4: '#c98187', btn: '#a81f27', dockLight: '#dfbcbe', dockInk: '#4a1013', ...shared },
  graphite: { g1: '#1f272e', g2: '#2b353d', g3: '#4a5761', g4: '#7f8d98', btn: '#3f4f5c', dockLight: '#b2bbc1', dockInk: '#1f272e', ...shared },
  altair: { g1: '#1e3d38', g2: '#2c5a52', g3: '#4a8074', g4: '#87b3a6', btn: '#3d7367', dockLight: '#b7d1c9', dockInk: '#1e3d38', ...shared },
  light: {
    // iOS semantic background hierarchy: near-white ground, neutral-grey
    // grouped surfaces, lighter inset controls, blue reserved for actions.
    g1: '#f9f9fb', g2: '#f5f5f7', g3: '#f2f2f7', g4: '#ececf1',
    btn: '#0066cc', dockLight: '#ffffff', dockInk: '#1c1c1e',
    ...shared,
    isLight: true,
    mapBg: '#e8e8ed',
    mapLand: '#b8b8c0',
    mapRoute: '#0066cc',
    mapMutedRoute: '#8a9cad',
    mapPanel: 'rgba(255,255,255,0.78)',
    mapLabel: '#55555a',
    ink: '#1c1c1e', inkSoft: '#55555a', inkFaint: '#636368',
    frost: 'rgba(224,224,230,0.55)', frostLine: 'rgba(60,60,67,0.20)',
    frostStrong: 'rgba(255,255,255,0.72)',
    card: 'rgba(224,224,230,0.55)', cardInset: 'rgba(255,255,255,0.48)',
    cardSolid: 'rgba(224,224,230,0.70)', cardOverlay: 'rgba(255,255,255,1)',
    cardInk: '#1c1c1e', cardSoft: '#55555a', cardLine: '#c6c6c8',
    crit: '#b42318', warn: '#825000', good: '#146c2e',
  },
};

export function presetForAirline(code: string | null | undefined): CarrierPreset {
  // A guest / social session carries an EMPTY airline code (it belongs to no
  // carrier): keep the Altair sage the login page already wears rather than
  // borrowing an arbitrary carrier's colour. An absent code keeps the old
  // default so callers that genuinely don't know the carrier are unchanged.
  if (code === '') {
    return 'altair';
  }
  switch (code) {
    case 'TG':
      return 'sia';
    case 'ET':
      return 'emerald';
    case 'EK':
      return 'emirates';
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
): CarrierPreset {
  if (chosen && isThemePreset(chosen)) {
    return chosen;
  }
  const airlinePreset = presetForAirline(airline);
  return isCarrierPreset(airlinePreset) ? airlinePreset : 'sia';
}

export function paletteFor(preset: CarrierPreset): CarrierPalette {
  return PALETTES[preset];
}

/** Keep a carrier tint while letting the page show through floating chrome. */
export function glassTint(hex: string, alpha = 0.8): string {
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

export const CarrierContext = React.createContext<CarrierPalette>(PALETTES.sia);

export function useCarrier(): CarrierPalette {
  return React.useContext(CarrierContext);
}
