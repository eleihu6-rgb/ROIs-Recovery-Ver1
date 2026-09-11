import {
  computeMeetingAlarms,
  meetingToGroundDuty,
  classifyMeetings,
  nextImminentMeeting,
  meetingJoinUrl,
  meetingAlarmHhmm,
  DEFAULT_MEETING_MINUTES,
  DEFAULT_ISLAND_MINUTES,
  type Meeting,
} from '../../src/features/meetings/meetingSetup';

// ─── Meeting → alarm + display logic ──────────────────────────────────────────
// A calendar meeting (Outlook/Exchange synced to the iOS Calendar, read via
// EventKit) becomes a SINGLE reminder N minutes before it starts, and a
// 'meeting' ground-duty card. Times are expressed in the device's current
// timezone so traveling crews see correct local times, not the event-origin tz.

const NOW = new Date('2026-06-01T00:00:00Z');

// All tests pass 'Asia/Bangkok' as the explicit device timezone so they are
// deterministic regardless of the host machine's system timezone.
const DEVICE_TZ = 'Asia/Bangkok';

const mtg = (over: Partial<Meeting> = {}): Meeting => ({
  id: 'evt-1',
  title: 'Crew briefing',
  startISO: '2026-06-10T09:00:00+07:00', // 09:00 Bangkok
  endISO: '2026-06-10T10:00:00+07:00',
  timeZone: 'Asia/Bangkok',
  calendarTitle: 'Work',
  allDay: false,
  ...over,
});

describe('computeMeetingAlarms', () => {
  it('defaults to 8 minutes before the meeting', () => {
    expect(DEFAULT_MEETING_MINUTES).toBe(8);
    const [a] = computeMeetingAlarms([mtg()], DEFAULT_MEETING_MINUTES, NOW, new Set(), DEVICE_TZ);
    // 09:00 Bangkok − 8 min = 08:52; device is also Bangkok here.
    expect(a.dutyId).toBe('meeting:evt-1');
    expect(a.wakeUp?.hhmm).toBe('08:52');
    expect(a.leaveHome).toBeNull();
    expect(a.wakeUpLabel).toContain('Crew briefing');
  });

  it('honours a configurable lead time (30 min)', () => {
    const [a] = computeMeetingAlarms([mtg()], 30, NOW, new Set(), DEVICE_TZ);
    expect(a.wakeUp?.hhmm).toBe('08:30');
  });

  it('uses the device timezone (not event timezone) in the EffectiveAlarm timeZone field', () => {
    // .timeZone must match the timezone used for .wakeUp.local so AlarmKit fires
    // at the right absolute instant. A mismatch (old bug) caused the alarm to fire
    // in the organizer's timezone instead of the device's.
    // Tokyo event at 09:00+09 = 00:00 UTC; alarm = 23:52 UTC prev day.
    // In Bangkok (+7): 23:52 UTC = 06:52 Bangkok.
    const [a] = computeMeetingAlarms(
      [mtg({ startISO: '2026-06-10T09:00:00+09:00', timeZone: 'Asia/Tokyo' })],
      8,
      NOW,
      new Set(),
      DEVICE_TZ,
    );
    // timeZone must be deviceTz (Bangkok) — not the event's origin tz (Tokyo).
    expect(a.timeZone).toBe(DEVICE_TZ);
    expect(a.wakeUp?.hhmm).toBe('06:52');
  });

  it('fires at the correct device-tz time even when event timezone differs (YVR bug)', () => {
    // Meeting at 10:30 PDT (America/Vancouver, UTC-7). The event was created by an
    // organizer in Mountain time (America/Denver, UTC-6), so EventKit reports that
    // as the event timezone.
    //
    // Bug (before fix): local components { hour:10, minute:22 } were computed in
    // PDT but the EffectiveAlarm.timeZone was "America/Denver". AlarmKit then
    // interpreted "10:22 MDT" = 16:22 UTC = 09:22 PDT — fired 1 hour early.
    //
    // After fix: EffectiveAlarm.timeZone = deviceTz ("America/Vancouver"), so
    // AlarmKit correctly fires at 10:22 PDT.
    const now = new Date('2026-06-29T09:00:00Z'); // 02:00 PDT, well before the meeting
    const [a] = computeMeetingAlarms(
      [mtg({
        startISO: '2026-06-29T17:30:00Z', // 10:30 PDT
        timeZone: 'America/Denver',        // organizer's tz (Mountain)
      })],
      8,
      now,
      new Set(),
      'America/Vancouver',
    );
    expect(a.wakeUp?.hhmm).toBe('10:22'); // correct: 8 min before 10:30 PDT
    expect(a.timeZone).toBe('America/Vancouver'); // must match the local-component tz
  });

  it('shows alarm in device timezone when traveling (Singapore event, LA device)', () => {
    // 09:00 SGT (+8) = 01:00 UTC; 8 min before = 00:52 UTC.
    // PDT (UTC-7): 00:52 UTC = 17:52 PDT on the previous day.
    const [a] = computeMeetingAlarms(
      [mtg({ startISO: '2026-06-10T09:00:00+08:00', timeZone: 'Asia/Singapore' })],
      8,
      NOW,
      new Set(),
      'America/Los_Angeles',
    );
    expect(a.wakeUp?.hhmm).toBe('17:52');
  });

  it('skips all-day meetings', () => {
    expect(computeMeetingAlarms([mtg({ allDay: true })], 8, NOW)).toHaveLength(0);
  });

  it('skips meetings that have already started', () => {
    const past = mtg({ startISO: '2026-05-01T09:00:00+07:00' });
    expect(computeMeetingAlarms([past], 8, NOW)).toHaveLength(0);
  });

  it('skips cancelled meetings — no alarm created', () => {
    expect(computeMeetingAlarms([mtg({ cancelled: true })], 8, NOW)).toHaveLength(0);
  });

  it('still schedules a non-cancelled meeting alongside a cancelled one', () => {
    const active = mtg({ id: 'active' });
    const gone = mtg({ id: 'gone', cancelled: true });
    const alarms = computeMeetingAlarms([active, gone], 8, NOW);
    expect(alarms).toHaveLength(1);
    expect(alarms[0].dutyId).toBe('meeting:active');
  });

  it('skips muted meeting IDs — no alarm created', () => {
    const muted = new Set(['evt-1']);
    expect(computeMeetingAlarms([mtg()], 8, NOW, muted)).toHaveLength(0);
  });

  it('schedules non-muted meetings while skipping muted ones', () => {
    const a = mtg({ id: 'a' });
    const b = mtg({ id: 'b' });
    const muted = new Set(['a']);
    const alarms = computeMeetingAlarms([a, b], 8, NOW, muted);
    expect(alarms).toHaveLength(1);
    expect(alarms[0].dutyId).toBe('meeting:b');
  });
});

