import { useEffect, useMemo, useState } from "react";

import type { PbsFlightNumberSearchType } from "../../../../../packages/contracts/pbs-search-pairings.js";
import { TagListControl } from "@/features/pairing/components/pairing-bid-tag-list-control";
import type {
  FlightNumberPreferenceBid,
  FlightNumberPreferenceDateScope,
  PairingBidAction,
  PairingBidAutocompleteConfig,
  PairingBidValue,
} from "@/features/pairing/types";
import {
  OptionalEventDateScopeEditor,
  PreferenceClearableSelect,
  PreferenceConditionSection,
  PreferenceSegmentedControl,
} from "@/shared/components/preferences";

type FlightNumberPreferenceEditorProps = {
  action: PairingBidAction | null;
  actionOptions: readonly PairingBidAction[];
  ariaLabel: string;
  autocomplete?: PairingBidAutocompleteConfig;
  disableEventDateScope?: boolean;
  disabled?: boolean;
  periodCode: string;
  periodEndDate?: string;
  periodStartDate?: string;
  value: PairingBidValue;
  onActionChange: (action: PairingBidAction) => void;
  onChange: (value: FlightNumberPreferenceBid) => void;
  onValidityChange: (isValid: boolean) => void;
};

const EMPTY_FLIGHT_NUMBER_PREFERENCE_BID: FlightNumberPreferenceBid = {
  type: "flight-number-preference",
  flightNumbers: [],
  dateScope: null,
};

const FLIGHT_NUMBER_TYPE_OPTIONS: Array<{
  label: string;
  value: PbsFlightNumberSearchType;
}> = [
  { label: "Charter", value: "charter" },
  { label: "Positioning Flights - Charter Network", value: "positioning-charter-network" },
];

const ACTION_LABELS: Record<PairingBidAction, string> = {
  award: "Award",
  avoid: "Avoid",
};

const FIELD_SHELL_CLASS = "w-full max-w-xl";
const SELECT_FIELD_CLASS =
  "w-full max-w-none [&_select]:h-10 [&_select]:rounded-lg [&_select]:border-border [&_select]:focus-visible:border-ring";
const TAG_FIELD_CLASS =
  "min-h-10 !rounded-lg !border-border !py-1.5 focus-within:!border-ring";
const TAG_INPUT_CLASS = "h-7 text-sm font-semibold placeholder:text-muted-foreground";
const SEGMENTED_FIELD_CLASS =
  "max-w-none !rounded-lg [&>button]:h-10 [&>button]:min-w-0 [&>button]:rounded-md";

const isFlightNumberPreferenceBid = (value: PairingBidValue): value is FlightNumberPreferenceBid =>
  value.type === "flight-number-preference";

export const toFlightNumberPreferenceBid = (value: PairingBidValue): FlightNumberPreferenceBid =>
  isFlightNumberPreferenceBid(value)
    ? {
        ...EMPTY_FLIGHT_NUMBER_PREFERENCE_BID,
        ...value,
        flightNumbers: [...value.flightNumbers],
        dateScope: value.dateScope?.mode === "specific_dates"
          ? { ...value.dateScope, dates: [...value.dateScope.dates] }
          : value.dateScope ? { ...value.dateScope } : null,
      }
    : { ...EMPTY_FLIGHT_NUMBER_PREFERENCE_BID };

