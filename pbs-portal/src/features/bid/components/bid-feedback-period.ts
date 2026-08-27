const isIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export const overlapsBidFeedbackPeriod = (
  start: string,
  end: string,
  periodStart: string,
  periodEnd: string,
): boolean => {
  if (![start, end, periodStart, periodEnd].every(isIsoDate)) return true;
  return start <= periodEnd && periodStart <= end;
};

export const formatBidFeedbackTableDate = (value: string): string => (
  isIsoDate(value) ? value.slice(5) : value || "—"
);
