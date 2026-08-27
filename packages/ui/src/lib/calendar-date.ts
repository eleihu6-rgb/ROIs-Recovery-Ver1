const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH_RE = /^(\d{4})-(\d{2})$/;

export const ENGLISH_MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const ENGLISH_MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
export const ENGLISH_WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface CalendarDateParts {
  year: number;
  monthIndex: number;
  day: number;
}

export interface CalendarMonth {
  year: number;
  monthIndex: number;
}

export interface CalendarCell {
  key: string;
  isoDate: string;
  day: number;
  inCurrentMonth: boolean;
  disabled: boolean;
}

export const daysInMonth = (year: number, monthIndex: number): number =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

export const formatIsoDate = (year: number, monthIndex: number, day: number): string =>
  `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export const parseIsoDate = (value: string | null | undefined): CalendarDateParts | null => {
  if (!value) return null;
  const match = ISO_DATE_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return null;
  if (day < 1 || day > daysInMonth(year, monthIndex)) return null;
  return { year, monthIndex, day };
};

export const parseCalendarMonth = (value: string | null | undefined): CalendarMonth | null => {
  const parsedDate = parseIsoDate(value);
  if (parsedDate) return { year: parsedDate.year, monthIndex: parsedDate.monthIndex };
  if (!value) return null;
  const match = ISO_MONTH_RE.exec(value);
  if (!match) return null;
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { year: Number(match[1]), monthIndex };
};

export const compareIsoDates = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1;

export const isIsoDateWithinBounds = (isoDate: string, min?: string, max?: string): boolean => {
  if (min && compareIsoDates(isoDate, min) < 0) return false;
  if (max && compareIsoDates(isoDate, max) > 0) return false;
  return true;
};

export const formatEnglishDate = (value: string | null | undefined): string => {
  const parsed = parseIsoDate(value);
  if (!parsed) return "";
  return `${ENGLISH_MONTH_SHORT[parsed.monthIndex]} ${parsed.day}, ${parsed.year}`;
};

export const formatEnglishMonth = ({ year, monthIndex }: CalendarMonth): string =>
  `${ENGLISH_MONTH_LONG[monthIndex]} ${year}`;

export const getInitialCalendarMonth = (value?: string, fallbackMonth?: string): CalendarMonth => {
  const parsedValue = parseCalendarMonth(value);
  if (parsedValue) return parsedValue;
  const parsedFallback = parseCalendarMonth(fallbackMonth);
  if (parsedFallback) return parsedFallback;
  const now = new Date();
  return { year: now.getFullYear(), monthIndex: now.getMonth() };
};

export const shiftCalendarMonth = ({ year, monthIndex }: CalendarMonth, offset: number): CalendarMonth => {
  const date = new Date(Date.UTC(year, monthIndex + offset, 1));
  return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
};

export const buildCalendarCells = (month: CalendarMonth, min?: string, max?: string): CalendarCell[] => {
  const firstDayOffset = new Date(Date.UTC(month.year, month.monthIndex, 1)).getUTCDay();
  const startDay = 1 - firstDayOffset;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(month.year, month.monthIndex, startDay + index));
    const year = date.getUTCFullYear();
    const monthIndex = date.getUTCMonth();
    const day = date.getUTCDate();
    const isoDate = formatIsoDate(year, monthIndex, day);
    return {
      key: isoDate,
      isoDate,
      day,
      inCurrentMonth: year === month.year && monthIndex === month.monthIndex,
      disabled: !isIsoDateWithinBounds(isoDate, min, max),
    };
  });
};
