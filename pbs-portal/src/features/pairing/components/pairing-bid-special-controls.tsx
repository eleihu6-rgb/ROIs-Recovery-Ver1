import { ChevronDownIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PbsUserCrewOption } from "../../../../../packages/contracts/pbs-search-pairings.js";
import {
  BidTextInput,
  ControlRow,
  PAIRING_BID_CONTROL_CLASS,
  StepperInput,
} from "@/features/pairing/components/pairing-bid-control-inputs";
import { formatCrewDisplayName } from "@/features/pairing/format-crew-display-name";
import { PairingPropertyChoiceGroup } from "@/features/pairing/components/pairing-property-choice-group";
import type { PairingBidValue } from "@/features/pairing/types";
import { Input } from "@/shared/components/ui/input";
import { pbsUserService } from "@/shared/services/pbs-user-service";

const employeeScheduleChoiceOptionsClassName = "grid grid-cols-2 gap-2";
const employeeScheduleChoiceButtonClassName = "w-full px-2";
const employeeScheduleThresholdOptions = [
  { value: "minimum", label: ">" },
  { value: "maximum", label: "<" },
] as const;
const MIN_CREW_QUERY_LENGTH = 1;

const useDebouncedValue = (value: string, delayMs: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [delayMs, value]);

  return debouncedValue;
};

const getEmployeeScheduleCrewId = (
  bid: Extract<PairingBidValue, { type: "employee-schedule-preference" }>,
) => bid.crewId ?? (bid as { employeeNumber?: string }).employeeNumber ?? "";

const formatCrewOptionMeta = (option: PbsUserCrewOption) =>
  [option.base, option.rank].filter(Boolean).join(" · ");

