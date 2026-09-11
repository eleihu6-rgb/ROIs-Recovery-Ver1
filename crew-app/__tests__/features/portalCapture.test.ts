import { parsePortalCaptures, toRosterDateString } from '../../src/features/travel/portalCapture';
import { classifyTrips } from '../../src/features/travel/tripCsv';
import { isRealAirport } from '../../src/features/travel/airports';
import { formatLegTime } from '../../src/features/settings/timeFormat';

describe('toRosterDateString', () => {
  it('passes through the roster format unchanged', () => {
    expect(toRosterDateString('03 Jun 2026 0900')).toBe('03 Jun 2026 0900');
  });
  it('converts ISO 8601 to roster format (UTC)', () => {
    expect(toRosterDateString('2026-06-03T09:05:00Z')).toBe('03 Jun 2026 0905');
  });
  it('converts a date-only string', () => {
    expect(toRosterDateString('2026-06-03')).toBe('03 Jun 2026 0000');
  });
  it('converts epoch millis', () => {
    // 2026-06-03T09:00:00Z
    const ms = Date.UTC(2026, 5, 3, 9, 0);
    expect(toRosterDateString(ms)).toBe('03 Jun 2026 0900');
  });
  it('returns empty for junk', () => {
    expect(toRosterDateString('not a date')).toBe('');
    expect(toRosterDateString(undefined)).toBe('');
  });
});

describe('parsePortalCaptures', () => {
  // A ROIS-style roster API response: a nested object with a flights array using
  // varied field names — exercises the fuzzy key matching + grouping.
  const rosterResponse = {
    code: 0,
    data: {
      rosterList: [
        {
          crewId: '35459',
          flightNo: 'TG202',
          depAirport: 'TPE',
          arrAirport: 'BKK',
          std: '2026-05-10T01:00:00Z',
          sta: '2026-05-10T04:30:00Z',
          acType: '350',
          checkIn: '2026-05-09T23:00:00Z',
          hotel: '',
        },
        {
          crewId: '35459',
          flightNo: 'TG203',
          depAirport: 'BKK',
          arrAirport: 'TPE',
          std: '2026-05-12T06:00:00Z',
          sta: '2026-05-12T11:00:00Z',
          acType: '350',
          checkIn: '',
          hotel: 'Grand Hyatt',
        },
      ],
    },
  };

  it('extracts flight legs from a nested portal payload', () => {
    const { trips, legCount } = parsePortalCaptures([
      { source: 'roster', url: '/tg/portal/api/roster', body: rosterResponse },
    ]);
    expect(legCount).toBe(2);
    // Both legs share a check-in chain → one trip with two legs.
    expect(trips).toHaveLength(1);
    const t = trips[0];
    expect(t.legs.map(l => l.fltNumber)).toEqual(['TG202', 'TG203']);
    expect(t.legs[0]).toMatchObject({
      depArp: 'TPE',
      arvArp: 'BKK',
      flightDateUTC: '10 May 2026 0100',
      fleet: '350',
    });
  });

  it('normalises spaced/lowercase flight numbers', () => {
    const { legCount, trips } = parsePortalCaptures([
      {
        source: 'roster',
        url: '/api/roster',
        body: { list: [{ fltNumber: 'tg 0202', dep: 'TPE', arv: 'HKG', flightDate: '2026-05-10T01:00:00Z' }] },
      },
    ]);
    expect(legCount).toBe(1);
    expect(trips[0].legs[0].fltNumber).toBe('TG0202');
  });

  it('ignores payloads with no flight-like records', () => {
    const { trips, legCount } = parsePortalCaptures([
      { source: 'net', url: '/api/user', body: { name: 'Demo', menu: ['home', 'settings'] } },
    ]);
    expect(legCount).toBe(0);
    expect(trips).toHaveLength(0);
  });

  it('de-dupes identical legs captured more than once', () => {
    const leg = { flightNo: 'TG202', depAirport: 'TPE', arrAirport: 'BKK', std: '2026-05-10T01:00:00Z' };
    const { legCount } = parsePortalCaptures([
      { source: 'roster', url: '/api/roster', body: { list: [leg] } },
      { source: 'roster', url: '/api/roster', body: { list: [leg] } },
    ]);
    expect(legCount).toBe(1);
  });
});