const isDateScopeValid = (dateScope: FlightNumberPreferenceDateScope | null) => {
  if (dateScope === null) {
    return true;
  }

  if (dateScope.mode === "specific_dates") {
    return dateScope.dates.length > 0
      && dateScope.dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(dateScope.from)
    && /^\d{4}-\d{2}-\d{2}$/.test(dateScope.to)
    && dateScope.from <= dateScope.to;
};

export const isFlightNumberPreferenceBidValueValid = (value: PairingBidValue) => {
  const bid = toFlightNumberPreferenceBid(value);

  return bid.flightNumbers.some((flightNumber) => flightNumber.trim().length > 0)
    && isDateScopeValid(bid.dateScope ?? null);
};

export const FlightNumberPreferenceEditor = ({
  action,
  actionOptions,
  ariaLabel,
  autocomplete,
  disableEventDateScope = false,
  disabled = false,
  periodCode,
  periodEndDate = "",
  periodStartDate = "",
  value,
  onActionChange,
  onChange,
  onValidityChange,
}: FlightNumberPreferenceEditorProps) => {
  const bid = useMemo(() => toFlightNumberPreferenceBid(value), [value]);
  const [selectedFlightNumberType, setSelectedFlightNumberType] = useState<PbsFlightNumberSearchType | null>(null);
  const flightNumberAutocomplete = useMemo(() => {
    if (!autocomplete) {
      return undefined;
    }

    return {
      ...autocomplete,
      queryKey: [
        ...autocomplete.queryKey,
        "type",
        selectedFlightNumberType ?? "all",
      ],
      search: (query: string) => autocomplete.search(
        query,
        selectedFlightNumberType ? { type: selectedFlightNumberType } : undefined,
      ),
    };
  }, [autocomplete, selectedFlightNumberType]);
  const isValid = isFlightNumberPreferenceBidValueValid(bid);

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  const emitChange = (
    nextFlightNumbers: string[],
    nextDateScope: FlightNumberPreferenceDateScope | null,
  ) => {
    onChange({
      type: "flight-number-preference",
      flightNumbers: Array.from(new Set(
        nextFlightNumbers.map((flightNumber) => flightNumber.trim().toUpperCase()).filter(Boolean),
      )),
      dateScope: nextDateScope,
    });
  };

  return (
    <section className="space-y-3.5">
      <PreferenceConditionSection title="PREFERENCE">
        <div className={FIELD_SHELL_CLASS} data-testid="flight-number-preference-field-shell">
          <PreferenceSegmentedControl
            className={SEGMENTED_FIELD_CLASS}
            disabled={disabled}
            options={actionOptions.map((option) => ({
              label: ACTION_LABELS[option],
              value: option,
            }))}
            value={action}
            onChange={onActionChange}
          />
        </div>
      </PreferenceConditionSection>

      <PreferenceConditionSection title="TYPE">
        <div className={FIELD_SHELL_CLASS} data-testid="flight-number-preference-field-shell">
          <PreferenceClearableSelect
            ariaLabel="Flight Number Preference type"
            className={SELECT_FIELD_CLASS}
            clearAriaLabel="Clear Flight Number Preference type"
            disabled={disabled}
            options={FLIGHT_NUMBER_TYPE_OPTIONS}
            placeholder="Select type..."
            value={selectedFlightNumberType}
            onChange={setSelectedFlightNumberType}
          />
        </div>
      </PreferenceConditionSection>

      <PreferenceConditionSection title="FLIGHT NUMBERS">
        <div className={FIELD_SHELL_CLASS} data-testid="flight-number-preference-field-shell">
          <TagListControl
            ariaLabel={`${ariaLabel} flight numbers`}
            autocomplete={flightNumberAutocomplete}
            bid={{ type: "tag-list", values: bid.flightNumbers }}
            disabled={disabled}
            fieldClassName={TAG_FIELD_CLASS}
            inputClassName={TAG_INPUT_CLASS}
            placeholder="Search flight numbers"
            onChange={(nextBid) => {
              if (nextBid.type === "tag-list") {
                emitChange(nextBid.values, bid.dateScope ?? null);
              }
            }}
          />
        </div>
      </PreferenceConditionSection>

      {!disableEventDateScope ? (
        <OptionalEventDateScopeEditor
          ariaLabel={ariaLabel}
          dateAriaLabel="flight date"
          disabled={disabled}
          label="LIMIT TO FLIGHT DATE"
          periodCode={periodCode}
          periodEndDate={periodEndDate}
          periodStartDate={periodStartDate}
          switchAriaLabel="LIMIT TO FLIGHT DATE"
          value={bid.dateScope ?? null}
          onChange={(nextDateScope) => emitChange(bid.flightNumbers, nextDateScope)}
        />
      ) : null}
    </section>
  );
};