const CrewSelectControl = ({
  ariaLabel,
  bid,
  onChange,
}: {
  ariaLabel: string;
  bid: Extract<PairingBidValue, { type: "employee-schedule-preference" }>;
  onChange: (value: Extract<PairingBidValue, { type: "employee-schedule-preference" }>) => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const crewInputId = useId();
  const crewLabelId = useId();
  const [draftQuery, setDraftQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(draftQuery, 300);
  const normalizedQuery = debouncedQuery.trim();
  const crewId = getEmployeeScheduleCrewId(bid);
  const selectedName = formatCrewDisplayName(bid.crewName?.trim() || "");
  const isDebouncing = draftQuery.trim() !== normalizedQuery;
  const shouldSearch = normalizedQuery.length >= MIN_CREW_QUERY_LENGTH;
  const optionsQuery = useQuery({
    queryKey: ["pbs-user", "crew-options", normalizedQuery],
    queryFn: async () => {
      const response = await pbsUserService.searchCrewOptions(normalizedQuery, 20);

      return response.options;
    },
    enabled: shouldSearch,
    staleTime: 60_000,
  });
  const options = optionsQuery.data ?? [];

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const selectCrew = (option: PbsUserCrewOption) => {
    onChange({
      ...bid,
      crewId: option.crewId,
      crewName: formatCrewDisplayName(option.userName),
    });
    setDraftQuery("");
    setOpen(false);
  };

  const clearCrew = () => {
    onChange({
      ...bid,
      crewId: "",
      crewName: undefined,
    });
    setDraftQuery("");
    setOpen(true);
    containerRef.current?.querySelector("input")?.focus();
  };

  const handleFieldPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    if (target.closest("button[aria-label^=\"Clear crew\"]") || target.closest("input")) {
      return;
    }

    setOpen(true);
    containerRef.current?.querySelector("input")?.focus();
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-bold leading-4 text-[#8d93a5]" id={crewLabelId}>Crew</span>
      <div
        ref={containerRef}
        className="relative"
        data-testid="employee-schedule-crew-combobox"
      >
        <div
          className={`${PAIRING_BID_CONTROL_CLASS} flex min-h-[38px] cursor-text flex-wrap items-center gap-2 px-3 py-1.5`}
          onPointerDown={handleFieldPointerDown}
        >
          {crewId ? (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-[#eef2ff] px-2 py-0.5 text-xs font-medium text-[#6467d1]">
              <span className="truncate">{selectedName || crewId}</span>
              <span className="font-mono text-2xs tabular-nums text-[#8d93a5]">{crewId}</span>
              <button
                aria-label={`Clear crew ${selectedName || crewId} from ${ariaLabel}`}
                className="inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#6467d1] transition hover:bg-[#dfe5ff] focus-visible:outline-none"
                type="button"
                onClick={clearCrew}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <XMarkIcon className="h-3.5 w-3.5 stroke-[2]" />
              </button>
            </span>
          ) : null}
          <MagnifyingGlassIcon className="h-3.5 w-3.5 shrink-0 text-[#8d93a5]" />
          <Input
            aria-labelledby={crewLabelId}
            id={crewInputId}
            aria-label={`${ariaLabel} crew`}
            className="h-7 min-w-[120px] flex-1 border-0 bg-transparent px-0 text-sm font-medium text-[#6f7485] shadow-none placeholder:text-[#a0a7b5] focus-visible:ring-0"
            placeholder={crewId ? "Search to replace crew" : "Search by name or crew ID"}
            type="text"
            value={draftQuery}
            onChange={(event) => {
              setDraftQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleInputKeyDown}
            onPointerDown={(event) => event.stopPropagation()}
          />
        </div>

        {open && draftQuery.trim().length > 0 ? (
          <div
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-2xl border border-[#d8dde6] bg-white shadow-[0_12px_30px_rgba(68,76,96,0.14)]"
            role="listbox"
          >
            {!shouldSearch ? (
              <div className="px-3 py-2 text-xs font-medium text-[#8d93a5]">
                Type at least {MIN_CREW_QUERY_LENGTH} characters
              </div>
            ) : null}

            {shouldSearch && (isDebouncing || optionsQuery.isLoading || optionsQuery.isFetching) ? (
              <div className="px-3 py-2 text-xs font-medium text-[#8d93a5]" role="status">
                Loading crews...
              </div>
            ) : null}

            {shouldSearch && !isDebouncing && optionsQuery.isError ? (
              <div className="px-3 py-2 text-xs font-medium text-[#d05b5b]" role="alert">
                Unable to load crews
              </div>
            ) : null}

            {shouldSearch && !isDebouncing && !optionsQuery.isLoading && !optionsQuery.isError && options.length === 0 ? (
              <div className="px-3 py-2 text-xs font-medium text-[#8d93a5]">
                No matching crew
              </div>
            ) : null}

            {shouldSearch && !isDebouncing && !optionsQuery.isError && options.length > 0 ? (
              <div className="max-h-[220px] overflow-y-auto py-1">
                {options.map((option) => {
                  const displayName = formatCrewDisplayName(option.userName);
                  const meta = formatCrewOptionMeta(option);

                  return (
                    <button
                      key={option.crewId}
                      aria-label={`${displayName} ${option.crewId}`}
                      className="flex w-full cursor-pointer px-3 py-2 text-left hover:bg-[#f5f7ff] focus-visible:bg-[#f5f7ff] focus-visible:outline-none"
                      role="option"
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectCrew(option)}
                    >
                      <span className="flex w-full items-start justify-between gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-[#40424f]">{displayName}</span>
                          {meta ? (
                            <span className="mt-0.5 block text-2xs text-[#8d93a5]">{meta}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-[#8d93a5]">{option.crewId}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const DaysOffOnPatternControl = ({
  ariaLabel,
  bid,
  onChange,
}: {
  ariaLabel: string;
  bid: Extract<PairingBidValue, { type: "days-off-on-pattern" }>;
  onChange: (value: Extract<PairingBidValue, { type: "days-off-on-pattern" }>) => void;
}) => (
  <div className="space-y-3">
    <div className="flex flex-wrap items-end gap-x-[8px] gap-y-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold leading-4 text-[#8d93a5]">WORK DAYS MIN</span>
        <StepperInput
          ariaLabel={`${ariaLabel} min days on`}
          max={bid.max}
          min={bid.min}
          value={bid.minDaysOn}
          onValueChange={(minDaysOn) => onChange({ ...bid, minDaysOn })}
        />
      </label>
      <span className="pb-[7px] text-sm font-medium text-[#6f7485]">to</span>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold leading-4 text-[#8d93a5]">WORK DAYS MAX</span>
        <StepperInput
          ariaLabel={`${ariaLabel} max days on`}
          max={bid.max}
          min={bid.min}
          value={bid.maxDaysOn}
          onValueChange={(maxDaysOn) => onChange({ ...bid, maxDaysOn })}
        />
      </label>
    </div>
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold leading-4 text-[#8d93a5]">DAYS OFF</span>
      <div className="flex flex-wrap items-center gap-x-[8px] gap-y-2">
        <StepperInput
          ariaLabel={`${ariaLabel} minimum days off`}
          max={bid.max}
          min={bid.min}
          value={bid.minDaysOff}
          onValueChange={(minDaysOff) => onChange({ ...bid, minDaysOff })}
        />
      </div>
    </label>
    <p className="m-0 text-sm font-medium leading-5 text-[#6f7485]">
      Work {bid.minDaysOn === bid.maxDaysOn ? bid.minDaysOn : `${bid.minDaysOn}-${bid.maxDaysOn}`} days, then {bid.minDaysOff} days off
    </p>
  </div>
);

export const CrewDaysOffShareControl = ({
  ariaLabel,
  bid,
  onChange,
}: {
  ariaLabel: string;
  bid: Extract<PairingBidValue, { type: "crew-days-off-share" }>;
  onChange: (value: Extract<PairingBidValue, { type: "crew-days-off-share" }>) => void;
}) => (
  <ControlRow wrap>
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold leading-4 text-[#8d93a5]">Employee Number</span>
      <BidTextInput
        ariaLabel={`${ariaLabel} employee number`}
        className="w-[160px]"
        type="text"
        value={bid.employeeNumber}
        onValueChange={(employeeNumber) => onChange({ ...bid, employeeNumber })}
      />
    </label>
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold leading-4 text-[#8d93a5]">Minimum shared days</span>
      <StepperInput
        ariaLabel={`${ariaLabel} minimum shared days`}
        max={bid.max}
        min={bid.min}
        value={bid.minimumDays}
        onValueChange={(minimumDays) => onChange({ ...bid, minimumDays })}
      />
    </label>
  </ControlRow>
);

export const EmployeeSchedulePreferenceControl = ({
  ariaLabel,
  bid,
  onChange,
}: {
  ariaLabel: string;
  bid: Extract<PairingBidValue, { type: "employee-schedule-preference" }>;
  onChange: (value: Extract<PairingBidValue, { type: "employee-schedule-preference" }>) => void;
}) => (
  <div className="flex flex-col gap-4">
    <CrewSelectControl ariaLabel={ariaLabel} bid={bid} onChange={onChange} />
    <PairingPropertyChoiceGroup
      disabled={false}
      getLabel={(value) => value === "together" ? "Together" : "Apart"}
      label="Relationship"
      options={["together", "apart"] as const}
      selectedValue={bid.relationship}
      buttonClassName={employeeScheduleChoiceButtonClassName}
      optionsClassName={employeeScheduleChoiceOptionsClassName}
      onSelect={(relationship) => onChange({ ...bid, relationship })}
    />
    <PairingPropertyChoiceGroup
      disabled={false}
      getLabel={(value) => value === "work" ? "Work" : "Days Off"}
      label="Schedule Type"
      options={["work", "days_off"] as const}
      selectedValue={bid.scheduleType}
      buttonClassName={employeeScheduleChoiceButtonClassName}
      optionsClassName={employeeScheduleChoiceOptionsClassName}
      onSelect={(scheduleType) => onChange({ ...bid, scheduleType })}
    />
    <ControlRow>
      <div className="relative w-[112px] shrink-0">
        <select
          aria-label={`${ariaLabel} threshold operator`}
          className={`${PAIRING_BID_CONTROL_CLASS} w-full appearance-none pr-8`}
          value={bid.thresholdType}
          onChange={(event) =>
            onChange({
              ...bid,
              thresholdType: event.target.value as "minimum" | "maximum",
            })}
        >
          {employeeScheduleThresholdOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-[8px] top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8392]" />
      </div>
      <StepperInput
        ariaLabel={`${ariaLabel} days`}
        max={bid.max}
        min={bid.min}
        value={bid.days}
        onValueChange={(days) => onChange({ ...bid, days })}
      />
    </ControlRow>
  </div>
);
