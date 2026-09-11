import React from 'react';

export type CarrierPreset = 'sia' | 'thai' | 'emerald' | 'graphite' | 'altair';

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
  cardInk: string;
  cardSoft: string;
  cardLine: string;
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
  cardInk: '#1e3a5a',
  cardSoft: '#6c7f93',
  cardLine: '#c9d5e1',
  crit: '#e2574b',
  warn: '#e9a53a',
  good: '#3fa66d',
} as const;

export const PALETTES: Record<CarrierPreset, CarrierPalette> = {
  sia: { g1: '#1e4a76', g2: '#2b6191', g3: '#4c82b2', g4: '#77a3cb', btn: '#2f6ba6', ...shared },
  thai: { g1: '#4a1670', g2: '#5e2a86', g3: '#8a4aa8', g4: '#b989cf', btn: '#7a3aa0', ...shared },
  emerald: { g1: '#14463c', g2: '#1f5c4e', g3: '#3d8270', g4: '#7fb3a3', btn: '#2a7461', ...shared },
  graphite: { g1: '#1f272e', g2: '#2b353d', g3: '#4a5761', g4: '#7f8d98', btn: '#3f4f5c', ...shared },
  altair: { g1: '#1e3d38', g2: '#2c5a52', g3: '#4a8074', g4: '#87b3a6', btn: '#3d7367', ...shared },
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

export function paletteFor(preset: CarrierPreset): CarrierPalette {
  return PALETTES[preset];
}

export const CarrierContext = React.createContext<CarrierPalette>(PALETTES.sia);

export function useCarrier(): CarrierPalette {
  return React.useContext(CarrierContext);
}
