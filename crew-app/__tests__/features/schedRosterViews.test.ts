// Schedule tab ▸ Roster view (Ver11): Calendar grid + per-day timeline and the
// Route-map summary all read the SAME month model the Timeline list renders.
//
// Mock: docs/superpowers/completed/crew-app-v2-mock.html (#mockVer 11)
// Spec: docs/superpowers/specs/2026-09-11-crew-app-schedule-roster-views-design.md
import {
  agendaRows,
  calendarWeeks,
  dayTimeline,
  formatHM,
  formatKm,
  greatCirclePath,
  haversineKm,
  mercatorX,
  mercatorY,
  monthRoutes,
  monthStats,
  positionOf,
  routeViewBox,
  timelineBlockLabel,
  timelineHourLabel,
  timelineOffset,
  toggleCalendarSelection,
  viewPick,
} from '../../src/features/v2/schedView';
import { buildMonth } from '../../src/features/v2/model';
import type { Trip } from '../../src/features/travel/tripCsv';
import type { PortalDuty } from '../../src/features/travel/portalCapture';
import type { Meeting } from '../../src/features/meetings/meetingSetup';

const BASE = 'BKK';
const MODE = 'airport' as const;
const BASE_TZ = 'Asia/Bangkok';
/** Mid-month so nothing depends on "today" — buildMonth only marks today. */
const NOW = new Date('2026-09-12T09:00:00Z');

// All UTC fixtures below are the REAL instants for the local times in the same
// fixture (BKK is UTC+7, LHR UTC+1, SIN UTC+8) — the display layer renders the
// airport-local clock, so a fixture that "looks right" but is not UTC-consistent
// would silently test the wrong times.
const lhrTrip: Trip = {
  id: 'pair-lhr',
  crewId: '35459',
  checkInDateUTC: '19 Sep 2026 1400',
  legs: [
    {
      crewId: '35459', fltNumber: 'TG920', flightDateUTC: '19 Sep 2026 1545',
      depArp: 'BKK', arvDateUTC: '20 Sep 2026 0445', arvArp: 'LHR', fleet: 'Boeing 777-300',
      hotel: 'Hilton Heathrow', localDepTime: '2026-09-19 22:45', localArvTime: '2026-09-20 05:45',
      assignment: 'FLY',
    },
    {
      crewId: '35459', fltNumber: 'TG911', flightDateUTC: '21 Sep 2026 1030',
      depArp: 'LHR', arvDateUTC: '21 Sep 2026 2230', arvArp: 'BKK', fleet: 'Boeing 777-300',
      hotel: '', localDepTime: '2026-09-21 11:30', localArvTime: '2026-09-22 05:30',
      assignment: 'FLY',
    },
  ],
};

const sinTrip: Trip = {
  id: 'pair-sin',
  crewId: '35459',
  checkInDateUTC: '26 Sep 2026 1700',
  legs: [
    {
      crewId: '35459', fltNumber: 'TG403', flightDateUTC: '26 Sep 2026 1730',
      depArp: 'BKK', arvDateUTC: '26 Sep 2026 2000', arvArp: 'SIN', fleet: 'Airbus A350-900',
      hotel: '', localDepTime: '2026-09-27 00:30', localArvTime: '2026-09-27 04:00', assignment: 'FLY',
    },
    {
      crewId: '35459', fltNumber: 'TG402', flightDateUTC: '27 Sep 2026 1210',
      depArp: 'SIN', arvDateUTC: '27 Sep 2026 1435', arvArp: 'BKK', fleet: 'Airbus A350-900',
      hotel: '', localDepTime: '2026-09-27 20:10', localArvTime: '2026-09-27 21:35', assignment: 'FLY',
    },
  ],
};

/** Pre-dawn report: the hour axis must open before the mock's 06:00 default. */
const earlyTrip: Trip = {
  id: 'pair-han',
  crewId: '35459',
  checkInDateUTC: '04 Sep 2026 2130',
  legs: [{
    crewId: '35459', fltNumber: 'TG560', flightDateUTC: '04 Sep 2026 2300',
    depArp: 'BKK', arvDateUTC: '05 Sep 2026 0030', arvArp: 'HAN', fleet: 'Airbus A320',
    hotel: '', localDepTime: '2026-09-05 06:00', localArvTime: '2026-09-05 07:30', assignment: 'FLY',
  }],
};

