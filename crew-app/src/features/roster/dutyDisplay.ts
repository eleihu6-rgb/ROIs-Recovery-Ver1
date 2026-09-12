// ─── Ground-duty categorisation & display model ──────────────────────────────
// The crew portal roster carries far more than flights. Besides FLY (revenue
// flights, shown as trip cards) every roster has GROUND / non-revenue duties:
// days off, leave, training, simulator, standby, meetings, deadheads, reserve.
// These were previously invisible (or — for SIM/DHD/standby that carry type 'F'
// — leaked in as broken DEP→ARR flight cards). This module turns each captured
// PortalDuty into a display model so MyTrips can render a distinct card per
// duty type, interleaved chronologically with the flight trips.
//
// The `assignment` field is the duty-type key. Real assignment codes observed
// across the four THAI test crews (23605/35459/44117/45779), see
// __tests__/fixtures/roster/README.md:
//   FLY  DHD  SIM  TRG  CHMSBA  CHMSBB  CHMSB3  PHMSBB
//   MEETING  OFFICE  BLOCK  OFF  VOFF  VAC  VAC_PH  HOL
//
// NOTE: trainer / trainee / course name / a specific training location are NOT
// present anywhere in the portal's roster API (verified across all four crews).
// The richest training data available is the SIM session code (carried in
// fltNum, e.g. "HOSIM:A33|34" / "350 AATC"), the brief→debrief window, BKK as
// the location, and the duty-period hours — so that is all these cards show.

import type { PortalDuty, TrainingDetail } from '../travel/portalCapture';
import { roisBaseToUTC } from '../travel/portalCapture';
import { parseRosterUTC } from '../settings/timeFormat';

export type DutyCategory =
  | 'off'
  | 'leave'
  | 'training'
  | 'standby'
  | 'meeting'
  | 'reserve'
  | 'deadhead'
  | 'other';

export interface CategoryMeta {
  /** Strong accent — left border, badge text/background tint base. */
  accent: string;
  /** Soft tint background for the badge pill. */
  tint: string;
  /** Short category name shown in the badge. */
  label: string;
}

// Per-category visual identity. Colours roughly follow the portal's own calendar
// palette (leave yellow, training/sim orange, standby green, meeting brown) but
// are darkened to stay legible as text on a light card.
export const CATEGORY_META: Record<DutyCategory, CategoryMeta> = {
  off: { accent: '#64748B', tint: '#EEF1F6', label: 'Off' },
  leave: { accent: '#D98A00', tint: '#FAF0DA', label: 'Leave' },
  training: { accent: '#F67C01', tint: '#FCEADA', label: 'Training' },
  standby: { accent: '#05A045', tint: '#DCF2E4', label: 'Standby' },
  meeting: { accent: '#8A5A2B', tint: '#F1E8DF', label: 'Meeting' },
  reserve: { accent: '#2E9E8F', tint: '#DBF1ED', label: 'Reserve' },
  deadhead: { accent: '#C97A12', tint: '#FAEFD9', label: 'Deadhead' },
  other: { accent: '#64748B', tint: '#EEF1F6', label: 'Duty' },
};

// Exact assignment code → {category, specific label}. Codes not listed here are
// resolved by the fuzzy fallback in `categorise` so new/region-specific codes
// still get a sensible card instead of disappearing.
const CODE_MAP: Record<string, { category: DutyCategory; label: string }> = {
  OFF: { category: 'off', label: 'Day Off' },
  VOFF: { category: 'off', label: 'Voluntary Day Off' },
  // ── F8 / ET roster codes (f8_sit_live.assignment) ──
  DO: { category: 'off', label: 'Day Off' },
  GDO: { category: 'off', label: 'Guaranteed Day Off' },
  VAC: { category: 'leave', label: 'Annual Leave' },
  AL: { category: 'leave', label: 'Annual Leave' },
  ILL: { category: 'leave', label: 'Sick Leave' },
  VAC_PH: { category: 'leave', label: 'Leave (Public Holiday)' },
  HOL: { category: 'leave', label: 'Public Holiday' },
  SIM: { category: 'training', label: 'Simulator' },
  TRG: { category: 'training', label: 'Training' },
  MEETING: { category: 'meeting', label: 'Meeting' },
  OFFICE: { category: 'meeting', label: 'Office Duty' },
  BLOCK: { category: 'reserve', label: 'Reserve' },
  RES: { category: 'reserve', label: 'Reserve' },
  PRAM: { category: 'standby', label: 'Standby AM/PM' },
  PRPM: { category: 'standby', label: 'Standby Night' },
  DHD: { category: 'deadhead', label: 'Deadhead' },
  PAX: { category: 'deadhead', label: 'Positioning' },
  GRD: { category: 'meeting', label: 'Ground Duty' },
  SFT: { category: 'other', label: 'Shift' },
  CHMSBA: { category: 'standby', label: 'Standby' },
  CHMSBB: { category: 'standby', label: 'Standby' },
  CHMSB3: { category: 'standby', label: 'Standby' },
  PHMSBB: { category: 'standby', label: 'Standby (Public Holiday)' },
  // Ground/admin duties (brown in the portal). The "F" suffix is a roster
  // variant; map the variants explicitly so labels stay clean. (Mar–Jun
  // validation across 9 crews surfaced GROUND, OFFICE F and MEETING F.)
  GROUND: { category: 'meeting', label: 'Ground Duty' },
  'OFFICE F': { category: 'meeting', label: 'Office Duty' },
  'MEETING F': { category: 'meeting', label: 'Meeting' },
};

