import { cn } from "@/shared/lib/cn";

export type DashboardInfoTableCell = {
  content: string;
  tone?: "header" | "value" | "accent";
  multiline?: boolean;
};

type DashboardInfoTableProps = {
  rows: DashboardInfoTableCell[][];
  columnsTemplate?: string;
  compact?: boolean;
  mergeTop?: boolean;
};

const getCellClassName = (cell: DashboardInfoTableCell, index: number) =>
  cn(
    "flex items-center px-3 py-2",
    cell.tone === "header"
      ? "whitespace-nowrap text-xs leading-4"
      : cn("text-sm leading-[18px]", cell.multiline ? "whitespace-pre-line" : "whitespace-normal break-words"),
    index === 0 ? "" : "border-l border-[#E2E8ED]",
    cell.tone === "header"
      ? "bg-[#f7f9fc] font-normal text-[#6f7485]"
      : cell.tone === "accent"
        ? "font-semibold text-[#706cd5]"
        : "font-semibold text-[#282c3b]",
  );

export const DashboardInfoTable = ({
  rows,
  columnsTemplate = "repeat(2, minmax(0, 1fr))",
  compact = false,
  mergeTop = false,
}: DashboardInfoTableProps) => {
  const rowClass = compact ? "min-h-[38px]" : "min-h-[52px]";

  return (
    <div className={cn("overflow-hidden border border-[#E2E8ED]", mergeTop ? "-mt-px" : "")}>
      {rows.map((row, rowIndex) => (
        <div
          key={`row-${rowIndex}`}
          className={cn("grid", rowClass, rowIndex === 0 ? "" : "border-t border-[#E2E8ED]")}
          style={{ gridTemplateColumns: columnsTemplate }}
        >
          {row.map((cell, cellIndex) => (
            <div key={`${rowIndex}-${cellIndex}-${cell.content}`} className={getCellClassName(cell, cellIndex)}>
              {cell.content}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