const duties: PortalDuty[] = [
  {
    id: 'duty-off-11', assignment: 'OFF', fltNum: '', dutyType: 'OFF',
    localStart: '2026-09-11 00:00', localEnd: '2026-09-11 23:59',
    startUTC: '11 Sep 2026 0000', endUTC: '11 Sep 2026 2359', briefStart: '', crewId: '35459',
    carrier: 'TG', baseOffsetMin: 420, airportCode: 'BKK', raw: {},
  },
  {
    id: 'duty-sby-18', assignment: 'SBY', fltNum: '', dutyType: 'SBY',
    localStart: '2026-09-18 06:00', localEnd: '2026-09-18 18:00',
    startUTC: '18 Sep 2026 0600', endUTC: '18 Sep 2026 1800', briefStart: '', crewId: '35459',
    carrier: 'TG', baseOffsetMin: 420, airportCode: 'BKK', raw: {},
  },
];

const meetings: Meeting[] = [
  {
    id: 'ev-briefing',
    title: 'Fleet standardisation briefing',
    // 15:00 Bangkok. The instant matters: buildMonth keys a meeting by calendar
    // date, and the suite must not depend on the machine's own timezone.
    startISO: '2026-09-19T15:00:00+07:00',
    endISO: '2026-09-19T15:45:00+07:00',
    timeZone: 'Asia/Bangkok',
    calendarTitle: 'Ethiopian Exchange',
    allDay: false,
  },
];

function month() {
  return buildMonth(
    2026, 8, [lhrTrip, sinTrip, earlyTrip], duties, meetings,
    MODE, BASE_TZ, {}, NOW, { minutesBefore: 8, mutedIds: [] },
  );
}

const dayOf = (m: ReturnType<typeof month>, day: number) => m.days.find(d => d.day === day)!;

describe('route map · projections and distance', () => {
  it('projects in the same web-Mercator space the world outline is drawn in', () => {
    // Bangkok sits just above the equator on the centre meridian's eastern side.
    expect(mercatorX(0)).toBe(500);
    expect(mercatorY(0)).toBe(500);
    expect(mercatorX(100.75)).toBeGreaterThan(770);
    expect(mercatorY(13.69)).toBeLessThan(500);
  });

  it('measures great-circle distance between the airports crew actually fly', () => {
    const bkk = positionOf('BKK')!;
    const lhr = positionOf('LHR')!;
    const sin = positionOf('SIN')!;
    expect(haversineKm(bkk, lhr)).toBeGreaterThan(9400);
    expect(haversineKm(bkk, lhr)).toBeLessThan(9700);
    expect(haversineKm(bkk, sin)).toBeGreaterThan(1350);
    expect(haversineKm(bkk, sin)).toBeLessThan(1500);
    // Same point → zero.
    expect(haversineKm(bkk, bkk)).toBe(0);
  });

  it('draws one line per destination, never two overlapping ones for a round trip', () => {
    const routes = monthRoutes(month(), BASE);
    expect(routes.map(r => r.code)).toEqual(['HAN', 'SIN', 'LHR']); // nearest first
    const lhr = routes.find(r => r.code === 'LHR')!;
    expect(lhr.legs).toBe(2);
    expect(lhr.label).toContain('Heathrow');
    // The base itself is never a destination.
    expect(routes.some(r => r.code === BASE)).toBe(false);
  });

  it('samples a great circle and splits the path at the antimeridian', () => {
    const direct = greatCirclePath(positionOf('BKK')!, positionOf('LHR')!, 8);
    expect((direct.match(/M/g) || []).length).toBe(1);
    expect((direct.match(/[ML]/g) || []).length).toBe(9);
    // Hong Kong → Los Angeles crosses the date line: the line must break, not
    // shoot back across the whole map.
    const pacific = greatCirclePath(positionOf('HKG')!, positionOf('LAX')!, 32);
    expect((pacific.match(/M/g) || []).length).toBeGreaterThan(1);
  });

  it('fits the month at the card’s aspect ratio and zooms around the same centre', () => {
    const home = positionOf('ADD')!;
    const points = [positionOf('LHR')!, positionOf('MPM')!, positionOf('DMM')!];
    const [x, y, w, h] = routeViewBox(home, points, 1).split(' ').map(Number);
    // A stretched Mercator is a wrong map, so the box keeps the card's ratio.
    expect(w / h).toBeCloseTo(1.35, 1);
    // The crew's base and every destination sit inside the box.
    for (const p of [home, ...points]) {
      expect(mercatorX(p.lon)).toBeGreaterThanOrEqual(x);
      expect(mercatorX(p.lon)).toBeLessThanOrEqual(x + w);
      expect(mercatorY(p.lat)).toBeGreaterThanOrEqual(y);
      expect(mercatorY(p.lat)).toBeLessThanOrEqual(y + h);
    }
    const [x2, y2, w2, h2] = routeViewBox(home, points, 2).split(' ').map(Number);
    expect(w2).toBeLessThan(w);
    expect(h2).toBeLessThan(h);
    expect(x2 + w2 / 2).toBeCloseTo(x + w / 2, 0);
    expect(y2 + h2 / 2).toBeCloseTo(y + h / 2, 0);
  });
});

