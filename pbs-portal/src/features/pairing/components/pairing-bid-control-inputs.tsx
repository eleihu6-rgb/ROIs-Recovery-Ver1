import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { Input } from "@/shared/components/ui/input";
import { PortalDatePicker } from "@/shared/components/ui/portal-date-picker";
import {
  clampPairingBidNumber,
  normalizePairingBidDuration,
  parsePairingBidNumberInput,
} from "@/features/pairing/pairing-bid-control-logic";

export const PAIRING_BID_CONTROL_CLASS =
  "h-[30px] rounded-xl border border-[#cfd6e4] bg-white px-[10px] text-sm font-medium leading-4 text-[#6f7485] shadow-none focus-visible:ring-0";

export const ControlRow = ({
  children,
  gapClass = "gap-[10px]",
  wrap = false,
}: {
  children: ReactNode;
  gapClass?: "gap-[6px]" | "gap-[10px]";
  wrap?: boolean;
}) => (
  <div className={`${wrap ? "flex flex-wrap" : "flex"} items-center ${gapClass}`}>
    {children}
  </div>
);

export const RangeInputGroup = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center gap-[6px]">
    {children}
  </div>
);

export const RangeSeparator = () => <span className="text-sm text-[#9ea5b3]">-</span>;

export const BidTextInput = ({
  ariaLabel,
  className,
  type,
  value,
  onValueChange,
}: {
  ariaLabel: string;
  className: string;
  type: "text" | "time";
  value: string;
  onValueChange: (value: string) => void;
}) => (
  <Input
    aria-label={ariaLabel}
    className={`${PAIRING_BID_CONTROL_CLASS} ${className}`}
    type={type}
    value={value}
    onChange={(event) => onValueChange(event.target.value)}
  />
);

export const BidDateInput = ({
  ariaLabel,
  disabled = false,
  value,
  onValueChange,
}: {
  ariaLabel: string;
  disabled?: boolean;
  value: string;
  onValueChange: (value: string) => void;
}) => (
  <PortalDatePicker
    ariaLabel={ariaLabel}
    className={`${PAIRING_BID_CONTROL_CLASS} w-[146px]`}
    disabled={disabled}
    value={value}
    onValueChange={onValueChange}
  />
);

export const BidTimeInput = ({
  ariaLabel,
  value,
  onValueChange,
}: {
  ariaLabel: string;
  value: string;
  onValueChange: (value: string) => void;
}) => (
  <BidTextInput
    ariaLabel={ariaLabel}
    className="w-[118px]"
    type="time"
    value={value}
    onValueChange={onValueChange}
  />
);

export const DurationInput = ({
  ariaLabel,
  value,
  onValueChange,
}: {
  ariaLabel: string;
  value: string;
  onValueChange: (value: string) => void;
}) => (
  <Input
    aria-label={ariaLabel}
    className={`${PAIRING_BID_CONTROL_CLASS} w-[118px]`}
    pattern="[0-9:]*"
    placeholder="HH:MM"
    type="text"
    value={value}
    onBlur={() => onValueChange(normalizePairingBidDuration(value))}
    onChange={(event) => onValueChange(event.target.value.replace(/[^0-9:]/g, ""))}
  />
);

export const StepperInput = ({
  ariaLabel,
  max,
  min,
  value,
  onValueChange,
}: {
  ariaLabel: string;
  max?: number;
  min?: number;
  value: number;
  onValueChange: (value: number) => void;
}) => (
  <Input
    aria-label={ariaLabel}
    className={`${PAIRING_BID_CONTROL_CLASS} w-[64px] text-center`}
    type="number"
    value={value}
    onChange={(event) => {
      const nextValue = parsePairingBidNumberInput(event.target.value);

      if (nextValue === null) {
        return;
      }

      onValueChange(clampPairingBidNumber(nextValue, min, max));
    }}
  />
);

const stepNumberValue = (value: number, delta: number, min?: number, max?: number) =>
  clampPairingBidNumber(value + delta, min, max);

export const LargeStepperInput = ({
  ariaLabel,
  className = "",
  disabled = false,
  max,
  min,
  value,
  onValueChange,
}: {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  max?: number;
  min?: number;
  value: number;
  onValueChange: (value: number) => void;
}) => {
  const canDecrease = min === undefined || value > min;
  const canIncrease = max === undefined || value < max;

  return (
    <div
      className={[
        "flex h-[46px] overflow-hidden rounded-lg border border-[#cfd6e4] bg-white",
        disabled ? "opacity-60" : "",
        className,
      ].join(" ")}
    >
      <Input
        aria-label={ariaLabel}
        className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-4 text-2xl font-bold text-[#282c3b] shadow-none [appearance:textfield] focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        disabled={disabled}
        inputMode="numeric"
        max={max}
        min={min}
        type="number"
        value={value}
        onChange={(event) => {
          const nextValue = parsePairingBidNumberInput(event.target.value);

          if (nextValue === null) {
            return;
          }

          onValueChange(clampPairingBidNumber(nextValue, min, max));
        }}
      />
      <div className="flex w-[52px] shrink-0 flex-col border-l border-[#d8dde6]">
        <button
          aria-label={`${ariaLabel} increase`}
          className="flex h-1/2 cursor-pointer items-center justify-center border-0 border-b border-[#d8dde6] bg-white p-0 text-[#748094] hover:bg-[#f8f9fb] disabled:cursor-default disabled:text-[#b8bfcc]"
          disabled={disabled || !canIncrease}
          type="button"
          onClick={() => onValueChange(stepNumberValue(value, 1, min, max))}
        >
          <ChevronUpIcon className="h-3.5 w-3.5 stroke-[2.4]" />
        </button>
        <button
          aria-label={`${ariaLabel} decrease`}
          className="flex h-1/2 cursor-pointer items-center justify-center border-0 bg-white p-0 text-[#748094] hover:bg-[#f8f9fb] disabled:cursor-default disabled:text-[#b8bfcc]"
          disabled={disabled || !canDecrease}
          type="button"
          onClick={() => onValueChange(stepNumberValue(value, -1, min, max))}
        >
          <ChevronDownIcon className="h-3.5 w-3.5 stroke-[2.4]" />
        </button>
      </div>
    </div>
  );
};

export const PercentInput = ({
  ariaLabel,
  value,
  onValueChange,
}: {
  ariaLabel: string;
  value: string;
  onValueChange: (value: string) => void;
}) => (
  <div className="relative w-[108px]">
    <Input
      aria-label={ariaLabel}
      className={`${PAIRING_BID_CONTROL_CLASS} w-full pr-[26px] text-right`}
      inputMode="decimal"
      type="number"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
    <span className="pointer-events-none absolute right-[10px] top-1/2 -translate-y-1/2 text-xs font-medium text-[#9ea5b3]">
      %
    </span>
  </div>
);

export const UnitSelect = ({
  ariaLabel,
  value,
  options,
  onValueChange,
}: {
  ariaLabel: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onValueChange: (value: string) => void;
}) => (
  <div className="relative w-[92px]">
    <select
      aria-label={ariaLabel}
      className={`${PAIRING_BID_CONTROL_CLASS} w-full appearance-none pr-8`}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={`${ariaLabel}-${option.value}`} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    <ChevronDownIcon className="pointer-events-none absolute right-[8px] top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8392]" />
  </div>
);
