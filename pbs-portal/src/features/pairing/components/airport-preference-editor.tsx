import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  PbsAirportPreferenceLayoverHoursConfig,
  PbsPairingAirportOptionsResponse,
  PbsPairingAirportPreferenceOption,
} from "../../../../../packages/contracts/pbs-search-pairings.js";
import type {
  PairingAirportPreferenceBid,
  PairingAirportPreferenceLocation,
  PairingBidValue,
} from "@/features/pairing/types";
import {
  OptionalEventDateScopeEditor,
  PreferenceConditionSection,
  PreferenceHourSlider,
  PreferenceInlineSwitch,
  PreferenceSegmentedControl,
} from "@/shared/components/preferences";
import { cn } from "@/shared/lib/cn";
import {
  resolveScaledDropdownPosition,
  type ScaledDropdownPosition,
} from "@/shared/lib/scaled-dropdown-position";

type AirportPreferenceEditorProps = {
  ariaLabel: string;
  disableEventDateScope?: boolean;
  disabled?: boolean;
  options?: PbsPairingAirportOptionsResponse;
  periodCode: string;
  periodEndDate?: string;
  periodStartDate?: string;
  value: PairingBidValue;
  onChange: (value: PairingBidValue) => void;
  onValidityChange?: (isValid: boolean) => void;
};

const VIEWPORT_MARGIN = 12;
const DROPDOWN_GAP = 6;
const DROPDOWN_HEADER_HEIGHT = 42;
const DROPDOWN_MAX_OPTIONS_HEIGHT = 260;

const EMPTY_BID: PairingAirportPreferenceBid = {
  type: "airport-preference",
  event: "landing",
  locations: [],
  dateScope: null,
  minimumLayoverDuration: null,
};

const EVENT_OPTIONS: Array<{ label: string; value: NonNullable<PairingAirportPreferenceBid["event"]> }> = [
  { label: "Landing", value: "landing" },
  { label: "Layover", value: "layover" },
  { label: "Both", value: "landing_or_layover" },
];

const isAirportPreferenceBid = (value: PairingBidValue): value is PairingAirportPreferenceBid =>
  value.type === "airport-preference";

const noopValidityChange = () => undefined;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DURATION_PATTERN = /^(\d{1,3}):([0-5]\d)$/;
const DEFAULT_LAYOVER_HOURS_CONFIG: PbsAirportPreferenceLayoverHoursConfig = {
  minHours: 13,
  maxHours: 18,
  stepHours: 1,
  defaultHours: 13,
};

const isIsoDate = (value: string) => ISO_DATE_PATTERN.test(value);

const isValidDuration = (value: string) => DURATION_PATTERN.test(value.trim());

const normalizeLayoverHoursConfig = (
  config: PbsAirportPreferenceLayoverHoursConfig | undefined,
): PbsAirportPreferenceLayoverHoursConfig => {
  if (
    !config
    || !Number.isSafeInteger(config.minHours)
    || !Number.isSafeInteger(config.maxHours)
    || !Number.isSafeInteger(config.stepHours)
    || !Number.isSafeInteger(config.defaultHours)
    || config.minHours < 0
    || config.maxHours < config.minHours
    || config.stepHours < 1
    || config.defaultHours < config.minHours
    || config.defaultHours > config.maxHours
  ) {
    return DEFAULT_LAYOVER_HOURS_CONFIG;
  }

  return config;
};

const clampHours = (value: number, config: PbsAirportPreferenceLayoverHoursConfig) =>
  Math.min(Math.max(value, config.minHours), config.maxHours);

const parseDurationMinutes = (duration: string | null | undefined) => {
  if (!duration) {
    return null;
  }

  const match = duration.trim().match(DURATION_PATTERN);
  if (!match) {
    return null;
  }

  return Number.parseInt(match[1] ?? "", 10) * 60 + Number.parseInt(match[2] ?? "", 10);
};

const formatLayoverHoursDuration = (hours: number) => `${hours}:00`;

const durationToSliderHours = (
  duration: string | null | undefined,
  config: PbsAirportPreferenceLayoverHoursConfig,
) => {
  const minutes = parseDurationMinutes(duration);
  if (minutes == null) {
    return config.defaultHours;
  }

  const rawHours = minutes / 60;
  if (rawHours <= config.minHours) {
    return config.minHours;
  }

  if (rawHours >= config.maxHours) {
    return config.maxHours;
  }

  const stepsFromMin = Math.ceil((rawHours - config.minHours) / config.stepHours);
  return clampHours(config.minHours + stepsFromMin * config.stepHours, config);
};

