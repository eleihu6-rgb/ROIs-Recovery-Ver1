// Flight → iOS Calendar (option A3 + B2 + C1) and the time-aware "Wake Up" /
// "Get Ready" wording (option T1).
//
// Fixtures are hand-built so departure LOCAL hour can be dialled precisely:
// every flight departs TPE (Asia/Taipei, UTC+8, no DST), so a UTC dep of 0300
// is 1100 local.

import {
  buildDutyCalendarEvents,
  MARKER_MINUTES,
  type CalendarEventDraft,
} from '../../src/features/calendar/flightCalendar';
import {
  alarmOptions,
  computeEffectiveAlarms,
  readyWord,
  DEFAULT_ALARM_OPTIONS,
} from '../../src/features/settings/alarmSetup';
import type { Trip, TripLeg } from '../../src/features/travel/tripCsv';

const leg = (over: Partial<TripLeg> = {}): TripLeg => ({
  crewId: '42596',
  fltNumber: 'FA200',
  flightDateUTC: '03 Jun 2026 0300', // 1100 TPE
  depArp: 'TPE',
  arvDateUTC: '03 Jun 2026 0600', // 1300 BKK
  arvArp: 'BKK',
  fleet: '359',
  hotel: '',
  ...over,
});

const trip = (over: Partial<Trip> = {}): Trip => ({
  id: 'duty-1',
  crewId: '42596',
  checkInDateUTC: '03 Jun 2026 0100',
  legs: [leg()],
  ...over,
});

const byKeySuffix = (events: CalendarEventDraft[], suffix: string) =>
  events.find(e => e.key.endsWith(suffix));

// ─── T1: Wake Up vs Get Ready ────────────────────────────────────────────────

describe('readyWord (T1 two-way)', () => {
  it('says "Wake Up" for a morning alarm and "Get Ready" otherwise', () => {
    expect(readyWord(7)).toBe('Wake Up');
    expect(readyWord(15)).toBe('Get Ready');
    expect(readyWord(22)).toBe('Get Ready');
  });

  it('flips exactly at the 02:00 and 11:00 boundaries', () => {
    expect(readyWord(1)).toBe('Get Ready'); // 01:59 side
    expect(readyWord(2)).toBe('Wake Up');
    expect(readyWord(10)).toBe('Wake Up'); // 10:59 side
    expect(readyWord(11)).toBe('Get Ready');
  });
});

describe('alarm labels follow the time of day', () => {
  const options = DEFAULT_ALARM_OPTIONS;

  it('keeps "Wake Up" for a morning duty (dep 1100 TPE → alarm 0700)', () => {
    const [a] = computeEffectiveAlarms([trip()], options);
    expect(a.wakeUp!.hhmm).toBe('07:00');
    expect(a.wakeWord).toBe('Wake Up');
    expect(a.wakeUpLabel).toBe(
      'Wake Up for Flight FA200, TPE – BKK, check in time at 03 Jun 0900',
    );
  });

  it('switches to "Get Ready" for an evening duty (dep 2100 TPE → alarm 1700)', () => {
    const evening = trip({
      id: 'duty-pm',
      legs: [leg({ flightDateUTC: '03 Jun 2026 1300', arvDateUTC: '03 Jun 2026 1600' })],
    });
    const [a] = computeEffectiveAlarms([evening], options);
    expect(a.wakeUp!.hhmm).toBe('17:00');
    expect(a.wakeWord).toBe('Get Ready');
    expect(a.wakeUpLabel).toBe(
      'Get Ready for Flight FA200, TPE – BKK, check in time at 03 Jun 1900',
    );
  });
});

// ─── A3: one event per milestone ─────────────────────────────────────────────

describe('buildDutyCalendarEvents — single-leg morning duty', () => {
  const events = buildDutyCalendarEvents(trip(), DEFAULT_ALARM_OPTIONS);

  it('writes four entries: wake, leave home, check-in, and the flight', () => {
    expect(events.map(e => e.title)).toEqual([
      'Wake Up · FA200',
      'Leave Home · FA200',
      'Check-in FA200 · TPE',
      'FA200 · TPE → BKK',
    ]);
  });

  it('places the markers at dep −4h / −3h / −2h as 15-minute blocks', () => {
    const wake = byKeySuffix(events, ':wake')!;
    const leave = byKeySuffix(events, ':leave')!;
    const checkIn = byKeySuffix(events, ':checkin')!;
    // Dep 03 Jun 0300Z → wake 2300Z prev day, leave 0000Z, check-in 0100Z.
    expect(wake.startISO).toBe('2026-06-02T23:00:00Z');
    expect(leave.startISO).toBe('2026-06-03T00:00:00Z');
    expect(checkIn.startISO).toBe('2026-06-03T01:00:00Z');
    for (const m of [wake, leave, checkIn]) {
      const mins = (Date.parse(m.endISO) - Date.parse(m.startISO)) / 60_000;
      expect(mins).toBe(MARKER_MINUTES);
    }
  });

  it('gives the flight entry the real departure → arrival instants', () => {
    const flight = byKeySuffix(events, ':flight:0')!;
    expect(flight.startISO).toBe('2026-06-03T03:00:00Z');
    expect(flight.endISO).toBe('2026-06-03T06:00:00Z');
  });

  it('pins every entry to the departure airport timezone', () => {
    expect(events.every(e => e.timeZone === 'Asia/Taipei')).toBe(true);
  });

  it('lists all five times in the notes of every entry', () => {
    const notes = events[0].notes;
    expect(notes).toContain('Wake Up 07:00');
    expect(notes).toContain('Leave Home 08:00');
    expect(notes).toContain('Check-in 09:00');
    expect(notes).toContain('FA200  TPE 11:00 → BKK 13:00');
    expect(events.every(e => e.notes === notes)).toBe(true);
  });

  it('titles the first marker "Get Ready" for an evening duty', () => {
    const evening = trip({
      legs: [leg({ flightDateUTC: '03 Jun 2026 1300', arvDateUTC: '03 Jun 2026 1600' })],
    });
    const out = buildDutyCalendarEvents(evening, DEFAULT_ALARM_OPTIONS);
    expect(out[0].title).toBe('Get Ready · FA200');
    expect(out[0].notes).toContain('Get Ready 17:00');
  });
});

