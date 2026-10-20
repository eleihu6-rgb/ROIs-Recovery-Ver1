// ─── Duty Swap · Market (design Concept A "Swap Board") · pure model ───────
// The market is every unlocked duty other crews have published, narrowed to the
// ones that overlap the duty I want to swap out of. Tapping an offer opens the
// composer: what I give, what I take, the delta, a note. No React / native
// imports so it stays unit-testable (__tests__/features/dutySwapMarket.test.tsx).
// Spec: docs/superpowers/specs/2026-10-08-crew-app-duty-swap-market-design.md
import {
  activeFilterCount, dayLabel, DAY_MS, fleetsOf, flightRouteOf, hhmmOf, naiveMs, routeOf,
  type ApiCompare, type ApiTaskDetail, type SwapCrew, type SwapDuty, type SwapFilters,
} from '../dutySwapModel';

// ── Approach switch (Matrix = Concept D, Market = Concept A) ────────────────
export type SwapApproach = 'matrix' | 'market' | 'ticket' | 'twin';
export const APPROACHES: SwapApproach[] = ['matrix', 'market', 'ticket', 'twin'];
// The id stays `ticket` for the choices already remembered on crew phones.
export const APPROACH_LABEL: Record<SwapApproach, string> = { matrix: 'Matrix', market: 'Market', ticket: 'Match', twin: 'Twin Rail' };
/** Remembered per crew on this phone (airline + crew ID, so PR/TG never mix). */
export const approachKey = (airline: string, crewId: string): string => `@duty_swap_approach_${airline}_${crewId}`;
export function parseApproach(v: string | null | undefined): SwapApproach | null {
  return v === 'matrix' || v === 'market' || v === 'ticket' || v === 'twin' ? v : null;
}

// ── The board ───────────────────────────────────────────────────────────────
export interface Span { from: number; to: number }

/** Duties I can swap out of: unlocked, and not a day off. */
export function outOfDuties(me: SwapCrew | undefined): SwapDuty[] {
  return me ? me.duties.filter(d => d.swappable && d.kind !== 'off') : [];
}

/** The board's window around the duty I want out of: a day before report to
 *  half a day after release (design A1), so trips that start the evening before
 *  or end the next morning still show. */
export function marketWindow(d: Pick<SwapDuty, 'startDt' | 'endDt'>): Span {
  return { from: naiveMs(d.startDt) - DAY_MS, to: naiveMs(d.endDt) + DAY_MS / 2 };
}
export const dutySpan = (d: Pick<SwapDuty, 'startDt' | 'endDt'>): Span => ({ from: naiveMs(d.startDt), to: naiveMs(d.endDt) });
export const overlaps = (d: Pick<SwapDuty, 'startDt' | 'endDt'>, s: Span): boolean =>
  naiveMs(d.startDt) < s.to && naiveMs(d.endDt) > s.from;
const sameTask = (a: SwapDuty, b: SwapDuty) => a.isGround === b.isGround && a.id === b.id;

export interface Offer { key: string; crewId: string; crewName: string; duty: SwapDuty }

/** Every published duty of another crew that overlaps `give`'s window, by start.
 *  Days off only on request; the same trip as mine (a crew on my pairing) never. */
export function boardOffers(others: SwapCrew[], give: SwapDuty, opts: { daysOff: boolean }): Offer[] {
  const w = marketWindow(give);
  const out: Offer[] = [];
  for (const c of others) {
    for (const d of c.duties) {
      if (!d.swappable || (d.kind === 'off' && !opts.daysOff) || sameTask(d, give) || !overlaps(d, w)) continue;
      out.push({ key: d.key, crewId: c.crewId, crewName: c.crewName, duty: d });
    }
  }
  return out.sort((a, b) => a.duty.startDt.localeCompare(b.duty.startDt) || a.crewId.localeCompare(b.crewId));
}

/** "6 offers overlap 22–26 Oct". */
export function boardHeadline(n: number, give: SwapDuty): string {
  const a = dayLabel(give.startDt.slice(0, 10)), b = dayLabel(give.endDt.slice(0, 10));
  const days = a.month === b.month ? (a.day === b.day ? `${a.day} ${a.month}` : `${a.day}–${b.day} ${b.month}`) : `${a.day} ${a.month} – ${b.day} ${b.month}`;
  return `${n} ${n === 1 ? 'offer overlaps' : 'offers overlap'} ${days}`;
}

// ── The composer ────────────────────────────────────────────────────────────
/** Crew B's duties I may take: their unlocked duties around my give duty, plus
 *  the one tapped (always listed). */