/** Resolve an assignment code to a category + human label (with fuzzy fallback). */
export function categorise(assignment: string): { category: DutyCategory; label: string } {
  const code = (assignment || '').toUpperCase().trim();
  const exact = CODE_MAP[code];
  if (exact) {
    return exact;
  }
  // Fuzzy fallback for codes we haven't seen yet — keep them visible & sensible.
  // ORDER MATTERS: the office/meeting check MUST precede the /OFF/ check, because
  // "OFFICE" contains the substring "OFF" and would otherwise be mislabelled as a
  // Day Off (caught on-device: an OFFICE F duty rendering as "Day Off").
  if (/SB|STBY|STANDBY|RESERVE/.test(code)) {
    return { category: 'standby', label: 'Standby' };
  }
  if (/^DO$|^DOFF$|^GDO$|^REST$/.test(code)) {
    return { category: 'off', label: 'Day Off' };
  }
  if (/VAC|LEAVE|ANNUAL|^AL$|^ILL$|^SICK|HOL/.test(code)) {
    return { category: 'leave', label: 'Leave' };
  }
  if (/MEET|OFFICE|BRIEF|GROUND/.test(code)) {
    return { category: 'meeting', label: 'Meeting' };
  }
  if (/SIM|TRG|TRN|TRAIN|GRND|GND|RECURRENT/.test(code)) {
    return { category: 'training', label: 'Training' };
  }
  if (/OFF/.test(code)) {
    return { category: 'off', label: 'Day Off' };
  }
  if (/DHD|DH|POS/.test(code)) {
    return { category: 'deadhead', label: 'Deadhead' };
  }
  return { category: 'other', label: code || 'Duty' };
}

/**
 * Whether the raw roster code tells the crew anything the card doesn't already
 * say. Every code we humanise ourselves ("DO" → "Day Off", "AL" → "Annual
 * Leave", "SIM" → "Simulator") is pure duplication under the duty title, so the
 * schedule drops it; a code we could only guess at (the fuzzy fallback) is the
 * duty's only identity, so that one stays on the card.
 */
export function codeAddsInfo(assignment: string, label?: string): boolean {
  const code = (assignment || '').toUpperCase().trim();
  if (!code) {
    return false;
  }
  // The label IS the code — a duty whose code we could not humanise is labelled
  // with the code itself (PR's rosters carry "X" and "EXAM"), so printing it
  // again under the title is the same duplication one step later.
  if ((label || '').toUpperCase().replace(/\s+/g, ' ').trim() === code) {
    return false;
  }
  return CODE_MAP[code] === undefined;
}

export interface GroundDuty {
  id: string;
  /** Raw assignment code, e.g. "SIM". */
  code: string;
  category: DutyCategory;
  /** Human label, e.g. "Simulator". */
  label: string;
  /** Airport-local times "YYYY-MM-DD HH:mm" (BKK for ground duties). */
  localStart: string;
  localEnd: string;
  /** Real UTC instant of start, as a roster string "DD MMM YYYY HHMM". */
  startRosterUTC: string;
  /** Real UTC instant of end, as a roster string "DD MMM YYYY HHMM". */
  endRosterUTC: string;
  /** True when the duty spans the whole day (00:00–23:59) — show "All day". */
  allDay: boolean;
  /**
   * Optional secondary detail line. For SIM = the session code (the closest
   * thing to a course name the portal exposes); for DHD = the flight number.
   */
  detail?: string;
  /** Course/training detail (TRG/SIM) from the detailAll capture, when present. */
  training?: TrainingDetail;
  /** Online-meeting join link (calendar meetings only) — drives a "Join" button. */
  joinUrl?: string;
  /** IATA airport the duty is anchored to (drives airport-local time display). */
  airport?: string;
  crewId: string;
}

