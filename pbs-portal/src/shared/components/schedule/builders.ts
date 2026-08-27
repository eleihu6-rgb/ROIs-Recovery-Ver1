import type { ScheduleTierRow, ScheduleTierTone } from "@/shared/components/schedule/types";

export const createScheduleDayLabels = (dayCount: number) =>
  Array.from({ length: dayCount }, (_, index) => String(index + 1).padStart(2, "0"));

export const createEmptyScheduleTierRow = (
  label: string,
  dayCount: number,
): ScheduleTierRow => ({
  label,
  cells: Array.from({ length: dayCount }, () => "empty"),
});

export const createScheduleTierCells = (
  dayCount: number,
  tone: ScheduleTierTone,
  indexes: number[],
  fallback: ScheduleTierTone = "blue",
) =>
  Array.from({ length: dayCount }, (_, index) => {
    const dayIndex = index + 1;
    return indexes.includes(dayIndex) ? tone : fallback;
  });
