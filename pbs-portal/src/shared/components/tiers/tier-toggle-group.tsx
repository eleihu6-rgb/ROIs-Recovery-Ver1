import { cn } from "@/shared/lib/cn";

export const TIER_TOGGLE_COLUMN_WIDTHS = {
  compact: "236px",
  medium: "240px",
  wide: "245px",
} as const;

export type TierToggleOption = {
  key: string;
  label: string;
  active?: boolean;
};

type TierToggleGroupProps = {
  options: TierToggleOption[];
  width?: string;
  buttonClass?: string;
  readonly?: boolean;
  getAriaLabel?: (option: TierToggleOption) => string;
  onToggle: (key: string) => void;
};

export const TierToggleGroup = ({
  options,
  width,
  buttonClass = "inline-flex h-[29px] w-[29px] items-center justify-center rounded-lg border border-[#e4e8f0] bg-white text-sm font-medium leading-4 text-[#7f8392] transition hover:border-[#8b8ce4] focus-visible:border-[#8b8ce4] focus-visible:outline-none data-[active=true]:border-[#6f6cd3] data-[active=true]:bg-[#6f6cd3] data-[active=true]:text-white",
  readonly = false,
  getAriaLabel,
  onToggle,
}: TierToggleGroupProps) => {
  return (
    <ul
      aria-label="Tier options"
      className="flex flex-wrap gap-[5px]"
      style={width ? { minWidth: width, width } : undefined}
    >
      {options.map((option) => (
        <li key={option.key}>
          <button
            aria-disabled={readonly ? "true" : "false"}
            aria-label={getAriaLabel ? getAriaLabel(option) : `Toggle ${option.label}`}
            aria-pressed={option.active ? "true" : "false"}
            className={cn(readonly ? "cursor-not-allowed" : "cursor-pointer", buttonClass)}
            data-active={option.active ? "true" : "false"}
            disabled={readonly}
            type="button"
            onClick={() => {
              if (readonly) {
                return;
              }

              onToggle(option.key);
            }}
          >
            {option.label}
          </button>
        </li>
      ))}
    </ul>
  );
};
