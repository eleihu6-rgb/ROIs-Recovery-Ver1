// ─── Schedule KPI calculation (Floating Summary) ─────────────────────────────
// Pure derivation behind the Schedule tab's floating limit summary. Nothing
// here renders.
//
// Contract (docs/superpowers/specs/2026-10-19-crew-schedule-floating-summary-
// implementation-Ver1.md):
// • The selected date is the END of a BACKWARD-looking window. Windows are
//   calendar days in the operator/base zone — never 168-hour buckets.
// • Only records anchored on or before the selected day are counted.
// • Duty hours are DP / report-to-release, never FDP. A published duty total
//   repeated on several legs is counted once (groupDuties already does that).
// • One operating flight is one take-off and one landing. Deadhead and other
//   non-flying legs are excluded.
// • A window whose history is not covered is reported as incomplete. It never
//   shows full headroom that the roster cannot prove.
//
// Allocation policy: a duty period belongs to the calendar day of its REPORT
// instant; a flight belongs to the calendar day of its DEPARTURE. That is the
// deterministic policy this build can defend from the roster data it has. An
// operator-specific cross-midnight allocation rule would replace it — see the
// spec's §4 note; the missing contract is recorded in the implementation note.

import type { PortalDuty } from '../travel/portalCapture';
import { roisBaseToUTC } from '../travel/portalCapture';
import { parseRosterUTC } from '../settings/timeFormat';
import type { Trip, TripLeg } from '../travel/tripCsv';
import { groupDuties } from './dutyGroups';
import type { KpiLimits } from '../roster/kpiProfile';
import { categorise } from '../roster/dutyDisplay';

export interface CivilDate {
  year: number;
  /** 0-based, like Date#getMonth. */
  monthIdx: number;
  day: number;
}

export interface KpiCoverage {
  /** Inclusive first calendar day the roster is authoritative for (yyyymmdd). */
  startYmd: number;
  /** Inclusive last calendar day the roster is authoritative for (yyyymmdd). */
  endYmd: number;
  /** 'derived' = inferred from the months present in the loaded roster. */
  source: 'derived' | 'declared';
}

export type KpiMetricStatus = 'ok' | 'at-limit' | 'over' | 'short' | 'unavailable';

export interface KpiWindow {
  startYmd: number;
  endYmd: number;
  /** "11–17 Oct" / "1 Nov 2025–17 Oct 2026". */
  label: string;
}

export interface KpiHoursMetric {
  id: 'flight28' | 'flightYear' | 'flight12m' | 'duty7' | 'duty14' | 'duty28';
  label: string;
  window: KpiWindow;
  /** Counted minutes, or null when the roster cannot support the figure. */
  usedMinutes: number | null;
  limitMinutes: number;
  status: KpiMetricStatus;
  /** Large headline: "64.0h left" / "Over by 4.5h" / "0h · at limit" / "—". */
  main: string;
  /** Supporting line: "36.0h / 100h limit". */
  sub: string;
  /** Bar fill 0–100, clamped for an exceeded limit. */
  pct: number;
  /** False when the window is not fully covered by history (or data is missing). */
  complete: boolean;
  completedMinutes: number;
  plannedMinutes: number;
}

export interface KpiCountMetric {
  id: 'takeoffs' | 'landings';
  label: string;
  count: number | null;
  minimum: number;
  status: KpiMetricStatus;
  /** "1 needed" / "0" / "+2" / "—". */
  main: string;
  /** "2 / 3 minimum". */
  sub: string;
  pct: number;
  complete: boolean;
  /**
   * The count is a proven lower bound from the covered part of the window
   * (more flights may exist before the roster history starts). It is only
   * reported when that lower bound already meets the minimum.
   */
  partial: boolean;
}

export interface ScheduleKpi {
  selectedYmd: number;
  /** "17 Oct 2026". */
  selectedLabel: string;
  zone: string;
  profileId: string;
  profileLabel: string;
  flight: KpiHoursMetric[];
  duty: KpiHoursMetric[];
  recency: {
    window: KpiWindow;
    takeOffs: KpiCountMetric;
    landings: KpiCountMetric;
  };
  /** Hour windows currently over their limit (all six, including hidden ones). */
  breaches: number;
  /** Hour windows whose history/data coverage is incomplete. */
  incomplete: number;
  /** First day of derived roster history, "1 Sep 2026", or null when empty. */
  historyFrom: string | null;
}

