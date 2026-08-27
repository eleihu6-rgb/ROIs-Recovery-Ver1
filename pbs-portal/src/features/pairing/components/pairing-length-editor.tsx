import { useEffect, useMemo, useState } from "react";

import {
  AwardAvoidSegmentedControl,
  OptionalEventDateScopeEditor,
  PreferenceConditionSection,
  PreferenceNumberRange,
} from "@/shared/components/preferences";
import type {
  PairingBidAction,
  PairingBidValue,
  PairingLengthBid,
  PairingLengthDateScope,
} from "@/features/pairing/types";

type PairingLengthEditorProps = {
  action: PairingBidAction | null;
  actionOptions: readonly PairingBidAction[];
  ariaLabel: string;
  disableEventDateScope?: boolean;
  disabled?: boolean;
  periodCode: string;
  periodEndDate?: string;
  periodStartDate?: string;
  value: PairingBidValue;
  onActionChange: (action: PairingBidAction) => void;
  onChange: (value: PairingLengthBid) => void;
  onValidityChange: (isValid: boolean) => void;
};

const DEFAULT_PAIRING_LENGTH_BID: PairingLengthBid = {
  type: "pairing-length-preference",
  minDays: null,
  maxDays: null,
  dateScope: null,
  min: 1,
  max: 7,
};

const isPairingLengthBid = (value: PairingBidValue): value is PairingLengthBid =>
  value.type === "pairing-length-preference";

const getRangeMin = (value: { min?: number }) => value.min ?? DEFAULT_PAIRING_LENGTH_BID.min ?? 1;
const getRangeMax = (value: { max?: number }) => value.max ?? DEFAULT_PAIRING_LENGTH_BID.max ?? 7;

export const toPairingLengthPreferenceBid = (value: PairingBidValue): PairingLengthBid => {
  if (isPairingLengthBid(value)) {
    return {
      ...DEFAULT_PAIRING_LENGTH_BID,
      ...value,
      dateScope: value.dateScope ? { ...value.dateScope } : null,
    };
  }

  if (value.type === "stepper-range") {
    return {
      ...DEFAULT_PAIRING_LENGTH_BID,
      minDays: value.from,
      maxDays: value.to,
      min: getRangeMin(value),
      max: getRangeMax(value),
    };
  }

  if (value.type === "stepper") {
    const min = getRangeMin(value);
    const max = getRangeMax(value);

    if (value.operator === ">") {
      const minDays = value.value + 1;
      return {
        ...DEFAULT_PAIRING_LENGTH_BID,
        minDays: minDays <= max ? minDays : null,
        maxDays: null,
        min,
        max,
      };
    }

    if (value.operator === "<") {
      const maxDays = value.value - 1;
      return {
        ...DEFAULT_PAIRING_LENGTH_BID,
        minDays: null,
        maxDays: maxDays >= min ? maxDays : null,
        min,
        max,
      };
    }

    return {
      ...DEFAULT_PAIRING_LENGTH_BID,
      minDays: value.value,
      maxDays: value.value,
      min,
      max,
    };
  }

  return { ...DEFAULT_PAIRING_LENGTH_BID };
};

