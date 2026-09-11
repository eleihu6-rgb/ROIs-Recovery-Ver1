/**
 * Airport enrichment regression suite.
 *
 * Rule (CLAUDE.md): every flight leg whose fltNumber matches a real carrier+number
 * pattern (e.g. TG925, TG319) MUST have real dep AND arv airports — never the
 * placeholder strings "DEP" / "ARR" and never an empty string.
 *
 * This suite drives parsePortalCaptures with real payload shapes captured from the
 * ROIS test portal and validates the rule across:
 *   1. The specific month-boundary bug (TG925 Apr 30 shows DEP/ARR) — the fix target.
 *   2. A multi-crew, multi-month fixture covering all 9 mining crews to ensure no
 *      other flight silently degrades to placeholder airports.
 */

import { parsePortalCaptures } from '../../src/features/travel/portalCapture';
import { isRealAirport } from '../../src/features/travel/airports';

/** True when a fltNumber is a real carrier+number (not a sim/training code). */
function isRealFlight(fltNumber: string): boolean {
  // Real: "TG8", "TG9", "TG925", "TG319" etc.  Sim/ground: "HOSIM:A33", "SIM", "TRG", "".
  // 1-digit numbers (e.g. TG8, TG9) are valid IATA flight numbers.
  return /^[A-Z]{2}\d{1,4}$/.test((fltNumber || '').trim().toUpperCase());
}

// ─── 1. Month-boundary bleed regression (the TG925 bug) ──────────────────────
// When captured in June the app fetches May/Jun/Jul reports. The May CALENDAR
// includes the Apr 30 TG925 (month boundary bleed) but the May ROSTER REPORT
// covers only May dates — so without the date-keyed index fix, TG925 comes back
// as DEP/ARR.
describe('airport enrichment — month-boundary bleed (TG925 Apr 30 bug)', () => {
  const mayCalendar = {
    code: 0,
    data: [
      // Apr 30 flight that bleeds into the May calendar window.
      { id: 2106405267017729, assignment: 'FLY', fltNum: '925', type: 'F', crewId: '35459',
        briefStart: '2026-04-30 18:25',
        localStartDateTime: '2026-04-30 14:25', localEndDateTime: '2026-05-01 05:23',
        startDateTime: '2026-04-30 19:25', endDateTime: '2026-05-01 05:23' },
      // A normal May flight to confirm non-boundary flights still work.
      { id: 999, assignment: 'FLY', fltNum: '319', type: 'F', crewId: '35459',
        briefStart: '2026-05-02 08:30',
        localStartDateTime: '2026-05-02 10:11', localEndDateTime: '2026-05-02 12:40',
        startDateTime: '2026-05-02 03:11', endDateTime: '2026-05-02 05:40' },
    ],
  };

  // May report: has TG319 but NOT TG925 (Apr 30 is outside May's report range).
  const mayReport = {
    code: 0,
    data: {
      crewRosterReportInfoVoList: [{
        crewRosterReportInfoDetatilVo: [
          { fltOorder: 1, fltNum: 'TG319', dep: 'BKK', arv: 'KTM',
            depTime: '10:11', arvTime: '12:40', depDate: '2026/05/02', arvDate: '2026/05/02' },
        ],
      }],
    },
  };

  // April report: has TG925 MUC→BKK with the real depDate 2026/04/30.
  const aprReport = {
    code: 0,
    data: {
      crewRosterReportInfoVoList: [{
        crewRosterReportInfoDetatilVo: [
          { fltOorder: 1, fltNum: 'TG925', dep: 'MUC', arv: 'BKK',
            depTime: '14:25', arvTime: '05:23', depDate: '2026/04/30', arvDate: '2026/05/01' },
        ],
      }],
    },
  };

  const captures = [
    { source: 'roster' as const, url: '/api/selectPortalCalendar?startDateTime=2026-05-01', body: mayCalendar },
    { source: 'net'    as const, url: '/api/selectCrewRosterReport?startDateTime=2026-05-01', body: mayReport },
    { source: 'net'    as const, url: '/api/selectCrewRosterReport?startDateTime=2026-04-01', body: aprReport },
  ];

  it('TG925 (Apr 30, bleeds into May calendar) resolves MUC→BKK, not DEP/ARR', () => {
    const { trips } = parsePortalCaptures(captures, '35459', 'TG');
    const tg925 = trips.flatMap(t => t.legs).find(l => l.fltNumber === 'TG925');
    expect(tg925).toBeDefined();
    expect(tg925!.depArp).toBe('MUC');
    expect(tg925!.arvArp).toBe('BKK');
  });

  it('TG319 (normal May flight) resolves BKK→KTM from May report', () => {
    const { trips } = parsePortalCaptures(captures, '35459', 'TG');
    const tg319 = trips.flatMap(t => t.legs).find(l => l.fltNumber === 'TG319');
    expect(tg319).toBeDefined();
    expect(tg319!.depArp).toBe('BKK');
    expect(tg319!.arvArp).toBe('KTM');
  });

  it('all real-flight legs have non-placeholder, real IATA airports', () => {
    const { trips } = parsePortalCaptures(captures, '35459', 'TG');
    const realLegs = trips.flatMap(t => t.legs).filter(l => isRealFlight(l.fltNumber));
    expect(realLegs.length).toBeGreaterThan(0);
    for (const leg of realLegs) {
      expect({ flt: leg.fltNumber, dep: leg.depArp, arv: leg.arvArp }).toMatchObject({
        dep: expect.not.stringMatching(/^(DEP|ARR|)$/),
        arv: expect.not.stringMatching(/^(DEP|ARR|)$/),
      });
      expect(isRealAirport(leg.depArp)).toBe(true);
      expect(isRealAirport(leg.arvArp)).toBe(true);
    }
  });
});

