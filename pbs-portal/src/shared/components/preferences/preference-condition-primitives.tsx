import type { ChangeEventHandler, CSSProperties, ReactNode } from "react";

import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/cn";

type PreferenceSectionTitleProps = {
  children: ReactNode;
  className?: string;
  required?: boolean;
};

export const PreferenceSectionTitle = ({
  children,
  className,
  required = false,
}: PreferenceSectionTitleProps) => (
  <p className={cn(
    "m-0 text-xs font-bold uppercase leading-4 tracking-[0.16em] text-[#748094]",
    className,
  )}>
    {children}
    {required ? <span className="text-[#b9575e]"> · REQUIRED</span> : null}
  </p>
);

type PreferenceConditionSectionProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  divider?: boolean;
  required?: boolean;
  title?: ReactNode;
};

export const PreferenceConditionSection = ({
  children,
  className,
  contentClassName,
  divider = false,
  required = false,
  title,
}: PreferenceConditionSectionProps) => (
  <section className={cn(divider ? "border-t border-[#e7ebf2] pt-3.5" : undefined, className)}>
    {title ? <PreferenceSectionTitle required={required}>{title}</PreferenceSectionTitle> : null}
    <div className={cn(title ? "mt-1.5" : undefined, contentClassName)}>{children}</div>
  </section>
);

type PreferenceInlineSwitchProps = {
  ariaLabel?: string;
  checked: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
};

export const PreferenceInlineSwitch = ({
  ariaLabel,
  checked,
  disabled = false,
  label,
  onToggle,
}: PreferenceInlineSwitchProps) => (
  <button
    aria-checked={checked}
    aria-label={ariaLabel}
    className="flex w-full cursor-pointer items-center justify-between gap-4 border-0 bg-transparent p-0 text-left disabled:cursor-default"
    disabled={disabled}
    role="switch"
    type="button"
    onClick={onToggle}
  >
    <span className="text-xs font-bold uppercase leading-4 tracking-[0.16em] text-[#748094]">
      {label}
    </span>
    <span
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition",
        checked ? "bg-[#6866cc]" : "bg-[#d8dde8]",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgb(44_50_68_/_18%)] transition",
          checked ? "left-[18px]" : "left-0.5",
        )}
      />
    </span>
  </button>
);

type PreferenceSegmentedOption<TValue extends string> = {
  ariaLabel?: string;
  disabled?: boolean;
  label: ReactNode;
  value: TValue;
};

type PreferenceSegmentedControlProps<TValue extends string> = {
  className?: string;
  disabled?: boolean;
  options: readonly PreferenceSegmentedOption<TValue>[];
  value: TValue | null;
  onChange: (value: TValue) => void;
};