describe('meetingToGroundDuty / classifyMeetings', () => {
  it('renders as a meeting card with the subject as the title', () => {
    const g = meetingToGroundDuty(mtg(), DEVICE_TZ);
    expect(g.category).toBe('meeting');
    expect(g.label).toBe('Crew briefing');
    expect(g.code).toBe('MEETING');
    expect(g.localStart).toBe('2026-06-10 09:00'); // Bangkok wall clock (device = Bangkok)
  });

  it('shows times in device timezone when traveling (Singapore event, LA device)', () => {
    // 09:00 SGT (+8) = 01:00 UTC = 18:00 PDT on Jun 9
    // 10:00 SGT (+8) = 02:00 UTC = 19:00 PDT on Jun 9
    const sgMtg = mtg({
      startISO: '2026-06-10T09:00:00+08:00',
      endISO: '2026-06-10T10:00:00+08:00',
      timeZone: 'Asia/Singapore',
    });
    const g = meetingToGroundDuty(sgMtg, 'America/Los_Angeles');
    expect(g.localStart).toBe('2026-06-09 18:00');
    expect(g.localEnd).toBe('2026-06-09 19:00');
  });

  it('splits upcoming vs past by end time', () => {
    const upcoming = mtg({ id: 'u' });
    const past = mtg({ id: 'p', startISO: '2026-05-01T09:00:00+07:00', endISO: '2026-05-01T10:00:00+07:00' });
    const { upcoming: up, past: pa } = classifyMeetings([upcoming, past], NOW, DEVICE_TZ);
    expect(up.map(g => g.id)).toEqual(['meeting:u']);
    expect(pa.map(g => g.id)).toEqual(['meeting:p']);
  });

  it('excludes cancelled meetings from both upcoming and past lists', () => {
    const active = mtg({ id: 'active' });
    const cancelled = mtg({ id: 'cancelled', cancelled: true });
    const { upcoming, past } = classifyMeetings([active, cancelled], NOW, DEVICE_TZ);
    expect(upcoming.map(g => g.id)).toEqual(['meeting:active']);
    expect(past).toHaveLength(0);
  });

  it('excludes all-day events from both upcoming and past lists', () => {
    const timed = mtg({ id: 'timed' });
    const allDay = mtg({ id: 'allday', allDay: true });
    const pastAllDay = mtg({ id: 'past-allday', allDay: true, startISO: '2026-05-01T00:00:00Z', endISO: '2026-05-01T23:59:59Z' });
    const { upcoming, past } = classifyMeetings([timed, allDay, pastAllDay], NOW, DEVICE_TZ);
    expect(upcoming.map(g => g.id)).toEqual(['meeting:timed']);
    expect(past).toHaveLength(0);
  });
});

