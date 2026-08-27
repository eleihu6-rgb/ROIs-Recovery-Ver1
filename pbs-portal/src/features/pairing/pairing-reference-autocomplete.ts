import type { PbsPairingReferenceOptionsResponse } from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PairingBidAutocompleteConfig, PairingBidAutocompleteOption } from "@/features/pairing/types";

const AIRPORT_PROPERTY_CODES = new Set([101, 104, 123, 165, 168]);
const CITY_PROPERTY_CODES = new Set([150, 151, 152, 155, 156]);
const MAX_REFERENCE_OPTIONS = 20;

const filterOptions = (
  options: PairingBidAutocompleteOption[],
  query: string,
) => {
  const normalizedQuery = query.trim().toUpperCase();

  if (normalizedQuery.length === 0) {
    return [];
  }

  return options
    .filter((option) =>
      option.value.includes(normalizedQuery)
      || option.label.toUpperCase().includes(normalizedQuery))
    .slice(0, MAX_REFERENCE_OPTIONS);
};

export const buildPairingReferenceAutocompleteConfig = ({
  emptyLabel,
  errorLabel,
  loadingLabel,
  options,
  placeholder,
  propertyCode,
}: {
  emptyLabel: string;
  errorLabel: string;
  loadingLabel: string;
  options?: PbsPairingReferenceOptionsResponse;
  placeholder: string;
  propertyCode: number;
}): PairingBidAutocompleteConfig | undefined => {
  if (AIRPORT_PROPERTY_CODES.has(propertyCode)) {
    const airportOptions = options?.airports.map((airport) => ({
      value: airport.code,
      label: airport.name ? `${airport.name} · ${airport.city}` : airport.city,
    })) ?? [];

    return {
      queryKey: ["pairing-reference-options", "airports", propertyCode, airportOptions.length],
      placeholder,
      emptyLabel,
      errorLabel,
      loadingLabel,
      minQueryLength: 1,
      debounceMs: 120,
      search: async (query) => filterOptions(airportOptions, query),
    };
  }

  if (CITY_PROPERTY_CODES.has(propertyCode)) {
    const cityOptions = options?.cities.map((city) => ({
      value: city.code,
      label: city.code,
    })) ?? [];

    return {
      queryKey: ["pairing-reference-options", "cities", propertyCode, cityOptions.length],
      placeholder,
      emptyLabel,
      errorLabel,
      loadingLabel,
      minQueryLength: 1,
      debounceMs: 120,
      search: async (query) => filterOptions(cityOptions, query),
    };
  }

  return undefined;
};
