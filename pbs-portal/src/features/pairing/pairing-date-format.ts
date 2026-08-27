const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type DateParts = {
  year: number;
  month: number;
  day: number;
};

const parseDateParts = (value: string | null | undefined): DateParts | null => {
  if (!value) {
    return null;
  }

  const match = DATE_ONLY_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1] ?? "", 10);
  const month = Number.parseInt(match[2] ?? "", 10) - 1;
  const day = Number.parseInt(match[3] ?? "", 10);

  if (!Number.isInteger(year) || month < 0 || month > 11 || day < 1 || day > 31) {
    return null;
  }

  return { year, month, day };
};

const formatDateParts = (parts: DateParts) => `${MONTH_LABELS[parts.month]} ${parts.day}, ${parts.year}`;
const formatMonthDay = (parts: DateParts) => `${MONTH_LABELS[parts.month]} ${parts.day}`;

export const formatPairingDateRange = (startDate: string | null | undefined, endDate: string | null | undefined) => {
  const start = parseDateParts(startDate);
  const end = parseDateParts(endDate);

  if (!start && !end) {
    return "";
  }

  if (!start) {
    return formatDateParts(end as DateParts);
  }

  if (!end) {
    return formatDateParts(start);
  }

  if (start.year === end.year && start.month === end.month && start.day === end.day) {
    return formatDateParts(start);
  }

  if (start.year === end.year) {
    return `${formatMonthDay(start)} - ${formatMonthDay(end)}, ${start.year}`;
  }

  return `${formatDateParts(start)} - ${formatDateParts(end)}`;
};