describe('route map · month summary', () => {
  it('knows the airports a captured portal roster can carry, not just the SIT flight table', () => {
    // TG's September roster out of the portal (BKK) plus the hubs a PR trip
    // realistically connects through — the reference table must cover these or
    // the map silently drops a route the crew actually flew.
    for (const code of ['BKK', 'PVG', 'ARN', 'OSL', 'NRT', 'NGO', 'ICN', 'PEK', 'DPS', 'CGK', 'DAC', 'MNL', 'LAX', 'HNL', 'SYD']) {
      expect(positionOf(code)).not.toBeNull();
    }
  });

  it('totals distance over every leg and counts routes, airports and countries', () => {
    const stats = monthStats(month(), BASE);
    expect(stats.flights).toBe(5);
    expect(stats.routes).toBe(3);
    expect(stats.airports).toBe(4); // BKK + LHR + SIN + HAN
    expect(stats.countries).toBe(4); // TH + GB + SG + VN
    // Two LHR legs (≈19,100 km) + two SIN legs (≈2,880 km) + one HAN leg (≈990 km).
    expect(stats.km).toBeGreaterThan(22500);
    expect(stats.km).toBeLessThan(23500);
  });

  it('counts block minutes from the model and duty minutes from report to release', () => {
    const m = month();
    const stats = monthStats(m, BASE);
    // Block comes straight from the month model (per-leg real UTC instants).
    expect(stats.blockMinutes).toBe(m.blockMinutes);
    // Day 19: 21:00 report → 05:45+1 = 8h45. Day 21 (no roster check-in) gets the
    // hour-before-departure fallback: 10:30 → 05:30+1 = 19h. Day 27: 00:00 → 21:35
    // = 21h35. Day 5: 04:30 → 07:30 = 3h. Standby 06:00–18:00 = 12h. The layover
    // rest day and the all-day day off contribute nothing.
    expect(stats.dutyMinutes).toBe(525 + 1140 + 1295 + 180 + 720);
  });

  it('formats the summary the way the roster does', () => {
    expect(formatHM(2705)).toBe('45:05');
    expect(formatHM(0)).toBe('0:00');
    expect(formatKm(21960)).toBe('21,960 km');
  });
});

describe('calendar · month grid', () => {
  it('lays the month out in Sunday-first weeks with blanks either side', () => {
    const weeks = calendarWeeks(month());
    expect(weeks).toHaveLength(5);
    // 1 Sep 2026 is a Tuesday → the first week starts with two blanks.
    expect(weeks[0].slice(0, 2)).toEqual([null, null]);
    expect(weeks[0][2]?.day).toBe(1);
    expect(weeks[0][2]?.isFlight).toBe(false);
    expect(weeks[4].filter(Boolean).map(c => c!.day)).toEqual([27, 28, 29, 30]);
  });

  it('marks a flying day with the flight glyph and every other published day with a dot', () => {
    const weeks = calendarWeeks(month());
    const flat = weeks.flat().filter(Boolean);
    const flight = flat.find(c => c!.day === 19)!;
    const standby = flat.find(c => c!.day === 18)!;
    const off = flat.find(c => c!.day === 11)!;
    const blank = flat.find(c => c!.day === 12)!;
    const layover = flat.find(c => c!.day === 20)!;
    expect(flight.isFlight).toBe(true);
    expect(standby.isFlight).toBe(false);
    expect(standby.hasContent).toBe(true);
    expect(off.hasContent).toBe(true);
    expect(layover.hasContent).toBe(true);
    // A day the airline published nothing for gets no marker at all.
    expect(blank.hasContent).toBe(false);
  });

  it('tapping the selected day clears back to the whole month', () => {
    expect(toggleCalendarSelection(null, 19)).toBe(19);
    expect(toggleCalendarSelection(19, 19)).toBeNull();
    expect(toggleCalendarSelection(19, 21)).toBe(21);
  });
});

