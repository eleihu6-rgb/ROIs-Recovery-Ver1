// Schedule tab · iOS-calendar events.
//
// Covers Ryan's three review points:
//   a. a meeting on a FLYING day gets its own card above the flight card, while a
//      meeting on a day off / standby stays inside that day's card;
//   b. the online-meeting Join link is back (Teams / Zoom / Meet / Webex);
//   c. the per-meeting reminder is back and can be silenced by tapping it.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { Linking, StyleSheet } from 'react-native';

import settingsReducer from '../../src/features/settings/settingsSlice';
import meetingsReducer, { setMeetings, toggleMeetingMute } from '../../src/features/meetings/meetingsSlice';
import tripsReducer from '../../src/features/travel/tripsSlice';
import dutiesReducer, { setDuties } from '../../src/features/roster/dutiesSlice';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import notificationsReducer from '../../src/features/notifications/notificationsSlice';
import flightCalendarReducer from '../../src/features/calendar/flightCalendarSlice';
import { ScheduleScreen } from '../../src/features/v2/ScheduleScreen';
import { MeetingCard, MeetingRow } from '../../src/features/v2/MeetingCard';
import { buildMonth, type DayMeeting } from '../../src/features/v2/model';
import { PALETTES } from '../../src/theme/carrier';
import type { Meeting } from '../../src/features/meetings/meetingSetup';
import type { Trip } from '../../src/features/travel/tripCsv';
import type { PortalDuty } from '../../src/features/travel/portalCapture';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// buildMonth reads the phone zone for meetings now; pin it so a test machine in
// another timezone cannot change what the card shows.
jest.mock('../../src/features/settings/timeFormat', () => {
  const actual = jest.requireActual('../../src/features/settings/timeFormat');
  return { ...actual, deviceTimeZone: () => 'America/Vancouver' };
});

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

const TEAMS_URL = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%22Tid%22%3a%22x%22%7d';

/** A flight day (10 Sep 2026) plus a meeting the same morning, and a day off with
 *  a meeting of its own — the two shapes the review asked about. */
const FLIGHT_TRIP: Trip = {
  id: 'j4002-10sep',
  crewId: 'J4002',
  checkInDateUTC: '2026-09-10 05:00',
  layoverHours: 0,
  legs: [{
    crewId: 'J4002',
    fltNumber: 'ET805',
    flightDateUTC: '10 Sep 2026 0700',
    depArp: 'ADD',
    arvDateUTC: '10 Sep 2026 1130',
    arvArp: 'ZRH',
    fleet: '7M8',
    hotel: '',
    localDepTime: '2026-09-10 07:00',
    localArvTime: '2026-09-10 11:30',
    assignment: 'FLY',
  }],
};

function meeting(over: Partial<Meeting> & { id: string; startISO: string }): Meeting {
  return {
    title: 'Fleet standardisation briefing',
    endISO: over.startISO,
    timeZone: 'Africa/Addis_Ababa',
    calendarTitle: 'Ethiopian Exchange',
    allDay: false,
    ...over,
  };
}

const BRIEFING = meeting({
  id: 'ev-briefing',
  startISO: '2026-09-10T10:30:00+03:00',
  location: 'Ops Centre · Room 3B',
  url: TEAMS_URL,
});
const DENTIST = meeting({
  id: 'ev-dentist',
  startISO: '2026-09-11T15:00:00+03:00',
  title: 'Dentist',
  calendarTitle: 'Personal',
  location: 'Silom clinic',
});

function makeStore() {
  return configureStore({
    reducer: {
      auth: (state = { airline: 'ET', mode: 'guest' as const }) => state,
      settings: settingsReducer,
      meetings: meetingsReducer,
      trips: tripsReducer,
      duties: dutiesReducer,
      alarms: alarmsReducer,
      notifications: notificationsReducer,
      flightCalendar: flightCalendarReducer,
    },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
  });
}

