import type { PbsPreferOffConfig } from "../../../../../packages/contracts/pbs-prefer-off.js";
import {
  getPreferOffEditorResult,
  type PreferOffEditorValue,
  type PreferOffSelectableMode,
} from "@/features/days-off/components/prefer-off-editor-value";
import { cn } from "@/shared/lib/cn";
import {
  PbsDatePicker,
  PreferenceConditionSection,
  PreferenceInlineSwitch,
  PreferenceSegmentedControl,
} from "@/shared/components/preferences";

type PreferOffEditorProps = {
  dialogContext?: "current" | "standing";
  disabled?: boolean;
  hideExplicitDates?: boolean;
  periodCode: string;
  periodEndDate?: string;
  periodStartDate?: string;
  preferOffConfig?: PbsPreferOffConfig;
  value: PreferOffEditorValue;
  onChange: (value: PreferOffEditorValue) => void;
};

const MODE_OPTIONS: Array<{ mode: PreferOffSelectableMode; label: string }> = [
  { mode: "specific_dates", label: "Specific Dates" },
  { mode: "date_range", label: "Date Range" },
  { mode: "days_of_week", label: "Days of Week" },
  { mode: "weekends", label: "Weekends" },
];

export const PreferOffEditor = ({
  dialogContext = "current",
  disabled = false,
  hideExplicitDates = false,
  periodCode,
  periodEndDate = "",
  periodStartDate = "",
  preferOffConfig,
  value,
  onChange,
}: PreferOffEditorProps) => {
  const result = getPreferOffEditorResult(
    value,
    periodStartDate,
    periodEndDate,
    preferOffConfig,
  );
  const explicitDatesHidden = dialogContext === "standing" || hideExplicitDates;

  const updateValue = (nextValue: PreferOffEditorValue) => {
    onChange(nextValue);
  };

  const weekendLabel = preferOffConfig?.weekend.available
    ? `${preferOffConfig.weekend.startDayName} ${preferOffConfig.weekend.startTime} – ${preferOffConfig.weekend.endDayName} ${preferOffConfig.weekend.endTime}`
    : "Weekend configuration unavailable";
  const weekendCountLabel = dialogContext === "standing"
    ? "Every weekend"
    : `${result.periodCount} ${result.periodCount === 1 ? "weekend" : "weekends"}`;
  const modeOptions = MODE_OPTIONS.flatMap((option) => {
    if (
      explicitDatesHidden
      && (option.mode === "specific_dates" || option.mode === "date_range")
    ) {
      return [];
    }

    const isUnavailableByConfig = option.mode === "days_of_week"
      ? !preferOffConfig?.weekdays.length
      : option.mode === "weekends"
        ? !preferOffConfig?.weekend.available
        : false;

    if (dialogContext === "standing" && isUnavailableByConfig) {
      return [];
    }

    return {
      disabled: isUnavailableByConfig,
      label: option.label,
      value: option.mode,
    };
  });

  const selectMode = (mode: PreferOffSelectableMode) => {
    updateValue({
      ...value,
      mode,
      specificDates: mode === "specific_dates" ? value.specificDates : [],
      rangeFrom: mode === "date_range" ? value.rangeFrom : "",
      rangeTo: mode === "date_range" ? value.rangeTo : "",
      weekdays: mode === "days_of_week" ? value.weekdays : [],
    });
  };

  const toggleTimeWindow = () => {
    updateValue(value.timeWindowEnabled
      ? {
          ...value,
          timeWindowEnabled: false,
          timeFrom: "18:00",
          timeTo: "23:59",
        }
      : { ...value, timeWindowEnabled: true });
  };

  return (
    <section className="space-y-3.5">
      <PreferenceConditionSection title="PREFER OFF TYPE">
        <PreferenceSegmentedControl
          className="max-w-[620px]"
          disabled={disabled}
          options={modeOptions}
          value={value.mode}
          onChange={selectMode}
        />
        {value.mode === null ? (
          <p className="m-0 mt-2 text-xs font-semibold text-[#b45b5b]">Choose one type to replace this legacy mixed bid.</p>
        ) : null}
      </PreferenceConditionSection>

      {!explicitDatesHidden && value.mode === "specific_dates" ? (
        <PreferenceConditionSection title="SPECIFIC DATES">
          <PbsDatePicker
            disabled={disabled}
            mode="multiple"
          periodCode={periodCode}
          periodEndDate={periodEndDate}
          periodStartDate={periodStartDate}
            selectedDates={value.specificDates}
            onSelectedDatesChange={(specificDates) => updateValue({ ...value, specificDates })}
          />
        </PreferenceConditionSection>
      ) : null}

      {!explicitDatesHidden && value.mode === "date_range" ? (
        <PreferenceConditionSection title="DATE RANGE">
          <PbsDatePicker
            disabled={disabled}
            mode="range"
          periodCode={periodCode}
          periodEndDate={periodEndDate}
          periodStartDate={periodStartDate}
            rangeFrom={value.rangeFrom}
            rangeTo={value.rangeTo}
            onRangeChange={(rangeFrom, rangeTo) => updateValue({ ...value, rangeFrom, rangeTo })}
          />
        </PreferenceConditionSection>
      ) : null}

      {value.mode === "days_of_week" ? (
        <PreferenceConditionSection title="DAYS OF WEEK">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(preferOffConfig?.weekdays ?? []).map((weekday) => {
              const active = value.weekdays.includes(weekday.name);
              return (
                <button
                  key={weekday.code}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f93ff]",
                    active
                      ? "border-[#7774d7] bg-[#efefff] text-[#5653b4]"
                      : "border-[#d8dde6] bg-white text-[#6f7485] hover:border-[#9a98e5]",
                  )}
                  disabled={disabled}
                  type="button"
                  onClick={() => updateValue({
                    ...value,
                    weekdays: active
                      ? value.weekdays.filter((item) => item !== weekday.name)
                      : [...value.weekdays, weekday.name],
                  })}
                >
                  {weekday.name}
                </button>
              );
            })}
          </div>
        </PreferenceConditionSection>
      ) : null}

      {value.mode === "weekends" ? (
        <PreferenceConditionSection contentClassName="flex items-center justify-between gap-3" title="WEEKEND DEFINITION">
          <div>
            <p className="m-0 mt-1 text-sm font-semibold text-[#303543]">{weekendLabel}</p>
          </div>
          <span className="rounded-full bg-[#eff0fb] px-2.5 py-1 text-xs font-bold text-[#5653b4]">
            {weekendCountLabel}
          </span>
        </PreferenceConditionSection>
      ) : null}

      <PreferenceConditionSection divider>
        <PreferenceInlineSwitch
          ariaLabel="Prefer Off time window"
          checked={value.timeWindowEnabled}
          disabled={disabled}
          label="TIME WINDOW"
          onToggle={toggleTimeWindow}
        />
        {value.timeWindowEnabled ? (
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <input
              aria-label="Prefer Off time from"
              className="h-10 rounded-lg border border-[#cfd6e4] bg-white px-3 text-sm font-semibold text-[#303543] outline-none focus:border-[#7774d7] focus:ring-2 focus:ring-[#7774d7]/15 disabled:cursor-not-allowed disabled:bg-[#f1f3f7] disabled:text-[#a4aab6]"
              disabled={disabled}
              type="time"
              value={value.timeFrom}
              onChange={(event) => updateValue({ ...value, timeFrom: event.target.value })}
            />
            <span className="text-2xs font-bold text-[#9299a7]">TO</span>
            <input
              aria-label="Prefer Off time to"
              className="h-10 rounded-lg border border-[#cfd6e4] bg-white px-3 text-sm font-semibold text-[#303543] outline-none focus:border-[#7774d7] focus:ring-2 focus:ring-[#7774d7]/15 disabled:cursor-not-allowed disabled:bg-[#f1f3f7] disabled:text-[#a4aab6]"
              disabled={disabled}
              type="time"
              value={value.timeTo}
              onChange={(event) => updateValue({ ...value, timeTo: event.target.value })}
            />
          </div>
        ) : null}
      </PreferenceConditionSection>
    </section>
  );
};
