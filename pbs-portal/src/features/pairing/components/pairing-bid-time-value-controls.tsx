import type { ReactNode } from "react";
import {
  BidDateInput,
  BidTimeInput,
  ControlRow,
  DurationInput,
  PercentInput,
  RangeInputGroup,
  RangeSeparator,
  UnitSelect,
} from "@/features/pairing/components/pairing-bid-control-inputs";
import {
  isValidPairingBidDuration,
  isValidPairingBidPercent,
  normalizePairingBidDuration,
  normalizePairingBidPercent,
} from "@/features/pairing/pairing-bid-control-logic";
import type { PairingBidValue } from "@/features/pairing/types";

type TimeValueBid =
  | Extract<PairingBidValue, { type: "time" }>
  | Extract<PairingBidValue, { type: "time-range" }>
  | Extract<PairingBidValue, { type: "duration" }>
  | Extract<PairingBidValue, { type: "duration-range" }>
  | Extract<PairingBidValue, { type: "time-condition-list" }>
  | Extract<PairingBidValue, { type: "time-date" }>
  | Extract<PairingBidValue, { type: "time-range-date" }>
  | Extract<PairingBidValue, { type: "date-range" }>
  | Extract<PairingBidValue, { type: "percent" }>
  | Extract<PairingBidValue, { type: "percent-or-duration" }>
  | Extract<PairingBidValue, { type: "percent-range" }>;

type TimeValueBidControlProps = {
  ariaLabel: string;
  bid: TimeValueBid;
  operatorShell: ReactNode;
  onChange: (value: PairingBidValue) => void;
};