const normalizeDurationToSliderStep = (
  duration: string | null | undefined,
  config: PbsAirportPreferenceLayoverHoursConfig,
) => parseDurationMinutes(duration) == null
  ? duration
  : formatLayoverHoursDuration(durationToSliderHours(duration, config));

const isAirportPreferenceDateScopeValid = (dateScope: PairingAirportPreferenceBid["dateScope"]) => {
  if (!dateScope) {
    return true;
  }

  if (dateScope.mode === "specific_dates") {
    return dateScope.dates.length > 0 && dateScope.dates.every(isIsoDate);
  }

  return isIsoDate(dateScope.from) && isIsoDate(dateScope.to) && dateScope.from <= dateScope.to;
};

export const isAirportPreferenceBidValueValid = (value: PairingBidValue) => {
  if (!isAirportPreferenceBid(value)) {
    return false;
  }

  const hasValidLocations = value.locations.some((location) =>
    /^[A-Za-z]{3}$/.test(location.code.trim())
    && (location.kind === "airport" || location.kind === "city"));
  const isEventValid = value.event === "landing"
    || value.event === "layover"
    || value.event === "landing_or_layover";
  const isLayoverDurationValid = value.minimumLayoverDuration == null
    || (value.event !== "landing" && isValidDuration(value.minimumLayoverDuration));

  return hasValidLocations
    && isEventValid
    && isAirportPreferenceDateScopeValid(value.dateScope)
    && isLayoverDurationValid;
};

const supportsEvent = (
  option: PbsPairingAirportPreferenceOption,
  event: PairingAirportPreferenceBid["event"] | null,
) => event === "landing_or_layover" || (event != null && option.events.includes(event));

const locationKey = (location: PairingAirportPreferenceLocation) => `${location.kind}:${location.code.toUpperCase()}`;

