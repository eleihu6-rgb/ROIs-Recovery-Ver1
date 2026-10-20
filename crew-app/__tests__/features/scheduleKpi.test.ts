// Schedule KPI calculation (Floating Summary). The figures shown to a crew must
// be anchored to the selected calendar day in the base zone, count a published
// duty total once, and never invent history the roster does not cover.
import {
  buildScheduleKpi,
  deriveCoverage,
  formatWindowLabel,
  recencyText,
  unavailableKpi,
  ymdInZone,
  type ScheduleKpiInput,
} from '../../src/features/v2/scheduleKpi';
import type { Trip, TripLeg } from '../../src/features/travel/tripCsv';
import type { PortalDuty } from '../../src/features/travel/portalCapture';
import { kpiProfileFor } from '../../src/features/roster/kpiProfile';

const TG = kpiProfileFor('TG')!;
const BKK = 'Asia/Bangkok';

// ─── Fixtures: real two-leg rotations (base → outstation → base) ─────────────

interface LegSpec {
  /** Report/brief instant of the duty this leg belongs to. */
  report: string;
  dep: string;
  arv: string;
  depArp: string;
  arvArp: string;
  flt: string;
}

interface TripSpec {
  id: string;
  legs: LegSpec[];
  crewId?: string;
  /** Published duty totals, repeated on every leg — as the portal sends them. */
  dpMinutes?: number;
  blockMinutes?: number;
}