describe('parsePortalCaptures — ROIS Cloud (THAI) selectPortalCalendar', () => {
  // Real schema captured from crew-sea-test.roiscloud.com (doc/App Flow Ver1).
  const calendarResponse = {
    requestId: '2121385058923777',
    code: 0,
    message: null,
    data: [
      {
        id: 2106405267017729,
        assignment: 'FLY',
        fltNum: '925',
        type: 'F',
        isVolunter: null,
        localStartDateTime: '2026-04-30 14:25',
        localEndDateTime: '2026-05-01 05:23',
        startDateTime: '2026-04-30 19:25',
        endDateTime: '2026-05-01 05:23',
        crewId: '35459',
        briefStart: '2026-04-30 18:25',
        deBriefEnd: '2026-05-01 05:53',
      },
      {
        id: 2110937224445952,
        assignment: 'FLY',
        fltNum: '319',
        type: 'F',
        localStartDateTime: '2026-05-02 10:11',
        localEndDateTime: '2026-05-02 12:40',
        startDateTime: '2026-05-02 10:11',
        endDateTime: '2026-05-02 13:55',
        crewId: '35459',
        briefStart: '2026-05-02 08:30',
      },
      {
        id: 2110937224445953,
        assignment: 'FLY',
        fltNum: '320',
        type: 'F',
        // TG320 is HKG→BKK. startDateTime is BASE (Bangkok) time: HKG (UTC+8) is
        // 1h ahead of BKK (UTC+7), so local dep 13:47 HKG = 12:47 Bangkok base.
        localStartDateTime: '2026-05-02 13:47',
        localEndDateTime: '2026-05-02 18:12',
        startDateTime: '2026-05-02 12:47',
        endDateTime: '2026-05-02 18:12',
        crewId: '35459',
        briefStart: '2026-05-02 08:30',
      },
      // Non-flight duties must be ignored.
      { id: 1, assignment: 'MEETING', type: 'M', localStartDateTime: '2026-05-04 09:00', startDateTime: '2026-05-04 09:00', crewId: '35459' },
      { id: 2, assignment: 'OFF', type: 'O', localStartDateTime: '2026-05-03 00:00', startDateTime: '2026-05-03 00:00', crewId: '35459' },
    ],
  };

  const captures = [
    {
      source: 'roster' as const,
      url: '/tg/apiPortal/api/rosterFlight/selectPortalCalendar?crewId=35459&type=rp',
      body: calendarResponse,
    },
  ];

  it('keeps only FLY duties and prefixes the carrier', () => {
    const { trips, legCount } = parsePortalCaptures(captures, '35459', 'TG');
    expect(legCount).toBe(3); // 925, 319, 320 — MEETING/OFF excluded
    const allFlights = trips.flatMap(t => t.legs.map(l => l.fltNumber));
    expect(allFlights).toEqual(['TG925', 'TG319', 'TG320']);
  });

  it('groups flights sharing a check-in (briefStart) into one trip', () => {
    const { trips } = parsePortalCaptures(captures, '35459', 'TG');
    // 925 has its own briefStart; 319+320 share 2026-05-02 08:30 → one trip.
    expect(trips).toHaveLength(2);
    expect(trips[1].legs.map(l => l.fltNumber)).toEqual(['TG319', 'TG320']);
  });

  it('enriches dep/arv airports + fleet from a separate roster-detail payload', () => {
    // The calendar has no airports; a second payload (different field names) does.
    const detail = {
      code: 0,
      data: [
        { flightNo: 'TG319', depStn: 'BKK', arrStn: 'HKG', acType: '33C' },
        { flightNo: 'TG320', depStn: 'HKG', arrStn: 'BKK', acType: '33C' },
      ],
    };
    const { trips } = parsePortalCaptures(
      [
        captures[0],
        { source: 'net', url: '/tg/apiPortal/api/rosterFlight/selectByCrew', body: detail },
      ],
      '35459',
      'TG',
    );
    const tg319 = trips.flatMap(t => t.legs).find(l => l.fltNumber === 'TG319')!;
    expect(tg319.depArp).toBe('BKK');
    expect(tg319.arvArp).toBe('HKG');
    expect(tg319.fleet).toBe('33C');
  });

  it('carries airport-local times and a TRUE-UTC flight date (base − 7h)', () => {
    const { trips } = parsePortalCaptures(captures, '35459', 'TG');
    const tg320 = trips.flatMap(t => t.legs).find(l => l.fltNumber === 'TG320')!;
    expect(tg320.localDepTime).toBe('2026-05-02 13:47'); // airport (HKG) local
    // startDateTime 12:47 is Bangkok BASE time → true UTC is 12:47 − 7h = 05:47.
    // (cross-check: HKG local 13:47 − 8h tz = 05:47 UTC — same instant.)
    expect(tg320.flightDateUTC).toBe('02 May 2026 0547');
    expect(tg320.assignment).toBe('FLY');
  });
});

