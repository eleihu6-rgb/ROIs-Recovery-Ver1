import {
  QuestionMarkCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  containsExplicitCalendarDate,
  pbsFavoriteDateSemanticContexts,
} from "../../../../../packages/contracts/pbs-favorite-eligibility.js";

import { PairingBidControl } from "@/features/pairing/components/pairing-bid-control";
import {
  AirportPreferenceEditor,
  isAirportPreferenceBidValueValid,
} from "@/features/pairing/components/airport-preference-editor";
import {
  FlightLegsPerDutyEditor,
  isFlightLegsPerDutyBidValueValid,
} from "@/features/pairing/components/flight-legs-per-duty-editor";
import {
  MonthEndCarryoverEditor,
  isMonthEndCarryoverBidValueValid,
} from "@/features/pairing/components/month-end-carryover-editor";
import {
  DeadheadFlyingEditor,
  isDeadheadFlyingBidValueValid,
} from "@/features/pairing/components/deadhead-flying-editor";
import {
  TimeBetweenFlightsEditor,
  isTimeBetweenFlightsBidValueValid,
} from "@/features/pairing/components/time-between-flights-editor";
import {
  FlightNumberPreferenceEditor,
  isFlightNumberPreferenceBidValueValid,
} from "@/features/pairing/components/flight-number-preference-editor";
import {
  RedeyePreferenceEditor,
  isRedeyePreferenceBidValueValid,
} from "@/features/pairing/components/redeye-preference-editor";
import {
  PairingLengthEditor,
  isPairingLengthBidValueValid,
} from "@/features/pairing/components/pairing-length-editor";
import {
  PairingCheckTimeEditor,
  isPairingCheckTimeBidValueValid,
} from "@/features/pairing/components/pairing-check-time-editor";
import {
  PairingPreferenceEditor,
  isPairingPreferenceBidValueValid,
} from "@/features/pairing/components/pairing-preference-editor";
import {
  EfficientFlyingEditor,
  isEfficientFlyingBidValueValid,
} from "@/features/pairing/components/efficient-flying-editor";
import { PairingPropertyChoiceGroup } from "@/features/pairing/components/pairing-property-choice-group";
import { PairingPropertyDialogFooter } from "@/features/pairing/components/pairing-property-dialog-footer";
import {
  WorkDayPreferenceEditor,
  isWorkDayPreferenceBidValueValid,
} from "@/features/pairing/components/work-day-preference-editor";
import { getCrewIdAutocompleteConfig } from "@/features/pairing/crew-id-autocomplete";
import { getFlightNumberAutocompleteConfig } from "@/features/pairing/flight-number-autocomplete";
import {
  inferPairingBidOperator,
  isPairingBidComplete,
} from "@/features/pairing/pairing-bid-control-logic";
import { getPairingNumberAutocompleteConfig } from "@/features/pairing/pairing-number-autocomplete";
import { buildPairingReferenceAutocompleteConfig } from "@/features/pairing/pairing-reference-autocomplete";
import {
  PAIRING_NUMBER_PROPERTY_CODE,
  extractPairingNumberChoicesFromBid,
} from "@/features/pairing/pairing-number-occurrences";
import {
  getPairingPropertyActionsByCode,
  getPairingPropertyDefinitionByCode,
  getPairingPropertyOperatorsByCode,
  getPairingPropertyQuantifiersByCode,
  isPairingCreditPriorityProperty,
} from "@/features/pairing/pairing-property-catalog";
import {
  canUsePairingCreditPriority,
  clonePairingConfigPropertyDraft,
  preservePairingBidCreditPriority,
  setPairingBidCreditPriority,
} from "@/features/pairing/pairing-property-config-draft";
import {
  EFFICIENT_FLYING_PROPERTY_CODE,
  isEfficientFlyingPercentileValid,
  useEfficientFlyingConfig,
} from "@/features/pairing/efficient-flying-config";
import { useRedeyeConfig } from "@/features/pairing/redeye-config";
import type {
  PairingAvailableProperty,
  PairingBidAction,
  PairingBidOperator,
  PairingBidQuantifier,
  PairingBidValue,
  PairingCreditPriority,
} from "@/features/pairing/types";
import { TierSelectionTitle, TierToggleGroup } from "@/shared/components/tiers";
import { AwardAvoidSegmentedControl, togglePreferenceTier } from "@/shared/components/preferences";
import { PbsDialogFrame } from "@/shared/components/ui/pbs-dialog-frame";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import {
  pairingService,
  type PairingSearchPeriodReference,
} from "@/shared/services/pairing-service";
import { useI18n } from "@/shared/i18n";

const WORK_START_STATION_PROPERTY_CODE = 165;
const AIRPORT_PREFERENCE_PROPERTY_CODE = 168;
const PAIRING_CHECK_TIME_PROPERTY_CODE = 103;
const FLIGHT_LEGS_PER_DUTY_PROPERTY_CODE = 107;
const WORK_DAY_PREFERENCE_PROPERTY_CODE = 110;
const PAIRING_LENGTH_PROPERTY_CODE = 112;
const FLIGHT_NUMBER_PREFERENCE_PROPERTY_CODE = 116;
const REDEYE_PREFERENCE_PROPERTY_CODE = 117;
const DEADHEAD_FLYING_PROPERTY_CODE = 122;
const MONTH_END_CARRYOVER_PROPERTY_CODE = 163;
const TIME_BETWEEN_FLIGHTS_PROPERTY_CODE = 129;
const AIRPORT_MULTI_SELECT_PROPERTY_CODES = new Set([
  101,
  104,
  150,
  151,
  152,
  155,
  156,
  AIRPORT_PREFERENCE_PROPERTY_CODE,
  WORK_START_STATION_PROPERTY_CODE,
]);
const AIRPORT_OPTIONS_TOOLTIP =
  "Options are limited to airports or stations found within pairings for the current base and bid period.";

const parseDurationMinutes = (value: string): number | null => {
  const match = value.trim().match(/^(\d{1,3}):(\d{2})$/);

  if (!match || Number.parseInt(match[2], 10) >= 60) {
    return null;
  }

  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
};

