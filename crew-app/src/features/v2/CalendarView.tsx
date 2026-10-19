// Schedule tab ▸ Roster view ▸ Calendar (mock Ver11).
//
// The calendar progressively collapses from a rich full month, to a compact
// month with a day agenda, to one selected week with a larger day agenda.
// All presentations share the Timeline's MonthModel.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import {
  PanGestureHandler,
  PinchGestureHandler,
  type HandlerStateChangeEvent,
  type PinchGestureHandlerGestureEvent,
} from 'react-native-gesture-handler';
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
import { bottomDockClearance, useLayout } from '../../components/v2/useLayout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, space } from '../../theme';
import { useAppleWeather, type AppleWeatherState } from '../weather/weatherModule';
import { WeatherStrip, WeatherSymbol } from '../weather/WeatherStrip';

/** Inner surface (icon disc, chips) — matches the duty cards' translucent inset. */
const CARD_INSET = 'rgba(255,255,255,0.68)';
const ROW_HOURS = 44;
// Use shades from the active carrier theme so compact bars read clearly without
// introducing a second, unrelated colour system.
function eventLineColor(icon: AgendaRow['icon'], p: CarrierPalette): string {
  if (p.isLight) {
    if (icon === 'house' || icon === 'home') return p.good;
    if (icon === 'dumbbell' || icon === 'run') return p.warn;
    return p.btn;
  }
  if (icon === 'plane' || icon === 'cal' || icon === 'checkin') return p.g2;
  if (icon === 'house' || icon === 'home') return p.good;
  if (icon === 'phone' || icon === 'headset') return p.g3;
  if (icon === 'users') return p.g4;
  if (icon === 'dumbbell' || icon === 'run') return p.warn;
  if (icon === 'briefcase' || icon === 'trip' || icon === 'book') return p.g3;
  if (icon === 'bed') return p.g2;
  return p.g1;
}

/** Later overlap lanes darken by 18% apiece, as in Finalist's collision rail. */
export function overlapLaneColor(base: string, lane: number): string {
  const match = base.match(/^#([0-9a-f]{6})$/i);
  if (!match || lane <= 0) return base;
  const factor = Math.max(0.45, 1 - lane * 0.18);
  const value = Number.parseInt(match[1], 16);
  const part = (shift: number) => Math.round(((value >> shift) & 255) * factor).toString(16).padStart(2, '0');
  return `#${part(16)}${part(8)}${part(0)}`;
}

function dailyEventIcon(row: AgendaRow): AgendaRow['icon'] {
  // Finalist represents roster/calendar flight events with a calendar glyph in
  // the Daily plan; the route remains readable in the title.
  if (row.id.startsWith('flight-')) return 'cal';
  if (row.id.startsWith('meet-') && !row.time) return 'clock';
  return row.icon;
}

function isCrewMilestone(row: AgendaRow): boolean {
  return row.id.startsWith('flight-') || /^[A-Z]{2,3}\d{1,4}\b.*→/.test(row.title) || /^(wake up|get ready|leave home|check-?in)\b/i.test(row.title);
}

function dailyEventColor(row: AgendaRow, p: CarrierPalette): string {
  if (isCrewMilestone(row)) return p.good;
  return eventLineColor(dailyEventIcon(row), p);
}
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
  /** Roomy Schedule layouts render these controls in the page title row. */
  level?: CalendarLevel;
  onLevelChange?: (level: CalendarLevel) => void;
  headerControlsExternal?: boolean;
  base?: string;
}

