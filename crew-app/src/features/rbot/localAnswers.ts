// R'Bot's local-first answers (Phase 2).
//
// The most common crew questions ("what's my next duty?", "what time do I
// report?", "where am I staying?") are answerable from the roster already on the
// phone. Answering them here is both instant and private: nothing about the
// crew's schedule leaves the device for these, so the LLM is only used for the
// questions it genuinely has to reason about.
//
// Conservative by design: an unmatched question returns null and falls through
// to the assistant. A wrong local answer would be worse than a slower right one.
import { classifyTrips, type Trip } from '../travel/tripCsv';
import { legView, MON, nextTrip, type LegView } from './../v2/model';
import type { TimeZoneMode } from '../settings/settingsSlice';

export interface LocalAnswerContext {
  now: Date;
  trips: Trip[];
  mode: TimeZoneMode;
  baseTz: string;
  base: string;
}

/** What R'Bot answered locally, plus the fact that nothing was sent. */
export interface LocalAnswer {
  content: string;
}

function firstLegView(trip: Trip, ctx: LocalAnswerContext): LegView {
  // No alarm object: the local answer quotes the roster's own report/leave-home
  // times, which are what the crew reads on their cards.
  return legView(trip.legs[0], trip, ctx.mode, ctx.baseTz, undefined);
}

function fmtDay(lv: LegView): string {
  return `${lv.day} ${MON[lv.monthIdx]} ${lv.year}`;
}

/** "ADD→DMM" — base to the rotation's destination. A round trip's last leg
 *  comes back to base, so reading dep→arv of the LAST leg would say "ADD→ADD". */
function route(trip: Trip, base: string): string {
  const first = trip.legs[0];
  const outbound = trip.legs.find(l => (l.arvArp || '').toUpperCase() !== base);
  return `${first.depArp}→${(outbound ?? first).arvArp}`;
}

