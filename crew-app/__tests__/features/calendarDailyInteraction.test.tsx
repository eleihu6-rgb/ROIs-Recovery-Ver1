import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render, fireEvent, within } from '@testing-library/react-native';
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
import { CalendarView } from '../../src/features/v2/CalendarView';
import { buildMonth } from '../../src/features/v2/model';
import { PALETTES } from '../../src/theme/carrier';
import type { Trip } from '../../src/features/travel/tripCsv';
// A real timed turn: PR585 MNL → DAD, 13:33–14:54 local.
const trip: Trip = {
  id: 'pr-mnl-dad', crewId: '433535', checkInDateUTC: '19 Oct 2026 0430',
  legs: [{
    crewId: '433535', fltNumber: 'PR585', flightDateUTC: '19 Oct 2026 0533', depArp: 'MNL', arvArp: 'DAD',
    arvDateUTC: '19 Oct 2026 0754', localDepTime: '2026-10-19 13:33', localArvTime: '2026-10-19 14:54',
    assignment: 'FLY', fleet: 'A321', hotel: '',
  }],
};
const month = buildMonth(2026, 9, [trip], [], [], 'airport', 'Asia/Manila', {}, new Date('2026-10-19T00:00:00Z'), { minutesBefore: 8, mutedIds: [] });
month.days[18].meetings = [9, 9, 14].map((hour, i) => ({
  id: `daily-${i}`, title: ['Operations briefing', 'Crew briefing', 'Afternoon review'][i], where: 'Briefing room',
  hhmm: i === 1 ? '09:30' : `${hour}:00`, endHhmm: i === 2 ? '15:00' : '10:30',
  startMs: Date.UTC(2026, 9, 19, hour - 8, i === 1 ? 30 : 0), endMs: Date.UTC(2026, 9, 19, i === 2 ? 7 : 2, 30),
  allDay: false, joinUrl: '', alarmHhmm: '', muted: false,
}));
function screen() {
  return render(<CalendarView month={month} mode="calendar-detail" palette={PALETTES.thai} selectedDay={19}
    onSelectDay={jest.fn()} onOpenDetail={jest.fn()} onBackToCompact={jest.fn()}
    actions={{ onJoin: jest.fn(), onToggleAlarm: jest.fn() }} />);
}
it('folds dayparts without hiding their rail spans and restores the events', () => {
  const tree = screen();
  fireEvent.press(tree.getByTestId('cal-section-MORNING'));
  expect(tree.queryByText('Operations briefing')).toBeNull();
  expect(tree.getByText('Afternoon review')).toBeTruthy();
  expect(tree.getByTestId('cal-section-MORNING').props.accessibilityState.expanded).toBe(false);
  expect(within(tree.getByTestId('cal-section-MORNING')).getByText('2')).toBeTruthy();
  expect(tree.getByTestId('cal-rail-meet-daily-0')).toBeTruthy();
  fireEvent.press(tree.getByTestId('cal-section-MORNING'));
  expect(tree.getByText('Operations briefing')).toBeTruthy();
  expect(tree.getByText('Nothing in the evening')).toBeTruthy();
});
it('scrolls events and the fixed-height rail in one container and centers overlaps', () => {
  const tree = screen();
  expect(within(tree.getByTestId('cal-daily-scroll')).getByTestId('cal-daily-events')).toBeTruthy();
  expect(within(tree.getByTestId('cal-daily-scroll')).getByTestId('cal-day-rail')).toBeTruthy();
  fireEvent(tree.getByTestId('cal-daily-planner'), 'layout', { nativeEvent: { layout: { height: 400 } } });
  const height = StyleSheet.flatten(tree.getByTestId('cal-day-rail').props.style).height;
  fireEvent.press(tree.getByTestId('cal-section-MORNING'));
  expect(StyleSheet.flatten(tree.getByTestId('cal-day-rail').props.style).height).toBe(height);
  expect(tree.getByTestId('cal-daily-scroll').props.bounces).toBe(false);
  const a = StyleSheet.flatten(tree.getByTestId('cal-rail-meet-daily-0').props.style);
  const b = StyleSheet.flatten(tree.getByTestId('cal-rail-meet-daily-1').props.style);
  expect(a.left + a.width / 2).toBe(b.left + b.width / 2);
  expect(tree.getAllByTestId(/^cal-rail-overlap-/).length).toBeGreaterThan(0);
  const rail = within(tree.getByTestId('cal-day-rail'));
  expect(rail.queryByText('01')).toBeNull();
  expect(rail.queryByText('1')).toBeNull();
  expect(rail.getByText('9')).toBeTruthy();
});
it('renders the end time inline after the arrival station and drops the until line', () => {
  const tree = screen();
  const row = tree.getByTestId('cal-row-flight-20261019-PR585');
  expect(within(row).getByText('PR585 MNL → DAD')).toBeTruthy();
  const end = within(row).getByTestId('cal-row-end-flight-20261019-PR585');
  expect(end.props.children).toBe('14:54');
  // Inline: the end time is the text node immediately after the title.
  const texts = row.findAllByType(Text);
  const titleIndex = texts.findIndex(node => node.props.children === 'PR585 MNL → DAD');
  expect(titleIndex).toBeGreaterThanOrEqual(0);
  expect(texts[titleIndex + 1].props.testID).toBe('cal-row-end-flight-20261019-PR585');
  expect(texts[titleIndex + 1].props.children).toBe('14:54');
  expect(within(row).queryByText(/until /)).toBeNull();
});
it('enlarges only the hour digits of the daily start time', () => {
  const tree = screen();
  const row = tree.getByTestId('cal-row-flight-20261019-PR585');
  const hour = within(row).getByTestId('cal-row-start-hh-flight-20261019-PR585');
  expect(hour.props.children).toBe('13');
  expect(StyleSheet.flatten(hour.props.style).fontSize).toBe(17);
  const start = within(row).getByTestId('cal-row-start-flight-20261019-PR585');
  // The colon and minutes are a plain run in the parent Text, so they inherit
  // its size; only the nested hour span is larger.
  const parts = (start.props.children as React.ReactElement).props.children as unknown[];
  expect(parts[1]).toBe(':33');
  expect(StyleSheet.flatten(start.props.style).fontSize).toBe(14);
});
it('uses foreground ink on transparent daily rows', () => {
  const tree = screen();
  expect(StyleSheet.flatten(tree.getByText('Operations briefing').props.style).color).toBe(PALETTES.thai.ink);
});
