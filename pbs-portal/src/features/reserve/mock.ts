import type { ScheduleTierTone } from '@/shared/components/schedule/types';
import type { ReserveCalendarData, ReserveTierRow } from '@/features/reserve/types';
import { createEmptyScheduleTierRow, createScheduleDayLabels, createScheduleTierCells } from '@/shared/components/schedule/builders';

const today = new Date();
const currentYear = today.getFullYear();
const currentMonth = today.getMonth() + 1;
const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
const currentMonthLabel = today
  .toLocaleString('en-US', {
    month: 'short'
  })
  .toUpperCase();
const selectedDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

const scheduleDayLabels = createScheduleDayLabels(daysInMonth);
const buildCells = (tone: ScheduleTierTone, indexes: number[], fallback: ScheduleTierTone = 'blue') =>
  createScheduleTierCells(daysInMonth, tone, indexes, fallback);
const emptyTierRow = (label: string): ReserveTierRow => createEmptyScheduleTierRow(label, daysInMonth);

const tierRows: ReserveTierRow[] = [
  {
    label: 'TIER-01',
    active: true,
    cells: Array.from({ length: daysInMonth }, (_, index) => {
      const dayIndex = index + 1;

      if ([1, 6, 7, 8, 9, 10, 16, 17, 21, 22, 23].includes(dayIndex)) {
        return 'green';
      }

      if ([24, 25, 26, 27].includes(dayIndex)) {
        return 'yellow';
      }

      return 'blue';
    })
  },
  {
    label: 'TIER-02',
    cells: buildCells('yellow', [4, 5, 6, 7, 8, 21, 22], 'blue').map((cell, index) =>
      [14, 15, 16, 17, 28, 29, 30].includes(index + 1) && cell === 'blue' ? 'green' : cell
    )
  },
  {
    label: 'TIER-03',
    cells: buildCells('yellow', [4, 5, 6, 7, 8], 'blue').map((cell, index) =>
      [24, 25, 26].includes(index + 1) && cell === 'blue' ? 'green' : cell
    )
  },
  {
    label: 'TIER-04',
    cells: buildCells('yellow', [4, 5, 6, 7, 8], 'blue')
  },
  emptyTierRow('TIER-05'),
  emptyTierRow('TIER-06'),
  emptyTierRow('TIER-07')
];

const reserveEntries = Array.from({ length: daysInMonth }, (_, index) => {
  const day = index + 1;
  const isoDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return [
    isoDate,
    {
      value: String(299 + index),
      highlighted: isoDate === selectedDate
    }
  ] as const;
});

export const reserveCalendarData: ReserveCalendarData = {
  title: 'BIBIDDING CALENDAR - RESERVE',
  actionLabel: 'ADD BID',
  monthLabel: `${currentMonthLabel} ${currentYear}`,
  dayLabels: scheduleDayLabels,
  tierRows,
  year: currentYear,
  month: currentMonth,
  todayDate: selectedDate,
  selectedDate,
  entries: Object.fromEntries(reserveEntries)
};
