// Guard: every colour a crew sees comes from the carrier palette, so choosing a
// different theme in Profile ▸ Preferences ▸ Appearance repaints the whole app.
//
// The v2 UI surface is scanned for hard-coded colours. A file may only carry
// them when it is listed below with a reason:
//   • FULLY_EXEMPT  pure artwork (cartoon faces, logo marks) whose colours are
//                   deliberately outside the theme;
//   • ALLOWED_HEX   app chrome that also paints neutral frost/scrim alphas plus
//                   a couple of art-directed accents — the exact hex values are
//                   whitelisted, so a *new* hard-coded colour still fails here.
// Everything else must be 100% palette-driven.
import fs from 'fs';
import path from 'path';

import { PALETTES, THEME_PRESETS } from '../src/theme/carrier';

const REPO = path.resolve(__dirname, '..');
const SCAN_DIRS = [
  'src/features/v2',
  'src/components/v2',
  'src/features/notifications',
  'src/features/settings',
  'src/features/rbot',
];

const FULLY_EXEMPT: Record<string, string> = {
  'src/features/settings/avatars.tsx':
    'cartoon character artwork — face, cheek and hair colours are part of the drawing',
};

const ALLOWED_HEX: Record<string, { reason: string; values: string[] }> = {
  'src/components/v2/BrandLogo.tsx': {
    reason: 'airline logo artwork',
    values: ['#e0b24c'],
  },
  'src/features/v2/ScheduleScreen.tsx': {
    reason: 'day-scene illustrations (beach / café / standby / training cards)',
    values: [
      '#3fa66d',
      '#5fa8d8',
      '#7a3aa0',
      '#8a5a3a',
      '#8fc7ea',
      '#b8b0d8',
      '#c9a27e',
      '#c9d5e1',
      '#dbeefb',
      '#e2c9ad',
      '#e6ecf3',
      '#e9e6f5',
      '#f6e7d6',
      '#ffd66b',
    ],
  },
  'src/features/v2/ProfileScreen.tsx': {
    reason: 'gold Block-hours figure + status accents (mock art direction)',
    values: ['#e9a53a', '#f2c14e'],
  },
  'src/features/v2/HomeScreen.tsx': {
    reason: 'neutral scrim + frost chip over the destination photo (no solid colours)',
    values: [],
  },
  'src/components/v2/PillDock.tsx': {
    reason: 'neutral frost glass over the carrier ground (no solid colours)',
    values: [],
  },
};

const HEX = /#[0-9a-fA-F]{6}\b/g;
const RGB = /\brgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function relative(file: string): string {
  return path.relative(REPO, file).split(path.sep).join('/');
}

/** WCAG relative luminance (0 = black, 1 = white). */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('theme coverage', () => {
  const files = SCAN_DIRS.flatMap(dir => walk(path.join(REPO, dir)));

  it('scans the whole v2 surface (sanity check on the scan itself)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('has no hard-coded colours outside the reviewed artwork allowlist', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const key = relative(file);
      const source = fs.readFileSync(file, 'utf8');
      const lines = source.split('\n');

      if (FULLY_EXEMPT[key]) {
        continue;
      }

      const allowed = new Set(ALLOWED_HEX[key]?.values ?? []);
      lines.forEach((line, index) => {
        for (const hex of line.match(HEX) ?? []) {
          if (!allowed.has(hex.toLowerCase()) && !allowed.has(hex)) {
            offenders.push(
              `${key}:${index + 1} hard-coded ${hex}` +
                (ALLOWED_HEX[key] ? ` (not in the reviewed list: ${ALLOWED_HEX[key].values.join(', ') || 'none'})` : ' (file is not on the allowlist)'),
            );
          }
        }
        for (const match of line.matchAll(RGB)) {
          const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
          // Only neutral white/black alphas are theme-neutral; anything tinted
          // must come from the palette.
          if (r !== g || g !== b) {
            offenders.push(
              `${key}:${index + 1} hard-coded ${match[0]}) — tinted colours must come from the palette`,
            );
          }
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it('keeps the Schedule dock a light theme tint with dark, readable ink', () => {
    for (const preset of THEME_PRESETS) {
      const pal = PALETTES[preset];
      // Light enough to belong to the page (Ryan: the dark grey bar was too dark)…
      expect(luminance(pal.dockLight)).toBeGreaterThan(0.4);
      // …and lighter than the theme's mid ground stop, so it reads as a tint of it.
      expect(luminance(pal.dockLight)).toBeGreaterThan(luminance(pal.g3));
      // Dark ink, readable on that tint (WCAG AA for the dock icons/labels).
      expect(luminance(pal.dockInk)).toBeLessThan(0.2);
      expect(contrast(pal.dockLight, pal.dockInk)).toBeGreaterThan(4.5);
    }
  });
});
