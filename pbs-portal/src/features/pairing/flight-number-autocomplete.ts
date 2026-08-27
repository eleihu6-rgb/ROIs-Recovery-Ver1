import type { PairingBidAutocompleteConfig } from "@/features/pairing/types";
import { pairingService } from "@/shared/services/pairing-service";

const ANY_FLIGHT_NUMBER_PROPERTY_CODE = 116;

export const getFlightNumberAutocompleteConfig = (
  propertyCode: number,
  labels: {
    emptyLabel: string;
    errorLabel: string;
    loadingLabel: string;
    placeholder: string;
  } = {
    placeholder: "Search Flight Number",
    emptyLabel: "No matching Flight Number",
    errorLabel: "Unable to load Flight Numbers",
    loadingLabel: "Loading Flight Numbers...",
  },
): PairingBidAutocompleteConfig | undefined => propertyCode === ANY_FLIGHT_NUMBER_PROPERTY_CODE
  ? {
    queryKey: ["pairing-search", "flight-numbers"],
    placeholder: labels.placeholder,
    emptyLabel: labels.emptyLabel,
    errorLabel: labels.errorLabel,
    loadingLabel: labels.loadingLabel,
    minQueryLength: 1,
    debounceMs: 300,
    allowCustomTokens: false,
    search: async (query, options) => {
      const response = await pairingService.searchFlightNumbers(query, 20, options?.type);

      return response.options;
    },
  }
  : undefined;
