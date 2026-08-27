import { CheckIcon, ChevronDownIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import styles from "./pairing-search-panel.module.css";

export type PairingResultFilterOption = {
  value: string;
  label: string;
  description?: string;
};

export type PairingResultFilterOptionPage = {
  options: PairingResultFilterOption[];
  nextCursor: string | null;
  totalCount: number;
};

type PairingResultFilterMultiSelectProps = {
  ariaLabel: string;
  emptyLabel: string;
  errorLabel: string;
  label: string;
  loadingLabel: string;
  placeholder: string;
  queryKey: readonly unknown[];
  selectedValues: string[];
  testId: string;
  hasError?: boolean;
  isLoading?: boolean;
  loadOptionPage?: (
    query: string,
    cursor: string | undefined,
    signal: AbortSignal,
  ) => Promise<PairingResultFilterOptionPage>;
  options?: PairingResultFilterOption[];
  onChange: (values: string[]) => void;
};

const SEARCH_DEBOUNCE_MS = 300;
const OPTION_ROW_HEIGHT = 36;
const OPTION_LIST_HEIGHT = 208;
const OPTION_OVERSCAN = 4;

const useDebouncedValue = (value: string): string => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [value]);

  return debouncedValue;
};

export const PairingResultFilterMultiSelect = ({
  ariaLabel,
  emptyLabel,
  errorLabel,
  hasError = false,
  label,
  isLoading: isExternalLoading = false,
  loadingLabel,
  loadOptionPage,
  options = [],
  placeholder,
  queryKey,
  selectedValues,
  testId,
  onChange,
}: PairingResultFilterMultiSelectProps) => {
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debouncedQuery = useDebouncedValue(query.trim());
  const isRemote = Boolean(loadOptionPage);
  const isDebouncing = isRemote && query.trim() !== debouncedQuery;
  const remoteOptionsQuery = useInfiniteQuery({
    queryKey: [...queryKey, debouncedQuery],
    queryFn: ({ pageParam, signal }) => loadOptionPage?.(
      debouncedQuery,
      pageParam || undefined,
      signal,
    ) ?? Promise.resolve({ options: [], nextCursor: null, totalCount: 0 }),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: isOpen && isRemote,
    ...workbenchQueryDefaults,
  });
  const normalizedQuery = query.trim().toUpperCase();
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const availableOptions = useMemo(() => {
    if (isDebouncing) {
      return [];
    }

    const sourceOptions = isRemote
      ? remoteOptionsQuery.data?.pages.flatMap((page) => page.options) ?? []
      : options;
    const deduplicatedOptions = [...new Map(
      sourceOptions.map((option) => [option.value, option]),
    ).values()];

    return deduplicatedOptions.filter((option) => {
      if (!isRemote && selectedSet.has(option.value)) {
        return false;
      }

      if (isRemote || normalizedQuery.length === 0) {
        return true;
      }

      return `${option.value} ${option.label}`.toUpperCase().includes(normalizedQuery);
    });
  }, [
    isDebouncing,
    isRemote,
    normalizedQuery,
    options,
    remoteOptionsQuery.data?.pages,
    selectedSet,
  ]);
  const totalCount = isRemote
    ? remoteOptionsQuery.data?.pages[0]?.totalCount ?? availableOptions.length
    : availableOptions.length;
  const firstVirtualIndex = Math.max(0, Math.floor(scrollTop / OPTION_ROW_HEIGHT) - OPTION_OVERSCAN);
  const lastVirtualIndex = Math.min(
    availableOptions.length,
    Math.ceil((scrollTop + OPTION_LIST_HEIGHT) / OPTION_ROW_HEIGHT) + OPTION_OVERSCAN,
  );
  const virtualOptions = availableOptions.slice(firstVirtualIndex, lastVirtualIndex);
  const isInitialLoading = isExternalLoading
    || isDebouncing
    || (isRemote && remoteOptionsQuery.isPending);
  const isInitialError = hasError
    || (isRemote && remoteOptionsQuery.isError && availableOptions.length === 0);
  const isNextPageError = isRemote
    && remoteOptionsQuery.isFetchNextPageError
    && availableOptions.length > 0;

  const closeDropdown = () => {
    setIsOpen(false);
    setQuery("");
    setScrollTop(0);
    setActiveIndex(-1);

    if (isRemote) {
      void queryClient.cancelQueries({ queryKey }).then(() => {
        queryClient.removeQueries({ queryKey });
      });
    }
  };

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        closeDropdown();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  });

  useEffect(() => {
    setScrollTop(0);
    setActiveIndex(-1);
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [debouncedQuery]);

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) {
      return;
    }

    const itemTop = activeIndex * OPTION_ROW_HEIGHT;
    const itemBottom = itemTop + OPTION_ROW_HEIGHT;
    const visibleTop = listRef.current.scrollTop;
    const visibleBottom = visibleTop + listRef.current.clientHeight;

    if (itemTop < visibleTop) {
      listRef.current.scrollTop = itemTop;
    } else if (itemBottom > visibleBottom) {
      listRef.current.scrollTop = itemBottom - listRef.current.clientHeight;
    }
  }, [activeIndex]);

  const toggleOption = (option: PairingResultFilterOption) => {
    if (selectedSet.has(option.value)) {
      onChange(selectedValues.filter((selectedValue) => selectedValue !== option.value));
    } else {
      onChange([...selectedValues, option.value]);
    }
    setQuery("");
  };

  const removeValue = (value: string) => {
    onChange(selectedValues.filter((selectedValue) => selectedValue !== value));
  };

  const fetchNextPage = async (): Promise<number> => {
    if (!isRemote || !remoteOptionsQuery.hasNextPage || remoteOptionsQuery.isFetchingNextPage) {
      return availableOptions.length;
    }

    const result = await remoteOptionsQuery.fetchNextPage();
    return new Set(result.data?.pages.flatMap((page) => page.options.map((option) => option.value))).size;
  };

  const moveActive = async (direction: -1 | 1) => {
    if (availableOptions.length === 0) {
      return;
    }

    if (direction === -1) {
      setActiveIndex((current) => Math.max(0, current < 0 ? availableOptions.length - 1 : current - 1));
      return;
    }

    if (activeIndex < availableOptions.length - 1) {
      setActiveIndex(activeIndex + 1);
      return;
    }

    const previousLength = availableOptions.length;
    const nextLength = await fetchNextPage();
    if (nextLength > previousLength) {
      setActiveIndex(previousLength);
    }
  };

  return (
    <div ref={rootRef} className={styles.resultFilterMultiSelect}>
      <span className={styles.resultFilterLabel} data-testid={`${testId}-label`}>
        {label}
      </span>
      <div
        className={`${styles.resultFilterControl} flex min-w-0 cursor-text flex-wrap items-center gap-1 rounded-lg border border-[#cfd6e4] bg-white px-2 py-1 focus-within:border-[#706cd5] focus-within:ring-2 focus-within:ring-[#706cd5]/15`}
        data-testid={`${testId}-control`}
        onClick={() => setIsOpen(true)}
      >
        {selectedValues.map((value) => (
          <span
            key={value}
            className="inline-flex max-w-full items-center gap-1 rounded bg-[#eef2ff] px-1.5 py-0.5 text-xs font-semibold text-[#6467d1]"
          >
            <span className="truncate">{value}</span>
            <button
              aria-label={`Remove ${value} from ${label}`}
              className="inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-[#dfe5ff] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#706cd5]"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                removeValue(value);
              }}
            >
              <XMarkIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          aria-activedescendant={isOpen && activeIndex >= 0
            ? `${listboxId}-option-${activeIndex}`
            : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          className="h-6 min-w-16 flex-1 border-0 bg-transparent p-0 text-xs font-semibold text-[#4b5268] outline-none placeholder:text-[#9aa1af]"
          placeholder={selectedValues.length > 0 ? "" : placeholder}
          role="combobox"
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeDropdown();
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              void moveActive(event.key === "ArrowDown" ? 1 : -1);
            } else if (event.key === "Home" && availableOptions.length > 0) {
              event.preventDefault();
              setActiveIndex(0);
            } else if (event.key === "End" && availableOptions.length > 0) {
              event.preventDefault();
              setActiveIndex(availableOptions.length - 1);
              void fetchNextPage();
            } else if (event.key === "Enter" && activeIndex >= 0) {
              event.preventDefault();
              const activeOption = availableOptions[activeIndex];
              if (activeOption) {
                toggleOption(activeOption);
              }
            } else if (event.key === "Backspace" && query.length === 0 && selectedValues.length > 0) {
              removeValue(selectedValues[selectedValues.length - 1] ?? "");
            }
          }}
        />
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-[#8a90a4]" />
      </div>

      {isOpen ? (
        <div
          ref={listRef}
          id={listboxId}
          aria-label={`${label} options`}
          aria-multiselectable="true"
          className="absolute left-0 top-full z-30 mt-1 w-full min-w-48 overflow-y-auto rounded-lg border border-[#d8dde6] bg-white py-1 shadow-[0_12px_30px_rgba(68,76,96,0.14)]"
          role="listbox"
          style={{ maxHeight: OPTION_LIST_HEIGHT }}
          onScroll={(event) => {
            const element = event.currentTarget;
            setScrollTop(element.scrollTop);

            if (element.scrollHeight - element.scrollTop - element.clientHeight <= OPTION_ROW_HEIGHT * 2) {
              void fetchNextPage();
            }
          }}
        >
          {isInitialLoading ? (
            <div className="px-3 py-2 text-xs font-medium text-[#8d93a5]" role="status">{loadingLabel}</div>
          ) : isInitialError ? (
            <div className="px-3 py-2 text-xs font-medium text-[#b42318]" role="alert">
              <span>{errorLabel}</span>
              <button
                className="ml-2 cursor-pointer underline"
                type="button"
                onClick={() => void remoteOptionsQuery.refetch()}
              >
                Retry
              </button>
            </div>
          ) : availableOptions.length === 0 ? (
            <div className="px-3 py-2 text-xs font-medium text-[#8d93a5]">{emptyLabel}</div>
          ) : (
            <div className="relative" style={{ height: availableOptions.length * OPTION_ROW_HEIGHT }}>
              {virtualOptions.map((option, virtualIndex) => {
                const optionIndex = firstVirtualIndex + virtualIndex;
                const isSelected = selectedSet.has(option.value);

                return (
                  <button
                    key={option.value}
                    id={`${listboxId}-option-${optionIndex}`}
                    aria-posinset={optionIndex + 1}
                    aria-selected={isSelected}
                    aria-setsize={totalCount}
                    className={`absolute left-0 flex h-9 w-full cursor-pointer items-center gap-2 px-3 text-left focus-visible:outline-none ${
                      isSelected
                        ? "bg-[#eef2ff] hover:bg-[#e4e8ff] focus-visible:bg-[#e4e8ff]"
                        : "hover:bg-[#f5f7ff] focus-visible:bg-[#f5f7ff]"
                    } ${
                      activeIndex === optionIndex
                        ? isSelected ? "bg-[#e4e8ff]" : "bg-[#f5f7ff]"
                        : ""
                    }`}
                    role="option"
                    style={{ top: optionIndex * OPTION_ROW_HEIGHT }}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(optionIndex)}
                    onClick={() => toggleOption(option)}
                  >
                    <span
                      className={`min-w-0 truncate text-xs font-semibold ${
                        isSelected ? "text-[#6467d1]" : "text-[#40424f]"
                      }`}
                      data-testid={`${testId}-option-${option.value}-label`}
                    >
                      {option.label}
                    </span>
                    {isSelected ? (
                      <CheckIcon
                        className="ml-auto h-3.5 w-3.5 shrink-0 text-[#6467d1]"
                        data-testid={`${testId}-option-${option.value}-check`}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          {remoteOptionsQuery.isFetchingNextPage ? (
            <div className="px-3 py-2 text-xs font-medium text-[#8d93a5]" role="status">{loadingLabel}</div>
          ) : null}
          {isNextPageError ? (
            <div className="px-3 py-2 text-xs font-medium text-[#b42318]" role="alert">
              <span>{errorLabel}</span>
              <button
                className="ml-2 cursor-pointer underline"
                type="button"
                onClick={() => void fetchNextPage()}
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
