import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PairingPreferencePickerFilterDraft } from "./pairing-preference-picker-filters";
import { useScaledPageCanvasPortalTarget } from "@/shared/components/layout/scaled-page-canvas";
import { PbsDatePicker } from "@/shared/components/preferences/pbs-date-picker";
import { cn } from "@/shared/lib/cn";
import type { ScaledDropdownPosition } from "@/shared/lib/scaled-dropdown-position";

type PairingPreferenceFilterDialogProps = {
  disabled: boolean;
  draft: PairingPreferencePickerFilterDraft;
  error: string;
  isLoadingStationOptions: boolean;
  layoverStationOptions: string[];
  periodCode: string;
  periodEndDate: string;
  periodStartDate: string;
  routeStationOptions: string[];
  onApply: () => void;
  onCancel: () => void;
  onClear: () => void;
  onDraftChange: <TKey extends keyof PairingPreferencePickerFilterDraft>(
    key: TKey,
    value: PairingPreferencePickerFilterDraft[TKey],
  ) => void;
  onDateRangeChange: (from: string, to: string) => void;
};

const TEXT_CLASS = "text-xs leading-4";
const LABEL_CLASS = "mb-1.5 block text-xs font-semibold text-[#687386]";
const INPUT_CLASS = "h-8 w-full min-w-0 rounded-md border border-[#d8dde6] bg-white px-2 text-xs font-semibold text-[#41495a] outline-none focus:border-[#7774d7] focus:ring-2 focus:ring-[#7774d7]/15 disabled:cursor-not-allowed disabled:bg-[#f5f7fa]";
const FIELD_GROUP_CLASS = "min-w-0";
const ATTRIBUTE_TITLE_CLASS = "m-0 text-xs font-semibold text-[#687386]";

const STATION_DROPDOWN_GAP = 4;
const STATION_DROPDOWN_HEADER_HEIGHT = 36;
const STATION_DROPDOWN_MAX_OPTIONS_HEIGHT = 180;
const STATION_DROPDOWN_MIN_OPTIONS_HEIGHT = 92;
const STATION_DROPDOWN_VIEWPORT_MARGIN = 12;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

const resolveStationDropdownPosition = (
  trigger: HTMLButtonElement,
  footerTop: number | undefined,
): ScaledDropdownPosition => {
  const anchorRect = trigger.getBoundingClientRect();
  const rawScale = trigger.offsetWidth > 0 ? anchorRect.width / trigger.offsetWidth : 1;
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
  const visualGap = STATION_DROPDOWN_GAP * scale;
  const minimumUsableVisualHeight = (
    STATION_DROPDOWN_HEADER_HEIGHT + STATION_DROPDOWN_MIN_OPTIONS_HEIGHT
  ) * scale;
  const spaceBelowViewport = Math.max(
    0,
    window.innerHeight - STATION_DROPDOWN_VIEWPORT_MARGIN - anchorRect.bottom - visualGap,
  );
  const footerBoundary = typeof footerTop === "number" && Number.isFinite(footerTop)
    ? Math.min(window.innerHeight, footerTop)
    : window.innerHeight;
  const spaceBelowFooter = Math.max(
    0,
    footerBoundary - STATION_DROPDOWN_VIEWPORT_MARGIN - anchorRect.bottom - visualGap,
  );
  const spaceAbove = Math.max(
    0,
    anchorRect.top - visualGap - STATION_DROPDOWN_VIEWPORT_MARGIN,
  );
  const openAbove = spaceBelowViewport < minimumUsableVisualHeight && spaceAbove > spaceBelowViewport;
  const availableVisualHeight = openAbove ? spaceAbove : Math.min(spaceBelowViewport, spaceBelowFooter);
  const designMaxPopupHeight = Math.min(
    STATION_DROPDOWN_HEADER_HEIGHT + STATION_DROPDOWN_MAX_OPTIONS_HEIGHT,
    Math.max(STATION_DROPDOWN_HEADER_HEIGHT, availableVisualHeight / scale),
  );
  const designMaxOptionsHeight = Math.max(
    0,
    Math.min(STATION_DROPDOWN_MAX_OPTIONS_HEIGHT, designMaxPopupHeight - STATION_DROPDOWN_HEADER_HEIGHT),
  );
  const maxVisualWidth = Math.max(0, window.innerWidth - STATION_DROPDOWN_VIEWPORT_MARGIN * 2);
  const visualWidth = Math.min(anchorRect.width, maxVisualWidth);
  const viewportLeft = clamp(
    anchorRect.left,
    STATION_DROPDOWN_VIEWPORT_MARGIN,
    window.innerWidth - visualWidth - STATION_DROPDOWN_VIEWPORT_MARGIN,
  );

  return {
    designMaxOptionsHeight,
    designMaxPopupHeight,
    designWidth: visualWidth / scale,
    openAbove,
    scale,
    viewportBottom: openAbove
      ? window.innerHeight - anchorRect.top + visualGap
      : null,
    viewportLeft,
    viewportTop: openAbove ? null : anchorRect.bottom + visualGap,
  };
};