/** "YYYY-MM-DD HH:mm" → "HH:mm", or '' if unparseable. */
function localHhmm(s: string): string {
  const m = (s || '').match(/[ T](\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '';
}

/** A duty is all-day when it starts 00:00 and ends 23:59 (the portal's convention). */
function isAllDay(localStart: string, localEnd: string): boolean {
  return localHhmm(localStart) === '00:00' && localHhmm(localEnd) === '23:59';
}

// SIM duties keep the session code in fltNum (already carrier-prefixed in the
// report, raw in the calendar). DHD keeps the flight number there. Surface it.
// The carrier prefix is per-airline (TG default; PR overrides), so a PR deadhead
// on bare "2849" renders "PR2849", not the hardcoded "TG2849".
function detailFor(d: PortalDuty, category: DutyCategory): string | undefined {
  const flt = (d.fltNum || '').trim();
  if (!flt) {
    return undefined;
  }
  const carrier = (d.carrier || 'TG').toUpperCase();
  if (category === 'training') {
    // "TGHOSIM:A33|34" / "HOSIM:A33|34" / "350 AATC" → drop a leading carrier.
    return flt.replace(new RegExp(`^${carrier}`, 'i'), '').trim() || flt;
  }
  if (category === 'deadhead') {
    return /^[A-Z]/i.test(flt) ? flt.toUpperCase() : `${carrier}${flt}`;
  }
  return undefined;
}

/** Convert a captured PortalDuty into a ground-duty display model. */
export function toGroundDuty(d: PortalDuty): GroundDuty {
  const { category, label } = categorise(d.assignment);
  return {
    id: d.id,
    code: (d.assignment || '').toUpperCase(),
    category,
    label,
    localStart: d.localStart,
    localEnd: d.localEnd,
    // startUTC/endUTC on PortalDuty are BASE (crew-home) wall clock — convert to
    // a true UTC roster string so display + classification match the flights. The
    // offset is baked onto the duty at capture (TG=420, PR=480); default 420 for
    // pre-existing/inline duties that predate the field.
    startRosterUTC: roisBaseToUTC(d.startUTC, d.baseOffsetMin),
    endRosterUTC: roisBaseToUTC(d.endUTC, d.baseOffsetMin),
    allDay: isAllDay(d.localStart, d.localEnd),
    detail: detailFor(d, category),
    training: d.training,
    airport: d.airportCode,
    crewId: d.crewId,
  };
}

/** Is this duty a real flight (rendered as a trip card, not a ground duty)? */
export function isFlightDuty(d: PortalDuty): boolean {
  return (d.assignment || '').toUpperCase() === 'FLY';
}

export interface ClassifiedGroundDuties {
  upcoming: GroundDuty[];
  past: GroundDuty[];
}

/** Start instant (ms) of a ground duty, for sorting/classification. */
export function groundDutyStartMs(g: GroundDuty): number {
  return parseRosterUTC(g.startRosterUTC)?.getTime() ?? 0;
}

function groundDutyEndMs(g: GroundDuty): number {
  return parseRosterUTC(g.endRosterUTC)?.getTime() ?? groundDutyStartMs(g);
}

/**
 * Split the captured duties into upcoming/past ground duties (excluding flights,
 * which are shown as trip cards). A duty is "past" once it has fully ended.
 * Upcoming sorted soonest-first, past most-recent-first — matching classifyTrips.
 */
export function classifyGroundDuties(
  duties: PortalDuty[],
  now: Date,
): ClassifiedGroundDuties {
  const upcoming: GroundDuty[] = [];
  const past: GroundDuty[] = [];
  for (const d of duties) {
    if (isFlightDuty(d)) {
      continue;
    }
    const g = toGroundDuty(d);
    if (groundDutyEndMs(g) < now.getTime()) {
      past.push(g);
    } else {
      upcoming.push(g);
    }
  }
  upcoming.sort((a, b) => groundDutyStartMs(a) - groundDutyStartMs(b));
  past.sort((a, b) => groundDutyStartMs(b) - groundDutyStartMs(a));
  return { upcoming, past };
}
