import { store } from '../../src/store';
import { setTrips } from '../../src/features/travel/tripsSlice';
import { setDuties } from '../../src/features/roster/dutiesSlice';
import { setMeetings } from '../../src/features/meetings/meetingsSlice';
import { logout } from '../../src/features/auth/authSlice';
import type { Meeting } from '../../src/features/meetings/meetingSetup';

// ─── Logout removes CREW-PORTAL data only, keeps CALENDAR meetings ────────────
// Trips + ground duties come from the crew portal (the logged-in crew's roster);
// calendar meetings come from the DEVICE (Outlook/Exchange synced to iOS), so a
// logout must NOT delete them — a different login doesn't own your personal
// meetings. The two sources live in separate Redux slices, which is exactly what
// makes "remove portal data, keep meetings" possible.

const PORTAL_TRIP = {
  id: 'trip-1',
  crewId: '42596',
  checkInDateUTC: '10 Jun 2026 0700',
  legs: [
    {
      crewId: '42596',
      fltNumber: 'TG100',
      flightDateUTC: '10 Jun 2026 0900',
      depArp: 'BKK',
      arvDateUTC: '10 Jun 2026 1100',
      arvArp: 'HKG',
      fleet: '359',
      hotel: '',
      assignment: 'FLY',
    },
  ],
} as any;

const PORTAL_DUTY = {
  id: 'duty-1',
  assignment: 'MEETING',
  fltNum: '',
  dutyType: '',
  localStart: '2026-06-09 10:00',
  localEnd: '2026-06-09 11:00',
  startUTC: '2026-06-09 10:00',
  endUTC: '2026-06-09 11:00',
  briefStart: '',
  crewId: '42596',
  raw: {},
} as any;

const CALENDAR_MEETING: Meeting = {
  id: 'evt-1',
  title: 'Crew briefing',
  startISO: '2026-06-10T09:00:00+07:00',
  endISO: '2026-06-10T10:00:00+07:00',
  timeZone: 'Asia/Bangkok',
  calendarTitle: 'Work',
  allDay: false,
};

describe('logout', () => {
  it('clears portal trips + duties but keeps calendar meetings', async () => {
    store.dispatch(setTrips([PORTAL_TRIP]));
    store.dispatch(setDuties([PORTAL_DUTY]));
    store.dispatch(setMeetings([CALENDAR_MEETING]));

    // Sanity: everything is present before logout.
    expect(store.getState().trips.trips).toHaveLength(1);
    expect(store.getState().duties.duties).toHaveLength(1);
    expect(store.getState().meetings.meetings).toHaveLength(1);

    await store.dispatch(logout() as any);

    // Crew-portal data wiped…
    expect(store.getState().trips.trips).toHaveLength(0);
    expect(store.getState().duties.duties).toHaveLength(0);
    // …calendar meetings (and the reminder config) survive untouched.
    expect(store.getState().meetings.meetings).toEqual([CALENDAR_MEETING]);
    expect(store.getState().meetings.minutesBefore).toBe(8);
  });
});