describe('parsePortalCaptures — real airports after enrichment (no DEP/ARR placeholders)', () => {
  // A realistic THAI roster: the selectPortalCalendar payload carries NO airport
  // codes; a separate roster-detail payload supplies them. Every captured leg must
  // resolve to a REAL airport (validated against the IATA reference), so the UI
  // never falls back to the 'DEP'/'ARR' placeholder.
  const calendar = {
    code: 0,
    data: [
      // BKK → HKG → BKK day trip (share a check-in).
      { id: 11, assignment: 'FLY', fltNum: '600', type: 'F', crewId: '35459', briefStart: '2026-06-10 06:30',
        localStartDateTime: '2026-06-10 08:00', localEndDateTime: '2026-06-10 11:50',
        startDateTime: '2026-06-10 01:00', endDateTime: '2026-06-10 03:50' },
      { id: 12, assignment: 'FLY', fltNum: '601', type: 'F', crewId: '35459', briefStart: '2026-06-10 06:30',
        localStartDateTime: '2026-06-10 13:10', localEndDateTime: '2026-06-10 15:05',
        startDateTime: '2026-06-10 05:10', endDateTime: '2026-06-10 08:05' },
      // BKK → LHR long-haul with a layover (own check-in).
      { id: 13, assignment: 'FLY', fltNum: '910', type: 'F', crewId: '35459', briefStart: '2026-06-14 22:00',
        localStartDateTime: '2026-06-14 23:45', localEndDateTime: '2026-06-15 06:05',
        startDateTime: '2026-06-14 16:45', endDateTime: '2026-06-15 05:05' },
      // A non-flight duty that must be ignored entirely.
      { id: 14, assignment: 'OFF', type: 'O', crewId: '35459',
        localStartDateTime: '2026-06-12 00:00', startDateTime: '2026-06-12 00:00' },
    ],
  };
  // Roster-detail panel (different field names) — the real airports + fleet.
  const detail = {
    code: 0,
    data: [
      { flightNo: 'TG600', depStn: 'BKK', arrStn: 'HKG', acType: '359' },
      { flightNo: 'TG601', depStn: 'HKG', arrStn: 'BKK', acType: '359' },
      { flightNo: 'TG910', depStn: 'BKK', arrStn: 'LHR', acType: '77W', hotel: 'Sofitel London Heathrow' },
    ],
  };

  const captures = [
    { source: 'roster' as const, url: '/tg/apiPortal/api/rosterFlight/selectPortalCalendar?crewId=35459', body: calendar },
    { source: 'net' as const, url: '/tg/apiPortal/api/rosterFlight/selectByCrew', body: detail },
  ];

  it('fills every flight leg with a real dep AND arv airport', () => {
    const { trips, legCount } = parsePortalCaptures(captures, '35459', 'TG');
    expect(legCount).toBe(3); // OFF excluded

    const legs = trips.flatMap(t => t.legs);
    expect(legs).toHaveLength(3);

    for (const leg of legs) {
      // Non-empty, never the placeholder, and a recognised real airport.
      expect(leg.depArp).not.toBe('');
      expect(leg.arvArp).not.toBe('');
      expect(leg.depArp).not.toBe('DEP');
      expect(leg.arvArp).not.toBe('ARR');
      expect(isRealAirport(leg.depArp)).toBe(true);
      expect(isRealAirport(leg.arvArp)).toBe(true);
    }
  });

  it('maps each flight to its correct real route + fleet', () => {
    const { trips } = parsePortalCaptures(captures, '35459', 'TG');
    const byNum = Object.fromEntries(trips.flatMap(t => t.legs).map(l => [l.fltNumber, l]));
    expect(byNum.TG600).toMatchObject({ depArp: 'BKK', arvArp: 'HKG', fleet: '359' });
    expect(byNum.TG601).toMatchObject({ depArp: 'HKG', arvArp: 'BKK', fleet: '359' });
    expect(byNum.TG910).toMatchObject({ depArp: 'BKK', arvArp: 'LHR', fleet: '77W' });
  });
});

