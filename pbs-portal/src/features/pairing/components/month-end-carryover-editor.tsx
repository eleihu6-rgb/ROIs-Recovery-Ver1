import { useEffect, useMemo, useState } from "react";

import type {
  MonthEndCarryoverBid,
  PairingBidAction,
  PairingBidOperator,
  PairingBidValue,
} from "@/features/pairing/types";
import {
  AwardAvoidSegmentedControl,
  PreferenceComparisonValueControl,
  PreferenceConditionSection,
} from "@/shared/components/preferences";

type MonthEndCarryoverOperator = "<" | "=" | ">" | "Between";

type MonthEndCarryoverEditorProps = {
  action: PairingBidAction | null;
  actionOptions: readonly PairingBidAction[];
  ariaLabel: string;
  disabled?: boolean;
  operator: PairingBidOperator | null;
  value: PairingBidValue;
  onActionChange: (action: PairingBidAction) => void;
  onChange: (value: MonthEndCarryoverBid) => void;
  onOperatorChange: (operator: MonthEndCarryoverOperator) => void;
  onValidityChange: (isValid: boolean) => void;
};

const EMPTY_MONTH_END_CARRYOVER_BID: MonthEndCarryoverBid = {
  type: "month-end-carryover",
  operator: ">",
  days: null,
};

const OPERATOR_OPTIONS: readonly {
  ariaLabel: string;
  label: string;
  value: MonthEndCarryoverOperator;
}[] = [
  { ariaLabel: "Less than", label: "<", value: "<" },
  { ariaLabel: "Equal to", label: "=", value: "=" },
  { ariaLabel: "More than", label: ">", value: ">" },
  { ariaLabel: "Between", label: "Between", value: "Between" },
];

const isMonthEndCarryoverOperator = (
  operator: PairingBidOperator | null,
): operator is MonthEndCarryoverOperator =>
  operator === "<" || operator === "=" || operator === ">" || operator === "Between";

const isMonthEndCarryoverBid = (value: PairingBidValue): value is MonthEndCarryoverBid =>
  value.type === "month-end-carryover";

const isPositiveInteger = (value: number | null | undefined): value is number =>
  value != null && Number.isSafeInteger(value) && value > 0;

const parsePositiveInteger = (rawValue: string) => {
  if (!/^[1-9]\d*$/.test(rawValue.trim())) {
    return null;
  }

  return Number(rawValue);
};

const formatDayValue = (value: number | null | undefined) => value == null ? "" : String(value);

export const toMonthEndCarryoverBid = (value: PairingBidValue): MonthEndCarryoverBid =>
  isMonthEndCarryoverBid(value) ? { ...value } : { ...EMPTY_MONTH_END_CARRYOVER_BID };

export const isMonthEndCarryoverBidValueValid = (value: PairingBidValue) => {
  const bid = toMonthEndCarryoverBid(value);

  return bid.operator === "Between"
    ? isPositiveInteger(bid.from) && isPositiveInteger(bid.to) && bid.from <= bid.to
    : isPositiveInteger(bid.days);
};

export const MonthEndCarryoverEditor = ({
  action,
  actionOptions,
  ariaLabel,
  disabled = false,
  operator,
  value,
  onActionChange,
  onChange,
  onOperatorChange,
  onValidityChange,
}: MonthEndCarryoverEditorProps) => {
  const bid = useMemo(() => toMonthEndCarryoverBid(value), [value]);
  const selectedOperator = isMonthEndCarryoverOperator(operator) ? operator : null;
  const sourceOperator = selectedOperator ?? bid.operator;
  const [rawDays, setRawDays] = useState(() =>
    bid.operator === "Between" ? "" : formatDayValue(bid.days));
  const [rawFrom, setRawFrom] = useState(() =>
    bid.operator === "Between" ? formatDayValue(bid.from) : "");
  const [rawTo, setRawTo] = useState(() =>
    bid.operator === "Between" ? formatDayValue(bid.to) : "");
  const days = parsePositiveInteger(rawDays);
  const from = parsePositiveInteger(rawFrom);
  const to = parsePositiveInteger(rawTo);
  const isValid = selectedOperator === "Between"
    ? from !== null && to !== null && from <= to
    : selectedOperator !== null && days !== null;
  const showValidationMessage = (rawDays.length > 0 && days === null)
    || (selectedOperator === "Between" && (
      (rawFrom.length > 0 && from === null)
      || (rawTo.length > 0 && (to === null || (from !== null && to < from)))
    ));

  useEffect(() => {
    if (!isMonthEndCarryoverBid(value)) {
      onChange({ ...EMPTY_MONTH_END_CARRYOVER_BID });
    }
  }, [onChange, value]);

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  const emitChange = (
    nextOperator: MonthEndCarryoverOperator,
    nextDays: number | null,
    nextFrom: number | null,
    nextTo: number | null,
  ) => {
    if (nextOperator === "Between") {
      onChange({
        type: "month-end-carryover",
        operator: "Between",
        from: nextFrom,
        to: nextTo,
      });
      return;
    }

    onChange({
      type: "month-end-carryover",
      operator: nextOperator,
      days: nextDays,
    });
  };

  const handleOperatorChange = (nextOperator: MonthEndCarryoverOperator) => {
    onOperatorChange(nextOperator);
    emitChange(nextOperator, days, from, to);
  };

  const handleDaysChange = (nextRawValue: string) => {
    setRawDays(nextRawValue);
    emitChange(sourceOperator === "Between" ? ">" : sourceOperator, parsePositiveInteger(nextRawValue), from, to);
  };

  const handleFromChange = (nextRawValue: string) => {
    const nextFrom = parsePositiveInteger(nextRawValue);
    setRawFrom(nextRawValue);
    emitChange("Between", days, nextFrom, to);
  };

  const handleToChange = (nextRawValue: string) => {
    const nextTo = parsePositiveInteger(nextRawValue);
    setRawTo(nextRawValue);
    emitChange("Between", days, from, nextTo);
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

      <PreferenceConditionSection title="CARRY-OUT DAYS" contentClassName="space-y-1.5">
        <PreferenceComparisonValueControl
          disabled={disabled}
          inputAriaLabel={`${ariaLabel} carry-out days`}
          inputInvalid={rawDays.length > 0 && days === null}
          inputPlaceholder="Enter"
          inputValue={rawDays}
          min={1}
          operator={selectedOperator}
          operatorAriaLabel={`${ariaLabel} operator`}
          operatorOptions={OPERATOR_OPTIONS}
          range={{
            fromAriaLabel: `${ariaLabel} carry-out from days`,
            fromInvalid: rawFrom.length > 0 && from === null,
            fromPlaceholder: "From",
            fromValue: rawFrom,
            operator: "Between",
            toAriaLabel: `${ariaLabel} carry-out to days`,
            toInvalid: rawTo.length > 0 && (to === null || (from !== null && to < from)),
            toPlaceholder: "To",
            toValue: rawTo,
            onFromChange: handleFromChange,
            onToChange: handleToChange,
          }}
          suffix="days"
          onInputChange={handleDaysChange}
          onOperatorChange={handleOperatorChange}
        />
        {showValidationMessage ? (
            <p className="m-0 text-xs font-medium text-destructive">
              Enter whole carry-out days.
            </p>
          ) : null}
      </PreferenceConditionSection>
    </section>
  );
};
