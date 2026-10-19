// Duty grouping for the Trip Details timeline.
//
// A `Trip` is one ROTATION (base → … → base) and can span several duties across
// a layover. The portal marks each leg with the report/brief instant of the duty
// it belongs to (`TripLeg.dutyReportUTC`), which is the reliable duty key. When
// older captures have no report time, fall back to the roster's own structure:
// a layover hotel closes the duty, and so does a broken connection (the next
// leg departs a different airport than the previous one arrived at).
//
// Published duty totals (FDP / DP / block / rest) ride on the legs; the first
// leg of a group carries the duty's totals. Block is summed from the legs when
// the portal did not publish it.
import type { Trip, TripLeg } from '../travel/tripCsv';
import { parseRosterUTC } from '../settings/timeFormat';

export interface DutyLayover {
  /** Airport the previous duty ended at (and this duty reports at). */
  airport: string;
  /** Roster hotel name for the layover, '' when unknown. */
  hotel: string;
  /** Hours from the previous duty's last arrival to this duty's report;
   *  null when the report instant is not published. */
  hours: number | null;
}

export interface DutyGroup {
  /** Stable key: the duty's report instant, else its index. */
  key: string;
  /** Zero-based duty index within the rotation. */
  index: number;
  /** Short rail label: D1, D2, … */
  label: string;
  /** Report/brief UTC instant for this duty ('' when the source has none). */
  reportUTC: string;
  legs: TripLeg[];
  firstLegIndex: number;
  /** Published totals, minutes; null when not available. */
  fdpMinutes: number | null;
  dpMinutes: number | null;
  blockMinutes: number | null;
  /** Rest before this duty, hours. Published value wins; otherwise the
   *  arrival→report gap for a layover. null on the first duty / when unknown. */
  restHours: number | null;
  /** Only on duties after the first: the layover before it. */
  layover: DutyLayover | null;
}

function minutesBetween(fromUTC: string | undefined, toUTC: string | undefined): number | null {
  const from = parseRosterUTC(fromUTC || '');
  const to = parseRosterUTC(toUTC || '');
  if (!from || !to) return null;
  const mins = Math.round((to.getTime() - from.getTime()) / 60000);
  return mins > 0 ? mins : null;
}

/** "10h 12m" / "45m" — duty totals read as durations, never as clock times. */
export function fmtDutyMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function legBlockMinutes(leg: TripLeg): number | null {
  if (typeof leg.blockMinutes === 'number' && leg.blockMinutes > 0) {
    return leg.blockMinutes;
  }
  return minutesBetween(leg.flightDateUTC, leg.arvDateUTC);
}

/** Published total on the group's first leg (portal repeats it on every leg). */
function published(
  legs: TripLeg[],
  pick: (leg: TripLeg) => number | undefined,
): number | null {
  for (const leg of legs) {
    const value = pick(leg);
    if (typeof value === 'number' && value > 0) return value;
  }
  return null;
}

/** True when `next` belongs to a different duty than the group ending at `prev`. */
function startsNewDuty(prev: TripLeg, next: TripLeg, groupReport: string, nextReport: string): boolean {
  if (nextReport && groupReport) {
    return nextReport !== groupReport;
  }
  if ((prev.hotel || '').trim() !== '') return true;
  const arr = (prev.arvArp || '').trim().toUpperCase();
  const dep = (next.depArp || '').trim().toUpperCase();
  return !!arr && !!dep && arr !== dep;
}

export function groupDuties(trip: Trip): DutyGroup[] {
  const legs = trip.legs.filter(leg => (leg.assignment ?? 'FLY').toUpperCase() === 'FLY');
  if (!legs.length) return [];

  const buckets: { reportUTC: string; legs: TripLeg[]; firstLegIndex: number }[] = [];
  legs.forEach((leg, index) => {
    const report = (leg.dutyReportUTC || '').trim();
    const current = buckets[buckets.length - 1];
    if (!current) {
      buckets.push({ reportUTC: report, legs: [leg], firstLegIndex: index });
      return;
    }
    if (startsNewDuty(current.legs[current.legs.length - 1], leg, current.reportUTC, report)) {
      buckets.push({ reportUTC: report, legs: [leg], firstLegIndex: index });
    } else {
      current.reportUTC = current.reportUTC || report;
      current.legs.push(leg);
    }
  });

  return buckets.map((bucket, index) => {
    const groupLegs = bucket.legs;
    const first = groupLegs[0];
    const prev = index > 0 ? buckets[index - 1].legs[buckets[index - 1].legs.length - 1] : null;
    const reportUTC = bucket.reportUTC || first.dutyReportUTC || '';

    let layover: DutyLayover | null = null;
    if (prev) {
      const gapMinutes = minutesBetween(prev.arvDateUTC, reportUTC);
      layover = {
        airport: (prev.arvArp || '').trim().toUpperCase(),
        hotel: (prev.hotel || '').trim(),
        hours: gapMinutes != null ? Math.round((gapMinutes / 60) * 100) / 100 : null,
      };
    }

    const publishedRest = published(groupLegs, leg => leg.dutyRestHours);
    const blockSum = groupLegs.reduce((sum, leg) => sum + (legBlockMinutes(leg) ?? 0), 0);
    const publishedBlock = published(groupLegs, leg => leg.dutyBlockMinutes);
    return {
      key: `${reportUTC || 'duty'}-${index}`,
      index,
      label: `D${index + 1}`,
      reportUTC,
      legs: groupLegs,
      firstLegIndex: bucket.firstLegIndex,
      fdpMinutes: published(groupLegs, leg => leg.dutyFdpMinutes),
      dpMinutes: published(groupLegs, leg => leg.dutyDpMinutes),
      blockMinutes: publishedBlock ?? (blockSum > 0 ? blockSum : null),
      restHours: publishedRest ?? layover?.hours ?? null,      layover,
    };
  });
}
