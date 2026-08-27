import type { ReserveDateScope, RuleBidValue } from "./rule-bid-value.js";

type DateOrDowListBid = Extract<RuleBidValue, { type: "date-or-dow-list" }>;
type AirportPreferenceBid = Extract<RuleBidValue, { type: "airport-preference" }>;
type PairingCheckTimeBid = Extract<RuleBidValue, { type: "pairing-check-time" }>;
type FlightLegsPerDutyBid = Extract<RuleBidValue, { type: "flight-legs-per-duty" }>;
type PairingLengthBid = Extract<RuleBidValue, { type: "pairing-length-preference" }>;
type MonthEndCarryoverBid = Extract<RuleBidValue, { type: "month-end-carryover" }>;
type DeadheadFlyingBid = Extract<RuleBidValue, { type: "deadhead-flying" }>;
type RedeyePreferenceBid = Extract<RuleBidValue, { type: "redeye-preference" }>;

const dayOfWeekLabels: Record<DateOrDowListBid["daysOfWeek"][number], string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

const formatReserveDateScope = (dateScope: ReserveDateScope) => {
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
    return `${dateScope.from} - ${dateScope.to}`;
  }

  return dateScope.dates.length > 0 ? dateScope.dates.join(", ") : "Specific Dates";
};

const formatAirportPreferenceDateScope = (dateScope: AirportPreferenceBid["dateScope"]) => {
  if (!dateScope) {
    return null;
  }

  if (dateScope.mode === "specific_dates") {
    return dateScope.dates.length > 0 ? `Dates ${dateScope.dates.join(", ")}` : null;
  }

  return `Date Range ${dateScope.from} - ${dateScope.to}`;
};

const formatPairingCheckTimeDateScope = (dateScope: PairingCheckTimeBid["dateScope"]) => {
  if (!dateScope) {
    return null;
  }

  if (dateScope.mode === "specific_dates") {
    return dateScope.dates.length > 0 ? `on ${dateScope.dates.join(", ")}` : null;
  }

  return dateScope.from.trim().length > 0 && dateScope.to.trim().length > 0
    ? `between ${dateScope.from} - ${dateScope.to}`
    : null;
};

const formatFlightLegsPerDuty = (bid: FlightLegsPerDutyBid) => {
  const comparison = bid.operator === "Between"
    ? `Between ${bid.from} - ${bid.to} legs per duty`
    : `${bid.operator} ${bid.legs} legs per duty`;
  const dateScope = formatPairingCheckTimeDateScope(bid.dateScope);

  return dateScope ? `${comparison} ${dateScope}` : comparison;
};

