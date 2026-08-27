import {
  AdjustmentsHorizontalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  PbsSearchPairingsPreviewFilters,
  PbsSearchPairingsResult,
} from "../../../../../packages/contracts/pbs-search-pairings.js";
import {
  arePairingPreferencePickerFilterDraftsEqual,
  buildPairingPreferencePickerFilters,
  countActivePairingPreferencePickerFilters,
  EMPTY_PAIRING_PREFERENCE_FILTER_DRAFT,
  type PairingPreferencePickerFilterDraft,
  validatePairingPreferencePickerFilters,
} from "./pairing-preference-picker-filters";
import { PairingPreferenceFilterDialog } from "./pairing-preference-filter-dialog";
import { formatPairingClock } from "./pairing-detail-display";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import {
  pairingService,
  type PairingSearchPeriodReference,
} from "@/shared/services/pairing-service";
import { cn } from "@/shared/lib/cn";

export type PairingPreferenceSelectionItem = {
  pairingNumber: string;
};

type PairingPreferencePickerProps = {
  disabled?: boolean;
  period: PairingSearchPeriodReference;
  periodCode: string;
  periodEndDate: string;
  periodStartDate: string;
  selected: Map<string, PairingPreferenceSelectionItem>;
  onSelectionChange: (selected: Map<string, PairingPreferenceSelectionItem>) => void;
};

const PAGE_SIZE = 30;
const QUERY_DEBOUNCE_MS = 300;

const useDebouncedValue = (value: string, delayMs: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
};

const PageCheckbox = ({
  ariaLabel,
  checked,
  disabled,
  indeterminate = false,
  onChange,
}: {
  ariaLabel: string;
  checked: boolean;
  disabled?: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      aria-label={ariaLabel}
      checked={checked}
      className="h-4 w-4 cursor-pointer accent-[#6663d8] disabled:cursor-default"
      disabled={disabled}
      type="checkbox"
      onChange={onChange}
      onClick={(event) => event.stopPropagation()}
    />
  );
};

const buildDatesLabel = (result: PbsSearchPairingsResult) => result.originDate === result.endDate
  ? <span className="whitespace-nowrap">{result.originDate}</span>
  : (
      <span className="inline-flex max-w-full flex-wrap gap-x-1">
        <span className="whitespace-nowrap">{result.originDate} →</span>
        <span className="whitespace-nowrap">{result.endDate}</span>
      </span>
    );