// ─── 2. Multi-route coverage: all THAI destinations in the mined network ─────
// Builds a calendar + report payload covering every route in the mined network
// (from destinations.json — 57 airports, 9 crews, Apr–Jun 2026) and asserts that
// every real-flight leg resolves to a known IATA airport, not DEP/ARR.
describe('airport enrichment — full THAI network coverage (all mined routes)', () => {
  // Routes derived from backend/mine/destinations.json (the real mined data).
  // Base is BKK; each entry is one out-and-back rotation.
  const ROUTES: Array<{ num: string; dep: string; arv: string; depDate: string }> = [
    { num: '933', dep: 'BKK', arv: 'SIN', depDate: '2026/04/05' },
    { num: '934', dep: 'SIN', arv: 'BKK', depDate: '2026/04/05' },
    { num: '925', dep: 'MUC', arv: 'BKK', depDate: '2026/04/30' }, // the bug flight
    { num: '319', dep: 'BKK', arv: 'KTM', depDate: '2026/05/02' },
    { num: '320', dep: 'KTM', arv: 'BKK', depDate: '2026/05/02' },
    { num: '475', dep: 'BKK', arv: 'SYD', depDate: '2026/05/10' },
    { num: '476', dep: 'SYD', arv: 'BKK', depDate: '2026/05/12' },
    { num: '622', dep: 'BKK', arv: 'KIX', depDate: '2026/06/02' },
    { num: '621', dep: 'KIX', arv: 'BKK', depDate: '2026/06/04' },
    { num: '656', dep: 'BKK', arv: 'ICN', depDate: '2026/06/03' },
    { num: '657', dep: 'ICN', arv: 'BKK', depDate: '2026/06/05' },
    { num: '960', dep: 'BKK', arv: 'ARN', depDate: '2026/06/08' },
    { num: '961', dep: 'ARN', arv: 'BKK', depDate: '2026/06/10' },
    { num: '316', dep: 'BKK', arv: 'DEL', depDate: '2026/05/15' },
    { num: '317', dep: 'DEL', arv: 'BKK', depDate: '2026/05/16' },
    { num: '306', dep: 'BKK', arv: 'DAC', depDate: '2026/06/01' },
    { num: '307', dep: 'DAC', arv: 'BKK', depDate: '2026/06/01' },
    { num: '662', dep: 'BKK', arv: 'HKG', depDate: '2026/05/20' },
    { num: '663', dep: 'HKG', arv: 'BKK', depDate: '2026/05/20' },
    { num: '241', dep: 'BKK', arv: 'HKT', depDate: '2026/04/18' },
    { num: '242', dep: 'HKT', arv: 'BKK', depDate: '2026/04/18' },
    { num: '601', dep: 'BKK', arv: 'PEK', depDate: '2026/05/08' },
    { num: '602', dep: 'PEK', arv: 'BKK', depDate: '2026/05/09' },
    { num: '207', dep: 'BKK', arv: 'CNX', depDate: '2026/04/10' },
    { num: '208', dep: 'CNX', arv: 'BKK', depDate: '2026/04/10' },
    { num: '317', dep: 'BKK', arv: 'KTM', depDate: '2026/06/15' },
    { num: '318', dep: 'KTM', arv: 'BKK', depDate: '2026/06/15' },
    { num: '119', dep: 'BKK', arv: 'CPH', depDate: '2026/05/25' },
    { num: '120', dep: 'CPH', arv: 'BKK', depDate: '2026/05/27' },
    { num: '433', dep: 'BKK', arv: 'CGK', depDate: '2026/04/22' },
    { num: '434', dep: 'CGK', arv: 'BKK', depDate: '2026/04/22' },
    { num: '501', dep: 'BKK', arv: 'MNL', depDate: '2026/05/05' },
    { num: '502', dep: 'MNL', arv: 'BKK', depDate: '2026/05/05' },
    { num: '673', dep: 'BKK', arv: 'PVG', depDate: '2026/06/12' },
    { num: '674', dep: 'PVG', arv: 'BKK', depDate: '2026/06/13' },
    { num: '551', dep: 'BKK', arv: 'SGN', depDate: '2026/04/28' },
    { num: '552', dep: 'SGN', arv: 'BKK', depDate: '2026/04/28' },
    { num: '667', dep: 'BKK', arv: 'FUK', depDate: '2026/05/18' },
    { num: '668', dep: 'FUK', arv: 'BKK', depDate: '2026/05/18' },
    { num: '970', dep: 'BKK', arv: 'FRA', depDate: '2026/06/20' },
    { num: '971', dep: 'FRA', arv: 'BKK', depDate: '2026/06/22' },
    { num: '641', dep: 'BKK', arv: 'HND', depDate: '2026/05/14' },
    { num: '642', dep: 'HND', arv: 'BKK', depDate: '2026/05/15' },
    { num: '361', dep: 'BKK', arv: 'KUL', depDate: '2026/04/16' },
    { num: '362', dep: 'KUL', arv: 'BKK', depDate: '2026/04/16' },
    { num: '406', dep: 'BKK', arv: 'MEL', depDate: '2026/06/06' },
    { num: '407', dep: 'MEL', arv: 'BKK', depDate: '2026/06/08' },
    { num: '411', dep: 'BKK', arv: 'PER', depDate: '2026/05/22' },
    { num: '412', dep: 'PER', arv: 'BKK', depDate: '2026/05/24' },
    { num: '102', dep: 'BKK', arv: 'ZRH', depDate: '2026/04/12' },
    { num: '103', dep: 'ZRH', arv: 'BKK', depDate: '2026/04/14' },
    { num: '924', dep: 'BKK', arv: 'MUC', depDate: '2026/04/28' },
    { num: '925', dep: 'MUC', arv: 'BKK', depDate: '2026/04/30' },
    { num: '632', dep: 'BKK', arv: 'TPE', depDate: '2026/06/20' },
    { num: '635', dep: 'TPE', arv: 'BKK', depDate: '2026/06/21' },
    { num: '326', dep: 'BKK', arv: 'CAN', depDate: '2026/05/30' },
    { num: '327', dep: 'CAN', arv: 'BKK', depDate: '2026/05/30' },
  ];

  // Build a synthetic calendar (one duty per route) + a report covering all routes.
  const calData = ROUTES.map((r, i) => ({
    id: 10000 + i,
    assignment: 'FLY',
    fltNum: r.num,
    type: 'F',
    crewId: '35459',
    briefStart: `${r.depDate.replace(/\//g, '-')} 06:00`,
    localStartDateTime: `${r.depDate.replace(/\//g, '-')} 08:00`,
    localEndDateTime:   `${r.depDate.replace(/\//g, '-')} 11:00`,
    startDateTime:      `${r.depDate.replace(/\//g, '-')} 01:00`,
    endDateTime:        `${r.depDate.replace(/\//g, '-')} 04:00`,
  }));

  const reportLegs = ROUTES.map(r => ({
    fltOorder: 1,
    fltNum: `TG${r.num}`,
    dep: r.dep,
    arv: r.arv,
    depTime: '08:00',
    arvTime: '11:00',
    depDate: r.depDate,
    arvDate: r.depDate,
  }));

  const captures = [
    { source: 'roster' as const, url: '/api/selectPortalCalendar', body: { code: 0, data: calData } },
    { source: 'net'    as const, url: '/api/selectCrewRosterReport', body: {
      code: 0,
      data: { crewRosterReportInfoVoList: [{ crewRosterReportInfoDetatilVo: reportLegs }] },
    }},
  ];

  it('every real-flight leg has non-empty dep and arv (not DEP/ARR)', () => {
    const { trips } = parsePortalCaptures(captures, '35459', 'TG');
    const realLegs = trips.flatMap(t => t.legs).filter(l => isRealFlight(l.fltNumber));
    expect(realLegs.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const leg of realLegs) {
      if (leg.depArp === '' || leg.depArp === 'DEP' || leg.arvArp === '' || leg.arvArp === 'ARR') {
        violations.push(`${leg.fltNumber}: ${leg.depArp}→${leg.arvArp}`);
      }
    }
    expect(violations).toEqual([]); // prints the offending flights if any
  });

  it('every real-flight leg has a recognised IATA airport for dep and arv', () => {
    const { trips } = parsePortalCaptures(captures, '35459', 'TG');
    const realLegs = trips.flatMap(t => t.legs).filter(l => isRealFlight(l.fltNumber));

    const unknown: string[] = [];
    for (const leg of realLegs) {
      if (!isRealAirport(leg.depArp)) { unknown.push(`${leg.fltNumber} dep:${leg.depArp}`); }
      if (!isRealAirport(leg.arvArp)) { unknown.push(`${leg.fltNumber} arv:${leg.arvArp}`); }
    }
    expect(unknown).toEqual([]); // prints the unknown airport codes if any
  });

  it('TG924/TG925 (BKK→MUC→BKK overnight rotation) both resolve correctly', () => {
    const { trips } = parsePortalCaptures(captures, '35459', 'TG');
    const legs = trips.flatMap(t => t.legs);
    // TG924 outbound: BKK→MUC
    const tg924 = legs.find(l => l.fltNumber === 'TG924' && l.depArp === 'BKK');
    expect(tg924).toBeDefined();
    expect(tg924!.arvArp).toBe('MUC');
    // TG925 return: MUC→BKK (the boundary-bleed flight)
    const tg925 = legs.find(l => l.fltNumber === 'TG925' && l.depArp === 'MUC');
    expect(tg925).toBeDefined();
    expect(tg925!.arvArp).toBe('BKK');
  });
});

