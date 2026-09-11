// ─── Design system ────────────────────────────────────────────────────────────
// Single source of truth for colour, typography, spacing, radius and shadow
// tokens across the app. Screens import from here so the palette and type scale
// stay coherent. Presentation only — no app logic lives in this file.

import { Platform, TextStyle, ViewStyle } from 'react-native';

// ─── Colour ─────────────────────────────────────────────────────────────────
export const colors = {
  primary: '#3d2b8c',   // deep purple — brand / active
  accent: '#7b4fb8',    // lighter purple — headers, secondary actions
  // NOTE: the app uses ONE brand accent (purple) + neutrals per page. No gold /
  // blue / orange / green accents — removed in the fewer-colours sweep.

  ink: '#1a1a2e',       // primary text
  inkSoft: '#636b7f',   // softened slate — a touch darker than `muted` (IATA codes)
  muted: '#8b92a5',     // secondary text / inactive
  faint: '#aeb3c2',     // tertiary text / placeholders

  bg: '#f5f5f7',        // app background
  card: '#ffffff',      // card surface
  hairline: '#ececf3',  // borders / dividers

  // Tinted surfaces derived from the purple brand.
  tintBg: '#f3eefb',    // selected / soft purple fill
  tintBgSoft: '#ede8f8',// chips / badges
  tintBorder: '#d4c9f0',// chip borders

  danger: '#d94040',    // destructive (red is a platform convention — modals only)

  white: '#ffffff',
  // On-purple text tints.
  onPrimary: '#ffffff',
  onPrimaryMuted: 'rgba(255,255,255,0.80)',
  onPrimaryFaint: 'rgba(255,255,255,0.62)',
  onPrimaryChip: 'rgba(255,255,255,0.18)',  // translucent chip on a purple header
  avatarBg: 'rgba(255,255,255,0.25)',       // translucent avatar on a purple header

  // ── Neutral surfaces / strokes ──
  // Used where a control needs a darker neutral than the brand purple.
  neutralStroke: '#1a1a2e',   // strong icon/line strokes on light surfaces
  neutralWeak: '#cccccc',     // disabled switch track / faint controls

  // ── Off / disabled states (was inline literals in TripCards) ──
  offFill: '#f0f0f4',         // disabled chip fill
  offBorder: '#e3e3eb',       // disabled chip border
  offInk: '#a7a7b4',          // disabled chip text
  chipOffStroke: '#b9b9c6',   // outline-icon colour for an off chip
  ciChipBorder: '#cdbff0',    // check-in chip border (stronger tint)

  // ── Tinted button / disabled brand states ──
  primaryDisabled: '#c4b6e0', // disabled purple button / active test btn border
  presetBorder: '#e0d8f0',    // preset pill border in adjust modal
  dangerBg: '#fff3f3',        // destructive button fill
  dangerBorder: '#ffd0d0',    // destructive button border

  // ── Navigation / status surfaces ──
  navActive: '#3d2b8c',       // = primary
  navInactive: '#8b92a5',     // = muted
  navIndicator: '#3d2b8c',    // = primary (was gold — one accent)
  navBar: '#ffffff',          // tab-bar surface
  navBorder: '#eeeeee',       // tab-bar top border
  fabBg: '#f4f4f8',           // center FAB surface
  scrim: 'rgba(0,0,0,0.4)',   // modal overlay scrim

  // ── Empty-state illustration palette ──
  illoFill: '#e8e4f5',        // soft purple illustration fill
  illoStroke: '#c5bce8',      // illustration outline / dashes
  illoStrokeDeep: '#b0a8dd',  // illustration deeper outline
  illoShadow: '#999999',      // small illustration cast-shadow line
} as const;

// ─── Typography scale ─────────────────────────────────────────────────────────
// Each token is a ready-to-spread TextStyle (size + weight + sensible spacing).
type FontWeight = TextStyle['fontWeight'];

const make = (
  fontSize: number,
  fontWeight: FontWeight,
  extra?: Partial<TextStyle>,
): TextStyle => ({ fontSize, fontWeight, ...extra });

export const font = {
  hero: make(40, '800', { letterSpacing: 0.5 }),
  h1: make(26, '800', { letterSpacing: 0.2 }),
  h2: make(20, '800'),
  title: make(17, '700'),
  body: make(15, '500'),
  bodyStrong: make(15, '700'),
  sub: make(13, '500'),
  caption: make(11, '700', { letterSpacing: 0.4 }),
  // Small all-caps section labels.
  overline: make(11, '700', { letterSpacing: 1.4 }),
} as const;

// ─── Spacing ─────────────────────────────────────────────────────────────────
export const space = {
  xs4: 4,
  sm8: 8,
  md12: 12,
  lg16: 16,
  xl24: 24,
  xxl32: 32,
} as const;

// ─── Radius ──────────────────────────────────────────────────────────────────
export const radius = {
  op: 8,    // operational card radius — compact, scannable dense lists
  sm: 10,
  md: 14,
  lg: 16,
  pill: 20,
  round: 999,
} as const;

// Subtle hairline border for repeated list rows (replaces heavy shadows on
// dense operational cards — enhance-Ver1 #9). One strong treatment (shadowHero)
// stays reserved for the Sign On report-time hero.
export const cardBorder: ViewStyle = {
  borderWidth: 1,
  borderColor: '#ececf3', // = colors.hairline
};

// ─── Shadow ──────────────────────────────────────────────────────────────────
// Soft card shadow used on every elevated surface for consistency.
export const shadow: ViewStyle = {
  shadowColor: '#1a1a2e',
  shadowOpacity: 0.07,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

// Stronger, brand-tinted shadow for hero / floating surfaces.
export const shadowHero: ViewStyle = {
  shadowColor: colors.primary,
  shadowOpacity: 0.28,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 6,
};

// ─── Date / time formatting ────────────────────────────────────────────────────
// Standard human formats used everywhere: "Wed 03 Jun" for dates, "HH:MM" 24h
// for times. These touch presentation only — timezone math stays in timeFormat.

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "03 Jun" — day + short month. */
export function formatDateShort(date: Date | null): string {
  if (!date) {
    return '';
  }
  return `${pad2(date.getDate())} ${MONTH[date.getMonth()]}`;
}

/** "Wed 03 Jun" — weekday + day + short month (the app-standard date line). */
export function formatWeekdayDate(date: Date | null): string {
  if (!date) {
    return '';
  }
  return `${WEEKDAY[date.getDay()]} ${pad2(date.getDate())} ${MONTH[date.getMonth()]}`;
}

/** "Wed 03 Jun 2026" — full date with year (used where the year matters). */
export function formatWeekdayDateYear(date: Date | null): string {
  if (!date) {
    return '';
  }
  return `${formatWeekdayDate(date)} ${date.getFullYear()}`;
}

export const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace' });