describe('parsePortalCaptures — enriches dep/arv from the REAL selectCrewRosterReport payload', () => {
  // The calendar payload (no airports) + the roster-report payload (real airports,
  // nested exactly as the live portal returns it). This is the dep/arv regression
  // guard: trip cards must show BKK→KTM, never the DEP/ARR placeholder.
  const calendar = {
    code: 0,
    data: [
      { id: 1, assignment: 'FLY', fltNum: '319', type: 'F', crewId: '35459', briefStart: '2026-05-02 08:30',
        localStartDateTime: '2026-05-02 10:11', localEndDateTime: '2026-05-02 12:40',
        startDateTime: '2026-05-02 03:11', endDateTime: '2026-05-02 05:40' },
      { id: 2, assignment: 'FLY', fltNum: '320', type: 'F', crewId: '35459', briefStart: '2026-05-02 08:30',
        localStartDateTime: '2026-05-02 13:47', localEndDateTime: '2026-05-02 18:12',
        startDateTime: '2026-05-02 08:02', endDateTime: '2026-05-02 11:12' },
    ],
  };
  // Real shape: data.crewRosterReportInfoVoList[].crewRosterReportInfoDetatilVo[].
  const report = {
    code: 0,
    data: {
      crewId: '35459', crewName: 'TEST', rank: 'FA', base: 'BKK',
      crewRosterReportInfoVoList: [
        {
          crewRosterReportInfoDetatilVo: [
            { fltOorder: 1, fltNum: 'TG319', dep: 'BKK', arv: 'KTM', hotelName: '', depTime: '10:11', arvTime: '12:40', depDate: '2026/05/02', arvDate: '2026/05/02' },
            { fltOorder: 2, fltNum: 'TG320', dep: 'KTM', arv: 'BKK', hotelName: 'Hyatt Regency Kathmandu', depTime: '13:47', arvTime: '18:12', depDate: '2026/05/02', arvDate: '2026/05/02' },
          ],
        },
      ],
    },
  };

  const captures = [
    { source: 'roster' as const, url: '/tg/apiPortal/api/rosterFlight/selectPortalCalendar?crewId=35459', body: calendar },
    { source: 'net' as const, url: '/tg/apiPortal/api/rosterFlight/selectCrewRosterReport?crewId=35459', body: report },
  ];

  it('fills BKK/KTM from the report — no DEP/ARR placeholder', () => {
    const { trips } = parsePortalCaptures(captures, '35459', 'TG');
    const byNum = Object.fromEntries(trips.flatMap(t => t.legs).map(l => [l.fltNumber, l]));
    expect(byNum.TG319).toMatchObject({ depArp: 'BKK', arvArp: 'KTM' });
    expect(byNum.TG320).toMatchObject({ depArp: 'KTM', arvArp: 'BKK' });
    expect(isRealAirport(byNum.TG319.depArp)).toBe(true);
    expect(isRealAirport(byNum.TG319.arvArp)).toBe(true);
    // Layover hotel from the report carries through too.
    expect(byNum.TG320.hotel).toBe('Hyatt Regency Kathmandu');
  });
});

