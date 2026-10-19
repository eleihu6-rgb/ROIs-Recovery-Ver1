// The device calendar is BOTH the meetings source (Outlook/Exchange invites that
// synced to iOS) and where "add this duty to Calendar" writes. Events the app
// wrote for a duty must remain available to the Finalist-style day planner,
// while carrying an ownership flag that keeps them out of alarm surfaces.
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

describe('fetchMeetings — identifies the app’s own flight entries', () => {
  beforeEach(() => mockGetEvents.mockReset());

  it('keeps every EventKit row and marks the royce:// flight entries', async () => {
    mockGetEvents.mockResolvedValue([
      event({ id: 'mtg-1', title: 'Fleet standardisation briefing' }),
      event({ id: 'flt-1', title: 'Wake Up · TG920', url: 'royce://flight/pair-lhr' }),
      event({ id: 'flt-2', title: 'TG920 · BKK → LHR', url: 'royce://flight/pair-lhr' }),
    ]);

    const meetings = await fetchMeetings(30, new Date('2026-09-12T09:00:00Z'));

    expect(meetings.map(m => [m.id, m.appOwned])).toEqual([
      ['mtg-1', false],
      ['flt-1', true],
      ['flt-2', true],
    ]);
  });

  it('still reads an event that merely has no URL', async () => {
    mockGetEvents.mockResolvedValue([event({ id: 'mtg-2', url: '' })]);
    expect((await fetchMeetings()).map(m => m.id)).toEqual(['mtg-2']);
  });

  it('reads 45 days of history so a past day can still mirror iOS Calendar', async () => {
    mockGetEvents.mockResolvedValue([]);
    await fetchMeetings(30, new Date('2026-10-18T00:00:00Z'));
    expect(mockGetEvents).toHaveBeenCalledWith(
      '2026-09-03T00:00:00Z',
      '2026-11-17T00:00:00Z',
    );
  });
});