export const PreferenceSegmentedControl = <TValue extends string>({
  className,
  disabled = false,
  options,
  value,
  onChange,
}: PreferenceSegmentedControlProps<TValue>) => {
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${Math.max(options.length, 1)}, minmax(0, 1fr))`,
  };

  return (
    <div
      className={cn("inline-grid w-full max-w-sm gap-1 rounded-xl bg-[#eef1f6] p-1", className)}
      style={gridStyle}
    >
      {options.map((option) => {
        const isSelected = value === option.value;

        return (
          <button
            key={option.value}
            aria-label={option.ariaLabel}
            aria-pressed={isSelected}
            className={cn(
              "h-9 cursor-pointer rounded-lg border-0 px-3 text-sm font-bold transition disabled:cursor-default",
              isSelected
                ? "bg-white text-[#5754cf] shadow-[0_2px_8px_rgba(68,76,96,0.14)]"
                : "bg-transparent text-[#627086] hover:bg-white/60",
            )}
            disabled={disabled || option.disabled}
            type="button"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

type PreferenceClearableSelectOption<TValue extends string> = {
  label: string;
  value: TValue;
};

type PreferenceClearableSelectProps<TValue extends string> = {
  ariaLabel: string;
  className?: string;
  clearAriaLabel: string;
  disabled?: boolean;
  options: readonly PreferenceClearableSelectOption<TValue>[];
  placeholder: string;
  value: TValue | null;
  onChange: (value: TValue | null) => void;
};

export const PreferenceClearableSelect = <TValue extends string>({
  ariaLabel,
  className,
  clearAriaLabel,
  disabled = false,
  options,
  placeholder,
  value,
  onChange,
}: PreferenceClearableSelectProps<TValue>) => (
  <div className={cn("relative max-w-xl", className)}>
    <select
      aria-label={ariaLabel}
      className={cn(
        "h-9 w-full appearance-none rounded-md border border-[#d5dbe7] bg-white px-3 py-0 text-sm font-semibold shadow-none outline-none transition focus-visible:border-2 focus-visible:border-[#7471d6] disabled:cursor-not-allowed disabled:opacity-45",
        value ? "pr-16 text-[#3f4658]" : "pr-9 text-[#9ba4b5]",
      )}
      disabled={disabled}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value === "" ? null : event.target.value as TValue)}
    >
      <option disabled hidden value="">
        {placeholder}
      </option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    {value && !disabled ? (
      <button
        aria-label={clearAriaLabel}
        className="absolute inset-y-0 right-8 flex w-6 items-center justify-center border-0 bg-transparent p-0 text-[#8d93a5] transition hover:text-[#5754cf]"
        type="button"
        onClick={() => onChange(null)}
      >
        <XMarkIcon className="h-3.5 w-3.5 stroke-[2.2]" />
      </button>
    ) : null}
    <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8d93a5]" />
  </div>
);

type PreferenceHourSliderProps = {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  maxHours: number;
  minHours: number;
  stepHours: number;
  valueHours: number;
  onChange: (valueHours: number) => void;
};

const clampHourValue = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const PreferenceHourSlider = ({
  ariaLabel,
  className,
  disabled = false,
  maxHours,
  minHours,
  stepHours,
  valueHours,
  onChange,
}: PreferenceHourSliderProps) => {
  const safeMin = Number.isSafeInteger(minHours) && minHours >= 0 ? minHours : 0;
  const safeMax = Number.isSafeInteger(maxHours) && maxHours >= safeMin ? maxHours : safeMin;
  const safeStep = Number.isSafeInteger(stepHours) && stepHours >= 1 ? stepHours : 1;
  const safeValue = clampHourValue(valueHours, safeMin, safeMax);
  const progress = safeMax === safeMin
    ? 100
    : ((safeValue - safeMin) / (safeMax - safeMin)) * 100;

  return (
    <div className={cn("max-w-[420px]", className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase leading-4 tracking-[0.16em] text-[#748094]">
          Preferred layover hours
        </span>
        <span className="rounded-full bg-[#eef0ff] px-2.5 py-1 text-xs font-bold text-[#5754cf]">
          {safeValue} hours
        </span>
      </div>
      <input
        aria-label={ariaLabel}
        className={cn(
          "h-5 w-full cursor-pointer appearance-none rounded-full bg-transparent disabled:cursor-default disabled:opacity-45",
          "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[#6866cc] [&::-moz-range-thumb]:shadow-[0_1px_5px_rgba(68,76,96,0.22)]",
          "[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full",
          "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full",
          "[&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#6866cc] [&::-webkit-slider-thumb]:shadow-[0_1px_5px_rgba(68,76,96,0.22)]",
        )}
        disabled={disabled}
        max={safeMax}
        min={safeMin}
        step={safeStep}
        style={{
          background: `linear-gradient(to right, #6866cc 0%, #6866cc ${progress}%, #d8dde8 ${progress}%, #d8dde8 100%)`,
        }}
        type="range"
        value={safeValue}
        onChange={(event) => onChange(clampHourValue(Number(event.target.value), safeMin, safeMax))}
      />
      <div className="mt-1 flex justify-between text-xs font-semibold text-[#8d93a5]">
        <span>{safeMin}</span>
        <span>{safeMax}</span>
      </div>
    </div>
  );
};

