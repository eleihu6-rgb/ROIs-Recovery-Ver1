import fs from 'fs';
import path from 'path';
import { groupIntoTrips, parseRosterCsv } from '../../src/features/travel/tripCsv';
import {
  computeDutyAlarms,
  airportTimeZone,
  DEFAULT_ALARM_OPTIONS,
} from '../../src/features/settings/alarmSetup';

const CSV_PATH = path.resolve(
  __dirname,
  '..', '..', 'data',
  'Crew Roster Sample.csv',
);
const csv = fs.readFileSync(CSV_PATH, 'utf8');
const trips = groupIntoTrips(parseRosterCsv(csv));
const alarms = computeDutyAlarms(trips);

describe('airportTimeZone', () => {
  it('maps known airports and falls back to UTC', () => {
    expect(airportTimeZone('TPE')).toBe('Asia/Taipei');
    expect(airportTimeZone('yvr')).toBe('America/Vancouver');
    expect(airportTimeZone('ZZZ')).toBe('UTC');
  });
});

describe('computeDutyAlarms', () => {
  it('produces one alarm pair per check-in duty (3 for the sample)', () => {
    expect(alarms).toHaveLength(3);
    expect(alarms.map(a => a.fltNumber)).toEqual(['FA105', 'FA100', 'FA200']);
  });

  it('anchors each alarm to the departure airport (all TPE in the sample)', () => {
    expect(alarms.every(a => a.dep === 'TPE')).toBe(true);
    expect(alarms.every(a => a.timeZone === 'Asia/Taipei')).toBe(true);
  });

  it('computes Wake Up at dep-4h and Leave Home at dep-3h in local time', () => {
    // FA200 departs 03 Jun 2026 0300 UTC = 1100 TPE local.
    const fa200 = alarms.find(a => a.fltNumber === 'FA200')!;
    expect(fa200.wakeUp.hhmm).toBe('07:00'); // 1100 - 4h
    expect(fa200.leaveHome.hhmm).toBe('08:00'); // 1100 - 3h
    expect(fa200.wakeUp.local).toMatchObject({ year: 2026, month: 6, day: 3 });
  });

  it('builds labels exactly as the spec example for FA200', () => {
    const fa200 = alarms.find(a => a.fltNumber === 'FA200')!;
    // Check-in = dep - 2h = 0900 TPE on 03 Jun.
    expect(fa200.checkInLabel).toBe('03 Jun 0900');
    expect(fa200.wakeUpLabel).toBe(
      'Wake Up for Flight FA200, TPE – YVR, check in time at 03 Jun 0900',
    );
    expect(fa200.leaveHomeLabel).toBe(
      'Leave Home for Flight FA200, TPE – YVR, check in time at 03 Jun 0900',
    );
  });

  it('respects custom hours-before options', () => {
    const custom = computeDutyAlarms(trips, {
      ...DEFAULT_ALARM_OPTIONS,
      wakeUpHoursBefore: 5,
    });
    const fa200 = custom.find(a => a.fltNumber === 'FA200')!;
    expect(fa200.wakeUp.hhmm).toBe('06:00'); // 1100 - 5h
  });
});