describe('nextImminentMeeting (Dynamic Island countdown window)', () => {
  // Island default is 5 minutes before start.
  const now = new Date('2026-06-10T01:55:00Z'); // 08:55 Bangkok — 5 min before 09:00
  const soon = mtg({ id: 'soon' }); // starts 09:00 Bangkok = 02:00Z

  it('returns a meeting once it is within the lead window', () => {
    expect(DEFAULT_ISLAND_MINUTES).toBe(5);
    const m = nextImminentMeeting([soon], DEFAULT_ISLAND_MINUTES, now);
    expect(m?.id).toBe('soon');
  });

  it('returns null when the meeting is still beyond the lead window', () => {
    const early = new Date('2026-06-10T01:50:00Z'); // 08:50 — 10 min out, lead 5
    expect(nextImminentMeeting([soon], DEFAULT_ISLAND_MINUTES, early)).toBeNull();
  });

  it('ignores meetings that have already started', () => {
    const after = new Date('2026-06-10T02:01:00Z');
    expect(nextImminentMeeting([soon], DEFAULT_ISLAND_MINUTES, after)).toBeNull();
  });

  it('picks the soonest when several are imminent', () => {
    const sooner = mtg({ id: 'sooner', startISO: '2026-06-10T08:58:00+07:00' });
    const m = nextImminentMeeting([soon, sooner], 10, now);
    expect(m?.id).toBe('sooner');
  });

  it('ignores cancelled meetings — no Dynamic Island countdown', () => {
    const cancelled = mtg({ id: 'cancelled', cancelled: true });
    expect(nextImminentMeeting([cancelled], DEFAULT_ISLAND_MINUTES, now)).toBeNull();
  });
});

describe('meetingJoinUrl (Teams / video join shortcut)', () => {
  const TEAMS = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc123/0?context=%7b%7d';

  it('detects a Teams link in the url field', () => {
    expect(meetingJoinUrl(mtg({ url: TEAMS }))).toBe(TEAMS);
  });

  it('detects a Teams link buried in the notes body', () => {
    const notes = `Hi team,\n\nJoin the meeting here: ${TEAMS} \n\nThanks.`;
    expect(meetingJoinUrl(mtg({ notes }))).toBe(TEAMS);
  });

  it('detects Zoom and Google Meet links', () => {
    expect(meetingJoinUrl(mtg({ url: 'https://us02web.zoom.us/j/8412345678' }))).toContain('zoom.us/j/');
    expect(meetingJoinUrl(mtg({ location: 'https://meet.google.com/abc-defg-hij' }))).toContain('meet.google.com');
  });

  it('returns null for an in-person meeting with no link', () => {
    expect(meetingJoinUrl(mtg({ location: 'Room 4B, Crew Office' }))).toBeNull();
  });

  it('exposes the join link on the meeting card', () => {
    const g = meetingToGroundDuty(mtg({ url: TEAMS }), DEVICE_TZ);
    expect(g.joinUrl).toBe(TEAMS);
    expect(meetingToGroundDuty(mtg(), DEVICE_TZ).joinUrl).toBeUndefined();
  });
});

describe('meetingAlarmHhmm (alarm time for UI display)', () => {
  it('returns HH:MM of the alarm fire time in the device timezone', () => {
    // 09:00 Bangkok − 8 min = 08:52; device is Bangkok
    expect(meetingAlarmHhmm(mtg(), DEFAULT_MEETING_MINUTES, DEVICE_TZ)).toBe('08:52');
  });

  it('honours a custom lead time', () => {
    expect(meetingAlarmHhmm(mtg(), 30, DEVICE_TZ)).toBe('08:30');
  });

  it('shows alarm in device timezone when traveling (Bangkok event, LA device)', () => {
    // 09:00 Bangkok (= 02:00 UTC), 8 min before = 01:52 UTC.
    // PDT (UTC-7): 01:52 UTC = 18:52 PDT on the previous day.
    expect(meetingAlarmHhmm(mtg(), DEFAULT_MEETING_MINUTES, 'America/Los_Angeles')).toBe('18:52');
  });

  it('returns null for all-day meetings', () => {
    expect(meetingAlarmHhmm(mtg({ allDay: true }), 8, DEVICE_TZ)).toBeNull();
  });

  it('returns null for cancelled meetings', () => {
    expect(meetingAlarmHhmm(mtg({ cancelled: true }), 8, DEVICE_TZ)).toBeNull();
  });
});