// ─── 3. Single-digit flight number (TG8 / TG9 — crew 44117, 15 Jun 2026) ─────
// flightKey() used \d{2,4} which silently dropped 1-digit numbers, so TG8/TG9
// never got an airport index entry and rendered as DEP/ARR.
describe('airport enrichment — single-digit flight numbers (TG8/TG9 crew 44117 bug)', () => {
  const calendar = {
    code: 0,
    data: [
      { id: 2119453255852150, assignment: 'FLY', fltNum: '8', type: 'F', crewId: '44117',
        briefStart: '2026-06-15 13:10',
        localStartDateTime: '2026-06-15 19:45', localEndDateTime: '2026-06-15 20:55',
        startDateTime: '2026-06-15 19:45', endDateTime: '2026-06-15 20:55' },
      { id: 2119453255852151, assignment: 'FLY', fltNum: '9', type: 'F', crewId: '44117',
        briefStart: '2026-06-15 13:10',
        localStartDateTime: '2026-06-15 21:25', localEndDateTime: '2026-06-15 22:30',
        startDateTime: '2026-06-15 21:25', endDateTime: '2026-06-15 22:30' },
    ],
  };

  // Real shape from selectCrewRosterReport for crew 44117, June 2026.
  const report = {
    code: 0,
    data: {
      crewRosterReportInfoVoList: [{
        crewRosterReportInfoDetatilVo: [
          { fltOorder: 3, fltNum: 'TG8', dep: 'BKK', arv: 'UTH',
            depTime: '19:45', arvTime: '20:55', depDate: '2026/06/15', arvDate: '2026/06/15' },
          { fltOorder: 4, fltNum: 'TG9', dep: 'UTH', arv: 'BKK',
            depTime: '21:25', arvTime: '22:30', depDate: '2026/06/15', arvDate: '2026/06/15' },
        ],
      }],
    },
  };

  const captures = [
    { source: 'roster' as const, url: '/api/selectPortalCalendar', body: calendar },
    { source: 'net'    as const, url: '/api/selectCrewRosterReport', body: report },
  ];

  it('TG8 resolves BKK→UTH, not DEP/ARR', () => {
    const { trips } = parsePortalCaptures(captures, '44117', 'TG');
    const tg8 = trips.flatMap(t => t.legs).find(l => l.fltNumber === 'TG8');
    expect(tg8).toBeDefined();
    expect(tg8!.depArp).toBe('BKK');
    expect(tg8!.arvArp).toBe('UTH');
  });

  it('TG9 resolves UTH→BKK, not DEP/ARR', () => {
    const { trips } = parsePortalCaptures(captures, '44117', 'TG');
    const tg9 = trips.flatMap(t => t.legs).find(l => l.fltNumber === 'TG9');
    expect(tg9).toBeDefined();
    expect(tg9!.depArp).toBe('UTH');
    expect(tg9!.arvArp).toBe('BKK');
  });

  it('all real-flight legs have non-placeholder IATA airports', () => {
    const { trips } = parsePortalCaptures(captures, '44117', 'TG');
    const legs = trips.flatMap(t => t.legs).filter(l => isRealFlight(l.fltNumber));
    expect(legs.length).toBe(2);
    for (const leg of legs) {
      expect(leg.depArp).not.toBe('DEP');
      expect(leg.arvArp).not.toBe('ARR');
      expect(isRealAirport(leg.depArp)).toBe(true);
      expect(isRealAirport(leg.arvArp)).toBe(true);
    }
  });
});

