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
import meetingsReducer, { toggleMeetingMute } from '../../src/features/meetings/meetingsSlice';
import tripsReducer from '../../src/features/travel/tripsSlice';
import dutiesReducer from '../../src/features/roster/dutiesSlice';
import alarmsReducer from '../../src/features/alarms/alarmsSlice';
import { MeetingCard, MeetingRow } from '../../src/features/v2/MeetingCard';
import { buildMonth, type DayMeeting } from '../../src/features/v2/model';
import { PALETTES } from '../../src/theme/carrier';
import type { Meeting } from '../../src/features/meetings/meetingSetup';
import type { Trip } from '../../src/features/travel/tripCsv';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
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
      auth: (state = { airline: 'ET' }) => state,
      settings: settingsReducer,
      meetings: meetingsReducer,
      trips: tripsReducer,
      duties: dutiesReducer,
      alarms: alarmsReducer,
    },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
  });
}

describe('Schedule meetings — model', () => {
  const now = new Date('2026-09-09T00:00:00Z');

  it('put a meeting on the flying day and on the day off', () => {
    const month = buildMonth(
      2026, 8, [FLIGHT_TRIP], [], [BRIEFING, DENTIST], 'airport', 'Africa/Addis_Ababa', {}, now,
      { minutesBefore: 8, mutedIds: [] },
    );
    const flying = month.days.find(d => d.day === 10)!;
    const off = month.days.find(d => d.day === 11)!;

    expect(flying.kind).toBe('flight');
    expect(flying.meetings).toHaveLength(1);
    expect(off.kind).toBe('off');
    expect(off.meetings).toHaveLength(1);
  });

  it('carries the join link and the reminder time (start − minutesBefore)', () => {
    const month = buildMonth(
      2026, 8, [FLIGHT_TRIP], [], [BRIEFING], 'airport', 'Africa/Addis_Ababa', {}, now,
      { minutesBefore: 8, mutedIds: [] },
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
      { minutesBefore: 15, mutedIds: ['ev-dentist'] },
    );
    const dentist = month.days.find(d => d.day === 11)!.meetings[0];

    expect(dentist.joinUrl).toBeNull();
    expect(dentist.alarmHhmm).toBe('14:45');
    expect(dentist.muted).toBe(true);
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