export function takeChoices(crewB: SwapCrew, give: SwapDuty, tapped: SwapDuty): SwapDuty[] {
  const w = marketWindow(give);
  return crewB.duties.filter(d => d.swappable && (d.key === tapped.key || overlaps(d, w)));
}
/** Pre-ticked: the tapped offer, plus crew B's other unlocked duties during my
 *  duty — they cannot fly mine while still holding those. */
export function defaultTake(crewB: SwapCrew, give: SwapDuty, tapped: SwapDuty): string[] {
  const span = dutySpan(give);
  return takeChoices(crewB, give, tapped).filter(d => d.key === tapped.key || overlaps(d, span)).map(d => d.key);
}
/** My duties I may give: every unlocked duty of mine around the tapped offer, plus `give`. */
export function giveChoices(me: SwapCrew, give: SwapDuty, tapped: SwapDuty): SwapDuty[] {
  const w = marketWindow(tapped);
  return me.duties.filter(d => d.swappable && (d.key === give.key || overlaps(d, w)));
}
/** Pre-ticked: the duty I am swapping out of, plus my unlocked duties during theirs. */
export function defaultGive(me: SwapCrew, give: SwapDuty, tapped: SwapDuty): string[] {
  const span = dutySpan(tapped);
  return giveChoices(me, give, tapped).filter(d => d.key === give.key || overlaps(d, span)).map(d => d.key);
}

// ── Saved wants (Match mode: one per give duty) ─────────────────────────────
export type SavedWants = Record<string, SwapFilters>;

/** Per crew on this phone; airline in the key so PR and TG never mix. */
export const wantStoreKey = (airline: string, crewId: string): string => `@duty_swap_want_${airline}_${crewId}`;

export function parseWants(raw: string | null | undefined): SavedWants {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: SavedWants = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) out[key] = value as SwapFilters;
    }
    return out;
  } catch { return {}; }
}

/** The want to apply in step 2: the most recently selected duty that has one. */
export function savedWantFor(give: SwapDuty[], wants: SavedWants): SwapFilters | null {
  for (let i = give.length - 1; i >= 0; i--) {
    const want = wants[give[i].key];
    if (want) return want;
  }
  return null;
}

/** The untouched portal window is not a want yet. Anything the crew changed is. */
export function hasWantCriteria(f: SwapFilters, defaults: { startDate: string; endDate: string }): boolean {
  return f.startDate !== defaults.startDate || f.endDate !== defaults.endDate
    || f.swapMode !== 'NS' || activeFilterCount(f) > 0;
}

export interface WantCriteria {
  /** Mandatory and always first in step 2. */
  start: string;
  /** Mandatory and always second in step 2. */
  end: string;
  /** '19–31 Oct', for the one-line step-1 chip. */
  range: string;
  /** Every other selected criterion, in scan order. */
  others: string[];
}

/** What the crew actually selected. Start/End are mandatory; the rest is
 *  everything they filled in, so step 2 can put the used criteria on top. */
export function wantCriteria(f: SwapFilters): WantCriteria {
  const a = dayLabel(f.startDate), b = dayLabel(f.endDate);
  const range = f.startDate === f.endDate ? `${a.day} ${a.month}`
    : a.month === b.month ? `${a.day}–${b.day} ${a.month}` : `${a.day} ${a.month} → ${b.day} ${b.month}`;
  return {
    start: `${a.day} ${a.month}`,
    end: `${b.day} ${b.month}`,
    range,
    others: [
      ...(f.swapMode === 'FS' ? ['Handshake · friends'] : []),
      ...f.taskTypeList,
      ...f.fltFleetList,
      ...f.layoverPortList,
      ...f.fltNumList.map(x => `Flt ${x}`),
      ...f.fltArrList.map(x => `ARR ${x}`),
      ...f.activeRankList,
      ...f.crewIdList.map(x => `Crew ${x}`),
      ...rangeBits(f),
    ],
  };
}

/** Briefest readable want for the step-1 chip: dates, then at most three criteria. */
export function wantLabel(f: SwapFilters): string {
  const { range, others } = wantCriteria(f);
  const shown = others.slice(0, 3);
  const rest = others.length - shown.length;
  return [range, ...shown, ...(rest > 0 ? [`+${rest}`] : [])].join(' · ');
}

