import type { PairingBidAction, PairingBidQuantifier, PairingBidValue } from "@/features/pairing/types";
import { formatCrewDisplayName } from "@/features/pairing/format-crew-display-name";

const EMPTY_BID_SUMMARY = "--";
const DAY_OF_WEEK_LABELS: Record<string, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};
const formatOptionalText = (value: string) => value.trim().length > 0 ? value : EMPTY_BID_SUMMARY;

const formatTagListDisplayValues = (values: string[], suggestions?: string[]) => {
  const displaySuggestions = suggestions?.length === values.length ? suggestions : undefined;
  const displayValues = values.map((value, index) => displaySuggestions?.[index]?.trim() || value);

  return displayValues.length > 0 ? displayValues.join(", ") : EMPTY_BID_SUMMARY;
};

const appendCreditPriority = (
  summary: string,
  bid: Extract<PairingBidValue, { type: "duration" | "duration-range" | "percent-or-duration" }>,
) => {
  if (summary === EMPTY_BID_SUMMARY || !bid.creditPriority) {
    return summary;
  }

  return `${summary} · ${bid.creditPriority === "higher" ? "Higher" : "Lower"}`;
};

const formatReserveDateScope = (dateScope: Extract<PairingBidValue, { type: "reserve-call-type-date-scope" }>["dateScope"]) => {
  if (dateScope.mode === "whole_month") {
    return "Whole Month";
  }

  if (dateScope.mode === "first_half") {
    return "First Half";
  }

  if (dateScope.mode === "second_half") {
    return "Second Half";
  }

  if (dateScope.mode === "date_range") {
    return dateScope.from.trim().length > 0 && dateScope.to.trim().length > 0
      ? `${dateScope.from} - ${dateScope.to}`
      : EMPTY_BID_SUMMARY;
  }

  return dateScope.dates.length > 0 ? dateScope.dates.join(", ") : EMPTY_BID_SUMMARY;
};

const formatAirportPreferenceDateScope = (
  dateScope: Extract<PairingBidValue, { type: "airport-preference" }>["dateScope"],
) => {
  if (!dateScope) {
    return null;
  }

  if (dateScope.mode === "specific_dates") {
    return dateScope.dates.length > 0 ? `Dates ${dateScope.dates.join(", ")}` : null;
  }

  return dateScope.from.trim().length > 0 && dateScope.to.trim().length > 0
    ? `Date Range ${dateScope.from} - ${dateScope.to}`
    : null;
};

const formatPairingCheckTimeDateScope = (
  dateScope: Extract<PairingBidValue, { type: "pairing-check-time" }>["dateScope"],
) => {
  if (!dateScope) {
    return null;
  }

  return dateScope.mode === "specific_dates"
    ? dateScope.dates.length > 0 ? `on ${dateScope.dates.join(", ")}` : null
    : dateScope.from.trim().length > 0 && dateScope.to.trim().length > 0
      ? `between ${dateScope.from} - ${dateScope.to}`
      : null;
};

const formatPairingLengthDateScope = (
  dateScope: Extract<PairingBidValue, { type: "pairing-length-preference" }>["dateScope"],
) => {
  if (!dateScope) {
    return null;
  }

  if (dateScope.mode === "specific_dates") {
    return dateScope.dates.length > 0 ? `starting on ${dateScope.dates.join(", ")}` : null;
  }

  return dateScope.from.trim().length > 0 && dateScope.to.trim().length > 0
    ? `starting ${dateScope.from} - ${dateScope.to}`
    : null;
};

const formatPairingLengthDays = (bid: Extract<PairingBidValue, { type: "pairing-length-preference" }>) => {
  if (bid.minDays == null && bid.maxDays == null) {
    return EMPTY_BID_SUMMARY;
  }

  if (bid.minDays != null && bid.maxDays != null) {
    return bid.minDays === bid.maxDays
      ? `${bid.minDays} days`
      : `${bid.minDays}-${bid.maxDays} days`;
  }

  return bid.minDays != null ? `At least ${bid.minDays} days` : `Up to ${bid.maxDays} days`;
};

