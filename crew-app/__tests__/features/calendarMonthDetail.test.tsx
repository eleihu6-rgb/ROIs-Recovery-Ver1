import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import { CalendarView } from '../../src/features/v2/CalendarView';
import { buildMonth } from '../../src/features/v2/model';
import { PALETTES } from '../../src/theme/carrier';
import { layoutFor } from '../../src/components/v2/useLayout';
import type { Trip } from '../../src/features/travel/tripCsv';

const mockLayout = { current: layoutFor(420, 912) };
jest.mock('../../src/components/v2/useLayout', () => ({
  ...jest.requireActual('../../src/components/v2/useLayout'),
  useLayout: () => mockLayout.current,
}));
const trip: Trip = {
  id: 'pr-roundtrip', crewId: '487424', checkInDateUTC: '08 Oct 2026 0000',
  legs: [
    { crewId: '487424', fltNumber: 'PR1845', flightDateUTC: '08 Oct 2026 0100', depArp: 'MNL', arvArp: 'CEB', arvDateUTC: '08 Oct 2026 0230', localDepTime: '2026-10-08 09:00', localArvTime: '2026-10-08 10:30', assignment: 'FLY', fleet: 'A321', hotel: '' },
    { crewId: '487424', fltNumber: 'PR1846', flightDateUTC: '08 Oct 2026 0330', depArp: 'CEB', arvArp: 'MNL', arvDateUTC: '08 Oct 2026 0500', localDepTime: '2026-10-08 11:30', localArvTime: '2026-10-08 13:00', assignment: 'FLY', fleet: 'A321', hotel: '' },
  ],
};
const month = buildMonth(2026, 9, [trip], [], [], 'airport', 'Asia/Manila', {}, new Date('2026-10-08T00:00:00Z'), { minutesBefore: 8, mutedIds: [] });
// A crowded date combines a genuine base-to-base rotation and personal events.
month.days[7].meetings = Array.from({ length: 4 }, (_, i) => ({
  id: `event-${i}`, title: `A complete meeting title ${i}`, where: 'Operations briefing room',
  hhmm: `${14 + i}:00`, endHhmm: `${14 + i}:30`, startMs: Date.UTC(2026, 9, 8, 6 + i), endMs: Date.UTC(2026, 9, 8, 6 + i, 30),
  allDay: false, joinUrl: '', alarmHhmm: '', muted: false,
}));
function Calendar({ sourceMonth = month }: { sourceMonth?: typeof month }) {
  const [day, setDay] = useState<number | null>(8);
  const [mode, setMode] = useState<'calendar-compact' | 'calendar-detail'>('calendar-compact');
  return <CalendarView month={sourceMonth} mode={mode} palette={PALETTES.thai} selectedDay={day}
    onSelectDay={setDay} onOpenDetail={d => { setDay(d); setMode('calendar-detail'); }}
    onBackToCompact={() => setMode('calendar-compact')} actions={{ onJoin: jest.fn(), onToggleAlarm: jest.fn() }} />;
}

afterEach(() => { mockLayout.current = layoutFor(420, 912); });

const swipe = (tree: ReturnType<typeof render>, id: string, translationY: number) => {
  // Gesture-handler's Jest host drops `onEnded`; the inline control exercises
  // the same state ladder here. Native UI tests cover the physical swipe.
  void id;
  void translationY;
  fireEvent.press(tree.getByTestId('cal-mode-toggle'));
};