export type CalendarLevel = 'month-detail' | 'month-lines' | 'week';
export const CALENDAR_LEVELS: readonly CalendarLevel[] = ['month-detail', 'month-lines', 'week'];
export function calendarLevelLabel(level: CalendarLevel): string {
  return level === 'month-detail' ? 'Month detail' : level === 'month-lines' ? 'Month + day' : 'Week + day';
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
  level: controlledLevel,
  onLevelChange,
  headerControlsExternal = false,
  base = '',
}: CalendarViewProps): React.JSX.Element {
  const { wide, tall, height, width } = useLayout();
  const insets = useSafeAreaInsets();
  // The Duo moves navigation to the right rail, so its calendar uses the full
  // height; phones and iPads keep the clearance for the bottom dock.
  const fixedBottom = bottomDockClearance(width, height, insets, 100);
  const scrollBottom = bottomDockClearance(width, height, insets, 130);
  // Samsung Calendar's foldable interaction has three progressive levels:
  // rich month → compressed month + day → selected week + larger day area.
  const [internalLevel, setInternalLevel] = useState<CalendarLevel>('month-detail');
  const level = controlledLevel ?? internalLevel;
  const setLevel = useCallback((next: CalendarLevel) => {
    if (onLevelChange) onLevelChange(next);
    else setInternalLevel(next);
  }, [onLevelChange]);
  const [zoomIndex, setZoomIndex] = useState(1);
  const levelIndex = CALENDAR_LEVELS.indexOf(level);
  const setLevelIndex = useCallback((index: number) => {
    setLevel(CALENDAR_LEVELS[Math.max(0, Math.min(CALENDAR_LEVELS.length - 1, index))]);
  }, [setLevel]);
  const onPinch = useCallback((event: PinchGestureHandlerGestureEvent) => {
    const scale = Number(event.nativeEvent.scale ?? 1);
    if (scale < 0.82) setZoomIndex(index => Math.max(0, index - 1));
    if (scale > 1.18) setZoomIndex(index => Math.min(2, index + 1));
  }, []);
  const onSwipeEnd = useCallback((event: HandlerStateChangeEvent<Record<string, unknown>>) => {
    const translationY = Number(event.nativeEvent.translationY ?? 0);
    if (translationY < -36) setLevelIndex(levelIndex + 1);
    if (translationY > 36) setLevelIndex(levelIndex - 1);
  }, [levelIndex, setLevelIndex]);
  const levelLabel = calendarLevelLabel(level);
  const controls = (
    <Pressable
      testID="cal-mode-toggle"
      accessibilityRole="button"
      accessibilityLabel={`Calendar layout, ${levelLabel}`}
      accessibilityHint="Cycle calendar detail level"
      onPress={() => setLevelIndex((levelIndex + 1) % CALENDAR_LEVELS.length)}
      style={[s.modeToggle, { backgroundColor: p.frost, borderColor: p.frostLine }]}
    >
      <Icon name={level === 'month-detail' ? 'cal' : 'list'} size={18} color={p.btn} />
      <Text style={[s.modeChoiceText, { color: p.ink }]}>{levelLabel}</Text>
      <Icon name="chev" size={14} color={p.inkSoft} />
    </Pressable>
  );
  return mode === 'calendar-compact' ? (
    <CompactMonth month={month} palette={p} selectedDay={selectedDay}
      onSelectDay={onSelectDay} onOpenDetail={onOpenDetail} actions={actions}
      tall={tall || wide} level={level} zoomIndex={zoomIndex} controls={controls} headerControlsExternal={headerControlsExternal} onPinch={onPinch} onSwipeEnd={onSwipeEnd} viewportHeight={height} base={base}
      fixedBottom={fixedBottom} scrollBottom={scrollBottom} />
  ) : (
    <DayTimeline month={month} palette={p} selectedDay={selectedDay}
      onSelectDay={onSelectDay} onBackToCompact={onBackToCompact} actions={actions} fullDetails={level === 'month-detail'} base={base}
      bottomPad={fixedBottom} />
  );
}