export const PairingPreferencePicker = ({
  disabled = false,
  period,
  periodCode,
  periodEndDate,
  periodStartDate,
  selected,
  onSelectionChange,
}: PairingPreferencePickerProps) => {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState<PairingPreferencePickerFilterDraft>(
    EMPTY_PAIRING_PREFERENCE_FILTER_DRAFT,
  );
  const [appliedFilterDraft, setAppliedFilterDraft] = useState<PairingPreferencePickerFilterDraft>(
    EMPTY_PAIRING_PREFERENCE_FILTER_DRAFT,
  );
  const filterDraftRef = useRef(filterDraft);
  const [filterError, setFilterError] = useState("");
  const debouncedQuery = useDebouncedValue(query, QUERY_DEBOUNCE_MS);
  const periodBounds = useMemo(
    () => ({ min: periodStartDate, max: periodEndDate }),
    [periodEndDate, periodStartDate],
  );
  const appliedFilters = useMemo<PbsSearchPairingsPreviewFilters>(() => ({
    pairingScope: "fly",
    ...buildPairingPreferencePickerFilters(appliedFilterDraft),
    ...(debouncedQuery.trim() ? { query: debouncedQuery.trim() } : {}),
  }), [appliedFilterDraft, debouncedQuery]);
  const pairingsQuery = useQuery({
    queryKey: ["pairing", "preference-picker", period.rosterPeriodId, page, appliedFilters],
    queryFn: () => pairingService.previewAllPairings(page, PAGE_SIZE, period, appliedFilters),
    placeholderData: (previousData) => previousData,
    ...workbenchQueryDefaults,
  });
  const rows = pairingsQuery.data?.results ?? [];
  const pagination = pairingsQuery.data?.pagination;
  const resultsScrollRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const showResultsSkeleton = pairingsQuery.isLoading || pairingsQuery.isPlaceholderData;
  const currentPageIds = rows.map((row) => row.pairingId);
  const selectedOnPage = currentPageIds.filter((pairingId) => selected.has(pairingId)).length;
  const allCurrentPageSelected = currentPageIds.length > 0 && selectedOnPage === currentPageIds.length;
  const someCurrentPageSelected = selectedOnPage > 0 && !allCurrentPageSelected;
  const activeFilterCount = countActivePairingPreferencePickerFilters(appliedFilterDraft);
  const airportOptionsQuery = useQuery({
    queryKey: ["pairing", "preference-picker", "airport-options", period.rosterPeriodId, period.periodCode],
    queryFn: () => pairingService.getAirportOptions(period),
    ...workbenchQueryDefaults,
  });
  const routeStationOptions = airportOptionsQuery.data?.filterAirports ?? [];
  const layoverStationOptions = airportOptionsQuery.data?.layoverAirports ?? [];

  useEffect(() => {
    if (resultsScrollRef.current) {
      resultsScrollRef.current.scrollTop = 0;
    }
    setPage(1);
  }, [debouncedQuery]);

  const changePage = (nextPage: number) => {
    if (resultsScrollRef.current) {
      resultsScrollRef.current.scrollTop = 0;
    }
    setPage(nextPage);
  };

  const toggleRow = (row: PbsSearchPairingsResult) => {
    const nextSelected = new Map(selected);

    if (nextSelected.has(row.pairingId)) {
      nextSelected.delete(row.pairingId);
    } else {
      nextSelected.set(row.pairingId, { pairingNumber: row.pairingNumber });
    }

    onSelectionChange(nextSelected);
  };

  const toggleCurrentPage = () => {
    const nextSelected = new Map(selected);

    if (allCurrentPageSelected) {
      for (const pairingId of currentPageIds) {
        nextSelected.delete(pairingId);
      }
    } else {
      for (const row of rows) {
        nextSelected.set(row.pairingId, { pairingNumber: row.pairingNumber });
      }
    }

    onSelectionChange(nextSelected);
  };

  const updateFilter = <TKey extends keyof PairingPreferencePickerFilterDraft>(
    key: TKey,
    value: PairingPreferencePickerFilterDraft[TKey],
  ) => {
    setFilterError("");
    setFilterDraft((current) => {
      const next = { ...current, [key]: value };
      filterDraftRef.current = next;
      return next;
    });
  };

  const restoreFilterButtonFocus = () => {
    window.setTimeout(() => filterButtonRef.current?.focus(), 0);
  };

  const openFilters = () => {
    setFilterError("");
    filterDraftRef.current = appliedFilterDraft;
    setFilterDraft(appliedFilterDraft);
    setFiltersOpen(true);
  };

  const cancelFilters = () => {
    setFilterError("");
    filterDraftRef.current = appliedFilterDraft;
    setFilterDraft(appliedFilterDraft);
    setFiltersOpen(false);
    restoreFilterButtonFocus();
  };

  const applyFilters = () => {
    const nextDraft = filterDraftRef.current;
    const nextError = validatePairingPreferencePickerFilters(nextDraft, periodBounds);
    setFilterError(nextError);

    if (nextError) {
      return;
    }

    const filtersChanged = !arePairingPreferencePickerFilterDraftsEqual(nextDraft, appliedFilterDraft);

    if (filtersChanged && resultsScrollRef.current) {
      resultsScrollRef.current.scrollTop = 0;
    }
    setAppliedFilterDraft(nextDraft);
    setPage(1);
    setFiltersOpen(false);
    restoreFilterButtonFocus();
  };

  const clearFilterDraft = () => {
    setFilterError("");
    filterDraftRef.current = EMPTY_PAIRING_PREFERENCE_FILTER_DRAFT;
    setFilterDraft(EMPTY_PAIRING_PREFERENCE_FILTER_DRAFT);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[#dce1ea] bg-white">
      <div className="flex min-h-11 items-center justify-between gap-4 border-b border-[#e4e8ef] px-3">
        <p className="m-0 text-xs font-bold uppercase tracking-[0.1em] text-[#596176]">Pairings</p>
        <div className="flex items-center gap-2.5 text-xs font-semibold text-[#7d8493]">
          <span className="font-bold text-[#5b57ce]">{selected.size} selected</span>
          <span>· {pairingsQuery.data?.summary.totalItems ?? 0} total</span>
          {selected.size > 0 ? (
            <button
              className="cursor-pointer border-0 bg-transparent p-0 font-bold text-[#6763d1]"
              disabled={disabled}
              type="button"
              onClick={() => onSelectionChange(new Map())}
            >
              Clear selection
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(260px,1fr)_auto] gap-2.5 p-3">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-[#d5dbe5] px-3 focus-within:border-[#7774d7] focus-within:ring-2 focus-within:ring-[#7774d7]/15">
          <MagnifyingGlassIcon className="h-4 w-4 shrink-0 text-[#929aaa]" />
          <input
            aria-label="Search pairings"
            className="min-w-0 flex-1 border-0 bg-transparent text-xs font-semibold text-[#343a49] outline-none placeholder:text-[#9ba3b2]"
            disabled={disabled}
            maxLength={64}
            placeholder="Search pairing, base, route, or rank..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button
              aria-label="Clear pairing search"
              className="cursor-pointer border-0 bg-transparent p-0 text-[#8d93a5]"
              type="button"
              onClick={() => setQuery("")}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          ) : null}
        </label>
        <button
          ref={filterButtonRef}
          aria-expanded={filtersOpen}
          className={cn(
            "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-bold",
            filtersOpen || activeFilterCount > 0
              ? "border-[#7773d9] bg-[#f6f5ff] text-[#5754c9]"
              : "border-[#d5dbe5] bg-white text-[#525b6d]",
          )}
          disabled={disabled}
          type="button"
          onClick={openFilters}
        >
          <AdjustmentsHorizontalIcon className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 ? (
            <span className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-[#6663d8] px-1 text-xs text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
      </div>

      {filtersOpen ? (
        <PairingPreferenceFilterDialog
          disabled={disabled}
          draft={filterDraft}
          error={filterError}
          isLoadingStationOptions={airportOptionsQuery.isLoading || airportOptionsQuery.isFetching}
          layoverStationOptions={layoverStationOptions}
          periodCode={periodCode}
          periodEndDate={periodEndDate}
          periodStartDate={periodStartDate}
          routeStationOptions={routeStationOptions}
          onApply={applyFilters}
          onCancel={cancelFilters}
          onClear={clearFilterDraft}
          onDateRangeChange={(from, to) => {
            setFilterError("");
            setFilterDraft((current) => {
              const next = {
                ...current,
                originDateFrom: from,
                originDateTo: to,
              };
              filterDraftRef.current = next;
              return next;
            });
          }}
          onDraftChange={updateFilter}
        />
      ) : null}

      {selected.size > 0 ? (
        <div className="flex min-h-9 items-center gap-2 overflow-x-auto px-3 pb-3 text-xs text-[#7d8596]">
          <span className="shrink-0 font-bold">Selected</span>
          {Array.from(selected.entries()).map(([pairingId, item]) => (
            <span
              key={pairingId}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-[#d9d6ff] bg-[#f4f3ff] px-2 font-bold text-[#5551c7]"
            >
              {item.pairingNumber || `Pairing ${pairingId}`}
              <button
                aria-label={`Remove pairing ${item.pairingNumber || pairingId}`}
                className="cursor-pointer border-0 bg-transparent p-0 text-[#7772d6]"
                disabled={disabled}
                type="button"
                onClick={() => {
                  const nextSelected = new Map(selected);
                  nextSelected.delete(pairingId);
                  onSelectionChange(nextSelected);
                }}
              >
                <XMarkIcon className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div
        ref={resultsScrollRef}
        aria-busy={showResultsSkeleton}
        className="max-h-[320px] overflow-x-hidden overflow-y-auto border-t border-[#e5e9ef]"
        data-testid="pairing-preference-results-scroll"
      >
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[4%]" />
            <col className="w-[11%]" />
            <col className="w-[7%]" />
            <col className="w-[19%]" />
            <col className="w-[16%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[6%]" />
            <col className="w-[8%]" />
            <col className="w-[11%]" />
          </colgroup>
          <thead>
            <tr className="h-10 whitespace-nowrap bg-[#f6f7f9] text-left text-xs font-bold uppercase tracking-[0.06em] text-[#707888]">
              <th className="sticky top-0 z-10 bg-[#f6f7f9] px-3 text-center">
                <PageCheckbox
                  ariaLabel="Select all pairings on this page"
                  checked={allCurrentPageSelected}
                  disabled={disabled || rows.length === 0 || showResultsSkeleton}
                  indeterminate={someCurrentPageSelected}
                  onChange={toggleCurrentPage}
                />
              </th>
              <th className="sticky top-0 z-10 bg-[#f6f7f9] px-2">Pairing</th>
              <th className="sticky top-0 z-10 bg-[#f6f7f9] px-2">Base</th>
              <th className="sticky top-0 z-10 bg-[#f6f7f9] px-2">Route</th>
              <th className="sticky top-0 z-10 bg-[#f6f7f9] px-2">Dates</th>
              <th className="sticky top-0 z-10 bg-[#f6f7f9] px-1">Check-in</th>
              <th className="sticky top-0 z-10 bg-[#f6f7f9] px-1">Check-out</th>
              <th className="sticky top-0 z-10 bg-[#f6f7f9] px-2">Days</th>
              <th className="sticky top-0 z-10 bg-[#f6f7f9] px-2">Credit</th>
              <th className="sticky top-0 z-10 bg-[#f6f7f9] px-2">Rank</th>
            </tr>
          </thead>
          <tbody>
              {showResultsSkeleton ? Array.from({ length: 7 }, (_, index) => (
                <tr
                  key={index}
                  aria-hidden="true"
                  className="h-10 border-b border-[#e7eaf0]"
                  data-testid={index === 0 ? "pairing-preference-page-loading" : undefined}
                >
                  <td className="px-3"><div className="mx-auto h-4 w-4 animate-pulse rounded bg-[#e9ecf2]" /></td>
                  <td className="px-2"><div className="h-3 w-16 animate-pulse rounded bg-[#e9ecf2]" /></td>
                  <td className="px-2"><div className="h-3 w-10 animate-pulse rounded bg-[#e9ecf2]" /></td>
                  <td className="px-2"><div className="h-3 w-40 animate-pulse rounded bg-[#e9ecf2]" /></td>
                  <td className="px-2"><div className="h-3 w-32 animate-pulse rounded bg-[#e9ecf2]" /></td>
                  <td className="px-2"><div className="h-3 w-10 animate-pulse rounded bg-[#e9ecf2]" /></td>
                  <td className="px-2"><div className="h-3 w-10 animate-pulse rounded bg-[#e9ecf2]" /></td>
                  <td className="px-2"><div className="h-3 w-7 animate-pulse rounded bg-[#e9ecf2]" /></td>
                  <td className="px-2"><div className="h-3 w-12 animate-pulse rounded bg-[#e9ecf2]" /></td>
                  <td className="px-2"><div className="h-3 w-20 animate-pulse rounded bg-[#e9ecf2]" /></td>
                </tr>
              )) : null}
              {!showResultsSkeleton && pairingsQuery.isError ? (
                <tr>
                  <td colSpan={10} className="h-28 px-4 text-center text-xs font-semibold text-[#c75b61]">
                    <div className="flex flex-col items-center gap-2">
                      <span>Unable to load pairings.</span>
                      <button
                        className="h-8 cursor-pointer rounded-lg border border-[#d7dce5] bg-white px-3 text-xs font-bold text-[#6763d1]"
                        type="button"
                        onClick={() => void pairingsQuery.refetch()}
                      >
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : null}
              {!showResultsSkeleton && !pairingsQuery.isError && rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="h-28 px-4 text-center text-xs font-semibold text-[#7d8493]">
                    No pairings match the current search and filters.
                  </td>
                </tr>
              ) : null}
              {!showResultsSkeleton && !pairingsQuery.isError ? rows.map((row) => {
                  const isSelected = selected.has(row.pairingId);
                  return (
                    <tr
                      key={row.pairingId}
                      aria-selected={isSelected}
                      className={cn(
                        "h-10 cursor-pointer border-b border-[#e7eaf0] align-middle text-xs font-semibold text-[#4d5566] hover:bg-[#fafaff]",
                        isSelected ? "bg-[#f1f0ff] shadow-[inset_3px_0_0_#6c68d7]" : "bg-white",
                      )}
                      onClick={() => !disabled && toggleRow(row)}
                    >
                      <td className="px-3 text-center">
                        <PageCheckbox
                          ariaLabel={`Select pairing ${row.pairingNumber}`}
                          checked={isSelected}
                          disabled={disabled}
                          onChange={() => toggleRow(row)}
                        />
                      </td>
                      <td className="px-2 font-bold text-[#303747]">{row.pairingNumber}</td>
                      <td className="px-2">{row.base}</td>
                      <td className="break-words whitespace-normal px-2 py-2 leading-4" title={row.routeLabel}>{row.routeLabel || "—"}</td>
                      <td className="whitespace-normal px-2 py-2 leading-4">{buildDatesLabel(row)}</td>
                      <td className="whitespace-nowrap px-2">{formatPairingClock(row.reportTime)}</td>
                      <td className="whitespace-nowrap px-2">{formatPairingClock(row.releaseTime)}</td>
                      <td className="px-2">{row.durationDays}d</td>
                      <td className="px-2">{row.totalCredit || "—"}</td>
                      <td className="truncate px-2" title={row.compositionLabel}>{row.compositionLabel || "—"}</td>
                    </tr>
                  );
                }) : null}
          </tbody>
        </table>
      </div>

      <div className="flex min-h-11 items-center justify-between gap-3 bg-[#fafbfc] px-3 text-xs font-semibold text-[#7c8494]">
        <span>
          {pairingsQuery.isPlaceholderData
            ? "Loading pairings…"
            : pairingsQuery.isFetching && !pairingsQuery.isLoading
              ? "Refreshing pairings…"
            : `${pagination?.totalItems ?? 0} pairings`}
        </span>
        <div className="flex items-center gap-2">
          <button
            aria-label="Previous pairing page"
            className="inline-grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-[#d9dee7] bg-white text-[#626b7e] disabled:cursor-default disabled:opacity-40"
            disabled={disabled || showResultsSkeleton || page <= 1}
            type="button"
            onClick={() => changePage(Math.max(1, page - 1))}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <span className="min-w-20 text-center font-bold text-[#5754c9]">
            Page {page} of {pagination?.totalPages ?? 1}
          </span>
          <button
            aria-label="Next pairing page"
            className="inline-grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-[#d9dee7] bg-white text-[#626b7e] disabled:cursor-default disabled:opacity-40"
            disabled={disabled || showResultsSkeleton || page >= (pagination?.totalPages ?? 1)}
            type="button"
            onClick={() => changePage(page + 1)}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
