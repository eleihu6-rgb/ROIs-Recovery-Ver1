import { useMemo, useRef } from "react";
import type { PbsCurrentPeriod } from "../../../../../packages/contracts/pbs-current-period.js";
import type { PbsPreferOffConfig } from "../../../../../packages/contracts/pbs-prefer-off.js";
import { parsePreferOffBidValues } from "../../../../../packages/contracts/pbs-prefer-off.js";
import { DaysOffBidDialog } from "@/features/days-off/components/days-off-bid-dialog";
import { LineBidDialog } from "@/features/line/components/line-bid-dialog";
import {
  buildMixedLineShortCallPropertyGroupKey,
  getMixedLineAdditionalProperties,
  MIXED_LINE_SHORT_CALL_PROPERTY_CODE,
  withMixedLineAdditionalProperties,
} from "@/features/line/mixed-line-bid";
import { PairingPropertyConfigDialog } from "@/features/pairing/components/pairing-property-config-dialog";
import { resolvePairingSearchPeriod } from "@/features/pairing/pairing-search-period";
import type {
  PairingAvailableProperty,
  PairingBidValue,
  ReserveDateScope,
} from "@/features/pairing/types";
import type { RuleBidAvailableProperty } from "@/features/rule-bids/types";
import { isPairingBidValue } from "@/features/rule-bids/types";
import { StandingBidDialog } from "@/features/standing-bid/components/standing-bid-dialog";

type StandingBidPropertyDialogProps = {
  confirmLabel?: string;
  confirmPendingLabel?: string;
  currentPeriod?: PbsCurrentPeriod | null;
  isOpen: boolean;
  isPending: boolean;
  preferOffConfig?: PbsPreferOffConfig;
  property: RuleBidAvailableProperty;
  requireExplicitSelections?: boolean;
  onCancel: () => void;
  onConfirm: (property: RuleBidAvailableProperty) => void;
  onRemove?: () => void;
};

const PREFER_OFF_PROPERTY_CODE = 201;
const STANDING_RESERVE_DATE_SCOPE_MODES: ReserveDateScope["mode"][] = [
  "whole_month",
  "first_half",
  "second_half",
];

const useStableDialogProperty = (
  property: RuleBidAvailableProperty,
): RuleBidAvailableProperty => {
  const propertyKey = JSON.stringify(property);
  const propertyRef = useRef({
    key: propertyKey,
    value: property,
  });

  if (propertyRef.current.key !== propertyKey) {
    propertyRef.current = {
      key: propertyKey,
      value: property,
    };
  }

  return propertyRef.current.value;
};

const withoutEventDateScope = (bid: PairingBidValue): PairingBidValue => {
  switch (bid.type) {
    case "airport-preference":
    case "deadhead-flying":
    case "flight-number-preference":
    case "flight-legs-per-duty":
    case "pairing-check-time":
    case "pairing-length-preference":
    case "redeye-preference":
    case "work-day-preference":
      return {
        ...bid,
        dateScope: null,
      };
    default:
      return bid;
  }
};

const buildPairingDialogProperty = (
  property: RuleBidAvailableProperty,
): PairingAvailableProperty | null => {
  if (!isPairingBidValue(property.bid)) {
    return null;
  }

  return {
    id: property.id,
    favoriteKey: property.favoriteKey,
    propertyId: property.propertyId,
    source: property.source,
    propertyCode: property.propertyCode,
    name: property.name,
    favorited: false,
    recommendedSortOrder: property.recommendedSortOrder,
    action: property.action ?? null,
    quantifier: null,
    bid: withoutEventDateScope(property.bid),
    tiers: property.tiers,
    actions: ["add"],
    pairingNumber: "",
    pairingType: "",
    effectiveDateRange: {
      from: "",
      to: "",
    },
  };
};

const buildStandingDialogProperty = (
  sourceProperty: RuleBidAvailableProperty,
  draft: PairingAvailableProperty,
): RuleBidAvailableProperty => ({
  ...sourceProperty,
  action: draft.action,
  bid: withoutEventDateScope(draft.bid),
  tiers: draft.tiers,
});

