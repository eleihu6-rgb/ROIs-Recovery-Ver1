import type { ReserveDateScope, RuleBidValue } from "./rule-bid-types.js";

export const cloneReserveDateScope = (dateScope: ReserveDateScope): ReserveDateScope =>
  dateScope.mode === "date_range"
    ? { ...dateScope }
    : dateScope.mode === "specific_dates"
      ? { ...dateScope, dates: [...dateScope.dates] }
      : { ...dateScope };

export const cloneRuleBidValue = <TBidValue extends RuleBidValue>(bid: TBidValue): TBidValue => {
  if (
    bid.type === "time-range"
    || bid.type === "time-range-date"
    || bid.type === "date-range"
    || bid.type === "stepper-date"
    || bid.type === "stepper-range"
    || bid.type === "stepper-range-date"
    || bid.type === "stepper-date-range"
    || bid.type === "days-off-on-pattern"
    || bid.type === "credit-density-preference"
    || bid.type === "time-date"
    || bid.type === "percent-range"
    || bid.type === "duration-range"
  ) {
    return { ...bid } as TBidValue;
  }

  if (bid.type === "time-condition-list") {
    return {
      ...bid,
      conditions: bid.conditions.map((condition) => ({ ...condition })),
    } as TBidValue;
  }

  if (bid.type === "date-or-dow-list") {
    return {
      ...bid,
      dates: [...bid.dates],
      daysOfWeek: [...bid.daysOfWeek],
    } as TBidValue;
  }

  if (bid.type === "work-day-preference") {
    return {
      ...bid,
      days: bid.days.map((day) => ({ ...day })),
      dateScope: bid.dateScope?.mode === "specific_dates"
        ? { ...bid.dateScope, dates: [...bid.dateScope.dates] }
        : bid.dateScope ? { ...bid.dateScope } : bid.dateScope,
    } as TBidValue;
  }

  if (bid.type === "airport-preference") {
    return {
      ...bid,
      locations: bid.locations.map((location) => ({ ...location })),
      dateScope: bid.dateScope
        ? bid.dateScope.mode === "specific_dates"
          ? { ...bid.dateScope, dates: [...bid.dateScope.dates] }
          : { ...bid.dateScope }
        : bid.dateScope,
    } as TBidValue;
  }

  if (bid.type === "select") {
    return {
      ...bid,
      options: [...bid.options],
    } as TBidValue;
  }

  if (bid.type === "reserve-call-type-date-scope") {
    return {
      ...bid,
      options: [...bid.options],
      dateScope: cloneReserveDateScope(bid.dateScope),
    } as TBidValue;
  }

  if (bid.type === "reserve-flying-date-pattern") {
    return {
      ...bid,
      segments: bid.segments.map((segment) =>
        segment.workType === "reserve"
          ? { ...segment, dateScope: cloneReserveDateScope(segment.dateScope) }
          : { ...segment, dateScope: cloneReserveDateScope(segment.dateScope) }),
      callTypeOptions: [...bid.callTypeOptions],
    } as TBidValue;
  }

  if (bid.type === "tag-list" || bid.type === "tag-list-date") {
    return {
      ...bid,
      values: [...bid.values],
      suggestions: bid.suggestions ? [...bid.suggestions] : undefined,
    } as TBidValue;
  }

  if (bid.type === "pairing-id-list") {
    return {
      ...bid,
      pairingIds: [...bid.pairingIds],
      pairingLabels: bid.pairingLabels ? [...bid.pairingLabels] : undefined,
    } as TBidValue;
  }

  if (bid.type === "pairing-occurrence-list") {
    return {
      ...bid,
      occurrences: bid.occurrences.map((occurrence) => ({ ...occurrence })),
      suggestions: bid.suggestions ? [...bid.suggestions] : undefined,
    } as TBidValue;
  }

  if (bid.type === "pairing-preference") {
    return {
      ...bid,
      pairingIds: [...bid.pairingIds],
      pairingLabels: bid.pairingLabels ? [...bid.pairingLabels] : undefined,
    } as TBidValue;
  }

  if (bid.type === "pairing-length-preference") {
    return {
      ...bid,
      dateScope: bid.dateScope?.mode === "specific_dates"
        ? { ...bid.dateScope, dates: [...bid.dateScope.dates] }
        : bid.dateScope ? { ...bid.dateScope } : bid.dateScope,
    } as TBidValue;
  }

  if (bid.type === "flight-number-preference") {
    return {
      ...bid,
      flightNumbers: [...bid.flightNumbers],
      dateScope: bid.dateScope?.mode === "specific_dates"
        ? { ...bid.dateScope, dates: [...bid.dateScope.dates] }
        : bid.dateScope ? { ...bid.dateScope } : bid.dateScope,
    } as TBidValue;
  }

  if (bid.type === "redeye-preference") {
    return {
      ...bid,
      dateScope: bid.dateScope?.mode === "specific_dates"
        ? { ...bid.dateScope, dates: [...bid.dateScope.dates] }
        : bid.dateScope ? { ...bid.dateScope } : bid.dateScope,
    } as TBidValue;
  }

  if (bid.type === "deadhead-flying") {
    return {
      ...bid,
      dateScope: bid.dateScope?.mode === "specific_dates"
        ? { ...bid.dateScope, dates: [...bid.dateScope.dates] }
        : bid.dateScope ? { ...bid.dateScope } : bid.dateScope,
    } as TBidValue;
  }

  return { ...bid } as TBidValue;
};
