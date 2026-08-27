import { useEffect, useId, useState } from "react";

import {
  OptionalEventDateScopeEditor,
  PreferenceConditionSection,
} from "@/shared/components/preferences";
import { isCompleteWorkDayPreferenceWindow } from "@/features/pairing/pairing-bid-control-logic";
import { cn } from "@/shared/lib/cn";
import type {
  PairingBidValue,
  PairingDayOfWeek,
  WorkDayPreferenceBid,
} from "@/features/pairing/types";

type WorkDayPreferenceEditorProps = {
  ariaLabel: string;
  disableEventDateScope?: boolean;
  disabled?: boolean;
  periodCode: string;
  periodEndDate?: string;
  periodStartDate?: string;
  value: PairingBidValue;
  onChange: (value: WorkDayPreferenceBid) => void;
  onValidityChange: (isValid: boolean) => void;
};

const DAY_OF_WEEK_OPTIONS: readonly { label: string; value: PairingDayOfWeek }[] = [
  { label: "Mon", value: "MON" },
  { label: "Tue", value: "TUE" },
  { label: "Wed", value: "WED" },
  { label: "Thu", value: "THU" },
  { label: "Fri", value: "FRI" },
  { label: "Sat", value: "SAT" },
  { label: "Sun", value: "SUN" },
];

const EMPTY_BID: WorkDayPreferenceBid = {
  type: "work-day-preference",
  days: [],
  dateScope: null,
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ISO_WEEKDAY_BY_CODE: Readonly<Record<PairingDayOfWeek, number>> = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 7,
};

