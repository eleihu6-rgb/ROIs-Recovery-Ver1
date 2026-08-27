import { XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";

import {
  containsExplicitCalendarDate,
  pbsFavoriteDateSemanticContexts,
} from "../../../../../packages/contracts/pbs-favorite-eligibility.js";
import {
  pbsLineAaPropertyCodes,
  pbsLineF8PropertyCodes,
  pbsLineLegacyPropertyCodes,
  pbsLineReserveCallTypes,
  pbsLineReservePropertyCodes,
  type PbsLineCreditWindowConfig,
  type PbsLineMinimumBaseLayoverConfig,
} from "../../../../../packages/contracts/pbs-line-bids.js";
import { listPbsPeriodDates } from "../../../../../packages/contracts/pbs-prefer-off.js";
import { PairingBidControl } from "@/features/pairing/components/pairing-bid-control";
import { clampPairingBidNumber } from "@/features/pairing/pairing-bid-control-logic";
import type { ReserveDateScope } from "@/features/pairing/types";
import {
  getLineReserveFlyingPatternValidationError,
  LineReserveFlyingPatternControl,
} from "@/features/line/components/line-reserve-flying-pattern-control";
import {
  MIXED_LINE_BID_DISPLAY_NAME,
  isMixedLineReserveModeProperty,
  isMixedLineShortCallProperty,
  isMixedLineBidProperty,
  withMixedLineAdditionalProperties,
} from "@/features/line/mixed-line-bid";
import {
  isReserveDateScopeComplete,
  ReserveDateScopeControl,
} from "@/features/reserve/components/reserve-date-scope-control";
import type { RuleBidAvailableProperty, RuleBidTierOption, RuleBidValue } from "@/features/rule-bids/types";
import { isPairingBidValue } from "@/features/rule-bids/types";
import { TierSelectionTitle, TierToggleGroup } from "@/shared/components/tiers";
import {
  PbsDatePicker,
  PbsInputNumber,
  PreferenceConditionSection,
  PreferenceSegmentedControl,
  togglePreferenceTier,
} from "@/shared/components/preferences";
import { PbsBidDialogFooter } from "@/shared/components/preferences/pbs-bid-dialog-footer";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { PbsDialogFrame } from "@/shared/components/ui/pbs-dialog-frame";
import { lineService } from "@/shared/services/line-service";

const DAY_MS = 86_400_000;

type LineBidDialogProps = {
  allowedReserveDateScopeModes?: ReserveDateScope["mode"][];
  confirmLabel?: string;
  confirmPendingLabel?: string;
  dialogContext?: "current" | "standing";
  disableAbsoluteDates?: boolean;
  favoriteLabel?: string;
  favoriteEditMode?: boolean;
  isOpen: boolean;
  isPending: boolean;
  isFavoritePending?: boolean;
  periodCode: string;
  periodEndDate?: string;
  periodStartDate?: string;
  property: RuleBidAvailableProperty;
  startWithNoActiveTiers?: boolean;
  validationError?: string | null;
  mixedLineShortCallSourceContext?: RuleBidAvailableProperty["sourceContext"];
  onCancel: () => void;
  onConfirm: (property: RuleBidAvailableProperty) => void;
  onRemove?: () => void;
  onSaveFavorite?: (property: RuleBidAvailableProperty) => void;
};

const FAVORITE_RESERVE_DATE_SCOPE_MODES: ReserveDateScope["mode"][] = [
  "whole_month",
  "first_half",
  "second_half",
];

const ensureDefaultActiveTier = (tiers: RuleBidTierOption[]) => {
  if (tiers.some((tier) => tier.active)) {
    return tiers.map((tier) => ({ ...tier }));
  }

  return tiers.map((tier, index) => ({
    ...tier,
    active: index === 0,
  }));
};

const initializeDialogTiers = (
  tiers: RuleBidTierOption[],
  startWithNoActiveTiers: boolean,
  isCommuterPattern: boolean,
) => startWithNoActiveTiers
  ? tiers.map((tier) => ({ ...tier, active: false }))
  : isCommuterPattern
    ? tiers.map((tier) => ({ ...tier }))
    : ensureDefaultActiveTier(tiers);

const parseLineDurationMinutes = (value: string) => {
  const match = value.trim().match(/^(\d{1,3}):([0-5]\d)$/);

  if (!match) {
    return null;
  }

  return Number.parseInt(match[1] ?? "", 10) * 60 + Number.parseInt(match[2] ?? "", 10);
};

const formatLineDurationCompactFromMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}:${String(remainder).padStart(2, "0")}`;
};

const formatLineDurationCompact = (duration: string) => {
  const minutes = parseLineDurationMinutes(duration);
  return minutes === null ? duration.trim() : formatLineDurationCompactFromMinutes(minutes);
};

const normalizeLineDurationDisplay = (duration: string) => {
  const minutes = parseLineDurationMinutes(duration);
  return minutes === null ? duration : formatLineDurationCompactFromMinutes(minutes);
};

const getBidValidationError = (
  bid: RuleBidValue,
  periodStartDate: string,
  periodEndDate: string,
  minimumBaseLayoverConfig: PbsLineMinimumBaseLayoverConfig | null = null,
) => {
  if (bid.type === "text" && bid.value.trim().length === 0) {
    return "Bid value is required.";
  }

  if (bid.type === "minimum-base-layover") {
    const durationMinutes = parseLineDurationMinutes(bid.minimumDuration);

    if (durationMinutes === null) {
      return "Minimum Base Layover must use HH:MM.";
    }

    if (minimumBaseLayoverConfig?.available) {
      const minimumMinutes = parseLineDurationMinutes(minimumBaseLayoverConfig.minDuration);

      if (minimumMinutes !== null && durationMinutes < minimumMinutes) {
        return `Minimum Base Layover must be at least ${formatLineDurationCompact(minimumBaseLayoverConfig.minDuration)}.`;
      }
    }
  }

  if (bid.type === "days-off-on-pattern") {
    if (
      !Number.isSafeInteger(bid.minDaysOff)
      || !Number.isSafeInteger(bid.minDaysOn)
      || !Number.isSafeInteger(bid.maxDaysOn)
      || bid.minDaysOff < 1
      || bid.minDaysOn < 1
      || bid.maxDaysOn < 1
    ) {
      return "Pattern days must be at least 1.";
    }

    if (bid.minDaysOn > bid.maxDaysOn) {
      return "Max days on must be greater than or equal to min days on.";
    }

    if (bid.dateRange) {
      if (!isIsoDate(bid.dateRange.from) || !isIsoDate(bid.dateRange.to)) {
        return "Select a valid window start and end date.";
      }

      if (bid.dateRange.from > bid.dateRange.to) {
        return "End date must be on or after start date.";
      }

      if (!isDateRangeInsidePeriod(
        bid.dateRange.from,
        bid.dateRange.to,
        periodStartDate,
        periodEndDate,
      )) {
        return "Commuter Pattern date window must be inside the current bid period.";
      }

      const windowDays = getInclusiveDateWindowDays(bid.dateRange.from, bid.dateRange.to);
      const minimumCycleDays = bid.minDaysOn + bid.minDaysOff;

      if (windowDays !== null && windowDays < minimumCycleDays) {
        return `Commuter Pattern date range must be at least ${minimumCycleDays} days long.`;
      }
    }
  }

  if (bid.type === "credit-density-preference") {
    const creditMatch = bid.minimumTotalCredit.trim().match(/^(\d{2,3}):([0-5]\d)$/);
    const creditMinutes = creditMatch
      ? Number.parseInt(creditMatch[1] ?? "", 10) * 60 + Number.parseInt(creditMatch[2] ?? "", 10)
      : null;

    if (creditMinutes === null || creditMinutes < 40 * 60 || creditMinutes > 120 * 60) {
      return "Minimum total credit must be between 40:00 and 120:00.";
    }

    if (
      !Number.isSafeInteger(bid.maximumWorkingDays)
      || bid.maximumWorkingDays < 1
      || bid.maximumWorkingDays > 31
    ) {
      return "Maximum working days must be between 1 and 31.";
    }
  }

  if (bid.type === "credit-window-preference") {
    return null;
  }

  if (bid.type === "reserve-flying-date-pattern") {
    return getLineReserveFlyingPatternValidationError(bid);
  }

  return null;
};

const CREDIT_DENSITY_STRENGTH_OPTIONS: Array<{
  value: Extract<RuleBidValue, { type: "credit-density-preference" }>["strength"];
  label: string;
}> = [
  { value: "normal", label: "Normal" },
  { value: "strong", label: "Strong" },
  { value: "must_try", label: "Must Try" },
];

const isCreditDensityBid = (
  bid: RuleBidValue,
): bid is Extract<RuleBidValue, { type: "credit-density-preference" }> =>
  bid.type === "credit-density-preference";

const isReserveFlyingPatternBid = (
  bid: RuleBidValue,
): bid is Extract<RuleBidValue, { type: "reserve-flying-date-pattern" }> =>
  bid.type === "reserve-flying-date-pattern";

const isCreditWindowPreferenceBid = (
  bid: RuleBidValue,
): bid is Extract<RuleBidValue, { type: "credit-window-preference" }> =>
  bid.type === "credit-window-preference";

const isMinimumBaseLayoverBid = (
  bid: RuleBidValue,
): bid is Extract<RuleBidValue, { type: "minimum-base-layover" }> =>
  bid.type === "minimum-base-layover";

const getInitialLineAction = (
  property: Pick<RuleBidAvailableProperty, "action" | "id" | "propertyCode" | "source">,
) => {
  if (isMixedLineShortCallProperty(property)) {
    return null;
  }

  if (!isMixedLineReserveModeProperty(property)) {
    return property.action ?? null;
  }

  return property.source === "catalog" || property.id.startsWith("available-")
    ? null
    : property.action ?? null;
};

const getInitialLineBid = (property: RuleBidAvailableProperty): RuleBidValue =>
  isMixedLineReserveModeProperty(property) && property.bid.type !== "flag"
    ? { type: "flag" }
    : property.bid;

const isCreditWindowPreferenceProperty = (property: Pick<RuleBidAvailableProperty, "propertyCode">) =>
  property.propertyCode === pbsLineF8PropertyCodes.creditWindowPreference;

const isMinimumBaseLayoverProperty = (property: Pick<RuleBidAvailableProperty, "propertyCode">) =>
  property.propertyCode === pbsLineLegacyPropertyCodes.minBaseLayover;

const isCommuterPatternProperty = (property: Pick<RuleBidAvailableProperty, "propertyCode">) =>
  property.propertyCode === pbsLineLegacyPropertyCodes.commuterPattern;

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const parseIsoDate = (value: string) => {
  if (!isIsoDate(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
};

const getInclusiveDateWindowDays = (from: string, to: string) => {
  const fromDate = parseIsoDate(from);
  const toDate = parseIsoDate(to);

  if (!fromDate || !toDate) {
    return null;
  }

  return Math.floor((toDate.getTime() - fromDate.getTime()) / DAY_MS) + 1;
};

const getPeriodDateBounds = (periodStartDate: string, periodEndDate: string) => {
  const periodDates = listPbsPeriodDates(periodStartDate, periodEndDate);
  const from = periodDates[0];
  const to = periodDates[periodDates.length - 1];

  return from && to ? { from, to } : null;
};

const isDateRangeInsidePeriod = (
  from: string,
  to: string,
  periodStartDate: string,
  periodEndDate: string,
) => {
  const periodBounds = getPeriodDateBounds(periodStartDate, periodEndDate);

  if (!periodBounds) {
    return true;
  }

  return from >= periodBounds.from && to <= periodBounds.to;
};

const applyMinimumBaseLayoverConfigToBid = (
  bid: Extract<RuleBidValue, { type: "minimum-base-layover" }>,
  config: PbsLineMinimumBaseLayoverConfig,
): Extract<RuleBidValue, { type: "minimum-base-layover" }> => {
  if (!config.available) {
    return bid;
  }

  return {
    ...bid,
    minimumDuration: normalizeLineDurationDisplay(bid.minimumDuration.trim() || config.minDuration),
  };
};

export const CreditDensityPreferenceControl = ({
  ariaLabel,
  bid,
  disabled,
  onChange,
}: {
  ariaLabel: string;
  bid: Extract<RuleBidValue, { type: "credit-density-preference" }>;
  disabled: boolean;
  onChange: (bid: Extract<RuleBidValue, { type: "credit-density-preference" }>) => void;
}) => (
  <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
    <label className="block">
      <span className="block text-xs font-semibold leading-4 text-[#6f7485]">Minimum Total Credit</span>
      <Input
        aria-label={`${ariaLabel} minimum total credit`}
        className="mt-1 h-9 rounded-lg border-[#d8dde6] text-sm font-semibold text-[#282c3b]"
        disabled={disabled}
        value={bid.minimumTotalCredit}
        onChange={(event) => onChange({ ...bid, minimumTotalCredit: event.target.value })}
      />
    </label>
    <label className="block">
      <span className="block text-xs font-semibold leading-4 text-[#6f7485]">Maximum Working Days</span>
      <Input
        aria-label={`${ariaLabel} maximum working days`}
        className="mt-1 h-9 rounded-lg border-[#d8dde6] text-sm font-semibold text-[#282c3b]"
        disabled={disabled}
        min={1}
        max={31}
        type="number"
        value={String(bid.maximumWorkingDays)}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          onChange({
            ...bid,
            maximumWorkingDays: Number.isNaN(parsed) ? 0 : parsed,
          });
        }}
      />
    </label>
    <fieldset className="sm:col-span-2">
      <legend className="text-xs font-semibold leading-4 text-[#6f7485]">Preference Strength</legend>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {CREDIT_DENSITY_STRENGTH_OPTIONS.map((option) => {
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

const CREDIT_WINDOW_DIRECTION_OPTIONS: Array<{
  value: Extract<RuleBidValue, { type: "credit-window-preference" }>["direction"];
  label: string;
}> = [
  { value: "more", label: "More credit" },
  { value: "less", label: "Less credit" },
];

const AWARD_AVOID_ACTION_OPTIONS = [
  { value: "award" as const, label: "Award" },
  { value: "avoid" as const, label: "Avoid" },
];

const RESERVE_LINE_ACTION_OPTIONS = [
  { value: "mixed" as const, label: "Mixed Line", ariaLabel: "Mixed Line" },
  { value: "award" as const, label: "Reserve Only", ariaLabel: "Reserve Only" },
  { value: "avoid" as const, label: "Pairing Only", ariaLabel: "Pairing Only" },
];

type ReserveLineActionMode = typeof RESERVE_LINE_ACTION_OPTIONS[number]["value"];
type MixedLineShortCallBid = Extract<RuleBidValue, { type: "reserve-call-type-date-scope" }>;
type MixedLineShortCallAction = NonNullable<RuleBidAvailableProperty["action"]>;
type MixedLineShortCallRow = {
  id: string;
  action: MixedLineShortCallAction;
  bid: MixedLineShortCallBid;
};

const getReserveLineActionMode = (
  action: RuleBidAvailableProperty["action"],
): ReserveLineActionMode => action ?? "mixed";

const getReserveLineActionFromMode = (
  mode: ReserveLineActionMode,
): RuleBidAvailableProperty["action"] => mode === "mixed" ? null : mode;

const cloneReserveDateScope = (dateScope: ReserveDateScope): ReserveDateScope =>
  dateScope.mode === "specific_dates"
    ? { ...dateScope, dates: [...dateScope.dates] }
    : { ...dateScope };

const getInitialShortCallBid = (property: RuleBidAvailableProperty): MixedLineShortCallBid => {
  if (property.bid.type === "reserve-call-type-date-scope") {
    return {
      ...property.bid,
      options: [...property.bid.options],
      dateScope: cloneReserveDateScope(property.bid.dateScope),
    };
  }

  return {
    type: "reserve-call-type-date-scope",
    callType: "PRAM",
    options: [...pbsLineReserveCallTypes],
    dateScope: { mode: "whole_month" },
  };
};

const getInitialShortCallAction = (
  property: RuleBidAvailableProperty,
): MixedLineShortCallAction => property.action === "avoid" ? "avoid" : "award";

const createDefaultShortCallRow = (): MixedLineShortCallRow => ({
  id: `mixed-line-short-call-${Math.random().toString(36).slice(2)}`,
  action: "award",
  bid: getInitialShortCallBid({
    id: "mixed-line-short-call-default",
    propertyCode: pbsLineReservePropertyCodes.shortCallType,
    name: MIXED_LINE_BID_DISPLAY_NAME,
    action: "award",
    favorited: false,
    bid: { type: "flag" },
    tiers: [],
  }),
});

const getInitialShortCallRows = (
  property: RuleBidAvailableProperty,
): MixedLineShortCallRow[] => isMixedLineShortCallProperty(property)
  ? [{
      id: property.id,
      action: getInitialShortCallAction(property),
      bid: getInitialShortCallBid(property),
    }]
  : [];

const isMixedLineShortCallBidComplete = (
  bid: MixedLineShortCallBid,
  periodStartDate: string,
  periodEndDate: string,
  allowAbsoluteDates: boolean,
) => {
  if (!bid.options.includes(bid.callType) || bid.callType.trim().length === 0) {
    return false;
  }

  if (!allowAbsoluteDates && (bid.dateScope.mode === "date_range" || bid.dateScope.mode === "specific_dates")) {
    return false;
  }

  if (!isReserveDateScopeComplete(bid.dateScope)) {
    return false;
  }

  if (bid.dateScope.mode !== "date_range") {
    return true;
  }

  return isDateRangeInsidePeriod(bid.dateScope.from, bid.dateScope.to, periodStartDate, periodEndDate);
};

const getMixedLineShortCallValidationError = (
  bid: MixedLineShortCallBid,
  periodStartDate: string,
  periodEndDate: string,
  allowAbsoluteDates: boolean,
): string | null => {
  if (!bid.options.includes(bid.callType) || bid.callType.trim().length === 0) {
    return "Reserve Short Call requires a valid short-call type.";
  }

  if (!allowAbsoluteDates && (bid.dateScope.mode === "date_range" || bid.dateScope.mode === "specific_dates")) {
    return "Standing Bid only supports Whole Month, First Half, or Second Half.";
  }

  if (!isReserveDateScopeComplete(bid.dateScope)) {
    return "Reserve Short Call requires a valid date scope.";
  }

  if (
    bid.dateScope.mode === "date_range"
    && !isDateRangeInsidePeriod(bid.dateScope.from, bid.dateScope.to, periodStartDate, periodEndDate)
  ) {
    return "Reserve Short Call date range must be inside the current bid period.";
  }

  return null;
};

const AwardAvoidActionControl = ({
  action,
  disabled,
  error,
  legend,
  onChange,
}: {
  action: RuleBidAvailableProperty["action"];
  disabled: boolean;
  error: string | null;
  legend: string;
  onChange: (action: NonNullable<RuleBidAvailableProperty["action"]>) => void;
}) => (
  <fieldset>
    <legend className="text-xs font-bold leading-4 text-[#8d93a5]">{legend}</legend>
    <div className="mt-2 grid grid-cols-2 gap-2">
      {AWARD_AVOID_ACTION_OPTIONS.map((option) => {
        const isSelected = action === option.value;

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
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
    {error ? (
      <p className="m-0 mt-2 text-xs font-semibold leading-4 text-[#d05b5b]" role="alert">
        {error}
      </p>
    ) : null}
  </fieldset>
);

export const ReserveLinePreferenceControl = ({
  action,
  disabled,
  onChange,
}: {
  action: RuleBidAvailableProperty["action"];
  disabled: boolean;
  onChange: (action: RuleBidAvailableProperty["action"]) => void;
}) => (
  <PreferenceConditionSection title="PREFERENCE">
    <fieldset>
      <legend className="sr-only">Reserve preference</legend>
      <PreferenceSegmentedControl
        disabled={disabled}
        options={RESERVE_LINE_ACTION_OPTIONS}
        value={getReserveLineActionMode(action)}
        onChange={(mode) => onChange(getReserveLineActionFromMode(mode))}
      />
    </fieldset>
  </PreferenceConditionSection>
);

const MixedLineShortCallControl = ({
  action,
  ariaLabel,
  bid,
  disabled,
  periodCode,
  periodEndDate,
  periodStartDate,
  rowLabel,
  useRelativeDateScope,
  onActionChange,
  onBidChange,
  onRemove,
}: {
  action: MixedLineShortCallAction;
  ariaLabel: string;
  bid: MixedLineShortCallBid;
  disabled: boolean;
  periodCode: string;
  periodEndDate: string;
  periodStartDate: string;
  rowLabel?: string;
  useRelativeDateScope: boolean;
  onActionChange: (action: MixedLineShortCallAction) => void;
  onBidChange: (bid: MixedLineShortCallBid) => void;
  onRemove: () => void;
}) => {
  const dateRangeEnabled = bid.dateScope.mode === "date_range";
  const removeButton = (
    <Button
      className="h-8 shrink-0 cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-3 text-xs font-bold text-[#6f7485] shadow-none hover:bg-[#f8f9fb]"
      disabled={disabled}
      type="button"
      variant="ghost"
      onClick={onRemove}
    >
      REMOVE
    </Button>
  );

  return (
    <div className="space-y-3">
      <div className={rowLabel ? "flex items-center justify-between gap-3" : "flex justify-end"}>
        {rowLabel ? (
          <p className="m-0 text-xs font-bold uppercase leading-4 tracking-[0.16em] text-[#748094]">
            {rowLabel}
          </p>
        ) : null}
        {removeButton}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <AwardAvoidActionControl
          action={action}
          disabled={disabled}
          error={null}
          legend="ACTION"
          onChange={onActionChange}
        />

        <label className="block">
          <span className="block text-xs font-bold leading-4 text-[#8d93a5]">SHORT-CALL TYPE</span>
          <select
            aria-label={`${ariaLabel} short-call type`}
            className="mt-2 h-9 w-full rounded-lg border border-[#cfd6e4] bg-white px-3 text-sm font-semibold text-[#40424f] focus-visible:border-[#6866cc] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
            disabled={disabled}
            value={bid.callType}
            onChange={(event) => onBidChange({ ...bid, callType: event.target.value })}
          >
            {bid.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      {useRelativeDateScope ? (
        <div className="min-w-0 space-y-2">
          <p className="m-0 text-xs font-bold leading-4 text-[#8d93a5]">DATE SCOPE</p>
          <ReserveDateScopeControl
            allowedModes={["whole_month", "first_half", "second_half"]}
            ariaLabel={`${ariaLabel} date scope`}
            dateScope={bid.dateScope.mode === "date_range" || bid.dateScope.mode === "specific_dates"
              ? { mode: "whole_month" }
              : bid.dateScope}
            disabled={disabled}
            inputLabelPrefix={ariaLabel}
            onChange={(dateScope) => onBidChange({ ...bid, dateScope })}
          />
        </div>
      ) : (
        <section className="space-y-3">
          <div className="flex h-9 min-w-0 items-center justify-between gap-4">
            <span className="text-xs font-bold uppercase leading-4 tracking-[0.22em] text-[#748094]">
              LIMIT TO A DATE RANGE
            </span>
            <button
              aria-checked={dateRangeEnabled}
              aria-label={`${ariaLabel} limit to a date range`}
              className={[
                "relative h-[22px] w-[42px] cursor-pointer rounded-full border-0 p-0 transition",
                dateRangeEnabled ? "bg-[#6866cc]" : "bg-[#d8dde6]",
              ].join(" ")}
              disabled={disabled}
              role="switch"
              type="button"
              onClick={() => onBidChange({
                ...bid,
                dateScope: dateRangeEnabled
                  ? { mode: "whole_month" }
                  : { mode: "date_range", from: "", to: "" },
              })}
            >
              <span
                className={[
                  "absolute top-[3px] h-4 w-4 rounded-full bg-white transition",
                  dateRangeEnabled ? "left-[22px]" : "left-[4px]",
                ].join(" ")}
              />
            </button>
          </div>

          {bid.dateScope.mode === "date_range" ? (
            <div className="min-w-0">
              <PbsDatePicker
                calendarLabel={`${ariaLabel} date range calendar`}
                clearLabel={`Clear ${ariaLabel} date range`}
                disabled={disabled}
                mode="range"
                openLabel={`Open ${ariaLabel} date range calendar`}
                periodCode={periodCode}
                periodEndDate={periodEndDate}
                periodStartDate={periodStartDate}
                rangeFrom={bid.dateScope.from}
                rangeTo={bid.dateScope.to}
                onRangeChange={(from, to) => onBidChange({
                  ...bid,
                  dateScope: { mode: "date_range", from, to },
                })}
              />
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
};

export const CreditWindowPreferenceControl = ({
  ariaLabel,
  bid,
  config,
  disabled,
  statusMessage,
  onChange,
}: {
  ariaLabel: string;
  bid: Extract<RuleBidValue, { type: "credit-window-preference" }>;
  config: PbsLineCreditWindowConfig | null;
  disabled: boolean;
  statusMessage: string | null;
  onChange: (bid: Extract<RuleBidValue, { type: "credit-window-preference" }>) => void;
}) => {
  const directionSelectionDisabled = disabled || !config?.available;
  const isMoreCredit = bid.direction === "more";
  const deltaHours = config?.available ? config.deltaHours : null;

  return (
    <PreferenceConditionSection title="PREFERENCE">
      <fieldset>
        <legend className="sr-only">{ariaLabel}</legend>
        <PreferenceSegmentedControl
          disabled={directionSelectionDisabled}
          options={CREDIT_WINDOW_DIRECTION_OPTIONS}
          value={bid.direction}
          onChange={(direction) => onChange({
            type: "credit-window-preference",
            direction,
          })}
        />
      </fieldset>

      {deltaHours !== null ? (
        <div
          aria-label={`${ariaLabel} company-defined adjustment`}
          className="mt-2 space-y-0.5 px-1 text-xs font-medium leading-5 text-[#6f7485]"
        >
          <p className="m-0">
            Aims for up to {deltaHours}h {isMoreCredit ? "above" : "below"} the crew&apos;s period
            credit target, {isMoreCredit ? "capped at their credit max" : "floored at their credit min"}.
          </p>
          <p className="m-0">
            The ±{deltaHours}h credit-window adjustment is company-defined.
          </p>
        </div>
      ) : null}

      {statusMessage ? (
        <p className="m-0 mt-2 px-1 text-xs font-semibold leading-4 text-[#8d93a5]" role="status">
          {statusMessage}
        </p>
      ) : null}
    </PreferenceConditionSection>
  );
};

export const MinimumBaseLayoverControl = ({
  ariaLabel,
  bid,
  config,
  disabled,
  statusMessage,
  onChange,
}: {
  ariaLabel: string;
  bid: Extract<RuleBidValue, { type: "minimum-base-layover" }>;
  config: PbsLineMinimumBaseLayoverConfig | null;
  disabled: boolean;
  statusMessage: string | null;
  onChange: (bid: Extract<RuleBidValue, { type: "minimum-base-layover" }>) => void;
}) => (
  <div className="max-w-[420px] space-y-2">
    <div className="relative p-0.5">
      <Input
        aria-label={`${ariaLabel} minimum base layover`}
        className="h-10 rounded-lg border-[#d8dde6] pl-4 pr-16 text-sm font-semibold text-[#282c3b]"
        disabled={disabled || !config?.available}
        placeholder={config?.available ? formatLineDurationCompact(config.minDuration) : "HH:MM"}
        value={bid.minimumDuration}
        onBlur={() => onChange({ ...bid, minimumDuration: normalizeLineDurationDisplay(bid.minimumDuration) })}
        onChange={(event) => onChange({ ...bid, minimumDuration: event.target.value })}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#6f7485]">
        HH:MM
      </span>
    </div>
    {statusMessage ? (
      <p className="m-0 text-xs font-semibold leading-4 text-[#8d93a5]" role="status">
        {statusMessage}
      </p>
    ) : config?.available ? (
      <p className="m-0 text-xs font-semibold leading-4 text-[#8d93a5]">
        Minimum {formatLineDurationCompact(config.minDuration)}
      </p>
    ) : null}
  </div>
);

const PatternNumberInput = ({
  ariaLabel,
  className = "w-[148px]",
  disabled,
  max,
  min,
  value,
  onValueChange,
}: {
  ariaLabel: string;
  className?: string;
  disabled: boolean;
  max?: number;
  min?: number;
  value: number;
  onValueChange: (value: number) => void;
}) => (
  <PbsInputNumber
    ariaLabel={ariaLabel}
    className={className}
    disabled={disabled}
    max={max}
    min={min}
    value={value}
    onChange={(nextValue) => {
      if (nextValue !== null) {
        onValueChange(clampPairingBidNumber(nextValue, min, max));
      }
    }}
  />
);

const CommuterPatternControl = ({
  ariaLabel,
  bid,
  dateRangeDisabled,
  disabled,
  periodCode,
  periodEndDate,
  periodStartDate,
  onChange,
}: {
  ariaLabel: string;
  bid: Extract<RuleBidValue, { type: "days-off-on-pattern" }>;
  dateRangeDisabled?: boolean;
  disabled: boolean;
  periodCode: string;
  periodEndDate: string;
  periodStartDate: string;
  onChange: (bid: Extract<RuleBidValue, { type: "days-off-on-pattern" }>) => void;
}) => {
  const dateRangeEnabled = Boolean(bid.dateRange);

  return (
    <div className="space-y-5">
      <section>
        <p className="m-0 text-xs font-bold uppercase leading-4 tracking-[0.22em] text-[#748094]">
          WORK BLOCK
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-base font-bold text-[#282c3b]">Work</span>
          <PatternNumberInput
            ariaLabel={`${ariaLabel} min days on`}
            disabled={disabled}
            max={bid.max}
            min={bid.min}
            value={bid.minDaysOn}
            onValueChange={(minDaysOn) => onChange({ ...bid, minDaysOn })}
          />
          <span className="text-base font-bold text-[#6f7485]">to</span>
          <PatternNumberInput
            ariaLabel={`${ariaLabel} max days on`}
            disabled={disabled}
            max={bid.max}
            min={bid.min}
            value={bid.maxDaysOn}
            onValueChange={(maxDaysOn) => onChange({ ...bid, maxDaysOn })}
          />
          <span className="text-base font-bold text-[#282c3b]">days</span>
        </div>
      </section>

      <section>
        <p className="m-0 text-xs font-bold uppercase leading-4 tracking-[0.22em] text-[#748094]">
          OFF BLOCK
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-base font-bold text-[#282c3b]">Then</span>
          <PatternNumberInput
            ariaLabel={`${ariaLabel} minimum days off`}
            disabled={disabled}
            max={bid.max}
            min={bid.min}
            value={bid.minDaysOff}
            onValueChange={(minDaysOff) => onChange({ ...bid, minDaysOff })}
          />
          <span className="text-base font-bold text-[#282c3b]">days off</span>
        </div>
      </section>

      {!dateRangeDisabled ? <section>
        <div className="flex max-w-[520px] items-center justify-between gap-4">
          <span className="text-xs font-bold uppercase leading-4 tracking-[0.22em] text-[#748094]">
            LIMIT TO A DATE RANGE
          </span>
          <button
            aria-checked={dateRangeEnabled}
            aria-label={`${ariaLabel} limit to a date range`}
            className={[
              "relative h-[22px] w-[42px] cursor-pointer rounded-full border-0 p-0 transition",
              dateRangeEnabled ? "bg-[#6866cc]" : "bg-[#d8dde6]",
            ].join(" ")}
            disabled={disabled || Boolean(dateRangeDisabled)}
            role="switch"
            type="button"
            onClick={() => onChange({
              ...bid,
              dateRange: dateRangeEnabled ? null : { from: "", to: "" },
            })}
          >
            <span
              className={[
                "absolute top-[3px] h-4 w-4 rounded-full bg-white transition",
                dateRangeEnabled ? "left-[22px]" : "left-[4px]",
              ].join(" ")}
            />
          </button>
        </div>

        {bid.dateRange ? (
          <div className="mt-3 max-w-[520px]">
            <PbsDatePicker
              calendarLabel={`${ariaLabel} calendar`}
              clearLabel={`Clear ${ariaLabel} date range`}
              disabled={disabled || dateRangeDisabled}
              mode="range"
              openLabel={`Open ${ariaLabel} date range calendar`}
              periodCode={periodCode}
              periodEndDate={periodEndDate}
              periodStartDate={periodStartDate}
              rangeFrom={bid.dateRange.from}
              rangeTo={bid.dateRange.to}
              onRangeChange={(from, to) => onChange({ ...bid, dateRange: { from, to } })}
            />
          </div>
        ) : null}
      </section> : null}
    </div>
  );
};

export const LineBidDialog = ({
  allowedReserveDateScopeModes,
  confirmLabel = "ADD BID",
  confirmPendingLabel = "ADDING...",
  dialogContext = "current",
  disableAbsoluteDates = false,
  favoriteLabel = "SAVE FAVORITE",
  favoriteEditMode = false,
  isOpen,
  isPending,
  isFavoritePending = false,
  periodCode,
  periodEndDate = "",
  periodStartDate = "",
  property,
  startWithNoActiveTiers = false,
  validationError = null,
  mixedLineShortCallSourceContext,
  onCancel,
  onConfirm,
  onRemove,
  onSaveFavorite,
}: LineBidDialogProps) => {
  const isCommuterPattern = isCommuterPatternProperty(property);
  const isCreditWindowPreference = isCreditWindowPreferenceProperty(property);
  const isMinimumBaseLayover = isMinimumBaseLayoverProperty(property);
  const isLineReserve = isMixedLineBidProperty(property);
  const isLineReserveMode = isMixedLineReserveModeProperty(property);
  const isLineReserveShortCall = isMixedLineShortCallProperty(property);
  const [bid, setBid] = useState<RuleBidValue>(() => getInitialLineBid(property));
  const [action, setAction] = useState<RuleBidAvailableProperty["action"]>(() => getInitialLineAction(property));
  const [shortCallRows, setShortCallRows] = useState<MixedLineShortCallRow[]>(() =>
    getInitialShortCallRows(property));
  const [tiers, setTiers] = useState<RuleBidTierOption[]>(() =>
    initializeDialogTiers(property.tiers, startWithNoActiveTiers, isCommuterPattern));
  const [creditWindowConfigState, setCreditWindowConfigState] = useState<{
    status: "idle" | "loading" | "ready" | "unavailable" | "error";
    config: PbsLineCreditWindowConfig | null;
  }>({ status: "idle", config: null });
  const [minimumBaseLayoverConfigState, setMinimumBaseLayoverConfigState] = useState<{
    status: "idle" | "loading" | "ready" | "unavailable" | "error";
    config: PbsLineMinimumBaseLayoverConfig | null;
  }>({ status: "idle", config: null });

  useEffect(() => {
    setBid(getInitialLineBid(property));
    setAction(getInitialLineAction(property));
    setShortCallRows(getInitialShortCallRows(property));
    setTiers(initializeDialogTiers(property.tiers, startWithNoActiveTiers, isCommuterPattern));
  }, [isCommuterPattern, property, startWithNoActiveTiers]);

  useEffect(() => {
    if (!isOpen || !isCreditWindowPreference) {
      setCreditWindowConfigState({ status: "idle", config: null });
      return;
    }

    let isActive = true;
    setCreditWindowConfigState({ status: "loading", config: null });

    lineService.getCreditWindowConfig()
      .then((config) => {
        if (!isActive) {
          return;
        }

        if (!config.available) {
          setCreditWindowConfigState({ status: "unavailable", config });
          return;
        }

        setCreditWindowConfigState({ status: "ready", config });
      })
      .catch(() => {
        if (isActive) {
          setCreditWindowConfigState({ status: "error", config: null });
        }
      });

    return () => {
      isActive = false;
    };
  }, [isCreditWindowPreference, isOpen]);

  useEffect(() => {
    if (!isOpen || !isMinimumBaseLayover) {
      setMinimumBaseLayoverConfigState({ status: "idle", config: null });
      return;
    }

    let isActive = true;
    setMinimumBaseLayoverConfigState({ status: "loading", config: null });

    lineService.getMinimumBaseLayoverConfig()
      .then((config) => {
        if (!isActive) {
          return;
        }

        if (!config.available) {
          setMinimumBaseLayoverConfigState({ status: "unavailable", config });
          return;
        }

        setMinimumBaseLayoverConfigState({ status: "ready", config });
        setBid((currentBid) => isMinimumBaseLayoverBid(currentBid)
          ? applyMinimumBaseLayoverConfigToBid(currentBid, config)
          : currentBid);
      })
      .catch(() => {
        if (isActive) {
          setMinimumBaseLayoverConfigState({ status: "error", config: null });
        }
      });

    return () => {
      isActive = false;
    };
  }, [isMinimumBaseLayover, isOpen]);

  if (!isOpen) {
    return null;
  }

  const isDialogPending = isPending || isFavoritePending;
  const requiresAction = isLineReserve;
  const isMixedLineSelection = isLineReserveShortCall || (isLineReserveMode && action === null);
  const hasShortCallRows = shortCallRows.length > 0;
  const hasMixedLineOutput = isLineReserve && (action !== null || hasShortCallRows);
  const canRemoveMixedLineSelection = isLineReserveMode
    && dialogContext !== "standing"
    && property.action === null
    && isMixedLineSelection
    && !hasShortCallRows
    && Boolean(onRemove);
  const hasActiveTier = tiers.some((tier) => tier.active);
  const allowEmptyTiers = isCommuterPattern;
  const allowAbsoluteShortCallDates = !disableAbsoluteDates && !favoriteEditMode;
  const shortCallValidationError = shortCallRows
    .map((row) => getMixedLineShortCallValidationError(
      row.bid,
      periodStartDate,
      periodEndDate,
      allowAbsoluteShortCallDates,
    ))
    .find((error): error is string => error !== null) ?? null;
  const lineReserveOutputBlocked = isLineReserve && !hasMixedLineOutput;
  const lineReserveValidationError = null;
  const creditWindowStatusMessage = isCreditWindowPreference
    ? creditWindowConfigState.status === "loading"
      ? "Loading company credit-window adjustment..."
      : creditWindowConfigState.status === "unavailable" || creditWindowConfigState.status === "error"
        ? "Credit window configuration is unavailable."
        : null
    : null;
  const minimumBaseLayoverStatusMessage = isMinimumBaseLayover
    ? minimumBaseLayoverConfigState.status === "loading"
      ? "Loading minimum base layover..."
      : minimumBaseLayoverConfigState.status === "unavailable" || minimumBaseLayoverConfigState.status === "error"
        ? "Minimum base layover configuration is unavailable."
        : null
    : null;
  const bidValidationError = getBidValidationError(
    bid,
    periodStartDate,
    periodEndDate,
    minimumBaseLayoverConfigState.config,
  );
  const creditWindowConfigBlocked = isCreditWindowPreference && creditWindowConfigState.status !== "ready";
  const minimumBaseLayoverConfigBlocked = isMinimumBaseLayover
    && minimumBaseLayoverConfigState.status !== "ready";
  const actionValidationError = null;
  const isConditionComplete = !creditWindowConfigBlocked
    && !minimumBaseLayoverConfigBlocked
    && !bidValidationError
    && !shortCallValidationError
    && !lineReserveOutputBlocked
    && !lineReserveValidationError
    && !validationError
    && !actionValidationError;
  const containsExplicitFavoriteDate = containsExplicitCalendarDate(
    bid,
    pbsFavoriteDateSemanticContexts.generic,
  );
  const canSaveFavorite = !isDialogPending
    && isConditionComplete
    && !containsExplicitFavoriteDate
    && !isMixedLineSelection
    && !hasShortCallRows;
  const canConfirm = !isDialogPending && (
    canRemoveMixedLineSelection
      ? true
      : isConditionComplete
        && hasActiveTier
        && (!isLineReserve || hasMixedLineOutput)
        && shortCallRows.every((row) => isMixedLineShortCallBidComplete(
          row.bid,
          periodStartDate,
          periodEndDate,
          allowAbsoluteShortCallDates,
        ))
  );
  const buildShortCallProperty = (
    row: MixedLineShortCallRow,
    index: number,
  ): RuleBidAvailableProperty => ({
    ...property,
    id: isLineReserveShortCall && index === 0
      ? property.id
      : `mixed-line-short-call-${row.id}`,
    propertyCode: pbsLineReservePropertyCodes.shortCallType,
    name: MIXED_LINE_BID_DISPLAY_NAME,
    action: row.action,
    bid: row.bid,
    tiers,
    sourceContext: mixedLineShortCallSourceContext ?? property.sourceContext,
  });
  const buildConfiguredProperty = (): RuleBidAvailableProperty => {
    if (isLineReserve && action === null) {
      const [primaryShortCall, ...additionalShortCalls] = shortCallRows;

      if (!primaryShortCall) {
        return {
          ...property,
          action,
          bid,
          tiers,
        };
      }

      return withMixedLineAdditionalProperties(
        buildShortCallProperty(primaryShortCall, 0),
        additionalShortCalls.map((row, index) => buildShortCallProperty(row, index + 1)),
      );
    }

    if (isLineReserve && action !== null) {
      const reserveModeProperty: RuleBidAvailableProperty = {
        ...property,
        propertyCode: pbsLineAaPropertyCodes.reserve,
        name: MIXED_LINE_BID_DISPLAY_NAME,
        action,
        bid: { type: "flag" },
        tiers,
        sourceContext: isLineReserveShortCall ? "lineholder" : property.sourceContext,
      };

      return action === "avoid"
        ? reserveModeProperty
        : withMixedLineAdditionalProperties(
            reserveModeProperty,
            shortCallRows.map((row, index) => buildShortCallProperty(row, index)),
          );
    }

    return {
      ...property,
      action: requiresAction ? action : property.action ?? null,
      bid,
      tiers,
    };
  };
  const confirmConfiguredProperty = () => {
    if (canRemoveMixedLineSelection) {
      onRemove?.();
      return;
    }

    onConfirm(buildConfiguredProperty());
  };
  const handleReserveLineActionChange = (nextAction: RuleBidAvailableProperty["action"]) => {
    setAction(nextAction);

    if (nextAction === "avoid") {
      setShortCallRows([]);
    }
  };

  return (
    <PbsDialogFrame
      ariaLabel={dialogContext === "standing"
        ? `Configure Standing Bid for ${property.name}`
        : `Configure ${property.name}`}
      bodyClassName="mt-5 space-y-5"
      closeDisabled={isDialogPending}
      footerClassName={isCreditWindowPreference ? "mt-6" : "mt-6 flex justify-end gap-2"}
      panelClassName={[
        isCommuterPattern ? "w-[min(680px,calc(100vw-32px))]" : "",
        isLineReserve ? "!max-h-[min(820px,calc(100vh-96px))]" : "",
      ].filter(Boolean).join(" ") || undefined}
      header={(
        <div className="flex items-center">
          <div>
            <p className="m-0 text-base font-bold leading-5 text-[#282c3b]">
              {dialogContext === "standing"
                ? "Configure Standing Bid"
                : isCommuterPattern
                ? "Configure Commuter Pattern"
                  : isMinimumBaseLayover
                  ? "Configure Minimum Base Layover"
                  : isLineReserve
                    ? `Configure ${MIXED_LINE_BID_DISPLAY_NAME}`
                    : "Configure Line Bid"}
            </p>
            {dialogContext === "standing"
              || (!isCommuterPattern && !isMinimumBaseLayover && !isLineReserve) ? (
              <p className="m-0 mt-1 text-sm font-medium leading-5 text-[#6f7485]">{property.name}</p>
            ) : null}
          </div>
          <button
            aria-label="Close line bid dialog"
            className="ml-auto inline-flex h-6 w-6 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-[#6f7485] hover:text-[#6866cc] focus-visible:text-[#6866cc] focus-visible:outline-none disabled:cursor-default disabled:opacity-45"
            disabled={isDialogPending}
            type="button"
            onClick={onCancel}
          >
            <XMarkIcon className="h-4 w-4 stroke-[1.8]" />
          </button>
        </div>
      )}
      footer={favoriteEditMode ? (
        <>
          <Button
            className="h-9 cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-4 text-xs font-bold text-[#6f7485] shadow-none hover:bg-[#f8f9fb]"
            disabled={isDialogPending}
            type="button"
            variant="ghost"
            onClick={onCancel}
          >
            CANCEL
          </Button>
          <Button
            className="h-9 cursor-pointer rounded-lg bg-[#6866cc] px-4 text-xs font-bold text-white"
            disabled={!canSaveFavorite}
            type="button"
            onClick={() => onSaveFavorite?.(buildConfiguredProperty())}
          >
            {isFavoritePending ? "SAVING..." : favoriteLabel}
          </Button>
        </>
      ) : isCreditWindowPreference ? (
        <PbsBidDialogFooter
          canConfirm={canConfirm}
          canSecondaryAction={canSaveFavorite}
          confirmLabel={confirmLabel}
          confirmPendingLabel={confirmPendingLabel}
          isPending={isPending}
          isSecondaryPending={isFavoritePending}
          onCancel={onCancel}
          onConfirm={confirmConfiguredProperty}
          {...(onSaveFavorite ? {
            secondaryLabel: favoriteLabel,
            secondaryPendingLabel: "SAVING...",
            onSecondaryAction: () => onSaveFavorite(buildConfiguredProperty()),
          } : {})}
        />
      ) : (
        <>
          <Button
            className="h-9 cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-4 text-xs font-bold text-[#6f7485] shadow-none hover:bg-[#f8f9fb]"
            disabled={isDialogPending}
            type="button"
            variant="ghost"
            onClick={onCancel}
          >
            CANCEL
          </Button>
          {onSaveFavorite ? (
            <Button
              className="h-9 cursor-pointer rounded-lg border border-[#6866cc] bg-white px-4 text-xs font-bold text-[#6866cc] shadow-none hover:bg-[#f3f4ff] disabled:cursor-default disabled:opacity-45"
              disabled={!canSaveFavorite}
              type="button"
              variant="ghost"
              onClick={() => onSaveFavorite(buildConfiguredProperty())}
            >
              {isFavoritePending ? "SAVING..." : favoriteLabel}
            </Button>
          ) : null}
          <Button
            className="h-9 cursor-pointer rounded-lg bg-[#6866cc] px-4 text-xs font-bold text-white"
            disabled={!canConfirm}
            type="button"
            onClick={confirmConfiguredProperty}
          >
            {isPending ? confirmPendingLabel : confirmLabel}
          </Button>
        </>
      )}
      onClose={onCancel}
    >
          {isLineReserve ? (
            <>
              <div style={{ display: favoriteEditMode ? "none" : undefined }}>
                <TierSelectionTitle required />
                <div className="mt-2">
                  <TierToggleGroup
                    getAriaLabel={(option) => `Toggle ${option.label} for ${property.name}`}
                    options={tiers}
                    readonly={isDialogPending}
                    onToggle={(tierKey) => {
                      setTiers((current) => {
                        const activeCount = current.filter((tier) => tier.active).length;

                        return current.map((tier) => {
                          if (tier.key !== tierKey) {
                            return tier;
                          }

                          if (tier.active && activeCount === 1) {
                            return tier;
                          }

                          return {
                            ...tier,
                            active: !tier.active,
                          };
                        });
                      });
                    }}
                  />
                </div>
              </div>
              <ReserveLinePreferenceControl
                action={action}
                disabled={isDialogPending}
                onChange={handleReserveLineActionChange}
              />
              {action !== "avoid" ? (
                <PreferenceConditionSection title="RESERVE SHORT CALL">
                  {shortCallRows.map((row, index) => (
                    <div
                      key={row.id}
                      className={index === 0 ? "" : "mt-4 border-t border-[#e6eaf2] pt-4"}
                    >
                      <MixedLineShortCallControl
                        action={row.action}
                        ariaLabel={`Configure short-call ${index + 1} for ${property.name}`}
                        bid={row.bid}
                        disabled={isDialogPending}
                        periodCode={periodCode}
                        periodEndDate={periodEndDate}
                        periodStartDate={periodStartDate}
                        rowLabel={shortCallRows.length > 1 ? `SHORT CALL ${index + 1}` : undefined}
                        useRelativeDateScope={!allowAbsoluteShortCallDates}
                        onActionChange={(nextAction) => setShortCallRows((currentRows) =>
                          currentRows.map((currentRow) => currentRow.id === row.id
                            ? { ...currentRow, action: nextAction }
                            : currentRow))}
                        onBidChange={(nextBid) => setShortCallRows((currentRows) =>
                          currentRows.map((currentRow) => currentRow.id === row.id
                            ? { ...currentRow, bid: nextBid }
                            : currentRow))}
                        onRemove={() => setShortCallRows((currentRows) =>
                          currentRows.filter((currentRow) => currentRow.id !== row.id))}
                      />
                    </div>
                  ))}
                  <div className={shortCallRows.length === 0 ? "mt-3 flex justify-start" : "mt-4 flex justify-start"}>
                    <Button
                      className="h-9 cursor-pointer rounded-lg border border-[#6866cc] bg-white px-4 text-xs font-bold text-[#6866cc] shadow-none hover:bg-[#f3f4ff]"
                      disabled={isDialogPending}
                      type="button"
                      variant="ghost"
                      onClick={() => setShortCallRows((currentRows) => [
                        ...currentRows,
                        createDefaultShortCallRow(),
                      ])}
                    >
                      + ADD RESERVE SHORT CALL
                    </Button>
                  </div>
                </PreferenceConditionSection>
              ) : null}
              {lineReserveValidationError || shortCallValidationError ? (
                <p className="m-0 mt-2 text-xs font-semibold leading-4 text-[#d05b5b]" role="alert">
                  {lineReserveValidationError ?? shortCallValidationError}
                </p>
              ) : null}
            </>
          ) : isMinimumBaseLayover && isMinimumBaseLayoverBid(bid) ? (
            <>
              <div style={{ display: favoriteEditMode ? "none" : undefined }}>
                <TierSelectionTitle required />
                <div className="mt-2">
                  <TierToggleGroup
                    getAriaLabel={(option) => `Toggle ${option.label} for ${property.name}`}
                    options={tiers}
                    readonly={isDialogPending}
                    onToggle={(tierKey) => {
                      setTiers((current) => {
                        const activeCount = current.filter((tier) => tier.active).length;

                        return current.map((tier) => {
                          if (tier.key !== tierKey) {
                            return tier;
                          }

                          if (tier.active && activeCount === 1) {
                            return tier;
                          }

                          return {
                            ...tier,
                            active: !tier.active,
                          };
                        });
                      });
                    }}
                  />
                </div>
              </div>
              <div>
                <p className="m-0 text-xs font-bold leading-4 text-[#8d93a5]">MINIMUM BASE LAYOVER</p>
                <div className="mt-2">
                  <MinimumBaseLayoverControl
                    ariaLabel={`Configure bid for ${property.name}`}
                    bid={bid}
                    config={minimumBaseLayoverConfigState.config}
                    disabled={isDialogPending}
                    statusMessage={minimumBaseLayoverStatusMessage}
                    onChange={setBid}
                  />
                  {bidValidationError ? (
                    <p className="m-0 mt-2 text-xs font-semibold leading-4 text-[#d05b5b]" role="alert">
                      {bidValidationError}
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          ) : isCommuterPattern && bid.type === "days-off-on-pattern" ? (
            <>
              <div style={{ display: favoriteEditMode ? "none" : undefined }}>
                <TierSelectionTitle required />
                <div className="mt-2">
                  <TierToggleGroup
                    getAriaLabel={(option) => `Toggle ${option.label} for ${property.name}`}
                    options={tiers}
                    readonly={isDialogPending}
                    onToggle={(tierKey) => {
                      setTiers((current) => current.map((tier) =>
                        tier.key === tierKey ? { ...tier, active: !tier.active } : tier));
                    }}
                  />
                </div>
              </div>
              <CommuterPatternControl
                ariaLabel={`Configure bid for ${property.name}`}
                bid={bid}
                dateRangeDisabled={disableAbsoluteDates || favoriteEditMode}
                disabled={isDialogPending}
                periodCode={periodCode}
                periodEndDate={periodEndDate}
                periodStartDate={periodStartDate}
                onChange={setBid}
              />
              {bidValidationError ? (
                <p className="m-0 mt-2 text-xs font-semibold leading-4 text-[#d05b5b]" role="alert">
                  {bidValidationError}
                </p>
              ) : null}
            </>
          ) : isCreditWindowPreference && isCreditWindowPreferenceBid(bid) ? (
            <>
              {favoriteEditMode ? null : <section>
                <TierSelectionTitle required />
                <div className="mt-1.5">
                  <TierToggleGroup
                    getAriaLabel={(option) => `Toggle ${option.label} for ${property.name}`}
                    options={tiers}
                    readonly={isDialogPending}
                    onToggle={(tierKey) => {
                      setTiers((current) => {
                        const activeCount = current.filter((tier) => tier.active).length;

                        return current.map((tier) => {
                          if (tier.key !== tierKey) {
                            return tier;
                          }

                          if (tier.active && activeCount === 1) {
                            return tier;
                          }

                          return {
                            ...tier,
                            active: !tier.active,
                          };
                        });
                      });
                    }}
                  />
                </div>
              </section>}
              <CreditWindowPreferenceControl
                ariaLabel={`Configure bid for ${property.name}`}
                bid={bid}
                config={creditWindowConfigState.config}
                disabled={isDialogPending}
                statusMessage={creditWindowStatusMessage}
                onChange={setBid}
              />
            </>
          ) : (
            <>
          {requiresAction ? (
            <AwardAvoidActionControl
              action={action}
              disabled={isDialogPending}
              error={actionValidationError}
              legend="ACTION"
              onChange={setAction}
            />
          ) : null}

          <div style={{ display: favoriteEditMode ? "none" : undefined }}>
            <p className="m-0 text-xs font-bold leading-4 text-[#8d93a5]">
              {isMinimumBaseLayover ? "MINIMUM BASE LAYOVER" : "BID"}
            </p>
            <div className="mt-2">
              {requiresAction ? (
                <div
                  aria-label={`Configure bid for ${property.name}`}
                  className="flex h-9 items-center rounded-lg border border-[#d8dde6] bg-[#f9fafc] px-3 text-sm font-semibold text-[#6f7485]"
                >
                  Whole bid month
                </div>
              ) : isCreditDensityBid(bid) ? (
                <CreditDensityPreferenceControl
                  ariaLabel={`Configure bid for ${property.name}`}
                  bid={bid}
                  disabled={isDialogPending}
                  onChange={setBid}
                />
              ) : isMinimumBaseLayoverBid(bid) ? (
                <MinimumBaseLayoverControl
                  ariaLabel={`Configure bid for ${property.name}`}
                  bid={bid}
                  config={minimumBaseLayoverConfigState.config}
                  disabled={isDialogPending}
                  statusMessage={minimumBaseLayoverStatusMessage}
                  onChange={setBid}
                />
              ) : isReserveFlyingPatternBid(bid) ? (
                <LineReserveFlyingPatternControl
                  allowedDateScopeModes={favoriteEditMode
                    ? FAVORITE_RESERVE_DATE_SCOPE_MODES
                    : allowedReserveDateScopeModes}
                  ariaLabel={`Configure bid for ${property.name}`}
                  bid={bid}
                  disabled={isDialogPending}
                  onChange={setBid}
                />
              ) : isPairingBidValue(bid) ? (
                <PairingBidControl
                  ariaLabel={`Configure bid for ${property.name}`}
                  bid={bid}
                  onChange={setBid}
                />
              ) : null}
              {bidValidationError ? (
                <p className="m-0 mt-2 text-xs font-semibold leading-4 text-[#d05b5b]" role="alert">
                  {bidValidationError}
                </p>
              ) : null}
            </div>
          </div>

          <div className={favoriteEditMode ? "hidden" : undefined}>
            <TierSelectionTitle required />
            <div className="mt-2">
              <TierToggleGroup
                getAriaLabel={(option) => `Toggle ${option.label} for ${property.name}`}
                options={tiers}
                readonly={isDialogPending}
                onToggle={(tierKey) => {
                  setTiers((current) => {
                    const activeCount = current.filter((tier) => tier.active).length;

                    if (allowEmptyTiers) {
                      return togglePreferenceTier(current, tierKey);
                    }

                    return current.map((tier) => {
                      if (tier.key !== tierKey) {
                        return tier;
                      }

                      if (tier.active && activeCount === 1) {
                        return tier;
                      }

                      return {
                        ...tier,
                        active: !tier.active,
                      };
                    });
                  });
                }}
              />
            </div>
          </div>
            </>
          )}
          {validationError ? (
            <p className="m-0 text-xs font-medium text-destructive" role="alert">
              {validationError}
            </p>
          ) : null}
    </PbsDialogFrame>
  );
};
