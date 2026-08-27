import { cn } from "@/shared/lib/cn";

type AwardAvoid = "award" | "avoid";

type AwardAvoidSegmentedControlProps = {
  disabled?: boolean;
  options?: readonly AwardAvoid[];
  value: AwardAvoid | null;
  onChange: (value: AwardAvoid) => void;
};

const LABELS: Record<AwardAvoid, string> = {
  award: "Award",
  avoid: "Avoid",
};

export const AwardAvoidSegmentedControl = ({
  disabled = false,
  options = ["award", "avoid"],
  value,
  onChange,
}: AwardAvoidSegmentedControlProps) => (
  <div className="inline-grid grid-cols-2 rounded-xl bg-[#eef1f6] p-1">
    {options.map((option) => (
      <button
        key={option}
        aria-pressed={value === option ? "true" : "false"}
        className={cn(
          "h-9 min-w-[110px] cursor-pointer rounded-lg border-0 px-5 text-sm font-bold transition disabled:cursor-default",
          value === option
            ? "bg-white text-[#5754cf] shadow-[0_2px_8px_rgba(68,76,96,0.14)]"
            : "bg-transparent text-[#627086] hover:bg-white/60",
        )}
        disabled={disabled}
        type="button"
        onClick={() => onChange(option)}
      >
        {LABELS[option]}
      </button>
    ))}
  </div>
);
