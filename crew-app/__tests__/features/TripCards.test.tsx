import React from 'react';
import fs from 'fs';
import path from 'path';
import renderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { store } from '../../src/store';
import { TripCards } from '../../src/features/travel/TripCards';
import {
  parseAndClassify,
} from '../../src/features/travel/tripCsv';
import { parsePortalCaptures } from '../../src/features/travel/portalCapture';
import {
  computeEffectiveAlarms,
  alarmOptions,
  DEFAULT_ALARM_OPTIONS,
} from '../../src/features/settings/alarmSetup';
import { setTimeZoneMode } from '../../src/features/settings/settingsSlice';
import { formatLegTime } from '../../src/features/settings/timeFormat';

// TripCards reads the time-zone display mode from Redux, so renders need a store.
const withStore = (node: React.ReactElement) => (
  <Provider store={store}>{node}</Provider>
);

const CSV_PATH = path.resolve(
  __dirname,
  '..', '..', 'data',
  'Crew Roster Sample.csv',
);
const csv = fs.readFileSync(CSV_PATH, 'utf8');
const NOW = new Date('2026-05-31T00:00:00Z');

function normalizeInternalSortKeys(tree: unknown) {
  const seen = new WeakSet<object>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object' || seen.has(value)) {
      return;
    }
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (key === 'startMs') {
        (value as Record<string, unknown>)[key] = 0;
      } else {
        visit(child);
      }
    }
  };
  visit(tree);
  return tree;
}

describe('TripCards', () => {
  it('renders upcoming trips parsed from the sample CSV', () => {
    const { upcoming } = parseAndClassify(csv, NOW);
    const tree = renderer.create(withStore(<TripCards trips={upcoming} />)).toJSON();
    expect(normalizeInternalSortKeys(tree)).toMatchSnapshot();
  });

  it('renders the FA200/A350 long-haul card from the sample', () => {
    const { upcoming } = parseAndClassify(csv, NOW);
    const json = JSON.stringify(
      renderer.create(withStore(<TripCards trips={upcoming} />)).toJSON(),
      (key, value) => (key === '_context' || key === '_owner' ? undefined : value),
    );
    expect(json).toContain('FA200');
    expect(json).toContain('A350');
    expect(json).toContain('YVR');
    expect(json).toContain('Hyatt Regency');
  });

  // Regression: when alarms are ON, each check-in header must show the Wake Up +
  // Leave Home time chips BEFORE the check-in time. Builds alarmDisplays exactly
  // like MyTripsScreen and asserts the chips both EXIST and are ACCURATE.
  // Helper mirroring MyTripsScreen.alarmDisplays.
  const buildDisplays = (upcoming: ReturnType<typeof parseAndClassify>['upcoming'], wake = 4, leave = 3) => {
    const options = alarmOptions(wake, leave);
    const effective = computeEffectiveAlarms(upcoming, options, {});
    const displays: Record<string, any> = {};
    for (const a of effective) {
      displays[a.dutyId] = {
        wakeHhmm: a.wakeUp?.hhmm ?? null,
        leaveHhmm: a.leaveHome?.hhmm ?? null,
        wakeHours: options.wakeUpHoursBefore,
        leaveHours: options.leaveHomeHoursBefore,
      };
    }
    return { effective, displays };
  };

  it('shows Wake Up + Leave Home time chips when alarms are enabled (existence)', () => {
    const { upcoming } = parseAndClassify(csv, NOW);
    const { effective, displays } = buildDisplays(upcoming);
    expect(effective.length).toBeGreaterThan(0);
    const json = JSON.stringify(
      renderer.create(withStore(<TripCards trips={upcoming} alarmDisplays={displays} alarmsEnabled />)).toJSON(),
      (k, v) => (k === '_context' || k === '_owner' ? undefined : v),
    );
    // One chip pair per duty, each tagged with its testID.
    expect(json).toContain('alarm-chip-wake-');
    expect(json).toContain('alarm-chip-leave-');
  });

  it('renders ACCURATE chip times (FA200: dep 11:00 TPE ⇒ wake 07:00, leave 08:00)', () => {
    const { upcoming } = parseAndClassify(csv, NOW);
    const { effective, displays } = buildDisplays(upcoming, 4, 3);
    const fa200 = effective.find(a => a.fltNumber === 'FA200');
    expect(fa200).toBeDefined();
    // Pure computation: −4h / −3h from the 11:00 Asia/Taipei departure.
    expect(fa200!.timeZone).toBe('Asia/Taipei');
    expect(fa200!.wakeUp?.hhmm).toBe('07:00');
    expect(fa200!.leaveHome?.hhmm).toBe('08:00');
    // And those exact times reach the rendered chips.
    const json = JSON.stringify(
      renderer.create(withStore(<TripCards trips={upcoming} alarmDisplays={displays} alarmsEnabled />)).toJSON(),
      (k, v) => (k === '_context' || k === '_owner' ? undefined : v),
    );
    expect(json).toContain('07:00');
    expect(json).toContain('08:00');
  });

  it('hides the alarm chips when alarms are disabled', () => {
    const { upcoming } = parseAndClassify(csv, NOW);
    const { displays } = buildDisplays(upcoming);
    const json = JSON.stringify(
      renderer.create(
        withStore(<TripCards trips={upcoming} alarmDisplays={displays} alarmsEnabled={false} />),
      ).toJSON(),
      (k, v) => (k === '_context' || k === '_owner' ? undefined : v),
    );
    expect(json).not.toContain('alarm-chip-wake-');
    expect(json).not.toContain('alarm-chip-leave-');
  });
});