const AirportPreferenceLocationPicker = ({
  ariaLabel,
  disabled,
  event,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  disabled: boolean;
  event: PairingAirportPreferenceBid["event"] | null;
  options: PbsPairingAirportPreferenceOption[];
  value: PairingAirportPreferenceLocation[];
  onChange: (locations: PairingAirportPreferenceLocation[]) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [position, setPosition] = useState<ScaledDropdownPosition | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selectedKeys = useMemo(() => new Set(value.map(locationKey)), [value]);
  const availableOptions = useMemo(
    () => event == null ? [] : options.filter((option) => supportsEvent(option, event)),
    [event, options],
  );
  const visibleOptions = useMemo(() => {
    const normalizedFilter = filter.trim().toUpperCase();
    return availableOptions.filter((option) => normalizedFilter.length === 0
      || option.code.includes(normalizedFilter)
      || option.label.toUpperCase().includes(normalizedFilter));
  }, [availableOptions, filter]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    setPosition(resolveScaledDropdownPosition({
      anchorLayoutWidth: trigger.offsetWidth,
      anchorRect: trigger.getBoundingClientRect(),
      designGap: DROPDOWN_GAP,
      designHeaderHeight: DROPDOWN_HEADER_HEIGHT,
      designMaxOptionsHeight: DROPDOWN_MAX_OPTIONS_HEIGHT,
      viewportHeight: window.innerHeight,
      viewportMargin: VIEWPORT_MARGIN,
      viewportWidth: window.innerWidth,
    }));
  }, []);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const resizeObserver = trigger && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updatePosition)
      : null;

    if (trigger) {
      resizeObserver?.observe(trigger);
    }

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setPosition(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
  }, [open]);

  const toggle = (option: PbsPairingAirportPreferenceOption) => {
    const nextLocation = { code: option.code, kind: option.kind } as PairingAirportPreferenceLocation;
    const key = locationKey(nextLocation);
    onChange(selectedKeys.has(key)
      ? value.filter((location) => locationKey(location) !== key)
      : [...value, nextLocation]);
  };

  const closeDropdown = useCallback((restoreFocus = false) => {
    setOpen(false);
    setPosition(null);

    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      closeDropdown(true);
    };

    window.addEventListener("keydown", closeOnEscape, true);

    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [closeDropdown, open]);

  const dropdown = open && position ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[90] flex flex-col overflow-hidden rounded-2xl border border-[#d8dde6] bg-white shadow-[0_12px_30px_rgba(68,76,96,0.14)]"
      data-testid="airport-preference-location-dropdown"
      style={{
        bottom: position.viewportBottom ?? undefined,
        left: position.viewportLeft,
        maxHeight: position.designMaxPopupHeight,
        top: position.viewportTop ?? undefined,
        transform: `scale(${position.scale})`,
        transformOrigin: position.openAbove ? "bottom left" : "top left",
        width: position.designWidth,
      }}
      onKeyDown={(nextEvent) => {
        if (nextEvent.key !== "Escape") {
          return;
        }

        nextEvent.preventDefault();
        nextEvent.stopPropagation();
        closeDropdown(true);
      }}
    >
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[#e8ecf2] px-3 py-2">
        <MagnifyingGlassIcon className="h-3.5 w-3.5 shrink-0 text-[#8d93a5]" />
        <input
          autoFocus
          aria-label="Filter airports or cities"
          className="flex-1 bg-transparent text-xs text-[#40424f] placeholder-[#8d93a5] focus:outline-none"
          placeholder="Filter…"
          value={filter}
          onChange={(nextEvent) => setFilter(nextEvent.target.value)}
        />
      </div>
      <div
        id={listboxId}
        aria-label={`${ariaLabel} options`}
        aria-multiselectable="true"
        className="overflow-y-auto py-1"
        role="listbox"
        style={{ maxHeight: position.designMaxOptionsHeight }}
      >
        {visibleOptions.map((option) => {
          const optionKey = `${option.kind}:${option.code}`;
          const selected = selectedKeys.has(optionKey);
          return (
            <button
              key={optionKey}
              aria-selected={selected}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[#f5f7ff] focus-visible:bg-[#f5f7ff] focus-visible:outline-none",
                selected ? "font-semibold text-[#6866cc]" : "text-[#40424f]",
              )}
              role="option"
              type="button"
              onMouseDown={(nextEvent) => nextEvent.preventDefault()}
              onClick={() => toggle(option)}
            >
              <span className={cn(
                "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                selected ? "border-[#6866cc] bg-[#6866cc] text-white" : "border-[#c8cdd8] bg-white",
              )}>
                {selected ? <span className="text-3xs font-bold leading-none">✓</span> : null}
              </span>
              <span>{option.label}</span>
              <span className="ml-auto text-3xs uppercase text-[#8d93a5]">{option.kind}</span>
            </button>
          );
        })}
        {visibleOptions.length === 0 ? <p className="px-3 py-2 text-xs text-[#8d93a5]">No airports or cities match</p> : null}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={anchorRef} className="relative">
      <div
        ref={triggerRef}
        aria-controls={listboxId}
        aria-disabled={disabled || event == null}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={cn(
          "flex min-h-[42px] flex-wrap items-center gap-1 rounded-xl border border-[#d8dde6] bg-white px-2 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#706cd5]",
          disabled || event == null ? "cursor-not-allowed opacity-45" : "cursor-pointer",
        )}
        role="combobox"
        tabIndex={disabled || event == null ? -1 : 0}
        onKeyDown={(nextEvent) => {
          if (disabled || event == null) return;
          if (["Enter", " ", "ArrowDown"].includes(nextEvent.key)) {
            nextEvent.preventDefault();
            setFilter("");
            setPosition(null);
            setOpen(true);
          }
          if (nextEvent.key === "Escape") closeDropdown();
        }}
        onPointerDown={(nextEvent) => {
          if (disabled || event == null || (nextEvent.target as HTMLElement).closest("button")) return;
          setFilter("");
          setPosition(null);
          setOpen((current) => !current);
        }}
      >
        {value.map((location) => (
          <span key={locationKey(location)} className="inline-flex items-center gap-1 rounded-md bg-[#eef0f8] px-2 py-0.5 text-2xs font-medium text-[#40424f]">
            {location.code}
            <button
              aria-label={`Remove ${location.code}`}
              className="inline-flex cursor-pointer items-center text-[#8d93a5] hover:text-[#d05b5b] focus-visible:outline-none"
              disabled={disabled}
              type="button"
              onClick={(nextEvent) => {
                nextEvent.stopPropagation();
                onChange(value.filter((item) => locationKey(item) !== locationKey(location)));
              }}
              onPointerDown={(nextEvent) => nextEvent.stopPropagation()}
            >
              <XMarkIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        {value.length === 0 ? (
          <span className="flex flex-1 items-center gap-1.5 px-1 text-xs text-[#8d93a5]">
            <MagnifyingGlassIcon className="h-3.5 w-3.5 shrink-0" />
            {event == null ? "Choose an airport event first" : "Select airports or cities…"}
          </span>
        ) : <span className="ml-auto px-1 text-2xs text-[#8d93a5]">edit</span>}
      </div>
      {dropdown}
    </div>
  );
};

export const AirportPreferenceEditor = ({
  ariaLabel,
  disableEventDateScope = false,
  disabled = false,
  options,
  periodCode,
  periodEndDate = "",
  periodStartDate = "",
  value,
  onChange,
  onValidityChange = noopValidityChange,
}: AirportPreferenceEditorProps) => {
  const bid = isAirportPreferenceBid(value) ? value : EMPTY_BID;
  const durationEnabled = bid.minimumLayoverDuration != null;
  const airportOptions = options?.airportPreferenceOptions ?? [];
  const layoverHoursConfig = normalizeLayoverHoursConfig(options?.airportPreferenceLayoverHours);
  const layoverHoursValue = durationToSliderHours(bid.minimumLayoverDuration, layoverHoursConfig);

  const updateBid = (patch: Partial<PairingAirportPreferenceBid>) => onChange({ ...bid, ...patch });

  useEffect(() => {
    onValidityChange(isAirportPreferenceBidValueValid(bid));
  }, [bid, onValidityChange]);

  useEffect(() => {
    if (bid.event === "landing" || bid.minimumLayoverDuration == null) {
      return;
    }

    const normalizedDuration = normalizeDurationToSliderStep(bid.minimumLayoverDuration, layoverHoursConfig);
    if (normalizedDuration && normalizedDuration !== bid.minimumLayoverDuration) {
      onChange({ ...bid, minimumLayoverDuration: normalizedDuration });
    }
  }, [bid, layoverHoursConfig, onChange]);

  const selectEvent = (event: NonNullable<PairingAirportPreferenceBid["event"]>) => {
    const validLocationKeys = new Set(
      airportOptions.filter((option) => supportsEvent(option, event)).map((option) => `${option.kind}:${option.code}`),
    );
    updateBid({
      event,
      locations: bid.locations.filter((location) => validLocationKeys.has(locationKey(location))),
      minimumLayoverDuration: event === "landing" ? null : bid.minimumLayoverDuration,
    });
  };

  return (
    <section className="space-y-3.5">
      <PreferenceConditionSection title="AIRPORT EVENT">
        <PreferenceSegmentedControl
          className="max-w-[520px]"
          disabled={disabled}
          options={EVENT_OPTIONS}
          value={bid.event}
          onChange={selectEvent}
        />
      </PreferenceConditionSection>

      <PreferenceConditionSection title="AIRPORTS">
          <AirportPreferenceLocationPicker
            ariaLabel={`${ariaLabel} airports or cities`}
            disabled={disabled}
            event={bid.event}
            options={airportOptions}
            value={bid.locations}
            onChange={(locations) => updateBid({ locations })}
          />
      </PreferenceConditionSection>

      {!disableEventDateScope ? (
        <OptionalEventDateScopeEditor
          ariaLabel={ariaLabel}
          disabled={disabled}
          periodCode={periodCode}
          periodEndDate={periodEndDate}
          periodStartDate={periodStartDate}
          value={bid.dateScope}
          onChange={(dateScope) => updateBid({ dateScope })}
        />
      ) : null}

      {bid.event === "layover" || bid.event === "landing_or_layover" ? (
        <PreferenceConditionSection divider>
          <PreferenceInlineSwitch
            ariaLabel={`${ariaLabel} preferred layover hours`}
            checked={durationEnabled}
            disabled={disabled}
            label="PREFERRED LAYOVER HOURS"
            onToggle={() => updateBid({
              minimumLayoverDuration: durationEnabled
                ? null
                : formatLayoverHoursDuration(layoverHoursConfig.defaultHours),
            })}
          />
          {bid.event === "landing_or_layover" ? (
            <p className="m-0 mt-1 text-xs font-medium text-[#748094]">Applies to layovers only</p>
          ) : null}
          {durationEnabled ? (
            <PreferenceHourSlider
              ariaLabel={`${ariaLabel} preferred layover hours value`}
              className="mt-3"
              disabled={disabled}
              maxHours={layoverHoursConfig.maxHours}
              minHours={layoverHoursConfig.minHours}
              stepHours={layoverHoursConfig.stepHours}
              valueHours={layoverHoursValue}
              onChange={(valueHours) => updateBid({ minimumLayoverDuration: formatLayoverHoursDuration(valueHours) })}
            />
          ) : null}
        </PreferenceConditionSection>
      ) : null}

    </section>
  );
};
