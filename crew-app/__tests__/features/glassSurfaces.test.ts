import { glassTint, PALETTES } from '../../src/theme/carrier';

function rgb(hex: string): number[] {
  return (hex.match(/[0-9a-f]{2}/gi) ?? []).map(value => parseInt(value, 16));
}

function composite(surface: string, ground: string): number[] {
  const [, red, green, blue, alpha] = surface.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/) ?? [];
  const tint = [red, green, blue].map(Number);
  return rgb(ground).map((channel, index) => tint[index] * Number(alpha) + channel * (1 - Number(alpha)));
}

function luminance(channels: number[]): number {
  const [r, g, b] = channels.map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function contrast(foreground: string, background: number[]): number {
  const a = luminance(rgb(foreground));
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

it('uses 45% transparent main cards and keeps card text readable', () => {
  for (const palette of Object.values(PALETTES)) {
    const card = composite(palette.card, palette.g1);
    const inset = composite(palette.cardInset, palette.g1);
    const panel = composite(palette.cardSolid, palette.g1);
    const overlay = composite(palette.cardOverlay, palette.g1);
    const cardOpacity = Number(palette.card.match(/,([\d.]+)\)$/)?.[1]);
    const insetOpacity = Number(palette.cardInset.match(/,([\d.]+)\)$/)?.[1]);
    expect(cardOpacity).toBe(0.55);
    expect(insetOpacity).toBe(0.48);
    expect(1 - (1 - cardOpacity) * (1 - insetOpacity)).toBeCloseTo(0.77, 2);
    expect(contrast(palette.cardInk, card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.cardSoft, card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.cardInk, inset)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.cardSoft, panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.cardSoft, overlay)).toBeGreaterThanOrEqual(4.5);
    expect(Number(palette.cardOverlay.match(/,([\d.]+)\)$/)?.[1])).toBeGreaterThanOrEqual(0.95);
    expect(glassTint(palette.dockLight)).toMatch(/^rgba\(\d+,\d+,\d+,0\.8\)$/);
  }
});

it('gives Daylight grouped content a neutral grey surface below the near-white page', () => {
  const p = PALETTES.light;
  for (const ground of [p.g1, p.g2, p.g3, p.g4]) {
    const card = composite(p.card, ground);
    const frost = composite(p.frost, ground);
    expect(luminance(card)).toBeLessThan(luminance(rgb(ground)));
    expect(luminance(frost)).toBeCloseTo(luminance(card), 5);
    expect(contrast(p.cardInk, card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.cardSoft, card)).toBeGreaterThanOrEqual(4.5);
  }
  expect(luminance(composite(p.cardInset, p.g2))).toBeGreaterThan(luminance(composite(p.card, p.g2)));
  expect(luminance(composite(p.cardSolid, p.g2))).toBeLessThan(luminance(rgb(p.g2)));
});
