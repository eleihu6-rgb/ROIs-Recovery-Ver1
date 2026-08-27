import { PbsDatePicker } from "./pbs-date-picker";
import {
  PreferenceConditionSection,
  PreferenceInlineSwitch,
  PreferenceSegmentedControl,
} from "./preference-condition-primitives";

export type OptionalEventDateScope =
  | { mode: "specific_dates"; dates: string[] }
  | { mode: "date_range"; from: string; to: string };

type OptionalEventDateScopeEditorProps = {
  ariaLabel: string;
  dateAriaLabel?: string;
  disabled?: boolean;
  label?: string;
  periodCode: string;
  periodEndDate?: string;
  periodStartDate?: string;
  switchAriaLabel?: string;
  value?: OptionalEventDateScope | null;
  onChange: (value: OptionalEventDateScope | null) => void;
};

export const OptionalEventDateScopeEditor = ({
  ariaLabel,
  dateAriaLabel = "event date",
  disabled = false,
  label = "LIMIT TO EVENT DATE",
  periodCode,
  periodEndDate = "",
  periodStartDate = "",
  switchAriaLabel,
  value,
  onChange,
}: OptionalEventDateScopeEditorProps) => {
  const enabled = value != null;
  const mode = value?.mode ?? "specific_dates";

  return (
    <PreferenceConditionSection divider>
      <PreferenceInlineSwitch
        ariaLabel={switchAriaLabel ?? `${ariaLabel} limit to event date`}
        checked={enabled}
        disabled={disabled}
        label={label}
        onToggle={() => onChange(enabled ? null : { mode: "specific_dates", dates: [] })}
      />

      {enabled ? (
        <div className="mt-3 grid max-w-[520px] gap-3">
          <PreferenceSegmentedControl
            className="max-w-[360px]"
            disabled={disabled}
            options={[
              { label: "Specific Dates", value: "specific_dates" },
              { label: "Date Range", value: "date_range" },
            ]}
            value={mode}
            onChange={(nextMode) => onChange(
              nextMode === "specific_dates"
                ? { mode: "specific_dates", dates: [] }
                : { mode: "date_range", from: "", to: "" },
            )}
          />
          {value?.mode === "specific_dates" ? (
            <PbsDatePicker
              calendarLabel={`${ariaLabel} ${dateAriaLabel}s calendar`}
              clearLabel={`Clear ${ariaLabel} ${dateAriaLabel}s`}
              disabled={disabled}
              mode="multiple"
              openLabel={`Open date picker for ${ariaLabel} ${dateAriaLabel}s`}
              periodCode={periodCode}
              periodEndDate={periodEndDate}
              periodStartDate={periodStartDate}
              removeDateLabel={(date) => `Remove ${date} from ${ariaLabel} ${dateAriaLabel}s`}
              selectedDates={value.dates}
              onSelectedDatesChange={(dates) => onChange({ mode: "specific_dates", dates })}
            />
          ) : null}
          {value?.mode === "date_range" ? (
            <PbsDatePicker
              calendarLabel={`${ariaLabel} ${dateAriaLabel} range calendar`}
              clearLabel={`Clear ${ariaLabel} ${dateAriaLabel} range`}
              disabled={disabled}
              mode="range"
              openLabel={`Open date picker for ${ariaLabel} ${dateAriaLabel} range`}
              periodCode={periodCode}
              periodEndDate={periodEndDate}
              periodStartDate={periodStartDate}
              rangeFrom={value.from}
              rangeTo={value.to}
              onRangeChange={(from, to) => onChange({ mode: "date_range", from, to })}
            />
          ) : null}
        </div>
      ) : null}
    </PreferenceConditionSection>
  );
};