describe('parsePortalCaptures — three-month capture ([-1,0,1]) de-dupes overlaps', () => {
  // Each month range is captured as its own selectPortalCalendar payload. Adjacent
  // ranges can re-report the same boundary duty; de-dupe must keep one of each
  // (enhance-Ver3 #16).
  const dutyApr = { id: 900, assignment: 'FLY', fltNum: '500', type: 'F', crewId: '35459', briefStart: '2026-04-28 06:00',
    localStartDateTime: '2026-04-28 08:00', localEndDateTime: '2026-04-28 11:00', startDateTime: '2026-04-28 01:00', endDateTime: '2026-04-28 04:00' };
  const dutyMay = { id: 901, assignment: 'FLY', fltNum: '600', type: 'F', crewId: '35459', briefStart: '2026-05-15 06:00',
    localStartDateTime: '2026-05-15 08:00', localEndDateTime: '2026-05-15 11:00', startDateTime: '2026-05-15 01:00', endDateTime: '2026-05-15 04:00' };
  const dutyJun = { id: 902, assignment: 'FLY', fltNum: '700', type: 'F', crewId: '35459', briefStart: '2026-06-10 06:00',
    localStartDateTime: '2026-06-10 08:00', localEndDateTime: '2026-06-10 11:00', startDateTime: '2026-06-10 01:00', endDateTime: '2026-06-10 04:00' };

  const captures = [
    // previous month (Apr) — also re-reports the May boundary duty
    { source: 'roster' as const, url: '/tg/apiPortal/api/rosterFlight/selectPortalCalendar?startDateTime=2026-04-01', body: { code: 0, data: [dutyApr, dutyMay] } },
    // current month (May) — re-reports May again, and the Jun boundary duty
    { source: 'roster' as const, url: '/tg/apiPortal/api/rosterFlight/selectPortalCalendar?startDateTime=2026-05-01', body: { code: 0, data: [dutyMay, dutyJun] } },
    // next month (Jun)
    { source: 'roster' as const, url: '/tg/apiPortal/api/rosterFlight/selectPortalCalendar?startDateTime=2026-06-01', body: { code: 0, data: [dutyJun] } },
  ];

  it('keeps exactly one trip per unique duty despite overlapping month ranges', () => {
    const { trips, legCount, duties } = parsePortalCaptures(captures, '35459', 'TG');
    expect(legCount).toBe(3); // 500, 600, 700 — no duplicates
    const flights = trips.flatMap(t => t.legs.map(l => l.fltNumber)).sort();
    expect(flights).toEqual(['TG500', 'TG600', 'TG700']);
    expect(trips).toHaveLength(3);
    // Full duty list is likewise de-duped.
    expect(duties).toHaveLength(3);
  });
});

describe('TG622 BKK→KIX — correct times in airport / UTC / base modes (the display bug)', () => {
  // Ground truth (Apple flight lookup): TG622 departs Bangkok 23:59 (Tue 2 Jun)
  // and arrives Osaka KIX 07:30 (Wed 3 Jun); a 5h 31m flight.
  //   BKK = UTC+7, KIX = UTC+9 (no DST).
  //   dep: 23:59 BKK = 16:59 UTC.   arr: 07:30 KIX = 22:30 UTC.   (22:30−16:59 = 5h31m)
  // The ROIS calendar reports start/end in the crew's BASE (Bangkok) wall clock:
  //   startDateTime = 23:59 (BKK base == airport local for a BKK departure)
  //   endDateTime   = 05:30 (07:30 KIX expressed in Bangkok base time, KIX is +2h)
  // and the airport-local fields in each airport's own clock.
  const calendar = {
    code: 0,
    data: [
      { id: 622, assignment: 'FLY', fltNum: '622', type: 'F', crewId: '35459', briefStart: '2026-06-02 21:59',
        localStartDateTime: '2026-06-02 23:59', localEndDateTime: '2026-06-03 07:30',
        startDateTime: '2026-06-02 23:59', endDateTime: '2026-06-03 05:30' },
    ],
  };
  const report = {
    code: 0,
    data: {
      crewRosterReportInfoVoList: [
        { crewRosterReportInfoDetatilVo: [
          { fltOorder: 1, fltNum: 'TG622', dep: 'BKK', arv: 'KIX', hotelName: '',
            depTime: '23:59', arvTime: '07:30', depDate: '2026/06/02', arvDate: '2026/06/03' },
        ] },
      ],
    },
  };
  const captures = [
    { source: 'roster' as const, url: '/api/rosterFlight/selectPortalCalendar', body: calendar },
    { source: 'net' as const, url: '/api/rosterFlight/selectCrewRosterReport', body: report },
  ];

  const leg = () => parsePortalCaptures(captures, '35459', 'TG').trips[0].legs[0];

  it('captures real airports and TRUE-UTC instants (not the base time)', () => {
    const l = leg();
    expect(l).toMatchObject({ fltNumber: 'TG622', depArp: 'BKK', arvArp: 'KIX' });
    expect(l.localDepTime).toBe('2026-06-02 23:59'); // BKK local
    expect(l.localArvTime).toBe('2026-06-03 07:30'); // KIX local
    expect(l.flightDateUTC).toBe('02 Jun 2026 1659'); // 23:59 BKK − 7h
    expect(l.arvDateUTC).toBe('02 Jun 2026 2230'); // 05:30 base − 7h (= 07:30 KIX − 9h)
  });

  const baseTz = 'Asia/Bangkok';
  it('AIRPORT mode shows each airport its own local time', () => {
    const l = leg();
    expect(formatLegTime({ flightDateUTC: l.flightDateUTC, localTime: l.localDepTime, mode: 'airport', baseTz })).toBe('02 Jun 23:59');
    expect(formatLegTime({ flightDateUTC: l.arvDateUTC, localTime: l.localArvTime, mode: 'airport', baseTz })).toBe('03 Jun 07:30');
  });
  it('UTC mode shows the true UTC instants', () => {
    const l = leg();
    expect(formatLegTime({ flightDateUTC: l.flightDateUTC, localTime: l.localDepTime, mode: 'utc', baseTz })).toBe('02 Jun 16:59');
    expect(formatLegTime({ flightDateUTC: l.arvDateUTC, localTime: l.localArvTime, mode: 'utc', baseTz })).toBe('02 Jun 22:30');
  });
  it('BASE (Bangkok) mode shows both times in Bangkok', () => {
    const l = leg();
    expect(formatLegTime({ flightDateUTC: l.flightDateUTC, localTime: l.localDepTime, mode: 'base', baseTz })).toBe('02 Jun 23:59');
    expect(formatLegTime({ flightDateUTC: l.arvDateUTC, localTime: l.localArvTime, mode: 'base', baseTz })).toBe('03 Jun 05:30');
  });
});