// ─── Profile time-zone switch across a tz gap, with a DST arrival ─────────────
// Regression for the +7h base-vs-UTC bug. Uses a REAL June roster duty pulled
// live (2026-06-01): TG960 BKK→ARN (Stockholm). The dep/arv are in DIFFERENT
// zones AND the arrival airport observes DST — exactly the cases naive offset
// math gets wrong:
//   BKK = UTC+7 (no DST).   ARN = UTC+2 in summer (CEST), UTC+1 in winter (CET).
//   dep BKK 00:30 (21 Jun) = 17:30 UTC (20 Jun).
//   arr ARN 07:25 (21 Jun) = 05:25 UTC (CEST, +2).   (an 11h55 flight)
// The portal reports start/end in the crew's Bangkok BASE clock (00:30 / 12:25).
describe('TripCards — Profile mode switch (TG960 BKK→ARN, DST arrival)', () => {
  const calendar = {
    code: 0,
    data: [
      { id: 960, assignment: 'FLY', fltNum: '960', type: 'F', crewId: '35459', briefStart: '2026-06-20 22:30',
        localStartDateTime: '2026-06-21 00:30', localEndDateTime: '2026-06-21 07:25',
        startDateTime: '2026-06-21 00:30', endDateTime: '2026-06-21 12:25' },
    ],
  };
  const report = {
    code: 0,
    data: {
      crewRosterReportInfoVoList: [
        { crewRosterReportInfoDetatilVo: [
          { fltOorder: 1, fltNum: 'TG960', dep: 'BKK', arv: 'ARN', hotelName: '',
            depTime: '00:30', arvTime: '07:25', depDate: '2026/06/21', arvDate: '2026/06/21' },
        ] },
      ],
    },
  };
  const captures = [
    { source: 'roster' as const, url: '/api/rosterFlight/selectPortalCalendar', body: calendar },
    { source: 'net' as const, url: '/api/rosterFlight/selectCrewRosterReport', body: report },
  ];
  const { trips } = parsePortalCaptures(captures, '35459', 'TG');

  const renderJson = () =>
    JSON.stringify(
      renderer.create(withStore(<TripCards trips={trips} />)).toJSON(),
      (key, value) => (key === '_context' || key === '_owner' ? undefined : value),
    );

  afterAll(async () => {
    // The store is a shared singleton — restore the default for any later test.
    await store.dispatch(setTimeZoneMode('airport') as any);
  });

  it('captures TG960 with TRUE-UTC instants (not the Bangkok base time)', () => {
    const leg = trips[0].legs[0];
    expect(leg).toMatchObject({ fltNumber: 'TG960', depArp: 'BKK', arvArp: 'ARN' });
    expect(leg.flightDateUTC).toBe('20 Jun 2026 1730'); // 00:30 BKK base − 7h
    expect(leg.arvDateUTC).toBe('21 Jun 2026 0525'); // 12:25 base − 7h (= 07:25 ARN − 2h CEST)
  });

  it('switching the Profile mode re-renders the card in each zone', async () => {
    await store.dispatch(setTimeZoneMode('airport') as any);
    let j = renderJson();
    expect(j).toContain('21 Jun 00:30'); // BKK local dep
    expect(j).toContain('21 Jun 07:25'); // ARN local arr

    await store.dispatch(setTimeZoneMode('utc') as any);
    j = renderJson();
    expect(j).toContain('20 Jun 17:30'); // dep UTC
    expect(j).toContain('21 Jun 05:25'); // arr UTC
    expect(j).not.toContain('21 Jun 00:30'); // the old base-as-UTC bug would show this

    await store.dispatch(setTimeZoneMode('base') as any);
    j = renderJson();
    expect(j).toContain('21 Jun 00:30'); // dep in Bangkok base
    expect(j).toContain('21 Jun 12:25'); // arr in Bangkok base
  });

  it('arrival conversion is DST-aware (ARN +2h in summer, +1h in winter)', () => {
    const leg = trips[0].legs[0];
    // Summer (June): 05:25 UTC → Stockholm 07:25 (CEST, UTC+2) — equals the
    // airport-local field, proving the conversion picked up DST, not a flat +1.
    expect(
      formatLegTime({ flightDateUTC: leg.arvDateUTC, mode: 'base', baseTz: 'Europe/Stockholm' }),
    ).toBe('21 Jun 07:25');
    // Winter control: the same 05:25 UTC wall time in January → Stockholm 06:25
    // (CET, UTC+1). A non-DST-aware formatter would print 06:25 for June too.
    expect(
      formatLegTime({ flightDateUTC: '15 Jan 2026 0525', mode: 'base', baseTz: 'Europe/Stockholm' }),
    ).toBe('15 Jan 06:25');
  });
});
