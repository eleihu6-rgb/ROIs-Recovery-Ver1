import type { DashboardScheduleData } from "@/features/dashboard/types";

const MONTH_LABELS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTH_INDEX_BY_LABEL = new Map(
  MONTH_LABELS.map((label, index) => [label, index] as const),
);

export const buildCalendarCells = (monthStart: Date) => {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingDays = monthStart.getDay();
  const totalVisibleDays = leadingDays + daysInMonth;
  const trailingDays = (7 - (totalVisibleDays % 7 || 7)) % 7;
  const cells: DashboardScheduleData["calendarCells"] = [];

  for (let index = leadingDays; index > 0; index -= 1) {
    const date = new Date(year, month, 1 - index);
    cells.push({
      monthLabel: index === leadingDays ? MONTH_LABELS[date.getMonth()] : undefined,
      day: String(date.getDate()).padStart(2, "0"),
      muted: true,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const isoDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    cells.push({
      monthLabel: day === 1 ? MONTH_LABELS[month] : undefined,
      day: String(day).padStart(2, "0"),
      isoDate,
    });
  }

  for (let day = 1; day <= trailingDays; day += 1) {
    const date = new Date(year, month + 1, day);
    cells.push({
      monthLabel: day === 1 ? MONTH_LABELS[date.getMonth()] : undefined,
      day: String(date.getDate()).padStart(2, "0"),
      muted: true,
    });
  }

  return cells;
};

const parseIsoDate = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date
    : null;
};

export const buildCalendarCellsForRange = (rangeStart: string, rangeEnd: string) => {
  const start = parseIsoDate(rangeStart);
  const end = parseIsoDate(rangeEnd);

  if (!start || !end || start > end) {
    return [];
  }

  const leadingDays = start.getUTCDay();
  const periodDayCount = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const trailingDays = (7 - ((leadingDays + periodDayCount) % 7 || 7)) % 7;
  const cells: DashboardScheduleData["calendarCells"] = [];

  for (let offset = leadingDays; offset > 0; offset -= 1) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() - offset);
    cells.push({
      monthLabel: offset === leadingDays ? MONTH_LABELS[date.getUTCMonth()] : undefined,
      day: String(date.getUTCDate()).padStart(2, "0"),
      muted: true,
    });
  }

  for (let offset = 0; offset < periodDayCount; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset);
    cells.push({
      monthLabel: offset === 0 || date.getUTCDate() === 1
        ? MONTH_LABELS[date.getUTCMonth()]
        : undefined,
      day: String(date.getUTCDate()).padStart(2, "0"),
      isoDate: date.toISOString().slice(0, 10),
    });
  }

  for (let offset = 1; offset <= trailingDays; offset += 1) {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() + offset);
    cells.push({
      monthLabel: offset === 1 || date.getUTCDate() === 1
        ? MONTH_LABELS[date.getUTCMonth()]
        : undefined,
      day: String(date.getUTCDate()).padStart(2, "0"),
      muted: true,
    });
  }

  return cells;
};

export const parsePeriodCode = (periodCode: string) => {
  const [rawMonthLabel = "", rawYear = ""] = periodCode.trim().split(/\s+/);
  const monthIndex = MONTH_INDEX_BY_LABEL.get(rawMonthLabel.slice(0, 3).toUpperCase());
  const year = Number(rawYear);

  if (monthIndex === undefined || !Number.isInteger(year)) {
    return null;
  }

  return new Date(Date.UTC(year, monthIndex, 1));
};
