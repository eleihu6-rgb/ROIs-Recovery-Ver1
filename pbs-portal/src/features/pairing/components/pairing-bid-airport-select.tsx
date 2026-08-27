import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TagListBid } from "@/features/pairing/pairing-bid-control-logic";
import {
  resolveScaledDropdownPosition,
  type ScaledDropdownPosition,
} from "@/shared/lib/scaled-dropdown-position";

type AirportMultiSelectProps = {
  bid: TagListBid;
  ariaLabel: string;
  optionGroup?: "landing-layover" | "work-start";
  options: { landingAirports: string[]; layoverAirports: string[]; workStartStations?: string[] };
  onChange: (bid: TagListBid) => void;
};

const DROPDOWN_GAP = 6;
const DROPDOWN_HEADER_HEIGHT = 42;
const DROPDOWN_MAX_OPTIONS_HEIGHT = 260;
const VIEWPORT_MARGIN = 12;

export const AirportMultiSelect = ({
  bid,
  ariaLabel,
  optionGroup = "landing-layover",
  options,
  onChange,
}: AirportMultiSelectProps) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [dropdownPosition, setDropdownPosition] = useState<ScaledDropdownPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selected = new Set(bid.values.map((v) => v.toUpperCase()));

  const updateDropdownPosition = useCallback(() => {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    setDropdownPosition(resolveScaledDropdownPosition({
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
    if (!open) {
      return;
    }

    updateDropdownPosition();
  }, [open, updateDropdownPosition]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const trigger = triggerRef.current;
    const resizeObserver = trigger && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updateDropdownPosition)
      : null;

    if (trigger) {
      resizeObserver?.observe(trigger);
    }

    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [open, updateDropdownPosition]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
      setDropdownPosition(null);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  const toggleAirport = (code: string) => {
    const upper = code.toUpperCase();
    const next = selected.has(upper)
      ? bid.values.filter((v) => v.toUpperCase() !== upper)
      : [...bid.values, upper];

    onChange({ ...bid, values: next });
  };

  const removeAll = () => onChange({ ...bid, values: [] });

  const normalizedFilter = filter.trim().toUpperCase();
  const filteredLanding = options.landingAirports.filter(
    (a) => normalizedFilter === "" || a.includes(normalizedFilter),
  );
  const filteredLayover = options.layoverAirports.filter(
    (a) => normalizedFilter === "" || a.includes(normalizedFilter),
  );
  const filteredWorkStart = (options.workStartStations ?? []).filter(
    (a) => normalizedFilter === "" || a.includes(normalizedFilter),
  );
  const visibleGroups = optionGroup === "work-start"
    ? [{ label: "Work Start", options: filteredWorkStart }]
    : [
        { label: "Landing", options: filteredLanding },
        { label: "Layover", options: filteredLayover },
      ];
  const hasVisibleOptions = visibleGroups.some((group) => group.options.length > 0);

  const handleFieldPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    if (target.closest('button[aria-label^="Remove"]')) {
      return;
    }

    setDropdownPosition(null);
    setOpen((prev) => {
      if (!prev) setFilter("");
      return !prev;
    });
  };

  const handleFieldKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      event.preventDefault();

      if (!open) {
        setFilter("");
        setDropdownPosition(null);
        setOpen(true);
      }

      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setDropdownPosition(null);
    }
  };

  const closeDropdown = useCallback((restoreFocus = false) => {
    setOpen(false);
    setDropdownPosition(null);

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

  const dropdown = open && dropdownPosition
    ? createPortal(
      <div
        ref={dropdownRef}
        className="fixed z-[90] flex flex-col overflow-hidden rounded-2xl border border-[#d8dde6] bg-white shadow-[0_12px_30px_rgba(68,76,96,0.14)]"
        data-testid="pairing-airport-dropdown"
        style={{
          bottom: dropdownPosition.viewportBottom ?? undefined,
          left: dropdownPosition.viewportLeft,
          maxHeight: dropdownPosition.designMaxPopupHeight,
          top: dropdownPosition.viewportTop ?? undefined,
          transform: `scale(${dropdownPosition.scale})`,
          transformOrigin: dropdownPosition.openAbove ? "bottom left" : "top left",
          width: dropdownPosition.designWidth,
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          closeDropdown(true);
        }}
      >
        <div className="flex shrink-0 items-center gap-1.5 border-b border-[#e8ecf2] px-3 py-2">
          <MagnifyingGlassIcon className="h-3.5 w-3.5 shrink-0 text-[#8d93a5]" />
          <input
            autoFocus
            aria-label={optionGroup === "work-start" ? "Filter stations" : "Filter airports"}
            className="flex-1 bg-transparent text-xs text-[#40424f] placeholder-[#8d93a5] focus:outline-none"
            placeholder="Filter…"
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {bid.values.length > 0 ? (
            <button
              className="text-2xs text-[#8d93a5] hover:text-[#d05b5b] focus-visible:outline-none"
              type="button"
              onClick={removeAll}
            >
              Clear all
            </button>
          ) : null}
        </div>

        <div
          id={listboxId}
          aria-label={`${ariaLabel} options`}
          aria-multiselectable="true"
          className="overflow-y-auto py-1"
          role="listbox"
          style={{ maxHeight: dropdownPosition.designMaxOptionsHeight }}
        >
          {visibleGroups.map((group) => (
            group.options.length > 0 ? (
              <div key={group.label}>
                <p className="px-3 pb-0.5 pt-2 text-3xs font-semibold uppercase tracking-wide text-[#8d93a5]">
                  {group.label}
                </p>
                {group.options.map((code) => (
                  <AirportOption
                    key={code}
                    code={code}
                    selected={selected.has(code)}
                    onToggle={toggleAirport}
                  />
                ))}
              </div>
            ) : null
          ))}

          {!hasVisibleOptions ? (
            <p className="px-3 py-2 text-xs text-[#8d93a5]">
              {optionGroup === "work-start" ? "No stations match" : "No airports match"}
            </p>
          ) : null}
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        ref={triggerRef}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="flex min-h-[38px] cursor-pointer flex-wrap items-center gap-1 rounded-xl border border-[#d8dde6] bg-white px-2 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#706cd5]"
        data-testid="pairing-airport-combobox"
        role="combobox"
        tabIndex={0}
        onKeyDown={handleFieldKeyDown}
        onPointerDown={handleFieldPointerDown}
      >
        {bid.values.map((code) => (
          <span
            key={code}
            className="inline-flex items-center gap-1 rounded-md bg-[#eef0f8] px-2 py-0.5 text-2xs font-medium text-[#40424f]"
          >
            {code.toUpperCase()}
            <button
              aria-label={`Remove ${code}`}
              className="inline-flex cursor-pointer items-center text-[#8d93a5] hover:text-[#d05b5b] focus-visible:outline-none"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                toggleAirport(code);
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <XMarkIcon className="h-3 w-3 shrink-0" />
            </button>
          </span>
        ))}
        {bid.values.length === 0 ? (
          <span className="flex flex-1 items-center gap-1.5 px-1 text-xs text-[#8d93a5]">
            <MagnifyingGlassIcon className="h-3.5 w-3.5 shrink-0" />
            {optionGroup === "work-start" ? "Select stations..." : "Select airports..."}
          </span>
        ) : (
          <span className="ml-auto flex items-center gap-1 px-1 text-2xs text-[#8d93a5]">
            <MagnifyingGlassIcon className="h-3 w-3 shrink-0" />
            edit
          </span>
        )}
      </div>

      {dropdown}
    </div>
  );
};

const AirportOption = ({
  code,
  selected,
  onToggle,
}: {
  code: string;
  selected: boolean;
  onToggle: (code: string) => void;
}) => (
  <button
    aria-selected={selected}
    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[#f5f7ff] focus-visible:bg-[#f5f7ff] focus-visible:outline-none ${selected ? "font-semibold text-[#6866cc]" : "text-[#40424f]"}`}
    role="option"
    type="button"
    onMouseDown={(e) => e.preventDefault()}
    onClick={() => onToggle(code)}
  >
    <span
      className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${selected ? "border-[#6866cc] bg-[#6866cc] text-white" : "border-[#c8cdd8] bg-white"}`}
    >
      {selected ? <span className="text-3xs font-bold leading-none">✓</span> : null}
    </span>
    {code}
  </button>
);
