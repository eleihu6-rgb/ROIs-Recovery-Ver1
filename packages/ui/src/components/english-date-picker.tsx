import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "./button";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
  ENGLISH_WEEKDAY_SHORT,
  buildCalendarCells,
  formatEnglishDate,
  formatEnglishMonth,
  getInitialCalendarMonth,
  parseIsoDate,
  shiftCalendarMonth,
} from "../lib/calendar-date";
import { cn } from "../lib/utils";

export interface EnglishDatePickerProps {
  ariaLabel: string;
  value: string;
  onValueChange: (value: string) => void;
  min?: string;
  max?: string;
  defaultMonth?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
  inputClassName?: string;
  testId?: string;
}

const dateButtonLabel = (isoDate: string): string => {
  const label = formatEnglishDate(isoDate);
  return label ? `Select ${label}` : `Select ${isoDate}`;
};

export const EnglishDatePicker = ({
  ariaLabel,
  value,
  onValueChange,
  min,
  max,
  defaultMonth,
  disabled = false,
  placeholder = "Select date",
  className,
  buttonClassName,
  popoverClassName,
  inputClassName,
  testId,
}: EnglishDatePickerProps) => {
  const [open, setOpen] = React.useState(false);
  const [visibleMonth, setVisibleMonth] = React.useState(() => getInitialCalendarMonth(value, defaultMonth));

  React.useEffect(() => {
    if (open) setVisibleMonth(getInitialCalendarMonth(value, defaultMonth));
  }, [defaultMonth, open, value]);

  const cells = React.useMemo(
    () => buildCalendarCells(visibleMonth, min, max),
    [max, min, visibleMonth],
  );
  const closedLabel = formatEnglishDate(value);

  return (
    <Popover open={open} onOpenChange={(nextOpen) => !disabled && setOpen(nextOpen)}>
      <div className={cn("inline-flex min-w-0", className)}>
        <PopoverTrigger asChild>
          <Button
            aria-label={ariaLabel}
            aria-expanded={open}
            className={cn(
              "h-8 min-w-[8.5rem] justify-between gap-2 px-2.5 text-xs font-normal tabular-nums",
              buttonClassName,
            )}
            data-testid={testId}
            disabled={disabled}
            type="button"
            variant="outline"
          >
            <span className={cn("truncate", closedLabel ? "text-foreground" : "text-muted-foreground")}>
              {closedLabel || placeholder}
            </span>
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent align="start" className={cn("w-72 p-3", popoverClassName)}>
        <div className="mb-3 flex items-center justify-between">
          <Button
            aria-label="Previous month"
            className="h-7 w-7"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => setVisibleMonth((current) => shiftCalendarMonth(current, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-semibold text-foreground">{formatEnglishMonth(visibleMonth)}</div>
          <Button
            aria-label="Next month"
            className="h-7 w-7"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => setVisibleMonth((current) => shiftCalendarMonth(current, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Input
          aria-label={`${ariaLabel} ISO value`}
          autoComplete="off"
          className={cn("mb-3 h-8 text-xs tabular-nums", inputClassName)}
          inputMode="numeric"
          maxLength={10}
          placeholder="YYYY-MM-DD"
          type="text"
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
            const parsed = parseIsoDate(event.target.value);
            if (parsed) setVisibleMonth({ year: parsed.year, monthIndex: parsed.monthIndex });
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        />

        <div className="grid grid-cols-7 gap-1 pb-2 text-center text-2xs font-semibold text-muted-foreground">
          {ENGLISH_WEEKDAY_SHORT.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`${ariaLabel} calendar`}>
          {cells.map((cell) => {
            const selected = value === cell.isoDate;
            return (
              <Button
                key={cell.key}
                aria-label={dateButtonLabel(cell.isoDate)}
                aria-pressed={selected}
                className={cn(
                  "h-8 rounded-md px-0 text-xs tabular-nums",
                  !cell.inCurrentMonth && "text-muted-foreground/45",
                  selected && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                )}
                disabled={cell.disabled}
                role="gridcell"
                type="button"
                variant={selected ? "default" : "ghost"}
                onClick={() => {
                  onValueChange(cell.isoDate);
                  setOpen(false);
                }}
              >
                {String(cell.day).padStart(2, "0")}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
