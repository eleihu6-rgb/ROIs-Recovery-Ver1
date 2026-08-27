import { XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import type { PbsLineMinimumBaseLayoverConfig } from "../../../../../packages/contracts/pbs-line-bids.js";
import { DateOrDowListControl } from "@/features/pairing/components/pairing-bid-date-or-dow-control";
import { PairingBidControl } from "@/features/pairing/components/pairing-bid-control";
import type { PairingBidValue, ReserveDateScope } from "@/features/pairing/types";
import {
  CreditDensityPreferenceControl,
  MinimumBaseLayoverControl,
} from "@/features/line/components/line-bid-dialog";
import {
  getLineReserveFlyingPatternValidationError,
  LineReserveFlyingPatternControl,
} from "@/features/line/components/line-reserve-flying-pattern-control";
import { ReserveDateScopeControl } from "@/features/reserve/components/reserve-date-scope-control";
import type { RuleBidAvailableProperty, RuleBidTierOption, RuleBidValue } from "@/features/rule-bids/types";
import { TierSelectionTitle, TierToggleGroup } from "@/shared/components/tiers";
import {
  PreferenceConditionSection,
  PreferenceNumberRange,
  PreferenceSegmentedControl,
} from "@/shared/components/preferences";
import { Button } from "@/shared/components/ui/button";
import { PbsDialogFrame } from "@/shared/components/ui/pbs-dialog-frame";
import { lineService } from "@/shared/services/line-service";

type StandingBidDialogProps = {
  confirmLabel?: string;
  confirmPendingLabel?: string;
  isOpen: boolean;
  isPending: boolean;
  property: RuleBidAvailableProperty;
  requireExplicitSelections?: boolean;
  onCancel: () => void;
  onConfirm: (property: RuleBidAvailableProperty) => void;
};

const ensureDefaultActiveTier = (tiers: RuleBidTierOption[]) => {
  if (tiers.some((tier) => tier.active)) {
    return tiers.map((tier) => ({ ...tier }));
  }

  return tiers.map((tier, index) => ({
    ...tier,
    active: index === 0,
  }));
};

const initializeStandingTiers = (
  tiers: RuleBidTierOption[],
  requireExplicitSelections: boolean,
) => requireExplicitSelections
  ? tiers.map((tier) => ({ ...tier, active: false }))
  : ensureDefaultActiveTier(tiers);

const cloneBid = (bid: RuleBidValue): RuleBidValue => structuredClone(bid);
const STANDING_RESERVE_DATE_SCOPE_MODES: ReserveDateScope["mode"][] = ["whole_month", "first_half", "second_half"];

const isStandingReserveDateScope = (dateScope: ReserveDateScope) =>
  STANDING_RESERVE_DATE_SCOPE_MODES.includes(dateScope.mode);

const hasDisallowedReserveDateScope = (bid: RuleBidValue) => {
  if (bid.type === "reserve-call-type-date-scope") {
    return !isStandingReserveDateScope(bid.dateScope);
  }

  if (bid.type === "reserve-flying-date-pattern") {
    return bid.segments.some((segment) => !isStandingReserveDateScope(segment.dateScope));
  }

  return false;
};

const parseStandingDurationMinutes = (value: string) => {
  const match = value.trim().match(/^(\d{1,3}):([0-5]\d)$/);

  if (!match) {
    return null;
  }

  return Number.parseInt(match[1] ?? "", 10) * 60 + Number.parseInt(match[2] ?? "", 10);
};

const formatStandingDurationCompact = (duration: string) => {
  const minutes = parseStandingDurationMinutes(duration);

  if (minutes === null) {
    return duration.trim();
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}:${String(remainder).padStart(2, "0")}`;
};

const StandingReserveCallTypeDateScopeControl = ({
  ariaLabel,
  bid,
  disabled,
  onChange,
}: {
  ariaLabel: string;
  bid: Extract<PairingBidValue, { type: "reserve-call-type-date-scope" }>;
  disabled: boolean;
  onChange: (bid: Extract<PairingBidValue, { type: "reserve-call-type-date-scope" }>) => void;
}) => {
  const hasCallTypeOptions = bid.options.length > 0;

  return (
    <div className="space-y-5">
      <PreferenceConditionSection title="SHORT-CALL TYPE">
        <select
          aria-label={`${ariaLabel} short-call type`}
          className="h-9 w-full rounded-lg border border-[#cfd6e4] bg-white px-3 text-sm font-semibold text-[#40424f] focus-visible:border-[#6866cc] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
          disabled={disabled || !hasCallTypeOptions}
          value={bid.callType}
          onChange={(event) => onChange({ ...bid, callType: event.target.value })}
        >
          {hasCallTypeOptions
            ? bid.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))
            : (
              <option value="">No reserve call types configured</option>
            )}
        </select>
        {!hasCallTypeOptions ? (
          <p className="mt-2 text-xs font-semibold text-[#6f7485]" role="status">
            No reserve call types are configured for your crew type.
          </p>
        ) : null}
      </PreferenceConditionSection>
      <PreferenceConditionSection title="DATE SCOPE">
        <ReserveDateScopeControl
          ariaLabel={`${ariaLabel} date scope`}
          allowedModes={STANDING_RESERVE_DATE_SCOPE_MODES}
          dateScope={bid.dateScope}
          disabled={disabled}
          inputLabelPrefix={ariaLabel}
          onChange={(dateScope) => onChange({ ...bid, dateScope })}
        />
      </PreferenceConditionSection>
    </div>
  );
};

const StandingBidValueControl = ({
  ariaLabel,
  bid,
  minimumBaseLayoverConfig,
  minimumBaseLayoverStatus,
  disabled,
  useReserveLayout,
  onChange,
}: {
  ariaLabel: string;
  bid: RuleBidValue;
  minimumBaseLayoverConfig: PbsLineMinimumBaseLayoverConfig | null;
  minimumBaseLayoverStatus: string | null;
  disabled: boolean;
  useReserveLayout: boolean;
  onChange: (bid: RuleBidValue) => void;
}) => {
  if (bid.type === "date-or-dow-list") {
    return (
      <DateOrDowListControl
        allowDates={false}
        ariaLabel={ariaLabel}
        bid={bid}
        onChange={onChange}
      />
    );
  }

  if (bid.type === "credit-density-preference") {
    return (
      <CreditDensityPreferenceControl
        ariaLabel={ariaLabel}
        bid={bid}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }

  if (bid.type === "reserve-call-type-date-scope") {
    return (
      <StandingReserveCallTypeDateScopeControl
        ariaLabel={ariaLabel}
        bid={bid}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }

  if (bid.type === "reserve-flying-date-pattern") {
    return (
      <LineReserveFlyingPatternControl
        allowedDateScopeModes={STANDING_RESERVE_DATE_SCOPE_MODES}
        ariaLabel={ariaLabel}
        bid={bid}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }

  if (bid.type === "select") {
    return (
      <PreferenceSegmentedControl
        className="max-w-[620px]"
        disabled={disabled}
        options={bid.options.map((option) => ({
          label: option,
          value: option,
        }))}
        value={bid.value}
        onChange={(value) => onChange({ ...bid, value })}
      />
    );
  }

  if (bid.type === "minimum-base-layover") {
    return (
      <MinimumBaseLayoverControl
        ariaLabel={ariaLabel}
        bid={bid}
        config={minimumBaseLayoverConfig}
        disabled={disabled}
        statusMessage={minimumBaseLayoverStatus}
        onChange={onChange}
      />
    );
  }

  if (useReserveLayout && bid.type === "stepper-range") {
    return (
      <PreferenceConditionSection title="WORK BLOCK SIZE">
        <PreferenceNumberRange
          disabled={disabled}
          max={bid.max}
          maxAriaLabel={`${ariaLabel} to`}
          maxInvalid={bid.to < bid.from || (bid.max !== undefined && bid.to > bid.max)}
          maxLabel="TO"
          maxValue={String(bid.to)}
          min={bid.min}
          minAriaLabel={`${ariaLabel} from`}
          minInvalid={(bid.min !== undefined && bid.from < bid.min) || bid.from > bid.to}
          minLabel="FROM"
          minValue={String(bid.from)}
          suffix="days"
          onMaxChange={(value) => onChange({
            ...bid,
            to: Number(value),
          })}
          onMinChange={(value) => onChange({
            ...bid,
            from: Number(value),
          })}
        />
      </PreferenceConditionSection>
    );
  }

  if (useReserveLayout && bid.type === "flag") {
    return (
      <PreferenceConditionSection title="WAIVER">
        <p
          aria-label={ariaLabel}
          className="m-0 text-sm font-semibold leading-5 text-[#40424f]"
        >
          Allow carry over to be days off
        </p>
      </PreferenceConditionSection>
    );
  }

  return (
    <PairingBidControl
      ariaLabel={ariaLabel}
      bid={bid}
      onChange={onChange as (bid: PairingBidValue) => void}
    />
  );
};

const getBidValidationError = (
  bid: RuleBidValue,
  minimumBaseLayoverConfig: PbsLineMinimumBaseLayoverConfig | null,
) => {
  if (bid.type === "tag-list" && bid.values.length === 0) {
    return "At least one value is required.";
  }

  if (bid.type === "select" && (!bid.value || !bid.options.includes(bid.value))) {
    return "Choose a valid day of week.";
  }

  if (bid.type === "date-or-dow-list" && bid.daysOfWeek.length === 0) {
    return "At least one day of week is required.";
  }

  if (bid.type === "time-condition-list" && bid.conditions.length === 0) {
    return "At least one time condition is required.";
  }

  if (
    bid.type === "stepper-range"
    && (
      (bid.min !== undefined && bid.from < bid.min)
      || (bid.max !== undefined && bid.to > bid.max)
      || bid.to < bid.from
    )
  ) {
    return bid.min !== undefined && bid.max !== undefined
      ? `Range must be between ${bid.min} and ${bid.max}, with From no greater than To.`
      : "From must be no greater than To.";
  }

  if (bid.type === "days-off-on-pattern") {
    if (bid.minDaysOff < 1 || bid.minDaysOn < 1 || bid.maxDaysOn < bid.minDaysOn) {
      return "Pattern must use valid days off and days on values.";
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

    if (bid.maximumWorkingDays < 1 || bid.maximumWorkingDays > 31) {
      return "Maximum working days must be between 1 and 31.";
    }
  }

  if (bid.type === "minimum-base-layover") {
    const durationMinutes = parseStandingDurationMinutes(bid.minimumDuration);

    if (durationMinutes === null) {
      return "Minimum Base Layover must use HH:MM.";
    }

    if (minimumBaseLayoverConfig?.available) {
      const minimumMinutes = parseStandingDurationMinutes(minimumBaseLayoverConfig.minDuration);

      if (minimumMinutes !== null && durationMinutes < minimumMinutes) {
        return `Minimum Base Layover must be at least ${formatStandingDurationCompact(minimumBaseLayoverConfig.minDuration)}.`;
      }
    }
  }

  if (bid.type === "reserve-call-type-date-scope") {
    if (bid.callType.trim().length === 0 || !bid.options.includes(bid.callType)) {
      return "Choose a valid reserve call type.";
    }
  }

  if (bid.type === "reserve-flying-date-pattern") {
    return getLineReserveFlyingPatternValidationError(bid);
  }

  if (hasDisallowedReserveDateScope(bid)) {
    return "Standing Bid only supports Whole Month, First Half, or Second Half.";
  }

  return null;
};

export const StandingBidDialog = ({
  confirmLabel = "ADD BID",
  confirmPendingLabel = "ADDING...",
  isOpen,
  isPending,
  property,
  requireExplicitSelections = false,
  onCancel,
  onConfirm,
}: StandingBidDialogProps) => {
  const [bid, setBid] = useState<RuleBidValue>(() => cloneBid(property.bid));
  const [action, setAction] = useState<RuleBidAvailableProperty["action"]>(property.action ?? null);
  const [tiers, setTiers] = useState<RuleBidTierOption[]>(() =>
    initializeStandingTiers(property.tiers, requireExplicitSelections));
  const [minimumBaseLayoverConfig, setMinimumBaseLayoverConfig] = useState<PbsLineMinimumBaseLayoverConfig | null>(null);
  const [minimumBaseLayoverConfigError, setMinimumBaseLayoverConfigError] = useState<string | null>(null);

  useEffect(() => {
    setBid(cloneBid(property.bid));
    setAction(property.action ?? null);
    setTiers(initializeStandingTiers(property.tiers, requireExplicitSelections));
  }, [property, requireExplicitSelections]);

  useEffect(() => {
    if (!isOpen || property.bid.type !== "minimum-base-layover") {
      setMinimumBaseLayoverConfig(null);
      setMinimumBaseLayoverConfigError(null);
      return;
    }

    let isActive = true;
    setMinimumBaseLayoverConfig(null);
    setMinimumBaseLayoverConfigError(null);

    lineService.getMinimumBaseLayoverConfig()
      .then((config) => {
        if (!isActive) {
          return;
        }

        setMinimumBaseLayoverConfig(config);
        if (config.available) {
          setBid((current) => current.type === "minimum-base-layover"
            && current.minimumDuration.trim() === ""
            ? {
              ...current,
              minimumDuration: formatStandingDurationCompact(config.minDuration),
            }
            : current);
        }
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        setMinimumBaseLayoverConfigError("Unable to load minimum base layover.");
      });

    return () => {
      isActive = false;
    };
  }, [isOpen, property.bid.type]);

  if (!isOpen) {
    return null;
  }

  const supportedActions = property.supportedActions ?? [];
  const requiresAction = supportedActions.length > 0;
  const useReserveLayout = property.sourceContext === "reserve"
    || property.bid.type === "reserve-call-type-date-scope";
  const hasActiveTier = tiers.some((tier) => tier.active);
  const isMinimumBaseLayoverBid = bid.type === "minimum-base-layover";
  const reserveControlUsesOwnSections = useReserveLayout
    && (
      bid.type === "reserve-call-type-date-scope"
      || bid.type === "stepper-range"
      || bid.type === "flag"
    );
  const shouldShowBidControl = (useReserveLayout && bid.type === "flag")
    || !(requiresAction && bid.type === "flag");
  const shouldRenderTierFirst = bid.type === "select" || reserveControlUsesOwnSections;
  const minimumBaseLayoverStatus = isMinimumBaseLayoverBid
    ? minimumBaseLayoverConfigError ?? (!minimumBaseLayoverConfig ? "Loading minimum base layover." : null)
    : null;
  const minimumBaseLayoverBlocked = isMinimumBaseLayoverBid
    && (!minimumBaseLayoverConfig?.available || Boolean(minimumBaseLayoverConfigError));
  const bidValidationError = getBidValidationError(bid, minimumBaseLayoverConfig);
  const actionValidationError = requiresAction && action !== "award" && action !== "avoid"
    ? "Choose Award or Avoid before adding this bid."
    : null;
  const canConfirm = !isPending
    && hasActiveTier
    && !minimumBaseLayoverBlocked
    && !bidValidationError
    && !actionValidationError;

  const confirm = () => {
    if (!canConfirm) {
      return;
    }

    onConfirm({
      ...property,
      action: requiresAction ? action : null,
      bid,
      tiers,
    });
  };

  const renderTierSection = () => (
    <div>
      <TierSelectionTitle required />
      <div className="mt-3">
        <TierToggleGroup
          getAriaLabel={(option) => `Toggle ${option.label} for ${property.name}`}
          options={tiers}
          readonly={isPending}
          width="100%"
          onToggle={(tierKey) => {
            setTiers((current) => current.map((tier) =>
              tier.key === tierKey ? { ...tier, active: !tier.active } : tier));
          }}
        />
      </div>
    </div>
  );

  return (
    <PbsDialogFrame
      ariaLabel={`Configure Standing Bid for ${property.name}`}
      bodyClassName="mt-5 space-y-5"
      closeDisabled={isPending}
      footerClassName="mt-6 flex justify-end gap-2"
      panelClassName="w-[min(680px,calc(100vw-32px))]"
      header={(
        <div className="flex items-center">
          <div>
            <p className="m-0 text-base font-bold leading-5 text-[#282c3b]">Configure Standing Bid</p>
            <p className="m-0 mt-1 text-sm font-medium leading-5 text-[#6f7485]">{property.name}</p>
          </div>
          <button
            aria-label="Close Standing Bid dialog"
            className="ml-auto inline-flex h-6 w-6 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-[#6f7485] hover:text-[#6866cc] focus-visible:text-[#6866cc] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
            disabled={isPending}
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
            disabled={isPending}
            type="button"
            variant="ghost"
            onClick={onCancel}
          >
            CANCEL
          </Button>
          <Button
            className="h-9 cursor-pointer rounded-lg bg-[#6866cc] px-4 text-xs font-bold text-white"
            disabled={!canConfirm}
            type="button"
            onClick={confirm}
          >
            {isPending ? confirmPendingLabel : confirmLabel}
          </Button>
        </>
      )}
      onClose={onCancel}
    >
          {shouldRenderTierFirst ? renderTierSection() : null}

          {requiresAction ? (
            <fieldset>
              <legend className="text-xs font-bold leading-4 text-[#8d93a5]">ACTION</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {supportedActions.map((option) => {
                  const isSelected = action === option;

                  return (
                    <button
                      key={option}
                      aria-pressed={isSelected}
                      className={[
                        "h-9 rounded-lg border px-3 text-xs font-bold capitalize",
                        isSelected
                          ? "border-[#6866cc] bg-[#f3f4ff] text-[#6866cc]"
                          : "border-[#d8dde6] bg-white text-[#6f7485] hover:bg-[#f8f9fb]",
                      ].join(" ")}
                      disabled={isPending}
                      type="button"
                      onClick={() => setAction(option)}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {actionValidationError ? (
                <p className="m-0 mt-2 text-xs font-semibold leading-4 text-[#d05b5b]" role="alert">
                  {actionValidationError}
                </p>
              ) : null}
            </fieldset>
          ) : null}

          {shouldShowBidControl ? (
            reserveControlUsesOwnSections ? (
              <div>
                <StandingBidValueControl
                  ariaLabel={`Configure bid for ${property.name}`}
                  bid={bid}
                  minimumBaseLayoverConfig={minimumBaseLayoverConfig}
                  minimumBaseLayoverStatus={minimumBaseLayoverStatus}
                  disabled={isPending}
                  useReserveLayout={useReserveLayout}
                  onChange={setBid}
                />
                {bidValidationError ? (
                  <p className="m-0 mt-2 text-xs font-semibold leading-4 text-[#d05b5b]" role="alert">
                    {bidValidationError}
                  </p>
                ) : null}
              </div>
            ) : (
              <div>
                <p className="m-0 text-xs font-bold uppercase leading-4 tracking-[0.22em] text-[#748094]">
                  {bid.type === "select" ? "DAY OF WEEK" : "BID"}
                </p>
                <div className="mt-2">
                  <StandingBidValueControl
                    ariaLabel={`Configure bid for ${property.name}`}
                    bid={bid}
                    minimumBaseLayoverConfig={minimumBaseLayoverConfig}
                    minimumBaseLayoverStatus={minimumBaseLayoverStatus}
                    disabled={isPending}
                    useReserveLayout={useReserveLayout}
                    onChange={setBid}
                  />
                  {bidValidationError ? (
                    <p className="m-0 mt-2 text-xs font-semibold leading-4 text-[#d05b5b]" role="alert">
                      {bidValidationError}
                    </p>
                  ) : null}
                </div>
              </div>
            )
          ) : null}

          {shouldRenderTierFirst ? null : renderTierSection()}
    </PbsDialogFrame>
  );
};