const getFocusableElements = (root: HTMLElement) => Array.from(
  root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ),
).filter((element) => !element.hasAttribute("disabled"));

const FilterRangeField = ({
  describedBy,
  disabled,
  fromAriaLabel,
  fromMin,
  fromPlaceholder,
  fromValue,
  hasError,
  label,
  suffix,
  testId,
  toAriaLabel,
  toMin,
  toPlaceholder,
  toValue,
  type,
  onFromChange,
  onToChange,
}: {
  describedBy?: string;
  disabled: boolean;
  fromAriaLabel: string;
  fromMin?: string;
  fromPlaceholder?: string;
  fromValue: string;
  hasError: boolean;
  label: string;
  suffix?: string;
  testId?: string;
  toAriaLabel: string;
  toMin?: string;
  toPlaceholder?: string;
  toValue: string;
  type: "number" | "text" | "time";
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) => (
  <div aria-label={label} aria-describedby={hasError ? describedBy : undefined} className={FIELD_GROUP_CLASS} data-testid={testId} role="group">
    <span className={LABEL_CLASS}>{suffix ? `${label} (${suffix})` : label}</span>
    <span className="flex min-w-0 items-center gap-2">
      <input
        aria-describedby={hasError ? describedBy : undefined}
        aria-invalid={hasError || undefined}
        aria-label={fromAriaLabel}
        className={cn(INPUT_CLASS, hasError && "border-[#c75b61]")}
        disabled={disabled}
        min={fromMin}
        placeholder={fromPlaceholder}
        step={type === "number" ? 1 : undefined}
        type={type}
        value={fromValue}
        onChange={(event) => onFromChange(event.target.value)}
      />
      <span aria-hidden="true" className="shrink-0 text-xs font-semibold text-[#9aa2b1]">to</span>
      <input
        aria-describedby={hasError ? describedBy : undefined}
        aria-invalid={hasError || undefined}
        aria-label={toAriaLabel}
        className={cn(INPUT_CLASS, hasError && "border-[#c75b61]")}
        disabled={disabled}
        min={toMin}
        placeholder={toPlaceholder}
        step={type === "number" ? 1 : undefined}
        type={type}
        value={toValue}
        onChange={(event) => onToChange(event.target.value)}
      />
    </span>
  </div>
);

const CodeMultiSelectField = ({
  describedBy,
  disabled,
  hasError,
  isLoading,
  label,
  options,
  placeholder,
  testId,
  value,
  onChange,
}: {
  describedBy?: string;
  disabled: boolean;
  hasError: boolean;
  isLoading: boolean;
  label: string;
  options: string[];
  placeholder: string;
  testId?: string;
  value: string[];
  onChange: (value: string[]) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<ScaledDropdownPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selected = useMemo(() => new Set(value.map((item) => item.toUpperCase())), [value]);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toUpperCase();
    return options
      .map((option) => option.trim().toUpperCase())
      .filter(Boolean)
      .filter((option, index, list) => list.indexOf(option) === index)
      .filter((option) => !normalizedQuery || option.includes(normalizedQuery));
  }, [options, query]);
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    const dialog = containerRef.current?.closest<HTMLElement>("[data-testid='pairing-preference-filter-dialog']");
    const footer = dialog?.querySelector<HTMLElement>("[data-testid='pairing-filter-dialog-footer']");

    setPosition(resolveStationDropdownPosition(trigger, footer?.getBoundingClientRect().top));
  }, []);

  useLayoutEffect(() => {
    if (open) {
      updatePosition();
    }
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Node
        && (containerRef.current?.contains(target) || dropdownRef.current?.contains(target))) {
        return;
      }

      setOpen(false);
      setPosition(null);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [open, updatePosition]);

  const toggleOption = (option: string) => {
    const normalized = option.toUpperCase();
    const next = selected.has(normalized)
      ? value.filter((item) => item.toUpperCase() !== normalized)
      : [...value, normalized];

    onChange(next);
  };
  const dropdown = open && position && typeof document !== "undefined"
    ? createPortal(
      <div
        ref={dropdownRef}
        className="fixed z-[95] flex overflow-hidden rounded-lg border border-[#d8dde6] bg-white shadow-[0_10px_26px_rgba(54,63,84,0.14)]"
        data-placement={position.openAbove ? "top" : "bottom"}
        data-testid={`${testId ?? "pairing-filter-station"}-dropdown`}
        style={{
          bottom: position.viewportBottom ?? undefined,
          left: position.viewportLeft,
          maxHeight: position.designMaxPopupHeight,
          top: position.viewportTop ?? undefined,
          transform: `scale(${position.scale})`,
          transformOrigin: position.openAbove ? "bottom left" : "top left",
          width: position.designWidth,
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          setPosition(null);
          triggerRef.current?.focus();
        }}
      >
        <div className="flex min-h-0 w-full flex-col">
          <label className="flex h-9 items-center gap-2 border-b border-[#e7ebf2] px-2">
            <MagnifyingGlassIcon className="h-3.5 w-3.5 shrink-0 text-[#8d94a5]" />
            <input
              autoFocus
              aria-label={`${label} search`}
              className="min-w-0 flex-1 border-0 bg-transparent text-xs font-semibold text-[#41495a] outline-none placeholder:text-[#9aa2b1]"
              placeholder="Search..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div
            id={listboxId}
            aria-label={`${label} options`}
            aria-multiselectable="true"
            className="min-h-0 flex-1 overflow-y-auto py-1"
            data-testid={`${testId ?? "pairing-filter-station"}-options`}
            role="listbox"
            style={{ maxHeight: position.designMaxOptionsHeight }}
          >
            {filteredOptions.length > 0 ? filteredOptions.map((option) => (
              <button
                key={option}
                aria-selected={selected.has(option)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-[#f6f7ff] focus-visible:bg-[#f6f7ff] focus-visible:outline-none",
                  selected.has(option) ? "font-bold text-[#5652c6]" : "font-semibold text-[#424a5a]",
                )}
                role="option"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => toggleOption(option)}
              >
                <span className={cn(
                  "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                  selected.has(option) ? "border-[#6663d8] bg-[#6663d8]" : "border-[#cbd1dd] bg-white",
                )}>
                  {selected.has(option) ? <span className="text-3xs font-bold leading-none text-white">✓</span> : null}
                </span>
                {option}
              </button>
            )) : (
              <p className="m-0 px-2.5 py-2 text-xs font-semibold text-[#8d94a5]">No stations match</p>
            )}
          </div>
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={containerRef} aria-label={label} aria-describedby={hasError ? describedBy : undefined} className={FIELD_GROUP_CLASS} data-testid={testId} role="group">
      <span className={LABEL_CLASS}>{label}</span>
      <button
        ref={triggerRef}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={hasError || undefined}
        className={cn(
          "flex min-h-8 w-full cursor-pointer items-center gap-1.5 rounded-md border border-[#d8dde6] bg-white px-2 text-left text-xs font-semibold text-[#41495a] outline-none focus:border-[#7774d7] focus:ring-2 focus:ring-[#7774d7]/15 disabled:cursor-not-allowed disabled:bg-[#f5f7fa]",
          hasError && "border-[#c75b61]",
        )}
        disabled={disabled}
        type="button"
        onClick={() => {
          setQuery("");
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        {value.length === 0 ? (
          <span className="flex-1 text-[#9099aa]">{isLoading ? "Loading stations..." : placeholder}</span>
        ) : (
          <span className="flex min-w-0 flex-1 flex-wrap gap-1">
            {value.map((code) => (
              <span key={code} className="inline-flex items-center rounded bg-[#eef0fb] px-1.5 py-0.5 text-2xs font-bold text-[#5652c6]">
                {code.toUpperCase()}
              </span>
            ))}
          </span>
        )}
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-[#8d94a5]" />
      </button>

      {dropdown}
    </div>
  );
};

const AttributeToggle = ({
  disabled,
  label,
  pressed,
  onToggle,
}: {
  disabled: boolean;
  label: string;
  pressed: boolean;
  onToggle: () => void;
}) => (
  <button
    aria-pressed={pressed}
    className={cn(
      "h-8 cursor-pointer rounded-lg border px-3 text-xs font-bold disabled:cursor-not-allowed",
      pressed
        ? "border-[#6663d8] bg-[#6663d8] text-white"
        : "border-[#d8dde6] bg-white text-[#596273]",
    )}
    disabled={disabled}
    type="button"
    onClick={onToggle}
  >
    {label}
  </button>
);

export const PairingPreferenceFilterDialog = ({
  disabled,
  draft,
  error,
  isLoadingStationOptions,
  layoverStationOptions,
  periodCode,
  periodEndDate,
  periodStartDate,
  routeStationOptions,
  onApply,
  onCancel,
  onClear,
  onDateRangeChange,
  onDraftChange,
}: PairingPreferenceFilterDialogProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const scaledPortalTarget = useScaledPageCanvasPortalTarget();
  const headingId = useId();
  const errorId = `${headingId}-error`;
  const normalizedError = error.toLowerCase();
  const hasDateError = normalizedError.includes("date");
  const hasCheckInError = normalizedError.includes("check-in");
  const hasCheckOutError = normalizedError.includes("check-out");
  const hasDaysError = normalizedError.includes("days");
  const hasLayoverError = normalizedError.includes("layover count");
  const hasCreditError = normalizedError.includes("credit");
  const hasStationError = normalizedError.includes("station");

  useEffect(() => {
    window.setTimeout(() => {
      const firstFocusable = dialogRef.current ? getFocusableElements(dialogRef.current)[0] : null;
      firstFocusable?.focus();
    }, 0);
  }, []);

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key !== "Tab" || !dialogRef.current) {
      return;
    }

    const focusable = getFocusableElements(dialogRef.current);
    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const dialog = (
    <div
      className="pointer-events-auto fixed inset-0 z-[80] flex items-center justify-center bg-[#1f2430]/35 px-4 py-6"
      data-testid="pairing-preference-filter-dialog-overlay"
      onMouseDown={onCancel}
    >
      <div
        ref={dialogRef}
        aria-labelledby={headingId}
        aria-modal="true"
        className="flex max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-lg bg-white shadow-[0_20px_56px_rgba(33,39,54,0.22)]"
        data-testid="pairing-preference-filter-dialog"
        role="dialog"
        onKeyDown={handleDialogKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-12 shrink-0 items-center justify-between border-b border-[#e7ebf2] px-4 sm:px-5">
          <h2 id={headingId} className="m-0 text-sm font-bold text-[#242b3a]">Pairing Filters</h2>
          <button
            aria-label="Close Pairing Filters"
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[#8b93a4] hover:bg-[#f3f5f9]"
            type="button"
            onClick={onCancel}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-5" data-testid="pairing-filter-dialog-body">
          <section aria-label="Basic filters" className="grid gap-3">
            <div className="grid grid-cols-2 gap-3 gap-x-4">
              <div aria-label="Dates" aria-describedby={hasDateError ? errorId : undefined} className={FIELD_GROUP_CLASS} data-testid="pairing-filter-dates-field" role="group">
                <span className={LABEL_CLASS}>Pairing start dates</span>
                <PbsDatePicker
                  calendarLabel="Pairing Preference date range calendar"
                  clearLabel="Clear Pairing Preference date range"
                  density="filter"
                  disabled={disabled}
                  mode="range"
                  openLabel="Open Pairing Preference date range calendar"
                  periodCode={periodCode}
                  periodEndDate={periodEndDate}
                  periodStartDate={periodStartDate}
                  rangeFrom={draft.originDateFrom}
                  rangeTo={draft.originDateTo}
                  onRangeChange={onDateRangeChange}
                />
              </div>
              <FilterRangeField
                describedBy={errorId}
                disabled={disabled}
                fromAriaLabel="Check-in time from"
                fromValue={draft.checkInFrom}
                hasError={hasCheckInError}
                label="Check-in"
                testId="pairing-filter-check-in-field"
                toAriaLabel="Check-in time to"
                toValue={draft.checkInTo}
                type="time"
                onFromChange={(value) => onDraftChange("checkInFrom", value)}
                onToChange={(value) => onDraftChange("checkInTo", value)}
              />
              <FilterRangeField
                describedBy={errorId}
                disabled={disabled}
                fromAriaLabel="Check-out time from"
                fromValue={draft.checkOutFrom}
                hasError={hasCheckOutError}
                label="Check-out"
                testId="pairing-filter-check-out-field"
                toAriaLabel="Check-out time to"
                toValue={draft.checkOutTo}
                type="time"
                onFromChange={(value) => onDraftChange("checkOutFrom", value)}
                onToChange={(value) => onDraftChange("checkOutTo", value)}
              />
              <FilterRangeField
                describedBy={errorId}
                disabled={disabled}
                fromAriaLabel="Pairing length minimum"
                fromMin="1"
                fromValue={draft.daysMin}
                hasError={hasDaysError}
                label="Length"
                suffix="days"
                testId="pairing-filter-length-field"
                toAriaLabel="Pairing length maximum"
                toMin="1"
                toValue={draft.daysMax}
                type="number"
                onFromChange={(value) => onDraftChange("daysMin", value)}
                onToChange={(value) => onDraftChange("daysMax", value)}
              />
            </div>
          </section>

          <section aria-label="Station filters" className="grid gap-3 border-t border-[#eef1f6] pt-3">
            <div className="grid grid-cols-2 gap-3 gap-x-4">
              <CodeMultiSelectField
                describedBy={errorId}
                disabled={disabled}
                hasError={hasStationError}
                isLoading={isLoadingStationOptions}
                label="Route station"
                options={routeStationOptions}
                placeholder="Select route stations..."
                testId="pairing-filter-route-station-field"
                value={draft.routeStations}
                onChange={(value) => onDraftChange("routeStations", value)}
              />
              <CodeMultiSelectField
                describedBy={errorId}
                disabled={disabled}
                hasError={hasStationError}
                isLoading={isLoadingStationOptions}
                label="Layover station"
                options={layoverStationOptions}
                placeholder="Select layover stations..."
                testId="pairing-filter-layover-station-field"
                value={draft.layoverStations}
                onChange={(value) => onDraftChange("layoverStations", value)}
              />
            </div>
          </section>

          <section aria-label="Layover and credit filters" className="grid grid-cols-2 gap-3 gap-x-4 border-t border-[#eef1f6] pt-3">
            <FilterRangeField
              describedBy={errorId}
              disabled={disabled}
              fromAriaLabel="Layover count minimum"
              fromMin="0"
              fromValue={draft.layoverCountMin}
              hasError={hasLayoverError}
              label="Layover count"
              testId="pairing-filter-layover-count-field"
              toAriaLabel="Layover count maximum"
              toMin="0"
              toValue={draft.layoverCountMax}
              type="number"
              onFromChange={(value) => onDraftChange("layoverCountMin", value)}
              onToChange={(value) => onDraftChange("layoverCountMax", value)}
            />
            <FilterRangeField
              describedBy={errorId}
              disabled={disabled}
              fromAriaLabel="Credit minimum"
              fromPlaceholder="HH:MM"
              fromValue={draft.creditMin}
              hasError={hasCreditError}
              label="Credit"
              suffix="HH:MM"
              testId="pairing-filter-credit-field"
              toAriaLabel="Credit maximum"
              toPlaceholder="HH:MM"
              toValue={draft.creditMax}
              type="text"
              onFromChange={(value) => onDraftChange("creditMin", value)}
              onToChange={(value) => onDraftChange("creditMax", value)}
            />
          </section>

          <section aria-label="Attribute filters" className="grid gap-2 border-t border-[#eef1f6] pt-3">
            <p className={ATTRIBUTE_TITLE_CLASS}>Attributes</p>
            <div className="flex flex-wrap gap-2">
              <AttributeToggle
                disabled={disabled}
                label="Redeye"
                pressed={draft.hasRedeye}
                onToggle={() => onDraftChange("hasRedeye", !draft.hasRedeye)}
              />
              <AttributeToggle
                disabled={disabled}
                label="DHD"
                pressed={draft.hasDeadhead}
                onToggle={() => onDraftChange("hasDeadhead", !draft.hasDeadhead)}
              />
            </div>
          </section>

          {error ? (
            <p id={errorId} className={cn("m-0 rounded-lg border border-[#f0c5c7] bg-[#fff7f7] px-3 py-2 font-semibold text-[#b84c52]", TEXT_CLASS)} role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex min-h-14 shrink-0 items-center justify-between border-t border-[#e7ebf2] px-4 sm:px-5" data-testid="pairing-filter-dialog-footer">
          <button
            className="h-8 cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-3 text-xs font-bold text-[#606a7c] disabled:cursor-not-allowed disabled:text-[#a4abba]"
            disabled={disabled}
            type="button"
            onClick={onClear}
          >
            Clear All
          </button>
          <div className="flex gap-2">
            <button
              className="h-8 cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-3 text-xs font-bold text-[#2c3342] disabled:cursor-not-allowed disabled:text-[#a4abba]"
              disabled={disabled}
              type="button"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="h-8 cursor-pointer rounded-lg border border-[#6663d8] bg-[#6663d8] px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:border-[#aaa6e4] disabled:bg-[#aaa6e4]"
              disabled={disabled}
              type="button"
              onClick={onApply}
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return dialog;
  }

  return scaledPortalTarget ? createPortal(dialog, scaledPortalTarget) : dialog;
};
