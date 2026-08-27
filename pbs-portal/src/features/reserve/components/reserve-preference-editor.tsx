import { useMemo } from "react";

import { listPbsPeriodDates } from "../../../../../packages/contracts/pbs-prefer-off.js";
import type { ReserveDateScope } from "@/features/pairing/types";
import {
  buildEmptyReserveDateScopeForMode,
  isReserveDateScopeComplete,
  RESERVE_DATE_SCOPE_OPTIONS,
} from "@/features/reserve/components/reserve-date-scope-control";
import {
  PbsDatePicker,
  PreferenceConditionSection,
} from "@/shared/components/preferences";

export type ReservePreferenceValue = {
  type: "reserve-call-type-date-scope";
  callType: string;
  options: string[];
  dateScope: ReserveDateScope;
};

type ReservePreferenceEditorProps = {
  ariaLabel: string;
  disabled: boolean;
  periodCode: string;
  periodEndDate: string;
  periodStartDate: string;
  value: ReservePreferenceValue;
  onChange: (value: ReservePreferenceValue) => void;
};

const normalizeSpecificDates = (dates: string[]): string[] =>
  [...new Set(dates)].sort();

const listDateScopeDates = (dateScope: ReserveDateScope): string[] => {
  if (dateScope.mode === "date_range") {
    return [dateScope.from, dateScope.to].filter(Boolean);
  }

  return dateScope.mode === "specific_dates" ? dateScope.dates : [];
};

export const getReservePreferenceDateStatus = (
  dateScope: ReserveDateScope,
  periodStartDate: string,
  periodEndDate: string,
): {
  outOfPeriodDates: string[];
  periodAvailable: boolean;
} => {
  const periodDates = listPbsPeriodDates(periodStartDate, periodEndDate);
  const periodDateSet = new Set(periodDates);

  return {
    outOfPeriodDates: listDateScopeDates(dateScope).filter((date) => !periodDateSet.has(date)),
    periodAvailable: periodDates.length > 0,
  };
};

export const isReservePreferenceValueComplete = (
  value: ReservePreferenceValue,
  periodStartDate: string,
  periodEndDate: string,
): boolean => {
  const { outOfPeriodDates, periodAvailable } = getReservePreferenceDateStatus(
    value.dateScope,
    periodStartDate,
    periodEndDate,
  );

  return periodAvailable
    && value.callType.trim().length > 0
    && value.options.includes(value.callType)
    && isReserveDateScopeComplete(value.dateScope)
    && outOfPeriodDates.length === 0;
};

export const ReservePreferenceEditor = ({
  ariaLabel,
  disabled,
  periodCode,
  periodEndDate,
  periodStartDate,
  value,
  onChange,
}: ReservePreferenceEditorProps) => {
  const { outOfPeriodDates, periodAvailable } = useMemo(
    () => getReservePreferenceDateStatus(value.dateScope, periodStartDate, periodEndDate),
    [periodEndDate, periodStartDate, value.dateScope],
  );
  const hasCallTypeOptions = value.options.length > 0;
  const datePickerDisabled = disabled || !periodAvailable;

  return (
    <div className="space-y-5">
      <PreferenceConditionSection title="SHORT-CALL TYPE">
        <select
          aria-label={`${ariaLabel} short-call type`}
          className="h-9 w-full rounded-lg border border-[#cfd6e4] bg-white px-3 text-sm font-semibold text-[#40424f] focus-visible:border-[#6866cc] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
          disabled={disabled || !hasCallTypeOptions}
          value={value.callType}
          onChange={(event) => onChange({ ...value, callType: event.target.value })}
        >
          {hasCallTypeOptions
            ? value.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))
            : (
              <option value="">No reserve call types configured</option>
            )}
        </select>
        {!hasCallTypeOptions ? (
          <p className="mt-2 text-xs font-semibold text-[#6f7485]" role="status">
            No reserve call types are configured for your crew type.
          </p>
        ) : null}
      </PreferenceConditionSection>

      <PreferenceConditionSection title="DATE SCOPE">
        <div className="space-y-3">
          <select
            aria-label={`${ariaLabel} date scope`}
            className="h-9 w-full rounded-lg border border-[#cfd6e4] bg-white px-3 text-sm font-semibold text-[#40424f] focus-visible:border-[#6866cc] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
            disabled={disabled}
            value={value.dateScope.mode}
            onChange={(event) => onChange({
              ...value,
              dateScope: buildEmptyReserveDateScopeForMode(event.target.value as ReserveDateScope["mode"]),
            })}
          >
            {RESERVE_DATE_SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {value.dateScope.mode === "date_range" ? (
            <PbsDatePicker
              calendarLabel={`${ariaLabel} date range calendar`}
              clearLabel={`Clear ${ariaLabel} date range`}
              disabled={datePickerDisabled}
              mode="range"
              openLabel={`Open date picker for ${ariaLabel} date range`}
              periodCode={periodCode}
              periodEndDate={periodEndDate}
              periodStartDate={periodStartDate}
              rangeFrom={value.dateScope.from}
              rangeTo={value.dateScope.to}
              onRangeChange={(from, to) => onChange({
                ...value,
                dateScope: { mode: "date_range", from, to },
              })}
            />
          ) : null}

          {value.dateScope.mode === "specific_dates" ? (
            <PbsDatePicker
              calendarLabel={`${ariaLabel} specific dates calendar`}
              clearLabel={`Clear ${ariaLabel} specific dates`}
              disabled={datePickerDisabled}
              mode="multiple"
              openLabel={`Open date picker for ${ariaLabel} specific dates`}
              periodCode={periodCode}
              periodEndDate={periodEndDate}
              periodStartDate={periodStartDate}
              removeDateLabel={(date) => `Remove ${date} from ${ariaLabel} specific dates`}
              selectedDates={value.dateScope.dates}
              onSelectedDatesChange={(dates) => onChange({
                ...value,
                dateScope: { mode: "specific_dates", dates: normalizeSpecificDates(dates) },
              })}
            />
          ) : null}
        </div>
      </PreferenceConditionSection>

      {!periodAvailable ? (
        <p className="m-0 text-xs font-semibold text-[#b45b5b]" role="alert">
          Bid period is unavailable. Date selection cannot be changed.
        </p>
      ) : null}
      {periodAvailable && outOfPeriodDates.length > 0 ? (
        <p className="m-0 text-xs font-semibold text-[#b45b5b]" role="alert">
          Saved dates outside this bid period: {outOfPeriodDates.join(", ")}. Select valid dates before updating.
        </p>
      ) : null}
    </div>
  );
};