describe('Schedule meetings — model', () => {
  const now = new Date('2026-09-09T00:00:00Z');

  it('put a meeting on the flying day and on the day off', () => {
    const month = buildMonth(
      2026, 8, [FLIGHT_TRIP], [], [BRIEFING, DENTIST], 'airport', 'Africa/Addis_Ababa', {}, now,
      { minutesBefore: 8, mutedIds: [], deviceTz: 'Africa/Addis_Ababa' },
    );
    const flying = month.days.find(d => d.day === 10)!;
    const off = month.days.find(d => d.day === 11)!;

    expect(flying.kind).toBe('flight');
    expect(flying.meetings).toHaveLength(1);
    expect(flying.meetings[0].where).toBe('Ops Centre · Room 3B');
    expect(off.kind).toBe('off');
    expect(off.meetings).toHaveLength(1);
    expect(off.meetings[0].where).toBe('Silom clinic');
  });

  it('carries the join link and the reminder time (start − minutesBefore)', () => {
    const month = buildMonth(
      2026, 8, [FLIGHT_TRIP], [], [BRIEFING], 'airport', 'Africa/Addis_Ababa', {}, now,
      { minutesBefore: 8, mutedIds: [], deviceTz: 'Africa/Addis_Ababa' },
    );
    const briefing = month.days.find(d => d.day === 10)!.meetings[0];

    expect(briefing.hhmm).toBe('10:30');
    expect(briefing.joinUrl).toBe(TEAMS_URL);
    expect(briefing.alarmHhmm).toBe('10:22');
    expect(briefing.muted).toBe(false);
  });

  it('shows no join link for a room meeting, and marks a silenced one as muted', () => {
    const month = buildMonth(
      2026, 8, [], [], [DENTIST], 'airport', 'Africa/Addis_Ababa', {}, now,
      { minutesBefore: 15, mutedIds: ['ev-dentist'], deviceTz: 'Africa/Addis_Ababa' },
    );
    const dentist = month.days.find(d => d.day === 11)!.meetings[0];

    expect(dentist.joinUrl).toBeNull();
    expect(dentist.alarmHhmm).toBe('14:45');
    expect(dentist.muted).toBe(true);
  });

  // Ryan, 2026-09-12: an Outlook invite synced to iOS Calendar showed 19:00 in
  // Calendar (Vancouver phone) but 02:00 on the Schedule card, because EventKit
  // carried the event's GMT zone and the card followed it. Meetings must read
  // on the phone clock — same as iOS Calendar — regardless of the app's duty
  // Time-Zone display setting.
  it('renders a GMT/UTC event on the phone clock, not the event clock', () => {
    const gmtCall = meeting({
      id: 'ev-sia-cps',
      title: 'SIA-CPS Technical call',
      startISO: '2026-09-14T02:00:00Z',
      endISO: '2026-09-14T03:00:00Z',
      timeZone: 'GMT',
    });
    const month = buildMonth(
      2026, 8, [], [], [gmtCall], 'airport', 'Asia/Bangkok', {},
      new Date('2026-09-12T17:00:00-07:00'),
      { minutesBefore: 8, mutedIds: [], deviceTz: 'America/Vancouver' },
    );

    const day = month.days.find(d => d.day === 13)!;
    expect(day.meetings).toHaveLength(1);
    expect(day.meetings[0].hhmm).toBe('19:00');
    expect(day.meetings[0].endHhmm).toBe('20:00');
    expect(day.meetings[0].alarmHhmm).toBe('18:52');
  });
});

describe('Schedule meetings — cards', () => {
  const p = PALETTES.emerald;
  const noop = { onJoin: jest.fn(), onToggleAlarm: jest.fn() };

  it('renders the meeting card with Join + Alarm chips for an online meeting', () => {
    const m: DayMeeting = {
      id: 'ev-briefing',
      title: 'Fleet standardisation briefing',
      where: 'Ethiopian Exchange',
      hhmm: '10:30',
      endMs: Date.parse('2026-09-10T11:15:00+03:00'),
      endHhmm: '11:15',
      startMs: Date.parse('2026-09-10T10:30:00+03:00'),
      joinUrl: TEAMS_URL,
      alarmHhmm: '10:22',
      muted: false,
    };
    const tree = render(
      <MeetingCard head="THU 10 SEP" meetings={[m]} palette={p} {...noop} />,
    );

    expect(tree.getByTestId('meeting-ev-briefing')).toBeTruthy();
    expect(tree.getByText('Alarm 10:22')).toBeTruthy();

    fireEvent.press(tree.getByTestId('meeting-join'));
    expect(noop.onJoin).toHaveBeenCalledWith(m);

    fireEvent.press(tree.getByTestId('meeting-alarm'));
    expect(noop.onToggleAlarm).toHaveBeenCalledWith(m);
  });

  it('shows "Alarm off" and no Join button once the crew silenced the meeting', () => {
    const m: DayMeeting = {
      id: 'ev-dentist',
      title: 'Dentist',
      where: 'Personal',
      hhmm: '15:00',
      endMs: Date.parse('2026-09-11T15:30:00+03:00'),
      endHhmm: '15:30',
      startMs: Date.parse('2026-09-11T15:00:00+03:00'),
      joinUrl: null,
      alarmHhmm: '14:45',
      muted: true,
    };
    const tree = render(<MeetingRow meeting={m} palette={p} {...noop} />);

    expect(tree.getByText('Alarm off')).toBeTruthy();
    expect(tree.queryByTestId('meeting-join')).toBeNull();
  });

  // Regression: the time column was `width: 44` with no numberOfLines/flexShrink,
  // which wrapped bold "HH:MM" onto two lines ("13:0" / "00") next to the title
  // column. RN Testing Library doesn't run real flexbox layout, so this asserts
  // the props/style that keep the text on one line instead of measured pixels.
  it('renders the meeting time on a single line, wide enough for "HH:MM" ("13:00" bug)', () => {
    const m: DayMeeting = {
      id: 'ev-standup',
      title: 'Weekly Alignment call',
      where: 'CPS - Weekly Status call',
      hhmm: '13:00',
      endMs: Date.parse('2026-09-10T13:30:00+03:00'),
      endHhmm: '13:30',
      startMs: Date.parse('2026-09-10T13:00:00+03:00'),
      joinUrl: null,
      alarmHhmm: '12:52',
      muted: false,
    };
    const tree = render(<MeetingRow meeting={m} palette={p} {...noop} />);

    const timeNode = tree.getByText('13:00');
    expect(timeNode.props.numberOfLines).toBe(1);

    const flatStyle = StyleSheet.flatten(timeNode.props.style) as { width?: number; flexShrink?: number };
    // "13:00"/"06:00" at this fontSize+weight needs more than the old 44px box.
    expect(flatStyle.width).toBeGreaterThanOrEqual(48);
    expect(flatStyle.flexShrink).toBe(0);
  });
});

