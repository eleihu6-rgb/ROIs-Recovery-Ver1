import fs from 'fs';
import path from 'path';
import {
  parseRosterCsv,
  groupIntoTrips,
  classifyTrips,
  parseTripDate,
  parseAndClassify,
} from '../../src/features/travel/tripCsv';

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
  it('parses the roster datetime format', () => {
    const d = parseTripDate('03 Jun 2026 0300');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(5); // June (0-indexed)
    expect(d!.getDate()).toBe(3);
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
});
