import fs from 'fs';
import path from 'path';
import {
  parseRosterCsv,
  groupIntoTrips,
  classifyTrips,
  parseTripDate,
  parseAndClassify,
} from '../../src/features/travel/tripCsv';
import type { Trip } from '../../src/features/travel/tripCsv';

// The real sample referenced by doc/Add Trip Ver1.
const CSV_PATH = path.resolve(
  __dirname,
  '..', '..', 'data',
  'Crew Roster Sample.csv',
);
const csv = fs.readFileSync(CSV_PATH, 'utf8');

// Fixed "now" matching the app's current date for deterministic classification.
const NOW = new Date('2026-05-31T00:00:00Z');

describe('parseTripDate', () => {
  // The roster columns are named "… UTC" and every producer hands over UTC wall
  // clock, so the parse must be UTC — date-fns' default `parse` reads the string in
  // the DEVICE timezone, which used to shift the past/upcoming boundary by the
  // phone's offset (a duty that ended 15:00Z still counted as upcoming at 21:50Z on
  // a Vancouver phone, so it kept its wake-up / leave-home markers).
  it('parses the roster datetime format as UTC, not device-local', () => {
    const d = parseTripDate('03 Jun 2026 0300');
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2026-06-03T03:00:00.000Z');
    // Cross-check in UTC components so a machine east of UTC can't fake this.
    expect(d!.getUTCFullYear()).toBe(2026);
    expect(d!.getUTCMonth()).toBe(5); // June (0-indexed)
    expect(d!.getUTCDate()).toBe(3);
  });

  it('returns null for empty or invalid input', () => {
    expect(parseTripDate('')).toBeNull();
    expect(parseTripDate('   ')).toBeNull();
    expect(parseTripDate(undefined)).toBeNull();
    expect(parseTripDate('not a date')).toBeNull();
  });
});

describe('parseRosterCsv', () => {
  it('parses every flight row from the sample', () => {
    const rows = parseRosterCsv(csv);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({
      crewId: '891939',
      fltNumber: 'FA105',
      depArp: 'TPE',
      arvArp: 'BKK',
      fleet: '350',
    });
    expect(rows[6]).toMatchObject({ fltNumber: 'FA200', hotel: 'Hyatt Regency' });
  });
});

describe('groupIntoTrips', () => {
  it('groups rows into trips by check-in date', () => {
    const trips = groupIntoTrips(parseRosterCsv(csv));
    expect(trips).toHaveLength(3);
    expect(trips.map(t => t.legs.length)).toEqual([4, 2, 2]);
    expect(trips[0].legs.map(l => l.fltNumber)).toEqual([
      'FA105',
      'FA106',
      'FA107',
      'FA108',
    ]);
  });
});

describe('classifyTrips', () => {
  it('splits the sample into upcoming and past relative to 2026-05-31', () => {
    const { upcoming, past } = classifyTrips(groupIntoTrips(parseRosterCsv(csv)), NOW);

    // FA105–108 fly on 20 May → past; FA100/101 and FA200/201 are in June → upcoming.
    expect(upcoming).toHaveLength(2);
    expect(past).toHaveLength(1);
    expect(past[0].legs[0].fltNumber).toBe('FA105');
    expect(upcoming.map(t => t.legs[0].fltNumber)).toEqual(['FA100', 'FA200']);
  });

  it('parseAndClassify is equivalent to the full pipeline', () => {
    const a = parseAndClassify(csv, NOW);
    const b = classifyTrips(groupIntoTrips(parseRosterCsv(csv)), NOW);
    expect(a).toEqual(b);
  });

  // Regression for the on-device report ("10 Sep ET805 — why no wake up / leave
  // home?"): the boundary was computed with a device-local parse, so a duty that
  // had already finished still counted as "upcoming" for as many hours as the
  // phone sits behind UTC, while the previous day's identical duty did not.
  it('a duty that already ended is past, measured against the real UTC instant', () => {
    // "01 Jun 2026 2100" IS 21:00 UTC. On a Vancouver phone the old local parse
    // read it as 21:00 PDT (= 02 Jun 04:00Z), so the duty stayed "upcoming" for
    // another seven hours and kept its alarm markers.
    const trip: Trip = {
      id: 'T1',
      crewId: 'C1',
      checkInDateUTC: '01 Jun 2026 2000',
      legs: [{
        crewId: 'C1',
        fltNumber: 'FA100',
        flightDateUTC: '01 Jun 2026 2000',
        depArp: 'BKK',
        arvDateUTC: '01 Jun 2026 2100',
        arvArp: 'BKK',
        fleet: '',
        hotel: '',
      }],
    };

    // Half an hour after the final arrival → past.
    expect(classifyTrips([trip], new Date('2026-06-01T21:30:00Z')).past).toEqual([trip]);
    expect(classifyTrips([trip], new Date('2026-06-01T21:30:00Z')).upcoming).toEqual([]);
    // Half an hour before it → still upcoming.
    expect(classifyTrips([trip], new Date('2026-06-01T20:30:00Z')).upcoming).toEqual([trip]);
  });
});
