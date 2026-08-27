import { useEffect, useMemo } from "react";
import {
  PairingPreferencePicker,
  type PairingPreferenceSelectionItem,
} from "@/features/pairing/components/pairing-preference-picker";
import { buildPairingPreferenceBid } from "@/features/pairing/pairing-number-occurrences";
import type { PairingBidValue, PairingPreferenceBid } from "@/features/pairing/types";
import type { PairingSearchPeriodReference } from "@/shared/services/pairing-service";
import { PreferenceConditionSection } from "@/shared/components/preferences";

type PairingPreferenceEditorProps = {
  ariaLabel: string;
  disabled?: boolean;
  period: PairingSearchPeriodReference;
  periodCode: string;
  periodEndDate: string;
  periodStartDate: string;
  value: PairingBidValue;
  onChange: (value: PairingBidValue) => void;
  onValidityChange: (isValid: boolean) => void;
};

const getInitialPairingPreferenceBid = (value: PairingBidValue): PairingPreferenceBid =>
  value.type === "pairing-preference"
    ? value
    : {
        type: "pairing-preference",
        pairingIds: [],
        pairingLabels: [],
      };

export const isPairingPreferenceBidValueValid = (value: PairingBidValue): boolean =>
  value.type === "pairing-preference" && value.pairingIds.length > 0;

export const PairingPreferenceEditor = ({
  disabled = false,
  period,
  periodCode,
  periodEndDate,
  periodStartDate,
  value,
  onChange,
  onValidityChange,
}: PairingPreferenceEditorProps) => {
  const bid = getInitialPairingPreferenceBid(value);
  const selectedPairings = useMemo(() => new Map<string, PairingPreferenceSelectionItem>(
    bid.pairingIds.map((pairingId, index) => [
      pairingId,
      { pairingNumber: bid.pairingLabels?.[index] || `Pairing ${pairingId}` },
    ]),
  ), [bid.pairingIds, bid.pairingLabels]);
  const isValid = isPairingPreferenceBidValueValid(bid);

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  return (
    <section className="space-y-3.5">
      <PreferenceConditionSection required title="PAIRINGS">
        <PairingPreferencePicker
          disabled={disabled}
          period={period}
          periodCode={periodCode}
          periodEndDate={periodEndDate}
          periodStartDate={periodStartDate}
          selected={selectedPairings}
          onSelectionChange={(nextSelected) => {
            const nextEntries = Array.from(nextSelected.entries());

            onChange(buildPairingPreferenceBid({
              pairingIds: nextEntries.map(([pairingId]) => pairingId),
              pairingLabels: nextEntries.map(([, item]) => item.pairingNumber),
            }));
          }}
        />
      </PreferenceConditionSection>
    </section>
  );
};