describe('portal duties → classifyTrips (a crew with BOTH past and upcoming duties)', () => {
  // One duty in the past (20 May) and one upcoming (03 Jun), relative to 31 May 2026.
  const mixed = {
    code: 0,
    data: [
      { assignment: 'FLY', fltNum: '110', type: 'F', crewId: '35459', briefStart: '2026-05-20 06:00',
        localStartDateTime: '2026-05-20 08:00', localEndDateTime: '2026-05-20 11:30',
        startDateTime: '2026-05-20 01:00', endDateTime: '2026-05-20 04:30' },
      { assignment: 'FLY', fltNum: '319', type: 'F', crewId: '35459', briefStart: '2026-06-03 08:30',
        localStartDateTime: '2026-06-03 10:11', localEndDateTime: '2026-06-03 12:40',
        startDateTime: '2026-06-03 03:11', endDateTime: '2026-06-03 06:55' },
    ],
  };

  it('classifies the past duty into Past and the future duty into Upcoming', () => {
    const { trips } = parsePortalCaptures(
      [{ source: 'roster', url: '/tg/apiPortal/api/rosterFlight/selectPortalCalendar', body: mixed }],
      '35459',
      'TG',
    );
    expect(trips).toHaveLength(2);
    const { upcoming, past } = classifyTrips(trips, new Date('2026-05-31T00:00:00Z'));
    expect(past).toHaveLength(1);
    expect(upcoming).toHaveLength(1);
    expect(past[0].legs[0].fltNumber).toBe('TG110');
    expect(upcoming[0].legs[0].fltNumber).toBe('TG319');
  });
});