type PreferenceComparisonOption<TValue extends string> = {
  ariaLabel?: string;
  disabled?: boolean;
  label: ReactNode;
  value: TValue;
};

type PreferenceComparisonRangeConfig<TOperator extends string> = {
  fromAriaLabel: string;
  fromInvalid?: boolean;
  fromPlaceholder?: string;
  fromValue: string;
  operator: TOperator;
  toAriaLabel: string;
  toInvalid?: boolean;
  toPlaceholder?: string;
  toValue: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
};

type PreferenceComparisonValueControlProps<TOperator extends string> = {
  className?: string;
  disabled?: boolean;
  inputAriaLabel: string;
  inputClassName?: string;
  inputInvalid?: boolean;
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  inputPattern?: string;
  inputPaddingClassName?: string;
  inputPlaceholder?: string;
  inputType?: "number" | "text";
  inputValue: string;
  max?: number;
  min?: number;
  operator: TOperator | null;
  operatorAriaLabel: string;
  operatorOptions: readonly PreferenceComparisonOption<TOperator>[];
  operatorPlaceholder?: string;
  range?: PreferenceComparisonRangeConfig<TOperator>;
  suffix: string;
  onInputChange: (value: string) => void;
  onOperatorChange: (operator: TOperator) => void;
};

export const PreferenceComparisonValueControl = <TOperator extends string>({
  className,
  disabled = false,
  inputAriaLabel,
  inputClassName,
  inputInvalid = false,
  inputMode = "numeric",
  inputPattern,
  inputPaddingClassName = "pr-12",
  inputPlaceholder,
  inputType = "number",
  inputValue,
  max,
  min,
  operator,
  operatorAriaLabel,
  operatorOptions,
  operatorPlaceholder = "--",
  range,
  suffix,
  onInputChange,
  onOperatorChange,
}: PreferenceComparisonValueControlProps<TOperator>) => {
  const isRangeMode = range !== undefined && operator === range.operator;

  const renderInput = (
    ariaLabel: string,
    value: string,
    placeholder: string | undefined,
    invalid: boolean | undefined,
    onChange: (value: string) => void,
  ) => (
    <label className="relative z-0 min-w-0 flex-1 focus-within:z-10">
      <span className="sr-only">{ariaLabel}</span>
      <Input
        aria-invalid={invalid}
        aria-label={ariaLabel}
        className={cn(
          "relative z-0 h-9 w-full rounded-md border-[#d5dbe7] text-sm font-semibold shadow-none placeholder:font-semibold placeholder:text-[#9ba4b5] focus-visible:z-10 focus-visible:border-2 focus-visible:border-[#7471d6] focus-visible:ring-0",
          inputPaddingClassName,
          inputClassName,
        )}
        disabled={disabled}
        inputMode={inputMode}
        max={inputType === "number" ? max : undefined}
        min={inputType === "number" ? min : undefined}
        pattern={inputPattern}
        placeholder={placeholder}
        step={inputType === "number" ? "1" : undefined}
        type={inputType}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 z-20 flex items-center text-xs font-medium text-muted-foreground">
        {suffix}
      </span>
    </label>
  );

  return (
    <div className={cn("flex max-w-xl flex-wrap gap-2", className)}>
      <select
        aria-label={operatorAriaLabel}
        className="h-9 w-20 shrink-0 rounded-md border border-[#d5dbe7] bg-white px-3 text-sm font-bold text-[#5754cf] shadow-none outline-none focus-visible:border-2 focus-visible:border-[#7471d6] disabled:cursor-not-allowed disabled:opacity-45"
        disabled={disabled}
        value={operator ?? ""}
        onChange={(event) => onOperatorChange(event.target.value as TOperator)}
      >
        {operator === null ? (
          <option value="" disabled>
            {operatorPlaceholder}
          </option>
        ) : null}
        {operatorOptions.map((option) => (
          <option
            key={option.value}
            aria-label={option.ariaLabel}
            disabled={option.disabled}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
      {isRangeMode && range !== undefined ? (
        <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          {renderInput(range.fromAriaLabel, range.fromValue, range.fromPlaceholder, range.fromInvalid, range.onFromChange)}
          <span className="text-xs font-bold text-[#8d93a5]">TO</span>
          {renderInput(range.toAriaLabel, range.toValue, range.toPlaceholder, range.toInvalid, range.onToChange)}
        </div>
      ) : renderInput(inputAriaLabel, inputValue, inputPlaceholder, inputInvalid, onInputChange)}
    </div>
  );
};

type PreferenceNumberRangeProps = {
  disabled?: boolean;
  max?: number;
  maxAriaLabel: string;
  maxInvalid?: boolean;
  maxLabel: string;
  maxPlaceholder?: string;
  maxValue: string;
  min?: number;
  minAriaLabel: string;
  minInvalid?: boolean;
  minLabel: string;
  minPlaceholder?: string;
  minValue: string;
  suffix: string;
  onMaxChange: (value: string) => void;
  onMinChange: (value: string) => void;
};

export const PreferenceNumberRange = ({
  disabled = false,
  max,
  maxAriaLabel,
  maxInvalid = false,
  maxLabel,
  maxPlaceholder = "Max",
  maxValue,
  min,
  minAriaLabel,
  minInvalid = false,
  minLabel,
  minPlaceholder = "Min",
  minValue,
  suffix,
  onMaxChange,
  onMinChange,
}: PreferenceNumberRangeProps) => {
  const handleMinChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    onMinChange(event.target.value);
  };
  const handleMaxChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    onMaxChange(event.target.value);
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="relative z-0 min-w-0 focus-within:z-10">
        <span className="mb-1 block text-xs font-bold uppercase leading-4 tracking-[0.08em] text-[#748094]">
          {minLabel}
        </span>
        <Input
          aria-invalid={minInvalid}
          aria-label={minAriaLabel}
          className="h-9 w-full rounded-md border-[#d5dbe7] pr-12 text-sm font-semibold shadow-none placeholder:font-semibold placeholder:text-[#9ba4b5] focus-visible:z-10 focus-visible:border-2 focus-visible:border-[#7471d6] focus-visible:ring-0"
          disabled={disabled}
          inputMode="numeric"
          max={max}
          min={min}
          placeholder={minPlaceholder}
          step="1"
          type="number"
          value={minValue}
          onChange={handleMinChange}
        />
        <span className="pointer-events-none absolute bottom-0 right-3 flex h-9 items-center text-xs font-bold text-[#7f8798]">
          {suffix}
        </span>
      </label>

      <label className="relative z-0 min-w-0 focus-within:z-10">
        <span className="mb-1 block text-xs font-bold uppercase leading-4 tracking-[0.08em] text-[#748094]">
          {maxLabel}
        </span>
        <Input
          aria-invalid={maxInvalid}
          aria-label={maxAriaLabel}
          className="h-9 w-full rounded-md border-[#d5dbe7] pr-12 text-sm font-semibold shadow-none placeholder:font-semibold placeholder:text-[#9ba4b5] focus-visible:z-10 focus-visible:border-2 focus-visible:border-[#7471d6] focus-visible:ring-0"
          disabled={disabled}
          inputMode="numeric"
          max={max}
          min={min}
          placeholder={maxPlaceholder}
          step="1"
          type="number"
          value={maxValue}
          onChange={handleMaxChange}
        />
        <span className="pointer-events-none absolute bottom-0 right-3 flex h-9 items-center text-xs font-bold text-[#7f8798]">
          {suffix}
        </span>
      </label>
    </div>
  );
};