const buildPreferOffDialogProperty = (
  property: RuleBidAvailableProperty,
  preferOffConfig?: PbsPreferOffConfig,
) => {
  const weekdayNameByCode = new Map(
    (preferOffConfig?.weekdays ?? []).map((weekday) => [weekday.code, weekday.name]),
  );
  const legacyValues = property.bid.type === "date-or-dow-list"
    ? [
        ...property.bid.dates,
        ...property.bid.daysOfWeek.flatMap((code) => {
          const name = weekdayNameByCode.get(code);
          return name ? [name] : [code];
        }),
      ]
    : [];
  const bid = property.bid.type === "tag-list"
    ? property.bid
    : { type: "tag-list" as const, values: legacyValues };
  const parsed = parsePreferOffBidValues(bid.values, preferOffConfig);
  const validationError = parsed.mode === "specific_dates"
    || parsed.mode === "date_range"
    || parsed.mode === "mixed"
    ? "Specific dates are not supported in Standing Bid. Remove the dated values before updating."
    : parsed.invalidValues.length > 0
      ? "One or more saved Prefer Off values are no longer available."
      : preferOffConfig?.weekdays.length
        ? null
        : "Weekday options are unavailable. Try refreshing Standing Bid.";

  return {
    property: {
      ...property,
      bid,
    },
    validationError,
  };
};

const buildStandingPreferOffProperty = (
  sourceProperty: RuleBidAvailableProperty,
  draft: RuleBidAvailableProperty,
): RuleBidAvailableProperty => {
  return {
    ...sourceProperty,
    bid: draft.bid.type === "tag-list"
      ? draft.bid
      : { type: "tag-list", values: [] },
    tiers: draft.tiers,
  };
};

const buildLineDialogProperty = (property: RuleBidAvailableProperty) => {
  if (property.bid.type === "days-off-on-pattern") {
    return {
      property: {
        ...property,
        bid: {
          ...property.bid,
          dateRange: null,
        },
      },
      validationError: property.bid.dateRange
        ? "Specific date ranges are not supported in Standing Bid. Remove this property and add it again."
        : null,
    };
  }

  if (property.bid.type === "reserve-flying-date-pattern") {
    const hasDisallowedDateScope = property.bid.segments.some((segment) =>
      !STANDING_RESERVE_DATE_SCOPE_MODES.includes(segment.dateScope.mode));

    return {
      property,
      validationError: hasDisallowedDateScope
        ? "Standing Bid only supports Whole Month, First Half, or Second Half."
        : null,
    };
  }

  return {
    property,
    validationError: null,
  };
};

const buildStandingLineProperty = (
  sourceProperty: RuleBidAvailableProperty,
  draft: RuleBidAvailableProperty,
): RuleBidAvailableProperty => {
  const buildProperty = (
    draftProperty: RuleBidAvailableProperty,
    fallbackId: string,
  ): RuleBidAvailableProperty => {
    const isMixedLineShortCall = draftProperty.propertyCode === MIXED_LINE_SHORT_CALL_PROPERTY_CODE
      && draftProperty.sourceContext === "reserve";

    return {
      ...sourceProperty,
      id: isMixedLineShortCall
        ? buildMixedLineShortCallPropertyGroupKey(draftProperty.id || fallbackId)
        : fallbackId,
      propertyCode: draftProperty.propertyCode,
      name: draftProperty.name,
      action: draftProperty.action,
      bid: draftProperty.bid.type === "days-off-on-pattern"
        ? { ...draftProperty.bid, dateRange: null }
        : draftProperty.bid,
      tiers: draftProperty.tiers,
      categoryLabel: draftProperty.categoryLabel ?? sourceProperty.categoryLabel,
      categorySortOrder: draftProperty.categorySortOrder ?? sourceProperty.categorySortOrder,
      sourceContext: draftProperty.sourceContext ?? sourceProperty.sourceContext,
    };
  };

  return withMixedLineAdditionalProperties(
    buildProperty(draft, sourceProperty.id),
    getMixedLineAdditionalProperties(draft).map((additionalProperty) =>
      buildProperty(additionalProperty, additionalProperty.id)),
  );
};