describe('calendar · agenda', () => {
  it('lists the whole month, one row per event, when no day is selected', () => {
    const rows = agendaRows(month(), null);
    expect(rows.map(r => r.title)).toEqual([
      'TG560 BKK → HAN',
      'Day Off',
      'Standby',
      'TG920 BKK → LHR',
      'Fleet standardisation briefing',
      'Layover · LHR',
      'TG911 LHR → BKK',
      'TG403 BKK → SIN',
      'TG402 SIN → BKK',
    ]);
    // A leg row states the route; the date line keeps rows apart.
    expect(rows[3].sub).toBe('Sat 19 Sep');
    // Times carry the app's own clock marker (L = airport local).
    expect(rows[3].time).toBe('22:45L–05:45L');
    expect(rows[4].time).toBe('15:00–15:45');
    expect(rows[4].sub).toContain('iOS Cal');
    // Duty rows never restate the icon in words.
    expect(rows.some(r => /flight duty/i.test(r.title))).toBe(false);
  });

  it('scopes to a single day when the grid has a selection', () => {
    expect(agendaRows(month(), 20).map(r => r.title)).toEqual(['Layover · LHR']);
    expect(agendaRows(month(), 19).map(r => r.time)).toEqual(['22:45L–05:45L', '15:00–15:45']);
    expect(agendaRows(month(), 12)).toEqual([]);
  });
});

describe('calendar · day timeline', () => {
  it('draws the duty as one report→release block, positioned on the day clock', () => {
    const t = dayTimeline(dayOf(month(), 19));
    const duty = t.blocks.find(b => b.kind === 'duty')!;
    expect(duty.title).toBe('TG920');
    expect(duty.startMin).toBe(21 * 60); // 21:00 report
    expect(duty.endMin).toBe(5 * 60 + 45 + 24 * 60); // lands 05:45 next morning
    // The axis extends past midnight rather than clipping the block.
    expect(t.endHour).toBe(30);
  });

  it('opens the axis earlier when the crew reports before 06:00', () => {
    const t = dayTimeline(dayOf(month(), 5));
    expect(t.startHour).toBe(4);
    expect(t.blocks[0].startMin).toBe(4 * 60 + 30);
  });

  it('draws a midnight departure from 00:00 but labels the real report window', () => {
    // Real case found on the simulator (TG662 BKK→PVG): report 22:45, wheels up
    // 00:30, landing 05:45 — the duty was already running when the day began.
    const m = buildMonth(
      2026, 8,
      [{
        id: 'pair-pvg', crewId: '35459', checkInDateUTC: '15 Sep 2026 1545',
        legs: [{
          crewId: '35459', fltNumber: 'TG662', flightDateUTC: '15 Sep 2026 1730',
          depArp: 'BKK', arvDateUTC: '15 Sep 2026 2245', arvArp: 'PVG', fleet: 'Boeing 777-300',
          hotel: '', localDepTime: '2026-09-16 00:30', localArvTime: '2026-09-16 05:45', assignment: 'FLY',
        }],
      }],
      [], [], 'airport', BASE_TZ, {}, NOW, { minutesBefore: 8, mutedIds: [] },
    );
    const t = dayTimeline(dayOf(m, 16));
    const duty = t.blocks[0];
    expect(duty.startMin).toBe(0);
    expect(duty.endMin).toBe(5 * 60 + 45);
    expect(timelineBlockLabel(duty)).toBe('22:45–05:45');
    expect(t.startHour).toBe(0);
  });

  it('places a calendar event by its own start and end', () => {
    const t = dayTimeline(dayOf(month(), 19));
    const meet = t.blocks.find(b => b.kind === 'meeting')!;
    expect(meet.startMin).toBe(15 * 60);
    expect(meet.endMin).toBe(15 * 60 + 45);
    expect(meet.title).toBe('Fleet standardisation briefing');
  });

  it('draws a layover day as a whole-day band', () => {
    const t = dayTimeline(dayOf(month(), 20));
    expect(t.blocks).toHaveLength(1);
    expect(t.blocks[0]).toMatchObject({ kind: 'layover', allDay: true, startMin: 0, endMin: 1440 });
    expect(t.startHour).toBe(6);
    expect(t.endHour).toBe(24);
  });

  it('labels the axis with the mock’s 06:00–24:00 default and flags the next day', () => {
    expect(timelineHourLabel(6)).toBe('06:00');
    expect(timelineHourLabel(24)).toBe('24:00');
    expect(timelineHourLabel(25)).toBe('01:00 +1');
    expect(timelineOffset(6 * 60, 6, 24)).toBe(0);
    expect(timelineOffset(24 * 60, 6, 24)).toBe(1);
    expect(timelineOffset(3 * 60, 6, 24)).toBe(0); // clamped, never negative
  });
});

describe('roster-view picker', () => {
  it('lights the Calendar row for both of its modes', () => {
    expect(viewPick('timeline')).toBe('timeline');
    expect(viewPick('calendar-compact')).toBe('calendar');
    expect(viewPick('calendar-detail')).toBe('calendar');
    expect(viewPick('route')).toBe('route');
  });
});
