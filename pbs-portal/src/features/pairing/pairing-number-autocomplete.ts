import type { PairingBidAutocompleteConfig } from "@/features/pairing/types";
import { pairingService } from "@/shared/services/pairing-service";
import type { PairingSearchPeriodReference } from "@/shared/services/pairing-service";
import { PAIRING_NUMBER_PROPERTY_CODE } from "@/features/pairing/pairing-number-occurrences";

export const getPairingNumberAutocompleteConfig = (
  propertyCode: number,
  labels: {
    emptyLabel: string;
    errorLabel: string;
    loadingLabel: string;
    placeholder: string;
  } = {
    placeholder: "Search Pairing Number",
    emptyLabel: "No matching Pairing Number",
    errorLabel: "Unable to load Pairing Numbers",
    loadingLabel: "Loading Pairing Numbers...",
  },
  period: PairingSearchPeriodReference | null = null,
): PairingBidAutocompleteConfig | undefined => propertyCode === PAIRING_NUMBER_PROPERTY_CODE
  ? {
    queryKey: ["pairing-search", "pairing-ids", period?.rosterPeriodId ?? "missing-period"],
    placeholder: labels.placeholder,
    emptyLabel: labels.emptyLabel,
    errorLabel: labels.errorLabel,
    loadingLabel: labels.loadingLabel,
    minQueryLength: 1,
    debounceMs: 300,
    allowCustomTokens: false,
    search: async (query) => {
      if (!period) {
        throw new Error("A roster period is required for pairing search.");
      }
      const response = await pairingService.searchPairingIds(query, period, 20);

      return response.options;
    },
  }
  : undefined;
