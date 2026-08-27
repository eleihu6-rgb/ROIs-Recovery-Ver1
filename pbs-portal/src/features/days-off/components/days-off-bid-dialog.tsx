import { XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";

import {
  containsExplicitCalendarDate,
  pbsFavoriteDateSemanticContexts,
} from "../../../../../packages/contracts/pbs-favorite-eligibility.js";
import type { PbsPreferOffConfig } from "../../../../../packages/contracts/pbs-prefer-off.js";
import { listPbsPeriodDates } from "../../../../../packages/contracts/pbs-prefer-off.js";
import { PreferOffEditor } from "@/features/days-off/components/prefer-off-editor";
import {
  buildPreferOffBidValues,
  createPreferOffEditorValue,
  getPreferOffEditorResult,
  type PreferOffEditorValue,
} from "@/features/days-off/components/prefer-off-editor-value";
import { PairingBidControl } from "@/features/pairing/components/pairing-bid-control";
import {
  clampPairingBidNumber,
} from "@/features/pairing/pairing-bid-control-logic";
import type { PairingBidValue } from "@/features/pairing/types";
import type {
  RuleBidAvailableProperty,
  RuleBidExistingProperty,
  RuleBidTierOption,
} from "@/features/rule-bids/types";
import { isPairingBidValue } from "@/features/rule-bids/types";
import { TierSelectionTitle, TierToggleGroup } from "@/shared/components/tiers";
import {
  PbsDatePicker,
  PbsInputNumber,
  PreferenceConditionSection,
  PreferenceInlineSwitch,
  togglePreferenceTier,
} from "@/shared/components/preferences";
import { Button } from "@/shared/components/ui/button";
import { PbsDialogFrame } from "@/shared/components/ui/pbs-dialog-frame";

type DaysOffBidDialogProperty = RuleBidAvailableProperty | RuleBidExistingProperty;

type DaysOffBidDialogProps<TProperty extends DaysOffBidDialogProperty> = {
  confirmLabel?: string;
  confirmPendingLabel?: string;
  dialogContext?: "current" | "standing";
  favoriteLabel?: string;
  favoriteEditMode?: boolean;
  isOpen: boolean;
  isFavoritePending?: boolean;
  isPending: boolean;
  periodCode: string;
  periodEndDate?: string;
  periodStartDate?: string;
  preserveInitialTiers?: boolean;
  preferOffConfig?: PbsPreferOffConfig;
  property: TProperty;
  validationError?: string | null;
  onCancel: () => void;
  onConfirm: (property: TProperty) => void;
  onSaveFavorite?: (property: TProperty) => void;
};
const PREFER_OFF_PROPERTY_CODE = 201;
const LONG_STRETCH_OFF_PROPERTY_CODE = 204;
const DAY_MS = 86_400_000;
const LONG_STRETCH_CANONICAL_ACTION = "award";

const toDaysOffDialogBid = (bid: DaysOffBidDialogProperty["bid"]): PairingBidValue => {
  if (!isPairingBidValue(bid)) {
    throw new Error(`${bid.type} bids are not valid for Days Off.`);
  }

  return bid;
};

const initializeDialogTiers = (
  property: DaysOffBidDialogProperty,
  isPreferOff: boolean,
  isLongStretchOff: boolean,
  preserveTiers = false,
): RuleBidTierOption[] => {
  if (!("favorited" in property) || preserveTiers) {
    return property.tiers.map((tier) => ({ ...tier }));
  }

  if (isPreferOff || isLongStretchOff) {
    return property.tiers.map((tier) => ({ ...tier, active: false }));
  }

  return property.tiers.map((tier) => ({ ...tier, active: false }));
};

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

const isWholePeriodDateRange = (
  bid: Extract<PairingBidValue, { type: "stepper-date-range" }>,
  periodStartDate: string,
  periodEndDate: string,
) => {
  const periodBounds = getPeriodDateBounds(periodStartDate, periodEndDate);

  return Boolean(periodBounds && bid.from === periodBounds.from && bid.to === periodBounds.to);
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

const initializeDialogBid = (
  property: DaysOffBidDialogProperty,
  periodStartDate: string,
  periodEndDate: string,
): PairingBidValue => {
  const propertyBid = toDaysOffDialogBid(property.bid);

  if (
    property.propertyCode !== LONG_STRETCH_OFF_PROPERTY_CODE
    || propertyBid.type !== "stepper-date-range"
    || !("favorited" in property)
    || property.favoriteKey
  ) {
    return propertyBid;
  }

  const periodBounds = getPeriodDateBounds(periodStartDate, periodEndDate);

  return periodBounds ? { ...propertyBid, ...periodBounds } : propertyBid;
};

const initializeLongStretchDateRangeEnabled = (
  property: DaysOffBidDialogProperty,
  bid: PairingBidValue,
  periodStartDate: string,
  periodEndDate: string,
) => property.propertyCode === LONG_STRETCH_OFF_PROPERTY_CODE
  && bid.type === "stepper-date-range"
  && !isWholePeriodDateRange(bid, periodStartDate, periodEndDate);

const initializePreferOffValue = (
  property: DaysOffBidDialogProperty,
  preferOffConfig: PbsPreferOffConfig | undefined,
  dialogContext: "current" | "standing",
): PreferOffEditorValue => {
  const value = createPreferOffEditorValue(property, preferOffConfig);

  if (dialogContext !== "standing") {
    return value;
  }

  if (value.mode === "specific_dates" && value.specificDates.length === 0) {
    return { ...value, mode: "days_of_week" };
  }

  if (value.mode === "specific_dates" || value.mode === "date_range") {
    return { ...value, mode: null };
  }

  return value;
};

const finalizeLongStretchBid = (
  bid: PairingBidValue,
  periodStartDate: string,
  periodEndDate: string,
  dateRangeEnabled: boolean,
  dialogContext: "current" | "standing",
): PairingBidValue => {
  if (bid.type !== "stepper-date-range") {
    return bid;
  }

  if (dialogContext === "standing") {
    return { ...bid, from: "", to: "" };
  }

  if (dateRangeEnabled) {
    return bid;
  }

  const periodBounds = getPeriodDateBounds(periodStartDate, periodEndDate);

  return periodBounds ? { ...bid, ...periodBounds } : bid;
};

const getBidValidationError = (
  bid: PairingBidValue,
  options: {
    isLongStretchDateRangeEnabled?: boolean;
    dialogContext?: "current" | "standing";
    periodEndDate?: string;
    periodStartDate?: string;
    propertyLabel?: string;
  } = {},
) => {
  if (bid.type === "stepper-date-range") {
    const propertyLabel = options.propertyLabel ?? "Date range";

    if (options.dialogContext === "standing") {
      return bid.from || bid.to
        ? `${propertyLabel} cannot use specific dates in Standing Bid.`
        : null;
    }

    if (options.isLongStretchDateRangeEnabled === false) {
      return getPeriodDateBounds(options.periodStartDate ?? "", options.periodEndDate ?? "")
        ? null
        : "Current bid period is required for the whole-month date range.";
    }

    if (!isIsoDate(bid.from) || !isIsoDate(bid.to)) {
      return "Select a valid window start and end date.";
    }

    if (bid.from > bid.to) {
      return "End date must be on or after start date.";
    }

    if (!isDateRangeInsidePeriod(
      bid.from,
      bid.to,
      options.periodStartDate ?? "",
      options.periodEndDate ?? "",
    )) {
      return `${propertyLabel} date window must be inside the current bid period.`;
    }

    const windowDays = getInclusiveDateWindowDays(bid.from, bid.to);

    if (windowDays !== null && windowDays < bid.value) {
      return `${propertyLabel} date range must be at least ${bid.value} days long.`;
    }
  }

  if (bid.type === "crew-days-off-share") {
    if (bid.employeeNumber.trim().length === 0) {
      return "Employee number is required.";
    }

    if (!Number.isSafeInteger(bid.minimumDays) || bid.minimumDays < 1) {
      return "Minimum shared days must be at least 1.";
    }
  }

  if (bid.type === "employee-schedule-preference") {
    const crewId = bid.crewId ?? (bid as { employeeNumber?: string }).employeeNumber ?? "";

    if (crewId.trim().length === 0) {
      return "Crew is required.";
    }

    if (!Number.isSafeInteger(bid.days) || bid.days < 1 || bid.days > 31) {
      return "Days must be between 1 and 31.";
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
  }

  return null;
};

const LongStretchOffControl = ({
  ariaLabel,
  bid,
  dateRangeEnabled,
  disabled,
  periodCode,
  periodEndDate,
  periodStartDate,
  periodBounds,
  showDateRangeControl,
  onChange,
  onDateRangeEnabledChange,
}: {
  ariaLabel: string;
  bid: Extract<PairingBidValue, { type: "stepper-date-range" }>;
  dateRangeEnabled: boolean;
  disabled: boolean;
  periodCode: string;
  periodEndDate: string;
  periodStartDate: string;
  periodBounds: { from: string; to: string } | null;
  showDateRangeControl: boolean;
  onChange: (bid: Extract<PairingBidValue, { type: "stepper-date-range" }>) => void;
  onDateRangeEnabledChange: (enabled: boolean) => void;
}) => (
  <section className="space-y-3.5">
    <PreferenceConditionSection title="MINIMUM CONSECUTIVE DAYS OFF">
      <PbsInputNumber
        ariaLabel={`${ariaLabel} minimum consecutive days off`}
        className="max-w-[340px]"
        disabled={disabled}
        max={bid.max}
        min={bid.min}
        value={bid.value}
        onChange={(value) => {
          if (value !== null) {
            onChange({ ...bid, value: clampPairingBidNumber(value, bid.min, bid.max) });
          }
        }}
      />
    </PreferenceConditionSection>

    {showDateRangeControl ? <PreferenceConditionSection divider>
      <PreferenceInlineSwitch
        ariaLabel={`${ariaLabel} limit to a date range`}
        checked={dateRangeEnabled}
        disabled={disabled}
        label="LIMIT TO A DATE RANGE"
        onToggle={() => {
          const nextEnabled = !dateRangeEnabled;
          onChange(nextEnabled
            ? { ...bid, from: "", to: "" }
            : { ...bid, ...(periodBounds ?? { from: "", to: "" }) });
          onDateRangeEnabledChange(nextEnabled);
        }}
      />

      {dateRangeEnabled ? (
        <div className="mt-3 max-w-[520px]">
          <PbsDatePicker
            calendarLabel={`${ariaLabel} calendar`}
            clearLabel={`Clear ${ariaLabel} date range`}
            disabled={disabled}
            mode="range"
            openLabel={`Open ${ariaLabel} date range calendar`}
            periodCode={periodCode}
            periodEndDate={periodEndDate}
            periodStartDate={periodStartDate}
            rangeFrom={bid.from}
            rangeTo={bid.to}
            onRangeChange={(from, to) => onChange({ ...bid, from, to })}
          />
        </div>
      ) : null}
    </PreferenceConditionSection> : null}
  </section>
);

export const DaysOffBidDialog = <TProperty extends DaysOffBidDialogProperty>({
  confirmLabel = "ADD BID",
  confirmPendingLabel,
  dialogContext = "current",
  favoriteLabel = "SAVE FAVORITE",
  favoriteEditMode = false,
  isOpen,
  isFavoritePending = false,
  isPending,
  periodCode,
  periodEndDate = "",
  periodStartDate = "",
  preserveInitialTiers = false,
  preferOffConfig,
  property,
  validationError = null,
  onCancel,
  onConfirm,
  onSaveFavorite,
}: DaysOffBidDialogProps<TProperty>) => {
  const isPreferOff = property.propertyCode === PREFER_OFF_PROPERTY_CODE;
  const isLongStretchOff = property.propertyCode === LONG_STRETCH_OFF_PROPERTY_CODE;
  const effectiveConfirmPendingLabel = confirmPendingLabel
    ?? (confirmLabel === "UPDATE BID" ? "UPDATING..." : "ADDING...");
  const [bid, setBid] = useState<PairingBidValue>(() =>
    initializeDialogBid(property, periodStartDate, periodEndDate));
  const [tiers, setTiers] = useState<RuleBidTierOption[]>(() =>
    initializeDialogTiers(property, isPreferOff, isLongStretchOff, preserveInitialTiers || favoriteEditMode));
  const [isLongStretchDateRangeEnabled, setIsLongStretchDateRangeEnabled] = useState(() =>
    initializeLongStretchDateRangeEnabled(property, bid, periodStartDate, periodEndDate));
  const [preferOffValue, setPreferOffValue] = useState<PreferOffEditorValue>(() =>
    initializePreferOffValue(property, preferOffConfig, dialogContext));

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const nextBid = initializeDialogBid(property, periodStartDate, periodEndDate);

    setBid(nextBid);
    setTiers(initializeDialogTiers(
      property,
      isPreferOff,
      isLongStretchOff,
      preserveInitialTiers || favoriteEditMode,
    ));
    setIsLongStretchDateRangeEnabled(initializeLongStretchDateRangeEnabled(
      property,
      nextBid,
      periodStartDate,
      periodEndDate,
    ));
    setPreferOffValue(initializePreferOffValue(property, preferOffConfig, dialogContext));
  }, [
    dialogContext,
    favoriteEditMode,
    isOpen,
    isLongStretchOff,
    isPreferOff,
    periodCode,
    periodEndDate,
    periodStartDate,
    preferOffConfig,
    preserveInitialTiers,
    property,
  ]);

  const preferOffResult = dialogContext === "standing"
    ? {
        bid: {
          type: "tag-list" as const,
          values: buildPreferOffBidValues(preferOffValue),
        },
        allOrNothing: true,
        minimumN: null,
        maximumN: null,
        periodCount: 0,
        isValid: (
          (
            preferOffValue.mode === "days_of_week"
            && preferOffValue.weekdays.length > 0
            && preferOffValue.weekdays.every((weekdayName) =>
              preferOffConfig?.weekdays.some((weekday) => weekday.name === weekdayName))
          )
          || (preferOffValue.mode === "weekends" && preferOffConfig?.weekend.available === true)
        )
          && (
            !preferOffValue.timeWindowEnabled
            || (
              preferOffValue.timeFrom.length > 0
              && preferOffValue.timeTo.length > 0
              && preferOffValue.timeFrom < preferOffValue.timeTo
            )
          ),
        error: null,
      }
    : getPreferOffEditorResult(preferOffValue, periodStartDate, periodEndDate, preferOffConfig);
  const hasActiveTier = tiers.some((tier) => tier.active);
  const bidValidationError = isPreferOff
    ? null
    : getBidValidationError(bid, {
        isLongStretchDateRangeEnabled: isLongStretchOff ? isLongStretchDateRangeEnabled : undefined,
        dialogContext,
        periodEndDate,
        periodStartDate,
        propertyLabel: property.name,
      });
  const isDialogPending = isPending || isFavoritePending;
  const isConditionComplete = !bidValidationError
    && !validationError
    && (!isPreferOff || preferOffResult.isValid);
  const configuredBid = isPreferOff
    ? preferOffResult.bid
    : isLongStretchOff
      ? finalizeLongStretchBid(
          bid,
          periodStartDate,
          periodEndDate,
          isLongStretchDateRangeEnabled,
          dialogContext,
        )
      : bid;
  const favoriteConfiguredBid = isLongStretchOff && !isLongStretchDateRangeEnabled
    ? finalizeLongStretchBid(bid, periodStartDate, periodEndDate, false, "standing")
    : configuredBid;
  const favoriteDateContext = isPreferOff
    ? { kind: "prefer-off" as const, preferOffConfig }
    : pbsFavoriteDateSemanticContexts.generic;
  const containsExplicitFavoriteDate = containsExplicitCalendarDate(favoriteConfiguredBid, favoriteDateContext);
  const canSaveFavorite = !isDialogPending && isConditionComplete && !containsExplicitFavoriteDate;
  const canConfirm = !isDialogPending && isConditionComplete && hasActiveTier;

  if (!isOpen) {
    return null;
  }

  const buildConfiguredProperty = (configuredPropertyBid = configuredBid) => ({
    ...property,
    action: isLongStretchOff ? LONG_STRETCH_CANONICAL_ACTION : property.action ?? null,
    tiers,
    bid: configuredPropertyBid,
    allOrNothing: isPreferOff ? preferOffResult.allOrNothing : property.allOrNothing,
    minimumN: isPreferOff ? preferOffResult.minimumN : property.minimumN,
    maximumN: isPreferOff ? preferOffResult.maximumN : property.maximumN,
  } as TProperty);

  const dialogTitle = dialogContext === "standing"
    ? "Configure Standing Bid"
    : isPreferOff
    ? "Configure Prefer Off"
    : isLongStretchOff
      ? "Configure Long Stretch Off / Compressed Flying"
      : "Configure Days Off Bid";
  const dialogSubtitle = dialogContext === "standing"
    ? property.name
    : isPreferOff
    ? "Choose when you prefer not to work."
    : isLongStretchOff
      ? null
      : property.name;

  const confirm = () => {
    if (canConfirm) {
      onConfirm(buildConfiguredProperty());
    }
  };

  const saveFavorite = () => {
    if (canSaveFavorite && onSaveFavorite) {
      onSaveFavorite(buildConfiguredProperty(favoriteConfiguredBid));
    }
  };

  return (
    <PbsDialogFrame
      ariaLabel={dialogContext === "standing"
        ? `Configure Standing Bid for ${property.name}`
        : isPreferOff ? "Configure Prefer Off" : `Configure ${property.name}`}
      bodyClassName="mt-5 space-y-5"
      closeDisabled={isDialogPending}
      footerClassName="mt-6 flex justify-end gap-2"
      panelClassName={isPreferOff || isLongStretchOff ? "w-[min(680px,calc(100vw-32px))]" : undefined}
      header={(
        <div className="flex items-center">
          <div>
            <p className="m-0 text-base font-bold leading-5 text-[#282c3b]">
              {dialogTitle}
            </p>
            {dialogSubtitle ? (
              <p className="m-0 mt-1 text-sm font-medium leading-5 text-[#6f7485]">
                {dialogSubtitle}
              </p>
            ) : null}
          </div>
          <button
            aria-label="Close days off bid dialog"
            className="ml-auto inline-flex h-6 w-6 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-[#6f7485] hover:text-[#6866cc] focus-visible:text-[#6866cc] focus-visible:outline-none disabled:cursor-default disabled:opacity-45"
            disabled={isDialogPending}
            type="button"
            onClick={onCancel}
          >
            <XMarkIcon className="h-4 w-4 stroke-[1.8]" />
          </button>
        </div>
      )}
      footer={(
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
              onClick={saveFavorite}
            >
              {isFavoritePending ? "SAVING..." : favoriteLabel}
            </Button>
          ) : null}
          {favoriteEditMode ? null : <Button
            className="h-9 cursor-pointer rounded-lg bg-[#6866cc] px-4 text-xs font-bold text-white"
            disabled={!canConfirm}
            type="button"
            onClick={confirm}
          >
            {isPending ? effectiveConfirmPendingLabel : confirmLabel}
          </Button>}
        </>
      )}
      onClose={onCancel}
    >
      {favoriteEditMode ? null : <section>
        <TierSelectionTitle required />
        <div className="mt-2">
          <TierToggleGroup
            getAriaLabel={(option) => `Toggle ${option.label} for ${property.name}`}
            options={tiers}
            readonly={isDialogPending}
            onToggle={(tierKey) => {
              setTiers((current) => {
                const allowEmptyTiers = isPreferOff || isLongStretchOff;

                if (allowEmptyTiers) {
                  return togglePreferenceTier(current, tierKey);
                }

                const activeCount = current.filter((tier) => tier.active).length;
                return current.map((tier) => tier.key !== tierKey || (tier.active && activeCount === 1)
                  ? tier
                  : { ...tier, active: !tier.active });
              });
            }}
          />
        </div>
      </section>}

      {isPreferOff ? (
        <>
          <PreferOffEditor
            dialogContext={dialogContext}
            disabled={isDialogPending}
            hideExplicitDates={favoriteEditMode}
            periodCode={periodCode}
            periodEndDate={periodEndDate}
            periodStartDate={periodStartDate}
            preferOffConfig={preferOffConfig}
            value={preferOffValue}
            onChange={setPreferOffValue}
          />
          {validationError ? (
            <p className="m-0 text-xs font-medium text-destructive" role="alert">
              {validationError}
            </p>
          ) : null}
        </>
      ) : isLongStretchOff && bid.type === "stepper-date-range" ? (
        <>
          <LongStretchOffControl
            ariaLabel={`Configure bid for ${property.name}`}
            bid={bid}
            dateRangeEnabled={isLongStretchDateRangeEnabled}
            disabled={isDialogPending}
            periodCode={periodCode}
            periodEndDate={periodEndDate}
            periodStartDate={periodStartDate}
            periodBounds={getPeriodDateBounds(periodStartDate, periodEndDate)}
            showDateRangeControl={dialogContext !== "standing" && !favoriteEditMode}
            onChange={setBid}
            onDateRangeEnabledChange={setIsLongStretchDateRangeEnabled}
          />
          {bidValidationError ? (
            <p className="m-0 mt-2 text-xs font-semibold leading-4 text-[#d05b5b]" role="alert">
              {bidValidationError}
            </p>
          ) : null}
        </>
      ) : (
        <section>
          <p className="m-0 text-xs font-bold leading-4 text-[#8d93a5]">BID</p>
          <div className="mt-2">
            <PairingBidControl
              ariaLabel={`Configure bid for ${property.name}`}
              bid={bid}
              onChange={setBid}
            />
            {bidValidationError ? (
              <p className="m-0 mt-2 text-xs font-semibold leading-4 text-[#d05b5b]" role="alert">
                {bidValidationError}
              </p>
            ) : null}
          </div>
        </section>
      )}
    </PbsDialogFrame>
  );
};