export interface ScheduleKpiInput {
  trips: Trip[];
  duties: PortalDuty[];
  /** The selected day in the regulatory/base calendar. */
  selected: CivilDate;
  /** IANA zone that defines the calendar-day windows. */
  zone: string;
  profile: KpiLimits;
  /** Real clock, used only to split completed vs planned contributions. */
  now: Date;
  /** Restrict to one crew so two accounts can never mix. */
  crewId?: string | null;
  /** Declared roster coverage; derived from the records when omitted. */
  coverage?: KpiCoverage | null;
}

// ─── Calendar-day helpers ────────────────────────────────────────────────────

export function ymdOf({ year, monthIdx, day }: CivilDate): number {
  return year * 10000 + (monthIdx + 1) * 100 + day;
}

export function civilOf(ymd: number): CivilDate {
  return { year: Math.floor(ymd / 10000), monthIdx: (Math.floor(ymd / 100) % 100) - 1, day: ymd % 100 };
}

/** Calendar-day arithmetic (no timezone, no DST involvement). */
export function addDays(date: CivilDate, days: number): CivilDate {
  const t = Date.UTC(date.year, date.monthIdx, date.day + days);
  const d = new Date(t);
  return { year: d.getUTCFullYear(), monthIdx: d.getUTCMonth(), day: d.getUTCDate() };
}

export function addMonths(date: CivilDate, months: number): CivilDate {
  const t = Date.UTC(date.year, date.monthIdx + months, 1);
  const d = new Date(t);
  return { year: d.getUTCFullYear(), monthIdx: d.getUTCMonth(), day: 1 };
}

export function monthEnd(date: CivilDate): CivilDate {
  const t = new Date(Date.UTC(date.year, date.monthIdx + 1, 0));
  return { year: t.getUTCFullYear(), monthIdx: t.getUTCMonth(), day: t.getUTCDate() };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "17 Oct 2026". */
export function formatDay(ymd: number): string {
  const d = civilOf(ymd);
  return `${d.day} ${MONTHS[d.monthIdx]} ${d.year}`;
}

/** Compact inclusive range: "11–17 Oct", "20 Sep–17 Oct", "1 Nov 2025–17 Oct 2026". */
export function formatWindowLabel(startYmd: number, endYmd: number): string {
  const a = civilOf(startYmd);
  const b = civilOf(endYmd);
  if (a.year !== b.year) {
    return `${a.day} ${MONTHS[a.monthIdx]} ${a.year}–${b.day} ${MONTHS[b.monthIdx]} ${b.year}`;
  }
  if (a.monthIdx === b.monthIdx) {
    return `${a.day}–${b.day} ${MONTHS[b.monthIdx]}`;
  }
  return `${a.day} ${MONTHS[a.monthIdx]}–${b.day} ${MONTHS[b.monthIdx]}`;
}

/** Calendar day (yyyymmdd) of an instant in one IANA zone. */
export function ymdInZone(ms: number, zone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(ms));
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
    return get('year') * 10000 + get('month') * 100 + get('day');
  } catch {
    const d = new Date(ms);
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  }
}

