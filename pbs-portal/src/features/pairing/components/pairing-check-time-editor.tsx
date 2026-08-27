import { useEffect } from "react";

import {
  OptionalEventDateScopeEditor,
  PreferenceConditionSection,
  PreferenceSegmentedControl,
} from "@/shared/components/preferences";
import { cn } from "@/shared/lib/cn";
import type { PairingBidValue, PairingCheckTimeDateScope } from "@/features/pairing/types";

type PairingCheckTimeEditorProps = {
  ariaLabel: string;
  disableEventDateScope?: boolean;
  disabled?: boolean;
  periodCode: string;
  periodEndDate?: string;
  periodStartDate?: string;
  value: PairingBidValue;
  onChange: (value: PairingBidValue) => void;
  onValidityChange?: (isValid: boolean) => void;
};

type PairingCheckTimeBid = Extract<PairingBidValue, { type: "pairing-check-time" }>;
type PairingCheckTimeOperator = "=" | "<" | ">" | "Between";

const EMPTY_BID: PairingCheckTimeBid = {
  type: "pairing-check-time",
  timeType: "check_in",
  operator: "Between",
  from: "",
  to: "",
  dateScope: null,
};

const TIME_TYPE_OPTIONS = [
  { value: "check_in", label: "Check-In" },
  { value: "check_out", label: "Check-Out" },
] as const;

const QUICK_RANGES = [
  { value: "am", label: "AM 03:00–11:00", from: "03:00", to: "11:00" },
  { value: "pm", label: "PM 14:00–22:00", from: "14:00", to: "22:00" },
] as const;

const isPairingCheckTimeBid = (value: PairingBidValue): value is PairingCheckTimeBid =>
  value.type === "pairing-check-time";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const noopValidityChange = () => undefined;

const isValidTime = (value: string) => TIME_PATTERN.test(value);

const isDateScopeValid = (dateScope: PairingCheckTimeDateScope | null | undefined) => {
  if (!dateScope) {
    return true;
  }

  if (dateScope.mode === "specific_dates") {
    return dateScope.dates.length > 0 && dateScope.dates.every((date) => ISO_DATE_PATTERN.test(date));
  }

  return ISO_DATE_PATTERN.test(dateScope.from)
    && ISO_DATE_PATTERN.test(dateScope.to)
    && dateScope.from <= dateScope.to;
};

export const isPairingCheckTimeBidValueValid = (value: PairingBidValue) => {
  if (!isPairingCheckTimeBid(value)) {
    return false;
  }

  const isTimeValid = value.operator === "Between"
    ? isValidTime(value.from) && isValidTime(value.to) && value.from <= value.to
    : isValidTime(value.value);

  return isTimeValid && isDateScopeValid(value.dateScope);
};

const isQuickRangeActive = (
  bid: PairingCheckTimeBid,
  quickRange: (typeof QUICK_RANGES)[number],
) => bid.operator === "Between" && bid.from === quickRange.from && bid.to === quickRange.to;