describe('Schedule meetings — actions', () => {
  it('opens the join link and toggles the reminder in the store', async () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    const store = makeStore();
    const m: DayMeeting = {
      id: 'ev-briefing',
      title: 'Fleet standardisation briefing',
      where: 'Ethiopian Exchange',
      hhmm: '10:30',
      endMs: Date.parse('2026-09-10T11:15:00+03:00'),
      endHhmm: '11:15',
      startMs: Date.parse('2026-09-10T10:30:00+03:00'),
      joinUrl: TEAMS_URL,
      alarmHhmm: '10:22',
      muted: false,
    };
    const onJoin = (meeting: DayMeeting) => {
      if (meeting.joinUrl) {
        Linking.openURL(meeting.joinUrl);
      }
    };
    const onToggleAlarm = (meeting: DayMeeting) => {
      store.dispatch(toggleMeetingMute(meeting.id) as never);
    };

    const tree = render(
      <Provider store={store}>
        <MeetingRow meeting={m} palette={PALETTES.emerald} onJoin={onJoin} onToggleAlarm={onToggleAlarm} />
      </Provider>,
    );

    fireEvent.press(tree.getByTestId('meeting-join'));
    expect(openSpy).toHaveBeenCalledWith(TEAMS_URL);

    await act(async () => {
      fireEvent.press(tree.getByTestId('meeting-alarm'));
    });
    expect(store.getState().meetings.mutedIds).toEqual(['ev-briefing']);
    // Tapping again re-arms it.
    await act(async () => {
      fireEvent.press(tree.getByTestId('meeting-alarm'));
    });
    expect(store.getState().meetings.mutedIds).toEqual([]);

    openSpy.mockRestore();
  });
});

// Ryan, 2026-09-12: guest mode has no roster at all, but a synced calendar
// event on a blank day still rendered a "Day Off" card with the house icon.
// A day off may only come from an explicit roster row the airline published.
describe('Schedule meetings — blank roster days are not days off', () => {
  const guestCall = meeting({
    id: 'ev-sia-cps',
    title: 'SIA-CPS Technical call',
    startISO: '2026-09-14T02:00:00Z',
    endISO: '2026-09-14T03:00:00Z',
    timeZone: 'GMT',
  });

  const dayOffDuty: PortalDuty = {
    id: 'ET:J4002:DO',
    assignment: 'DO',
    fltNum: '',
    dutyType: 'DO',
    localStart: '2026-09-09 00:00',
    localEnd: '2026-09-09 23:59',
    startUTC: '08 Sep 2026 2100',
    endUTC: '09 Sep 2026 2059',
    briefStart: '2026-09-08T21:00:00.000Z',
    crewId: 'J4002',
    carrier: 'ET',
    baseOffsetMin: 0,
    airportCode: 'ADD',
    raw: {},
  };

  it('shows the meeting alone — no Day Off title and no house icon — with no roster duty', () => {
    const store = makeStore();
    store.dispatch(setMeetings([guestCall]));
    const tree = render(
      <Provider store={store}>
        <ScheduleScreen />
      </Provider>,
    );

    expect(tree.getByText('SIA-CPS Technical call')).toBeTruthy();
    expect(tree.getByText('19:00')).toBeTruthy();
    expect(tree.queryByText('Day Off')).toBeNull();
    expect(tree.queryByTestId('day-card-13')).toBeNull();
  });

  it('still shows Day Off when the roster itself published a days-off row', () => {
    const store = makeStore();
    store.dispatch(setMeetings([guestCall]));
    store.dispatch(setDuties([dayOffDuty]));
    const tree = render(
      <Provider store={store}>
        <ScheduleScreen />
      </Provider>,
    );

    expect(tree.getByText('Day Off')).toBeTruthy();
    expect(tree.getByTestId('day-card-9')).toBeTruthy();
  });
});
