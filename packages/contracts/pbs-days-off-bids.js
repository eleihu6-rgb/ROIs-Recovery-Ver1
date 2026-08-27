export const pbsDaysOffBidRoutes = Object.freeze({
  current: "/days-off-bids/current",
  currentProperties: "/days-off-bids/current/properties",
  currentPropertyByKey: (propertyGroupKey) => `/days-off-bids/current/properties/${propertyGroupKey}`,
  currentFavorites: "/days-off-bids/current/favorites",
  favoriteByCode: (propertyCode) => `/days-off-bids/current/favorites/${propertyCode}`,
  favoriteByKey: (favoriteKey) => `/days-off-bids/current/favorites/by-key/${favoriteKey}`,
});

export const pbsDaysOffAaPropertyCodes = Object.freeze({
  minimumDaysOffBetweenWorkBlocks: 211,
  maximizeWeekendDaysOff: 212,
  maximizeTotalDaysOff: 213,
  maximizeBlockOfDaysOff: 214,
  stringOfDaysOffStartingOnDate: 215,
  stringOfDaysOffEndingOnDate: 216,
  waiveMinimumDaysOff: 217,
});

export const pbsDaysOffStandingPropertyCodes = Object.freeze({
  dayOfWeekOff: 218,
});

export const pbsDaysOffAaPropertyCodeList = Object.freeze([
  pbsDaysOffAaPropertyCodes.minimumDaysOffBetweenWorkBlocks,
  pbsDaysOffAaPropertyCodes.maximizeWeekendDaysOff,
  pbsDaysOffAaPropertyCodes.maximizeTotalDaysOff,
  pbsDaysOffAaPropertyCodes.maximizeBlockOfDaysOff,
  pbsDaysOffAaPropertyCodes.stringOfDaysOffStartingOnDate,
  pbsDaysOffAaPropertyCodes.stringOfDaysOffEndingOnDate,
  pbsDaysOffAaPropertyCodes.waiveMinimumDaysOff,
]);

export const pbsDaysOffMutuallyExclusivePropertyCodes = Object.freeze([
  pbsDaysOffAaPropertyCodes.maximizeWeekendDaysOff,
  pbsDaysOffAaPropertyCodes.maximizeTotalDaysOff,
  pbsDaysOffAaPropertyCodes.maximizeBlockOfDaysOff,
  pbsDaysOffAaPropertyCodes.stringOfDaysOffStartingOnDate,
  pbsDaysOffAaPropertyCodes.stringOfDaysOffEndingOnDate,
]);

export const pbsDaysOffUniquePerTierPropertyCodes = Object.freeze([
  pbsDaysOffAaPropertyCodes.minimumDaysOffBetweenWorkBlocks,
  pbsDaysOffAaPropertyCodes.stringOfDaysOffStartingOnDate,
  pbsDaysOffAaPropertyCodes.stringOfDaysOffEndingOnDate,
]);

export const pbsDaysOffAaPropertyCatalog = Object.freeze([
  Object.freeze({
    propertyCode: pbsDaysOffAaPropertyCodes.minimumDaysOffBetweenWorkBlocks,
    name: "Minimum Days Off Between Work Blocks",
    defaultBid: Object.freeze({ type: "stepper", value: 1, min: 1, max: 12 }),
  }),
  Object.freeze({
    propertyCode: pbsDaysOffAaPropertyCodes.maximizeWeekendDaysOff,
    name: "Maximize Weekend Days Off",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
  Object.freeze({
    propertyCode: pbsDaysOffAaPropertyCodes.maximizeTotalDaysOff,
    name: "Maximize Total Days Off",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
  Object.freeze({
    propertyCode: pbsDaysOffAaPropertyCodes.maximizeBlockOfDaysOff,
    name: "Maximize Block of Days Off",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
  Object.freeze({
    propertyCode: pbsDaysOffAaPropertyCodes.stringOfDaysOffStartingOnDate,
    name: "String of Days Off Starting on Date",
    defaultBid: Object.freeze({ type: "date", value: "2026-04-01" }),
  }),
  Object.freeze({
    propertyCode: pbsDaysOffAaPropertyCodes.stringOfDaysOffEndingOnDate,
    name: "String of Days Off Ending on Date",
    defaultBid: Object.freeze({ type: "date", value: "2026-04-01" }),
  }),
  Object.freeze({
    propertyCode: pbsDaysOffAaPropertyCodes.waiveMinimumDaysOff,
    name: "Waive Minimum Days Off",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
]);

export const pbsDaysOffPropertyCatalog = Object.freeze([
  Object.freeze({
    propertyCode: 201,
    name: "Prefer Off",
    defaultBid: Object.freeze({ type: "tag-list", values: [], suggestions: [] }),
  }),
  Object.freeze({
    propertyCode: 202,
    name: "Max Consecutive Days On",
    defaultBid: Object.freeze({ type: "stepper", value: 5, min: 1, max: 14 }),
  }),
  Object.freeze({
    propertyCode: 203,
    name: "Min Consecutive Days Off",
    defaultBid: Object.freeze({ type: "stepper", value: 2, min: 1, max: 14 }),
  }),
  Object.freeze({
    propertyCode: 204,
    name: "Long Stretch Off / Compressed Flying",
    defaultBid: Object.freeze({ type: "stepper-date-range", value: 10, from: "", to: "", min: 1, max: 14 }),
  }),
  Object.freeze({
    propertyCode: 205,
    name: "Days Off / Days On Pattern",
    defaultBid: Object.freeze({ type: "days-off-on-pattern", minDaysOff: 3, minDaysOn: 3, maxDaysOn: 5, min: 1, max: 14 }),
  }),
  Object.freeze({
    propertyCode: 206,
    name: "Employee Schedule Preference",
    defaultBid: Object.freeze({
      type: "employee-schedule-preference",
      crewId: "",
      relationship: "together",
      scheduleType: "days_off",
      thresholdType: "minimum",
      days: 1,
      min: 1,
      max: 31,
    }),
  }),
]);

export const pbsSupportedDaysOffPropertyCatalog = Object.freeze([
  ...pbsDaysOffPropertyCatalog,
  ...pbsDaysOffAaPropertyCatalog,
]);

export const pbsDaysOffPropertyRegistry = Object.freeze([
  ...pbsSupportedDaysOffPropertyCatalog,
  Object.freeze({
    propertyCode: pbsDaysOffStandingPropertyCodes.dayOfWeekOff,
    name: "Day of Week Off",
    defaultBid: Object.freeze({
      type: "date-or-dow-list",
      dates: Object.freeze([]),
      daysOfWeek: Object.freeze(["SAT"]),
    }),
  }),
]);

export const pbsLegacyDaysOffPropertyCatalog = pbsDaysOffPropertyCatalog;