const toIsoWeekday = (date: string) => {
  if (!DATE_PATTERN.test(date)) {
    return null;
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const weekday = parsed.getUTCDay();
  return weekday === 0 ? 7 : weekday;
};

const hasWorkDayDateIntersection = (
  days: WorkDayPreferenceBid["days"],
  dateScope: WorkDayPreferenceBid["dateScope"],
) => {
  if (!dateScope) {
    return true;
  }

  const selectedWeekdays = new Set(days.map((day) => ISO_WEEKDAY_BY_CODE[day.dayOfWeek]));

  if (dateScope.mode === "specific_dates") {
    return dateScope.dates
      .map(toIsoWeekday)
      .some((weekday) => weekday != null && selectedWeekdays.has(weekday));
  }

  if (!DATE_PATTERN.test(dateScope.from) || !DATE_PATTERN.test(dateScope.to) || dateScope.from > dateScope.to) {
    return true;
  }

  const start = new Date(`${dateScope.from}T00:00:00.000Z`);
  const end = new Date(`${dateScope.to}T00:00:00.000Z`);
  const rangeDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;

  if (rangeDays >= 7) {
    return true;
  }

  return Array.from({ length: rangeDays }, (_, index) => {
    const current = new Date(start.getTime() + index * 86_400_000);
    const weekday = current.getUTCDay() === 0 ? 7 : current.getUTCDay();
    return selectedWeekdays.has(weekday);
  }).some(Boolean);
};

const hasWorkDayDateScopeMismatch = (value: WorkDayPreferenceBid) => {
  if (!value.dateScope || value.days.length === 0) {
    return false;
  }

  if (value.dateScope.mode === "specific_dates") {
    if (value.dateScope.dates.length === 0 || value.dateScope.dates.some((date) => !DATE_PATTERN.test(date))) {
      return false;
    }
  } else if (
    !DATE_PATTERN.test(value.dateScope.from)
    || !DATE_PATTERN.test(value.dateScope.to)
    || value.dateScope.from > value.dateScope.to
  ) {
    return false;
  }

  return !hasWorkDayDateIntersection(value.days, value.dateScope);
};

export const isWorkDayPreferenceBidValueValid = (value: PairingBidValue) => {
  if (value.type !== "work-day-preference" || value.days.length === 0) {
    return false;
  }

  const uniqueDays = new Set(value.days.map((day) => day.dayOfWeek));
  if (uniqueDays.size !== value.days.length || value.days.some((day) => (
    !isCompleteWorkDayPreferenceWindow(day)
  ))) {
    return false;
  }

  if (!value.dateScope) {
    return true;
  }

  if (value.dateScope.mode === "specific_dates") {
    return value.dateScope.dates.length > 0
      && value.dateScope.dates.every((date) => DATE_PATTERN.test(date))
      && hasWorkDayDateIntersection(value.days, value.dateScope);
  }

  return DATE_PATTERN.test(value.dateScope.from)
    && DATE_PATTERN.test(value.dateScope.to)
    && value.dateScope.from <= value.dateScope.to
    && hasWorkDayDateIntersection(value.days, value.dateScope);
};

export const WorkDayPreferenceEditor = ({
  ariaLabel,
  disableEventDateScope = false,
  disabled = false,
  periodCode,
  periodEndDate = "",
  periodStartDate = "",
  value,
  onChange,
  onValidityChange,
}: WorkDayPreferenceEditorProps) => {
  const bid = value.type === "work-day-preference" ? value : EMPTY_BID;
  const isValid = isWorkDayPreferenceBidValueValid(bid);
  const dateScopeMismatch = hasWorkDayDateScopeMismatch(bid);
  const dateScopeErrorId = useId();
  const [touchedTimeInputs, setTouchedTimeInputs] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  const toggleDay = (dayOfWeek: PairingDayOfWeek) => {
    const exists = bid.days.some((day) => day.dayOfWeek === dayOfWeek);
    if (exists) {
      setTouchedTimeInputs((current) => {
        const next = new Set(current);
        next.delete(`${dayOfWeek}:checkInFrom`);
        next.delete(`${dayOfWeek}:checkInTo`);
        return next;
      });
    }
    const nextDays = exists
      ? bid.days.filter((day) => day.dayOfWeek !== dayOfWeek)
      : DAY_OF_WEEK_OPTIONS.flatMap((option) => {
          const existing = bid.days.find((day) => day.dayOfWeek === option.value);
          if (existing) {
            return [existing];
          }
          return option.value === dayOfWeek
            ? [{ dayOfWeek, checkInFrom: null, checkInTo: null }]
            : [];
        });

    onChange({ ...bid, days: nextDays });
  };

  const updateTime = (dayOfWeek: PairingDayOfWeek, field: "checkInFrom" | "checkInTo", time: string) => {
    onChange({
      ...bid,
      days: bid.days.map((day) => day.dayOfWeek === dayOfWeek
        ? { ...day, [field]: time || null }
        : day),
    });
  };

  const markTimeInputTouched = (dayOfWeek: PairingDayOfWeek, field: "checkInFrom" | "checkInTo") => {
    setTouchedTimeInputs((current) => new Set(current).add(`${dayOfWeek}:${field}`));
  };

  return (
    <section className="space-y-4">
      <PreferenceConditionSection required title="WORK DAYS & CHECK-IN WINDOW">
        <div
          aria-label={`${ariaLabel} weekdays`}
          className="grid grid-cols-7 gap-1.5"
          role="group"
        >
          {DAY_OF_WEEK_OPTIONS.map((option) => {
            const selected = bid.days.some((day) => day.dayOfWeek === option.value);

            return (
              <button
                key={option.value}
                aria-pressed={selected}
                className={cn(
                  "h-9 cursor-pointer rounded-lg border px-2 text-xs font-bold transition disabled:cursor-default",
                  selected
                    ? "border-[#6866cc] bg-[#eef2ff] text-[#5754cf]"
                    : "border-[#d8dde6] bg-white text-[#6f7485] hover:bg-[#f5f7ff]",
                )}
                disabled={disabled}
                type="button"
                onClick={() => toggleDay(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {bid.days.length > 0 ? (
          <div className="mt-3 grid gap-2.5">
            {bid.days.map((day) => {
              const label = DAY_OF_WEEK_OPTIONS.find((option) => option.value === day.dayOfWeek)?.label ?? day.dayOfWeek;
              const zeroWidth = day.checkInFrom != null && day.checkInFrom === day.checkInTo;
              const fromInvalid = zeroWidth && touchedTimeInputs.has(`${day.dayOfWeek}:checkInFrom`);
              const toInvalid = zeroWidth && touchedTimeInputs.has(`${day.dayOfWeek}:checkInTo`);

              return (
                <div
                  key={day.dayOfWeek}
                  className="grid grid-cols-[56px_1fr] items-center gap-3 rounded-xl border border-[#e2e6ed] bg-[#fafbfc] p-3"
                >
                  <span className="text-sm font-bold text-[#5754cf]">{label}</span>
                  <div className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <input
                      aria-invalid={fromInvalid}
                      aria-label={`${ariaLabel} ${label} check-in from`}
                      className={cn(
                        "h-10 min-w-0 rounded-lg border bg-white px-3 text-sm font-semibold text-[#282c3b] focus:border-[#706cd5] focus:outline-none disabled:cursor-not-allowed disabled:opacity-45",
                        fromInvalid ? "border-[#b9575e]" : "border-[#d8dde6]",
                      )}
                      disabled={disabled}
                      type="time"
                      value={day.checkInFrom ?? ""}
                      onBlur={() => markTimeInputTouched(day.dayOfWeek, "checkInFrom")}
                      onChange={(event) => updateTime(day.dayOfWeek, "checkInFrom", event.target.value)}
                    />
                    <span className="text-sm text-[#8d93a5]">—</span>
                    <input
                      aria-invalid={toInvalid}
                      aria-label={`${ariaLabel} ${label} check-in to`}
                      className={cn(
                        "h-10 min-w-0 rounded-lg border bg-white px-3 text-sm font-semibold text-[#282c3b] focus:border-[#706cd5] focus:outline-none disabled:cursor-not-allowed disabled:opacity-45",
                        toInvalid ? "border-[#b9575e]" : "border-[#d8dde6]",
                      )}
                      disabled={disabled}
                      type="time"
                      value={day.checkInTo ?? ""}
                      onBlur={() => markTimeInputTouched(day.dayOfWeek, "checkInTo")}
                      onChange={(event) => updateTime(day.dayOfWeek, "checkInTo", event.target.value)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </PreferenceConditionSection>

      {!disableEventDateScope ? (
        <div
          aria-describedby={dateScopeMismatch ? dateScopeErrorId : undefined}
          aria-label={`${ariaLabel} event date scope`}
          role="group"
        >
          <OptionalEventDateScopeEditor
            ariaLabel={ariaLabel}
            disabled={disabled}
            periodCode={periodCode}
            periodEndDate={periodEndDate}
            periodStartDate={periodStartDate}
            value={bid.dateScope}
            onChange={(dateScope) => onChange({ ...bid, dateScope })}
          />
          {dateScopeMismatch ? (
            <p
              className="m-0 mt-2 text-xs font-medium text-destructive"
              id={dateScopeErrorId}
              role="alert"
            >
              Selected dates do not match the selected work days.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
