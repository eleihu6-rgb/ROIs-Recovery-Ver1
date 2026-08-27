import { useEffect, useMemo } from "react";

import type {
  DeadheadFlyingBid,
  PairingBidAction,
  PairingBidValue,
  PairingEventDateScope,
} from "@/features/pairing/types";
import {
  AwardAvoidSegmentedControl,
  OptionalEventDateScopeEditor,
  PreferenceConditionSection,
  PreferenceSegmentedControl,
} from "@/shared/components/preferences";

type DeadheadFlyingEditorProps = {
  action: PairingBidAction | null;
  actionOptions: readonly PairingBidAction[];
  ariaLabel: string;
  disableEventDateScope?: boolean;
  disabled?: boolean;
  periodCode?: string;
  periodEndDate?: string;
  periodStartDate?: string;
  value: PairingBidValue;
  onActionChange: (action: PairingBidAction) => void;
  onChange: (value: DeadheadFlyingBid) => void;
  onValidityChange: (isValid: boolean) => void;
};

const EMPTY_DEADHEAD_FLYING_BID: DeadheadFlyingBid = {
  type: "deadhead-flying",
  mode: "any-deadhead",
  dateScope: null,
};

const isDeadheadFlyingBid = (value: PairingBidValue): value is DeadheadFlyingBid =>
  value.type === "deadhead-flying"
  && (value.mode === "any-deadhead" || value.mode === "deadhead-only-duty");

const cloneDateScope = (dateScope: PairingEventDateScope | null | undefined) =>
  dateScope?.mode === "specific_dates"
    ? { ...dateScope, dates: [...dateScope.dates] }
    : dateScope ? { ...dateScope } : null;

export const toDeadheadFlyingBid = (value: PairingBidValue): DeadheadFlyingBid =>
  isDeadheadFlyingBid(value)
    ? { ...value, dateScope: cloneDateScope(value.dateScope) }
    : { ...EMPTY_DEADHEAD_FLYING_BID };

const isDateScopeValid = (dateScope: PairingEventDateScope | null) =>
  dateScope === null
  || (dateScope.mode === "specific_dates"
    ? dateScope.dates.length > 0
      && dateScope.dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    : /^\d{4}-\d{2}-\d{2}$/.test(dateScope.from)
      && /^\d{4}-\d{2}-\d{2}$/.test(dateScope.to)
      && dateScope.from <= dateScope.to);

export const isDeadheadFlyingBidValueValid = (value: PairingBidValue) =>
  isDeadheadFlyingBid(value)
  && isDateScopeValid(value.dateScope ?? null);

export const DeadheadFlyingEditor = ({
  action,
  actionOptions,
  ariaLabel,
  disableEventDateScope = false,
  disabled = false,
  periodCode = "",
  periodEndDate = "",
  periodStartDate = "",
  value,
  onActionChange,
  onChange,
  onValidityChange,
}: DeadheadFlyingEditorProps) => {
  const bid = useMemo(() => toDeadheadFlyingBid(value), [value]);
  const isValid = isDateScopeValid(bid.dateScope ?? null);

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

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

      <PreferenceConditionSection title="DEADHEAD FLYING" required>
        <PreferenceSegmentedControl
          className="max-w-xl"
          disabled={disabled}
          options={[
            { label: "Any deadhead", value: "any-deadhead" },
            { label: "Deadhead-only duty", value: "deadhead-only-duty" },
          ]}
          value={bid.mode}
          onChange={(mode) => onChange({ ...bid, mode })}
        />
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
          onChange={(dateScope) => onChange({ ...bid, dateScope })}
        />
      ) : null}
    </section>
  );
};
