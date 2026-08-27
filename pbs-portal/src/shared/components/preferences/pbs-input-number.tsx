import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/20/solid";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/shared/lib/cn";

type PbsInputNumberProps = {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  max?: number;
  min?: number;
  placeholder?: string;
  size?: "compact" | "large";
  stepperLabel?: string;
  value: number | null;
  onChange: (value: number | null) => void;
};

const clamp = (value: number, min?: number, max?: number) =>
  Math.min(Math.max(value, min ?? Number.MIN_SAFE_INTEGER), max ?? Number.MAX_SAFE_INTEGER);

const toText = (value: number | null) => value === null ? "" : String(value);

export const PbsInputNumber = ({
  ariaLabel,
  className,
  disabled = false,
  max,
  min,
  placeholder = "--",
  size = "large",
  stepperLabel = ariaLabel,
  value,
  onChange,
}: PbsInputNumberProps) => {
  const [text, setText] = useState(() => toText(value));
  const numericValue = useMemo(() => {
    if (!/^\d+$/.test(text)) {
      return null;
    }

    const parsed = Number.parseInt(text, 10);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }, [text]);
  const effectiveMin = min ?? 0;
  const canDecrease = numericValue !== null && numericValue > effectiveMin;
  const canIncrease = numericValue === null || max === undefined || numericValue < max;

  useEffect(() => {
    setText(toText(value));
  }, [value]);

  const commit = () => {
    if (numericValue === null) {
      setText("");
      onChange(null);
      return;
    }

    const nextValue = clamp(numericValue, min, max);
    setText(String(nextValue));
    onChange(nextValue);
  };

  const step = (delta: number) => {
    const nextValue = numericValue === null
      ? effectiveMin
      : clamp(numericValue + delta, min, max);
    setText(String(nextValue));
    onChange(nextValue);
  };

  const compact = size === "compact";

  return (
    <span
      className={cn(
        "grid overflow-hidden rounded-lg border border-[#cfd6e4] bg-white focus-within:border-[#7774d7] focus-within:ring-2 focus-within:ring-[#7774d7]/15",
        compact ? "h-10 grid-cols-[1fr_28px]" : "h-[46px] grid-cols-[1fr_52px]",
        className,
      )}
    >
      <input
        aria-label={ariaLabel}
        className={cn(
          "min-w-0 border-0 bg-transparent outline-none placeholder:text-[#aeb5c2] disabled:cursor-not-allowed disabled:bg-[#f5f7fa] disabled:text-[#a4aab6]",
          compact
            ? "px-3 text-sm font-semibold text-[#303543] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            : "px-4 text-2xl font-bold text-[#282c3b] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        )}
        disabled={disabled}
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder={placeholder}
        type="number"
        value={text}
        onBlur={commit}
        onChange={(event) => {
          const nextText = event.target.value;

          if (!/^\d*$/.test(nextText)) {
            return;
          }

          setText(nextText);
          if (nextText.length === 0) {
            onChange(null);
            return;
          }

          const nextValue = Number.parseInt(nextText, 10);
          if (Number.isSafeInteger(nextValue)) {
            onChange(nextValue);
          }
        }}
      />
      <span className="grid grid-rows-2 border-l border-[#e1e5ed]">
        <button
          aria-label={`Increase ${stepperLabel}`}
          className="inline-flex cursor-pointer items-center justify-center border-b border-[#e1e5ed] text-[#6f7485] hover:bg-[#f3f4ff] hover:text-[#5653b4] disabled:cursor-not-allowed disabled:text-[#c2c7d0]"
          disabled={disabled || !canIncrease}
          type="button"
          onClick={() => step(1)}
        >
          <ChevronUpIcon className="h-3 w-3" />
        </button>
        <button
          aria-label={`Decrease ${stepperLabel}`}
          className="inline-flex cursor-pointer items-center justify-center text-[#6f7485] hover:bg-[#f3f4ff] hover:text-[#5653b4] disabled:cursor-not-allowed disabled:text-[#c2c7d0]"
          disabled={disabled || !canDecrease}
          type="button"
          onClick={() => step(-1)}
        >
          <ChevronDownIcon className="h-3 w-3" />
        </button>
      </span>
    </span>
  );
};
