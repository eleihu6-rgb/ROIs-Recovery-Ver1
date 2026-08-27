import { useEffect, useMemo, useState } from "react";

import {
  AwardAvoidSegmentedControl,
  OptionalEventDateScopeEditor,
  PreferenceComparisonValueControl,
  PreferenceConditionSection,
  PreferenceSegmentedControl,
} from "@/shared/components/preferences";
import type {
  FlightLegsPerDutyBid,
  PairingBidAction,
  PairingBidOperator,
  PairingBidQuantifier,
  PairingBidValue,
  PairingEventDateScope,
} from "@/features/pairing/types";

type FlightLegsOperator = "=" | "<" | ">" | "Between";
type NumericBounds = { min: number; max: number };

type FlightLegsPerDutyEditorProps = {
  action: PairingBidAction | null;
  actionOptions: readonly PairingBidAction[];
  ariaLabel: string;
  disableEventDateScope?: boolean;
  disabled?: boolean;
  isNew: boolean;
  numericBounds: NumericBounds;
  operator: PairingBidOperator | null;
  periodCode: string;
  periodEndDate?: string;
  periodStartDate?: string;
  quantifier: PairingBidQuantifier | null;
  quantifierOptions: readonly PairingBidQuantifier[];
  value: PairingBidValue;
  onActionChange: (action: PairingBidAction) => void;
  onChange: (value: PairingBidValue) => void;
  onOperatorChange: (operator: FlightLegsOperator) => void;
  onQuantifierChange: (quantifier: PairingBidQuantifier) => void;
  onValidityChange: (isValid: boolean) => void;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isFlightLegsOperator = (operator: PairingBidOperator | null): operator is FlightLegsOperator =>
  operator === "=" || operator === "<" || operator === ">" || operator === "Between";

const isFlightLegsBid = (value: PairingBidValue): value is FlightLegsPerDutyBid =>
  value.type === "flight-legs-per-duty";

const isLegCountWithinRange = (value: number, bounds: NumericBounds) =>
  Number.isSafeInteger(value) && value >= bounds.min && value <= bounds.max;

const isDateScopeValid = (dateScope: PairingEventDateScope | null | undefined) => {
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

const getDutyMatchOptions = (options: readonly PairingBidQuantifier[]) =>
  options.map((option) => ({
    label: option === "every" ? "Every duty" : "Any duty",
    value: option,
  }));

const OPERATOR_OPTIONS: readonly { ariaLabel: string; label: string; value: FlightLegsOperator }[] = [
  { ariaLabel: "Less than", label: "<", value: "<" },
  { ariaLabel: "Equal to", label: "=", value: "=" },
  { ariaLabel: "More than", label: ">", value: ">" },
  { ariaLabel: "Between", label: "Between", value: "Between" },
];

export const isFlightLegsPerDutyBidValueValid = (
  value: PairingBidValue,
  bounds: NumericBounds = { min: 1, max: 8 },
) => {
  if (!isFlightLegsBid(value) || !isDateScopeValid(value.dateScope)) {
    return false;
  }

  return value.operator === "Between"
    ? isLegCountWithinRange(value.from, bounds)
      && isLegCountWithinRange(value.to, bounds)
      && value.from <= value.to
    : isLegCountWithinRange(value.legs, bounds);
};

export const FlightLegsPerDutyEditor = ({
  action,
  actionOptions,
  ariaLabel,
  disableEventDateScope = false,
  disabled = false,
  isNew,
  numericBounds,
  operator,
  periodCode,
  periodEndDate = "",
  periodStartDate = "",
  quantifier,
  quantifierOptions,
  value,
  onActionChange,
  onChange,
  onOperatorChange,
  onQuantifierChange,
  onValidityChange,
}: FlightLegsPerDutyEditorProps) => {
  const initialBid = isFlightLegsBid(value) ? value : null;
  const [selectedOperator, setSelectedOperator] = useState<FlightLegsOperator | null>(() =>
    isNew ? null : initialBid?.operator ?? (isFlightLegsOperator(operator) ? operator : null));
  const [rawLegValue, setRawLegValue] = useState(() =>
    isNew || initialBid === null || initialBid.operator === "Between" ? "" : String(initialBid.legs));
  const [rawFrom, setRawFrom] = useState(() =>
    isNew || initialBid?.operator !== "Between" ? "" : String(initialBid.from));
  const [rawTo, setRawTo] = useState(() =>
    isNew || initialBid?.operator !== "Between" ? "" : String(initialBid.to));
  const [dateScope, setDateScope] = useState<PairingEventDateScope | null>(initialBid?.dateScope ?? null);
  const parsedLegValue = useMemo(() => Number(rawLegValue), [rawLegValue]);
  const parsedFrom = useMemo(() => Number(rawFrom), [rawFrom]);
  const parsedTo = useMemo(() => Number(rawTo), [rawTo]);

  const buildBid = (
    nextOperator = selectedOperator,
    nextDateScope = dateScope,
    nextRawLegValue = rawLegValue,
    nextRawFrom = rawFrom,
    nextRawTo = rawTo,
  ): FlightLegsPerDutyBid | null => {
    if (nextOperator === null || !isDateScopeValid(nextDateScope)) {
      return null;
    }

    if (nextOperator === "Between") {
      const nextFrom = Number(nextRawFrom);
      const nextTo = Number(nextRawTo);
      return nextRawFrom.trim().length > 0
        && nextRawTo.trim().length > 0
        && isLegCountWithinRange(nextFrom, numericBounds)
        && isLegCountWithinRange(nextTo, numericBounds)
        && nextFrom <= nextTo
        ? { type: "flight-legs-per-duty", operator: "Between", from: nextFrom, to: nextTo, dateScope: nextDateScope }
        : null;
    }

    const nextLegValue = Number(nextRawLegValue);
    return nextRawLegValue.trim().length > 0 && isLegCountWithinRange(nextLegValue, numericBounds)
      ? { type: "flight-legs-per-duty", operator: nextOperator, legs: nextLegValue, dateScope: nextDateScope }
      : null;
  };

  const validBid = buildBid();
  const isValid = validBid !== null;

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  const emitIfValid = (
    nextOperator = selectedOperator,
    nextDateScope = dateScope,
    nextRawLegValue = rawLegValue,
    nextRawFrom = rawFrom,
    nextRawTo = rawTo,
  ) => {
    const nextBid = buildBid(
      nextOperator,
      nextDateScope,
      nextRawLegValue,
      nextRawFrom,
      nextRawTo,
    );
    if (nextBid) {
      onChange(nextBid);
    }
  };

  const handleOperatorChange = (nextOperator: FlightLegsOperator) => {
    setSelectedOperator(nextOperator);
    onOperatorChange(nextOperator);
    emitIfValid(nextOperator);
  };

  const rangeHint = `Enter whole numbers from ${numericBounds.min} to ${numericBounds.max}, with From no greater than To.`;
  const singleValueInvalid = rawLegValue.length > 0
    && !isLegCountWithinRange(parsedLegValue, numericBounds);
  const fromInvalid = rawFrom.length > 0 && !isLegCountWithinRange(parsedFrom, numericBounds);
  const toInvalid = rawTo.length > 0
    && (!isLegCountWithinRange(parsedTo, numericBounds)
      || (rawFrom.length > 0 && isLegCountWithinRange(parsedFrom, numericBounds) && parsedFrom > parsedTo));

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

      <PreferenceConditionSection title="DUTY MATCH">
        <PreferenceSegmentedControl
          disabled={disabled}
          options={getDutyMatchOptions(quantifierOptions)}
          value={quantifier}
          onChange={onQuantifierChange}
        />
      </PreferenceConditionSection>

      <PreferenceConditionSection title="LEGS PER DUTY" contentClassName="space-y-1.5">
        <PreferenceComparisonValueControl
          disabled={disabled}
          inputAriaLabel={`${ariaLabel} legs per duty`}
          inputInvalid={singleValueInvalid}
          inputPlaceholder="Enter legs"
          inputValue={rawLegValue}
          max={numericBounds.max}
          min={numericBounds.min}
          operator={selectedOperator}
          operatorAriaLabel={`${ariaLabel} operator`}
          operatorOptions={OPERATOR_OPTIONS}
          range={{
            fromAriaLabel: `${ariaLabel} from legs`,
            fromInvalid,
            fromPlaceholder: "From",
            fromValue: rawFrom,
            operator: "Between",
            toAriaLabel: `${ariaLabel} to legs`,
            toInvalid,
            toPlaceholder: "To",
            toValue: rawTo,
            onFromChange: (nextValue) => {
              setRawFrom(nextValue);
              emitIfValid(selectedOperator, dateScope, rawLegValue, nextValue, rawTo);
            },
            onToChange: (nextValue) => {
              setRawTo(nextValue);
              emitIfValid(selectedOperator, dateScope, rawLegValue, rawFrom, nextValue);
            },
          }}
          suffix="legs"
          onInputChange={(nextValue) => {
            setRawLegValue(nextValue);
            emitIfValid(selectedOperator, dateScope, nextValue);
          }}
          onOperatorChange={handleOperatorChange}
        />
        {singleValueInvalid || fromInvalid || toInvalid ? (
          <p className="m-0 text-xs font-medium text-destructive">{rangeHint}</p>
        ) : null}
      </PreferenceConditionSection>

      {!disableEventDateScope ? (
        <OptionalEventDateScopeEditor
          ariaLabel={ariaLabel}
          disabled={disabled}
          periodCode={periodCode}
          periodEndDate={periodEndDate}
          periodStartDate={periodStartDate}
          value={dateScope}
          onChange={(nextDateScope) => {
            setDateScope(nextDateScope);
            emitIfValid(selectedOperator, nextDateScope);
          }}
        />
      ) : null}
    </section>
  );
};
