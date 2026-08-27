import { XMarkIcon } from "@heroicons/react/24/outline";
import { pbsLineReserveCallTypes } from "../../../../../packages/contracts/pbs-line-bids.js";
import type { PairingBidValue, ReserveDateScope, ReserveFlyingDatePatternSegment } from "@/features/pairing/types";
import {
  isReserveDateScopeComplete,
  ReserveDateScopeControl,
} from "@/features/reserve/components/reserve-date-scope-control";
import { Button } from "@/shared/components/ui/button";

type ReserveFlyingPatternBid = Extract<PairingBidValue, { type: "reserve-flying-date-pattern" }>;
type PatternStrength = ReserveFlyingPatternBid["strength"];

type LineReserveFlyingPatternControlProps = {
  ariaLabel: string;
  allowedDateScopeModes?: ReserveDateScope["mode"][];
  bid: ReserveFlyingPatternBid;
  disabled: boolean;
  onChange: (bid: ReserveFlyingPatternBid) => void;
};

export const LINE_RESERVE_FLYING_PATTERN_MAX_SEGMENTS = 4;

export const LINE_RESERVE_FLYING_PATTERN_STRENGTH_OPTIONS: Array<{
  value: PatternStrength;
  label: string;
}> = [
  { value: "normal", label: "Normal" },
  { value: "strong", label: "Strong" },
  { value: "must_try", label: "Must Try" },
];

const getCallTypeOptions = (bid: ReserveFlyingPatternBid) =>
  bid.callTypeOptions.length > 0 ? bid.callTypeOptions : [...pbsLineReserveCallTypes];

const cloneDateScope = (dateScope: ReserveDateScope): ReserveDateScope =>
  dateScope.mode === "specific_dates"
    ? { ...dateScope, dates: [...dateScope.dates] }
    : { ...dateScope };

const cloneSegment = (segment: ReserveFlyingDatePatternSegment): ReserveFlyingDatePatternSegment =>
  segment.workType === "reserve"
    ? { ...segment, dateScope: cloneDateScope(segment.dateScope) }
    : { ...segment, dateScope: cloneDateScope(segment.dateScope) };

const buildDefaultReserveSegment = (callTypeOptions: string[]): ReserveFlyingDatePatternSegment => ({
  workType: "reserve",
  callType: callTypeOptions[0] ?? "PRAM",
  dateScope: { mode: "whole_month" },
});

const replaceSegment = (
  bid: ReserveFlyingPatternBid,
  index: number,
  segment: ReserveFlyingDatePatternSegment,
): ReserveFlyingPatternBid => ({
  ...bid,
  segments: bid.segments.map((currentSegment, currentIndex) =>
    currentIndex === index ? segment : cloneSegment(currentSegment)),
});

export const getLineReserveFlyingPatternValidationError = (bid: ReserveFlyingPatternBid) => {
  if (bid.segments.length === 0) {
    return "Add at least one segment.";
  }

  if (bid.segments.length > LINE_RESERVE_FLYING_PATTERN_MAX_SEGMENTS) {
    return `Use no more than ${LINE_RESERVE_FLYING_PATTERN_MAX_SEGMENTS} segments.`;
  }

  for (const segment of bid.segments) {
    if (segment.workType === "reserve" && segment.callType.trim().length === 0) {
      return "Reserve segments need a call type.";
    }

    if (!isReserveDateScopeComplete(segment.dateScope)) {
      return "Complete all date scopes.";
    }
  }

  return null;
};