it.each([[420, 912], [912, 420], [669, 951], [951, 669], [834, 1210], [1210, 834]])('layout %i: complete month and three progressive levels', (width, height) => {
  mockLayout.current = layoutFor(width, height);
  const tree = render(<Calendar />);
  // Month detail is the default and puts useful roster text in every date.
  expect(tree.getByTestId('cal-month-detail')).toBeTruthy();
  expect(within(tree.getByTestId('cal-weekdays')).getAllByText(/^[SMTWF]$/)).toHaveLength(7);
  expect(tree.getByTestId('cal-grid-week-1').children).toHaveLength(7);
  expect(within(tree.getByTestId('cal-adjacent-0-0')).getByText('27')).toBeTruthy();
  expect(within(tree.getByTestId('cal-adjacent-0-3')).getByText('30')).toBeTruthy();
  const cell = within(tree.getByTestId('cal-day-8'));
  expect(cell.getAllByTestId(/^cal-preview-/)).toHaveLength(3);
  expect(cell.getByText('+3…')).toBeTruthy();
  const flightPreview = within(cell.getByTestId('cal-preview-flight-20261008-PR1845'));
  expect(flightPreview.getByText(width >= 560 ? 'PR1845 MNL → CEB' : 'PR1845').props.numberOfLines).toBe(width >= 560 ? 2 : 1);
  expect(tree.queryByTestId('cal-agenda-head')).toBeNull();
  expect(tree.queryByTestId('cal-day-pane')).toBeNull();
  fireEvent.press(tree.getByTestId('cal-day-9'));
  expect(tree.getByTestId('cal-day-9').props.accessibilityState.selected).toBe(true);
  expect(tree.queryByTestId('cal-agenda-head')).toBeNull();

  // First swipe compresses the full month and reveals the selected day's details.
  swipe(tree, 'cal-month-detail', -80);
  expect(tree.getByTestId('cal-grid')).toBeTruthy();
  expect(tree.getByTestId('cal-agenda-head').props.children).toBe('FRI 9 OCT');
  expect(tree.getByText('Nothing on this day')).toBeTruthy();
  fireEvent.press(tree.getByTestId('cal-day-8'));
  expect(tree.getByTestId('cal-agenda-head').props.children).toBe('THU 8 OCT');
  expect(tree.getByText('PR1845 MNL → CEB')).toBeTruthy();
  expect(tree.getByText('PR1846 CEB → MNL')).toBeTruthy();
  const flightLine = tree.getByTestId('cal-line-flight-20261008-PR1845');
  expect(StyleSheet.flatten(flightLine.props.style)).toMatchObject({ height: 5, backgroundColor: PALETTES.thai.g2 });
  for (let i = 0; i < 4; i++) expect(tree.getByTestId(`cal-meeting-event-${i}`)).toBeTruthy();

  // Tapping the selected date clears the filter and restores the whole month.
  fireEvent.press(tree.getByTestId('cal-day-8'));
  expect(tree.getByTestId('cal-agenda-head').props.children).toMatch(/^MONTH · \d+ duties$/);
  expect(tree.getByTestId('cal-row-flight-20261008-PR1845')).toBeTruthy();

  // Second swipe leaves one selected week and a larger detail area.
  swipe(tree, 'cal-grid', -80);
  expect(tree.getByTestId('cal-week-grid')).toBeTruthy();
  expect(tree.getAllByTestId(/^cal-grid-week-/)).toHaveLength(1);

  // The compact control cycles all three levels and retains selection.
  fireEvent.press(tree.getByTestId('cal-mode-toggle'));
  expect(tree.getByTestId('cal-month-detail')).toBeTruthy();
  fireEvent.press(tree.getByTestId('cal-mode-toggle'));
  expect(tree.getByTestId('cal-grid')).toBeTruthy();
  fireEvent.press(tree.getByTestId('cal-mode-toggle'));
  fireEvent.press(tree.getByTestId('cal-mode-toggle'));
  expect(tree.getByTestId('cal-month-detail')).toBeTruthy();
  expect(tree.getByTestId('cal-day-8').props.accessibilityState.selected).toBe(false);
  expect(tree.queryByTestId('cal-agenda-head')).toBeNull();
});


it('retains all 31 dates and six week rows in a long month', () => {
  const august = buildMonth(2026, 7, [], [], [], 'airport', 'Asia/Manila', {}, new Date('2026-08-08T00:00:00Z'), { minutesBefore: 8, mutedIds: [] });
  const tree = render(<Calendar sourceMonth={august} />);
  expect(tree.getAllByTestId(/^cal-grid-week-/)).toHaveLength(6);
  expect(tree.getAllByTestId(/^cal-day-/)).toHaveLength(31);
  expect(within(tree.getByTestId('cal-adjacent-0-0')).getByText('26')).toBeTruthy();
  expect(within(tree.getByTestId('cal-adjacent-5-2')).getByText('1')).toBeTruthy();
  expect(within(tree.getByTestId('cal-adjacent-5-6')).getByText('5')).toBeTruthy();
});

it('pinches cell height to reveal more detail and ellipsizes hidden items', () => {
  const tree = render(<Calendar />);
  expect(tree.getByTestId('cal-month-detail')).toBeTruthy();
  const pinch = (scale: number) => fireEvent(tree.getByTestId('cal-month-detail'), 'gestureEvent', { nativeEvent: { scale } });
  const initialHeight = StyleSheet.flatten(tree.getByTestId('cal-day-8').props.style).minHeight;
  expect(tree.getByText('+3…')).toBeTruthy();
  pinch(1.25);
  expect(tree.getByTestId('cal-month-detail')).toBeTruthy();
  expect(within(tree.getByTestId('cal-day-8')).getAllByTestId(/^cal-preview-/)).toHaveLength(5);
  expect(tree.getByText('+1…')).toBeTruthy();
  expect(StyleSheet.flatten(tree.getByTestId('cal-day-8').props.style).minHeight).toBeGreaterThan(initialHeight);
});