const parseDayValue = (raw: string) => {
  const value = raw.trim();

  if (value.length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
};

const isDayValueValid = (value: number | null, min: number, max: number) =>
  value === null || (Number.isSafeInteger(value) && value >= min && value <= max);

const isDateScopeValid = (dateScope: PairingLengthDateScope | null) =>
  dateScope === null
  || (dateScope.mode === "specific_dates"
    ? dateScope.dates.length > 0
      && dateScope.dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    : /^\d{4}-\d{2}-\d{2}$/.test(dateScope.from)
    && /^\d{4}-\d{2}-\d{2}$/.test(dateScope.to)
    && dateScope.from <= dateScope.to);

export const isPairingLengthBidValueValid = (value: PairingBidValue) => {
  const bid = toPairingLengthPreferenceBid(value);
  const min = bid.min ?? 1;
  const max = bid.max ?? 7;

  return (bid.minDays !== null || bid.maxDays !== null)
    && isDayValueValid(bid.minDays, min, max)
    && isDayValueValid(bid.maxDays, min, max)
    && (bid.minDays === null || bid.maxDays === null || bid.minDays <= bid.maxDays)
    && isDateScopeValid(bid.dateScope ?? null);
};

export const PairingLengthEditor = ({
  action,
  actionOptions,
  ariaLabel,
  disableEventDateScope = false,
  disabled = false,
  periodCode,
  periodEndDate = "",
  periodStartDate = "",
  value,
  onActionChange,
  onChange,
  onValidityChange,
}: PairingLengthEditorProps) => {
  const normalizedBid = useMemo(() => toPairingLengthPreferenceBid(value), [value]);
  const [rawMinDays, setRawMinDays] = useState(() => normalizedBid.minDays === null ? "" : String(normalizedBid.minDays));
  const [rawMaxDays, setRawMaxDays] = useState(() => normalizedBid.maxDays === null ? "" : String(normalizedBid.maxDays));
  const [dateScope, setDateScope] = useState<PairingLengthDateScope | null>(() =>
    normalizedBid.dateScope ? { ...normalizedBid.dateScope } : null);
  const min = normalizedBid.min ?? 1;
  const max = normalizedBid.max ?? 7;
  const minDays = parseDayValue(rawMinDays);
  const maxDays = parseDayValue(rawMaxDays);
  const hasAnyDayValue = rawMinDays.trim().length > 0 || rawMaxDays.trim().length > 0;
  const isMinValid = isDayValueValid(minDays, min, max);
  const isMaxValid = isDayValueValid(maxDays, min, max);
  const isRangeValid = minDays === null || maxDays === null || minDays <= maxDays;
  const isValid = hasAnyDayValue
    && isMinValid
    && isMaxValid
    && isRangeValid
    && isDateScopeValid(dateScope);

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  const emitChange = (
    nextRawMinDays: string,
    nextRawMaxDays: string,
    nextDateScope: PairingLengthDateScope | null,
  ) => {
    const nextMinDays = parseDayValue(nextRawMinDays);
    const nextMaxDays = parseDayValue(nextRawMaxDays);

    onChange({
      ...normalizedBid,
      minDays: Number.isNaN(nextMinDays) ? null : nextMinDays,
      maxDays: Number.isNaN(nextMaxDays) ? null : nextMaxDays,
      dateScope: nextDateScope,
    });
  };

  const handleMinDaysChange = (nextRawValue: string) => {
    setRawMinDays(nextRawValue);
    emitChange(nextRawValue, rawMaxDays, dateScope);
  };

  const handleMaxDaysChange = (nextRawValue: string) => {
    setRawMaxDays(nextRawValue);
    emitChange(rawMinDays, nextRawValue, dateScope);
  };

  const rangeHint = `Enter whole days from ${min} to ${max}.`;
  const showDayError = (rawMinDays.length > 0 && !isMinValid)
    || (rawMaxDays.length > 0 && !isMaxValid)
    || (isMinValid && isMaxValid && !isRangeValid);

  return (
    <section className="space-y-3.5">
      <PreferenceConditionSection title="PREFERENCE">
        <AwardAvoidSegmentedControl
          disabled={disabled}
          options={actionOptions}
          value={action}
          onChange={onActionChange}
        />
      </PreferenceConditionSection>

      <PreferenceConditionSection contentClassName="space-y-1.5">
        <PreferenceNumberRange
          disabled={disabled}
          max={max}
          maxAriaLabel={`${ariaLabel} maximum days`}
          maxInvalid={rawMaxDays.length > 0 && (!isMaxValid || !isRangeValid)}
          maxLabel="Max days"
          maxValue={rawMaxDays}
          min={min}
          minAriaLabel={`${ariaLabel} minimum days`}
          minInvalid={rawMinDays.length > 0 && (!isMinValid || !isRangeValid)}
          minLabel="Min days"
          minValue={rawMinDays}
          suffix="days"
          onMaxChange={handleMaxDaysChange}
          onMinChange={handleMinDaysChange}
        />
        {showDayError ? (
          <p className="m-0 text-xs font-medium text-destructive">
            {isRangeValid ? rangeHint : "Min days must be less than or equal to max days."}
          </p>
        ) : null}
      </PreferenceConditionSection>

      {!disableEventDateScope ? (
        <OptionalEventDateScopeEditor
          ariaLabel={ariaLabel}
          dateAriaLabel="pairing start date"
          disabled={disabled}
          label="LIMIT TO PAIRING START DATE"
          periodCode={periodCode}
          periodEndDate={periodEndDate}
          periodStartDate={periodStartDate}
          switchAriaLabel="LIMIT TO PAIRING START DATE"
          value={dateScope}
          onChange={(nextDateScope) => {
            setDateScope(nextDateScope);
            emitChange(rawMinDays, rawMaxDays, nextDateScope);
          }}
        />
      ) : null}
    </section>
  );
};
