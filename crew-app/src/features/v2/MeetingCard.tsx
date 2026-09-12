// Calendar events on the Schedule tab.
//
// Two shapes, per the sign-off mock (Ver10):
//   • a day that also has a flight duty gets the meeting as its OWN card, above
//     the flight card — a briefing at 10:30 must not read as part of the flight;
//   • a day off / standby / layover keeps the meeting row INSIDE that day's card.
// Each row carries the two features the v2 redesign dropped: the online-meeting
// "Join" link (Teams / Zoom / Meet / Webex) and the reminder the crew can silence
// by tapping it (meetingsSlice.toggleMeetingMute).
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Icon } from '../../components/v2/icons';
import { DashedLine, TicketCard } from '../../components/v2/TicketCard';
import type { CarrierPalette } from '../../theme/carrier';
import type { DayMeeting } from './model';

/** Inner surface of a card — matches the duty cards' translucent inset. */
const CARD_INSET = 'rgba(255,255,255,0.72)';

export interface MeetingActions {
  onJoin: (meeting: DayMeeting) => void;
  onToggleAlarm: (meeting: DayMeeting) => void;
}

/**
 * One calendar event: time · title · calendar, then the actions row.
 * `joinUrl` decides whether a Join button appears; the alarm chip always shows
 * what will ring ("Alarm 10:22") or that the crew silenced it ("Alarm off").
 */
export function MeetingRow({
  meeting,
  palette: p,
  onJoin,
  onToggleAlarm,
}: { meeting: DayMeeting; palette: CarrierPalette } & MeetingActions): React.JSX.Element {
  const hasJoin = !!meeting.joinUrl;
  return (
    <View style={[s.meet, { backgroundColor: CARD_INSET }]} testID={`meeting-${meeting.id}`}>
      <View style={s.head}>
        <Text style={[s.time, { color: p.cardInk }]} numberOfLines={1}>
          {meeting.hhmm}
        </Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: p.cardInk }]} numberOfLines={2}>
            {meeting.title}
          </Text>
          <Text style={[s.where, { color: p.cardSoft }]} numberOfLines={1}>
            {meeting.where}
          </Text>
        </View>
        <Text style={[s.cal, { color: p.cardSoft, borderColor: p.cardLine }]}>iOS CAL</Text>
      </View>
      <View style={s.actions}>
        {hasJoin ? (
          <Pressable
            onPress={() => onJoin(meeting)}
            testID="meeting-join"
            // Label = the visible button text, context goes in the hint, so the
            // spoken label and the on-screen label never disagree.
            accessibilityLabel="Join meeting"
            accessibilityHint={meeting.title}
            style={[s.join, { backgroundColor: p.btn }]}
          >
            <Icon name="cam" size={16} color="#fff" />
            <Text style={s.joinText}>Join</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => onToggleAlarm(meeting)}
          testID="meeting-alarm"
          accessibilityLabel={meeting.muted ? 'Alarm off' : `Alarm ${meeting.alarmHhmm}`}
          accessibilityHint={
            meeting.muted ? 'Turns this meeting reminder back on' : 'Turns this meeting reminder off'
          }
          style={[
            s.alarm,
            {
              borderColor: meeting.muted ? p.cardLine : p.btn,
              opacity: meeting.muted ? 0.75 : 1,
            },
          ]}
        >
          <Icon name={meeting.muted ? 'alarm' : 'bell'} size={15} color={meeting.muted ? p.cardSoft : p.btn} />
          <Text style={[s.alarmText, { color: meeting.muted ? p.cardSoft : p.btn }]}>
            {meeting.muted ? 'Alarm off' : `Alarm ${meeting.alarmHhmm}`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * A day with a flight duty AND calendar events: the meeting gets its own card so
 * it never reads as part of the rotation (mock Ver10 `.meetcard`).
 */
export function MeetingCard({
  head,
  meetings,
  palette: p,
  onJoin,
  onToggleAlarm,
}: {
  head: string;
  meetings: DayMeeting[];
  palette: CarrierPalette;
} & MeetingActions): React.JSX.Element {
  return (
    <TicketCard palette={p} testID={`meeting-card-${meetings[0]?.id ?? 'none'}`} style={{ padding: 0, overflow: 'hidden' }}>
      <Text style={[s.dayHead, { color: p.cardSoft }]}>{head}</Text>
      <View style={s.cardBody}>
        {meetings.map((m, i) => (
          <View key={m.id}>
            <MeetingRow meeting={m} palette={p} onJoin={onJoin} onToggleAlarm={onToggleAlarm} />
            {i < meetings.length - 1 ? <DashedLine color={p.cardLine} /> : null}
          </View>
        ))}
      </View>
    </TicketCard>
  );
}

const s = StyleSheet.create({
  dayHead: { fontSize: 12, fontWeight: '600', letterSpacing: 0.7, paddingHorizontal: 18, paddingTop: 14 },
  cardBody: { padding: 12, paddingTop: 8 },
  meet: { flexDirection: 'column', gap: 10, padding: 12, borderRadius: 12, marginTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Fixed enough to fit "HH:MM" at this weight/size without wrapping (was 44,
  // one px short for bold "13:00" — Ryan, 2026-09-12); flexShrink 0 keeps the
  // flex:1 title column from squeezing it further.
  time: { fontSize: 15, fontWeight: '600', width: 50, flexShrink: 0 },
  title: { fontSize: 13, fontWeight: '600' },
  where: { fontSize: 12, marginTop: 2 },
  cal: { fontSize: 10, letterSpacing: 0.8, borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  join: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  joinText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  alarm: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  alarmText: { fontSize: 12, fontWeight: '600' },
});
