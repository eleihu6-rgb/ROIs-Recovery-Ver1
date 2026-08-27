export const pbsReserveBidRoutes = Object.freeze({
  current: "/reserve-bids/current",
  currentProperties: "/reserve-bids/current/properties",
  currentPropertyByKey: (propertyGroupKey) => `/reserve-bids/current/properties/${propertyGroupKey}`,
  currentCoverage: "/reserve-bids/current/coverage",
});

export const pbsReserveLegacyPropertyCodes = Object.freeze({
  shortCallType: 301,
  reserveDayOn: 302,
});

export const pbsReserveAaPropertyCodes = Object.freeze({
  preferOff: 311,
});

export const pbsReserveStandingPropertyCodes = Object.freeze({
  reserveDayOfWeekOff: 312,
  reserveWorkBlockSize: 313,
  waiveCarryOverToDaysOff: 314,
});

export const pbsReserveShortCallTypes = Object.freeze([
  "CRAM",
  "CRPM",
  "PRAM",
  "PRMM",
  "PRPM",
  "RESA",
  "RESB",
]);

export const pbsReserveDateScopeModes = Object.freeze([
  "whole_month",
  "first_half",
  "second_half",
  "date_range",
  "specific_dates",
]);

export const pbsReserveLegacyPropertyCatalog = Object.freeze([
  Object.freeze({
    propertyCode: pbsReserveLegacyPropertyCodes.shortCallType,
    name: "Reserve Preference",
    defaultBid: Object.freeze({
      type: "reserve-call-type-date-scope",
      callType: "PRAM",
      options: pbsReserveShortCallTypes,
      dateScope: Object.freeze({ mode: "whole_month" }),
    }),
  }),
  Object.freeze({
    propertyCode: pbsReserveLegacyPropertyCodes.reserveDayOn,
    name: "Reserve Day On",
    defaultBid: Object.freeze({
      type: "tag-list",
      values: Object.freeze([]),
      suggestions: Object.freeze([]),
    }),
  }),
]);

export const pbsReserveAaPropertyCatalog = Object.freeze([
  Object.freeze({
    propertyCode: pbsReserveAaPropertyCodes.preferOff,
    name: "Reserve Prefer Off",
    defaultBid: Object.freeze({
      type: "tag-list",
      values: Object.freeze([]),
      suggestions: Object.freeze([]),
    }),
  }),
]);

export const pbsSupportedReservePropertyCatalog = Object.freeze([
  pbsReserveLegacyPropertyCatalog[0],
]);

export const pbsReservePropertyRegistry = Object.freeze([
  ...pbsReserveLegacyPropertyCatalog,
  ...pbsReserveAaPropertyCatalog,
  Object.freeze({
    propertyCode: pbsReserveStandingPropertyCodes.reserveDayOfWeekOff,
    name: "Reserve Day of Week Off",
    defaultBid: Object.freeze({
      type: "date-or-dow-list",
      dates: Object.freeze([]),
      daysOfWeek: Object.freeze(["SAT"]),
    }),
  }),
  Object.freeze({
    propertyCode: pbsReserveStandingPropertyCodes.reserveWorkBlockSize,
    name: "Reserve Work Block Size",
    defaultBid: Object.freeze({
      type: "stepper-range",
      from: 3,
      to: 5,
      min: 3,
      max: 6,
    }),
  }),
  Object.freeze({
    propertyCode: pbsReserveStandingPropertyCodes.waiveCarryOverToDaysOff,
    name: "Waive to Allow Carry over to be Days Off",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
]);