const formatPairingLengthDateScope = (dateScope: PairingLengthBid["dateScope"]) => {
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

const formatPairingLengthDays = (bid: PairingLengthBid) => {
  if (bid.minDays == null && bid.maxDays == null) {
    return "—";
  }

  if (bid.minDays != null && bid.maxDays != null) {
    return bid.minDays === bid.maxDays
      ? `${bid.minDays} days`
      : `${bid.minDays}-${bid.maxDays} days`;
  }

  return bid.minDays != null ? `At least ${bid.minDays} days` : `Up to ${bid.maxDays} days`;
};

const formatWorkDayPreferenceWindow = (
  day: Extract<RuleBidValue, { type: "work-day-preference" }>["days"][number],
) => {
  const label = dayOfWeekLabels[day.dayOfWeek];
  const from = day.checkInFrom?.trim() ?? "";
  const to = day.checkInTo?.trim() ?? "";

  if (from && to) return `${label} ${from}-${to}`;
  if (from) return `${label} after ${from}`;
  if (to) return `${label} before ${to}`;
  return label;
};

const formatMonthEndCarryoverDays = (bid: MonthEndCarryoverBid) => {
  if (bid.operator === "Between") {
    return bid.from != null && bid.to != null
      ? `Carryover between ${bid.from} - ${bid.to} days`
      : "—";
  }

  return bid.days != null ? `Carryover ${bid.operator} ${bid.days} days` : "—";
};

const formatDeadheadFlying = (bid: DeadheadFlyingBid) => {
  const mode = bid.mode === "any-deadhead" ? "Any deadhead" : "Deadhead-only duty";
  const dateScope = bid.dateScope?.mode === "specific_dates"
    ? bid.dateScope.dates.length > 0 ? `on ${bid.dateScope.dates.join(", ")}` : null
    : bid.dateScope?.mode === "date_range"
      ? `between ${bid.dateScope.from} - ${bid.dateScope.to}`
      : null;

  return [mode, dateScope].filter(Boolean).join(" · ");
};

const formatRedeyePreferenceDateScope = (dateScope: RedeyePreferenceBid["dateScope"]) => {
  if (!dateScope) {
    return null;
  }

  if (dateScope.mode === "specific_dates") {
    return dateScope.dates.length > 0 ? `on ${dateScope.dates.join(", ")}` : null;
  }

  return dateScope.from.trim().length > 0 && dateScope.to.trim().length > 0
    ? `between ${dateScope.from} - ${dateScope.to}`
    : null;
};

export const formatRuleBid = (bid: RuleBidValue) => {
  if (bid.type === "flag") {
    return "Enabled";
  }

  if (bid.type === "date") {
    return bid.operator ? `${bid.operator} ${bid.value}` : bid.value;
  }

  if (bid.type === "stepper") {
    return bid.operator ? `${bid.operator} ${bid.value}` : String(bid.value);
  }

  if (bid.type === "flight-legs-per-duty") {
    return formatFlightLegsPerDuty(bid);
  }

  if (bid.type === "stepper-range") {
    return `Between ${bid.from} - ${bid.to}`;
  }

  if (bid.type === "stepper-date") {
    return bid.operator ? `${bid.operator} ${bid.value} on ${bid.date}` : `${bid.value} on ${bid.date}`;
  }

  if (bid.type === "stepper-range-date") {
    return `Between ${bid.from} - ${bid.to} on ${bid.date}`;
  }

  if (bid.type === "stepper-date-range") {
    return `${bid.value} consecutive days between ${bid.from} - ${bid.to}`;
  }

  if (bid.type === "days-off-on-pattern") {
    const daysOn = bid.minDaysOn === bid.maxDaysOn
      ? String(bid.minDaysOn)
      : `${bid.minDaysOn}-${bid.maxDaysOn}`;
    const dateRange = bid.dateRange
      ? ` between ${bid.dateRange.from} - ${bid.dateRange.to}`
      : "";

    return `Work ${daysOn} days, then ${bid.minDaysOff} days off${dateRange}`;
  }

  if (bid.type === "credit-density-preference") {
    return `Min credit ${bid.minimumTotalCredit}, max working days ${bid.maximumWorkingDays}, strength ${bid.strength}`;
  }

  if (bid.type === "minimum-base-layover") {
    return `At least ${bid.minimumDuration}`;
  }

  if (bid.type === "credit-window-preference") {
    return bid.direction === "more" ? "More credit" : "Less credit";
  }

  if (bid.type === "time" || bid.type === "duration") {
    return bid.operator ? `${bid.operator} ${bid.value}` : bid.value;
  }

  if (bid.type === "time-range" || bid.type === "date-range" || bid.type === "duration-range") {
    return `Between ${bid.from} - ${bid.to}`;
  }

  if (bid.type === "time-condition-list") {
    const conditions = bid.conditions.map((condition) =>
      condition.operator === "Between"
        ? `Between ${condition.from} - ${condition.to}`
        : `${condition.operator} ${condition.value}`,
    );

    return conditions.length > 0 ? conditions.join(" OR ") : "—";
  }

  if (bid.type === "date-or-dow-list") {
    const values = [
      ...bid.dates,
      ...bid.daysOfWeek.map((day) => dayOfWeekLabels[day]),
    ];

    return values.length > 0 ? values.join(", ") : "—";
  }

  if (bid.type === "work-day-preference") {
    const days = bid.days.map(formatWorkDayPreferenceWindow);
    const dateScope = bid.dateScope?.mode === "specific_dates"
      ? bid.dateScope.dates.join(", ")
      : bid.dateScope?.mode === "date_range"
        ? `${bid.dateScope.from} - ${bid.dateScope.to}`
        : null;

    return [...days, ...(dateScope ? [dateScope] : [])].join(" · ") || "—";
  }

  if (bid.type === "airport-preference") {
    const locations = bid.locations.map((location) => location.code.trim().toUpperCase()).filter(Boolean);

    if (locations.length === 0) {
      return "—";
    }

    const fragments = [
      `${bid.event === "landing" ? "Landing" : bid.event === "layover" ? "Layover" : "Both"} ${locations.join(", ")}`,
      formatAirportPreferenceDateScope(bid.dateScope),
      bid.minimumLayoverDuration ? `Minimum layover ${bid.minimumLayoverDuration}` : null,
    ].filter((fragment): fragment is string => Boolean(fragment));

    return fragments.join(" · ");
  }

  if (bid.type === "time-date") {
    return bid.operator ? `${bid.operator} ${bid.value} on ${bid.date}` : `${bid.value} on ${bid.date}`;
  }

  if (bid.type === "time-range-date") {
    return `Between ${bid.from} - ${bid.to} on ${bid.date}`;
  }

  if (bid.type === "select") {
    return bid.value;
  }

  if (bid.type === "reserve-call-type-date-scope") {
    return `${bid.callType} on ${formatReserveDateScope(bid.dateScope)}`;
  }

  if (bid.type === "reserve-flying-date-pattern") {
    const segments = bid.segments.map((segment) =>
      segment.workType === "reserve"
        ? `${segment.callType} on ${formatReserveDateScope(segment.dateScope)}`
        : `Flying on ${formatReserveDateScope(segment.dateScope)}`);

    return segments.length > 0 ? `${segments.join("; ")}; strength ${bid.strength}` : `strength ${bid.strength}`;
  }

  if (bid.type === "tag-list") {
    return bid.values.length > 0 ? bid.values.join(", ") : "—";
  }

  if (bid.type === "tag-list-date") {
    if (bid.values.length === 0) {
      return "—";
    }

    return `${bid.values.join(", ")} on ${bid.date}`;
  }

  if (bid.type === "pairing-id-list") {
    const labels = bid.pairingLabels?.length === bid.pairingIds.length
      ? bid.pairingLabels
      : bid.pairingIds;

    return labels.length > 0 ? labels.join(", ") : "—";
  }

  if (bid.type === "pairing-occurrence-list") {
    return bid.occurrences.length > 0
      ? bid.occurrences.map((occurrence) => `${occurrence.pairingNumber} on ${occurrence.originDate}`).join("; ")
      : "—";
  }

  if (bid.type === "pairing-preference") {
    const labels = bid.pairingLabels?.length === bid.pairingIds.length
      ? bid.pairingLabels
      : bid.pairingIds;

    if (labels.length === 0) {
      return "—";
    }

    return labels.join(", ");
  }

  if (bid.type === "pairing-check-time") {
    const time = bid.operator === "Between"
      ? bid.from.trim().length > 0 && bid.to.trim().length > 0
        ? `Between ${bid.from} - ${bid.to}`
        : "—"
      : bid.value.trim().length > 0
        ? `${bid.operator} ${bid.value}`
        : "—";

    if (time === "—") {
      return time;
    }

    const dateScope = formatPairingCheckTimeDateScope(bid.dateScope);
    return `${bid.timeType === "check_out" ? "Check-Out" : "Check-In"} ${time}${dateScope ? ` ${dateScope}` : ""}`;
  }

  if (bid.type === "pairing-length-preference") {
    const days = formatPairingLengthDays(bid);

    if (days === "—") {
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
    const flights = bid.flightNumbers.length > 0 ? bid.flightNumbers.join(", ") : "—";
    const dateScope = bid.dateScope?.mode === "specific_dates"
      ? `on ${bid.dateScope.dates.join(", ")}`
      : bid.dateScope?.mode === "date_range"
        ? `between ${bid.dateScope.from} - ${bid.dateScope.to}`
        : null;
    return [flights, dateScope].filter(Boolean).join(" · ");
  }

  if (bid.type === "redeye-preference") {
    const dateScope = formatRedeyePreferenceDateScope(bid.dateScope);
    return dateScope ? `Redeye · ${dateScope}` : "Redeye";
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
    const crewLabel = bid.crewName?.trim() || crewId.trim();
    const crew = crewLabel.length > 0 ? `Crew ${crewLabel}` : "Crew";

    return `${relationship} · ${scheduleType} · ${crew} · ${threshold} ${bid.days}`;
  }

  if (bid.type === "percent") {
    const value = bid.value.endsWith("%") ? bid.value : `${bid.value}%`;

    return bid.operator ? `${bid.operator} ${value}` : value;
  }

  if (bid.type === "percent-range") {
    const from = bid.from.endsWith("%") ? bid.from : `${bid.from}%`;
    const to = bid.to.endsWith("%") ? bid.to : `${bid.to}%`;

    return `Between ${from} - ${to}`;
  }

  if (bid.type === "percent-or-duration") {
    const value = bid.unit === "duration"
      ? bid.value
      : bid.value.endsWith("%") ? bid.value : `${bid.value}%`;

    return bid.operator ? `${bid.operator} ${value}` : value;
  }

  if (bid.type === "efficient-flying-preference") {
    return bid.mode === "efficient" ? "Efficient flying" : "Inefficient flying";
  }

  return bid.value.trim().length > 0 ? bid.value : "—";
};