/** Explicit week rows prevent fractional percentage widths wrapping Saturday. */
function MonthGrid({
  month,
  palette: p,
  selectedDay,
  onSelectDay,
  tall,
  level,
  zoomIndex,
  viewportHeight,
  onPinch,
  onSwipeEnd,
}: {
  month: MonthModel;
  palette: CarrierPalette;
  selectedDay: number | null;
  onSelectDay: (day: number | null) => void;
  tall?: boolean;
  level: CalendarLevel;
  zoomIndex: number;
  viewportHeight?: number;
  onPinch: (event: PinchGestureHandlerGestureEvent) => void;
  onSwipeEnd: (event: HandlerStateChangeEvent<Record<string, unknown>>) => void;
}): React.JSX.Element {
  const weeks = calendarWeeks(month);
  const detail = level === 'month-detail';
  const selected = selectedDay ?? month.focusIndex + 1;
  const selectedWeek = Math.max(0, weeks.findIndex(week => week.some(cell => cell?.day === selected)));
  const visibleWeeks = level === 'week' ? [weeks[selectedWeek]] : weeks;
  // Fill portrait's usable area down toward the floating dock. Short landscape
  // screens retain the readable base size and scroll when they need to.
  const zoomScale = [0.78, 1, 1.35][zoomIndex] ?? 1;
  const previewLimit = [1, 3, 5][zoomIndex] ?? 3;
  const lineLimit = [2, 3, 4][zoomIndex] ?? 3;
  const detailRowHeight = detail && viewportHeight
    ? Math.max(60, Math.min(250, Math.floor((viewportHeight - 335) / weeks.length) * zoomScale))
    : 76;
  const rowsByDay = useMemo(() => {
    const grouped = new Map<number, AgendaRow[]>();
    for (const row of agendaRows(month, null)) {
      const rows = grouped.get(row.day) ?? [];
      rows.push(row);
      grouped.set(row.day, rows);
    }
    return grouped;
  }, [month]);
  const firstDow = new Date(month.year, month.monthIdx, 1).getDay();
  const previousMonthDays = new Date(month.year, month.monthIdx, 0).getDate();
  const lastDow = new Date(month.year, month.monthIdx + 1, 0).getDay();
  const panRef = useRef<PanGestureHandler>(null);
  const pinchRef = useRef<PinchGestureHandler>(null);
  return (
    <PanGestureHandler ref={panRef} simultaneousHandlers={pinchRef} onEnded={onSwipeEnd} testID={level === 'month-detail' ? 'cal-month-detail' : level === 'week' ? 'cal-week-grid' : 'cal-grid'}>
    <PinchGestureHandler ref={pinchRef} simultaneousHandlers={panRef} key={`calendar-pinch-${zoomIndex}`} onGestureEvent={onPinch} testID="cal-pinch-surface">
    <View style={[s.grid, { backgroundColor: p.card, borderColor: p.cardLine }]}>
      <View style={s.gridWeek} testID="cal-weekdays">
      {WEEKDAY_INITIALS.map((d, i) => (
        <Text key={`dow-${i}`} testID={`cal-weekday-${i}`} style={[s.dow, { color: p.cardSoft }]}>
          {d}
        </Text>
      ))}
      </View>
      {visibleWeeks.map((week, visibleIndex) => {
        const wi = level === 'week' ? selectedWeek : visibleIndex;
        return (
        <View key={wi} style={s.gridWeek} testID={`cal-grid-week-${wi}`}>
        {week.map((cell, ci) => {
          if (!cell) {
            const outsideDay = wi === 0 ? previousMonthDays - firstDow + ci + 1 : ci - lastDow;
            return <View key={`e-${wi}-${ci}`} testID={`cal-adjacent-${wi}-${ci}`}
              style={[s.cell, detail && s.detailCell, detail ? { minHeight: detailRowHeight } : null, { borderTopColor: p.cardLine }]}>
              <Text style={[s.cellDay, { color: p.cardSoft, opacity: 0.42 }]}>{outsideDay}</Text>
            </View>;
          }
          const on = cell.day === selectedDay;
          const rows = rowsByDay.get(cell.day) ?? [];
          return (
            <Pressable
              key={cell.key}
              testID={`cal-day-${cell.day}`}
              onPress={() => onSelectDay(on ? null : cell.day)}
              style={[s.cell, detail && s.detailCell, detail ? { minHeight: detailRowHeight } : level === 'week' ? s.weekLineCell : s.lineCell, { borderTopColor: p.cardLine }, on ? { backgroundColor: p.cardInset } : null]}
              accessibilityRole="button" accessibilityState={{ selected: on }}
              accessibilityLabel={`${cell.day} ${MON[month.monthIdx]}${cell.isFlight ? ', flight duty' : cell.hasContent ? ', duty' : ''}${detail && rows.length ? ', ' + rows.map(r => r.title).join(', ') : ''}`}
            >
              <Text style={[s.cellDay, { color: on ? colors.white : p.cardInk, backgroundColor: on ? p.btn : undefined }, cell.isToday && s.today]}>{cell.day}</Text>
              {detail ? (
                <View style={s.previews}>
                  {rows.slice(0, previewLimit).map(row => (
                    <View key={row.id} testID={`cal-preview-${row.id}`}
                      style={[s.preview, { backgroundColor: p.cardInset, borderLeftColor: p.btn }]}>
                      <Text numberOfLines={tall ? 2 : 1} ellipsizeMode="tail" style={[s.previewTitle, { color: p.cardInk }]}>
                        {row.icon === 'plane' && !tall ? row.title.split(' ')[0] : row.title}
                      </Text>
                      {!!row.time && <Text numberOfLines={1} style={[s.previewTime, { color: p.cardSoft }]}>{row.time.split('–')[0]}</Text>}
                    </View>
                  ))}
                  {rows.length > previewLimit && <Text testID={`cal-more-${cell.day}`} style={[s.more, { color: p.cardSoft }]}>+{rows.length - previewLimit}…</Text>}
                </View>
              ) : (
                <View style={s.lineSlot}>
                  {rows.slice(0, lineLimit).map(row => (
                    <View key={row.id} testID={`cal-line-${row.id}`}
                      style={[s.eventLine, { backgroundColor: eventLineColor(row.icon, p) }]} />
                  ))}
                </View>
              )}
            </Pressable>
          );
        })}
        </View>
      );})}
    </View>
    </PinchGestureHandler>
    </PanGestureHandler>
  );
}

