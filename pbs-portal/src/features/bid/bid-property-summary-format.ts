const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const formatBidSummaryDate = (value: string): string | null => {
  const match = ISO_DATE_PATTERN.exec(value.trim());

  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const day = Number.parseInt(match[3]!, 10);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${MONTH_LABELS[month - 1]} ${day}, ${year}`;
};

export const formatBidSummaryDateOrValue = (value: string): string =>
  formatBidSummaryDate(value) ?? value.trim();

export type BidSummaryEventDateScope =
  | { mode: "specific_dates"; dates: string[] }
  | { mode: "date_range"; from: string; to: string };

export const formatBidSummaryDateScope = (
  dateScope: BidSummaryEventDateScope | null | undefined,
  prefix: "on" | "starting on" = "on",
): string | null => {
  if (!dateScope) {
    return "";
  }

  if (dateScope.mode === "specific_dates") {
    const dates = dateScope.dates.map(formatBidSummaryDate);

    if (dates.length === 0 || dates.some((date) => !date)) {
      return null;
    }

    return `${prefix} ${dates.join(", ")}`;
  }

  const range = formatBidSummaryDateRange(dateScope.from, dateScope.to);

  if (!range) {
    return null;
  }

  return prefix === "starting on"
    ? range.replace(/^from /, "starting from ")
    : range;
};

export const formatBidSummaryDateRange = (
  from: string,
  to: string,
): string | null => {
  const formattedFrom = formatBidSummaryDate(from);
  const formattedTo = formatBidSummaryDate(to);

  return formattedFrom && formattedTo && from <= to
    ? `from ${formattedFrom} to ${formattedTo}`
    : null;
};

export const formatBidSummaryAction = (
  action: "award" | "avoid" | null | undefined,
): "Award" | "Avoid" | null => {
  if (action === "award") {
    return "Award";
  }

  if (action === "avoid") {
    return "Avoid";
  }

  return null;
};

export const pluralizeBidSummaryUnit = (
  value: number,
  singular: string,
  plural = `${singular}s`,
): string => `${value} ${value === 1 ? singular : plural}`;

export const formatBidSummaryComparison = (
  operator: string | undefined,
  value: string | number | null | undefined,
  from?: string | number | null,
  to?: string | number | null,
  unit?: string,
): string | null => {
  const suffix = unit ? ` ${unit}` : "";

  if (operator === "Between" && from != null && to != null) {
    return `between ${from} and ${to}${suffix}`;
  }

  if (value == null || value === "") {
    return null;
  }

  if (operator === ">") {
    return `more than ${value}${suffix}`;
  }

  if (operator === "<") {
    return `fewer than ${value}${suffix}`;
  }

  if (operator === "=" || !operator) {
    return `exactly ${value}${suffix}`;
  }

  return null;
};
