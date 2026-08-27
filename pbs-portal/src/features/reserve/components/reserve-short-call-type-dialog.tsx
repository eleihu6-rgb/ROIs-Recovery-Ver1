import { XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import type { ReserveDateScope } from "@/features/pairing/types";
import {
  isReservePreferenceValueComplete,
  ReservePreferenceEditor,
  type ReservePreferenceValue,
} from "@/features/reserve/components/reserve-preference-editor";
import type { RuleBidAvailableProperty } from "@/features/rule-bids/types";
import { PbsBidDialogFooter } from "@/shared/components/preferences/pbs-bid-dialog-footer";
import { TierSelectionTitle, TierToggleGroup } from "@/shared/components/tiers";
import { PbsDialogFrame } from "@/shared/components/ui/pbs-dialog-frame";

type ReservePreferenceDialogProps = {
  initialDateScope?: ReserveDateScope | null;
  isOpen: boolean;
  isPending: boolean;
  periodCode: string;
  periodEndDate: string;
  periodStartDate: string;
  property: RuleBidAvailableProperty;
  onCancel: () => void;
  onConfirm: (callType: string, selectedTiers: string[], dateScope: ReserveDateScope) => void;
};

const RESERVE_TIERS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7"];
const DEFAULT_TIERS: string[] = [];

const getCallTypeOptions = (property: RuleBidAvailableProperty) =>
  (property.bid.type === "select" || property.bid.type === "reserve-call-type-date-scope")
    ? property.bid.options
    : [];

const getInitialCallType = (property: RuleBidAvailableProperty, options: string[]) => {
  if (property.bid.type === "select" && options.includes(property.bid.value)) {
    return property.bid.value;
  }

  if (property.bid.type === "reserve-call-type-date-scope" && options.includes(property.bid.callType)) {
    return property.bid.callType;
  }

  return options[0] ?? "";
};

const cloneDateScope = (dateScope: ReserveDateScope): ReserveDateScope =>
  dateScope.mode === "specific_dates"
    ? { ...dateScope, dates: [...dateScope.dates] }
    : { ...dateScope };

const getInitialValue = (
  property: RuleBidAvailableProperty,
  options: string[],
  initialDateScope: ReserveDateScope | null,
): ReservePreferenceValue => ({
  type: "reserve-call-type-date-scope",
  callType: getInitialCallType(property, options),
  options,
  dateScope: cloneDateScope(initialDateScope
    ?? (property.bid.type === "reserve-call-type-date-scope"
      ? property.bid.dateScope
      : { mode: "whole_month" })),
});

const toggleTier = (tiers: string[], tier: string) => {
  const selectedSet = new Set(tiers);

  if (selectedSet.has(tier)) {
    selectedSet.delete(tier);
  } else {
    selectedSet.add(tier);
  }

  return Array.from(selectedSet).sort();
};

export const ReservePreferenceDialog = ({
  initialDateScope = null,
  isOpen,
  isPending,
  periodCode,
  periodEndDate,
  periodStartDate,
  property,
  onCancel,
  onConfirm,
}: ReservePreferenceDialogProps) => {
  const callTypeOptions = useMemo(() => getCallTypeOptions(property), [property]);
  const initialValue = useMemo(
    () => getInitialValue(property, callTypeOptions, initialDateScope),
    [callTypeOptions, initialDateScope, property],
  );
  const [value, setValue] = useState<ReservePreferenceValue>(initialValue);
  const [selectedTiers, setSelectedTiers] = useState<string[]>(DEFAULT_TIERS);
  const selectedTierSet = new Set(selectedTiers);
  const tierOptions = RESERVE_TIERS.map((tier) => ({
    key: tier.toLowerCase(),
    label: tier,
    active: selectedTierSet.has(tier),
  }));
  const canConfirm = !isPending
    && selectedTiers.length > 0
    && isReservePreferenceValueComplete(value, periodStartDate, periodEndDate);

  useEffect(() => {
    setValue(initialValue);
    setSelectedTiers(DEFAULT_TIERS);
  }, [initialValue]);

  if (!isOpen) {
    return null;
  }

  return (
    <PbsDialogFrame
      ariaLabel="Configure Reserve Preference"
      bodyClassName="mt-5"
      closeDisabled={isPending}
      footerClassName="mt-6 flex justify-end gap-2"
      panelClassName="w-[min(520px,calc(100vw-32px))]"
      header={(
        <div className="flex items-center">
          <div>
            <p className="m-0 text-base font-bold leading-5 text-[#282c3b]">Configure Reserve Preference</p>
          </div>
          <button
            aria-label="Close Reserve Preference dialog"
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
        <PbsBidDialogFooter
          canConfirm={canConfirm}
          confirmLabel="ADD BID"
          confirmPendingLabel="ADDING..."
          isPending={isPending}
          onCancel={onCancel}
          onConfirm={() => onConfirm(value.callType, selectedTiers, value.dateScope)}
        />
      )}
      onClose={onCancel}
    >
        <div className="space-y-5">
          <div>
            <TierSelectionTitle required />
            <div className="mt-3">
              <TierToggleGroup
                getAriaLabel={(option) => `Toggle ${option.label} for Reserve Preference`}
                options={tierOptions}
                readonly={isPending}
                width="100%"
                onToggle={(tierKey) => {
                  const tier = tierOptions.find((option) => option.key === tierKey)?.label;

                  if (tier) {
                    setSelectedTiers((currentTiers) => toggleTier(currentTiers, tier));
                  }
                }}
              />
            </div>
          </div>
          <ReservePreferenceEditor
            ariaLabel="Reserve Preference"
            disabled={isPending}
            periodCode={periodCode}
            periodEndDate={periodEndDate}
            periodStartDate={periodStartDate}
            value={value}
            onChange={setValue}
          />
        </div>
    </PbsDialogFrame>
  );
};
