import React, { useState } from 'react';
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

it.each([[420, 912], [912, 420], [669, 951], [951, 669], [834, 1210], [1210, 834]])('layout %i: full-width month, overflow, complete day, return and blank dates', (width, height) => {
  mockLayout.current = layoutFor(width, height);
  const tree = render(<Calendar />);
  expect(tree.getByTestId('cal-grid')).toBeTruthy();
  expect(within(tree.getByTestId('cal-weekdays')).getAllByText(/^[SMTWF]$/)).toHaveLength(7);
  expect(tree.getByTestId('cal-grid-week-1').children).toHaveLength(7);
  if (mockLayout.current.wide && height >= 700) {
    expect(tree.getByTestId('cal-wide')).toBeTruthy(); // iPad opens on its hour axis
  } else {
    expect(tree.getByTestId('cal-row-flight-20261008-PR1845')).toBeTruthy();
  }
  fireEvent.press(tree.getByTestId('cal-mode-month-detail'));
  const cell = within(tree.getByTestId('cal-day-8'));
  expect(cell.getAllByTestId(/^cal-preview-/)).toHaveLength(3);
  expect(cell.getByText('+3')).toBeTruthy();
  expect(tree.queryByTestId('cal-agenda-head')).toBeNull();
  expect(tree.queryByTestId('cal-day-pane')).toBeNull();
  expect(tree.queryByTestId('cal-wide')).toBeNull();
  fireEvent.press(tree.getByTestId('cal-day-8'));
  expect(tree.getByTestId('cal-agenda-head').props.children).toBe('THU 8 OCT');
  expect(tree.getByText('PR1845 MNL → CEB')).toBeTruthy();
  expect(tree.getByText('PR1846 CEB → MNL')).toBeTruthy();
  for (let i = 0; i < 4; i++) expect(tree.getByTestId(`cal-meeting-event-${i}`)).toBeTruthy();
  fireEvent.press(tree.getByTestId('cal-toggle-hours'));
  expect(tree.getByTestId('cal-block-duty-pr-roundtrip')).toBeTruthy();
  expect(tree.queryByTestId('cal-row-flight-20261008-PR1845')).toBeNull();
  fireEvent.press(tree.getByTestId('cal-toggle-hours'));
  fireEvent.press(tree.getByTestId('cal-to-compact'));
  expect(tree.getByTestId('cal-month-detail')).toBeTruthy();
  fireEvent.press(tree.getByTestId('cal-day-9'));
  expect(tree.getByText('Nothing on this day')).toBeTruthy();
  expect(tree.queryByTestId('cal-row-flight-20261008-PR1845')).toBeNull();
  expect(tree.queryByTestId('cal-timeline')).toBeNull();
});


it('retains all 31 dates and six week rows in a long month', () => {
  const august = buildMonth(2026, 7, [], [], [], 'airport', 'Asia/Manila', {}, new Date('2026-08-08T00:00:00Z'), { minutesBefore: 8, mutedIds: [] });
  const tree = render(<Calendar sourceMonth={august} />);
  fireEvent.press(tree.getByTestId('cal-mode-month-detail'));
  expect(tree.getAllByTestId(/^cal-grid-week-/)).toHaveLength(6);
  expect(tree.getAllByTestId(/^cal-day-/)).toHaveLength(31);
  fireEvent.press(tree.getByTestId('cal-day-31'));
  expect(tree.getByTestId('cal-agenda-head').props.children).toBe('MON 31 AUG');
  expect(tree.getByText('Nothing on this day')).toBeTruthy();
});
