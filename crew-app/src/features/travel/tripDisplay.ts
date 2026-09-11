// Shared trip/duty display helpers used by TripCards and RosterScreen (Sign On).
// Keeping these in one module avoids duplicated logic and repeated allocations
// during list/row render (enhance-Ver1 #3).

import { colors } from '../../theme';
import type { TimeZoneMode } from '../settings/settingsSlice';

const FLEET_NAMES: Record<string, string> = {
  '350': 'A350',
  '787': 'B787',
  '777': 'B777',
  '320': 'A320',
  '380': 'A380',
};

export function fleetLabel(code: string): string {
  return FLEET_NAMES[code] ?? code;
}

// One brand accent for every flight (fewer-colours rule: no separate short/long
// -haul hue). Kept as functions so the many call sites stay unchanged; the dep/
// arv args are now ignored.
export function routeColor(_dep: string, _arv: string): string {
  return colors.accent;
}

// Soft purple tint for the flight-number badge fill — the calm counterpart to
// routeColor (used for the badge TEXT + the card's left border).
export function routeTintBg(_dep: string, _arv: string): string {
  return colors.tintBgSoft;
}

// Short, human label for the active timezone mode (chip near section headers).
export function tzModeLabel(mode: TimeZoneMode, baseTz: string): string {
  if (mode === 'utc') {
    return 'UTC';
  }
  if (mode === 'base') {
    return baseTz.split('/').pop()?.replace(/_/g, ' ') ?? baseTz;
  }
  return 'Airport local';
}

// ─── Check-in date helpers ────────────────────────────────────────────────────
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_IDX: Record<string, number> = {};
MON.forEach((m, i) => {
  MON_IDX[m.toLowerCase()] = i;
});

/** "YYYY-MM-DD HH:mm" or "DD MMM YYYY HHMM" → "HH:MM". */
export function checkInHhmm(s: string): string {
  let m = s.match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}):(\d{2})/);
  if (m) {
    return `${m[1]}:${m[2]}`;
  }
  m = s.match(/^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+(\d{2})(\d{2})/);
  if (m) {
    return `${m[1]}:${m[2]}`;
  }
  return s;
}

/** Comparable yyyymmdd number from either date format (or null). */
export function dateKey(s: string): number | null {
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return parseInt(m[1] + m[2] + m[3], 10);
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (m) {
    const mo = MON_IDX[m[2].toLowerCase()];
    if (mo != null) {
      return parseInt(m[3] + String(mo + 1).padStart(2, '0') + m[1].padStart(2, '0'), 10);
    }
  }
  return null;
}

/** True when the check-in calendar day is before the first flight's day. */
export function isCheckInPrevDay(checkInStr: string, flightStr: string): boolean {
  const c = checkInStr ? dateKey(checkInStr) : null;
  const f = flightStr ? dateKey(flightStr) : null;
  return c != null && f != null && c < f;
}