/** yyyymmdd for "today"/"tomorrow" on the phone's own calendar. */
function dayKey(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function tomorrow(now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return d;
}

/** The upcoming rotation whose first leg is on `target`'s local day. */
function tripOn(target: Date, ctx: LocalAnswerContext): Trip | null {
  const key = dayKey(target);
  for (const trip of classifyTrips(ctx.trips, ctx.now).upcoming) {
    // Every leg, not just the first: a rotation that started yesterday and is
    // still running also counts as the crew's duty on `target`'s day.
    for (const leg of trip.legs) {
      if (legView(leg, trip, ctx.mode, ctx.baseTz, undefined).dateKey === key) return trip;
    }
  }
  return null;
}

function describeNext(trip: Trip, ctx: LocalAnswerContext): string {
  const lv = firstLegView(trip, ctx);
  const report = lv.checkIn && lv.checkIn !== '—' ? ` Check-in ${lv.checkIn}.` : '';
  return `Your next duty is ${lv.fltNumber} on ${fmtDay(lv)}: ${route(trip, ctx.base)}, departing ${lv.depTime}.${report}`;
}

function describeDuty(trip: Trip, when: string, ctx: LocalAnswerContext): string {
  const lv = firstLegView(trip, ctx);
  const parts = [`${lv.fltNumber} ${route(trip, ctx.base)}`, `departing ${lv.depTime}`];
  if (lv.checkIn && lv.checkIn !== '—') parts.push(`check-in ${lv.checkIn}`);
  if (lv.leaveHome && lv.leaveHome !== '—') parts.push(`leave home ${lv.leaveHome}`);
  return `${when}: ${parts.join(', ')}.`;
}

const NEXT_DUTY = /(next (duty|flight|trip|rotation|pairing))|(when (do|will) i (next )?fly)|(what'?s my next)/i;
const REPORT_TIME = /(check[- ]?in|report(ing)? time|what time.*(report|check[- ]?in|leave home|start))|((report|check[- ]?in) (time|at))|(when (do|should) i (report|check[- ]?in|leave))/i;
// A hotel FACT question ("where am I staying"), not any sentence mentioning a
// hotel — "how do I claim my hotel expenses?" must fall through to the assistant.
const HOTEL = /(where.*(staying|stay|hotel|accommodation)|which hotel|what hotel)/i;
const DAY_OFF = /(day off|days off|off (today|tomorrow)|do i (work|fly|have a duty)|duty (today|tomorrow)|(working|flying) (today|tomorrow))/i;
const DESTINATIONS = /(where am i flying|where (do|will) i fly|which (cities|destinations)|my destinations|countries.*(this month|flying))/i;

/**
 * Answers a roster question from local state, or null when the question is not
 * one of the roster facts R'Bot can answer on the device.
 */
export function answerLocally(text: string, ctx: LocalAnswerContext): LocalAnswer | null {
  const q = text.trim();
  if (!q || q.length > 300) return null;
  const upcoming = classifyTrips(ctx.trips, ctx.now).upcoming;

  if (HOTEL.test(q)) {
    const withHotel = upcoming.find(t => t.legs.some(l => (l.hotel || '').trim()));
    if (!withHotel) return null;
    const leg = withHotel.legs.find(l => (l.hotel || '').trim())!;
    const lv = legView(leg, withHotel, ctx.mode, ctx.baseTz, undefined);
    return {content: `You're staying at ${leg.hotel.trim()}, ${lv.arv} on ${fmtDay(lv)} (${withHotel.legs[0].fltNumber}).`};
  }

  if (NEXT_DUTY.test(q) && !REPORT_TIME.test(q)) {
    const trip = nextTrip(ctx.trips, ctx.now);
    if (!trip) return {content: 'You have no upcoming duty on your roster.'};
    return {content: describeNext(trip, ctx)};
  }

  if (REPORT_TIME.test(q)) {
    const asksTomorrow = /\btomorrow\b/i.test(q);
    const asksToday = /\btoday\b/i.test(q);
    const target = asksTomorrow ? tripOn(tomorrow(ctx.now), ctx) : asksToday ? tripOn(ctx.now, ctx) : null;
    if (target) return {content: describeDuty(target, asksTomorrow ? 'Tomorrow' : 'Today', ctx)};
    if (asksTomorrow || asksToday) {
      const when = asksTomorrow ? 'tomorrow' : 'today';
      const next = nextTrip(ctx.trips, ctx.now);
      if (!next) return {content: `Nothing on your roster ${when}.`};
      const lv = firstLegView(next, ctx);
      return {content: `Nothing on your roster ${when}. Your next duty is ${lv.fltNumber} on ${fmtDay(lv)}, check-in ${lv.checkIn}.`};
    }
    const trip = nextTrip(ctx.trips, ctx.now);
    if (!trip) return {content: 'You have no upcoming duty on your roster.'};
    const lv = firstLegView(trip, ctx);
    const parts = [`${lv.fltNumber} on ${fmtDay(lv)}`];
    if (lv.checkIn && lv.checkIn !== '—') parts.push(`check-in ${lv.checkIn}`);
    if (lv.leaveHome && lv.leaveHome !== '—') parts.push(`leave home ${lv.leaveHome}`);
    return {content: `Your next duty: ${parts.join(', ')}.`};
  }

  if (DESTINATIONS.test(q)) {
    const seen: string[] = [];
    for (const trip of upcoming) {
      for (const leg of trip.legs) {
        const arv = (leg.arvArp || '').toUpperCase();
        if (arv && arv !== ctx.base && !seen.includes(arv)) seen.push(arv);
      }
    }
    if (seen.length === 0) return {content: 'No destinations on your roster yet.'};
    return {content: `You're flying to ${seen.join(', ')} on your next rotations.`};
  }

  if (DAY_OFF.test(q)) {
    const asksTomorrow = /\btomorrow\b/i.test(q);
    const target = asksTomorrow ? tomorrow(ctx.now) : ctx.now;
    const when = asksTomorrow ? 'tomorrow' : 'today';
    const trip = tripOn(target, ctx);
    if (trip) {
      const lv = firstLegView(trip, ctx);
      return {content: `You're on duty ${when}: ${lv.fltNumber} ${route(trip, ctx.base)}, departing ${lv.depTime}.`};
    }
    return {content: `No duty on your roster ${when}.`};
  }

  return null;
}
