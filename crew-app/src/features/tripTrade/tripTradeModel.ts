// ─── Trip Trade · Page 1 (My Duty) — pure model ───────────────────────────────
// Types + rules behind the My Duty page. No React / native imports so it stays
// unit-testable (see __tests__/features/tripTrade.test.ts).
//
// The duties themselves come from the crew's ACTUAL captured roster (TG or PR
// crew portal) — see tripTradeSource.ts. This module owns the "trade" grammar
// (what a crew wants in return) and the publish/trade OVERLAY the crew edits on
// top of those real duties.
//
// A trade's TYPE is derived, not chosen (doc: Trip Trade Design draft Ver2):
//   • dated + exact duty      → Specific
//   • dated + condition       → Hybrid
//   • dateless                → Generic
// Placement follows: dated trades render inline on that duty; dateless float to
// the top ("I'm looking for").

export type TradeKind = 'generic' | 'hybrid' | 'specific';

export type IconKey =
  | 'moon' | 'globe' | 'repeat' | 'target' | 'plane' | 'clock' | 'calendar';

export interface Trade {
  id: string;
  /** ISO 'YYYY-MM-DD' when tied to a date; undefined ⇒ dateless (generic). */
  date?: string;
  /** true when the wanted duty is an exact identity (flight no. or an exact duty e.g. DO). */
  wantsExactDuty: boolean;
  title: string;
  chips: string[];
  icon?: IconKey;
}

export interface TradeDuty {
  id: string;
  date: string;         // ISO 'YYYY-MM-DD'
  weekday: string;      // 'WED'
  dayNum: string;       // '20'
  monthLabel: string;   // 'Aug'
  pairing: string;      // 'TG640/641'
  dest: string;         // 'NRT'
  durationDays: number; // 2
  report: string;       // '08:20' — local report/check-in time
  fleet: string;        // 'A350'
  published: boolean;
  /** Date-specific trade attached to this duty, if any. */
  trade?: Trade;
}

// ─── Classification ───────────────────────────────────────────────────────────
export function tradeKind(t: Pick<Trade, 'date' | 'wantsExactDuty'>): TradeKind {
  const hasDate = !!t.date;
  if (hasDate) {
    return t.wantsExactDuty ? 'specific' : 'hybrid';
  }
  return 'generic';
}

/** Uppercase badge label (GENERIC / HYBRID / SPECIFIC). */
export function kindLabel(k: TradeKind): string {
  return k.toUpperCase();
}

export function isDateSpecific(t: Pick<Trade, 'date'>): boolean {
  return !!t.date;
}

/** A dated trade renders inline on its duty; a dateless one floats to the top. */
export function tradePlacement(t: Pick<Trade, 'date'>): 'inline' | 'top' {
  return isDateSpecific(t) ? 'inline' : 'top';
}

// ─── Publish / trade overlay ──────────────────────────────────────────────────
// The crew's edits on top of the real roster: which duties are published, any
// per-duty trade, and the dateless generic wants. Duties are private by default
// (PDPA) until published.

export interface TradeOverlay {
  published: Record<string, boolean>;
  trades: Record<string, Trade>;
  genericWants: Trade[];
}

export function emptyOverlay(): TradeOverlay {
  return { published: {}, trades: {}, genericWants: [] };
}

export function isPublished(overlay: Pick<TradeOverlay, 'published'>, id: string): boolean {
  return overlay.published[id] ?? false;
}

/** Merge the overlay onto the roster-derived duties for display. */
export function mergeOverlay(
  duties: TradeDuty[],
  overlay: Pick<TradeOverlay, 'published' | 'trades'>,
): TradeDuty[] {
  return duties.map(d => ({
    ...d,
    published: overlay.published[d.id] ?? false,
    trade: overlay.trades[d.id] ?? undefined,
  }));
}

/** True only when every duty is published — drives the "Publish all" master switch. */
export function allPublished(duties: TradeDuty[]): boolean {
  return duties.length > 0 && duties.every(d => d.published);
}

export function anyPublished(duties: TradeDuty[]): boolean {
  return duties.some(d => d.published);
}

/** Duties in the tradeable period — shown as "N swappable duties". */
export function swappableCount(duties: TradeDuty[]): number {
  return duties.length;
}