const formatWorkDayPreferenceWindow = (
  day: Extract<PairingBidValue, { type: "work-day-preference" }>["days"][number],
) => {
  const label = DAY_OF_WEEK_LABELS[day.dayOfWeek] ?? day.dayOfWeek;
  const from = day.checkInFrom?.trim() ?? "";
  const to = day.checkInTo?.trim() ?? "";

  if (from && to) return `${label} ${from}-${to}`;
  if (from) return `${label} after ${from}`;
  if (to) return `${label} before ${to}`;
  return label;
};

const formatMonthEndCarryoverDays = (bid: Extract<PairingBidValue, { type: "month-end-carryover" }>) => {
  if (bid.operator === "Between") {
    return bid.from != null && bid.to != null
      ? `Carryover between ${bid.from} - ${bid.to} days`
      : EMPTY_BID_SUMMARY;
  }

  return bid.days != null ? `Carryover ${bid.operator} ${bid.days} days` : EMPTY_BID_SUMMARY;
};

const formatDeadheadFlying = (bid: Extract<PairingBidValue, { type: "deadhead-flying" }>) => {
  const modeLabel = bid.mode === "any-deadhead" ? "Any deadhead" : "Deadhead-only duty";
  const dateLabel = !bid.dateScope
    ? null
    : bid.dateScope.mode === "specific_dates"
      ? bid.dateScope.dates.length > 0 ? bid.dateScope.dates.join(", ") : null
      : bid.dateScope.from && bid.dateScope.to ? `${bid.dateScope.from}–${bid.dateScope.to}` : null;

  return dateLabel ? `${modeLabel} · ${dateLabel}` : modeLabel;
};

const formatFlightNumberPreferenceDateScope = (
  dateScope: Extract<PairingBidValue, { type: "flight-number-preference" }>['dateScope'],
) => {
  if (!dateScope) {
    return null;
  }

  return dateScope.mode === "specific_dates"
    ? dateScope.dates.length > 0 ? `on ${dateScope.dates.join(", ")}` : null
    : dateScope.from.trim().length > 0 && dateScope.to.trim().length > 0
      ? `between ${dateScope.from} - ${dateScope.to}`
      : null;
};

const formatRedeyePreferenceDateScope = (
  dateScope: Extract<PairingBidValue, { type: "redeye-preference" }>["dateScope"],
) => {
  if (!dateScope) {
    return null;
  }

  return dateScope.mode === "specific_dates"
    ? dateScope.dates.length > 0 ? `on ${dateScope.dates.join(", ")}` : null
    : dateScope.from.trim().length > 0 && dateScope.to.trim().length > 0
      ? `between ${dateScope.from} - ${dateScope.to}`
      : null;
};

export const formatPairingBidSummaryPrefix = ({
  action,
  quantifier,
}: {
  action?: PairingBidAction | null;
  quantifier?: PairingBidQuantifier | null;
}) => {
  const fragments: string[] = [];

  if (action === "award") {
    fragments.push("Award");
  } else if (action === "avoid") {
    fragments.push("Avoid");
  }

  if (quantifier === "any") {
    fragments.push("Any");
  } else if (quantifier === "every") {
    fragments.push("Every");
  }

  return fragments.length > 0 ? fragments.join(" · ") : null;
};