/** Agenda header + rows for the selected day (or the whole month). */
function Agenda({
  month,
  palette: p,
  selectedDay,
  onRow,
  actions,
  weather,
  headerAction,
}: {
  month: MonthModel;
  palette: CarrierPalette;
  selectedDay: number | null;
  onRow: (day: number) => void;
  actions: MeetingActions;
  weather?: AppleWeatherState;
  headerAction?: React.ReactNode;
}): React.JSX.Element {
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [railHeight, setRailHeight] = useState(420);
  const rows = agendaRows(month, selectedDay);
  const day = selectedDay == null ? null : month.days.find(d => d.day === selectedDay) ?? null;
  const dayHead = day ? `${day.dow.toUpperCase()} ${day.day} ${MON[month.monthIdx].toUpperCase()}` : 'MONTH';
  return (
    <View style={selectedDay != null ? s.agendaFill : undefined}>
      <View style={s.agendaHeading}><Text style={[s.listHead, { color: p.inkSoft }]} testID="cal-agenda-head">
        {selectedDay == null ? `${dayHead} · ${rows.length} duties` : dayHead}
      </Text>{headerAction}</View>
      {day && weather ? <WeatherStrip weather={weather} palette={p} /> : null}
      {selectedDay != null ? (
        <View style={s.dailyPlanner} testID="cal-daily-planner" onLayout={event => setRailHeight(Math.max(80, event.nativeEvent.layout.height - 12))}>
          <ScrollView style={s.dailyScroll} contentContainerStyle={s.dailyScrollContent} testID="cal-daily-scroll" showsVerticalScrollIndicator={false} bounces={false} alwaysBounceVertical={false}>
          <View style={[s.dailyEvents, s.dailyEventContent]} testID="cal-daily-events">
            {rows.length === 0 ? <Text style={[s.empty, { color: p.inkSoft }]}>Nothing on this day</Text> : null}
            {dailySections(rows).map(section => <View key={section.label} style={s.dailySection}>
              <Pressable style={s.dailySectionHead} testID={`cal-section-${section.label}`}
                accessibilityRole="button" accessibilityLabel={`${section.label}, ${section.rows.length} events`}
                accessibilityState={{ expanded: !folded[section.label] }}
                onPress={() => setFolded(value => ({ ...value, [section.label]: !value[section.label] }))}>
                <View style={{ transform: [{ rotate: folded[section.label] ? '0deg' : '90deg' }] }}><Icon name="chev" size={16} color={p.inkSoft} /></View>
                <Text style={[s.dailySectionTitle, { color: p.inkSoft }]}>{section.label}</Text>
                {folded[section.label] ? <Text style={[s.dailySectionTitle, { color: p.inkSoft }]}>{section.rows.length}</Text> : null}
                <View style={[s.dailySectionLine, { backgroundColor: p.cardLine }]} />
                {(() => {
                  const hour = { MORNING: 9, AFTERNOON: 15, EVENING: 21 }[section.label];
                  const forecast = weather?.hours.find(value => value.hour === hour);
                  return forecast ? <View style={s.sectionWeather}><WeatherSymbol symbol={forecast.symbolName} color={p.inkSoft} /><Text style={[s.dailySectionTitle, { color: p.inkSoft }]}>{`${Math.round(forecast.temperatureC)}°`}</Text></View> : null;
                })()}
              </Pressable>
              {!folded[section.label] && (section.rows.length ? section.rows.map(row => (
                <AgendaCard key={row.id} row={row} palette={p} onPress={() => onRow(row.day)} actions={actions} meeting={meetingById(month, row.id)} daily />
              )) : <Text style={[s.sectionEmpty, { color: p.inkSoft }]}>{`Nothing in the ${section.label.toLowerCase()}`}</Text>)}
            </View>)}
          </View>
          <DayRail rows={rows} palette={p} height={railHeight} />
          </ScrollView>
        </View>
      ) : rows.length ? rows.map(row => (
        <AgendaCard key={row.id} row={row} palette={p} onPress={() => onRow(row.day)} actions={actions} meeting={meetingById(month, row.id)} />
      )) : <Text style={[s.empty, { color: p.inkSoft }]}>Nothing published this month</Text>}
    </View>
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
  level,
  zoomIndex,
  controls,
  headerControlsExternal,
  onPinch,
  onSwipeEnd,
  viewportHeight,
  base,
  fixedBottom,
  scrollBottom,
}: Omit<CalendarViewProps, 'mode' | 'onBackToCompact'> & { tall?: boolean; level: CalendarLevel; zoomIndex: number; controls: React.ReactNode; headerControlsExternal: boolean; onPinch: (event: PinchGestureHandlerGestureEvent) => void; onSwipeEnd: (event: HandlerStateChangeEvent<Record<string, unknown>>) => void; viewportHeight: number; fixedBottom: number; scrollBottom: number }): React.JSX.Element {
  const detail = level === 'month-detail';
  const weather = useAppleWeather(base ?? '', month.year, month.monthIdx, selectedDay);
  const fixedDay = !detail && selectedDay != null;
  const Container = fixedDay ? View : ScrollView;
  return (
    <Container key="month" style={fixedDay ? [s.fixedWrap, { paddingBottom: fixedBottom }] : undefined}
      contentContainerStyle={[s.wrap, { paddingBottom: scrollBottom }]} showsVerticalScrollIndicator={false} testID="cal-compact">
      {!headerControlsExternal ? <View style={s.modeRow}>
        <Text style={[s.modeTitle, { color: p.inkSoft }]}>{detail ? 'Swipe up for day details' : level === 'month-lines' ? 'Swipe up for week · down for full month' : 'Swipe down for month'}</Text>
        {controls}
        {/* Companion toggle: month grid ⇄ day timeline (an icon, not a 3rd menu row). */}
        <Pressable onPress={() => onOpenDetail(selectedDay ?? month.focusIndex + 1)} testID="cal-to-detail" style={s.iconBtn} accessibilityLabel="Open hourly timeline">
          <Icon name="clock" size={22} color={p.ink} strokeWidth={1.8} />
        </Pressable>
      </View> : null}

      {fixedDay ? <ScrollView testID="cal-fixed-month-grid" style={{ maxHeight: viewportHeight * 0.32, flexShrink: 1, flexGrow: 0 }} showsVerticalScrollIndicator={false}>
        <MonthGrid month={month} palette={p} selectedDay={selectedDay} onSelectDay={onSelectDay} tall={tall} level={level} zoomIndex={zoomIndex} viewportHeight={viewportHeight} onPinch={onPinch} onSwipeEnd={onSwipeEnd} />
      </ScrollView> : <MonthGrid month={month} palette={p} selectedDay={selectedDay} onSelectDay={onSelectDay} tall={tall} level={level} zoomIndex={zoomIndex} viewportHeight={viewportHeight} onPinch={onPinch} onSwipeEnd={onSwipeEnd} />}

      {!detail && <Agenda month={month} palette={p} selectedDay={selectedDay} onRow={onSelectDay} actions={actions} weather={weather} />}
    </Container>
  );
}

