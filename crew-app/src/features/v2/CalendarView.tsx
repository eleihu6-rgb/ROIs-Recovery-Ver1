// Schedule tab ▸ Roster view ▸ Calendar (mock Ver11).
//
// Stacked month: simple duty icons with a separate agenda. Month detail: three
// previews per date, plus an overflow count. Date selection opens full details;
// the hourly view remains available without duplicating the agenda beside it.
// All presentations share the Timeline's MonthModel.
import React, { useMemo, useState } from 'react';
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
  timelineLaneLayout,
  timelineOffset,
  WEEKDAY_INITIALS,
  type AgendaRow,
  type TimelineBlock,
  type TimelineLane,
} from './schedView';
import type { MeetingActions } from './MeetingCard';
import { useLayout } from '../../components/v2/useLayout';
import { colors, font, radius, space } from '../../theme';

/** Inner surface (icon disc, chips) — matches the duty cards' translucent inset. */
const CARD_INSET = 'rgba(255,255,255,0.68)';
const ROW_HOURS = 44;
/** One hour of vertical space is the smallest readable meeting block. */
const MEETING_MIN_MINUTES = 60;

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
  const { wide, tall, height } = useLayout();
  // An iPad's calendar is a workspace, not a phone month with a mostly empty
  // selected-day pane. Keep the Duo's compact agenda-first wide view, but open
  // the iPad directly on its useful hour axis.
  const tablet = wide && height >= 700;
  const [monthDetail, setMonthDetail] = useState(false);
  const controls = (
    <View style={[s.modeSwitch, { backgroundColor: p.frost, borderColor: p.frostLine }]}>
      {(['stacked', 'month-detail'] as const).map(option => {
        const selected = monthDetail === (option === 'month-detail');
        return (
          <Pressable key={option} testID={`cal-mode-${option}`}
            accessibilityRole="button" accessibilityState={{ selected }}
            onPress={() => setMonthDetail(option === 'month-detail')}
            style={[s.modeChoice, selected && { backgroundColor: p.cardInset }]}>
            <Icon name={option === 'stacked' ? 'list' : 'cal'} size={18} color={selected ? p.btn : p.ink} />
            <Text style={[s.modeChoiceText, { color: selected ? p.cardInk : p.ink }]}>
              {option === 'stacked' ? 'Stacked' : 'Month detail'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
  if (wide && !monthDetail) {
    return (
      <WideCalendar month={month} palette={p} selectedDay={selectedDay}
        onSelectDay={onSelectDay} actions={actions} controls={controls} initialHours={tablet} />
    );
  }
  return mode === 'calendar-compact' ? (
    <CompactMonth month={month} palette={p} selectedDay={selectedDay}
      onSelectDay={onSelectDay} onOpenDetail={onOpenDetail} actions={actions}
      tall={tall || wide} monthDetail={monthDetail} controls={controls} />
  ) : (
    <DayTimeline month={month} palette={p} selectedDay={selectedDay}
      onSelectDay={onSelectDay} onBackToCompact={onBackToCompact} actions={actions} fullDetails={monthDetail} />
  );
}

/** Explicit week rows prevent fractional percentage widths wrapping Saturday. */
function MonthGrid({
  month,
  palette: p,
  selectedDay,
  onSelectDay,
  tall,
  detail = false,
}: {
  month: MonthModel;
  palette: CarrierPalette;
  selectedDay: number | null;
  onSelectDay: (day: number | null) => void;
  tall?: boolean;
  detail?: boolean;
}): React.JSX.Element {
  const weeks = calendarWeeks(month);
  const rowsByDay = useMemo(() => {
    const grouped = new Map<number, AgendaRow[]>();
    for (const row of agendaRows(month, null)) {
      const rows = grouped.get(row.day) ?? [];
      rows.push(row);
      grouped.set(row.day, rows);
    }
    return grouped;
  }, [month]);
  return (
    <View style={[s.grid, { backgroundColor: p.card, borderColor: p.cardLine }]} testID={detail ? "cal-month-detail" : "cal-grid"}>
      <View style={s.gridWeek} testID="cal-weekdays">
      {WEEKDAY_INITIALS.map((d, i) => (
        <Text key={`dow-${i}`} testID={`cal-weekday-${i}`} style={[s.dow, { color: p.cardSoft }]}>
          {d}
        </Text>
      ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={s.gridWeek} testID={`cal-grid-week-${wi}`}>
        {week.map((cell, ci) => {
          if (!cell) return <View key={`e-${wi}-${ci}`} style={[s.cell, detail && s.detailCell, { borderTopColor: p.cardLine }]} />;
          const on = cell.day === selectedDay;
          const rows = rowsByDay.get(cell.day) ?? [];
          return (
            <Pressable
              key={cell.key}
              testID={`cal-day-${cell.day}`}
              onPress={() => onSelectDay(!detail && cell.day === selectedDay ? null : cell.day)}
              style={[s.cell, detail && s.detailCell, { borderTopColor: p.cardLine }, on ? { backgroundColor: p.cardInset } : null]}
              accessibilityRole="button" accessibilityState={{ selected: on }}
              accessibilityLabel={`${cell.day} ${MON[month.monthIdx]}${cell.isFlight ? ', flight duty' : cell.hasContent ? ', duty' : ''}${detail && rows.length ? ', ' + rows.map(r => r.title).join(', ') : ''}`}
            >
              <Text style={[s.cellDay, { color: on ? colors.white : p.cardInk, backgroundColor: on ? p.btn : undefined }, cell.isToday && s.today]}>{cell.day}</Text>
              {detail ? (
                <View style={s.previews}>
                  {rows.slice(0, 3).map(row => (
                    <View key={row.id} testID={`cal-preview-${row.id}`}
                      style={[s.preview, { backgroundColor: p.cardInset, borderLeftColor: p.btn }]}>
                      <Text numberOfLines={1} style={[s.previewTitle, { color: p.cardInk }]}>
                        {row.icon === 'plane' && !tall ? row.title.split(' ')[0] : row.title}
                      </Text>
                      {!!row.time && <Text numberOfLines={1} style={[s.previewTime, { color: p.cardSoft }]}>{row.time.split('–')[0]}</Text>}
                    </View>
                  ))}
                  {rows.length > 3 && <Text testID={`cal-more-${cell.day}`} style={[s.more, { color: p.cardSoft }]}>+{rows.length - 3}</Text>}
                </View>
              ) : (
                <View style={s.dotSlot}>
                  {rows.length > 0 ? <Icon name={rows[0].icon} size={14} color={p.btn} /> : null}
                </View>
              )}
            </Pressable>
          );
        })}
        </View>
      ))}
    </View>
  );
}

/** Agenda header + rows for the selected day (or the whole month). */
function Agenda({
  month,
  palette: p,
  selectedDay,
  onRow,
  actions,
}: {
  month: MonthModel;
  palette: CarrierPalette;
  selectedDay: number | null;
  onRow: (day: number) => void;
  actions: MeetingActions;
}): React.JSX.Element {
  const rows = agendaRows(month, selectedDay);
  const day = selectedDay == null ? null : month.days.find(d => d.day === selectedDay) ?? null;
  const dayHead = day ? `${day.dow.toUpperCase()} ${day.day} ${MON[month.monthIdx].toUpperCase()}` : 'MONTH';
  return (
    <>
      <Text style={[s.listHead, { color: p.inkSoft }]} testID="cal-agenda-head">
        {dayHead}
      </Text>
      {rows.length === 0 ? (
        <Text style={[s.empty, { color: p.inkSoft }]}>
          {selectedDay == null ? 'Nothing published this month' : 'Nothing on this day'}
        </Text>
      ) : (
        rows.map(row => (
          <AgendaCard key={row.id} row={row} palette={p} onPress={() => onRow(row.day)} actions={actions} meeting={meetingById(month, row.id)} />
        ))
      )}
    </>
  );
}

function CompactMonth({
  month,
  palette: p,
  selectedDay,
  onSelectDay,
  onOpenDetail,
  actions,
  tall,
  monthDetail,
  controls,
}: Omit<CalendarViewProps, 'mode' | 'onBackToCompact'> & { tall?: boolean; monthDetail: boolean; controls: React.ReactNode }): React.JSX.Element {
  return (
    <ScrollView key="month" contentContainerStyle={s.wrap} showsVerticalScrollIndicator={false} testID="cal-compact">
      {controls}
      <View style={s.modeRow}>
        <Text style={[s.modeTitle, { color: p.inkSoft }]}>{monthDetail ? 'Tap a date for full details' : 'Select a date to filter the agenda'}</Text>
        {/* Companion toggle: month grid ⇄ day timeline (an icon, not a 3rd menu row). */}
        <Pressable onPress={() => onOpenDetail(selectedDay ?? month.focusIndex + 1)} testID="cal-to-detail" style={s.iconBtn} accessibilityLabel={monthDetail ? 'View selected day details' : 'Switch to day timeline'}>
          <Icon name={monthDetail ? 'list' : 'clock'} size={22} color={p.ink} strokeWidth={1.8} />
        </Pressable>
      </View>

      <MonthGrid month={month} palette={p} selectedDay={selectedDay} onSelectDay={monthDetail ? day => day !== null && onOpenDetail(day) : onSelectDay} tall={tall} detail={monthDetail} />

      {!monthDetail && <Agenda month={month} palette={p} selectedDay={selectedDay} onRow={onOpenDetail} actions={actions} />}
    </ScrollView>
  );
}

/**
 * Stacked view on wide screens: the month grid on the left (capped at a phone's
 * width so its cells keep their proportions) and, on the right, the selected
 * day's details or hour timeline. One tap on a day fills the right
 * pane; tapping an agenda row selects that row's day.
 */
function WideCalendar({
  month,
  palette: p,
  selectedDay,
  onSelectDay,
  actions,
  controls,
  initialHours,
}: {
  month: MonthModel;
  palette: CarrierPalette;
  selectedDay: number | null;
  onSelectDay: (day: number | null) => void;
  actions: MeetingActions;
  controls: React.ReactNode;
  initialHours: boolean;
}): React.JSX.Element {
  const day = selectedDay == null ? null : month.days.find(d => d.day === selectedDay) ?? null;
  return (
    <View style={s.wideRow} testID="cal-wide">
      <ScrollView style={s.wideGridCol} contentContainerStyle={s.wideCol} showsVerticalScrollIndicator={false}>
        {controls}
        <View style={s.modeRow}>
          <Text style={[s.modeTitle, { color: p.inkSoft }]}>Month</Text>
        </View>
        <MonthGrid month={month} palette={p} selectedDay={selectedDay} onSelectDay={onSelectDay} tall />
      </ScrollView>
      <ScrollView style={s.wideDayCol} contentContainerStyle={s.wideCol} showsVerticalScrollIndicator={false} testID="cal-day-pane">
        <DayContent month={month} palette={p} day={day} onSelectDay={onSelectDay} actions={actions} initialHours={initialHours} />
      </ScrollView>
    </View>
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
      <View style={[s.rowIcon, { backgroundColor: p.isLight ? p.cardInset : CARD_INSET }]}>
        <Icon name={row.icon} size={18} color={p.btn} />
      </View>
      <View style={s.rowBody}>
        <Text style={[s.rowTitle, { color: p.cardInk }]}>
          {row.title}
        </Text>
        {!!row.sub && (
          <Text style={[s.rowSub, { color: p.cardSoft }]}>
            {row.sub}
          </Text>
        )}
        {!!row.time && <Text style={[s.rowTime, { color: p.cardSoft }]}>{row.time}</Text>}
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
  fullDetails,
}: Omit<CalendarViewProps, 'mode' | 'onOpenDetail'> & { fullDetails: boolean }): React.JSX.Element {
  const dayIdx = Math.max(0, month.days.findIndex(d => d.day === selectedDay));
  const day = month.days[dayIdx] ?? month.days[0];
  // Sunday-first week around the selected day, clamped to the month.
  const dow = new Date(month.year, month.monthIdx, day.day).getDay();
  const weekStart = day.day - dow;

  return (
    <ScrollView key="day" contentContainerStyle={s.wrap} showsVerticalScrollIndicator={false} testID="cal-detail">
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

      <DayContent month={month} day={day} palette={p} onSelectDay={onSelectDay} actions={actions} initialHours={!fullDetails} />
    </ScrollView>
  );
}

/** Details and hourly placement are alternatives, not duplicated event lists. */
function DayContent({ month, day, palette: p, onSelectDay, actions, initialHours = false }: {
  month: MonthModel; day: DayModel | null; palette: CarrierPalette;
  onSelectDay: (day: number | null) => void; actions: MeetingActions; initialHours?: boolean;
}): React.JSX.Element {
  const [hours, setHours] = useState(initialHours);
  return <>
    {day && <Pressable testID="cal-toggle-hours" accessibilityRole="button"
      onPress={() => setHours(value => !value)} style={s.dayViewToggle}>
      <Icon name={hours ? 'list' : 'clock'} size={18} color={p.ink} />
      <Text style={[s.modeChoiceText, { color: p.ink }]}>{hours ? 'Day details' : 'Hourly timeline'}</Text>
    </Pressable>}
    {hours && day ? <>
      <Text testID="cal-agenda-head" style={[s.listHead, { color: p.inkSoft }]}>{`${day.dow.toUpperCase()} ${day.day} ${MON[month.monthIdx].toUpperCase()}`}</Text>
      <DayHours month={month} day={day} palette={p} actions={actions} />
    </> : <Agenda month={month} palette={p} selectedDay={day?.day ?? null}
      onRow={selected => { onSelectDay(selected); setHours(true); }} actions={actions} />}
  </>;
}

/** One day's hour axis: all-day chips, then the timed blocks on the grid. */
function DayHours({
  month,
  day,
  palette: p,
  actions,
}: {
  month: MonthModel;
  day: DayModel;
  palette: CarrierPalette;
  actions: MeetingActions;
}): React.JSX.Element {
  const timeline = dayTimeline(day);
  const hours = Math.max(1, timeline.endHour - timeline.startHour);
  const height = hours * ROW_HOURS;
  // A whole-day duty (day off, leave, layover) is not a block on an hour axis —
  // it gets a chip above the grid, and a day with nothing timed skips the grid.
  const allDayBlocks = timeline.blocks.filter(b => b.allDay);
  const timedBlocks = timeline.blocks.filter(b => !b.allDay);
  // Overlapping meetings get a horizontal lane each. Only meetings are split so
  // the duty's report→release block keeps the full width; two meetings at the
  // same time are the case that used to hide one behind the other.
  const meetingLanes = timelineLaneLayout(timedBlocks.filter(b => b.kind === 'meeting'), MEETING_MIN_MINUTES);
  return (
    <>
      {allDayBlocks.length > 0 ? (
        <View style={s.allDayRow}>
          {allDayBlocks.map(b => (
            <View key={b.id} testID={`cal-allday-${b.id}`} style={[s.allDayChip, { backgroundColor: p.isLight ? p.cardInset : CARD_INSET }]}>
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
              <TimelineBlockView key={b.id} block={b} palette={p} startHour={timeline.startHour} endHour={timeline.endHour} actions={actions} meeting={b.kind === 'meeting' ? meetingById(month, b.id) : null} lane={meetingLanes[b.id]} />
            ))}
          </View>
        </View>
      )}
    </>
  );
}

function TimelineBlockView({
  block,
  palette: p,
  startHour,
  endHour,
  actions,
  meeting,
  lane,
}: {
  block: TimelineBlock;
  palette: CarrierPalette;
  startHour: number;
  endHour: number;
  actions: MeetingActions;
  meeting: DayModel['meetings'][number] | null;
  lane?: TimelineLane;
}): React.JSX.Element {
  const top = timelineOffset(block.startMin, startHour, endHour) * (endHour - startHour) * ROW_HOURS;
  const raw = timelineOffset(block.endMin, startHour, endHour) * (endHour - startHour) * ROW_HOURS;
  // A 30-minute event is only 22 px tall on this axis, which clipped its title
  // and location. iOS Calendar reserves a readable minimum, so a short meeting
  // keeps the same "title + subtitle" shape as a longer one.
  const minHeight = block.kind === 'meeting' ? ROW_HOURS : 24;
  const height = Math.max(minHeight, raw - top);
  // Duty/ground blocks carry the crew's own colour, meetings stay light so the
  // two never read as the same kind of event (mock `.cdEvent.duty` / `.meet`).
  const filled = block.kind === 'duty' || block.kind === 'ground';
  const background = filled ? p.btn : block.kind === 'meeting' ? (p.isLight ? p.cardInset : 'rgba(255,255,255,0.92)') : p.frost;
  const ink = filled ? '#fff' : p.cardInk;
  const label = timelineBlockLabel(block);
  const laneCount = Math.max(1, lane?.lanes ?? 1);
  const laneIndex = Math.min(laneCount - 1, Math.max(0, lane?.lane ?? 0));
  const laneStyle = {
    left: `${(laneIndex * 100) / laneCount}%` as const,
    width: `${100 / laneCount}%` as const,
  };

  const body = (
    block.kind === 'meeting' ? (
      <>
        <Text
          style={[s.blockTitle, { color: ink }]}
          numberOfLines={height >= 56 ? 2 : 1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {block.title}
        </Text>
        {block.sub ? (
          <Text
            style={[s.blockSub, { color: ink }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {block.sub}
          </Text>
        ) : null}
      </>
    ) : (
      <>
        <Text style={[s.blockTime, { color: ink }]}>{label}</Text>
        <Text style={[s.blockTitle, { color: ink }]} numberOfLines={2}>
          {block.title}
          {block.sub ? ` · ${block.sub}` : ''}
        </Text>
      </>
    )
  );

  if (block.kind === 'meeting' && meeting) {
    return (
      <Pressable
        testID={`cal-block-${block.id}`}
        onPress={() => (meeting.joinUrl ? actions.onJoin(meeting) : actions.onToggleAlarm(meeting))}
        // The block's text is drawn inside a Pressable, so iOS does not expose
        // it separately — the title must be in the label or a screen reader only
        // hears "Alarm 18:52".
        accessibilityLabel={`${meeting.title}, ${meeting.joinUrl ? 'join online' : meeting.muted ? 'alarm off' : `alarm ${meeting.alarmHhmm}`}`}
        accessibilityHint={meeting.joinUrl ? 'Opens the meeting link' : 'Turns this meeting reminder on or off'}
        style={[s.block, laneStyle, { top, height, backgroundColor: background, borderLeftColor: ink }]}
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View
      testID={`cal-block-${block.id}`}
      style={[s.block, laneStyle, { top, height, backgroundColor: background, borderLeftColor: filled ? '#fff' : p.cardSoft }]}
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
  gridWeek: { flexDirection: 'row' },
  grid: { borderRadius: 16, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 6 },
  dow: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', paddingBottom: 6 },
  cell: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 6, borderRadius: 12 },
  // Weeks grow to their visible previews; sparse weeks do not waste vertical space.
  detailCell: { minHeight: 76, paddingHorizontal: 2, borderTopWidth: 1, borderRadius: 0, alignItems: 'stretch' },
  previews: { gap: space.xs4, marginTop: space.xs4 },
  preview: { borderRadius: space.xs4, borderLeftWidth: 2, paddingHorizontal: 2, paddingVertical: space.xs4, minHeight: 28 },
  previewTitle: { ...font.caption, letterSpacing: 0 },
  previewTime: { ...font.caption, fontWeight: '400', letterSpacing: 0, fontVariant: ['tabular-nums'] },
  more: { ...font.caption, textAlign: 'center' },
  modeSwitch: { flexDirection: 'row', borderRadius: radius.md, padding: space.xs4, borderWidth: 1 },
  modeChoice: { flex: 1, flexDirection: 'row', gap: space.sm8, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: radius.sm },
  modeChoiceText: { ...font.sub, fontWeight: '600' },
  dayViewToggle: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: space.sm8, minHeight: 44 },
  // Wide: grid (capped at a phone's width) | selected day's agenda + hours.
  wideRow: { flex: 1, flexDirection: 'row', paddingHorizontal: 22, gap: 18 },
  wideGridCol: { flex: 1, maxWidth: 420 },
  wideDayCol: { flex: 1, minWidth: 0 },
  wideCol: { paddingTop: 4, paddingBottom: 110, gap: 10 },
  cellDay: { alignSelf: 'center', overflow: 'hidden', ...font.sub, fontWeight: '600', minWidth: 28, height: 28, lineHeight: 28, textAlign: 'center', borderRadius: radius.md },
  today: { textDecorationLine: 'underline' },
  dotSlot: { height: 14, justifyContent: 'center' },
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
  block: { position: 'absolute', borderRadius: 10, borderLeftWidth: 3, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  blockTime: { fontSize: 10, fontWeight: '700' },
  blockTitle: { fontSize: 12, fontWeight: '600' },
  blockSub: { fontSize: 10, marginTop: 1 },
  allDayRow: { gap: 8 },
  allDayChip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  allDayText: { fontSize: 13, fontWeight: '600', flex: 1 },
});