export const StandingBidPropertyDialog = ({
  confirmLabel = "ADD BID",
  confirmPendingLabel = "ADDING...",
  currentPeriod,
  isOpen,
  isPending,
  preferOffConfig,
  property,
  requireExplicitSelections = false,
  onCancel,
  onConfirm,
  onRemove,
}: StandingBidPropertyDialogProps) => {
  const stableProperty = useStableDialogProperty(property);
  const preferOffProperty = useMemo(
    () => buildPreferOffDialogProperty(stableProperty, preferOffConfig),
    [preferOffConfig, stableProperty],
  );
  const lineProperty = useMemo(
    () => buildLineDialogProperty(stableProperty),
    [stableProperty],
  );
  const pairingProperty = useMemo(
    () => stableProperty.categoryLabel === "Pairing"
      ? buildPairingDialogProperty(stableProperty)
      : null,
    [stableProperty],
  );
  const pairingSearchPeriod = resolvePairingSearchPeriod(currentPeriod);

  if (
    stableProperty.categoryLabel === "Days Off"
    && stableProperty.propertyCode === PREFER_OFF_PROPERTY_CODE
  ) {

    return (
      <DaysOffBidDialog
        confirmLabel={confirmLabel}
        confirmPendingLabel={confirmPendingLabel}
        dialogContext="standing"
        isOpen={isOpen}
        isPending={isPending}
        periodCode="STANDING"
        periodEndDate={currentPeriod?.rpEndLocal ?? ""}
        periodStartDate={currentPeriod?.rpStartLocal ?? ""}
        preferOffConfig={preferOffConfig}
        preserveInitialTiers={!requireExplicitSelections}
        property={preferOffProperty.property}
        validationError={preferOffProperty.validationError}
        onCancel={onCancel}
        onConfirm={(draft) => onConfirm(
          buildStandingPreferOffProperty(stableProperty, draft),
        )}
      />
    );
  }

  if (
    stableProperty.categoryLabel === "Days Off"
    && stableProperty.bid.type === "stepper-date-range"
  ) {
    return (
      <DaysOffBidDialog
        confirmLabel={confirmLabel}
        confirmPendingLabel={confirmPendingLabel}
        dialogContext="standing"
        isOpen={isOpen}
        isPending={isPending}
        periodCode="STANDING"
        periodEndDate={currentPeriod?.rpEndLocal ?? ""}
        periodStartDate={currentPeriod?.rpStartLocal ?? ""}
        preserveInitialTiers={!requireExplicitSelections}
        property={stableProperty}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );
  }

  if (stableProperty.categoryLabel === "Roster" && stableProperty.sourceContext !== "reserve") {
    return (
      <LineBidDialog
        allowedReserveDateScopeModes={STANDING_RESERVE_DATE_SCOPE_MODES}
        confirmLabel={confirmLabel}
        confirmPendingLabel={confirmPendingLabel}
        dialogContext="standing"
        disableAbsoluteDates
        isOpen={isOpen}
        isPending={isPending}
        mixedLineShortCallSourceContext="reserve"
        periodCode="STANDING"
        property={lineProperty.property}
        startWithNoActiveTiers={requireExplicitSelections}
        validationError={lineProperty.validationError}
        onCancel={onCancel}
        onConfirm={(draft) => onConfirm(buildStandingLineProperty(stableProperty, draft))}
        onRemove={onRemove}
      />
    );
  }

  if (!pairingProperty) {
    return (
      <StandingBidDialog
        confirmLabel={confirmLabel}
        confirmPendingLabel={confirmPendingLabel}
        isOpen={isOpen}
        isPending={isPending}
        property={stableProperty}
        requireExplicitSelections={requireExplicitSelections}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );
  }

  return (
    <PairingPropertyConfigDialog
      confirmLabel={confirmLabel}
      confirmPendingLabel={confirmPendingLabel}
      dialogAriaLabel={`Configure Standing Bid for ${stableProperty.name}`}
      dialogSubtitle={stableProperty.name}
      dialogTitle="Configure Standing Bid"
      disableEventDateScope
      isOpen={isOpen}
      isPending={isPending}
      pairingNumberPeriodCode={currentPeriod?.periodCode ?? ""}
      pairingSearchPeriod={pairingSearchPeriod}
      periodEndDate={currentPeriod?.rpEndLocal ?? ""}
      periodStartDate={currentPeriod?.rpStartLocal ?? ""}
      property={pairingProperty}
      requireExplicitSelections={requireExplicitSelections}
      onCancel={onCancel}
      onConfirm={(draft) => onConfirm(buildStandingDialogProperty(stableProperty, draft))}
    />
  );
};