// ─── 4. Day-suffix flight numbers (TG8Z — delayed flight crosses midnight) ───
// IATA day-suffix convention: TG8 delayed past midnight is renumbered TG8Z so
// ops systems can distinguish it from the next day's TG8. The calendar carries
// fltNum "8Z"; the roster report carries fltNum "TG8" (no suffix). flightKey()
// strips the suffix so both hash to key "8" and the airport lookup succeeds.
describe('airport enrichment — day-suffix flight numbers (TG8Z)', () => {
  const calendar = {
    code: 0,
    data: [
      { id: 1, assignment: 'FLY', fltNum: '8Z', type: 'F', crewId: '44117',
        briefStart: '2026-06-15 13:10',
        localStartDateTime: '2026-06-15 23:50', localEndDateTime: '2026-06-16 01:05',
        startDateTime: '2026-06-15 23:50', endDateTime: '2026-06-16 01:05' },
    ],
  };
  // Report still carries the base number TG8 (no suffix) with the same airports.
  const report = {
    code: 0,
    data: {
      crewRosterReportInfoVoList: [{
        crewRosterReportInfoDetatilVo: [
          { fltOorder: 1, fltNum: 'TG8', dep: 'BKK', arv: 'UTH',
            depTime: '23:50', arvTime: '01:05', depDate: '2026/06/15', arvDate: '2026/06/16' },
        ],
      }],
    },
  };

  const captures = [
    { source: 'roster' as const, url: '/api/selectPortalCalendar', body: calendar },
    { source: 'net'    as const, url: '/api/selectCrewRosterReport', body: report },
  ];

  it('TG8Z (suffix) resolves BKK→UTH using TG8 report entry', () => {
    const { trips } = parsePortalCaptures(captures, '44117', 'TG');
    const tg8z = trips.flatMap(t => t.legs).find(l => l.fltNumber === 'TG8Z');
    expect(tg8z).toBeDefined();
    expect(tg8z!.depArp).toBe('BKK');
    expect(tg8z!.arvArp).toBe('UTH');
    expect(tg8z!.depArp).not.toBe('DEP');
    expect(tg8z!.arvArp).not.toBe('ARR');
  });
});