type PairingPropertyConfigDialogProps = {
  confirmSavesFavorite?: boolean;
  disableEventDateScope?: boolean;
  dialogAriaLabel?: string;
  dialogSubtitle?: string;
  dialogTitle?: string;
  favoriteLabel?: string;
  hideTiers?: boolean;
  isFavoritePending?: boolean;
  isOpen: boolean;
  isPending: boolean;
  property: PairingAvailableProperty;
  pairingNumberPeriodCode?: string;
  pairingSearchPeriod?: PairingSearchPeriodReference | null;
  periodEndDate?: string;
  periodStartDate?: string;
  confirmLabel?: string;
  confirmPendingLabel?: string;
  requireExplicitSelections?: boolean;
  requireTierSelection?: boolean;
  onCancel: () => void;
  onConfirm: (property: PairingAvailableProperty) => void;
  onSaveFavorite?: (property: PairingAvailableProperty) => void;
};

const AirportOptionsHelp = () => (
  <span className="group relative inline-flex">
    <button
      aria-label="Airport options help"
      className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border-0 bg-transparent p-0 text-[#8d93a5] hover:text-[#6866cc] focus-visible:text-[#6866cc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#706cd5]"
      type="button"
    >
      <QuestionMarkCircleIcon className="h-4 w-4 stroke-[1.8]" />
    </button>
    <span
      className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-[280px] rounded-lg border border-[#dfe4ee] bg-white px-3 py-2 text-xs font-medium leading-5 text-[#4d5365] shadow-[0_12px_28px_rgb(20_24_38_/_16%)] group-hover:block group-focus-within:block"
      role="tooltip"
    >
      {AIRPORT_OPTIONS_TOOLTIP}
    </span>
  </span>
);

const initializeConfigDialogDraft = (
  property: PairingAvailableProperty,
  requireExplicitSelections: boolean,
): PairingAvailableProperty => {
  const nextDraft = clonePairingConfigPropertyDraft(property);
  const actionOptions = getPairingPropertyActionsByCode(nextDraft.propertyCode);
  const isAirportPreferenceProperty = nextDraft.propertyCode === AIRPORT_PREFERENCE_PROPERTY_CODE;
  const isEfficientFlyingProperty = nextDraft.propertyCode === EFFICIENT_FLYING_PROPERTY_CODE;
  const isFlightLegsPerDutyProperty = nextDraft.propertyCode === FLIGHT_LEGS_PER_DUTY_PROPERTY_CODE;
  const isWorkDayPreferenceProperty = nextDraft.propertyCode === WORK_DAY_PREFERENCE_PROPERTY_CODE;
  const isPairingLengthProperty = nextDraft.propertyCode === PAIRING_LENGTH_PROPERTY_CODE;
  const isFlightNumberPreferenceProperty = nextDraft.propertyCode === FLIGHT_NUMBER_PREFERENCE_PROPERTY_CODE;
  const isRedeyePreferenceProperty = nextDraft.propertyCode === REDEYE_PREFERENCE_PROPERTY_CODE;
  const isDeadheadFlyingProperty = nextDraft.propertyCode === DEADHEAD_FLYING_PROPERTY_CODE;
  const isMonthEndCarryoverProperty = nextDraft.propertyCode === MONTH_END_CARRYOVER_PROPERTY_CODE;
  const isTimeBetweenFlightsProperty = nextDraft.propertyCode === TIME_BETWEEN_FLIGHTS_PROPERTY_CODE;

  if (!requireExplicitSelections) {
    return nextDraft;
  }

  if (
    (nextDraft.propertyCode === PAIRING_NUMBER_PROPERTY_CODE
      || isAirportPreferenceProperty
      || isEfficientFlyingProperty
      || nextDraft.propertyCode === PAIRING_CHECK_TIME_PROPERTY_CODE
      || isPairingLengthProperty
      || isFlightNumberPreferenceProperty
      || isDeadheadFlyingProperty
      || isMonthEndCarryoverProperty
      || isTimeBetweenFlightsProperty)
    && nextDraft.action == null
    && actionOptions.includes("award")
  ) {
    nextDraft.action = "award";
  }

  if (isRedeyePreferenceProperty && nextDraft.action == null && actionOptions.includes("avoid")) {
    nextDraft.action = "avoid";
  }

  if ((isFlightLegsPerDutyProperty || isTimeBetweenFlightsProperty) && actionOptions.includes("award")) {
    nextDraft.action = "award";
    nextDraft.quantifier = "any";
  }

  if (isWorkDayPreferenceProperty && actionOptions.includes("award")) {
    nextDraft.action = "award";
    nextDraft.quantifier = null;
  }

  return {
    ...nextDraft,
    action: nextDraft.propertyCode === PAIRING_NUMBER_PROPERTY_CODE
      || isAirportPreferenceProperty
      || isEfficientFlyingProperty
      || nextDraft.propertyCode === PAIRING_CHECK_TIME_PROPERTY_CODE
      || isFlightLegsPerDutyProperty
      || isWorkDayPreferenceProperty
      || isPairingLengthProperty
      || isFlightNumberPreferenceProperty
      || isRedeyePreferenceProperty
      || isDeadheadFlyingProperty
      || isMonthEndCarryoverProperty
      || isTimeBetweenFlightsProperty
      || actionOptions.length === 0
      ? nextDraft.action
      : null,
    quantifier: isWorkDayPreferenceProperty
      ? null
      : isFlightLegsPerDutyProperty || isTimeBetweenFlightsProperty
      ? nextDraft.quantifier
      : getPairingPropertyQuantifiersByCode(nextDraft.propertyCode).length > 1 ? null : nextDraft.quantifier,
    tiers: nextDraft.tiers.map((tier) => ({ ...tier, active: false })),
  };
};

const initializeSelectedBidOperator = (
  property: PairingAvailableProperty,
  requireExplicitSelections: boolean,
): PairingBidOperator | null => {
  if (getPairingPropertyOperatorsByCode(property.propertyCode).length === 0) {
    return null;
  }

  if (
    property.propertyCode === PAIRING_CHECK_TIME_PROPERTY_CODE
    || property.propertyCode === WORK_DAY_PREFERENCE_PROPERTY_CODE
    || property.propertyCode === TIME_BETWEEN_FLIGHTS_PROPERTY_CODE
  ) {
    return inferPairingBidOperator(property.bid);
  }

  return requireExplicitSelections ? null : inferPairingBidOperator(property.bid);
};

const PairingPreferenceActionControl = ({
  disabled,
  options,
  selectedValue,
  onSelect,
}: {
  disabled: boolean;
  options: readonly PairingBidAction[];
  selectedValue: PairingBidAction | null;
  onSelect: (action: PairingBidAction) => void;
}) => {
  if (options.length === 0) {
    return null;
  }

  return (
    <fieldset>
      <legend className="text-xs font-bold uppercase leading-4 tracking-[0.22em] text-[#748094]">
        PREFERENCE
      </legend>
      <div className="mt-3">
        <AwardAvoidSegmentedControl
          disabled={disabled}
          options={options}
          value={selectedValue}
          onChange={onSelect}
        />
      </div>
    </fieldset>
  );
};

export const PairingPropertyConfigDialog = ({
  confirmSavesFavorite = false,
  disableEventDateScope = false,
  dialogAriaLabel,
  dialogSubtitle,
  dialogTitle,
  favoriteLabel,
  hideTiers = false,
  isFavoritePending = false,
  isOpen,
  isPending,
  property,
  pairingNumberPeriodCode = "",
  pairingSearchPeriod = null,
  periodEndDate = "",
  periodStartDate = "",
  confirmLabel,
  confirmPendingLabel,
  requireExplicitSelections = false,
  requireTierSelection = true,
  onCancel,
  onConfirm,
  onSaveFavorite,
}: PairingPropertyConfigDialogProps) => {
  const { t } = useI18n();
  const shouldHideEventDateScope = disableEventDateScope || confirmSavesFavorite;
  const [draft, setDraft] = useState<PairingAvailableProperty>(() =>
    initializeConfigDialogDraft(property, requireExplicitSelections));
  const [selectedBidOperator, setSelectedBidOperator] = useState<PairingBidOperator | null>(() =>
    initializeSelectedBidOperator(property, requireExplicitSelections));
  const [isPairingPreferenceValid, setIsPairingPreferenceValid] = useState(() =>
    property.propertyCode === PAIRING_NUMBER_PROPERTY_CODE
    && !requireExplicitSelections
    && isPairingPreferenceBidValueValid(property.bid));
  const [isAirportPreferenceValid, setIsAirportPreferenceValid] = useState(() =>
    property.propertyCode === AIRPORT_PREFERENCE_PROPERTY_CODE
    && !requireExplicitSelections
    && isAirportPreferenceBidValueValid(property.bid));
  const [isEfficientFlyingValid, setIsEfficientFlyingValid] = useState(() =>
    property.propertyCode === EFFICIENT_FLYING_PROPERTY_CODE
    && isEfficientFlyingBidValueValid(property.bid));
  const [isPairingCheckTimeValid, setIsPairingCheckTimeValid] = useState(() =>
    property.propertyCode === PAIRING_CHECK_TIME_PROPERTY_CODE
    && !requireExplicitSelections
    && isPairingCheckTimeBidValueValid(property.bid));
  const [isFlightLegsValueValid, setIsFlightLegsValueValid] = useState(() =>
    property.propertyCode === FLIGHT_LEGS_PER_DUTY_PROPERTY_CODE
    && !requireExplicitSelections
    && isFlightLegsPerDutyBidValueValid(property.bid));
  const [isWorkDayPreferenceValid, setIsWorkDayPreferenceValid] = useState(() =>
    property.propertyCode === WORK_DAY_PREFERENCE_PROPERTY_CODE
    && !requireExplicitSelections
    && isWorkDayPreferenceBidValueValid(property.bid));
  const [isPairingLengthValueValid, setIsPairingLengthValueValid] = useState(() =>
    property.propertyCode === PAIRING_LENGTH_PROPERTY_CODE
    && !requireExplicitSelections
    && isPairingLengthBidValueValid(property.bid));
  const [isFlightNumberPreferenceValid, setIsFlightNumberPreferenceValid] = useState(() =>
    property.propertyCode === FLIGHT_NUMBER_PREFERENCE_PROPERTY_CODE
    && !requireExplicitSelections
    && isFlightNumberPreferenceBidValueValid(property.bid));
  const [isRedeyePreferenceValid, setIsRedeyePreferenceValid] = useState(() =>
    property.propertyCode === REDEYE_PREFERENCE_PROPERTY_CODE
    && !requireExplicitSelections
    && isRedeyePreferenceBidValueValid(property.bid));
  const [isDeadheadFlyingValid, setIsDeadheadFlyingValid] = useState(() =>
    property.propertyCode === DEADHEAD_FLYING_PROPERTY_CODE
    && isDeadheadFlyingBidValueValid(property.bid));
  const [isMonthEndCarryoverValid, setIsMonthEndCarryoverValid] = useState(() =>
    property.propertyCode === MONTH_END_CARRYOVER_PROPERTY_CODE
    && !requireExplicitSelections
    && isMonthEndCarryoverBidValueValid(property.bid));
  const [isTimeBetweenFlightsValid, setIsTimeBetweenFlightsValid] = useState(() =>
    property.propertyCode === TIME_BETWEEN_FLIGHTS_PROPERTY_CODE
    && !requireExplicitSelections
    && isTimeBetweenFlightsBidValueValid(property.bid));
  const favoriteButtonLabel = favoriteLabel ?? t("pairing.dialog.saveFavorite");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const nextDraft = initializeConfigDialogDraft(property, requireExplicitSelections);

    setDraft(nextDraft);
    setSelectedBidOperator(initializeSelectedBidOperator(nextDraft, requireExplicitSelections));
    setIsPairingPreferenceValid(
      nextDraft.propertyCode === PAIRING_NUMBER_PROPERTY_CODE
      && !requireExplicitSelections
      && isPairingPreferenceBidValueValid(nextDraft.bid),
    );
    setIsAirportPreferenceValid(
      nextDraft.propertyCode === AIRPORT_PREFERENCE_PROPERTY_CODE
      && !requireExplicitSelections
      && isAirportPreferenceBidValueValid(nextDraft.bid),
    );
    setIsEfficientFlyingValid(
      nextDraft.propertyCode === EFFICIENT_FLYING_PROPERTY_CODE
      && isEfficientFlyingBidValueValid(nextDraft.bid),
    );
    setIsPairingCheckTimeValid(
      nextDraft.propertyCode === PAIRING_CHECK_TIME_PROPERTY_CODE
      && !requireExplicitSelections
      && isPairingCheckTimeBidValueValid(nextDraft.bid),
    );
    setIsFlightLegsValueValid(
      nextDraft.propertyCode === FLIGHT_LEGS_PER_DUTY_PROPERTY_CODE
      && !requireExplicitSelections
      && isFlightLegsPerDutyBidValueValid(nextDraft.bid),
    );
    setIsWorkDayPreferenceValid(
      nextDraft.propertyCode === WORK_DAY_PREFERENCE_PROPERTY_CODE
      && !requireExplicitSelections
      && isWorkDayPreferenceBidValueValid(nextDraft.bid),
    );
    setIsPairingLengthValueValid(
      nextDraft.propertyCode === PAIRING_LENGTH_PROPERTY_CODE
      && !requireExplicitSelections
      && isPairingLengthBidValueValid(nextDraft.bid),
    );
    setIsFlightNumberPreferenceValid(
      nextDraft.propertyCode === FLIGHT_NUMBER_PREFERENCE_PROPERTY_CODE
      && !requireExplicitSelections
      && isFlightNumberPreferenceBidValueValid(nextDraft.bid),
    );
    setIsRedeyePreferenceValid(
      nextDraft.propertyCode === REDEYE_PREFERENCE_PROPERTY_CODE
      && !requireExplicitSelections
      && isRedeyePreferenceBidValueValid(nextDraft.bid),
    );
    setIsDeadheadFlyingValid(
      nextDraft.propertyCode === DEADHEAD_FLYING_PROPERTY_CODE
      && isDeadheadFlyingBidValueValid(nextDraft.bid),
    );
    setIsMonthEndCarryoverValid(
      nextDraft.propertyCode === MONTH_END_CARRYOVER_PROPERTY_CODE
      && !requireExplicitSelections
      && isMonthEndCarryoverBidValueValid(nextDraft.bid),
    );
    setIsTimeBetweenFlightsValid(
      nextDraft.propertyCode === TIME_BETWEEN_FLIGHTS_PROPERTY_CODE
      && !requireExplicitSelections
      && isTimeBetweenFlightsBidValueValid(nextDraft.bid),
    );
  }, [isOpen, property, requireExplicitSelections]);

  const actionOptions = useMemo(() => getPairingPropertyActionsByCode(draft.propertyCode), [draft.propertyCode]);
  const quantifierOptions = useMemo(() => getPairingPropertyQuantifiersByCode(draft.propertyCode), [draft.propertyCode]);
  const operatorOptions = useMemo(() => getPairingPropertyOperatorsByCode(draft.propertyCode), [draft.propertyCode]);
  const flightLegsNumericBounds = getPairingPropertyDefinitionByCode(
    FLIGHT_LEGS_PER_DUTY_PROPERTY_CODE,
  )?.numericBounds ?? { min: 1, max: 8 };
  const isPairingNumberProperty = draft.propertyCode === PAIRING_NUMBER_PROPERTY_CODE;
  const isAirportPreferenceProperty = draft.propertyCode === AIRPORT_PREFERENCE_PROPERTY_CODE;
  const isEfficientFlyingProperty = draft.propertyCode === EFFICIENT_FLYING_PROPERTY_CODE;
  const isPairingCheckTimeProperty = draft.propertyCode === PAIRING_CHECK_TIME_PROPERTY_CODE;
  const isFlightLegsPerDutyProperty = draft.propertyCode === FLIGHT_LEGS_PER_DUTY_PROPERTY_CODE;
  const isWorkDayPreferenceProperty = draft.propertyCode === WORK_DAY_PREFERENCE_PROPERTY_CODE;
  const isPairingLengthProperty = draft.propertyCode === PAIRING_LENGTH_PROPERTY_CODE;
  const isFlightNumberPreferenceProperty = draft.propertyCode === FLIGHT_NUMBER_PREFERENCE_PROPERTY_CODE;
  const isRedeyePreferenceProperty = draft.propertyCode === REDEYE_PREFERENCE_PROPERTY_CODE;
  const isDeadheadFlyingProperty = draft.propertyCode === DEADHEAD_FLYING_PROPERTY_CODE;
  const isMonthEndCarryoverProperty = draft.propertyCode === MONTH_END_CARRYOVER_PROPERTY_CODE;
  const isTimeBetweenFlightsProperty = draft.propertyCode === TIME_BETWEEN_FLIGHTS_PROPERTY_CODE;
  const isPreferenceDialogProperty = isPairingNumberProperty
    || isAirportPreferenceProperty
    || isEfficientFlyingProperty
    || isPairingCheckTimeProperty
    || isFlightLegsPerDutyProperty
    || isWorkDayPreferenceProperty
    || isPairingLengthProperty
    || isFlightNumberPreferenceProperty
    || isRedeyePreferenceProperty
    || isDeadheadFlyingProperty
    || isMonthEndCarryoverProperty
    || isTimeBetweenFlightsProperty;
  const efficientFlyingConfigQuery = useEfficientFlyingConfig(isOpen && isEfficientFlyingProperty);
  const efficientFlyingPercentile = efficientFlyingConfigQuery.data?.percentile;
  const isEfficientFlyingConfigReady = !isEfficientFlyingProperty
    || (efficientFlyingConfigQuery.isSuccess
      && isEfficientFlyingPercentileValid(efficientFlyingPercentile));
  const redeyeConfigQuery = useRedeyeConfig(isOpen && isRedeyePreferenceProperty);
  const isRedeyeConfigReady = !isRedeyePreferenceProperty || redeyeConfigQuery.data?.available === true;
  const referencePeriodCode = pairingNumberPeriodCode.trim() || undefined;
  const timeBetweenFlightsBoundsQuery = useQuery({
    queryKey: ["pairing", "time-between-flights-bounds", pairingSearchPeriod?.rosterPeriodId ?? "missing-period"],
    queryFn: () => pairingService.getTimeBetweenFlightsBounds(pairingSearchPeriod!),
    enabled: isOpen && isTimeBetweenFlightsProperty && pairingSearchPeriod !== null,
    ...workbenchQueryDefaults,
    refetchOnMount: "always",
  });
  const timeBetweenFlightsMinimumMinutes = timeBetweenFlightsBoundsQuery.data?.minimumMinutes ?? 0;
  const timeBetweenFlightsMaximumMinutes = timeBetweenFlightsBoundsQuery.data?.maximumMinutes ?? null;
  const originalTimeBetweenFlightsMinutes = property.bid.type === "duration"
    ? parseDurationMinutes(property.bid.value)
    : null;
  const draftTimeBetweenFlightsMinutes = draft.bid.type === "duration"
    ? parseDurationMinutes(draft.bid.value)
    : null;
  const isUnchangedExistingTimeBetweenFlights = isTimeBetweenFlightsProperty
    && !requireExplicitSelections
    && originalTimeBetweenFlightsMinutes !== null
    && originalTimeBetweenFlightsMinutes === draftTimeBetweenFlightsMinutes;
  const showCreditPrioritySection = isPairingCreditPriorityProperty(draft.propertyCode)
    && canUsePairingCreditPriority(draft.bid);
  const selectedCreditPriority = canUsePairingCreditPriority(draft.bid) ? draft.bid.creditPriority ?? null : null;
  const occurrencePeriodCode = referencePeriodCode ?? "";
  const referenceOptionsQuery = useQuery({
    queryKey: ["pairing", "reference-options"],
    queryFn: () => pairingService.getReferenceOptions(),
    enabled: isOpen,
    ...workbenchQueryDefaults,
  });
  const isAirportProperty = AIRPORT_MULTI_SELECT_PROPERTY_CODES.has(draft.propertyCode);
  const airportOptionGroup = draft.propertyCode === WORK_START_STATION_PROPERTY_CODE ? "work-start" : "landing-layover";
  const airportOptionsQuery = useQuery({
    queryKey: ["pairing", "airport-options", pairingSearchPeriod?.rosterPeriodId ?? "missing-period"],
    queryFn: () => pairingService.getAirportOptions(pairingSearchPeriod!),
    enabled: isOpen && isAirportProperty && pairingSearchPeriod !== null,
    ...workbenchQueryDefaults,
  });
  const pairingNumberAutocomplete = getPairingNumberAutocompleteConfig(draft.propertyCode, {
    placeholder: t("pairing.autocomplete.pairingNumberPlaceholder"),
    emptyLabel: t("pairing.autocomplete.pairingNumberEmpty"),
    errorLabel: t("pairing.autocomplete.pairingNumberError"),
    loadingLabel: t("pairing.autocomplete.pairingNumberLoading"),
  }, pairingSearchPeriod);
  const referenceAutocomplete = buildPairingReferenceAutocompleteConfig({
    propertyCode: draft.propertyCode,
    options: referenceOptionsQuery.data,
    placeholder: t("pairing.autocomplete.referencePlaceholder"),
    emptyLabel: t("pairing.autocomplete.referenceEmpty"),
    errorLabel: t("pairing.autocomplete.referenceError"),
    loadingLabel: t("pairing.autocomplete.referenceLoading"),
  });
  const crewIdAutocomplete = getCrewIdAutocompleteConfig(draft.propertyCode, {
    placeholder: t("pairing.autocomplete.crewIdPlaceholder"),
    emptyLabel: t("pairing.autocomplete.crewIdEmpty"),
    errorLabel: t("pairing.autocomplete.crewIdError"),
    loadingLabel: t("pairing.autocomplete.crewIdLoading"),
  });
  const flightNumberAutocomplete = getFlightNumberAutocompleteConfig(draft.propertyCode, {
    placeholder: t("pairing.autocomplete.flightNumberPlaceholder"),
    emptyLabel: t("pairing.autocomplete.flightNumberEmpty"),
    errorLabel: t("pairing.autocomplete.flightNumberError"),
    loadingLabel: t("pairing.autocomplete.flightNumberLoading"),
  });
  const tagListAutocomplete = pairingNumberAutocomplete ?? crewIdAutocomplete ?? flightNumberAutocomplete ?? referenceAutocomplete;
  const isCurrentBidComplete = isPairingNumberProperty
    ? isPairingPreferenceValid
    : isAirportPreferenceProperty
      ? isAirportPreferenceValid
      : isEfficientFlyingProperty
        ? isEfficientFlyingValid && isEfficientFlyingConfigReady
      : isPairingCheckTimeProperty
        ? isPairingCheckTimeValid
        : isFlightLegsPerDutyProperty
          ? isFlightLegsValueValid
          : isWorkDayPreferenceProperty
            ? isWorkDayPreferenceValid
            : isPairingLengthProperty
              ? isPairingLengthValueValid
              : isFlightNumberPreferenceProperty
                ? isFlightNumberPreferenceValid
                  : isRedeyePreferenceProperty
                    ? isRedeyePreferenceValid && isRedeyeConfigReady
                    : isDeadheadFlyingProperty
                      ? isDeadheadFlyingValid
                      : isMonthEndCarryoverProperty
                        ? isMonthEndCarryoverValid
                        : isTimeBetweenFlightsProperty
                          ? timeBetweenFlightsBoundsQuery.data !== undefined
                            && (isTimeBetweenFlightsValid || isUnchangedExistingTimeBetweenFlights)
                          : isPairingBidComplete(draft.bid);
  const isActionComplete = actionOptions.length === 0
    || (draft.action !== null && actionOptions.includes(draft.action));
  const isQuantifierComplete = quantifierOptions.length <= 1
    || (draft.quantifier !== null && quantifierOptions.includes(draft.quantifier));
  const isBidOperatorComplete = (isPairingNumberProperty || isPairingLengthProperty || isFlightNumberPreferenceProperty || isRedeyePreferenceProperty || isDeadheadFlyingProperty)
    || operatorOptions.length === 0
    || selectedBidOperator !== null;
  const isConditionComplete = isActionComplete
    && isQuantifierComplete
    && isBidOperatorComplete
    && isCurrentBidComplete;
  const containsExplicitFavoriteDate = containsExplicitCalendarDate(
    draft.bid,
    pbsFavoriteDateSemanticContexts.generic,
  );
  const canConfirm = (!requireTierSelection || draft.tiers.some((tier) => tier.active))
    && isConditionComplete
    && (!confirmSavesFavorite || !containsExplicitFavoriteDate);
  const canSaveFavorite = isConditionComplete && !containsExplicitFavoriteDate;
  const defaultDialogTitle = isPairingNumberProperty
    ? "Configure Pairing Preference"
      : isAirportPreferenceProperty
        ? "Configure Airport Preference"
        : isEfficientFlyingProperty
          ? "Configure Efficient Flying First"
      : isPairingCheckTimeProperty
        ? "Configure Check-In / Check-Out Time"
        : isFlightLegsPerDutyProperty
          ? "Configure Flight Legs per Duty"
          : isWorkDayPreferenceProperty
            ? "Configure Work Day Preference"
            : isPairingLengthProperty
              ? "Configure Pairing Length"
              : isFlightNumberPreferenceProperty
                ? "Configure Flight Number Preference"
                : isRedeyePreferenceProperty
                  ? "Configure Redeye Preference"
                  : isDeadheadFlyingProperty
                    ? "Configure Deadhead Flying"
                    : isMonthEndCarryoverProperty
                      ? "Configure Month-End Carryover"
                      : isTimeBetweenFlightsProperty
                        ? "Configure Time Between Flights"
                        : t("pairing.dialog.configureTitle");

  if (!isOpen) {
    return null;
  }

  const updateDraft = (patch: Partial<PairingAvailableProperty>) => {
    setDraft((current) => ({
      ...current,
      ...patch,
    }));
  };

  const handleBidChange = (bid: PairingBidValue) => {
    const nextBid = preservePairingBidCreditPriority(draft.propertyCode, draft.bid, bid);

    updateDraft({ bid: nextBid });

  };
  const handleModeChange = (action: PairingBidAction) => updateDraft({ action });
  const handleQuantifierChange = (quantifier: PairingBidQuantifier) => updateDraft({ quantifier });
  const handleBidOperatorChange = (operator: PairingBidOperator) => {
    setSelectedBidOperator(operator);
  };
  const handleCreditPriorityToggle = (creditPriority: PairingCreditPriority) => {
    setDraft((current) => ({
      ...current,
      bid: setPairingBidCreditPriority(
        current.bid,
        canUsePairingCreditPriority(current.bid) && current.bid.creditPriority === creditPriority
          ? null
          : creditPriority,
      ),
    }));
  };
  const handleTierToggle = (tierKey: string) => {
    setDraft((current) => ({
      ...current,
      tiers: isPreferenceDialogProperty
        ? togglePreferenceTier(current.tiers, tierKey)
        : current.tiers.map((tier) =>
          tier.key !== tierKey
            ? tier
            : tier.active && current.tiers.filter((item) => item.active).length === 1
              ? tier
              : { ...tier, active: !tier.active },
        ),
    }));
  };

  const handleConfirm = () => {
    if (!canConfirm) {
      return;
    }

    onConfirm(buildConfirmDraft());
  };

  const handleSaveFavorite = () => {
    if (!onSaveFavorite || !canSaveFavorite) {
      return;
    }

    onSaveFavorite(buildConfirmDraft());
  };

  const buildConfirmDraft = () => {
    const nextDraft = clonePairingConfigPropertyDraft(draft);

    if (!isPairingNumberProperty) {
      return nextDraft;
    }

    nextDraft.pairingNumber = extractPairingNumberChoicesFromBid(nextDraft.bid)[0]?.pairingNumber ?? "";

    return nextDraft;
  };

  if (!isOpen) {
    return null;
  }

  return (
    <PbsDialogFrame
      ariaLabel={dialogAriaLabel ?? `Configure ${draft.name}`}
      bodyClassName="mt-5"
      closeDisabled={isPending || isFavoritePending}
      footerClassName="mt-6"
      panelClassName={isPairingNumberProperty
        ? "w-[min(1120px,calc(100vw-32px))]"
        : isPreferenceDialogProperty
          ? "w-[min(680px,calc(100vw-32px))]"
          : "w-[min(760px,calc(100vw-32px))]"}
      header={(
        <div className="flex items-center">
          <div>
            <p className="m-0 text-base font-bold leading-5 text-[#282c3b]">
              {dialogTitle ?? defaultDialogTitle}
            </p>
            {dialogSubtitle || !isPreferenceDialogProperty ? (
              <p className="m-0 mt-1 text-sm font-medium leading-5 text-[#6f7485]">
                {dialogSubtitle ?? draft.name}
              </p>
            ) : null}
          </div>
          <button
            aria-label={t("pairing.dialog.closeAction", { propertyName: draft.name })}
            className="ml-auto inline-flex h-6 w-6 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-[#6f7485] hover:text-[#6866cc] focus-visible:text-[#6866cc] focus-visible:outline-none disabled:cursor-default disabled:opacity-45"
            disabled={isPending || isFavoritePending}
            type="button"
            onClick={onCancel}
          >
            <XMarkIcon className="h-4 w-4 stroke-[1.8]" />
          </button>
        </div>
      )}
      footer={(
        <PairingPropertyDialogFooter
          canConfirm={canConfirm}
          canSaveFavorite={canSaveFavorite}
          confirmLabel={confirmLabel}
          confirmPendingLabel={confirmPendingLabel}
          favoriteButtonLabel={favoriteButtonLabel}
          isFavoritePending={isFavoritePending}
          isPending={isPending}
          showSaveFavorite={Boolean(onSaveFavorite)}
          onCancel={onCancel}
          onConfirm={handleConfirm}
          onSaveFavorite={handleSaveFavorite}
        />
      )}
      onClose={onCancel}
    >
          <div className={isPreferenceDialogProperty ? "space-y-5" : "grid gap-4"}>
            {hideTiers ? null : <div>
              <TierSelectionTitle required={requireTierSelection} />
              <div className={isPreferenceDialogProperty ? "mt-3" : "mt-2"}>
                <TierToggleGroup
                  getAriaLabel={(option) => `${t("pairing.dialog.toggleTier", { tier: option.label })} ${draft.name}`}
                  options={draft.tiers}
                  readonly={isPending || isFavoritePending}
                  width="100%"
                  onToggle={handleTierToggle}
                />
              </div>
            </div>}

            {isEfficientFlyingProperty
              || isFlightLegsPerDutyProperty
              || isWorkDayPreferenceProperty
              || isPairingLengthProperty
              || isFlightNumberPreferenceProperty
              || isRedeyePreferenceProperty
              || isDeadheadFlyingProperty
              || isMonthEndCarryoverProperty
              || isTimeBetweenFlightsProperty ? null : isPreferenceDialogProperty ? (
              <PairingPreferenceActionControl
                disabled={isPending || isFavoritePending}
                options={actionOptions}
                selectedValue={draft.action}
                onSelect={handleModeChange}
              />
            ) : (
              <PairingPropertyChoiceGroup
                disabled={isPending || isFavoritePending}
                getLabel={(action) => action === "award" ? t("pairing.dialog.award") : t("pairing.dialog.avoid")}
                label={t("pairing.dialog.modeLabel")}
                options={actionOptions}
                selectedValue={draft.action}
                onSelect={handleModeChange}
              />
            )}

            {!isWorkDayPreferenceProperty
              && !isFlightLegsPerDutyProperty
              && !isTimeBetweenFlightsProperty
              && quantifierOptions.length > 1 ? (
              <PairingPropertyChoiceGroup
                disabled={isPending || isFavoritePending}
                getLabel={(quantifier) => quantifier === "any" ? t("pairing.dialog.any") : t("pairing.dialog.every")}
                label={t("pairing.dialog.quantifierLabel")}
                options={quantifierOptions}
                selectedValue={draft.quantifier}
                onSelect={handleQuantifierChange}
              />
            ) : null}

            {isPairingNumberProperty ? (
              <PairingPreferenceEditor
                ariaLabel={draft.name}
                disabled={isPending || isFavoritePending}
                period={pairingSearchPeriod!}
                periodCode={occurrencePeriodCode}
                periodEndDate={periodEndDate}
                periodStartDate={periodStartDate}
                value={draft.bid}
                onChange={handleBidChange}
                onValidityChange={setIsPairingPreferenceValid}
              />
            ) : isAirportPreferenceProperty ? (
              <AirportPreferenceEditor
                ariaLabel={draft.name}
                disableEventDateScope={shouldHideEventDateScope}
                disabled={isPending || isFavoritePending}
                options={airportOptionsQuery.data}
                periodCode={pairingNumberPeriodCode}
                periodEndDate={periodEndDate}
                periodStartDate={periodStartDate}
                value={draft.bid}
                onChange={handleBidChange}
                onValidityChange={setIsAirportPreferenceValid}
              />
            ) : isEfficientFlyingProperty ? (
              <EfficientFlyingEditor
                configStatus={efficientFlyingConfigQuery.isPending
                  ? "loading"
                  : isEfficientFlyingConfigReady ? "ready" : "unavailable"}
                disabled={isPending || isFavoritePending || !isEfficientFlyingConfigReady}
                percentile={isEfficientFlyingConfigReady ? efficientFlyingPercentile : undefined}
                value={draft.bid}
                onChange={handleBidChange}
                onValidityChange={setIsEfficientFlyingValid}
              />
            ) : isPairingCheckTimeProperty ? (
              <PairingCheckTimeEditor
                ariaLabel={draft.name}
                disableEventDateScope={shouldHideEventDateScope}
                disabled={isPending || isFavoritePending}
                periodCode={pairingNumberPeriodCode}
                periodEndDate={periodEndDate}
                periodStartDate={periodStartDate}
                value={draft.bid}
                onChange={handleBidChange}
                onValidityChange={setIsPairingCheckTimeValid}
              />
            ) : isFlightLegsPerDutyProperty ? (
              <FlightLegsPerDutyEditor
                action={draft.action}
                actionOptions={actionOptions}
                ariaLabel={draft.name}
                disableEventDateScope={shouldHideEventDateScope}
                disabled={isPending || isFavoritePending}
                isNew={requireExplicitSelections}
                numericBounds={flightLegsNumericBounds}
                operator={selectedBidOperator}
                periodCode={pairingNumberPeriodCode}
                periodEndDate={periodEndDate}
                periodStartDate={periodStartDate}
                quantifier={draft.quantifier}
                quantifierOptions={quantifierOptions}
                value={draft.bid}
                onActionChange={handleModeChange}
                onChange={handleBidChange}
                onOperatorChange={handleBidOperatorChange}
                onQuantifierChange={handleQuantifierChange}
                onValidityChange={setIsFlightLegsValueValid}
              />
            ) : isPairingLengthProperty ? (
              <PairingLengthEditor
                action={draft.action}
                actionOptions={actionOptions}
                ariaLabel={draft.name}
                disableEventDateScope={shouldHideEventDateScope}
                disabled={isPending || isFavoritePending}
                periodCode={pairingNumberPeriodCode}
                periodEndDate={periodEndDate}
                periodStartDate={periodStartDate}
                value={draft.bid}
                onActionChange={handleModeChange}
                onChange={handleBidChange}
                onValidityChange={setIsPairingLengthValueValid}
              />
            ) : isFlightNumberPreferenceProperty ? (
              <FlightNumberPreferenceEditor
                action={draft.action}
                actionOptions={actionOptions}
                ariaLabel={draft.name}
                autocomplete={flightNumberAutocomplete}
                disableEventDateScope={shouldHideEventDateScope}
                disabled={isPending || isFavoritePending}
                periodCode={pairingNumberPeriodCode}
                periodEndDate={periodEndDate}
                periodStartDate={periodStartDate}
                value={draft.bid}
                onActionChange={handleModeChange}
                onChange={handleBidChange}
                onValidityChange={setIsFlightNumberPreferenceValid}
              />
            ) : isRedeyePreferenceProperty ? (
              <RedeyePreferenceEditor
                action={draft.action}
                actionOptions={actionOptions}
                ariaLabel={draft.name}
                disableEventDateScope={shouldHideEventDateScope}
                disabled={isPending || isFavoritePending}
                periodCode={pairingNumberPeriodCode}
                periodEndDate={periodEndDate}
                periodStartDate={periodStartDate}
                redeyeConfig={redeyeConfigQuery.data}
                value={draft.bid}
                onActionChange={handleModeChange}
                onChange={handleBidChange}
                onValidityChange={setIsRedeyePreferenceValid}
              />
            ) : isDeadheadFlyingProperty ? (
              <DeadheadFlyingEditor
                action={draft.action}
                actionOptions={actionOptions}
                ariaLabel={draft.name}
                disableEventDateScope={shouldHideEventDateScope}
                disabled={isPending || isFavoritePending}
                periodCode={pairingNumberPeriodCode}
                periodEndDate={periodEndDate}
                periodStartDate={periodStartDate}
                value={draft.bid}
                onActionChange={handleModeChange}
                onChange={handleBidChange}
                onValidityChange={setIsDeadheadFlyingValid}
              />
            ) : isMonthEndCarryoverProperty ? (
              <MonthEndCarryoverEditor
                action={draft.action}
                actionOptions={actionOptions}
                ariaLabel={draft.name}
                disabled={isPending || isFavoritePending}
                operator={selectedBidOperator}
                value={draft.bid}
                onActionChange={handleModeChange}
                onChange={handleBidChange}
                onOperatorChange={handleBidOperatorChange}
                onValidityChange={setIsMonthEndCarryoverValid}
              />
            ) : isTimeBetweenFlightsProperty ? (
              timeBetweenFlightsBoundsQuery.isError ? (
                <div
                  className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
                  role="alert"
                >
                  <p className="m-0 text-sm font-semibold text-destructive">
                    Unable to load the Time Between Flights limits.
                  </p>
                  <button
                    className="mt-3 h-8 cursor-pointer rounded-md border border-border bg-background px-3 text-xs font-bold text-primary hover:bg-accent"
                    type="button"
                    onClick={() => void timeBetweenFlightsBoundsQuery.refetch()}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <TimeBetweenFlightsEditor
                  action={draft.action}
                  actionOptions={actionOptions}
                  ariaLabel={draft.name}
                  disabled={isPending || isFavoritePending || timeBetweenFlightsBoundsQuery.data === undefined}
                  maximumMinutes={timeBetweenFlightsMaximumMinutes}
                  minimumMinutes={timeBetweenFlightsMinimumMinutes}
                  operator={selectedBidOperator}
                  quantifier={draft.quantifier}
                  quantifierOptions={quantifierOptions}
                  value={draft.bid}
                  onActionChange={handleModeChange}
                  onChange={handleBidChange}
                  onOperatorChange={handleBidOperatorChange}
                  onQuantifierChange={handleQuantifierChange}
                  onValidityChange={setIsTimeBetweenFlightsValid}
                />
              )
            ) : isWorkDayPreferenceProperty ? (
              <WorkDayPreferenceEditor
                ariaLabel={draft.name}
                disableEventDateScope={shouldHideEventDateScope}
                disabled={isPending || isFavoritePending}
                periodCode={pairingNumberPeriodCode}
                periodEndDate={periodEndDate}
                periodStartDate={periodStartDate}
                value={draft.bid}
                onChange={handleBidChange}
                onValidityChange={setIsWorkDayPreferenceValid}
              />
            ) : (
              <div>
                <div className="flex items-center gap-1">
                  <p className="m-0 text-xs font-bold leading-4 text-[#8d93a5]">{t("pairing.dialog.bidLabel")}</p>
                  {isAirportProperty ? <AirportOptionsHelp /> : null}
                </div>
                <div className="mt-2">
                  <PairingBidControl
                    airportOptionGroup={airportOptionGroup}
                    airportOptions={isAirportProperty ? airportOptionsQuery.data : undefined}
                    ariaLabel={`${t("pairing.dialog.bidLabel")} ${draft.name}`}
                    bid={draft.bid}
                    operatorPlaceholder={t("pairing.dialog.emptyValue")}
                    operatorOptions={operatorOptions}
                    operatorValue={operatorOptions.length > 0 ? selectedBidOperator : undefined}
                    selectPlaceholder={t("pairing.dialog.emptyValue")}
                    tagListAutocomplete={tagListAutocomplete}
                    tagListPlaceholder={t("pairing.autocomplete.tagListPlaceholder")}
                    onChange={handleBidChange}
                    onOperatorChange={handleBidOperatorChange}
                  />
                </div>
              </div>
            )}

            {showCreditPrioritySection ? (
              <PairingPropertyChoiceGroup
                disabled={isPending || isFavoritePending}
                getLabel={(creditPriority) => creditPriority === "higher"
                  ? t("pairing.dialog.creditPriorityHigher")
                  : t("pairing.dialog.creditPriorityLower")}
                label={t("pairing.dialog.creditPriorityLabel")}
                options={["higher", "lower"] as const}
                selectedValue={selectedCreditPriority}
                onSelect={handleCreditPriorityToggle}
              />
            ) : null}

          </div>
    </PbsDialogFrame>
  );
};
