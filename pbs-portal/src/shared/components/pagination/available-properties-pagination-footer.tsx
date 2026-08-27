import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/cn";

type AvailablePropertiesPaginationItem = number | "ellipsis-start" | "ellipsis-end";

type AvailablePropertiesPaginationFooterProps = {
  currentPage: number;
  pageSize: number;
  paginationItems: AvailablePropertiesPaginationItem[];
  testId: string;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

const normalizePage = (page: number, totalPages: number) =>
  Math.min(totalPages, Math.max(1, page));

export const AvailablePropertiesPaginationFooter = ({
  currentPage,
  pageSize,
  paginationItems,
  testId,
  totalItems,
  totalPages,
  onPageChange,
}: AvailablePropertiesPaginationFooterProps) => {
  const [pageInput, setPageInput] = useState(String(currentPage));

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const goToPage = (page: number) => {
    const normalizedPage = normalizePage(page, totalPages);

    setPageInput(String(normalizedPage));
    onPageChange(normalizedPage);
  };

  const commitPageInput = () => {
    const parsedPage = Number.parseInt(pageInput, 10);

    goToPage(Number.isNaN(parsedPage) ? currentPage : parsedPage);
  };

  return (
    <div
      className="mt-auto border-t border-[#dfe3eb] px-[10px] pt-[12px]"
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="whitespace-nowrap text-sm font-normal tracking-[0.01em] text-[#6f7485]">
          Total {totalItems} items
        </span>
        <div className="flex items-center gap-[12px] text-sm text-[#6f7485]">
          <div className="flex items-center gap-[6px]">
            <button
              aria-label="Go to previous available properties page"
              className="inline-flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-md border border-[#d8dde6] bg-white text-[#6f7485] transition hover:border-[#706cd5] hover:text-[#706cd5] disabled:cursor-default disabled:opacity-45"
              disabled={currentPage === 1}
              type="button"
              onClick={() => goToPage(currentPage - 1)}
            >
              <ChevronLeftIcon className="h-[15px] w-[15px] stroke-[1.8]" />
            </button>

            {paginationItems.map((item) =>
              typeof item === "number" ? (
                <button
                  key={`page-${item}`}
                  aria-label={`Go to available properties page ${item}`}
                  className={cn(
                    "inline-flex h-[32px] min-w-[32px] cursor-pointer items-center justify-center rounded-md border px-[10px] text-sm leading-none transition",
                    currentPage === item
                      ? "border-[#706cd5] bg-white font-medium text-[#706cd5]"
                      : "border-[#d8dde6] bg-white text-[#6f7485] hover:border-[#706cd5] hover:text-[#706cd5]",
                  )}
                  type="button"
                  onClick={() => goToPage(item)}
                >
                  {item}
                </button>
              ) : (
                <span key={item} className="px-[4px] text-[#8d93a5]">
                  ...
                </span>
              ),
            )}

            <button
              aria-label="Go to next available properties page"
              className="inline-flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-md border border-[#d8dde6] bg-white text-[#6f7485] transition hover:border-[#706cd5] hover:text-[#706cd5] disabled:cursor-default disabled:opacity-45"
              disabled={currentPage === totalPages}
              type="button"
              onClick={() => goToPage(currentPage + 1)}
            >
              <ChevronRightIcon className="h-[15px] w-[15px] stroke-[1.8]" />
            </button>
          </div>

          <div className="relative">
            <select
              aria-label="Available properties page size"
              className="h-[32px] min-w-[98px] cursor-pointer appearance-none rounded-md border border-[#d8dde6] bg-white pl-3 pr-7 text-sm text-[#6f7485] outline-none"
              value={pageSize}
              onChange={() => undefined}
            >
              <option value={pageSize}>{pageSize}/Page</option>
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-[8px] top-1/2 h-4 w-4 -translate-y-1/2 text-[#8d93a5]" />
          </div>

          <label className="flex items-center gap-[8px] text-sm text-[#6f7485]">
            <span className="whitespace-nowrap">Go to</span>
            <Input
              aria-label="Go to available properties page"
              className="h-[32px] w-[40px] rounded-md border-[#d8dde6] bg-white px-0 text-center text-sm shadow-none focus-visible:ring-0"
              inputMode="numeric"
              type="text"
              value={pageInput}
              onBlur={commitPageInput}
              onChange={(event) => setPageInput(event.target.value.replace(/[^\d]/g, ""))}
              onKeyDown={(event) => {
                if (event.key !== "Enter") {
                  return;
                }

                commitPageInput();
              }}
            />
            <span className="whitespace-nowrap">Page</span>
          </label>
        </div>
      </div>
    </div>
  );
};
