import type { ReactNode } from "react";
import {
  BidDateInput,
  ControlRow,
  RangeInputGroup,
  RangeSeparator,
  StepperInput,
} from "@/features/pairing/components/pairing-bid-control-inputs";
import type { PairingBidValue } from "@/features/pairing/types";

type StepperBid =
  | Extract<PairingBidValue, { type: "stepper" }>
  | Extract<PairingBidValue, { type: "stepper-range" }>
  | Extract<PairingBidValue, { type: "stepper-date" }>
  | Extract<PairingBidValue, { type: "stepper-range-date" }>
  | Extract<PairingBidValue, { type: "stepper-date-range" }>;

type StepperBidControlProps = {
  ariaLabel: string;
  bid: StepperBid;
  operatorShell: ReactNode;
  onChange: (value: PairingBidValue) => void;
};

export const StepperBidControl = ({
  ariaLabel,
  bid,
  operatorShell,
  onChange,
}: StepperBidControlProps) => {
  if (bid.type === "stepper") {
    return (
      <ControlRow>
        {operatorShell}
        <StepperInput
          ariaLabel={ariaLabel}
          max={bid.max}
          min={bid.min}
          value={bid.value}
          onValueChange={(value) => onChange({ ...bid, value })}
        />
      </ControlRow>
    );
  }

  if (bid.type === "stepper-range") {
    return (
      <ControlRow>
        {operatorShell}
        <RangeInputGroup>
          <StepperInput
            ariaLabel={`${ariaLabel} from`}
            max={bid.max}
            min={bid.min}
            value={bid.from}
            onValueChange={(from) => onChange({ ...bid, from })}
          />
          <RangeSeparator />
          <StepperInput
            ariaLabel={`${ariaLabel} to`}
            max={bid.max}
            min={bid.min}
            value={bid.to}
            onValueChange={(to) => onChange({ ...bid, to })}
          />
        </RangeInputGroup>
      </ControlRow>
    );
  }

  if (bid.type === "stepper-date") {
    return (
      <ControlRow>
        {operatorShell}
        <StepperInput
          ariaLabel={ariaLabel}
          max={bid.max}
          min={bid.min}
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

  if (bid.type === "stepper-range-date") {
    return (
      <ControlRow wrap>
        {operatorShell}
        <RangeInputGroup>
          <StepperInput
            ariaLabel={`${ariaLabel} from`}
            max={bid.max}
            min={bid.min}
            value={bid.from}
            onValueChange={(from) => onChange({ ...bid, from })}
          />
          <RangeSeparator />
          <StepperInput
            ariaLabel={`${ariaLabel} to`}
            max={bid.max}
            min={bid.min}
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

  return (
    <ControlRow wrap>
      {operatorShell}
      <StepperInput
        ariaLabel={`${ariaLabel} consecutive days`}
        max={bid.max}
        min={bid.min}
        value={bid.value}
        onValueChange={(value) => onChange({ ...bid, value })}
      />
      <span className="text-sm font-medium text-[#6f7485]">consecutive days between</span>
      <RangeInputGroup>
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
      </RangeInputGroup>
    </ControlRow>
  );
};
