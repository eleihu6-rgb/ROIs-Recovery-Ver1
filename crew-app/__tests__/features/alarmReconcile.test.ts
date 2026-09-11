import fs from 'fs';
import path from 'path';
import { NativeModules } from 'react-native';
import { groupIntoTrips, parseRosterCsv, type Trip } from '../../src/features/travel/tripCsv';

// Meeting alarms intentionally use the device timezone. Pin that device
// boundary so these Bangkok expectations do not inherit the test host's zone.
jest.mock('../../src/features/settings/timeFormat', () => ({
  ...jest.requireActual('../../src/features/settings/timeFormat'),
  deviceTimeZone: () => 'Asia/Bangkok',
}));

// ─── refine set alarm function (v60) ──────────────────────────────────────────
// The toggle (and every roster reload / offset change) routes through ONE thunk,
// reconcileAlarms, which makes the device match app state:
//   • enabled  → clear, then schedule a Wake Up + Leave Home alarm per flight
//   • disabled → remove every alarm
// These tests pin the native AlarmModule and a fake clock and assert the thunk
// actually sets / removes the alarms and honours the user-defined offsets.

const scheduleAlarm = jest.fn(async (p: any) => p.id);
const removeAllAlarms = jest.fn(async () => 0);
const requestAuthorization = jest.fn(async () => 'authorized');
(NativeModules as any).AlarmModule = {
  requestAuthorization,
  scheduleAlarm,
  removeAllAlarms,
  getScheduledAlarms: jest.fn(async () => []),
};

// Require AFTER the native mock is installed (alarmModule captures the module
// reference at import time, and alarmsSlice imports alarmModule).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { reconcileAlarms } = require('../../src/features/alarms/alarmsSlice');

const CSV_PATH = path.resolve(__dirname, '..', '..', 'data', 'Crew Roster Sample.csv');
const TRIPS: Trip[] = groupIntoTrips(parseRosterCsv(fs.readFileSync(CSV_PATH, 'utf8')));

interface FakeAlarmsState {
  enabled: boolean;
  wakeUpHours: number;
  leaveHomeHours: number;
  overrides: Record<string, { wakeUpHours: number | null; leaveHomeHours: number | null }>;
  /** Agenda scope (v69). Omitting it makes reconcileAlarms schedule nothing. */
  agendaFilter: 'all' | 'work' | 'personal';
}

interface FakeMeetingsState {
  enabled: boolean;
  minutesBefore: number;
  meetings: Array<{
    id: string;
    title: string;
    startISO: string;
    endISO: string;
    timeZone: string;
    calendarTitle: string;
    allDay: boolean;
  }>;
}

const noMeetings: FakeMeetingsState = { enabled: false, minutesBefore: 8, meetings: [] };

// Drive the thunk directly: thunks are (dispatch, getState) => Promise.
function run(alarms: FakeAlarmsState, trips: Trip[] = TRIPS, meetings: FakeMeetingsState = noMeetings) {
  const getState = () => ({ alarms, trips: { trips }, meetings } as any);
  return reconcileAlarms()(jest.fn(), getState);
}

const base: FakeAlarmsState = {
  enabled: true,
  wakeUpHours: 4,
  leaveHomeHours: 3,
  overrides: {},
  agendaFilter: 'all',
};

