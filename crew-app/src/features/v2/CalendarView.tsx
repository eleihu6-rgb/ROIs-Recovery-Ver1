// Schedule tab ▸ Roster view ▸ Calendar (mock Ver11).
//
// Two modes of one view, both fed by the SAME month model as the Timeline list:
//   • compact — month grid (plane glyph on a flying day, dot on any other
//     published duty) with an agenda underneath. Tapping a day scopes the agenda
//     to it; tapping the selected day again clears back to the whole month.
//   • detail  — the selected day as an hour timeline: the report→release duty
//     block, ground duties and synced calendar events, positioned by their real
//     start/end. A duty that starts before 06:00 or runs past midnight extends
//     the axis instead of being clipped.
import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Icon } from '../../components/v2/icons';
import type { CarrierPalette } from '../../theme/carrier';
import { MON, type DayModel, type MonthModel } from './model';
import {
  agendaRows,
  calendarWeeks,
  dayTimeline,
  timelineBlockLabel,
  timelineHourLabel,
  timelineOffset,
  WEEKDAY_INITIALS,
  type AgendaRow,
  type TimelineBlock,
} from './schedView';
import type { MeetingActions } from './MeetingCard';

/** Inner surface (icon disc, chips) — matches the duty cards' translucent inset. */
const CARD_INSET = 'rgba(255,255,255,0.72)';
const ROW_HOURS = 44;

export interface CalendarViewProps {
  month: MonthModel;
  mode: 'calendar-compact' | 'calendar-detail';
  palette: CarrierPalette;
  selectedDay: number | null;
  onSelectDay: (day: number | null) => void;
  onOpenDetail: (day: number) => void;
  onBackToCompact: () => void;
  actions: MeetingActions;
}

export function CalendarView({
  month,
  mode,
  palette: p,
  selectedDay,
  onSelectDay,
  onOpenDetail,
  onBackToCompact,
  actions,
}: CalendarViewProps): React.JSX.Element {
  return mode === 'calendar-compact' ? (
    <CompactMonth
      month={month}
      palette={p}
      selectedDay={selectedDay}
      onSelectDay={onSelectDay}
      onOpenDetail={onOpenDetail}
      actions={actions}
    />
  ) : (
    <DayTimeline
      month={month}
      palette={p}
      selectedDay={selectedDay}
      onSelectDay={onSelectDay}
      onBackToCompact={onBackToCompact}
      actions={actions}
    />
  );
}

function CompactMonth({
  month,
  palette: p,
  selectedDay,
  onSelectDay,
  onOpenDetail,
  actions,
}: Omit<CalendarViewProps, 'mode' | 'onBackToCompact'>): React.JSX.Element {
  const weeks = calendarWeeks(month);
  const rows = agendaRows(month, selectedDay);
  const day = selectedDay == null ? null : month.days.find(d => d.day === selectedDay) ?? null;
  const dayHead = day ? `${day.dow.toUpperCase()} ${day.day} ${MON[month.monthIdx].toUpperCase()}` : 'MONTH';

  return (
    <ScrollView contentContainerStyle={s.wrap} showsVerticalScrollIndicator={false} testID="cal-compact">
      <View style={s.modeRow}>
        <Text style={[s.modeTitle, { color: p.inkSoft }]}>Month</Text>
        {/* Companion toggle: month grid ⇄ day timeline (an icon, not a 3rd menu row). */}
        <Pressable onPress={() => onOpenDetail(selectedDay ?? month.focusIndex + 1)} testID="cal-to-detail" style={s.iconBtn} accessibilityLabel="Switch to day timeline">
          <Icon name="clock" size={22} color={p.ink} strokeWidth={1.8} />
        </Pressable>
      </View>

      <View style={[s.grid, { backgroundColor: p.card, borderColor: p.cardLine }]} testID="cal-grid">
        {WEEKDAY_INITIALS.map((d, i) => (
          <Text key={`dow-${i}`} style={[s.dow, { color: p.cardSoft }]}>
            {d}
          </Text>
        ))}
        {weeks.map((week, wi) =>
          week.map((cell, ci) => {
            if (!cell) return <View key={`e-${wi}-${ci}`} style={s.cell} />;
            const on = cell.day === selectedDay;
            return (
              <Pressable
                key={cell.key}
                testID={`cal-day-${cell.day}`}
                onPress={() => onSelectDay(cell.day === selectedDay ? null : cell.day)}
                style={[s.cell, on ? { backgroundColor: p.btn } : null]}
                accessibilityLabel={`${cell.day} ${MON[month.monthIdx]}${cell.isFlight ? ', flight duty' : cell.hasContent ? ', duty' : ''}`}
              >
                <Text style={[s.cellDay, { color: on ? '#fff' : p.cardInk }, cell.isToday && s.today]}>{cell.day}</Text>
                {/* One glyph says what the day is: the mock's outline plane =
                    flight duty, dot = any other published duty, nothing =
                    nothing published. */}
                <View style={s.dotSlot}>
                  {cell.isFlight ? (
                    <Icon name="plane" size={14} color={on ? '#fff' : p.btn} />
                  ) : cell.hasContent ? (
                    <View style={[s.dot, { backgroundColor: on ? '#fff' : p.btn }]} />
                  ) : null}
                </View>
              </Pressable>
            );
          }),
        )}
      </View>

      <Text style={[s.listHead, { color: p.inkSoft }]} testID="cal-agenda-head">
        {dayHead}
      </Text>
      {rows.length === 0 ? (
        <Text style={[s.empty, { color: p.inkSoft }]}>
          {selectedDay == null ? 'Nothing published this month' : 'Nothing on this day'}
        </Text>
      ) : (
        rows.map(row => (
          <AgendaCard key={row.id} row={row} palette={p} onPress={() => onOpenDetail(row.day)} actions={actions} meeting={meetingById(month, row.id)} />
        ))
      )}
    </ScrollView>
  );
}

