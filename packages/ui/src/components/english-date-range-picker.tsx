import * as React from "react";

import { compareIsoDates } from "../lib/calendar-date";
import { cn } from "../lib/utils";
import { EnglishDatePicker } from "./english-date-picker";

export interface EnglishDateRangePickerProps {
  ariaLabel: string;
  startValue: string;
  endValue: string;
  onStartValueChange: (value: string) => void;
  onEndValueChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  pickerClassName?: string;
  pickerButtonClassName?: string;
  separator?: React.ReactNode;
  startTestId?: string;
  endTestId?: string;
}

const earlierDate = (left?: string, right?: string): string | undefined => {
  if (!left) return right;
  if (!right) return left;
  return compareIsoDates(left, right) <= 0 ? left : right;
};

const laterDate = (left?: string, right?: string): string | undefined => {
  if (!left) return right;
  if (!right) return left;
  return compareIsoDates(left, right) >= 0 ? left : right;
};

export const EnglishDateRangePicker = ({
  ariaLabel,
  startValue,
  endValue,
  onStartValueChange,
  onEndValueChange,
  min,
  max,
  disabled = false,
  className,
  pickerClassName,
  pickerButtonClassName,
  separator = <span className="text-2xs text-muted-foreground/70">~</span>,
  startTestId,
  endTestId,
}: EnglishDateRangePickerProps) => (
  <div className={cn("inline-flex items-center gap-1", className)}>
    <EnglishDatePicker
      ariaLabel={`${ariaLabel} start`}
      className={pickerClassName}
      buttonClassName={pickerButtonClassName}
      disabled={disabled}
      max={earlierDate(endValue || undefined, max)}
      min={min}
      testId={startTestId}
      value={startValue}
      onValueChange={onStartValueChange}
    />
    {separator}
    <EnglishDatePicker
      ariaLabel={`${ariaLabel} end`}
      className={pickerClassName}
      buttonClassName={pickerButtonClassName}
      disabled={disabled}
      max={max}
      min={laterDate(startValue || undefined, min)}
      testId={endTestId}
      value={endValue}
      onValueChange={onEndValueChange}
    />
  </div>
);
