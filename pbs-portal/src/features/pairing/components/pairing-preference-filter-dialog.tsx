import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppDialog } from "@rois/ui";
import type { PairingPreferencePickerFilterDraft } from "./pairing-preference-picker-filters";
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
const LABEL_CLASS = "mb-1.5 block text-xs font-semibold text-muted-foreground";
const INPUT_CLASS = "h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-muted";
const FIELD_GROUP_CLASS = "min-w-0";
const ATTRIBUTE_TITLE_CLASS = "m-0 text-xs font-semibold text-muted-foreground";

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
        className={cn(INPUT_CLASS, hasError && "border-destructive")}
        disabled={disabled}
        min={fromMin}
        placeholder={fromPlaceholder}
        step={type === "number" ? 1 : undefined}
        type={type}
        value={fromValue}
        onChange={(event) => onFromChange(event.target.value)}
      />
      <span aria-hidden="true" className="shrink-0 text-xs font-semibold text-muted-foreground">to</span>
      <input
        aria-describedby={hasError ? describedBy : undefined}
        aria-invalid={hasError || undefined}
        aria-label={toAriaLabel}
        className={cn(INPUT_CLASS, hasError && "border-destructive")}
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
        className="fixed z-[95] flex overflow-hidden rounded-lg border border-border bg-background shadow-lg"
        data-placement={position.openAbove ? "top" : "bottom"}
        data-testid={`${testId ?? "pairing-filter-station"}-dropdown`}
        style={{
          bottom: position.viewportBottom ?? undefined,
          left: position.viewportLeft,
          maxHeight: position.designMaxPopupHeight,
          // Re-enable interaction with a modal AppDialog's `pointer-events: none` body lock.
          pointerEvents: "auto",
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
          <label className="flex h-9 items-center gap-2 border-b border-border px-2">
            <MagnifyingGlassIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              aria-label={`${label} search`}
              className="min-w-0 flex-1 border-0 bg-transparent text-xs font-semibold text-foreground outline-none placeholder:text-muted-foreground"
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
                  "flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                  selected.has(option) ? "font-bold text-primary" : "font-semibold text-foreground",
                )}
                role="option"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => toggleOption(option)}
              >
                <span className={cn(
                  "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                  selected.has(option) ? "border-primary bg-primary" : "border-border bg-background",
                )}>
                  {selected.has(option) ? <span className="text-3xs font-bold leading-none text-white">✓</span> : null}
                </span>
                {option}
              </button>
            )) : (
              <p className="m-0 px-2.5 py-2 text-xs font-semibold text-muted-foreground">No stations match</p>
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
          "flex min-h-8 w-full cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2 text-left text-xs font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-muted",
          hasError && "border-destructive",
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
          <span className="flex-1 text-muted-foreground">{isLoading ? "Loading stations..." : placeholder}</span>
        ) : (
          <span className="flex min-w-0 flex-1 flex-wrap gap-1">
            {value.map((code) => (
              <span key={code} className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-2xs font-bold text-primary">
                {code.toUpperCase()}
              </span>
            ))}
          </span>
        )}
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-background text-muted-foreground",
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
  const errorId = useId();
  const normalizedError = error.toLowerCase();
  const hasDateError = normalizedError.includes("date");
  const hasCheckInError = normalizedError.includes("check-in");
  const hasCheckOutError = normalizedError.includes("check-out");
  const hasDaysError = normalizedError.includes("days");
  const hasLayoverError = normalizedError.includes("layover count");
  const hasCreditError = normalizedError.includes("credit");
  const hasStationError = normalizedError.includes("station");

  return (
    <AppDialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
      title="Pairing Filters"
      className="w-full max-w-[760px]"
      bodyClassName="p-0"
      data-testid="pairing-preference-filter-dialog"
      footer={(
        <div className="flex w-full items-center justify-between gap-2" data-testid="pairing-filter-dialog-footer">
          <button
            className="h-8 cursor-pointer rounded-lg border border-border bg-background px-3 text-xs font-bold text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            type="button"
            onClick={onClear}
          >
            Clear All
          </button>
          <div className="flex gap-2">
            <button
              className="h-8 cursor-pointer rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled}
              type="button"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="h-8 cursor-pointer rounded-lg border border-primary bg-primary px-3 text-xs font-bold text-primary-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
              disabled={disabled}
              type="button"
              onClick={onApply}
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}
    >
        <div className="grid gap-4 overflow-x-hidden px-4 py-4 sm:px-5" data-testid="pairing-filter-dialog-body">
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

          <section aria-label="Station filters" className="grid gap-3 border-t border-border pt-3">
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

          <section aria-label="Layover and credit filters" className="grid grid-cols-2 gap-3 gap-x-4 border-t border-border pt-3">
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

          <section aria-label="Attribute filters" className="grid gap-2 border-t border-border pt-3">
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
            <p id={errorId} className={cn("m-0 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 font-semibold text-destructive", TEXT_CLASS)} role="alert">
              {error}
            </p>
          ) : null}
        </div>
    </AppDialog>
  );
};