function rangeBits(f: SwapFilters): string[] {
  const bits: string[] = [];
  const range = (label: string, a: string, b: string, suffix = '') => {
    if (a.trim() || b.trim()) bits.push(`${label} ${a.trim() || '–'}–${b.trim() || '–'}${suffix}`);
  };
  range('Dur', f.durationStart, f.durationEnd, 'd');
  range('CRD', f.crdStart, f.crdEnd, 'h');
  range('BLH', f.blhStart, f.blhEnd, 'h');
  range('Lay', f.layoverTimeStart, f.layoverTimeEnd, 'h');
  if (f.briefStart.trim() || f.briefEnd.trim()) bits.push(`Rpt ${f.briefStart.trim() || '–'}–${f.briefEnd.trim() || '–'}`);
  if (f.debriefStart.trim() || f.debriefEnd.trim()) bits.push(`End ${f.debriefStart.trim() || '–'}–${f.debriefEnd.trim() || '–'}`);
  if (f.filterEmptyDutyCrew) bits.push('Duties only');
  return bits;
}

// ── Labels ──────────────────────────────────────────────────────────────────
/** '21:45 → 26 Oct 06:30' (the start day is on the card's date block already). */
export function spanLabel(d: Pick<SwapDuty, 'startDt' | 'endDt'>): string {
  const sameDay = d.startDt.slice(0, 10) === d.endDt.slice(0, 10);
  if (sameDay) return `${hhmmOf(d.startDt)}–${hhmmOf(d.endDt)}`;
  const e = dayLabel(d.endDt.slice(0, 10));
  return `${hhmmOf(d.startDt)} → ${e.day} ${e.month} ${hhmmOf(d.endDt)}`;
}
export const KIND_BADGE: Partial<Record<SwapDuty['kind'], string>> = { standby: 'Standby', off: 'Day off', ground: 'Ground' };
/** '20:45 → 30 Oct 06:35 · MNL–LAX–MNL' — the Match card's one flight line: when it
 *  leaves, when it lands back, then the airports it flies. Just the span until
 *  the duty's legs are known. */
export function flightLine(d: Pick<SwapDuty, 'startDt' | 'endDt'>, route: string | null): string {
  return route ? `${spanLabel(d)} · ${route}` : spanLabel(d);
}
/** The airports a pairing flies between, e.g. 'MNL–SEA–MNL' (from 'MNL-SEA / SEA-MNL'),
 *  or a ground/standby duty's single port ('1HB MNL-MNL' → 'MNL'). */
export function airportChain(route: string | null): string | null {
  if (!route) return null;
  const stops: string[] = [];
  for (const leg of route.split(' / ')) {
    const pair = leg.split(' ').pop() ?? '';
    for (const port of pair.split('-')) if (port && stops[stops.length - 1] !== port) stops.push(port);
  }
  return stops.length ? stops.join('–') : null;
}
/** The duty's flight legs with their airports ('PR124 MNL-SEA / PR125 SEA-MNL').
 *  Read from each detail list in turn (Match's compare first); null until a leg
 *  is known. */
export function dutyRoute(d: SwapDuty, details: (ApiTaskDetail[] | undefined)[], carrier: string): string | null {
  if (d.kind !== 'fly') return null;
  for (const list of details) {
    const route = flightRouteOf(list?.find(t => (d.isGround ? t.rosterGroundPublishId === d.id : t.pairingId === d.id)), carrier);
    if (route) return route;
  }
  return null;
}
/** The same route from either side of a compare. */
export function compareRoute(d: SwapDuty, compare: ApiCompare | undefined, mine: boolean, carrier: string): string | null {
  return dutyRoute(d, [mine ? compare?.mineTaskDetailList : compare?.othersTaskDetailList], carrier);
}

// ── Pre-check chip (design A1: fleet + rank on each card) ───────────────────
export interface Precheck { rank: string | null; fleets: string[]; rankDiffers: boolean; fleetDiffers: boolean }
const realRank = (r: string | undefined | null) => (r && r !== '-' ? r : null);

/** Their duty's rank + fleet, compared with the duty I give. Null until the
 *  compare detail for that crew has loaded (lazily, for cards in view). */
export function precheck(theirs: ApiTaskDetail | undefined, mine: ApiTaskDetail | undefined): Precheck | null {
  if (!theirs) return null;
  const rank = realRank(theirs.actingRank);
  const fleets = fleetsOf([theirs]);
  const myRank = realRank(mine?.actingRank);
  const myFleets = mine ? fleetsOf([mine]) : [];
  return {
    rank,
    fleets,
    rankDiffers: !!rank && !!myRank && rank !== myRank,
    fleetDiffers: fleets.length > 0 && myFleets.length > 0 && !fleets.some(f => myFleets.includes(f)),
  };
}
export function precheckLabel(c: Precheck): string {
  if (c.rankDiffers) return `${c.rank} · rank differs`;
  if (c.fleetDiffers) return [c.rank, c.fleets.join('/'), 'fleet differs'].filter(Boolean).join(' · ');
  return [c.rank, c.fleets.join('/')].filter(Boolean).join(' · ');
}