function AgendaCard({
  row,
  palette: p,
  onPress,
  actions,
  meeting,
  daily = false,
}: {
  row: AgendaRow;
  palette: CarrierPalette;
  onPress: () => void;
  actions: MeetingActions;
  meeting: DayModel['meetings'][number] | null;
  daily?: boolean;
}): React.JSX.Element {
  const isMeeting = row.id.startsWith('meet-');
  const dailyWindow = row.time.replace(/(\d{2}:\d{2})[A-Z](?=–|$)/g, '$1');
  const dailyEnd = daily ? dailyWindow.split('–')[1] ?? '' : '';
  // The hour digits carry the scan target, so they sit one step larger than the
  // minutes; the time still reads as one tabular run.
  const dailyStart = daily ? dailyWindow.split('–')[0] || 'ALL' : '';
  const dailyHour = dailyStart.includes(':') ? dailyStart.slice(0, dailyStart.indexOf(':')) : dailyStart;
  const dailyMinute = dailyStart.includes(':') ? dailyStart.slice(dailyStart.indexOf(':')) : '';
  return (
    <Pressable
      onPress={onPress}
      testID={isMeeting ? `cal-meeting-${meeting?.id ?? row.id}` : `cal-row-${row.id}`}
      style={[s.row, daily && s.dailyRow, { backgroundColor: daily ? 'transparent' : p.card, borderColor: daily ? 'transparent' : p.cardLine }]}
    >
      {daily ? <View style={s.dailyTime}>{/* No adjustsFontSizeToFit: it flattens the nested runs to one size on iOS,
    which erased the hour/minute contrast this row depends on. */}
      <Text testID={`cal-row-start-${row.id}`} numberOfLines={1} style={[s.dailyStart, { color: p.ink }]}>{dailyStart.includes(':') ? <><Text testID={`cal-row-start-hh-${row.id}`} style={s.dailyStartHour}>{dailyHour}</Text>{dailyMinute}</> : dailyStart}</Text></View> :
      <View style={[s.rowIcon, { backgroundColor: p.isLight ? p.cardInset : CARD_INSET }]}><Icon name={row.icon} size={18} color={p.btn} /></View>}
      <View style={s.rowBody}>
        <View style={s.dailyTitleRow}>{daily ? <Icon name={dailyEventIcon(row)} size={19} color={dailyEventColor(row, p)} /> : null}<Text numberOfLines={daily ? 1 : undefined} ellipsizeMode={daily ? 'tail' : undefined} style={[s.rowTitle, daily && s.dailyTitle, { color: daily ? p.ink : p.cardInk }]}>{row.title}</Text>{!!dailyEnd && <Text testID={`cal-row-end-${row.id}`} numberOfLines={1} style={[s.dailyEnd, { color: p.inkSoft }]}>{dailyEnd}</Text>}</View>
        {!!row.sub && (
          <Text style={[s.rowSub, { color: daily ? p.inkSoft : p.cardSoft }]}>
            {row.sub}
          </Text>
        )}
        {!daily && !!row.time && <Text style={[s.rowTime, { color: p.cardSoft }]}>{row.time}</Text>}
        {daily && !!row.note && <Text numberOfLines={1} ellipsizeMode="tail" style={[s.dailyNote, { color: daily ? p.inkSoft : p.cardSoft }]}>{row.note}</Text>}
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
            {meeting.alarmHhmm ? <Pressable
              onPress={() => actions.onToggleAlarm(meeting)}
              testID="cal-meeting-alarm"
              accessibilityLabel={meeting.muted ? 'Alarm off' : `Alarm ${meeting.alarmHhmm}`}
              style={[s.alarmChip, { borderColor: meeting.muted ? p.cardLine : p.btn }]}
            >
              <Icon name={meeting.muted ? 'alarm' : 'bell'} size={14} color={daily ? p.inkSoft : meeting.muted ? p.cardSoft : p.btn} />
              <Text style={[s.alarmText, { color: daily ? p.inkSoft : meeting.muted ? p.cardSoft : p.btn }]}>
                {meeting.muted ? 'Alarm off' : meeting.alarmHhmm}
              </Text>
            </Pressable> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function dailySections(rows: AgendaRow[]): Array<{ label: string; rows: AgendaRow[] }> {
  const groups = new Map<string, AgendaRow[]>();
  for (const row of rows) {
    const match = row.time.match(/^(\d{1,2}):/);
    const hour = match ? Number(match[1]) : -1;
    const label = hour < 0 ? 'ALL DAY' : hour < 12 ? 'MORNING' : hour < 18 ? 'AFTERNOON' : 'EVENING';
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }
  return ['ALL DAY', 'MORNING', 'AFTERNOON', 'EVENING']
    .filter(label => label !== 'ALL DAY' || groups.has(label))
    .map(label => ({ label, rows: groups.get(label) ?? [] }));
}

/** A compressed day overview with a stable height, scrolled with the event list. */
function DayRail({ rows, palette: p, height }: { rows: AgendaRow[]; palette: CarrierPalette; height: number }): React.JSX.Element {
  const blocks = rows.flatMap(row => {
    const marks = row.time.match(/(\d{1,2}):(\d{2})[^–]*–(\d{1,2}):(\d{2})/);
    if (!marks) return [];
    const start = Number(marks[1]) * 60 + Number(marks[2]);
    let end = Number(marks[3]) * 60 + Number(marks[4]);
    if (end <= start || /\+1/.test(row.time)) end += 1440;
    return [{ row, start, end: Math.min(1440, end), continues: end > 1440 }];
  });
  // Quiet early hours occupy little space and need no labels. Early activity
  // still gets its real interval, rather than being removed from the overview.
  const weights = Array.from({ length: 24 }, (_, hour) => hour >= 9 || blocks.some(b => b.start < (hour + 1) * 60 && b.end > hour * 60) ? 1 : 0.12);
  const total = weights.reduce((sum, value) => sum + value, 0);
  const y = (minute: number) => {
    const clipped = Math.max(0, Math.min(1440, minute));
    const hour = Math.floor(clipped / 60);
    return (weights.slice(0, hour).reduce((sum, value) => sum + value, 0) + (weights[hour] ?? 0) * (clipped % 60) / 60) / total * height;
  };
  const boundaries = [...new Set(blocks.flatMap(b => [b.start, b.end]))].sort((a, b) => a - b);
  const overlaps = boundaries.slice(0, -1).flatMap((start, i) => {
    const end = boundaries[i + 1];
    const active = blocks.filter(b => b.start < end && b.end > start);
    return active.length > 1 ? [{ start, end, color: overlapLaneColor(dailyEventColor(active[active.length - 1].row, p), active.length - 1) }] : [];
  });
  const occupied = [...blocks].sort((a, b) => a.start - b.start).reduce<Array<{ start: number; end: number }>>((result, block) => {
    const previous = result[result.length - 1];
    if (previous && block.start <= previous.end) previous.end = Math.max(previous.end, block.end);
    else result.push({ start: block.start, end: block.end });
    return result;
  }, []);
  const gaps = occupied.slice(1).map((block, index) => ({ start: occupied[index].end, end: block.start }));
  return <View testID="cal-day-rail" style={[s.dayRail, { height }]} pointerEvents="none">
    <View style={[s.railAxis, { backgroundColor: p.cardLine, height }]} />
    {weights.map((weight, hour) => weight === 1 ? <Text testID={`cal-rail-hour-${hour}`} key={hour} style={[s.railHour, { top: y(hour * 60), color: p.inkSoft }]}>{hour}</Text> : null)}
    {blocks.map(block => <React.Fragment key={block.row.id}>
      <View testID={`cal-rail-${block.row.id}`} style={[s.railBlock, {
        top: y(block.start), height: Math.max(3, y(block.end) - y(block.start)),
        backgroundColor: dailyEventColor(block.row, p), opacity: 0.58,
      }]} />
      {block.continues ? <Text testID={`cal-rail-continuation-${block.row.id}`} style={[s.railContinuation, { color: p.inkSoft }]}>⌄</Text> : null}
    </React.Fragment>)}
    {gaps.filter(gap => gap.end - gap.start >= 30 && y(gap.end) - y(gap.start) >= 32).map(gap => {
      const minutes = gap.end - gap.start;
      const label = minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`;
      return <Text key={gap.start} testID={`cal-rail-gap-${gap.start}`} style={[s.railDuration, { top: (y(gap.start) + y(gap.end)) / 2 - 6, color: p.inkSoft }]}>{label}</Text>;
    })}
    {overlaps.map(segment => <View key={segment.start} testID={`cal-rail-overlap-${segment.start}`} style={[s.railBlock, { top: y(segment.start), height: Math.max(3, y(segment.end) - y(segment.start)), backgroundColor: segment.color }]} />)}
  </View>;
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
  base,
  bottomPad,
}: Omit<CalendarViewProps, 'mode' | 'onOpenDetail'> & { fullDetails: boolean; bottomPad: number }): React.JSX.Element {
  const dayIdx = Math.max(0, month.days.findIndex(d => d.day === selectedDay));
  const day = month.days[dayIdx] ?? month.days[0];
  // Sunday-first week around the selected day, clamped to the month.
  const dow = new Date(month.year, month.monthIdx, day.day).getDay();
  const weekStart = day.day - dow;
  const weather = useAppleWeather(base ?? '', month.year, month.monthIdx, day.day);

  return (
    <View key="day" style={[s.fixedWrap, { paddingBottom: bottomPad }]} testID="cal-detail">
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

      <DayContent month={month} day={day} palette={p} onSelectDay={onSelectDay} actions={actions} initialHours={!fullDetails} weather={weather} />
    </View>
  );
}

/** Details and hourly placement are alternatives, not duplicated event lists. */
function DayContent({ month, day, palette: p, onSelectDay, actions, initialHours = false, weather }: {
  month: MonthModel; day: DayModel | null; palette: CarrierPalette;
  onSelectDay: (day: number | null) => void; actions: MeetingActions; initialHours?: boolean; weather?: AppleWeatherState;
}): React.JSX.Element {
  const [hours, setHours] = useState(initialHours);
  const toggle = day ? <Pressable testID="cal-toggle-hours" accessibilityRole="button"
    onPress={() => setHours(value => !value)} style={s.dayViewToggle}>
    <Icon name={hours ? 'list' : 'clock'} size={18} color={p.ink} />
    <Text style={[s.modeChoiceText, { color: p.ink }]}>{hours ? 'Day details' : 'Hourly timeline'}</Text>
  </Pressable> : null;
  return hours && day ? <>
    <View style={s.agendaHeading}><Text testID="cal-agenda-head" style={[s.listHead, { color: p.inkSoft }]}>{`${day.dow.toUpperCase()} ${day.day} ${MON[month.monthIdx].toUpperCase()}`}</Text>{toggle}</View>
    <ScrollView contentContainerStyle={s.dailyEventContent}><DayHours month={month} day={day} palette={p} actions={actions} /></ScrollView>
  </> : <Agenda month={month} palette={p} selectedDay={day?.day ?? null}
    onRow={selected => { onSelectDay(selected); setHours(true); }} actions={actions} weather={weather} headerAction={toggle} />;

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
  modeTitle: { flex: 1, fontSize: 12, fontWeight: '700', letterSpacing: 0.7 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  gridWeek: { flexDirection: 'row' },
  grid: { borderRadius: 16, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 6 },
  dow: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', paddingBottom: 6 },
  cell: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 6, borderRadius: 12 },
  // Weeks grow to their visible previews; sparse weeks do not waste vertical space.
  detailCell: { minHeight: 76, paddingHorizontal: 2, borderTopWidth: 1, borderRadius: 0, alignItems: 'stretch' },
  lineCell: { minHeight: 46, paddingHorizontal: 3, paddingVertical: 4, borderTopWidth: 1, borderRadius: 0, alignItems: 'stretch' },
  weekLineCell: { minHeight: 62, paddingHorizontal: 3, paddingVertical: 6, borderTopWidth: 1, borderRadius: 0, alignItems: 'stretch' },
  previews: { gap: space.xs4, marginTop: space.xs4 },
  preview: { borderRadius: space.xs4, borderLeftWidth: 2, paddingHorizontal: 2, paddingVertical: space.xs4, minHeight: 28 },
  previewTitle: { ...font.caption, letterSpacing: 0 },
  previewTime: { ...font.caption, fontWeight: '400', letterSpacing: 0, fontVariant: ['tabular-nums'] },
  more: { ...font.caption, textAlign: 'center' },
  lineSlot: { gap: 3, marginTop: 7, paddingHorizontal: 1 },
  eventLine: { height: 5, borderRadius: 3, minWidth: 8 },
  modeToggle: { flexDirection: 'row', gap: space.xs4, alignItems: 'center', justifyContent: 'center', minHeight: 36, paddingHorizontal: space.sm8, borderRadius: radius.md, borderWidth: 1 },
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
  fixedWrap: { flex: 1, minHeight: 0, paddingHorizontal: space.lg16, paddingTop: space.xs4, paddingBottom: 100, gap: space.sm8 },
  agendaHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm8 },
  agendaFill: { flex: 1, minHeight: 0, gap: space.sm8 },
  dailyPlanner: { flex: 1, minHeight: 0 },
  dailyScroll: { flex: 1, minHeight: 0 },
  dailyScrollContent: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm8 },
  dailyEvents: { flex: 1, minWidth: 0 },
  dailyEventContent: { gap: space.sm8, paddingBottom: space.xl24 },
  sectionEmpty: { ...font.sub, paddingVertical: space.sm8, paddingLeft: space.xl24 },
  dailySection: { gap: 5 },
  dailySectionHead: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: space.sm8 },
  dailySectionTitle: { ...font.sub, fontWeight: '700' },
  sectionWeather: { flexDirection: 'row', alignItems: 'center', gap: space.xs4 },
  dailySectionLine: { flex: 1, height: 1 },
  dailyRow: { borderWidth: 0, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 2 },
  dailyTime: { width: 64, alignItems: 'flex-end', alignSelf: 'flex-start', paddingTop: 2 },
  dailyStart: { width: 64, textAlign: 'right', fontSize: 14, fontWeight: '500', fontVariant: ['tabular-nums'] },
  dailyStartHour: { fontSize: 17 },
  dailyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dailyTitle: { fontSize: 16, flexShrink: 1 },
  dailyEnd: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'], marginLeft: 6 },
  dailyNote: { fontSize: 11, marginTop: 3 },
  dayRail: { width: 32, position: 'relative', marginTop: space.xs4 },
  railAxis: { position: 'absolute', left: 7, width: 1 },
  railHour: { position: 'absolute', right: 0, width: 17, ...font.caption, fontVariant: ['tabular-nums'] },
  railBlock: { position: 'absolute', left: 4, width: 7, borderRadius: radius.sm },
  railDuration: { position: 'absolute', left: -24, width: 48, ...font.caption, textAlign: 'center', transform: [{ rotate: '90deg' }] },
  railContinuation: { position: 'absolute', left: -6, bottom: -3, fontSize: 12, fontWeight: '700' },
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
