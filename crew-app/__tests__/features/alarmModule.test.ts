import fs from 'fs';
import path from 'path';
import { NativeModules } from 'react-native';
import { groupIntoTrips, parseRosterCsv } from '../../src/features/travel/tripCsv';
import { computeDutyAlarms } from '../../src/features/settings/alarmSetup';

// Mock the native AlarmModule before importing the wrapper (it captures the
// module reference at import time).
const scheduleAlarm = jest.fn(async (p: any) => p.id);
const removeAllAlarms = jest.fn(async () => 0);
(NativeModules as any).AlarmModule = {
  requestAuthorization: jest.fn(async () => 'authorized'),
  scheduleAlarm,
  removeAllAlarms,
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { scheduleDutyAlarms } = require('../../src/features/settings/alarmModule');

const CSV_PATH = path.resolve(
  __dirname,
  '..', '..', 'data',
  'Crew Roster Sample.csv',
);
const csv = fs.readFileSync(CSV_PATH, 'utf8');
const alarms = computeDutyAlarms(groupIntoTrips(parseRosterCsv(csv)));

// scheduleDutyAlarms skips alarms whose fire time is already in the past, so we
// pin "now" to a fixed instant well before the sample roster's duties to keep
// these assertions deterministic regardless of the real clock.
const BEFORE_ALL_DUTIES = new Date('2026-01-01T00:00:00Z').getTime();
const AFTER_ALL_DUTIES = new Date('2027-01-01T00:00:00Z').getTime();

describe('scheduleDutyAlarms', () => {
  beforeEach(() => {
    scheduleAlarm.mockClear();
    removeAllAlarms.mockClear();
    jest.spyOn(Date, 'now').mockReturnValue(BEFORE_ALL_DUTIES);
  });

  afterEach(() => {
    (Date.now as jest.Mock).mockRestore();
  });

  it('deletes all existing alarms before scheduling new ones', async () => {
    await scheduleDutyAlarms(alarms);
    expect(removeAllAlarms).toHaveBeenCalledTimes(1);
    // removeAllAlarms must run before the first scheduleAlarm.
    expect(removeAllAlarms.mock.invocationCallOrder[0]).toBeLessThan(
      scheduleAlarm.mock.invocationCallOrder[0],
    );
  });

  it('schedules a Wake Up + Leave Home alarm for each of the 3 duties', async () => {
    const result = await scheduleDutyAlarms(alarms);
    expect(result.scheduled).toBe(6); // 3 duties × 2
    expect(scheduleAlarm).toHaveBeenCalledTimes(6);
  });

  it('passes the correct local time, timezone and label to the native layer', async () => {
    await scheduleDutyAlarms(alarms);
    const fa200Wake = scheduleAlarm.mock.calls
      .map(c => c[0])
      .find(p => p.title.startsWith('Wake Up for Flight FA200'));
    expect(fa200Wake).toMatchObject({
      hour: 7,
      minute: 0,
      timeZone: 'Asia/Taipei',
      title: 'Wake Up for Flight FA200, TPE – YVR, check in time at 03 Jun 0900',
    });
  });

  it('can schedule only one alarm type when requested', async () => {
    const result = await scheduleDutyAlarms(alarms, { wakeUp: true, leaveHome: false });
    expect(result.scheduled).toBe(3);
  });

  it('skips alarms whose fire time is already in the past', async () => {
    (Date.now as jest.Mock).mockReturnValue(AFTER_ALL_DUTIES);
    const result = await scheduleDutyAlarms(alarms);
    expect(result.scheduled).toBe(0);
    expect(result.skippedPast).toBe(6); // 3 duties × 2, all in the past
    expect(scheduleAlarm).not.toHaveBeenCalled();
  });
});
