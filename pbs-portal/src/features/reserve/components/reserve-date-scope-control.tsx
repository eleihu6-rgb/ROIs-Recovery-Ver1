import { XMarkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { ReserveDateScope } from "@/features/pairing/types";
import { Button } from "@/shared/components/ui/button";
import { PortalDatePicker } from "@/shared/components/ui/portal-date-picker";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const RESERVE_DATE_SCOPE_OPTIONS: Array<{ value: ReserveDateScope["mode"]; label: string }> = [
  { value: "whole_month", label: "Whole Month" },
  { value: "first_half", label: "First Half" },
  { value: "second_half", label: "Second Half" },
  { value: "date_range", label: "Date Range" },
  { value: "specific_dates", label: "Specific Dates" },
];

export const isReserveDateScopeComplete = (dateScope: ReserveDateScope) => {
  if (dateScope.mode === "date_range") {
    return ISO_DATE_PATTERN.test(dateScope.from)
      && ISO_DATE_PATTERN.test(dateScope.to)
      && dateScope.to >= dateScope.from;
  }

  if (dateScope.mode === "specific_dates") {
    return dateScope.dates.length > 0;
  }

  return true;
};

export const buildReserveDateScope = ({
  dateScopeMode,
  rangeFrom,
  rangeTo,
  specificDates,
}: {
  dateScopeMode: ReserveDateScope["mode"];
  rangeFrom: string;
  rangeTo: string;
  specificDates: string[];
}): ReserveDateScope => {
  if (dateScopeMode === "date_range") {
    return { mode: "date_range", from: rangeFrom, to: rangeTo };
  }

  if (dateScopeMode === "specific_dates") {
    return { mode: "specific_dates", dates: specificDates };
  }

  return { mode: dateScopeMode };
};

export const buildEmptyReserveDateScopeForMode = (mode: ReserveDateScope["mode"]): ReserveDateScope => {
  if (mode === "date_range") {
    return { mode, from: "", to: "" };
  }

  if (mode === "specific_dates") {
    return { mode, dates: [] };
  }

  return { mode };
};

type ReserveDateScopeControlProps = {
  ariaLabel: string;
  allowedModes?: ReserveDateScope["mode"][];
  dateScope: ReserveDateScope;
  disabled: boolean;
  inputLabelPrefix?: string;
  onChange: (dateScope: ReserveDateScope) => void;
};

export const ReserveDateScopeControl = ({
  ariaLabel,
  allowedModes,
  dateScope,
  disabled,
  inputLabelPrefix = ariaLabel,
  onChange,
}: ReserveDateScopeControlProps) => {
  const [dateDraft, setDateDraft] = useState("");
  const options = allowedModes
    ? RESERVE_DATE_SCOPE_OPTIONS.filter((option) => allowedModes.includes(option.value))
    : RESERVE_DATE_SCOPE_OPTIONS;

  return (
    <>
      <select
        aria-label={ariaLabel}
        className="h-9 w-full rounded-lg border border-[#cfd6e4] bg-white px-3 text-sm font-semibold text-[#40424f] focus-visible:border-[#6866cc] focus-visible:outline-none"
        disabled={disabled}
        value={dateScope.mode}
        onChange={(event) => onChange(buildEmptyReserveDateScopeForMode(event.target.value as ReserveDateScope["mode"]))}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {dateScope.mode === "date_range" ? (
        <div className="grid grid-cols-2 gap-2">
          <PortalDatePicker
            ariaLabel={`${inputLabelPrefix} date range from`}
            className="h-9 rounded-lg border-[#cfd6e4] text-sm text-[#40424f] shadow-none focus-visible:ring-0"
            disabled={disabled}
            value={dateScope.from}
            onValueChange={(value) => onChange({ ...dateScope, from: value })}
          />
          <PortalDatePicker
            ariaLabel={`${inputLabelPrefix} date range to`}
            className="h-9 rounded-lg border-[#cfd6e4] text-sm text-[#40424f] shadow-none focus-visible:ring-0"
            disabled={disabled}
            value={dateScope.to}
            onValueChange={(value) => onChange({ ...dateScope, to: value })}
          />
        </div>
      ) : null}
      {dateScope.mode === "specific_dates" ? (
        <div>
          <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
            <PortalDatePicker
              ariaLabel={`${inputLabelPrefix} specific date`}
              className="h-9 rounded-lg border-[#cfd6e4] text-sm text-[#40424f] shadow-none focus-visible:ring-0"
              disabled={disabled}
              value={dateDraft}
              onValueChange={setDateDraft}
            />
            <Button
              className="h-9 whitespace-nowrap rounded-lg bg-[#6866cc] px-4 text-xs font-bold text-white"
              disabled={disabled || !ISO_DATE_PATTERN.test(dateDraft)}
              type="button"
              onClick={() => {
                if (!ISO_DATE_PATTERN.test(dateDraft) || dateScope.mode !== "specific_dates") {
                  return;
                }

                onChange({
                  ...dateScope,
                  dates: [...new Set([...dateScope.dates, dateDraft])].sort(),
                });
                setDateDraft("");
              }}
            >
              ADD DATE
            </Button>
          </div>
          <div className="mt-3 flex min-h-[30px] flex-wrap gap-2">
            {dateScope.dates.map((date) => (
              <button
                key={date}
                aria-label={`Remove ${inputLabelPrefix} date ${date}`}
                className="inline-flex h-[28px] cursor-pointer items-center gap-1 rounded-full border border-[#6467d1] bg-[#eef2ff] px-3 text-xs font-semibold text-[#6467d1] transition hover:bg-[#dfe5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f93ff] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={disabled}
                type="button"
                onClick={() => {
                  if (dateScope.mode !== "specific_dates") {
                    return;
                  }

                  onChange({
                    ...dateScope,
                    dates: dateScope.dates.filter((item) => item !== date),
                  });
                }}
              >
                {date}
                <XMarkIcon className="h-3.5 w-3.5 stroke-[2]" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
};