export const LineReserveFlyingPatternControl = ({
  ariaLabel,
  allowedDateScopeModes,
  bid,
  disabled,
  onChange,
}: LineReserveFlyingPatternControlProps) => {
  const callTypeOptions = getCallTypeOptions(bid);
  const canAddSegment = bid.segments.length < LINE_RESERVE_FLYING_PATTERN_MAX_SEGMENTS;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {bid.segments.map((segment, index) => {
          const segmentLabel = `Segment ${index + 1}`;

          return (
            <div key={index} className="rounded-xl border border-[#dfe4ee] p-3">
              <div className="flex items-center gap-2">
                <p className="m-0 text-xs font-bold leading-4 text-[#6f7485]">{segmentLabel}</p>
                {bid.segments.length > 1 ? (
                  <button
                    aria-label={`Remove ${segmentLabel}`}
                    className="ml-auto inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border border-[#d8dde6] bg-white text-[#6f7485] hover:bg-[#f8f9fb] disabled:cursor-default disabled:opacity-45"
                    disabled={disabled}
                    type="button"
                    onClick={() => onChange({
                      ...bid,
                      segments: bid.segments.filter((_currentSegment, currentIndex) => currentIndex !== index).map(cloneSegment),
                    })}
                  >
                    <XMarkIcon className="h-3.5 w-3.5 stroke-[2]" />
                  </button>
                ) : null}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-[150px_1fr]">
                <label className="block">
                  <span className="block text-xs font-semibold leading-4 text-[#6f7485]">Work Type</span>
                  <select
                    aria-label={`${ariaLabel} ${segmentLabel} work type`}
                    className="mt-1 h-9 w-full rounded-lg border border-[#cfd6e4] bg-white px-3 text-sm font-semibold text-[#40424f] focus-visible:border-[#6866cc] focus-visible:outline-none"
                    disabled={disabled}
                    value={segment.workType}
                    onChange={(event) => {
                      const nextWorkType = event.target.value;
                      onChange(replaceSegment(
                        bid,
                        index,
                        nextWorkType === "reserve"
                          ? {
                              workType: "reserve",
                              callType: callTypeOptions[0] ?? "PRAM",
                              dateScope: cloneDateScope(segment.dateScope),
                            }
                          : {
                              workType: "flying",
                              dateScope: cloneDateScope(segment.dateScope),
                            },
                      ));
                    }}
                  >
                    <option value="reserve">Reserve</option>
                    <option value="flying">Flying</option>
                  </select>
                </label>

                {segment.workType === "reserve" ? (
                  <label className="block">
                    <span className="block text-xs font-semibold leading-4 text-[#6f7485]">Call Type</span>
                    <select
                      aria-label={`${ariaLabel} ${segmentLabel} call type`}
                      className="mt-1 h-9 w-full rounded-lg border border-[#cfd6e4] bg-white px-3 text-sm font-semibold text-[#40424f] focus-visible:border-[#6866cc] focus-visible:outline-none"
                      disabled={disabled}
                      value={segment.callType}
                      onChange={(event) => onChange(replaceSegment(
                        bid,
                        index,
                        {
                          ...segment,
                          callType: event.target.value,
                        },
                      ))}
                    >
                      {callTypeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div>
                    <span className="block text-xs font-semibold leading-4 text-[#6f7485]">Flying Type</span>
                    <div className="mt-1 flex h-9 items-center rounded-lg border border-[#dfe4ee] bg-[#f8f9fb] px-3 text-sm font-semibold text-[#40424f]">
                      Any Flying
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 space-y-2">
                <span className="block text-xs font-semibold leading-4 text-[#6f7485]">Date Scope</span>
                <ReserveDateScopeControl
                  ariaLabel={`${ariaLabel} ${segmentLabel} date scope`}
                  allowedModes={allowedDateScopeModes}
                  dateScope={segment.dateScope}
                  disabled={disabled}
                  inputLabelPrefix={`${ariaLabel} ${segmentLabel}`}
                  onChange={(dateScope) => onChange(replaceSegment(bid, index, {
                    ...segment,
                    dateScope,
                  }))}
                />
              </div>
            </div>
          );
        })}
      </div>

      <Button
        className="h-9 cursor-pointer rounded-lg border border-[#6866cc] bg-white px-4 text-xs font-bold text-[#6866cc] shadow-none hover:bg-[#f3f4ff] disabled:cursor-default disabled:opacity-45"
        disabled={disabled || !canAddSegment}
        type="button"
        variant="ghost"
        onClick={() => onChange({
          ...bid,
          segments: [...bid.segments.map(cloneSegment), buildDefaultReserveSegment(callTypeOptions)],
        })}
      >
        ADD SEGMENT
      </Button>

      <fieldset>
        <legend className="text-xs font-semibold leading-4 text-[#6f7485]">Preference Strength</legend>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {LINE_RESERVE_FLYING_PATTERN_STRENGTH_OPTIONS.map((option) => {
            const isSelected = bid.strength === option.value;

            return (
              <button
                key={option.value}
                aria-pressed={isSelected}
                className={[
                  "h-9 rounded-lg border px-3 text-xs font-bold",
                  isSelected
                    ? "border-[#6866cc] bg-[#f3f4ff] text-[#6866cc]"
                    : "border-[#d8dde6] bg-white text-[#6f7485] hover:bg-[#f8f9fb]",
                ].join(" ")}
                disabled={disabled}
                type="button"
                onClick={() => onChange({ ...bid, strength: option.value })}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
};