function trip(spec: TripSpec): Trip {
  const crewId = spec.crewId ?? '35459';
  const legs: TripLeg[] = spec.legs.map(leg => ({
    crewId,
    fltNumber: leg.flt,
    flightDateUTC: leg.dep,
    depArp: leg.depArp,
    arvDateUTC: leg.arv,
    arvArp: leg.arvArp,
    fleet: 'Boeing 777-300',
    hotel: '',
    assignment: 'FLY',
    dutyReportUTC: leg.report,
    ...(spec.dpMinutes != null ? { dutyDpMinutes: spec.dpMinutes } : {}),
    ...(spec.blockMinutes != null ? { dutyBlockMinutes: spec.blockMinutes } : {}),
  }));
  return { id: spec.id, crewId, checkInDateUTC: spec.legs[0].report, legs };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "17 Oct 2026 0600" for a UTC date/time, including its real clock. */
function roster(date: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(date.getUTCDate())} ${MON[date.getUTCMonth()]} ${date.getUTCFullYear()}`
    + ` ${p2(date.getUTCHours())}${p2(date.getUTCMinutes())}`;
}

function dayOf(year: number, monthIdx: number, day: number, hour = 6, minute = 0): Date {
  return new Date(Date.UTC(year, monthIdx, day, hour, minute));
}

/**
 * One duty: report, fly out, fly back. Times are real UTC; the route/flight
 * numbers are ones TG actually flies from BKK.
 */
function rotation(opts: {
  id: string;
  report: Date;
  depArp?: string;
  arvArp?: string;
  flt?: string;
  dpMinutes?: number;
  blockMinutes?: number;
  crewId?: string;
  /** A crew can fly out and deadhead home — the return is not an operating leg. */
  returnAssignment?: 'FLY' | 'DHD';
}): Trip {
  const dep = new Date(opts.report.getTime() + 2 * 3600_000);
  const outArv = new Date(opts.report.getTime() + 4 * 3600_000);
  const back = new Date(opts.report.getTime() + 6 * 3600_000);
  const backArv = new Date(opts.report.getTime() + 8 * 3600_000);
  const from = opts.depArp ?? 'BKK';
  const to = opts.arvArp ?? 'SIN';
  const flt = opts.flt ?? 'TG409';
  const built = trip({
    id: opts.id,
    crewId: opts.crewId,
    dpMinutes: opts.dpMinutes,
    blockMinutes: opts.blockMinutes,
    legs: [
      { report: roster(opts.report), dep: roster(dep), arv: roster(outArv), depArp: from, arvArp: to, flt },
      { report: roster(opts.report), dep: roster(back), arv: roster(backArv), depArp: to, arvArp: from, flt: `${flt}R` },
    ],
  });
  if (opts.returnAssignment === 'DHD') {
    built.legs[1].assignment = 'DHD';
  }
  return built;
}

/** N duties on consecutive days from `start`, all inside the 28-day window. */
function duties(
  start: Date,
  count: number,
  blockMinutes: number,
  dpMinutes: number,
  route: { depArp: string; arvArp: string; flt: string } = { depArp: 'BKK', arvArp: 'SIN', flt: 'TG409' },
): Trip[] {
  return Array.from({ length: count }, (_, i) => rotation({
    id: `duty-${i}`,
    report: new Date(start.getTime() + i * 86_400_000),
    blockMinutes,
    dpMinutes,
    ...route,
  }));
}

const OCT17 = { year: 2026, monthIdx: 9, day: 17 };
/** The whole year before the selected day is covered. */
const FULL_HISTORY = { startYmd: 20250101, endYmd: 20261231, source: 'declared' as const };

function input(overrides: Partial<ScheduleKpiInput> = {}): ScheduleKpiInput {
  return {
    trips: [],
    duties: [],
    selected: OCT17,
    zone: BKK,
    profile: TG,
    now: new Date('2026-10-17T12:00:00Z'),
    crewId: '35459',
    ...overrides,
  };
}

const metric = (kpi: ReturnType<typeof buildScheduleKpi>, id: string) =>
  [...kpi.flight, ...kpi.duty].find(m => m.id === id)!;

describe('schedule KPI · windows', () => {
  it('anchors every window on the selected day, inclusive and backward-looking', () => {
    const kpi = buildScheduleKpi(input());
    expect(metric(kpi, 'duty7').window.startYmd).toBe(20261011);
    expect(metric(kpi, 'duty14').window.startYmd).toBe(20261004);
    expect(metric(kpi, 'duty28').window.startYmd).toBe(20260920);
    expect(metric(kpi, 'flight28').window.startYmd).toBe(20260920);
    expect(metric(kpi, 'flightYear').window.startYmd).toBe(20260101);
    expect(metric(kpi, 'flight12m').window.startYmd).toBe(20251101);
    expect(kpi.recency.window.startYmd).toBe(20260720);
    [...kpi.flight, ...kpi.duty].forEach(m => expect(m.window.endYmd).toBe(20261017));

    expect(metric(kpi, 'duty7').window.label).toBe('11–17 Oct');
    expect(metric(kpi, 'flightYear').window.label).toBe('1 Jan–17 Oct');
    expect(metric(kpi, 'flight12m').window.label).toBe('1 Nov 2025–17 Oct 2026');
    expect(kpi.recency.window.label).toBe('20 Jul–17 Oct');
  });

  it('rolls windows across a year boundary', () => {
    const kpi = buildScheduleKpi(input({ selected: { year: 2026, monthIdx: 0, day: 5 } }));
    expect(metric(kpi, 'duty28').window.startYmd).toBe(20251209);
    expect(metric(kpi, 'flightYear').window.startYmd).toBe(20260101);
    expect(metric(kpi, 'flight12m').window.startYmd).toBe(20250201);
    expect(kpi.recency.window.startYmd).toBe(20251008);
  });

  it('handles a leap-year 90-day window', () => {
    const kpi = buildScheduleKpi(input({ selected: { year: 2028, monthIdx: 2, day: 1 } }));
    expect(kpi.recency.window.startYmd).toBe(20271203);
  });
});

describe('schedule KPI · counting', () => {
  it('includes the selected day and excludes anything after it', () => {
    const kpi = buildScheduleKpi(input({
      coverage: FULL_HISTORY,
      trips: [
        rotation({ id: 'on-selected', report: dayOf(2026, 9, 17), dpMinutes: 480, blockMinutes: 240 }),
        rotation({ id: 'after-selected', report: dayOf(2026, 9, 18), dpMinutes: 480, blockMinutes: 240 }),
      ],
    }));
    expect(metric(kpi, 'duty7').usedMinutes).toBe(480);
    expect(metric(kpi, 'flight28').usedMinutes).toBe(240);
  });

  it('anchors a cross-midnight flight on its own calendar day in the base zone', () => {
    // 18 Oct 01:00 Bangkok is 17 Oct 18:00 UTC. Selecting 17 Oct must not count it.
    const kpi = buildScheduleKpi(input({
      coverage: FULL_HISTORY,
      trips: [rotation({ id: 'late-night', report: dayOf(2026, 9, 18, 1), dpMinutes: 300, blockMinutes: 150 })],
    }));
    expect(metric(kpi, 'duty7').usedMinutes).toBe(0);
    expect(kpi.recency.takeOffs.count).toBe(0);
  });

  it('counts a published duty total repeated on several legs only once', () => {
    const kpi = buildScheduleKpi(input({
      coverage: FULL_HISTORY,
      trips: [rotation({ id: 'repeat', report: dayOf(2026, 9, 17), dpMinutes: 600, blockMinutes: 240 })],
    }));
    expect(metric(kpi, 'duty7').usedMinutes).toBe(600);
    expect(metric(kpi, 'flight28').usedMinutes).toBe(240);
  });

  it('keeps accounts isolated by crew id', () => {
    const kpi = buildScheduleKpi(input({
      coverage: FULL_HISTORY,
      trips: [
        rotation({ id: 'tg', report: dayOf(2026, 9, 17), dpMinutes: 480, blockMinutes: 240 }),
        rotation({ id: 'pr', crewId: '433535', report: dayOf(2026, 9, 17), dpMinutes: 999, blockMinutes: 999 }),
      ],
    }));
    expect(metric(kpi, 'duty7').usedMinutes).toBe(480);
    expect(metric(kpi, 'flight28').usedMinutes).toBe(240);
  });

  it('uses calendar days in the base zone across a DST change', () => {
    // New York falls back on 1 Nov 2026. A duty reporting 4 Oct 23:30 EDT is
    // 5 Oct 03:30 UTC; a 28-day window starting 5 Oct must NOT include it.
    const ny = 'America/New_York';
    const duty: PortalDuty = {
      id: 'dst-duty', assignment: 'OFF', fltNum: '', dutyType: 'OFF',
      localStart: '2026-10-04 23:30', localEnd: '2026-10-05 06:00',
      startUTC: '2026-10-04 23:30', endUTC: '2026-10-05 06:00', briefStart: '2026-10-04 23:30',
      crewId: '35459', carrier: 'TG', baseOffsetMin: 0, raw: {},
    };
    const kpi = buildScheduleKpi(input({
      coverage: FULL_HISTORY,
      zone: ny,
      selected: { year: 2026, monthIdx: 10, day: 1 },
      duties: [duty],
      now: new Date('2026-11-01T12:00:00Z'),
    }));
    expect(metric(kpi, 'duty28').window.startYmd).toBe(20261005);
    expect(metric(kpi, 'duty28').usedMinutes).toBe(0);
    expect(ymdInZone(Date.parse('2026-10-05T03:30:00Z'), ny)).toBe(20261004);
  });

  it('places a portal duty on its report instant and uses report→release', () => {
    // Bangkok report 01 Oct 23:30 = 16:30 UTC; the duty belongs to 1 Oct.
    const duty: PortalDuty = {
      id: 'ground', assignment: 'SBY', fltNum: '', dutyType: 'Standby',
      localStart: '2026-10-01 23:30', localEnd: '2026-10-02 06:00',
      startUTC: '2026-10-01 23:30', endUTC: '2026-10-02 06:00', briefStart: '2026-10-01 23:30',
      crewId: '35459', carrier: 'TG', baseOffsetMin: 420, raw: {},
    };
    const kpi = buildScheduleKpi(input({ duties: [duty], coverage: FULL_HISTORY }));
    expect(metric(kpi, 'duty7').usedMinutes).toBe(0);
    expect(metric(kpi, 'duty28').usedMinutes).toBe(390);
  });

  it('does not let a day off or leave row invalidate the duty window', () => {
    // PR rosters carry all-day "X" / "EL" rows with no published duty total.
    // They are not duty periods and must contribute nothing — and must not turn
    // the whole window into "Duty total not published".
    const dayRow = (id: string, assignment: string, day: number): PortalDuty => ({
      id, assignment, fltNum: '', dutyType: assignment,
      localStart: `2026-10-${String(day).padStart(2, '0')} 00:00`,
      localEnd: `2026-10-${String(day).padStart(2, '0')} 23:59`,
      startUTC: `2026-10-${String(day).padStart(2, '0')} 00:00`,
      endUTC: `2026-10-${String(day).padStart(2, '0')} 23:59`,
      briefStart: '',
      crewId: '433535', carrier: 'PR', baseOffsetMin: 480, raw: {},
    });
    const kpi = buildScheduleKpi(input({
      selected: { year: 2026, monthIdx: 9, day: 8 },
      crewId: '433535',
      trips: [rotation({
        id: 'pr-fly', crewId: '433535', report: dayOf(2026, 9, 6), dpMinutes: 480, blockMinutes: 240,
        depArp: 'MNL', arvArp: 'DAD', flt: 'PR585',
      })],
      duties: [dayRow('off-x', 'X', 4), dayRow('leave-el', 'EL', 5)],
      coverage: { startYmd: 20250901, endYmd: 20261231, source: 'declared' },
    }));
    expect(metric(kpi, 'duty7').usedMinutes).toBe(480);
    expect(metric(kpi, 'duty7').complete).toBe(true);
    expect(metric(kpi, 'duty7').sub).toBe('8.0h / 60h limit');
  });

  it('fills a missing trip duty total from the portal row without double counting', () => {
    const flyRow: PortalDuty = {
      id: 'fly-row', assignment: 'FLY', fltNum: 'PR585', dutyType: 'FLY',
      localStart: '2026-10-06 06:00', localEnd: '2026-10-06 14:00',
      startUTC: '2026-10-06 06:00', endUTC: '2026-10-06 14:00', briefStart: '2026-10-06 06:00',
      crewId: '433535', carrier: 'PR', baseOffsetMin: 480, raw: {},
      dpMinutes: 480, blockMinutes: 240,
    };
    const kpi = buildScheduleKpi(input({
      selected: { year: 2026, monthIdx: 9, day: 8 },
      crewId: '433535',
      // The trip itself publishes no totals.
      trips: [rotation({
        id: 'pr-fly', crewId: '433535',
        // 06:00 Manila on 6 Oct = 22:00Z on 5 Oct, the same instant as the row.
        report: dayOf(2026, 9, 5, 22),
        depArp: 'MNL', arvArp: 'DAD', flt: 'PR585',
      })],
      duties: [flyRow],
      coverage: { startYmd: 20250901, endYmd: 20261231, source: 'declared' },
    }));
    // The row and the trip describe the same duty, so its 480 minutes count once.
    expect(metric(kpi, 'duty7').usedMinutes).toBe(480);
    expect(metric(kpi, 'duty7').complete).toBe(true);
  });

  it('keeps the real length of a ground duty that runs past midnight', () => {
    // PR roster rows can carry 23:00 → 02:00 with the same date on both ends.
    const overnight: PortalDuty = {
      id: 'night', assignment: 'AME', fltNum: '', dutyType: 'AME',
      localStart: '2026-10-06 23:00', localEnd: '2026-10-06 02:00',
      startUTC: '2026-10-06 23:00', endUTC: '2026-10-06 02:00', briefStart: '',
      crewId: '35459', carrier: 'PR', baseOffsetMin: 480, raw: {},
    };
    const kpi = buildScheduleKpi(input({
      selected: { year: 2026, monthIdx: 9, day: 8 },
      duties: [overnight],
      coverage: FULL_HISTORY,
    }));
    expect(metric(kpi, 'duty7').usedMinutes).toBe(180);
    expect(metric(kpi, 'duty7').complete).toBe(true);
  });

  it('still matches a flight row whose brief time is missing (start time only)', () => {
    // The trip reports at 06:00; the portal row has no briefStart and carries
    // the 07:15 duty start instead. Same duty, so its total must count once.
    const flyRow: PortalDuty = {
      id: 'fly-nobrief', assignment: 'FLY', fltNum: 'PR585', dutyType: 'FLY',
      localStart: '2026-10-06 07:15', localEnd: '2026-10-06 15:00',
      startUTC: '2026-10-06 07:15', endUTC: '2026-10-06 15:00', briefStart: '',
      crewId: '35459', carrier: 'PR', baseOffsetMin: 480, raw: {},
      dpMinutes: 480,
    };
    const kpi = buildScheduleKpi(input({
      selected: { year: 2026, monthIdx: 9, day: 8 },
      trips: [rotation({ id: 'pr-fly', report: dayOf(2026, 9, 5, 22), depArp: 'MNL', arvArp: 'DAD', flt: 'PR585' })],
      duties: [flyRow],
      coverage: FULL_HISTORY,
    }));
    expect(metric(kpi, 'duty7').usedMinutes).toBe(480);
    expect(metric(kpi, 'duty7').complete).toBe(true);
  });
});

describe('schedule KPI · presentation', () => {
  it('reports headroom under the cap', () => {
    // 12 × 3h = 36h of block in the last 28 days.
    const kpi = buildScheduleKpi(input({
      trips: duties(dayOf(2026, 8, 20), 12, 180, 480, { depArp: 'BKK', arvArp: 'SGN', flt: 'TG560' }),
      coverage: FULL_HISTORY,
    }));
    expect(metric(kpi, 'flight28').usedMinutes).toBe(2160);
    expect(metric(kpi, 'flight28').main).toBe('64.0h left');
    expect(metric(kpi, 'flight28').sub).toBe('36.0h / 100h limit');
    expect(metric(kpi, 'flight28').pct).toBeCloseTo(36, 5);
    expect(metric(kpi, 'flight28').status).toBe('ok');
  });

  it('says "at limit" exactly at the cap and clamps the bar', () => {
    // 25 × 4h = 100h, spread over the 28 days before 17 Oct.
    const kpi = buildScheduleKpi(input({
      trips: duties(dayOf(2026, 8, 20), 25, 240, 480),
      coverage: FULL_HISTORY,
    }));
    expect(metric(kpi, 'flight28').usedMinutes).toBe(6000);
    expect(metric(kpi, 'flight28').status).toBe('at-limit');
    expect(metric(kpi, 'flight28').main).toBe('0h · at limit');
    expect(metric(kpi, 'flight28').pct).toBe(100);
  });

  it('reports an exceeded limit as "Over by", never a negative remainder', () => {
    // 20 × 5h (BKK–HKG) + 1 × 4.5h = 104.5h.
    const hkg = { depArp: 'BKK', arvArp: 'HKG', flt: 'TG600' };
    const kpi = buildScheduleKpi(input({
      trips: [
        ...duties(dayOf(2026, 8, 20), 20, 300, 480, hkg),
        ...duties(dayOf(2026, 9, 12), 1, 270, 480),
      ],
      coverage: FULL_HISTORY,
    }));
    expect(metric(kpi, 'flight28').usedMinutes).toBe(6270);
    expect(metric(kpi, 'flight28').status).toBe('over');
    expect(metric(kpi, 'flight28').main).toBe('Over by 4.5h');
    expect(metric(kpi, 'flight28').sub).toBe('104.5h / 100h · OVER LIMIT');
    expect(metric(kpi, 'flight28').pct).toBe(100);
    expect(kpi.breaches).toBe(1);
  });

  it('flags a breach in a window the floating card does not show', () => {
    // Eight 14-hour duties from 4 Oct: 112h in the 14-day window (over 110h),
    // while the 11–17 Oct window holds only one (14h, under 60h).
    const kpi = buildScheduleKpi(input({
      trips: duties(dayOf(2026, 9, 4), 8, 60, 840),
      coverage: FULL_HISTORY,
    }));
    expect(metric(kpi, 'duty7').status).toBe('ok');
    expect(metric(kpi, 'duty14').usedMinutes).toBe(6720);
    expect(metric(kpi, 'duty14').status).toBe('over');
    expect(kpi.breaches).toBe(1);
  });

  it('shows a recency deficit, the minimum, and the numeric surplus', () => {
    // Two-leg rotations: 2 flights each unless the return is a deadhead.
    const recency = (rotations: Array<{ deadheadReturn?: boolean }>) => buildScheduleKpi(input({
      coverage: FULL_HISTORY,
      trips: rotations.map((r, i) => rotation({
        id: `r${i}`, report: dayOf(2026, 9, 10 + i), dpMinutes: 480, blockMinutes: 240,
        ...(r.deadheadReturn ? { returnAssignment: 'DHD' as const } : {}),
      })),
    })).recency;

    const two = recency([{}]);
    expect(two.takeOffs.main).toBe('1 needed');
    expect(two.takeOffs.sub).toBe('2 / 3 minimum');
    expect(two.takeOffs.status).toBe('short');
    expect(two.takeOffs.pct).toBeCloseTo(66.67, 1);
    expect(two.landings.main).toBe('1 needed');

    const three = recency([{}, { deadheadReturn: true }]);
    expect(three.takeOffs.main).toBe('0');
    expect(three.takeOffs.status).toBe('ok');
    expect(three.takeOffs.pct).toBe(100);

    expect(recency([{}, {}]).takeOffs.main).toBe('+1');
    const five = recency([{}, {}, { deadheadReturn: true }]);
    expect(five.landings.main).toBe('+2');
    expect(five.landings.pct).toBe(100);

    expect(recencyText(0, 3).main).toBe('3 needed');
    expect(recencyText(3, 3).main).toBe('0');
    expect(recencyText(6, 3).main).toBe('+3');
  });

  it('shows incomplete history instead of inventing headroom', () => {
    const kpi = buildScheduleKpi(input({
      trips: [
        rotation({ id: 'sep', report: dayOf(2026, 8, 20), dpMinutes: 480, blockMinutes: 240 }),
        rotation({ id: 'oct', report: dayOf(2026, 9, 17), dpMinutes: 480, blockMinutes: 240 }),
      ],
    }));
    // Roster records exist in Sep and Oct, so the 28-day windows are covered…
    expect(metric(kpi, 'duty7').complete).toBe(true);
    // …but a year of history is not present.
    expect(metric(kpi, 'flightYear').complete).toBe(false);
    expect(metric(kpi, 'flightYear').main).toBe('—');
    expect(metric(kpi, 'flightYear').sub).toBe('History incomplete');
    expect(metric(kpi, 'flight12m').main).toBe('—');
    expect(kpi.historyFrom).toBe('1 Sep 2026');
  });

  it('treats a missing published duty total as unavailable, not zero', () => {
    const kpi = buildScheduleKpi(input({
      trips: [rotation({ id: 'no-dp', report: dayOf(2026, 9, 17), blockMinutes: 240 })],
      coverage: FULL_HISTORY,
    }));
    expect(metric(kpi, 'duty7').usedMinutes).toBeNull();
    expect(metric(kpi, 'duty7').sub).toBe('Duty total not published');
    expect(metric(kpi, 'flight28').usedMinutes).toBe(240);
  });

  it('splits completed and planned contributions', () => {
    const kpi = buildScheduleKpi(input({
      trips: [
        rotation({ id: 'done', report: dayOf(2026, 9, 15), dpMinutes: 480, blockMinutes: 240 }),
        // 20:00 Bangkok on 17 Oct is 13:00Z — inside the selected day.
        rotation({ id: 'planned', report: dayOf(2026, 9, 17, 13), dpMinutes: 480, blockMinutes: 240 }),
      ],
      coverage: FULL_HISTORY,
    }));
    expect(metric(kpi, 'duty7').completedMinutes).toBe(480);
    expect(metric(kpi, 'duty7').plannedMinutes).toBe(480);
  });
});

describe('schedule KPI · coverage and profiles', () => {
  it('derives coverage from whole months present in the roster', () => {
    expect(deriveCoverage([20260903, 20261017])).toEqual({
      startYmd: 20260901, endYmd: 20261031, source: 'derived',
    });
    expect(deriveCoverage([])).toBeNull();
  });

  it('only applies a profile to the carriers it is configured for', () => {
    expect(TG.id).toBe('tg-operator');
    expect(kpiProfileFor('PR')?.id).toBe('pr-operator');
    expect(kpiProfileFor('EK')).toBeNull();
    expect(kpiProfileFor('')).toBeNull();

    const kpi = unavailableKpi(OCT17, BKK, 'EK');
    expect(kpi.flight[0].main).toBe('—');
    expect(kpi.flight[0].sub).toBe('Limits not configured');
    expect(kpi.profileLabel).toBe('No limit profile configured');
  });

  it('formats ranges that fall inside one month', () => {
    expect(formatWindowLabel(20261011, 20261017)).toBe('11–17 Oct');
    expect(formatWindowLabel(20260920, 20261017)).toBe('20 Sep–17 Oct');
  });
});