export const TimeValueBidControl = ({
  ariaLabel,
  bid,
  operatorShell,
  onChange,
}: TimeValueBidControlProps) => {
  if (bid.type === "time") {
    return (
      <ControlRow>
        {operatorShell}
        <BidTimeInput
          ariaLabel={ariaLabel}
          value={bid.value}
          onValueChange={(value) => onChange({ ...bid, value })}
        />
      </ControlRow>
    );
  }

  if (bid.type === "time-range") {
    return (
      <ControlRow gapClass="gap-[6px]">
        {operatorShell}
        <BidTimeInput
          ariaLabel={`${ariaLabel} from`}
          value={bid.from}
          onValueChange={(from) => onChange({ ...bid, from })}
        />
        <RangeSeparator />
        <BidTimeInput
          ariaLabel={`${ariaLabel} to`}
          value={bid.to}
          onValueChange={(to) => onChange({ ...bid, to })}
        />
      </ControlRow>
    );
  }

  if (bid.type === "duration") {
    return (
      <ControlRow>
        {operatorShell}
        <DurationInput
          ariaLabel={ariaLabel}
          value={bid.value}
          onValueChange={(value) => onChange({ ...bid, value })}
        />
      </ControlRow>
    );
  }

  if (bid.type === "duration-range") {
    return (
      <ControlRow gapClass="gap-[6px]">
        {operatorShell}
        <DurationInput
          ariaLabel={`${ariaLabel} from`}
          value={bid.from}
          onValueChange={(from) => onChange({ ...bid, from })}
        />
        <RangeSeparator />
        <DurationInput
          ariaLabel={`${ariaLabel} to`}
          value={bid.to}
          onValueChange={(to) => onChange({ ...bid, to })}
        />
      </ControlRow>
    );
  }

  if (bid.type === "time-condition-list") {
    const firstCondition = bid.conditions[0];

    if (firstCondition?.operator === "Between") {
      return (
        <ControlRow gapClass="gap-[6px]">
          {operatorShell}
          <BidTimeInput
            ariaLabel={`${ariaLabel} from`}
            value={firstCondition.from}
            onValueChange={(from) =>
              onChange({
                ...bid,
                conditions: [{ ...firstCondition, from }],
              })}
          />
          <RangeSeparator />
          <BidTimeInput
            ariaLabel={`${ariaLabel} to`}
            value={firstCondition.to}
            onValueChange={(to) =>
              onChange({
                ...bid,
                conditions: [{ ...firstCondition, to }],
              })}
          />
        </ControlRow>
      );
    }

    return (
      <ControlRow>
        {operatorShell}
        <BidTimeInput
          ariaLabel={ariaLabel}
          value={firstCondition?.value ?? ""}
          onValueChange={(value) =>
            onChange({
              ...bid,
              conditions: [{
                operator: firstCondition?.operator ?? "=",
                value,
              }],
            })}
        />
      </ControlRow>
    );
  }

  if (bid.type === "time-date") {
    return (
      <ControlRow>
        {operatorShell}
        <BidTimeInput
          ariaLabel={ariaLabel}
          value={bid.value}
          onValueChange={(value) => onChange({ ...bid, value })}
        />
        <BidDateInput
          ariaLabel={`${ariaLabel} date`}
          value={bid.date}
          onValueChange={(date) => onChange({ ...bid, date })}
        />
      </ControlRow>
    );
  }

  if (bid.type === "time-range-date") {
    return (
      <ControlRow wrap>
        {operatorShell}
        <RangeInputGroup>
          <BidTimeInput
            ariaLabel={`${ariaLabel} from`}
            value={bid.from}
            onValueChange={(from) => onChange({ ...bid, from })}
          />
          <RangeSeparator />
          <BidTimeInput
            ariaLabel={`${ariaLabel} to`}
            value={bid.to}
            onValueChange={(to) => onChange({ ...bid, to })}
          />
        </RangeInputGroup>
        <BidDateInput
          ariaLabel={`${ariaLabel} date`}
          value={bid.date}
          onValueChange={(date) => onChange({ ...bid, date })}
        />
      </ControlRow>
    );
  }

  if (bid.type === "date-range") {
    return (
      <ControlRow gapClass="gap-[6px]">
        {operatorShell}
        <BidDateInput
          ariaLabel={`${ariaLabel} from`}
          value={bid.from}
          onValueChange={(from) => onChange({ ...bid, from })}
        />
        <RangeSeparator />
        <BidDateInput
          ariaLabel={`${ariaLabel} to`}
          value={bid.to}
          onValueChange={(to) => onChange({ ...bid, to })}
        />
      </ControlRow>
    );
  }

  if (bid.type === "percent") {
    return (
      <ControlRow>
        {operatorShell}
        <PercentInput
          ariaLabel={ariaLabel}
          value={bid.value}
          onValueChange={(value) => onChange({ ...bid, value })}
        />
      </ControlRow>
    );
  }

  if (bid.type === "percent-or-duration") {
    const isDurationUnit = bid.unit === "duration";

    return (
      <ControlRow>
        {operatorShell}
        <UnitSelect
          ariaLabel={`${ariaLabel} unit`}
          value={bid.unit}
          options={[
            { label: "%", value: "percent" },
            { label: "HHH:MM", value: "duration" },
          ]}
          onValueChange={(unit) => onChange({
            ...bid,
            unit: unit === "duration" ? "duration" : "percent",
            value: unit === "duration"
              ? (isValidPairingBidDuration(bid.value) ? normalizePairingBidDuration(bid.value) : "")
              : (isValidPairingBidPercent(bid.value) ? normalizePairingBidPercent(bid.value) : ""),
          })}
        />
        {isDurationUnit ? (
          <DurationInput
            ariaLabel={ariaLabel}
            value={bid.value}
            onValueChange={(value) => onChange({ ...bid, value })}
          />
        ) : (
          <PercentInput
            ariaLabel={ariaLabel}
            value={bid.value}
            onValueChange={(value) => onChange({ ...bid, value })}
          />
        )}
      </ControlRow>
    );
  }

  return (
    <ControlRow>
      {operatorShell}
      <RangeInputGroup>
        <PercentInput
          ariaLabel={`${ariaLabel} from`}
          value={bid.from}
          onValueChange={(from) => onChange({ ...bid, from })}
        />
        <RangeSeparator />
        <PercentInput
          ariaLabel={`${ariaLabel} to`}
          value={bid.to}
          onValueChange={(to) => onChange({ ...bid, to })}
        />
      </RangeInputGroup>
    </ControlRow>
  );
};
