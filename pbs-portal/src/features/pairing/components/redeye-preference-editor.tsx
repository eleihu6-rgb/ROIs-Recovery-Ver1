import { useEffect, useMemo } from "react";

import { formatPbsRedeyeDefinition } from "../../../../../packages/contracts/pbs-bid-definitions.js";
import type { PbsRedeyeDefinition } from "../../../../../packages/contracts/pbs-bid-definitions.js";
import type {
  PairingBidAction,
  PairingBidValue,
  RedeyePreferenceBid,
  RedeyePreferenceDateScope,
} from "@/features/pairing/types";
import {
  AwardAvoidSegmentedControl,
  OptionalEventDateScopeEditor,
  PreferenceConditionSection,
} from "@/shared/components/preferences";

type RedeyePreferenceEditorProps = {
  action: PairingBidAction | null;
  actionOptions: readonly PairingBidAction[];
  ariaLabel: string;
  disableEventDateScope?: boolean;
  disabled?: boolean;
  periodCode: string;
  periodEndDate?: string;
  periodStartDate?: string;
  redeyeConfig?: PbsRedeyeDefinition;
  value: PairingBidValue;
  onActionChange: (action: PairingBidAction) => void;
  onChange: (value: RedeyePreferenceBid) => void;
  onValidityChange: (isValid: boolean) => void;
};

const EMPTY_REDEYE_PREFERENCE_BID: RedeyePreferenceBid = {
  type: "redeye-preference",
  dateScope: null,
};

const isRedeyePreferenceBid = (value: PairingBidValue): value is RedeyePreferenceBid =>
  value.type === "redeye-preference";

export const toRedeyePreferenceBid = (value: PairingBidValue): RedeyePreferenceBid =>
  isRedeyePreferenceBid(value)
    ? {
        ...EMPTY_REDEYE_PREFERENCE_BID,
        ...value,
        dateScope: value.dateScope?.mode === "specific_dates"
          ? { ...value.dateScope, dates: [...value.dateScope.dates] }
          : value.dateScope ? { ...value.dateScope } : null,
      }
    : { ...EMPTY_REDEYE_PREFERENCE_BID };

const isDateScopeValid = (dateScope: RedeyePreferenceDateScope | null) =>
  dateScope === null
  || (dateScope.mode === "specific_dates"
    ? dateScope.dates.length > 0
      && dateScope.dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    : /^\d{4}-\d{2}-\d{2}$/.test(dateScope.from)
      && /^\d{4}-\d{2}-\d{2}$/.test(dateScope.to)
      && dateScope.from <= dateScope.to);

export const isRedeyePreferenceBidValueValid = (value: PairingBidValue) =>
  isRedeyePreferenceBid(value)
  && isDateScopeValid(toRedeyePreferenceBid(value).dateScope ?? null);

export const RedeyePreferenceEditor = ({
  action,
  actionOptions,
  ariaLabel,
  disableEventDateScope = false,
  disabled = false,
  periodCode,
  periodEndDate = "",
  periodStartDate = "",
  redeyeConfig,
  value,
  onActionChange,
  onChange,
  onValidityChange,
}: RedeyePreferenceEditorProps) => {
  const bid = useMemo(() => toRedeyePreferenceBid(value), [value]);
  const isValid = redeyeConfig?.available === true && isDateScopeValid(bid.dateScope ?? null);

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  const emitChange = (nextDateScope: RedeyePreferenceDateScope | null) => {
    onChange({
      type: "redeye-preference",
      dateScope: nextDateScope,
    });
  };

  return (
    <section className="space-y-3.5">
      <PreferenceConditionSection title="PREFERENCE">
        <AwardAvoidSegmentedControl
          disabled={disabled}
          options={actionOptions}
          value={action}
          onChange={onActionChange}
        />
      </PreferenceConditionSection>

      <PreferenceConditionSection title="REDEYE">
        <div
          aria-label={`${ariaLabel} redeye definition`}
          className="flex min-h-8 items-center gap-2 text-sm font-semibold text-[#34394a]"
          role="note"
        >
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#706cd5]" />
          <span>{formatPbsRedeyeDefinition(redeyeConfig)}</span>
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
          onChange={emitChange}
        />
      ) : null}
    </section>
  );
};
