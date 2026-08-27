import { useEffect, useMemo } from "react";

import type {
  EfficientFlyingPreferenceBid,
  PairingBidValue,
} from "@/features/pairing/types";
import {
  PreferenceConditionSection,
  PreferenceSegmentedControl,
} from "@/shared/components/preferences";

type EfficientFlyingEditorProps = {
  configStatus: "loading" | "ready" | "unavailable";
  disabled?: boolean;
  percentile?: number;
  value: PairingBidValue;
  onChange: (value: EfficientFlyingPreferenceBid) => void;
  onValidityChange: (isValid: boolean) => void;
};

const DEFAULT_EFFICIENT_FLYING_BID: EfficientFlyingPreferenceBid = {
  type: "efficient-flying-preference",
  mode: "efficient",
};

const isEfficientFlyingBid = (
  value: PairingBidValue,
): value is EfficientFlyingPreferenceBid =>
  value.type === "efficient-flying-preference"
  && (value.mode === "efficient" || value.mode === "inefficient");

export const isEfficientFlyingBidValueValid = (
  value: PairingBidValue,
): value is EfficientFlyingPreferenceBid => isEfficientFlyingBid(value);

export const EfficientFlyingEditor = ({
  configStatus,
  disabled = false,
  percentile,
  value,
  onChange,
  onValidityChange,
}: EfficientFlyingEditorProps) => {
  const bid = useMemo(
    () => isEfficientFlyingBid(value) ? { ...value } : DEFAULT_EFFICIENT_FLYING_BID,
    [value],
  );
  const isValid = isEfficientFlyingBidValueValid(value);
  const bandLabel = bid.mode === "efficient" ? "Top" : "Bottom";

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  return (
    <section className="space-y-3.5">
      <PreferenceConditionSection title="PREFERENCE">
        <PreferenceSegmentedControl
          className="max-w-xl"
          disabled={disabled}
          options={[
            {
              ariaLabel: "Efficient flying",
              label: "Efficient flying",
              value: "efficient",
            },
            {
              ariaLabel: "Inefficient flying",
              label: "Inefficient flying",
              value: "inefficient",
            },
          ]}
          value={bid.mode}
          onChange={(mode) => onChange({ ...bid, mode })}
        />
      </PreferenceConditionSection>

      <div
        aria-live="polite"
        className="rounded-xl border border-[#dfe4ee] bg-[#f8f9fc] px-3 py-2.5 text-sm font-semibold leading-5 text-[#667085]"
      >
        {configStatus === "loading" ? (
          "Loading efficient flying configuration..."
        ) : percentile === undefined ? (
          "Efficient flying configuration is unavailable."
        ) : (
          <>
            <p className="m-0">{bandLabel} {percentile}% by average daily credit</p>
            <p className="m-0 mt-1 text-xs font-medium text-[#7a8192]">
              The percentage is company-defined.
            </p>
          </>
        )}
      </div>
    </section>
  );
};
