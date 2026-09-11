import { NativeModules } from 'react-native';

// ─── Agenda filter (v69) ───────────────────────────────────────────────────────
// The Agenda tab has Work / Personal / All filter scopes that control both what
// cards are displayed and which alarms are armed.
// These tests pin reconcileAlarms and verify that the agendaFilter field on the
// alarms state correctly gates which alarm sources are scheduled.

const scheduleAlarm = jest.fn(async (p: any) => p.id);
const removeAllAlarms = jest.fn(async () => 0);
const requestAuthorization = jest.fn(async () => 'authorized');
(NativeModules as any).AlarmModule = {
  requestAuthorization,
  scheduleAlarm,
  removeAllAlarms,
  getScheduledAlarms: jest.fn(async () => []),
};

// Require AFTER mock is installed.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { reconcileAlarms } = require('../../src/features/alarms/alarmsSlice');

// One upcoming flight trip (far future so it's never classified as past).
const FUTURE_TRIP = {
  id: 'T1',
  crewId: '99999',
  checkInDateUTC: '2099-01-01 00:00',
  layoverHours: 0,
  legs: [
    {
      crewId: '99999',
      fltNumber: 'XX001',
      flightDateUTC: '01 Jan 2099 0000',
      depArp: 'BKK',
      arvDateUTC: '01 Jan 2099 0600',
      arvArp: 'NRT',
      fleet: '789',
      hotel: '',
      localDepTime: '2099-01-01 07:00',
      localArvTime: '2099-01-01 13:00',
      assignment: 'FLY',
    },
  ],
};

// One upcoming personal meeting (far future).
const FUTURE_MEETING = {
  id: 'M1',
  title: 'Crew briefing',
  startISO: '2099-02-01T09:00:00+07:00',
  endISO: '2099-02-01T10:00:00+07:00',
  timeZone: 'Asia/Bangkok',
  calendarTitle: 'Calendar',
  allDay: false,
};

type Filter = 'all' | 'work' | 'personal';

function run(filter: Filter, flightsEnabled = true, meetingsEnabled = true) {
  const getState = () => ({
    alarms: {
      enabled: flightsEnabled,
      wakeUpHours: 3,
      leaveHomeHours: 1,
      overrides: {},
      agendaFilter: filter,
    },
    trips: { trips: [FUTURE_TRIP] },
    meetings: {
      enabled: meetingsEnabled,
      minutesBefore: 8,
      meetings: [FUTURE_MEETING],
    },
  } as any);
  return reconcileAlarms()(jest.fn(), getState);
}

beforeEach(() => {
  scheduleAlarm.mockClear();
  removeAllAlarms.mockClear();
});

describe('agendaFilter — alarm scoping', () => {
  it('all: schedules both flight alarms and meeting alarms', async () => {
    await run('all');
    // IDs are formatted as `${dutyId}-wake` / `${dutyId}-leave` by alarmModule.
    const ids: string[] = scheduleAlarm.mock.calls.map((c: any[]) => c[0].id as string);
    expect(ids.some(id => id.startsWith('meeting:M1'))).toBe(true);
    expect(ids.some(id => id === 'T1-wake' || id === 'T1-leave')).toBe(true);
  });

  it('work: schedules only flight alarms, no meeting alarms', async () => {
    await run('work');
    const ids: string[] = scheduleAlarm.mock.calls.map((c: any[]) => c[0].id as string);
    expect(ids.some(id => id.startsWith('meeting:'))).toBe(false);
    expect(ids.some(id => id === 'T1-wake' || id === 'T1-leave')).toBe(true);
  });

  it('personal: schedules only meeting alarms, no flight alarms', async () => {
    await run('personal');
    const ids: string[] = scheduleAlarm.mock.calls.map((c: any[]) => c[0].id as string);
    expect(ids.some(id => id.startsWith('meeting:M1'))).toBe(true);
    expect(ids.some(id => id === 'T1-wake' || id === 'T1-leave')).toBe(false);
  });

  it('work with flights disabled: removes all alarms (nothing to schedule)', async () => {
    await run('work', false, true);
    // flights disabled + work filter → scheduleWork=true but enabled=false → no flight alarms.
    // meetings enabled but schedulePersonal=false → no meeting alarms. Net: remove all.
    expect(removeAllAlarms).toHaveBeenCalledTimes(1);
    expect(scheduleAlarm).not.toHaveBeenCalled();
  });

  it('personal with meetings disabled: removes all alarms', async () => {
    await run('personal', true, false);
    expect(removeAllAlarms).toHaveBeenCalledTimes(1);
    expect(scheduleAlarm).not.toHaveBeenCalled();
  });
});
