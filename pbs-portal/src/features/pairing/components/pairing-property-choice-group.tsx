import { cn } from "@/shared/lib/cn";

type PairingPropertyChoiceGroupProps<TValue extends string> = {
  buttonClassName?: string;
  className?: string;
  disabled: boolean;
  label: string;
  optionsClassName?: string;
  options: readonly TValue[];
  selectedValue: TValue | null;
  getLabel: (value: TValue) => string;
  onSelect: (value: TValue) => void;
};

export const PairingPropertyChoiceGroup = <TValue extends string>({
  buttonClassName,
  className,
  disabled,
  label,
  optionsClassName,
  options,
  selectedValue,
  getLabel,
  onSelect,
}: PairingPropertyChoiceGroupProps<TValue>) => {
  if (options.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <p className="m-0 text-xs font-bold leading-4 text-[#8d93a5]">{label}</p>
      <div className={cn("mt-2", optionsClassName ?? "flex flex-wrap gap-2")}>
        {options.map((option) => (
          <button
            key={option}
            aria-pressed={selectedValue === option ? "true" : "false"}
            className={cn(
              "h-8 cursor-pointer rounded-lg border px-3 text-sm font-bold",
              selectedValue === option
                ? "border-[#6866cc] bg-[#eef2ff] text-[#6866cc]"
                : "border-[#d8dde6] bg-white text-[#6f7485]",
              buttonClassName,
            )}
            disabled={disabled}
            type="button"
            onClick={() => onSelect(option)}
          >
            {getLabel(option)}
          </button>
        ))}
      </div>
    </div>
  );
};