function AgendaCard({
  row,
  palette: p,
  onPress,
  actions,
  meeting,
}: {
  row: AgendaRow;
  palette: CarrierPalette;
  onPress: () => void;
  actions: MeetingActions;
  meeting: DayModel['meetings'][number] | null;
}): React.JSX.Element {
  const isMeeting = row.icon === 'cal';
  return (
    <Pressable
      onPress={onPress}
      testID={isMeeting ? `cal-meeting-${meeting?.id ?? row.id}` : `cal-row-${row.id}`}
      style={[s.row, { backgroundColor: p.card, borderColor: p.cardLine }]}
    >
      <View style={[s.rowIcon, { backgroundColor: CARD_INSET }]}>
        <Icon name={row.icon} size={18} color={p.btn} />
      </View>
      <View style={s.rowBody}>
        <Text style={[s.rowTitle, { color: p.cardInk }]} numberOfLines={1}>
          {row.title}
        </Text>
        {!!row.sub && (
          <Text style={[s.rowSub, { color: p.cardSoft }]} numberOfLines={1}>
            {row.sub}
          </Text>
        )}
        {/* The online-meeting Join link and the silencable alarm are part of the
            event row here too — same two features the Timeline cards carry. */}
        {isMeeting && meeting ? (
          <View style={s.rowActions}>
            {meeting.joinUrl ? (
              <Pressable onPress={() => actions.onJoin(meeting)} testID="cal-meeting-join" accessibilityLabel="Join meeting" style={[s.join, { backgroundColor: p.btn }]}>
                <Icon name="cam" size={14} color="#fff" />
                <Text style={s.joinText}>Join</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => actions.onToggleAlarm(meeting)}
              testID="cal-meeting-alarm"
              accessibilityLabel={meeting.muted ? 'Alarm off' : `Alarm ${meeting.alarmHhmm}`}
              style={[s.alarmChip, { borderColor: meeting.muted ? p.cardLine : p.btn }]}
            >
              <Icon name={meeting.muted ? 'alarm' : 'bell'} size={14} color={meeting.muted ? p.cardSoft : p.btn} />
              <Text style={[s.alarmText, { color: meeting.muted ? p.cardSoft : p.btn }]}>
                {meeting.muted ? 'Alarm off' : meeting.alarmHhmm}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      <Text style={[s.rowTime, { color: p.cardSoft }]}>{row.time}</Text>
    </Pressable>
  );
}

/** The DayMeeting behind an agenda/timeline id ("meet-<id>"), if any. */
function meetingById(month: MonthModel, rowId: string): DayModel['meetings'][number] | null {
  if (!rowId.startsWith('meet-')) return null;
  const id = rowId.slice('meet-'.length);
  for (const d of month.days) {
    const m = d.meetings.find(x => x.id === id);
    if (m) return m;
  }
  return null;
}

function DayTimeline({
  month,
  palette: p,
  selectedDay,
  onSelectDay,
  onBackToCompact,
  actions,
}: Omit<CalendarViewProps, 'mode' | 'onOpenDetail'>): React.JSX.Element {
  const dayIdx = Math.max(0, month.days.findIndex(d => d.day === selectedDay));
  const day = month.days[dayIdx] ?? month.days[0];
  const timeline = dayTimeline(day);
  const hours = Math.max(1, timeline.endHour - timeline.startHour);
  const height = hours * ROW_HOURS;
  // A whole-day duty (day off, leave, layover) is not a block on an hour axis —
  // it gets a chip above the grid, and a day with nothing timed skips the grid.
  const allDayBlocks = timeline.blocks.filter(b => b.allDay);
  const timedBlocks = timeline.blocks.filter(b => !b.allDay);
  // Sunday-first week around the selected day, clamped to the month.
  const dow = new Date(month.year, month.monthIdx, day.day).getDay();
  const weekStart = day.day - dow;

  return (
    <ScrollView contentContainerStyle={s.wrap} showsVerticalScrollIndicator={false} testID="cal-detail">
      <View style={s.modeRow}>
        <Pressable onPress={onBackToCompact} testID="cal-to-compact" style={s.iconBtn} accessibilityLabel="Back to month grid">
          <Icon name="back" size={24} color={p.ink} strokeWidth={1.8} />
        </Pressable>
        <View style={s.week}>
          {WEEKDAY_INITIALS.map((initial, i) => {
            const d = weekStart + i;
            const inMonth = d >= 1 && d <= month.days.length;
            const on = inMonth && d === day.day;
            return (
              <Pressable
                key={`wd-${i}`}
                disabled={!inMonth}
                onPress={() => onSelectDay(d)}
                testID={inMonth ? `cal-week-${d}` : undefined}
                style={[s.weekDay, on ? { backgroundColor: p.btn } : null]}
              >
                <Text style={[s.weekInitial, { color: on ? '#fff' : p.inkSoft }]}>{initial}</Text>
                <Text style={[s.weekNum, { color: on ? '#fff' : p.ink }]}>{inMonth ? d : ''}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={s.iconBtn} />
      </View>

      <Text style={[s.modeTitle, { color: p.inkSoft, marginTop: 2 }]}>
        {`${day.dow.toUpperCase()} ${day.day} ${MON[month.monthIdx].toUpperCase()}${day.isToday ? ' · TODAY' : ''}`}
      </Text>

      {allDayBlocks.length > 0 ? (
        <View style={s.allDayRow}>
          {allDayBlocks.map(b => (
            <View key={b.id} testID={`cal-allday-${b.id}`} style={[s.allDayChip, { backgroundColor: CARD_INSET }]}>
              <Icon name={b.kind === 'layover' ? 'bed' : 'house'} size={16} color={p.btn} />
              <Text style={[s.allDayText, { color: p.cardInk }]} numberOfLines={1}>
                {`${b.title}${b.sub ? ` · ${b.sub}` : ''} · all day`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {/* A day with no timed event (a rest day, an all-day duty) gets the answer
          in words instead of an empty 18-hour grid. */}
      {timedBlocks.length === 0 ? (
        <Text style={[s.empty, { color: p.inkSoft }]}>
          {allDayBlocks.length > 0 ? 'No timed events on this day' : 'Nothing published on this day'}
        </Text>
      ) : (
        <View style={[s.timeline, { backgroundColor: p.card, borderColor: p.cardLine, height }]} testID="cal-timeline">
          {Array.from({ length: hours }, (_, i) => {
            const hour = timeline.startHour + i;
            return (
              <View key={hour} style={[s.hour, { height: ROW_HOURS }]}>
                <Text style={[s.hourLbl, { color: p.cardSoft }]}>{timelineHourLabel(hour)}</Text>
                <View style={[s.hourLine, { borderTopColor: p.cardLine }]} />
              </View>
            );
          })}
          <View style={s.blockLayer} pointerEvents="box-none">
            {timedBlocks.map(b => (
              <TimelineBlockView key={b.id} block={b} palette={p} startHour={timeline.startHour} endHour={timeline.endHour} actions={actions} meeting={b.kind === 'meeting' ? meetingById(month, b.id) : null} />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function TimelineBlockView({
  block,
  palette: p,
  startHour,
  endHour,
  actions,
  meeting,
}: {
  block: TimelineBlock;
  palette: CarrierPalette;
  startHour: number;
  endHour: number;
  actions: MeetingActions;
  meeting: DayModel['meetings'][number] | null;
}): React.JSX.Element {
  const top = timelineOffset(block.startMin, startHour, endHour) * (endHour - startHour) * ROW_HOURS;
  const raw = timelineOffset(block.endMin, startHour, endHour) * (endHour - startHour) * ROW_HOURS;
  const height = Math.max(24, raw - top);
  // Duty/ground blocks carry the crew's own colour, meetings stay light so the
  // two never read as the same kind of event (mock `.cdEvent.duty` / `.meet`).
  const filled = block.kind === 'duty' || block.kind === 'ground';
  const background = filled ? p.btn : block.kind === 'meeting' ? 'rgba(255,255,255,0.92)' : p.frost;
  const ink = filled ? '#fff' : p.cardInk;
  const label = timelineBlockLabel(block);

  const body = (
    <>
      <Text style={[s.blockTime, { color: ink }]}>{label}</Text>
      <Text style={[s.blockTitle, { color: ink }]} numberOfLines={2}>
        {block.title}
        {block.sub ? ` · ${block.sub}` : ''}
      </Text>
    </>
  );

  if (block.kind === 'meeting' && meeting) {
    return (
      <Pressable
        testID={`cal-block-${block.id}`}
        onPress={() => (meeting.joinUrl ? actions.onJoin(meeting) : actions.onToggleAlarm(meeting))}
        accessibilityLabel={meeting.joinUrl ? `Join ${meeting.title}` : `Alarm ${meeting.alarmHhmm}`}
        style={[s.block, { top, height, backgroundColor: background, borderLeftColor: ink }]}
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View
      testID={`cal-block-${block.id}`}
      style={[s.block, { top, height, backgroundColor: background, borderLeftColor: filled ? '#fff' : p.cardSoft }]}
    >
      {body}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 22, paddingTop: 4, paddingBottom: 130, gap: 10 },
  modeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.7 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 16, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 6 },
  dow: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, fontWeight: '700', paddingBottom: 6 },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 6, borderRadius: 12 },
  cellDay: { fontSize: 14, fontWeight: '600' },
  today: { textDecorationLine: 'underline' },
  dotSlot: { height: 14, justifyContent: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3 },
  listHead: { fontSize: 12, fontWeight: '700', letterSpacing: 0.7, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 10 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 2 },
  rowTime: { fontSize: 11, fontWeight: '700' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  join: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  joinText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  alarmChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  alarmText: { fontSize: 11, fontWeight: '600' },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 22 },
  week: { flex: 1, flexDirection: 'row', gap: 4 },
  weekDay: { flex: 1, alignItems: 'center', paddingVertical: 4, borderRadius: 10 },
  weekInitial: { fontSize: 10 },
  weekNum: { fontSize: 13, fontWeight: '600' },
  timeline: { position: 'relative', borderRadius: 16, borderWidth: 1, paddingLeft: 52, paddingRight: 8, overflow: 'hidden' },
  hour: { position: 'relative' },
  hourLbl: { position: 'absolute', left: -44, top: 2, width: 38, textAlign: 'right', fontSize: 10 },
  hourLine: { position: 'absolute', left: -6, right: 0, top: 0, borderTopWidth: 1, opacity: 0.5 },
  blockLayer: { position: 'absolute', left: 52, right: 8, top: 0, bottom: 0 },
  block: { position: 'absolute', left: 0, right: 0, borderRadius: 10, borderLeftWidth: 3, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  blockTime: { fontSize: 10, fontWeight: '700' },
  blockTitle: { fontSize: 12, fontWeight: '600' },
  allDayRow: { gap: 8 },
  allDayChip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  allDayText: { fontSize: 13, fontWeight: '600', flex: 1 },
});