function isoMs(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function legDepartureMs(leg: TripLeg): number | null {
  return isoMs(leg.actDepUtc)
    ?? isoMs(leg.estDepUtc)
    ?? parseRosterUTC(leg.flightDateUTC)?.getTime()
    ?? null;
}

function legArrivalMs(leg: TripLeg): number | null {
  return isoMs(leg.actArvUtc)
    ?? isoMs(leg.estArvUtc)
    ?? parseRosterUTC(leg.arvDateUTC)?.getTime()
    ?? null;
}

function isOperatingLeg(leg: TripLeg): boolean {
  return (leg.assignment ?? 'FLY').trim().toUpperCase() === 'FLY';
}

function portalBaseOffset(duty: PortalDuty): number {
  return typeof duty.baseOffsetMin === 'number' ? duty.baseOffsetMin : 420;
}

/** ISO timestamp with an explicit zone designator ("…Z" / "…+08:00"). */
function explicitInstantMs(value: string | undefined): number | null {
  if (!value || !/(Z|[+-]\d{2}:?\d{2})$/.test(value.trim())) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** UTC instant of a portal duty's report (brief) or start, whichever exists. */
function portalDutyReportMs(duty: PortalDuty): number | null {
  const explicit = explicitInstantMs(duty.briefStart);
  if (explicit != null) return explicit;
  const brief = roisBaseToUTC(duty.briefStart, portalBaseOffset(duty));
  return parseRosterUTC(brief)?.getTime()
    ?? explicitInstantMs(duty.startUTC)
    // `startUTC` is often the portal's base-local wall clock, not a real UTC
    // instant — convert it exactly like the brief time.
    ?? parseRosterUTC(roisBaseToUTC(duty.startUTC, portalBaseOffset(duty)))?.getTime()
    ?? parseRosterUTC(duty.startUTC)?.getTime()
    ?? null;
}

function portalDutyReleaseMs(duty: PortalDuty): number | null {
  return explicitInstantMs(duty.endUTC)
    ?? parseRosterUTC(roisBaseToUTC(duty.endUTC, portalBaseOffset(duty)))?.getTime()
    ?? parseRosterUTC(duty.endUTC)?.getTime()
    ?? parseRosterUTC(roisBaseToUTC(duty.localEnd, portalBaseOffset(duty)))?.getTime()
    ?? null;
}

function localHhmm(value: string | undefined): string {
  const m = (value || '').match(/[ T](\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '';
}

/** The portal marks a whole-day row (day off, leave, holiday) 00:00–23:59. */
function isAllDayPortalDuty(duty: PortalDuty): boolean {
  return localHhmm(duty.localStart) === '00:00' && localHhmm(duty.localEnd) === '23:59';
}

/** A roster row whose local end clock is at or before its start crosses midnight. */
function isOvernightLocal(duty: PortalDuty): boolean {
  const start = localHhmm(duty.localStart);
  const end = localHhmm(duty.localEnd);
  return !!start && !!end && end <= start;
}

// ─── Records ────────────────────────────────────────────────────────────────

interface DutyPeriod {
  anchorYmd: number;
  reportMs: number | null;
  endMs: number | null;
  dpMinutes: number | null;
  blockMinutes: number | null;
  /** A flying duty owns block minutes; a ground duty contributes none. */
  kind: 'flight' | 'ground';
}

interface FlightMark {
  ymd: number;
  departureMs: number;
  completed: boolean;
}

interface Collected {
  periods: DutyPeriod[];
  flights: FlightMark[];
  /** FLY legs whose departure could not be placed on a calendar day. */
  unplacedFlights: number;
  /** All record days, for coverage derivation. */
  recordDays: number[];
}

function collect(
  trips: Trip[],
  duties: PortalDuty[],
  zone: string,
  nowMs: number,
  crewId?: string | null,
): Collected {
  const periods: DutyPeriod[] = [];
  const flights: FlightMark[] = [];
  const recordDays: number[] = [];
  let unplacedFlights = 0;
  const seenLegs = new Set<string>();
  const tripByReport = new Map<number, DutyPeriod>();

  const mine = (crew: string) => !crewId || !crew || crew === crewId;

  for (const trip of trips) {
    if (!mine(trip.crewId)) continue;
    for (const group of groupDuties(trip)) {
      const reportLeg = group.legs[0];
      const reportMs = parseRosterUTC(group.reportUTC)?.getTime()
        ?? (reportLeg ? legDepartureMs(reportLeg) : null);
      if (reportMs == null) {
        // An undated duty cannot be placed in a calendar window. Count it as an
        // unplaced flight rather than silently claiming the window is complete.
        unplacedFlights += group.legs.length;
        continue;
      }
      const anchorYmd = ymdInZone(reportMs, zone);
      const arrivals = group.legs.map(legArrivalMs).filter((v): v is number => v != null);
      periods.push({
        anchorYmd,
        reportMs,
        endMs: arrivals.length ? Math.max(...arrivals) : null,
        dpMinutes: group.dpMinutes,
        blockMinutes: group.blockMinutes,
        kind: 'flight',
      });
      tripByReport.set(Math.round(reportMs / 60000), periods[periods.length - 1]);
      recordDays.push(anchorYmd);
      for (const leg of group.legs) {
        const key = `${leg.fltNumber}|${leg.flightDateUTC}|${leg.depArp}`;
        if (seenLegs.has(key) || !isOperatingLeg(leg)) continue;
        seenLegs.add(key);
        const depMs = legDepartureMs(leg);
        if (depMs == null) {
          unplacedFlights++;
          continue;
        }
        flights.push({ ymd: ymdInZone(depMs, zone), departureMs: depMs, completed: depMs <= nowMs });
      }
    }
  }

  // Ground duties (standby, training, days off, …). FLY duties already came in
  // through the trip groups; skip the same report instant so a published total
  // repeated on both sources is never summed twice.
  for (const duty of duties) {
    if (!mine(duty.crewId)) continue;
    const reportMs = portalDutyReportMs(duty);
    if (reportMs == null) continue;
    const isFlight = (duty.assignment || '').toUpperCase() === 'FLY';
    let endMs = portalDutyReleaseMs(duty);
    // A duty that runs past midnight can be stored with the same date on both
    // ends (23:00 → 02:00), which reads as a negative window. Roll the release
    // forward a day so report-to-release keeps its real length.
    if (endMs != null && endMs <= reportMs && isOvernightLocal(duty)) {
      endMs += 86_400_000;
    }
    const published = typeof duty.dpMinutes === 'number' && duty.dpMinutes > 0 ? duty.dpMinutes : null;
    if (isFlight) {
      // The same duty arrives from both sources. Match on the report instant;
      // when a row carries no brief time we fall back to the nearest trip duty
      // within six hours (the brief offset is far smaller than the gap between
      // duties). Never add the hours twice — only fill a gap on the trip side.
      let period = tripByReport.get(Math.round(reportMs / 60000));
      if (!period) {
        let bestDelta = 6 * 3600_000;
        for (const [key, candidate] of tripByReport) {
          const delta = Math.abs(key * 60000 - reportMs);
          if (delta <= bestDelta) {
            bestDelta = delta;
            period = candidate;
          }
        }
      }
      if (period) {
        const block = typeof duty.blockMinutes === 'number' && duty.blockMinutes > 0 ? duty.blockMinutes : null;
        if (period.dpMinutes == null && published != null) period.dpMinutes = published;
        if (period.blockMinutes == null && block != null) period.blockMinutes = block;
        continue;
      }
    }
    const anchorYmd = ymdInZone(reportMs, zone);
    recordDays.push(anchorYmd);
    const category = categorise(duty.assignment).category;
    const noDutyTime = category === 'off' || category === 'leave' || isAllDayPortalDuty(duty);
    if (published == null && noDutyTime) {
      // A day off / leave / all-day marker is not a duty period. It contributes
      // no hours — and must not mark the whole window "not published".
      continue;
    }
    // No published DP (ground duties): the roster's own report→release window is
    // the defensible DP estimate. It stays labelled as an estimate in the sheet.
    const elapsed = published == null && endMs != null && endMs > reportMs
      ? Math.round((endMs - reportMs) / 60000)
      : null;
    if (published == null && elapsed == null) {
      // A timed duty with no published total and no usable window cannot be
      // attributed any minutes; the window stays "not published" (honest).
      periods.push({
        anchorYmd, reportMs, endMs, dpMinutes: null, blockMinutes: null, kind: isFlight ? 'flight' : 'ground',
      });
      continue;
    }
    periods.push({
      anchorYmd,
      reportMs,
      endMs,
      dpMinutes: published ?? elapsed,
      blockMinutes: null,
      kind: isFlight ? 'flight' : 'ground',
    });
  }

  return { periods, flights, unplacedFlights, recordDays };
}

/**
 * The months present in the loaded roster describe the authoritative span.
 * Both capture paths fetch whole months, so the span runs from the first day of
 * the earliest month with a record to the last day of the latest month.
 */
export function deriveCoverage(recordDays: number[]): KpiCoverage | null {
  if (!recordDays.length) return null;
  const first = civilOf(Math.min(...recordDays));
  const last = civilOf(Math.max(...recordDays));
  return {
    startYmd: ymdOf({ year: first.year, monthIdx: first.monthIdx, day: 1 }),
    endYmd: ymdOf(monthEnd(last)),
    source: 'derived',
  };
}

/**
 * The span a roster capture actually fetched. The portal asks for a fixed set
 * of month offsets (`ROSTER_MONTH_OFFSETS`), so a month with no duties at all
 * is a real empty month rather than missing history.
 */
export function captureWindowCoverage(now: Date, monthOffsets: readonly number[]): KpiCoverage {
  const base = { year: now.getFullYear(), monthIdx: now.getMonth(), day: 1 };
  const first = addMonths(base, Math.min(...monthOffsets));
  const last = addMonths(base, Math.max(...monthOffsets));
  return { startYmd: ymdOf(first), endYmd: ymdOf(monthEnd(last)), source: 'declared' };
}

/** The widest span either source can prove: never narrows below a declaration. */
function mergeCoverage(declared: KpiCoverage | null | undefined, derived: KpiCoverage | null): KpiCoverage | null {
  if (!declared) return derived;
  if (!derived) return declared;
  return {
    startYmd: Math.min(declared.startYmd, derived.startYmd),
    endYmd: Math.max(declared.endYmd, derived.endYmd),
    source: 'declared',
  };
}

// ─── Metric presentation ────────────────────────────────────────────────────

/** Hours with one decimal, e.g. "64.0". */
export function hoursText(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

/** A configured cap reads as "100h" (no trailing ".0"). */
export function limitText(minutes: number): string {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

function covered(window: KpiWindow, coverage: KpiCoverage | null): boolean {
  if (!coverage) return false;
  return coverage.startYmd <= window.startYmd && coverage.endYmd >= window.endYmd;
}

function windowOf(startYmd: number, endYmd: number): KpiWindow {
  return { startYmd, endYmd, label: formatWindowLabel(startYmd, endYmd) };
}

interface HoursArgs {
  id: KpiHoursMetric['id'];
  label: string;
  window: KpiWindow;
  usedMinutes: number | null;
  limitMinutes: number;
  covered: boolean;
  dataComplete: boolean;
  completedMinutes: number;
  plannedMinutes: number;
}

function hoursMetric(args: HoursArgs): KpiHoursMetric {
  const { usedMinutes, limitMinutes } = args;
  const complete = args.covered && args.dataComplete;
  const base = {
    id: args.id,
    label: args.label,
    window: args.window,
    limitMinutes,
    complete,
    completedMinutes: args.completedMinutes,
    plannedMinutes: args.plannedMinutes,
  };
  if (usedMinutes == null || !complete) {
    return {
      ...base,
      usedMinutes: null,
      status: 'unavailable',
      main: '—',
      sub: args.covered ? 'Duty total not published' : 'History incomplete',
      pct: 0,
    };
  }
  const used = hoursText(usedMinutes);
  const limit = limitText(limitMinutes);
  if (usedMinutes > limitMinutes) {
    return {
      ...base,
      usedMinutes,
      status: 'over',
      main: `Over by ${hoursText(usedMinutes - limitMinutes)}h`,
      sub: `${used}h / ${limit} · OVER LIMIT`,
      pct: 100,
    };
  }
  if (usedMinutes === limitMinutes) {
    return {
      ...base,
      usedMinutes,
      status: 'at-limit',
      main: '0h · at limit',
      sub: `${used}h / ${limit} limit`,
      pct: 100,
    };
  }
  return {
    ...base,
    usedMinutes,
    status: 'ok',
    main: `${hoursText(limitMinutes - usedMinutes)}h left`,
    sub: `${used}h / ${limit} limit`,
    pct: (usedMinutes / limitMinutes) * 100,
  };
}

/** Recency wording: a deficit is "1 needed", the minimum itself is "0", above it "+1". */
export function recencyText(count: number, minimum: number): { main: string; status: KpiMetricStatus } {
  if (count < minimum) return { main: `${minimum - count} needed`, status: 'short' };
  if (count === minimum) return { main: '0', status: 'ok' };
  return { main: `+${count - minimum}`, status: 'ok' };
}

function countMetric(
  id: KpiCountMetric['id'],
  label: string,
  count: number | null,
  minimum: number,
  covered: boolean,
): KpiCountMetric {
  if (count == null) {
    return {
      id, label, count: null, minimum, status: 'unavailable',
      main: '—', sub: 'History incomplete', pct: 0, complete: false, partial: false,
    };
  }
  const text = recencyText(count, minimum);
  if (!covered) {
    // A partial window can still PROVE the minimum is met — the count can only
    // grow with older flights. It cannot prove a deficit, so that stays "—".
    if (text.status === 'ok') {
      return {
        id, label, count, minimum, status: 'ok',
        main: text.main,
        sub: `≥ ${count} / ${minimum} minimum`,
        pct: Math.min(100, (count / minimum) * 100),
        complete: false,
        partial: true,
      };
    }
    return {
      id, label, count: null, minimum, status: 'unavailable',
      main: '—', sub: 'History incomplete', pct: 0, complete: false, partial: true,
    };
  }
  return {
    id,
    label,
    count,
    minimum,
    status: text.status,
    main: text.main,
    sub: `${count} / ${minimum} minimum`,
    pct: Math.min(100, (count / minimum) * 100),
    complete: true,
    partial: false,
  };
}

// ─── Builder ────────────────────────────────────────────────────────────────

function sumWindow(
  periods: DutyPeriod[],
  window: KpiWindow,
  applies: (p: DutyPeriod) => boolean,
  pick: (p: DutyPeriod) => number | null,
  nowMs: number,
): { used: number | null; complete: boolean; completed: number; planned: number } {
  let used = 0;
  let completed = 0;
  let planned = 0;
  let missing = false;
  for (const p of periods) {
    if (p.anchorYmd < window.startYmd || p.anchorYmd > window.endYmd) continue;
    if (!applies(p)) continue;
    const value = pick(p);
    if (value == null) {
      missing = true;
      continue;
    }
    used += value;
    const done = p.endMs != null ? p.endMs <= nowMs : (p.reportMs ?? 0) <= nowMs;
    if (done) completed += value;
    else planned += value;
  }
  return { used: missing ? null : used, complete: !missing, completed, planned };
}

export function buildScheduleKpi(input: ScheduleKpiInput): ScheduleKpi {
  const { profile, zone, now } = input;
  const nowMs = now.getTime();
  const selectedYmd = ymdOf(input.selected);
  const collected = collect(input.trips, input.duties, zone, nowMs, input.crewId);
  const coverage = mergeCoverage(input.coverage, deriveCoverage(collected.recordDays));

  const hoursWindow = (start: CivilDate, end: CivilDate) => windowOf(ymdOf(start), ymdOf(end));

  const flightWindows: Array<{ id: KpiHoursMetric['id']; label: string; window: KpiWindow; limit: number }> = [
    {
      id: 'flight28',
      label: 'Flight · 28 days',
      window: hoursWindow(addDays(input.selected, -27), input.selected),
      limit: profile.block28Minutes,
    },
    {
      id: 'flightYear',
      label: 'Flight · calendar year',
      window: hoursWindow({ year: input.selected.year, monthIdx: 0, day: 1 }, input.selected),
      limit: profile.blockYearMinutes,
    },
    {
      id: 'flight12m',
      label: 'Flight · 12 calendar months',
      window: hoursWindow(addMonths(input.selected, -11), input.selected),
      limit: profile.block12MonthMinutes,
    },
  ];

  const dutyWindows: Array<{ id: KpiHoursMetric['id']; label: string; window: KpiWindow; limit: number }> = [
    {
      id: 'duty7',
      label: 'Duty · 7 days',
      window: hoursWindow(addDays(input.selected, -6), input.selected),
      limit: profile.duty7Minutes,
    },
    {
      id: 'duty14',
      label: 'Duty · 14 days',
      window: hoursWindow(addDays(input.selected, -13), input.selected),
      limit: profile.duty14Minutes,
    },
    {
      id: 'duty28',
      label: 'Duty · 28 days',
      window: hoursWindow(addDays(input.selected, -27), input.selected),
      limit: profile.duty28Minutes,
    },
  ];

  const flight = flightWindows.map(w => {
    const sum = sumWindow(collected.periods, w.window, p => p.kind === 'flight', p => p.blockMinutes, nowMs);
    return hoursMetric({
      id: w.id,
      label: w.label,
      window: w.window,
      usedMinutes: sum.used,
      limitMinutes: w.limit,
      covered: covered(w.window, coverage),
      dataComplete: sum.complete,
      completedMinutes: sum.completed,
      plannedMinutes: sum.planned,
    });
  });

  const duty = dutyWindows.map(w => {
    const sum = sumWindow(collected.periods, w.window, () => true, p => p.dpMinutes, nowMs);
    return hoursMetric({
      id: w.id,
      label: w.label,
      window: w.window,
      usedMinutes: sum.used,
      limitMinutes: w.limit,
      covered: covered(w.window, coverage),
      dataComplete: sum.complete,
      completedMinutes: sum.completed,
      plannedMinutes: sum.planned,
    });
  });

  const recencyWindow = windowOf(ymdOf(addDays(input.selected, -89)), selectedYmd);
  const inRecency = collected.flights.filter(f => f.ymd >= recencyWindow.startYmd && f.ymd <= recencyWindow.endYmd);
  const recencyCovered = covered(recencyWindow, coverage) && collected.unplacedFlights === 0;
  const takeOffs = countMetric('takeoffs', 'Take-offs', inRecency.length, profile.recencyMinimum, recencyCovered);
  const landings = countMetric('landings', 'Landings', inRecency.length, profile.recencyMinimum, recencyCovered);

  const allHours = [...flight, ...duty];
  const historyFrom = coverage ? formatDay(coverage.startYmd) : null;

  return {
    selectedYmd,
    selectedLabel: formatDay(selectedYmd),
    zone,
    profileId: profile.id,
    profileLabel: profile.label,
    flight,
    duty,
    recency: { window: recencyWindow, takeOffs, landings },
    breaches: allHours.filter(m => m.status === 'over').length,
    incomplete: allHours.filter(m => !m.complete).length,
    historyFrom,
  };
}

/** Shown when the carrier has no configured limit profile. */
export function unavailableKpi(selected: CivilDate, zone: string, carrier: string): ScheduleKpi {
  const selectedYmd = ymdOf(selected);
  const emptyHours = (
    id: KpiHoursMetric['id'],
    label: string,
    window: KpiWindow,
    limitMinutes = 0,
  ): KpiHoursMetric => ({
    id,
    label,
    window,
    usedMinutes: null,
    limitMinutes,
    status: 'unavailable',
    main: '—',
    sub: 'Limits not configured',
    pct: 0,
    complete: false,
    completedMinutes: 0,
    plannedMinutes: 0,
  });
  const emptyCount = (id: KpiCountMetric['id'], label: string): KpiCountMetric => ({
    id, label, count: null, minimum: 0, status: 'unavailable',
    main: '—', sub: 'Limits not configured', pct: 0, complete: false, partial: false,
  });
  const flight = [
    emptyHours('flight28', 'Flight · 28 days', windowOf(ymdOf(addDays(selected, -27)), selectedYmd)),
    emptyHours('flightYear', 'Flight · calendar year',
      windowOf(ymdOf({ year: selected.year, monthIdx: 0, day: 1 }), selectedYmd)),
    emptyHours('flight12m', 'Flight · 12 calendar months',
      windowOf(ymdOf(addMonths(selected, -11)), selectedYmd)),
  ];
  const duty = [
    emptyHours('duty7', 'Duty · 7 days', windowOf(ymdOf(addDays(selected, -6)), selectedYmd)),
    emptyHours('duty14', 'Duty · 14 days', windowOf(ymdOf(addDays(selected, -13)), selectedYmd)),
    emptyHours('duty28', 'Duty · 28 days', windowOf(ymdOf(addDays(selected, -27)), selectedYmd)),
  ];
  return {
    selectedYmd,
    selectedLabel: formatDay(selectedYmd),
    zone,
    profileId: `unconfigured:${carrier}`,
    profileLabel: 'No limit profile configured',
    flight,
    duty,
    recency: {
      window: windowOf(ymdOf(addDays(selected, -89)), selectedYmd),
      takeOffs: emptyCount('takeoffs', 'Take-offs'),
      landings: emptyCount('landings', 'Landings'),
    },
    breaches: 0,
    incomplete: 0,
    historyFrom: null,
  };
}
