import { useEffect, useMemo, useState } from "react";

import type {
  PairingBidAction,
  PairingBidOperator,
  PairingBidQuantifier,
  PairingBidValue,
} from "@/features/pairing/types";
import {
  AwardAvoidSegmentedControl,
  PreferenceComparisonValueControl,
  PreferenceConditionSection,
  PreferenceSegmentedControl,
} from "@/shared/components/preferences";

type TimeBetweenFlightsOperator = "<" | "=" | ">";

type TimeBetweenFlightsEditorProps = {
  action: PairingBidAction | null;
  actionOptions: readonly PairingBidAction[];
  ariaLabel: string;
  disabled?: boolean;
  maximumMinutes: number | null;
  minimumMinutes: number;
  operator: PairingBidOperator | null;
  quantifier: PairingBidQuantifier | null;
  quantifierOptions: readonly PairingBidQuantifier[];
  value: PairingBidValue;
  onActionChange: (action: PairingBidAction) => void;
  onChange: (value: Extract<PairingBidValue, { type: "duration" }>) => void;
  onOperatorChange: (operator: TimeBetweenFlightsOperator) => void;
  onQuantifierChange: (quantifier: PairingBidQuantifier) => void;
  onValidityChange: (isValid: boolean) => void;
};

const EMPTY_TIME_BETWEEN_FLIGHTS_BID: Extract<PairingBidValue, { type: "duration" }> = {
  type: "duration",
  value: "",
  operator: ">",
};

const isTimeBetweenFlightsOperator = (
  value: PairingBidOperator | null,
): value is TimeBetweenFlightsOperator => value === "<" || value === "=" || value === ">";

const timeBetweenFlightsOperatorOptions = [
  { label: "<", value: "<" },
  { label: "=", value: "=" },
  { label: ">", value: ">" },
] satisfies ReadonlyArray<{ label: string; value: TimeBetweenFlightsOperator }>;

const buildQuantifierOptions = (options: readonly PairingBidQuantifier[]) =>
  options.map((option) => ({
    label: option === "any" ? "Any" : "Every",
    value: option,
  }));

const parseDurationMinutes = (value: string) => {
  const match = value.trim().match(/^(\d{1,3}):(\d{2})$/);

  if (!match || Number.parseInt(match[2], 10) >= 60) {
    return null;
  }

  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
};

const formatDuration = (minutes: number) => `${Math.floor(minutes / 60).toString().padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;

const normalizeTimeBetweenFlightsInput = (value: string) => {
  const parsedMinutes = parseDurationMinutes(value);

  if (parsedMinutes !== null) {
    return formatDuration(parsedMinutes);
  }

  const digits = value.replace(/\D/g, "").slice(0, 4);

  return digits.length === 4 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
};

const toTimeBetweenFlightsBid = (value: PairingBidValue): Extract<PairingBidValue, { type: "duration" }> =>
  value.type === "duration" ? { ...value } : { ...EMPTY_TIME_BETWEEN_FLIGHTS_BID };

export const isTimeBetweenFlightsBidValueValid = (
  value: PairingBidValue,
  minimumMinutes = 0,
  maximumMinutes: number | null = null,
) => {
  const minutes = parseDurationMinutes(toTimeBetweenFlightsBid(value).value);

  return minutes !== null
    && minutes >= minimumMinutes
    && (maximumMinutes === null || minutes <= maximumMinutes);
};

export const TimeBetweenFlightsEditor = ({
  action,
  actionOptions,
  ariaLabel,
  disabled = false,
  maximumMinutes,
  minimumMinutes,
  operator,
  quantifier,
  quantifierOptions,
  value,
  onActionChange,
  onChange,
  onOperatorChange,
  onQuantifierChange,
  onValidityChange,
}: TimeBetweenFlightsEditorProps) => {
  const bid = useMemo(() => toTimeBetweenFlightsBid(value), [value]);
  const matchOptions = useMemo(() => buildQuantifierOptions(quantifierOptions), [quantifierOptions]);
  const [rawValue, setRawValue] = useState(() => normalizeTimeBetweenFlightsInput(bid.value));
  const selectedOperator = isTimeBetweenFlightsOperator(operator) ? operator : null;
  const minutes = parseDurationMinutes(rawValue);
  const isWithinBounds = minutes !== null
    && minutes >= minimumMinutes
    && (maximumMinutes === null || minutes <= maximumMinutes);
  const isValid = selectedOperator !== null && isWithinBounds;
  const rangeText = maximumMinutes === null
    ? `Enter at least ${formatDuration(minimumMinutes)}.`
    : `Enter ${formatDuration(minimumMinutes)} to ${formatDuration(maximumMinutes)}.`;
  const placeholder = maximumMinutes === null
    ? `≥ ${formatDuration(minimumMinutes)}`
    : `${formatDuration(minimumMinutes)} – ${formatDuration(maximumMinutes)}`;
  const showError = rawValue.trim().length > 0 && !isWithinBounds;

  useEffect(() => {
    setRawValue(normalizeTimeBetweenFlightsInput(bid.value));
  }, [bid.value]);

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  const handleValueChange = (nextValue: string) => {
    const normalizedValue = normalizeTimeBetweenFlightsInput(nextValue);

    setRawValue(normalizedValue);
    onChange({ type: "duration", value: normalizedValue, operator: selectedOperator ?? bid.operator ?? ">" });
  };

  const handleOperatorChange = (nextOperator: TimeBetweenFlightsOperator) => {
    onOperatorChange(nextOperator);
    onChange({ type: "duration", value: rawValue, operator: nextOperator });
  };

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

      <PreferenceConditionSection title="MATCH">
        <PreferenceSegmentedControl
          disabled={disabled}
          options={matchOptions}
          value={quantifier}
          onChange={onQuantifierChange}
        />
      </PreferenceConditionSection>

      <PreferenceConditionSection title="TIME BETWEEN FLIGHTS" required contentClassName="space-y-1.5">
        <PreferenceComparisonValueControl
          disabled={disabled}
          inputAriaLabel={`${ariaLabel} duration`}
          inputInvalid={showError}
          inputMode="numeric"
          inputPaddingClassName="pr-20"
          inputPlaceholder={placeholder}
          inputType="text"
          inputValue={rawValue}
          operator={selectedOperator}
          operatorAriaLabel={`${ariaLabel} operator`}
          operatorOptions={timeBetweenFlightsOperatorOptions}
          suffix="hours : min"
          onInputChange={handleValueChange}
          onOperatorChange={handleOperatorChange}
        />
        {showError ? <p className="m-0 text-xs font-medium text-destructive">{rangeText}</p> : null}
      </PreferenceConditionSection>
    </section>
  );
};
