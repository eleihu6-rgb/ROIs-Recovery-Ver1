import type { PairingBidAutocompleteConfig } from "@/features/pairing/types";
import { pairingService } from "@/shared/services/pairing-service";

const LEG_WITH_EMPLOYEE_NUMBER_PROPERTY_CODE = 115;

export const getCrewIdAutocompleteConfig = (
  propertyCode: number,
  labels: {
    emptyLabel: string;
    errorLabel: string;
    loadingLabel: string;
    placeholder: string;
  } = {
    placeholder: "Search Employee Number",
    emptyLabel: "No matching Employee Number",
    errorLabel: "Unable to load Employee Numbers",
    loadingLabel: "Loading Employee Numbers...",
  },
): PairingBidAutocompleteConfig | undefined => propertyCode === LEG_WITH_EMPLOYEE_NUMBER_PROPERTY_CODE
  ? {
    queryKey: ["pairing-search", "crew-ids"],
    placeholder: labels.placeholder,
    emptyLabel: labels.emptyLabel,
    errorLabel: labels.errorLabel,
    loadingLabel: labels.loadingLabel,
    minQueryLength: 1,
    debounceMs: 300,
    search: async (query) => {
      const response = await pairingService.searchCrewIds(query, 20);

      return response.options;
    },
  }
  : undefined;
