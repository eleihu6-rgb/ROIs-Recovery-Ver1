import type { PbsPairingOccurrence } from "../../../../../packages/contracts/pbs-search-pairings.js";
import type { PairingSearchPeriodReference } from "@/shared/services/pairing-service";
import type { ScheduleCalendarActionAnchor } from "@/shared/components/schedule/schedule-event-calendar";
import type { ScheduleCalendarEvent } from "@/shared/components/schedule/types";
import type { PairingPageData, PairingSearchResult } from "@/features/pairing/types";
import type { buildPairingDetailRows } from "@/features/dashboard/pairing-calendar-detail";

export const EMPTY_PAIRING_OCCURRENCES: PbsPairingOccurrence[] = [];
export const EMPTY_PAIRING_DETAIL_RESULTS: PairingSearchResult[] = [];

export type PendingPairingCalendarAction = {
  isoDate: string;
  selectedOccurrenceIds: string[];
  selectedTiers: string[];
  anchor: ScheduleCalendarActionAnchor;
};

export type PairingCalendarBidDetailDialogViewModel = {
  canSave: boolean;
  canEditTiers: boolean;
  detailError: string | null;
  detailRows: ReturnType<typeof buildPairingDetailRows>;
  detailResults: PairingSearchResult[];
  error: string | null;
  isDetailLoading: boolean;
  isLoading: boolean;
  isPending: boolean;
  isTierEditingDisabled: boolean;
  pairingNumber: string;
  selectedDetailRowKey: string | null;
  selectedTiers: string[];
  showEditSelector: boolean;
  tiers: string[];
  onClearTiers: () => void;
  onClose: () => void;
  onDetailRowSelect: (rowKey: string) => void;
  onSave: () => void;
  onTierToggle: (tier: string) => void;
};

export type PairingCalendarPageDataState = {
  data: PairingPageData | undefined;
  isError: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
};

export type PairingCalendarPeriodReference = PairingSearchPeriodReference | null;

export type PairingCalendarEventDialog = {
  event: ScheduleCalendarEvent;
  props: PairingCalendarBidDetailDialogViewModel;
};

export const toggleStringSelection = (values: string[], value: string): string[] => {
  const selectedSet = new Set(values);

  if (selectedSet.has(value)) {
    selectedSet.delete(value);
  } else {
    selectedSet.add(value);
  }

  return Array.from(selectedSet).sort();
};