// ─── Round-trip grouping: one rotation = one trip (outbound then inbound) ──────
// Regression for crew 35459's past trips looking "conflicting": an out-and-back
// like BKK→SIN (24 May, brief 17:25) then SIN→BKK (25 May, brief 06:00) has a
// DIFFERENT briefStart per leg, so the old grouping split it into two cards —
// and the past-descending sort then put the RETURN leg above its own outbound.
// A trip is now one rotation: it starts at base (BKK) and ends on return to
// base, so the two legs live on one card in flight order, and the card sorts by
// its outbound date. Sims/training with unknown airports stay separate.
describe('parsePortalCaptures — out-and-back legs group into one rotation', () => {
  const calendar = {
    code: 0,
    data: [
      // Earlier same-day CGK turnaround (22 May) — a separate, older trip.
      { assignment: 'FLY', fltNum: '433', type: 'F', crewId: '35459', briefStart: '2026-05-22 06:15',
        localStartDateTime: '2026-05-22 08:30', localEndDateTime: '2026-05-22 11:59',
        startDateTime: '2026-05-22 08:30', endDateTime: '2026-05-22 11:59' },
      { assignment: 'FLY', fltNum: '434', type: 'F', crewId: '35459', briefStart: '2026-05-22 06:15',
        localStartDateTime: '2026-05-22 12:55', localEndDateTime: '2026-05-22 16:13',
        startDateTime: '2026-05-22 12:55', endDateTime: '2026-05-22 16:13' },
      // Overnight SIN turnaround — outbound 24 May, inbound 25 May, DIFFERENT briefs.
      { assignment: 'FLY', fltNum: '401', type: 'F', crewId: '35459', briefStart: '2026-05-24 17:25',
        localStartDateTime: '2026-05-24 19:10', localEndDateTime: '2026-05-24 22:41',
        startDateTime: '2026-05-24 19:10', endDateTime: '2026-05-24 21:41' },
      { assignment: 'FLY', fltNum: '402', type: 'F', crewId: '35459', briefStart: '2026-05-25 06:00',
        localStartDateTime: '2026-05-25 08:18', localEndDateTime: '2026-05-25 09:39',
        startDateTime: '2026-05-25 07:18', endDateTime: '2026-05-25 09:39' },
      // Two sim sessions on different days (unknown airports, different briefs) —
      // must NOT merge: airports can't chain them, so briefStart is the boundary.
      { assignment: 'FLY', fltNum: 'HOSIM:A33', type: 'F', crewId: '35459', briefStart: '2026-05-20 12:15',
        localStartDateTime: '2026-05-20 13:15', localEndDateTime: '2026-05-20 15:15',
        startDateTime: '2026-05-20 13:15', endDateTime: '2026-05-20 15:15' },
      { assignment: 'FLY', fltNum: 'HOSIM:A33', type: 'F', crewId: '35459', briefStart: '2026-05-21 12:15',
        localStartDateTime: '2026-05-21 13:15', localEndDateTime: '2026-05-21 15:15',
        startDateTime: '2026-05-21 13:15', endDateTime: '2026-05-21 15:15' },
    ],
  };
  const report = {
    code: 0,
    data: { crewRosterReportInfoVoList: [ { crewRosterReportInfoDetatilVo: [
      { fltOorder: 1, fltNum: 'TG433', dep: 'BKK', arv: 'CGK', depTime: '08:30', arvTime: '11:59', depDate: '2026/05/22', arvDate: '2026/05/22' },
      { fltOorder: 2, fltNum: 'TG434', dep: 'CGK', arv: 'BKK', depTime: '12:55', arvTime: '16:13', depDate: '2026/05/22', arvDate: '2026/05/22' },
      { fltOorder: 3, fltNum: 'TG401', dep: 'BKK', arv: 'SIN', depTime: '19:10', arvTime: '22:41', depDate: '2026/05/24', arvDate: '2026/05/24' },
      { fltOorder: 4, fltNum: 'TG402', dep: 'SIN', arv: 'BKK', depTime: '08:18', arvTime: '09:39', depDate: '2026/05/25', arvDate: '2026/05/25' },
    ] } ] },
  };
  const captures = [
    { source: 'roster' as const, url: '/api/rosterFlight/selectPortalCalendar', body: calendar },
    { source: 'net' as const, url: '/api/rosterFlight/selectCrewRosterReport', body: report },
  ];

  it('merges BKK→SIN→BKK into one trip with the outbound leg first', () => {
    const { trips } = parsePortalCaptures(captures, '35459', 'TG');
    const sin = trips.find(t => t.legs.some(l => l.fltNumber === 'TG401'))!;
    expect(sin.legs.map(l => l.fltNumber)).toEqual(['TG401', 'TG402']);
    expect(sin.legs[0]).toMatchObject({ depArp: 'BKK', arvArp: 'SIN' }); // outbound first
    expect(sin.legs[1]).toMatchObject({ depArp: 'SIN', arvArp: 'BKK' }); // inbound second
  });

  it('keeps the two same-day sim sessions as separate trips', () => {
    const { trips } = parsePortalCaptures(captures, '35459', 'TG');
    const sims = trips.filter(t => t.legs.some(l => l.fltNumber.includes('HOSIM')));
    expect(sims).toHaveLength(2);
  });

  it('lists past trips newest-first, each with outbound-before-inbound legs', () => {
    const { trips } = parsePortalCaptures(captures, '35459', 'TG');
    const { past } = classifyTrips(trips, new Date('2026-05-31T00:00:00Z'));
    // Newest rotation (the 24–25 May SIN turnaround) sorts to the top...
    expect(past[0].legs.map(l => l.fltNumber)).toEqual(['TG401', 'TG402']);
    // ...above the earlier 22 May CGK turnaround.
    const cgk = past.find(t => t.legs.some(l => l.fltNumber === 'TG433'))!;
    expect(past.indexOf(cgk)).toBeGreaterThan(0);
    expect(cgk.legs.map(l => l.fltNumber)).toEqual(['TG433', 'TG434']);
  });
});

