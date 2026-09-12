// The device calendar is BOTH the meetings source (Outlook/Exchange invites that
// synced to iOS) and where "add this duty to Calendar" writes. Events the app
// wrote for a duty must never come back as meetings — otherwise every flight
// marker turns into a meeting card and arms a meeting alarm.
import { fetchMeetings } from '../../src/features/meetings/calendarModule';

const mockGetEvents = jest.fn();

jest.mock('react-native', () => ({
  NativeModules: { CalendarModule: { getEvents: (...args: unknown[]) => mockGetEvents(...args) } },
  Platform: { OS: 'ios' },
}));

const event = (over: Record<string, unknown>) => ({
  id: 'ev',
  title: 'Event',
  startISO: '2026-09-19T09:00:00Z',
  endISO: '2026-09-19T10:00:00Z',
  timeZone: 'Asia/Bangkok',
  calendarTitle: 'Exchange',
  allDay: false,
  url: '',
  location: '',
  notes: '',
  ...over,
});

describe('fetchMeetings — skips the app’s own flight entries', () => {
  beforeEach(() => mockGetEvents.mockReset());

  it('keeps a real calendar meeting and drops the royce:// flight entries', async () => {
    mockGetEvents.mockResolvedValue([
      event({ id: 'mtg-1', title: 'Fleet standardisation briefing' }),
      event({ id: 'flt-1', title: 'Wake Up · TG920', url: 'royce://flight/pair-lhr' }),
      event({ id: 'flt-2', title: 'TG920 · BKK → LHR', url: 'royce://flight/pair-lhr' }),
    ]);

    const meetings = await fetchMeetings(30, new Date('2026-09-12T09:00:00Z'));

    expect(meetings.map(m => m.id)).toEqual(['mtg-1']);
  });

  it('still reads an event that merely has no URL', async () => {
    mockGetEvents.mockResolvedValue([event({ id: 'mtg-2', url: '' })]);
    expect((await fetchMeetings()).map(m => m.id)).toEqual(['mtg-2']);
  });
});
