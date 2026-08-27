import { useMemo, useState } from "react";
import type { PbsPairingOccurrence } from "../../../../../packages/contracts/pbs-search-pairings.js";

import { TierSelectionTitle } from "@/shared/components/tiers";

type PairingCalendarBidPopoverContentProps = {
  blockedMessage?: string | null;
  blockedTiers?: Set<string>;
  disabled?: boolean;
  isError: boolean;
  isLoading: boolean;
  occurrences: PbsPairingOccurrence[];
  saveError: string | null;
  selectedOccurrenceIds: string[];
  selectedTiers: string[];
  tiers: string[];
  onClearTiers: () => void;
  onOccurrenceToggle: (occurrenceId: string) => void;
  onTierToggle: (tier: string) => void;
};

const EMPTY_TIER_SET = new Set<string>();

const formatOccurrenceDateRange = (occurrence: PbsPairingOccurrence) =>
  occurrence.startDate === occurrence.endDate
    ? occurrence.startDate
    : `${occurrence.startDate} - ${occurrence.endDate}`;

export const PairingCalendarBidPopoverContent = ({
  blockedMessage = null,
  blockedTiers = EMPTY_TIER_SET,
  disabled = false,
  isError,
  isLoading,
  occurrences,
  saveError,
  selectedOccurrenceIds,
  selectedTiers,
  tiers,
  onClearTiers,
  onOccurrenceToggle,
  onTierToggle,
}: PairingCalendarBidPopoverContentProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const selectedOccurrenceIdSet = useMemo(() => new Set(selectedOccurrenceIds), [selectedOccurrenceIds]);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredOccurrences = useMemo(
    () => normalizedSearchQuery
      ? occurrences.filter((occurrence) =>
        occurrence.pairingNumber.toLowerCase().includes(normalizedSearchQuery))
      : occurrences,
    [normalizedSearchQuery, occurrences],
  );
  const hasStatusMessage = Boolean(blockedMessage || saveError);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      <fieldset aria-label="Pairing runs" className="flex min-h-0 min-w-0 flex-1 flex-col [min-inline-size:0]">
        <legend className="text-xs font-semibold uppercase tracking-[0.04em] text-[#7f8392]">
          Pairing Numbers
        </legend>
        <input
          aria-label="Search pairing numbers"
          className="mt-2 h-[30px] w-full rounded-lg border border-[#d8dde6] px-2 text-xs font-medium text-[#40424f] outline-none placeholder:text-[#a4a8b5] focus:border-[#706cd5] disabled:cursor-not-allowed disabled:bg-[#f8f9fb] disabled:text-[#8d93a5]"
          disabled={disabled || isLoading || isError}
          placeholder="Search pairing number"
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <div
          className={`${hasStatusMessage ? "basis-[102px]" : "basis-[118px]"} mt-2 min-h-[48px] min-w-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden rounded-2xl border border-[#e4e8f1] bg-[#fbfcff] p-2`}
          data-testid="pairing-calendar-run-list"
        >
          {isLoading ? (
            <p className="px-2 py-3 text-center text-xs font-semibold text-[#6f7485]">
              Loading pairing runs...
            </p>
          ) : isError ? (
            <p className="px-2 py-3 text-center text-xs font-semibold text-[#b42318]">
              Unable to load pairing runs for this date.
            </p>
          ) : filteredOccurrences.length > 0 ? filteredOccurrences.map((occurrence) => (
            <label
              key={occurrence.occurrenceId}
              className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-[#e1e5ec] bg-white px-2 py-1.5 text-xs font-semibold text-[#40424f] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55"
            >
              <input
                checked={selectedOccurrenceIdSet.has(occurrence.occurrenceId)}
                className="h-3.5 w-3.5 shrink-0 accent-[#706cd5]"
                disabled={disabled}
                type="checkbox"
                onChange={() => onOccurrenceToggle(occurrence.occurrenceId)}
              />
              <span className="min-w-0 flex-1 truncate text-[#282c3b]" title={occurrence.pairingNumber}>
                {occurrence.pairingNumber}
              </span>
              <span
                className="ml-2 max-w-[145px] shrink-0 truncate text-right text-xs font-medium text-[#6f7485]"
                title={formatOccurrenceDateRange(occurrence)}
              >
                {formatOccurrenceDateRange(occurrence)}
              </span>
            </label>
          )) : normalizedSearchQuery ? (
            <p className="px-2 py-3 text-center text-xs font-semibold text-[#8d93a5]">
              No matching pairings found.
            </p>
          ) : (
            <p className="px-2 py-3 text-center text-xs font-semibold text-[#8d93a5]">
              No pairing runs found for this date.
            </p>
          )}
        </div>
      </fieldset>

      <fieldset aria-label="Pairing bid tiers" className="min-w-0 [min-inline-size:0]">
        <TierSelectionTitle as="legend" required />
        <div className="mt-2 grid grid-cols-4 gap-2">
          {tiers.map((tier) => {
            const tierBlocked = blockedTiers.has(tier);

            return (
              <label
                key={tier}
                className={[
                  "flex h-[28px] items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold",
                  tierBlocked || disabled
                    ? "cursor-not-allowed border-[#edf0f4] bg-[#f8f9fb] text-[#a8adba]"
                    : "cursor-pointer border-[#e1e5ec] text-[#40424f]",
                ].join(" ")}
              >
                <input
                  checked={selectedTiers.includes(tier)}
                  className="h-3.5 w-3.5 accent-[#706cd5] disabled:cursor-not-allowed"
                  disabled={disabled || tierBlocked}
                  type="checkbox"
                  onChange={() => onTierToggle(tier)}
                />
                {tier}
              </label>
            );
          })}
          <button
            className="h-[28px] cursor-pointer rounded-lg border border-dashed border-[#c8ced8] px-2 text-xs font-semibold text-[#7f8392] hover:bg-[#f8f9fb] disabled:cursor-not-allowed disabled:opacity-55"
            disabled={disabled}
            type="button"
            onClick={onClearTiers}
          >
            Clear
          </button>
        </div>
        {blockedMessage ? (
          <p className="mt-2 rounded-lg border border-[#ffe1a8] bg-[#fff8e6] px-2 py-1.5 text-xs font-semibold text-[#9a5b00]">
            {blockedMessage}
          </p>
        ) : null}
      </fieldset>

      {saveError ? (
        <p className="rounded-xl border border-[#ffd5cc] bg-[#fff8f6] px-3 py-2 text-xs font-semibold text-[#b42318]">
          {saveError}
        </p>
      ) : null}
    </div>
  );
};