describe('reconcileAlarms', () => {
  beforeEach(() => {
    scheduleAlarm.mockClear();
    removeAllAlarms.mockClear();
    requestAuthorization.mockClear();
    requestAuthorization.mockResolvedValue('authorized');
    // Freeze "now" well before the sample roster so its duties are upcoming AND
    // future (affects both classifyTrips' new Date() and isFuture's Date.now()).
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('sets a Wake Up + Leave Home alarm for every upcoming flight when enabled', async () => {
    const res = await run(base);
    expect(res.available).toBe(true);
    expect(res.scheduled).toBe(6); // 3 duties × 2 alarms
    expect(scheduleAlarm).toHaveBeenCalledTimes(6);
    // Existing alarms are wiped before the first new one is scheduled.
    expect(removeAllAlarms).toHaveBeenCalledTimes(1);
    expect(removeAllAlarms.mock.invocationCallOrder[0]).toBeLessThan(
      scheduleAlarm.mock.invocationCallOrder[0],
    );
  });

  it('removes all alarms and schedules none when disabled', async () => {
    const res = await run({ ...base, enabled: false });
    expect(res.scheduled).toBe(0);
    expect(removeAllAlarms).toHaveBeenCalledTimes(1);
    expect(scheduleAlarm).not.toHaveBeenCalled();
  });

  it('honours user-defined offsets (Wake Up at −6h instead of −4h)', async () => {
    await run({ ...base, wakeUpHours: 6 });
    const fa200Wake = scheduleAlarm.mock.calls
      .map(c => c[0])
      .find(p => p.title.startsWith('Wake Up for Flight FA200'));
    // FA200 departs 11:00 TPE (check-in 09:00 = dep−2h); −6h ⇒ 05:00 local.
    expect(fa200Wake).toMatchObject({ hour: 5, minute: 0, timeZone: 'Asia/Taipei' });
  });

  it('skips an alarm a per-duty override has removed (null hours)', async () => {
    const firstDutyId = TRIPS[0].id;
    const res = await run({
      ...base,
      overrides: { [firstDutyId]: { wakeUpHours: null, leaveHomeHours: 3 } },
    });
    // One Wake Up removed ⇒ 5 alarms instead of 6.
    expect(res.scheduled).toBe(5);
  });

  it('removes alarms (sets none) when authorization is refused', async () => {
    requestAuthorization.mockResolvedValue('denied');
    const res = await run(base);
    expect(res.scheduled).toBe(0);
    expect(scheduleAlarm).not.toHaveBeenCalled();
    expect(removeAllAlarms).toHaveBeenCalled();
  });

  // ─── Meeting alarms combine with flight alarms in the SAME reconcile ─────────
  // A meeting 14 days out so it's always future relative to the frozen 1 Jan clock.
  const meeting = {
    id: 'evt-1',
    title: 'Crew briefing',
    startISO: '2026-01-15T09:00:00+07:00', // 09:00 Bangkok
    endISO: '2026-01-15T10:00:00+07:00',
    timeZone: 'Asia/Bangkok',
    calendarTitle: 'Work',
    allDay: false,
  };

  it('arms a single reminder per meeting when meeting reminders are on', async () => {
    const res = await run({ ...base, enabled: false }, TRIPS, {
      enabled: true,
      minutesBefore: 8,
      meetings: [meeting],
    });
    // Flight alarms off, meetings on ⇒ exactly one alarm (the meeting reminder).
    expect(res.scheduled).toBe(1);
    const p = scheduleAlarm.mock.calls[0][0];
    // 09:00 − 8 min = 08:52 Bangkok.
    expect(p).toMatchObject({ hour: 8, minute: 52, timeZone: 'Asia/Bangkok' });
    expect(p.title).toContain('Crew briefing');
  });

  it('honours the configurable lead time (30 min before)', async () => {
    await run({ ...base, enabled: false }, TRIPS, {
      enabled: true,
      minutesBefore: 30,
      meetings: [meeting],
    });
    expect(scheduleAlarm.mock.calls[0][0]).toMatchObject({ hour: 8, minute: 30 });
  });

  it('combines flight + meeting alarms (6 flight + 1 meeting = 7)', async () => {
    const res = await run(base, TRIPS, { enabled: true, minutesBefore: 8, meetings: [meeting] });
    expect(res.scheduled).toBe(7);
  });

  it('skips all-day meetings (no sensible reminder time)', async () => {
    const res = await run({ ...base, enabled: false }, TRIPS, {
      enabled: true,
      minutesBefore: 8,
      meetings: [{ ...meeting, allDay: true }],
    });
    expect(res.scheduled).toBe(0);
  });
});
