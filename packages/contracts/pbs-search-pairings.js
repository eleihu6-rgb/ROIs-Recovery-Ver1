export const pbsSearchPairingRoutes = Object.freeze({
  preview: "/pairing-search/preview",
  currentRulesCounts: "/pairing-search/current-rules/counts",
  currentRulesTierPools: "/pairing-search/current-rules/tier-pools",
  pairingIds: "/pairing-search/pairing-ids",
  pairingNumberFilterOptions: "/pairing-search/pairing-number-filter-options",
  crewIds: "/pairing-search/crew-ids",
  flightNumbers: "/pairing-search/flight-numbers",
  pairingOccurrences: "/pairing-search/pairing-occurrences",
  pairingOccurrencesByDate: "/pairing-search/pairing-occurrences/by-date",
  pairingDetails: "/pairing-search/pairing-details",
  airportOptions: "/pairing-search/airport-options",
  timeBetweenFlightsBounds: "/pairing-search/time-between-flights-bounds",
});

export const pbsFlightNumberSearchTypes = Object.freeze([
  "charter",
  "positioning-charter-network",
  "recovery-charter-network",
]);

export const pbsUserRoutes = Object.freeze({
  crewOptions: "/pbs-users/crew-options",
});
