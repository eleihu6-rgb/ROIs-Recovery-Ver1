import type { ScheduleTierRow, ScheduleTierTone } from '@/shared/components/schedule/types';
import type { MonthGridCalendarEntry } from '@/shared/components/calendar/types';

export type ReserveTierRow = ScheduleTierRow;

export type ReserveCalendarData = {
  title: string;
  actionLabel: string;
  monthLabel: string;
  dayLabels: string[];
  tierRows: ReserveTierRow[];
  year: number;
  month: number;
  todayDate: string;
  entries: Record<string, MonthGridCalendarEntry>;
  selectedDate: string;
};

export type ReserveTierTone = ScheduleTierTone;
