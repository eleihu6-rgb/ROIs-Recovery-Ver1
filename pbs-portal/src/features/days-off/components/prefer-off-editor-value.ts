import {
  expandPreferOffBidValues,
  parsePreferOffBidValues,
  type PbsPreferOffConfig,
} from "../../../../../packages/contracts/pbs-prefer-off.js";
import type { RuleBidAvailableProperty, RuleBidExistingProperty } from "@/features/rule-bids/types";

export type PreferOffSelectableMode = "specific_dates" | "date_range" | "days_of_week" | "weekends";

export type PreferOffEditorValue = {
  mode: PreferOffSelectableMode | null;
  specificDates: string[];
  rangeFrom: string;
  rangeTo: string;
  weekdays: string[];
  timeWindowEnabled: boolean;
  timeFrom: string;
  timeTo: string;
};

type PreferOffProperty = RuleBidAvailableProperty | RuleBidExistingProperty;

export const buildPreferOffBidValues = (value: PreferOffEditorValue): string[] => {
  const values = value.mode === "specific_dates"
    ? [...value.specificDates]
    : value.mode === "date_range" && value.rangeFrom && value.rangeTo
      ? [`Between ${value.rangeFrom} - ${value.rangeTo}`]
      : value.mode === "days_of_week"
        ? [...value.weekdays]
        : value.mode === "weekends"
          ? ["Weekends"]
          : [];

  if (value.timeWindowEnabled && value.timeFrom && value.timeTo) {
    values.push(`Window ${value.timeFrom}-${value.timeTo}`);
  }

  return values;
};

export const getPreferOffEditorResult = (
  value: PreferOffEditorValue,
  periodStartDate: string,
  periodEndDate: string,
  preferOffConfig?: PbsPreferOffConfig,
) => {
  const bid = {
    type: "tag-list" as const,
    values: buildPreferOffBidValues(value),
  };
  const expansion = expandPreferOffBidValues(
    bid.values,
    periodStartDate,
    periodEndDate,
    preferOffConfig,
  );

  return {
    bid,
    allOrNothing: true,
    minimumN: null,
    maximumN: null,
    periodCount: expansion.periodCount,
    isValid: value.mode !== null && expansion.isValid,
    error: expansion.error,
  };
};

export const createPreferOffEditorValue = (
  property: PreferOffProperty,
  preferOffConfig?: PbsPreferOffConfig,
): PreferOffEditorValue => {
  const values = property.bid.type === "tag-list" ? property.bid.values : [];
  const parsed = parsePreferOffBidValues(values, preferOffConfig);
  const selectableMode = ["specific_dates", "date_range", "days_of_week", "weekends"].includes(parsed.mode)
    ? parsed.mode as PreferOffSelectableMode
    : values.length === 0
      ? "specific_dates"
      : null;

  return {
    mode: selectableMode,
    specificDates: parsed.specificDates,
    rangeFrom: parsed.rangeFrom,
    rangeTo: parsed.rangeTo,
    weekdays: parsed.weekdays,
    timeWindowEnabled: parsed.timeWindow !== null,
    timeFrom: parsed.timeWindow?.from ?? "18:00",
    timeTo: parsed.timeWindow?.to ?? "23:59",
  };
};
