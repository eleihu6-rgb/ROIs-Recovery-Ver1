const MONTH_INDEX_BY_LABEL = new Map(
  ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    .map((label, index) => [label, index] as const),
);

export const parseIsoDate = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const isoDate = date.toISOString().slice(0, 10);
  return isoDate === value ? date : null;
};

export const isValidIsoDate = (value: string) => parseIsoDate(value) !== null;

export const parsePeriodMonth = (periodCode: string) => {
  const [rawMonthLabel = "", rawYear = ""] = periodCode.trim().split(/\s+/);
  const monthIndex = MONTH_INDEX_BY_LABEL.get(rawMonthLabel.slice(0, 3).toUpperCase());
  const year = Number(rawYear);

  if (monthIndex === undefined || !Number.isInteger(year)) {
    return null;
  }

  return {
    year,
    monthIndex,
  };
};

export const isIsoDateInPeriod = (value: string, periodCode: string) => {
  const date = parseIsoDate(value);
  const periodMonth = parsePeriodMonth(periodCode);

  if (!date || !periodMonth) {
    return false;
  }

  return date.getUTCFullYear() === periodMonth.year
    && date.getUTCMonth() === periodMonth.monthIndex;
};
