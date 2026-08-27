import { cn } from "@/shared/lib/cn";
import type { ScheduleTierRow, ScheduleTierTone } from "@/shared/components/schedule/types";

type ScheduleTierMatrixProps = {
  contentMinWidth?: number;
  density?: "regular" | "compact";
  dayLabels: string[];
  rows: ScheduleTierRow[];
  activeTierLabel: string;
  onSelectTier: (label: string) => void;
};

const TIER_LABEL_COLUMN_WIDTH = 70;
const TIER_COLUMN_GAP_PX = 2;

const toneClassMap: Record<ScheduleTierTone, string> = {
  blue: "bg-[#4FCFED]",
  green: "bg-[#3DC0A9]",
  red: "bg-[#D94C4C]",
  yellow: "bg-[#F5B507]",
  empty: "bg-[#F8F9FB]",
};

export const ScheduleTierMatrix = ({
  contentMinWidth,
  density = "regular",
  dayLabels,
  rows,
  activeTierLabel,
  onSelectTier,
}: ScheduleTierMatrixProps) => {
  const isCompact = density === "compact";
  const tierDaysGridStyle = {
    columnGap: `${TIER_COLUMN_GAP_PX}px`,
    gridTemplateColumns: `${TIER_LABEL_COLUMN_WIDTH}px repeat(${dayLabels.length}, minmax(0, 1fr))`,
  };

  return (
    <section
      className={cn(
        "rounded-2xl border border-[#E2E8ED] bg-white",
        isCompact ? "mt-2 px-3 pb-3 pt-3" : "mt-3 px-4 pb-4 pt-4",
      )}
      style={contentMinWidth ? { minWidth: `${contentMinWidth}px` } : undefined}
    >
      <ol
        className="grid items-center text-xs font-medium leading-[15px] text-[#6f7485]"
        style={tierDaysGridStyle}
      >
        <li aria-hidden="true" />
        {dayLabels.map((day) => (
          <li key={day} className="list-none text-center">
            <time dateTime={day}>{day}</time>
          </li>
        ))}
      </ol>

      <ul aria-label="Tier matrix rows" className={isCompact ? "mt-1.5 space-y-0.5" : "mt-[7px] space-y-[3px]"}>
        {rows.map((row) => {
          const isActive = activeTierLabel === row.label;
          const cellsGridStyle = {
            gridTemplateColumns: `repeat(${row.cells.length}, minmax(0, 1fr))`,
          };

          return (
            <li
              key={row.label}
              className="grid items-center"
              style={{
                columnGap: `${TIER_COLUMN_GAP_PX}px`,
                gridTemplateColumns: `${TIER_LABEL_COLUMN_WIDTH}px minmax(0, 1fr)`,
              }}
            >
              <button
                aria-pressed={isActive ? "true" : "false"}
                className={cn(
                  "relative z-10 flex cursor-pointer items-center justify-center rounded-lg border text-xs font-medium leading-[15px]",
                  isCompact ? "h-[23px]" : "h-[27px]",
                  isActive
                    ? "border-[#706cd5] bg-[#706cd5] text-white"
                    : "border-[#E2E8ED] bg-[#F8F9FB] text-[#282c3b]",
                )}
                style={{ width: `${TIER_LABEL_COLUMN_WIDTH}px` }}
                type="button"
                onClick={() => onSelectTier(isActive ? "" : row.label)}
              >
                {row.label}
              </button>
              <div
                className={cn(
                  "min-w-0 rounded-lg p-px",
                  isActive
                    ? "bg-[#F3F3FB] shadow-[0_0_0_1px_#706cd5]"
                    : "",
                )}
              >
                <ol
                  aria-label={`${row.label} heatmap`}
                  className="grid min-w-0 gap-[2px] overflow-hidden rounded-md"
                  style={cellsGridStyle}
                >
                  {row.cells.map((cell, index) => (
                    <li
                      key={`${row.label}-${index}`}
                      aria-label={`${row.label} day ${dayLabels[index] ?? index + 1}`}
                      className={cn("aspect-square w-full min-w-0 list-none rounded-lg", toneClassMap[cell])}
                      role="listitem"
                    />
                  ))}
                </ol>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