export const formatPairingBidValue = (
  bid: PairingBidValue,
  efficientFlyingPercentile?: number,
) => {
  if (bid.type === "flag") {
    return "Enabled";
  }

  if (bid.type === "efficient-flying-preference") {
    return Number.isInteger(efficientFlyingPercentile)
      ? `${bid.mode === "efficient" ? "Efficient flying · Top" : "Inefficient flying · Bottom"} ${efficientFlyingPercentile}% by average daily credit`
      : "Efficient flying configuration is unavailable.";
  }

  if (bid.type === "date") {
    const value = formatOptionalText(bid.value);
    return bid.operator && value !== EMPTY_BID_SUMMARY ? `${bid.operator} ${value}` : value;
  }

  if (bid.type === "stepper") {
    return bid.operator ? `${bid.operator} ${bid.value}` : String(bid.value);
  }

  if (bid.type === "flight-legs-per-duty") {
    const comparison = bid.operator === "Between"
      ? `Between ${bid.from} - ${bid.to} legs per duty`
      : `${bid.operator} ${bid.legs} legs per duty`;
    const dateScope = formatPairingCheckTimeDateScope(bid.dateScope);

    return dateScope ? `${comparison} ${dateScope}` : comparison;
  }

  if (bid.type === "stepper-range") {
    return `Between ${bid.from} - ${bid.to}`;
  }

  if (bid.type === "stepper-date") {
    if (bid.date.trim().length === 0) {
      return EMPTY_BID_SUMMARY;
    }

    return bid.operator ? `${bid.operator} ${bid.value} on ${bid.date}` : `${bid.value} on ${bid.date}`;
  }

  if (bid.type === "stepper-range-date") {
    if (bid.date.trim().length === 0) {
      return EMPTY_BID_SUMMARY;
    }

    return `Between ${bid.from} - ${bid.to} on ${bid.date}`;
  }

  if (bid.type === "stepper-date-range") {
    if (bid.from.trim().length === 0 || bid.to.trim().length === 0) {
      return EMPTY_BID_SUMMARY;
    }

    return `${bid.value} consecutive days between ${bid.from} - ${bid.to}`;
  }

  if (bid.type === "pairing-length-preference") {
    const days = formatPairingLengthDays(bid);

    if (days === EMPTY_BID_SUMMARY) {
      return days;
    }

    const dateScope = formatPairingLengthDateScope(bid.dateScope);
    return dateScope ? `${days} · ${dateScope}` : days;
  }

  if (bid.type === "month-end-carryover") {
    return formatMonthEndCarryoverDays(bid);
  }

  if (bid.type === "deadhead-flying") {
    return formatDeadheadFlying(bid);
  }

  if (bid.type === "flight-number-preference") {
    const flights = bid.flightNumbers.length > 0 ? bid.flightNumbers.join(", ") : EMPTY_BID_SUMMARY;
    const dateScope = formatFlightNumberPreferenceDateScope(bid.dateScope);

    return [flights, dateScope].filter((fragment): fragment is string => Boolean(fragment)).join(" · ");
  }

  if (bid.type === "redeye-preference") {
    const dateScope = formatRedeyePreferenceDateScope(bid.dateScope);
    return dateScope ? `Redeye · ${dateScope}` : "Redeye";
  }

  if (bid.type === "days-off-on-pattern") {
    const daysOn = bid.minDaysOn === bid.maxDaysOn
      ? String(bid.minDaysOn)
      : `${bid.minDaysOn}-${bid.maxDaysOn}`;

    return `Work ${daysOn} days, then ${bid.minDaysOff} days off`;
  }

  if (bid.type === "credit-density-preference") {
    return `Min credit ${bid.minimumTotalCredit}, max working days ${bid.maximumWorkingDays}, strength ${bid.strength}`;
  }

  if (bid.type === "credit-window-preference") {
    return bid.direction === "more" ? "More credit" : "Less credit";
  }

  if (bid.type === "time") {
    const value = formatOptionalText(bid.value);
    return bid.operator && value !== EMPTY_BID_SUMMARY ? `${bid.operator} ${value}` : value;
  }

  if (bid.type === "time-range" || bid.type === "date-range") {
    if (bid.from.trim().length === 0 || bid.to.trim().length === 0) {
      return EMPTY_BID_SUMMARY;
    }

    return `Between ${bid.from} - ${bid.to}`;
  }

  if (bid.type === "duration") {
    const value = formatOptionalText(bid.value);
    const summary = bid.operator && value !== EMPTY_BID_SUMMARY ? `${bid.operator} ${value}` : value;

    return appendCreditPriority(summary, bid);
  }

  if (bid.type === "duration-range") {
    if (bid.from.trim().length === 0 || bid.to.trim().length === 0) {
      return EMPTY_BID_SUMMARY;
    }

    return appendCreditPriority(`Between ${bid.from} - ${bid.to}`, bid);
  }

  if (bid.type === "time-condition-list") {
    const conditions = bid.conditions
      .map((condition) => {
        if (condition.operator === "Between") {
          return condition.from.trim().length > 0 && condition.to.trim().length > 0
            ? `Between ${condition.from} - ${condition.to}`
            : "";
        }

        return condition.value.trim().length > 0 ? `${condition.operator} ${condition.value}` : "";
      })
      .filter((condition) => condition.length > 0);

    return conditions.length > 0 ? conditions.join(" OR ") : EMPTY_BID_SUMMARY;
  }

  if (bid.type === "pairing-check-time") {
    const time = bid.operator === "Between"
      ? bid.from.trim().length > 0 && bid.to.trim().length > 0
        ? `Between ${bid.from} - ${bid.to}`
        : EMPTY_BID_SUMMARY
      : bid.value.trim().length > 0
        ? `${bid.operator} ${bid.value}`
        : EMPTY_BID_SUMMARY;

    if (time === EMPTY_BID_SUMMARY) {
      return time;
    }

    const dateScope = formatPairingCheckTimeDateScope(bid.dateScope);
    return `${bid.timeType === "check_out" ? "Check-Out" : "Check-In"} ${time}${dateScope ? ` ${dateScope}` : ""}`;
  }

  if (bid.type === "time-date") {
    if (bid.value.trim().length === 0 || bid.date.trim().length === 0) {
      return EMPTY_BID_SUMMARY;
    }

    return bid.operator ? `${bid.operator} ${bid.value} on ${bid.date}` : `${bid.value} on ${bid.date}`;
  }

  if (bid.type === "time-range-date") {
    if (bid.from.trim().length === 0 || bid.to.trim().length === 0 || bid.date.trim().length === 0) {
      return EMPTY_BID_SUMMARY;
    }

    return `Between ${bid.from} - ${bid.to} on ${bid.date}`;
  }

  if (bid.type === "select") {
    return formatOptionalText(bid.value);
  }

  if (bid.type === "reserve-call-type-date-scope") {
    const dateScopeSummary = formatReserveDateScope(bid.dateScope);

    return dateScopeSummary === EMPTY_BID_SUMMARY
      ? formatOptionalText(bid.callType)
      : `${formatOptionalText(bid.callType)} on ${dateScopeSummary}`;
  }

  if (bid.type === "reserve-flying-date-pattern") {
    const segments = bid.segments.map((segment) => {
      const dateScopeSummary = formatReserveDateScope(segment.dateScope);

      if (segment.workType === "reserve") {
        return dateScopeSummary === EMPTY_BID_SUMMARY
          ? formatOptionalText(segment.callType)
          : `${formatOptionalText(segment.callType)} on ${dateScopeSummary}`;
      }

      return dateScopeSummary === EMPTY_BID_SUMMARY ? "Flying" : `Flying on ${dateScopeSummary}`;
    });

    return segments.length > 0 ? `${segments.join("; ")}; strength ${bid.strength}` : EMPTY_BID_SUMMARY;
  }

  if (bid.type === "tag-list") {
    return formatTagListDisplayValues(bid.values, bid.suggestions);
  }

  if (bid.type === "date-or-dow-list") {
    const values = [
      ...bid.dates,
      ...bid.daysOfWeek.map((day) => DAY_OF_WEEK_LABELS[day] ?? day),
    ];

    return values.length > 0 ? values.join(", ") : EMPTY_BID_SUMMARY;
  }

  if (bid.type === "work-day-preference") {
    const days = bid.days.map(formatWorkDayPreferenceWindow);
    const dateScope = bid.dateScope?.mode === "specific_dates"
      ? bid.dateScope.dates.join(", ")
      : bid.dateScope?.mode === "date_range"
        ? `${bid.dateScope.from} - ${bid.dateScope.to}`
        : null;

    return [...days, ...(dateScope ? [dateScope] : [])].join(" · ") || EMPTY_BID_SUMMARY;
  }

  if (bid.type === "airport-preference") {
    const locations = bid.locations.map((location) => location.code.trim().toUpperCase()).filter(Boolean);

    if (locations.length === 0) {
      return EMPTY_BID_SUMMARY;
    }

    const fragments = [
      `${bid.event === "landing" ? "Landing" : bid.event === "layover" ? "Layover" : "Both"} ${locations.join(", ")}`,
      formatAirportPreferenceDateScope(bid.dateScope),
      bid.minimumLayoverDuration ? `Minimum layover ${bid.minimumLayoverDuration}` : null,
    ].filter((fragment): fragment is string => Boolean(fragment));

    return fragments.join(" · ");
  }

  if (bid.type === "tag-list-date") {
    return bid.values.length > 0 && bid.date.trim().length > 0
      ? `${formatTagListDisplayValues(bid.values, bid.suggestions)} on ${bid.date}`
      : EMPTY_BID_SUMMARY;
  }

  if (bid.type === "pairing-id-list") {
    return formatTagListDisplayValues(bid.pairingIds, bid.pairingLabels);
  }

  if (bid.type === "pairing-occurrence-list") {
    if (bid.occurrences.length === 0) {
      return "--";
    }

    const datesByPairingNumber = new Map<string, string[]>();

    for (const occurrence of bid.occurrences) {
      const dates = datesByPairingNumber.get(occurrence.pairingNumber) ?? [];

      dates.push(occurrence.originDate);
      datesByPairingNumber.set(occurrence.pairingNumber, dates);
    }

    return Array.from(datesByPairingNumber.entries())
      .map(([pairingNumber, dates]) => `${pairingNumber} on ${Array.from(new Set(dates)).sort().join(", ")}`)
      .join("; ");
  }

  if (bid.type === "pairing-preference") {
    const pairings = formatTagListDisplayValues(bid.pairingIds, bid.pairingLabels);

    if (pairings === EMPTY_BID_SUMMARY) {
      return EMPTY_BID_SUMMARY;
    }

    return pairings;
  }

  if (bid.type === "crew-days-off-share") {
    return bid.employeeNumber.trim().length > 0
      ? `Employee ${bid.employeeNumber.trim()}, minimum ${bid.minimumDays} shared days`
      : `Minimum ${bid.minimumDays} shared days`;
  }

  if (bid.type === "employee-schedule-preference") {
    const relationship = bid.relationship === "apart" ? "Apart" : "Together";
    const scheduleType = bid.scheduleType === "work" ? "Work" : "Days Off";
    const threshold = bid.thresholdType === "maximum" ? "Maximum" : "Minimum";
    const crewId = bid.crewId ?? (bid as { employeeNumber?: string }).employeeNumber ?? "";
    const crewLabel = formatCrewDisplayName(bid.crewName?.trim() || crewId.trim());
    const crew = crewLabel.length > 0 ? `Crew ${crewLabel}` : "Crew";

    return `${relationship} · ${scheduleType} · ${crew} · ${threshold} ${bid.days}`;
  }

  if (bid.type === "percent") {
    if (bid.value.trim().length === 0) {
      return EMPTY_BID_SUMMARY;
    }

    const value = `${bid.value}%`;
    return bid.operator ? `${bid.operator} ${value}` : value;
  }

  if (bid.type === "percent-range") {
    if (bid.from.trim().length === 0 || bid.to.trim().length === 0) {
      return EMPTY_BID_SUMMARY;
    }

    return `Between ${bid.from}% - ${bid.to}%`;
  }

  if (bid.type === "percent-or-duration") {
    if (bid.value.trim().length === 0) {
      return EMPTY_BID_SUMMARY;
    }

    const rawValue = bid.unit === "duration" ? bid.value : bid.value.replace(/\s*%$/, "").trim();
    const value = bid.unit === "duration" ? rawValue : `${rawValue}%`;
    const summary = bid.operator ? `${bid.operator} ${value}` : value;

    return appendCreditPriority(summary, bid);
  }

  return formatOptionalText(bid.value);
};