// ─── B2: one tap covers the whole duty ───────────────────────────────────────

describe('buildDutyCalendarEvents — multi-leg duty (option B2)', () => {
  const twoLeg = trip({
    legs: [
      leg(),
      leg({
        fltNumber: 'FA201',
        depArp: 'BKK',
        arvArp: 'TPE',
        flightDateUTC: '04 Jun 2026 0200', // 0900 BKK
        arvDateUTC: '04 Jun 2026 0530', // 1330 TPE
      }),
    ],
  });
  const events = buildDutyCalendarEvents(twoLeg, DEFAULT_ALARM_OPTIONS);

  it('writes the three duty markers once plus one block per leg', () => {
    expect(events).toHaveLength(5);
    expect(events.map(e => e.title)).toEqual([
      'Wake Up · FA200',
      'Leave Home · FA200',
      'Check-in FA200 · TPE',
      'FA200 · TPE → BKK',
      'FA201 · BKK → TPE',
    ]);
  });

  it('anchors the markers to the FIRST leg, not the second', () => {
    expect(byKeySuffix(events, ':wake')!.startISO).toBe('2026-06-02T23:00:00Z');
  });

  it('uses each leg own departure timezone for its flight block', () => {
    expect(byKeySuffix(events, ':flight:1')!.timeZone).toBe('Asia/Bangkok');
  });

  it('lists both flights in the notes', () => {
    expect(events[0].notes).toContain('FA200  TPE 11:00 → BKK 13:00');
    expect(events[0].notes).toContain('FA201  BKK 09:00 → TPE 13:30');
  });
});

// ─── C1: the crew's live alarm settings drive the times ──────────────────────

describe('buildDutyCalendarEvents — alarm settings (option C1)', () => {
  it('honours custom global offsets', () => {
    const events = buildDutyCalendarEvents(trip(), alarmOptions(6, 5));
    expect(byKeySuffix(events, ':wake')!.startISO).toBe('2026-06-02T21:00:00Z'); // dep −6h
    expect(byKeySuffix(events, ':leave')!.startISO).toBe('2026-06-02T22:00:00Z'); // dep −5h
  });

  it('honours a per-duty override', () => {
    const events = buildDutyCalendarEvents(trip(), DEFAULT_ALARM_OPTIONS, {
      wakeUpHours: 2.5,
      leaveHomeHours: 1.5,
    });
    expect(byKeySuffix(events, ':wake')!.startISO).toBe('2026-06-03T00:30:00Z');
    expect(byKeySuffix(events, ':leave')!.startISO).toBe('2026-06-03T01:30:00Z');
  });

  it('omits a marker whose alarm the crew removed for this duty', () => {
    const events = buildDutyCalendarEvents(trip(), DEFAULT_ALARM_OPTIONS, {
      wakeUpHours: null,
      leaveHomeHours: 3,
    });
    expect(byKeySuffix(events, ':wake')).toBeUndefined();
    expect(events.map(e => e.title)).toEqual([
      'Leave Home · FA200',
      'Check-in FA200 · TPE',
      'FA200 · TPE → BKK',
    ]);
    expect(events[0].notes).not.toContain('Wake Up');
  });

  it('drops both markers when both alarms are removed, keeping check-in + flight', () => {
    const events = buildDutyCalendarEvents(trip(), DEFAULT_ALARM_OPTIONS, {
      wakeUpHours: null,
      leaveHomeHours: null,
    });
    expect(events.map(e => e.title)).toEqual(['Check-in FA200 · TPE', 'FA200 · TPE → BKK']);
  });
});

// ─── Bad roster data ─────────────────────────────────────────────────────────

describe('buildDutyCalendarEvents — defensive', () => {
  it('returns nothing for a duty with no legs', () => {
    expect(buildDutyCalendarEvents(trip({ legs: [] }), DEFAULT_ALARM_OPTIONS)).toEqual([]);
  });

  it('returns nothing when the first departure is unparseable', () => {
    const bad = trip({ legs: [leg({ flightDateUTC: 'not a date' })] });
    expect(buildDutyCalendarEvents(bad, DEFAULT_ALARM_OPTIONS)).toEqual([]);
  });

  it('falls back to a 2h block when the arrival time is missing or inverted', () => {
    const noArv = trip({ legs: [leg({ arvDateUTC: '' })] });
    expect(byKeySuffix(buildDutyCalendarEvents(noArv, DEFAULT_ALARM_OPTIONS), ':flight:0')!.endISO)
      .toBe('2026-06-03T05:00:00Z');

    const inverted = trip({ legs: [leg({ arvDateUTC: '03 Jun 2026 0100' })] });
    expect(
      byKeySuffix(buildDutyCalendarEvents(inverted, DEFAULT_ALARM_OPTIONS), ':flight:0')!.endISO,
    ).toBe('2026-06-03T05:00:00Z');
  });

  it('never emits a zero-length or inverted event', () => {
    for (const e of buildDutyCalendarEvents(trip(), DEFAULT_ALARM_OPTIONS)) {
      expect(Date.parse(e.endISO)).toBeGreaterThan(Date.parse(e.startISO));
    }
  });
});