describe('airport enrichment — month-boundary bleed (TG925 DEP/ARR bug)', () => {
  // Root cause: when the user captures in June, the app fetches [-1,0,+1] = May/Jun/Jul
  // roster reports. The May CALENDAR includes the Apr 30 TG925 (month boundary bleed),
  // but the May ROSTER REPORT covers only May dates — so TG925 has no entry there.
  // The airport index must therefore be keyed by flightNum+depDate so the Apr report's
  // TG925 entry (depDate 2026/04/30) is kept separate and still matched at lookup time.
  //
  // Scenario: captures include the May calendar (has Apr 30 TG925) + the May report
  // (no TG925) + the April report (has TG925 MUC→BKK with depDate 2026/04/30).
  const mayCalendar = {
    code: 0,
    data: [
      // Apr 30 flight that bleeds into the May calendar window.
      { id: 2106405267017729, assignment: 'FLY', fltNum: '925', type: 'F', crewId: '35459',
        briefStart: '2026-04-30 18:25',
        localStartDateTime: '2026-04-30 14:25', localEndDateTime: '2026-05-01 05:23',
        startDateTime: '2026-04-30 19:25',  // BASE (Bangkok) time, UTC+7
        endDateTime: '2026-05-01 05:23' },
      // A real May flight to confirm May-only flights still resolve correctly.
      { id: 999, assignment: 'FLY', fltNum: '319', type: 'F', crewId: '35459',
        briefStart: '2026-05-02 08:30',
        localStartDateTime: '2026-05-02 10:11', localEndDateTime: '2026-05-02 12:40',
        startDateTime: '2026-05-02 03:11', endDateTime: '2026-05-02 05:40' },
    ],
  };

  // May roster report: has TG319 but NOT TG925 (Apr 30 is outside May's report range).
  const mayReport = {
    code: 0,
    data: {
      crewRosterReportInfoVoList: [
        { crewRosterReportInfoDetatilVo: [
          { fltOorder: 1, fltNum: 'TG319', dep: 'BKK', arv: 'KTM',
            depTime: '10:11', arvTime: '12:40', depDate: '2026/05/02', arvDate: '2026/05/02' },
        ] },
      ],
    },
  };

  // April roster report: has TG925 MUC→BKK with depDate 2026/04/30.
  const aprReport = {
    code: 0,
    data: {
      crewRosterReportInfoVoList: [
        { crewRosterReportInfoDetatilVo: [
          { fltOorder: 1, fltNum: 'TG925', dep: 'MUC', arv: 'BKK',
            depTime: '14:25', arvTime: '05:23', depDate: '2026/04/30', arvDate: '2026/05/01' },
        ] },
      ],
    },
  };

  const captures = [
    { source: 'roster' as const, url: '/api/selectPortalCalendar?startDateTime=2026-05-01', body: mayCalendar },
    { source: 'net'    as const, url: '/api/selectCrewRosterReport?startDateTime=2026-05-01', body: mayReport },
    { source: 'net'    as const, url: '/api/selectCrewRosterReport?startDateTime=2026-04-01', body: aprReport },
  ];

  it('resolves TG925 MUC→BKK from the April report, not DEP/ARR', () => {
    const { trips } = parsePortalCaptures(captures, '35459', 'TG');
    const tg925 = trips.flatMap(t => t.legs).find(l => l.fltNumber === 'TG925');
    expect(tg925).toBeDefined();
    expect(tg925!.depArp).toBe('MUC');
    expect(tg925!.arvArp).toBe('BKK');
    expect(tg925!.depArp).not.toBe('DEP');
    expect(tg925!.arvArp).not.toBe('ARR');
  });

  it('also correctly resolves the May-only TG319 BKK→KTM', () => {
    const { trips } = parsePortalCaptures(captures, '35459', 'TG');
    const tg319 = trips.flatMap(t => t.legs).find(l => l.fltNumber === 'TG319');
    expect(tg319).toBeDefined();
    expect(tg319!.depArp).toBe('BKK');
    expect(tg319!.arvArp).toBe('KTM');
  });
});