export const PairingCheckTimeEditor = ({
  ariaLabel,
  disableEventDateScope = false,
  disabled = false,
  periodCode,
  periodEndDate = "",
  periodStartDate = "",
  value,
  onChange,
  onValidityChange = noopValidityChange,
}: PairingCheckTimeEditorProps) => {
  const bid = isPairingCheckTimeBid(value) ? value : EMPTY_BID;

  const updateBid = (nextBid: PairingCheckTimeBid) => onChange(nextBid);

  useEffect(() => {
    onValidityChange(isPairingCheckTimeBidValueValid(bid));
  }, [bid, onValidityChange]);

  const selectOperator = (operator: PairingCheckTimeOperator) => {
    if (operator === "Between") {
      const value = bid.operator === "Between" ? bid.from : bid.value;
      updateBid({
        type: "pairing-check-time",
        timeType: bid.timeType,
        operator,
        from: value,
        to: bid.operator === "Between" ? bid.to : "",
        dateScope: bid.dateScope ?? null,
      });
      return;
    }

    const value = bid.operator === "Between" ? bid.from : bid.value;
    updateBid({
      type: "pairing-check-time",
      timeType: bid.timeType,
      operator,
      value,
      dateScope: bid.dateScope ?? null,
    });
  };

  const quickRangeButtonClass = (active: boolean) => cn(
    "inline-flex h-8 cursor-pointer items-center rounded-lg border px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45",
    active
      ? "border-[#6866cc] bg-[#eef2ff] text-[#6866cc]"
      : "border-[#d8dde6] bg-white text-[#6f7485] shadow-[0_1px_2px_rgb(68_76_96_/_6%)] hover:border-[#c8ced8] hover:text-[#596176]",
  );

  return (
    <section className="space-y-4">
      <PreferenceConditionSection title="TIME TYPE">
        <PreferenceSegmentedControl
          className="max-w-[360px]"
          disabled={disabled}
          options={TIME_TYPE_OPTIONS}
          value={bid.timeType}
          onChange={(timeType) => updateBid({ ...bid, timeType })}
        />
      </PreferenceConditionSection>

      <PreferenceConditionSection contentClassName="space-y-3" title="TIME">
        <div className="flex max-w-[520px] gap-2.5">
          <select
            aria-label={`${ariaLabel} operator`}
            className="h-10 w-[130px] rounded-lg border border-[#d8dde6] bg-white px-3 text-sm font-semibold text-[#282c3b] focus:border-[#706cd5] focus:outline-none disabled:cursor-not-allowed disabled:opacity-45"
            disabled={disabled}
            value={bid.operator}
            onChange={(event) => selectOperator(event.target.value as PairingCheckTimeOperator)}
          >
            <option value="Between">Between</option>
            <option value="=">Exactly at</option>
            <option value="<">Before</option>
            <option value=">">After</option>
          </select>
          {bid.operator === "Between" ? (
            <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2">
              <input
                aria-label={`${ariaLabel} from`}
                className="h-10 min-w-0 rounded-lg border border-[#d8dde6] bg-white px-3 text-sm font-semibold text-[#282c3b] focus:border-[#706cd5] focus:outline-none disabled:cursor-not-allowed disabled:opacity-45"
                disabled={disabled}
                type="time"
                value={bid.from}
                onChange={(event) => updateBid({ ...bid, from: event.target.value })}
              />
              <span className="text-sm text-[#8d93a5]">—</span>
              <input
                aria-label={`${ariaLabel} to`}
                className="h-10 min-w-0 rounded-lg border border-[#d8dde6] bg-white px-3 text-sm font-semibold text-[#282c3b] focus:border-[#706cd5] focus:outline-none disabled:cursor-not-allowed disabled:opacity-45"
                disabled={disabled}
                type="time"
                value={bid.to}
                onChange={(event) => updateBid({ ...bid, to: event.target.value })}
              />
            </div>
          ) : (
            <input
              aria-label={ariaLabel}
              className="h-10 min-w-0 flex-1 rounded-lg border border-[#d8dde6] bg-white px-3 text-sm font-semibold text-[#282c3b] focus:border-[#706cd5] focus:outline-none disabled:cursor-not-allowed disabled:opacity-45"
              disabled={disabled}
              type="time"
              value={bid.value}
              onChange={(event) => updateBid({ ...bid, value: event.target.value })}
            />
          )}
        </div>
        <div
          aria-label={`${ariaLabel} quick time ranges`}
          className="flex max-w-[520px] flex-wrap items-center gap-2 rounded-lg border border-[#eceff4] bg-[#f8f9fb] p-2.5"
          role="group"
        >
          {QUICK_RANGES.map((quickRange) => (
            <button
              key={quickRange.value}
              aria-pressed={isQuickRangeActive(bid, quickRange)}
              className={quickRangeButtonClass(isQuickRangeActive(bid, quickRange))}
              disabled={disabled}
              type="button"
              onClick={() => updateBid({
                type: "pairing-check-time",
                timeType: bid.timeType,
                operator: "Between",
                from: quickRange.from,
                to: quickRange.to,
                dateScope: bid.dateScope ?? null,
              })}
            >
              {quickRange.label}
            </button>
          ))}
          <button
            aria-pressed={bid.operator === "Between" && !bid.from && !bid.to}
            className={quickRangeButtonClass(bid.operator === "Between" && !bid.from && !bid.to)}
            disabled={disabled}
            type="button"
            onClick={() => updateBid({
              type: "pairing-check-time",
              timeType: bid.timeType,
              operator: "Between",
              from: "",
              to: "",
              dateScope: bid.dateScope ?? null,
            })}
          >
            Custom
          </button>
        </div>
      </PreferenceConditionSection>

      {!disableEventDateScope ? (
        <OptionalEventDateScopeEditor
          ariaLabel={ariaLabel}
          disabled={disabled}
          periodCode={periodCode}
          periodEndDate={periodEndDate}
          periodStartDate={periodStartDate}
          value={bid.dateScope}
          onChange={(dateScope) => updateBid({ ...bid, dateScope })}
        />
      ) : null}
    </section>
  );
};
