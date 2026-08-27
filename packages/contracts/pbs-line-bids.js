export const pbsLineBidRoutes = Object.freeze({
  current: "/line-bids/current",
  currentProperties: "/line-bids/current/properties",
  currentPropertyByKey: (propertyGroupKey) => `/line-bids/current/properties/${propertyGroupKey}`,
  currentFavorites: "/line-bids/current/favorites",
  favoriteByKey: (favoriteKey) => `/line-bids/current/favorites/by-key/${favoriteKey}`,
  creditWindowConfig: "/line-bids/credit-window-config",
  minimumBaseLayoverConfig: "/line-bids/minimum-base-layover-config",
});

export const pbsLineLegacyPropertyCodes = Object.freeze({
  maxCreditWindow: 401,
  minCreditWindow: 402,
  clearScheduleAndStartNextBidGroup: 403,
  noSameDayPairings: 404,
  waiveNoSameDayDutyStarts: 405,
  forgetLine: 406,
  minBaseLayover: 407,
  commuterPattern: 408,
  mostFlyingInLeastDays: 409,
  reserveFlyingDatePattern: 410,
});

export const pbsLineAaPropertyCodes = Object.freeze({
  targetCreditRange: 411,
  maximizeCredit: 412,
  maximizeInternationalCredit: 413,
  workBlockSize: 414,
  preferCadenceOnDayOfWeek: 415,
  commutableWorkBlock: 416,
  pairingMixInWorkBlock: 417,
  allowDoubleUpOnDate: 418,
  allowMultiplePairings: 419,
  allowMultiplePairingsOnDate: 420,
  allowCoTerminalMixInWorkBlock: 421,
  clearBids: 422,
  waive24HoursRestInDomicile: 423,
  waiveMinimumDomicileRest: 424,
  waive30HoursIn7Days: 425,
  waiveCarryOverCredit: 426,
  reserve: 427,
});

export const pbsLineReservePropertyCodes = Object.freeze({
  shortCallType: 301,
});

export const pbsLineF8PropertyCodes = Object.freeze({
  creditWindowPreference: 429,
});

export const pbsLineCreditWindowDeltaHoursRange = Object.freeze({
  min: 1,
  max: 20,
});

export const parsePbsLineCreditWindowDeltaHours = (value) => {
  const deltaHours = typeof value === "number" ? value : Number(String(value ?? "").trim());

  return Number.isInteger(deltaHours)
    && deltaHours >= pbsLineCreditWindowDeltaHoursRange.min
    && deltaHours <= pbsLineCreditWindowDeltaHoursRange.max
    ? deltaHours
    : null;
};

export const parsePbsLineCreditWindowPreferenceBid = (value) =>
  value
    && typeof value === "object"
    && value.type === "credit-window-preference"
    && (value.direction === "more" || value.direction === "less")
    ? {
        type: "credit-window-preference",
        direction: value.direction,
      }
    : null;

export const pbsLineLegacyPropertyCodeList = Object.freeze(Object.values(pbsLineLegacyPropertyCodes));

export const pbsLineAaPropertyCodeList = Object.freeze(Object.values(pbsLineAaPropertyCodes));

export const pbsLineF8PropertyCodeList = Object.freeze(Object.values(pbsLineF8PropertyCodes));

const weekdayOptions = Object.freeze(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
const pairingMixSuggestions = Object.freeze(["1,2", "2,2", "3,1", "3,2"]);
const awardAvoidActions = Object.freeze(["award", "avoid"]);
export const pbsLineReserveCallTypes = Object.freeze([
  "CRAM",
  "CRPM",
  "PRAM",
  "PRMM",
  "PRPM",
  "RESA",
  "RESB",
]);

export const pbsLinePropertyCatalog = Object.freeze([
  Object.freeze({
    propertyCode: pbsLineLegacyPropertyCodes.maxCreditWindow,
    name: "Max Credit Window",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
  Object.freeze({
    propertyCode: pbsLineLegacyPropertyCodes.minCreditWindow,
    name: "Min Credit Window",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
  Object.freeze({
    propertyCode: pbsLineLegacyPropertyCodes.clearScheduleAndStartNextBidGroup,
    name: "Clear Schedule and Start Next Bid Group",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
  Object.freeze({
    propertyCode: pbsLineLegacyPropertyCodes.noSameDayPairings,
    name: "No Same Day Pairings",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
  Object.freeze({
    propertyCode: pbsLineLegacyPropertyCodes.waiveNoSameDayDutyStarts,
    name: "Waive No Same Day Duty Starts",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
  Object.freeze({
    propertyCode: pbsLineLegacyPropertyCodes.forgetLine,
    name: "Forget Line",
    defaultBid: Object.freeze({ type: "stepper", value: 1, min: 1, max: 999 }),
  }),
  Object.freeze({
    propertyCode: pbsLineLegacyPropertyCodes.minBaseLayover,
    name: "Minimum Base Layover",
    defaultBid: Object.freeze({ type: "minimum-base-layover", minimumDuration: "" }),
  }),
  Object.freeze({
    propertyCode: pbsLineLegacyPropertyCodes.commuterPattern,
    name: "Commuter Pattern",
    defaultBid: Object.freeze({
      type: "days-off-on-pattern",
      minDaysOff: 4,
      minDaysOn: 4,
      maxDaysOn: 5,
      dateRange: null,
      min: 1,
      max: 14,
    }),
  }),
  Object.freeze({
    propertyCode: pbsLineLegacyPropertyCodes.mostFlyingInLeastDays,
    name: "Most Flying In Least Working Days (Configured)",
    defaultBid: Object.freeze({
      type: "credit-density-preference",
      minimumTotalCredit: "75:00",
      maximumWorkingDays: 15,
      strength: "strong",
    }),
  }),
  Object.freeze({
    propertyCode: pbsLineLegacyPropertyCodes.reserveFlyingDatePattern,
    name: "Reserve / Flying Date Pattern",
    defaultBid: Object.freeze({
      type: "reserve-flying-date-pattern",
      segments: Object.freeze([
        Object.freeze({
          workType: "reserve",
          callType: "PRAM",
          dateScope: Object.freeze({ mode: "first_half" }),
        }),
        Object.freeze({
          workType: "flying",
          dateScope: Object.freeze({ mode: "second_half" }),
        }),
      ]),
      callTypeOptions: pbsLineReserveCallTypes,
      strength: "strong",
    }),
  }),
]);

export const pbsLineF8PropertyCatalog = Object.freeze([
  Object.freeze({
    propertyCode: pbsLineF8PropertyCodes.creditWindowPreference,
    name: "Credit Window Preference",
    defaultBid: Object.freeze({
      type: "credit-window-preference",
      direction: "more",
    }),
  }),
]);

export const pbsLineAaPropertyCatalog = Object.freeze([
  Object.freeze({
    propertyCode: pbsLineAaPropertyCodes.targetCreditRange,
    name: "Target Credit Range",
    defaultBid: Object.freeze({ type: "stepper-range", from: 75, to: 85, min: 40, max: 110 }),
  }),
  Object.freeze({
    propertyCode: pbsLineAaPropertyCodes.maximizeCredit,
    name: "Maximize Credit",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
  Object.freeze({
    propertyCode: pbsLineAaPropertyCodes.maximizeInternationalCredit,
    name: "Maximize International Credit",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
  Object.freeze({
    propertyCode: pbsLineAaPropertyCodes.workBlockSize,
    name: "Work Block Size",
    defaultBid: Object.freeze({ type: "stepper-range", from: 3, to: 5, min: 1, max: 12 }),
  }),
  Object.freeze({
    propertyCode: pbsLineAaPropertyCodes.preferCadenceOnDayOfWeek,
    name: "Prefer Cadence on Day-of-Week",
    defaultBid: Object.freeze({ type: "select", value: "Mon", options: weekdayOptions }),
  }),
  Object.freeze({
    propertyCode: pbsLineAaPropertyCodes.commutableWorkBlock,
    name: "Commutable Work Block",
    defaultBid: Object.freeze({ type: "time-range", from: "18:00", to: "10:00" }),
  }),
  Object.freeze({
    propertyCode: pbsLineAaPropertyCodes.pairingMixInWorkBlock,
    name: "Pairing Mix in a Work Block",
    defaultBid: Object.freeze({ type: "tag-list", values: Object.freeze(["3,1"]), suggestions: pairingMixSuggestions }),
  }),
  Object.freeze({
    propertyCode: pbsLineAaPropertyCodes.allowDoubleUpOnDate,
    name: "Allow Double-Up on Date",
    defaultBid: Object.freeze({ type: "date", value: "2026-04-01" }),
  }),
  Object.freeze({
    propertyCode: pbsLineAaPropertyCodes.allowMultiplePairings,
    name: "Allow Multiple Pairings",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
  Object.freeze({
    propertyCode: pbsLineAaPropertyCodes.allowMultiplePairingsOnDate,
    name: "Allow Multiple Pairings on Date",
    defaultBid: Object.freeze({ type: "date", value: "2026-04-01" }),
  }),
  Object.freeze({
    propertyCode: pbsLineAaPropertyCodes.allowCoTerminalMixInWorkBlock,
    name: "Allow Co-Terminal Mix in Work Block",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
  Object.freeze({
    propertyCode: pbsLineAaPropertyCodes.clearBids,
    name: "Clear Bids",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
  Object.freeze({
    propertyCode: pbsLineAaPropertyCodes.waive24HoursRestInDomicile,
    name: "Waive 24 hrs Rest in Domicile",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
  Object.freeze({
    propertyCode: pbsLineAaPropertyCodes.waiveMinimumDomicileRest,
    name: "Waive Minimum Domicile Rest",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
  Object.freeze({
    propertyCode: pbsLineAaPropertyCodes.waive30HoursIn7Days,
    name: "Waive 30 hrs in 7 Days",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
  Object.freeze({
    propertyCode: pbsLineAaPropertyCodes.waiveCarryOverCredit,
    name: "Waive Carry-Over Credit",
    defaultBid: Object.freeze({ type: "flag" }),
  }),
  Object.freeze({
    propertyCode: pbsLineAaPropertyCodes.reserve,
    name: "Reserve",
    defaultBid: Object.freeze({ type: "flag" }),
    defaultAction: "award",
    supportedActions: awardAvoidActions,
  }),
]);

export const pbsLineReservePropertyCatalog = Object.freeze([
  Object.freeze({
    propertyCode: pbsLineReservePropertyCodes.shortCallType,
    name: "Reserve Preference",
    defaultBid: Object.freeze({
      type: "reserve-call-type-date-scope",
      callType: "PRAM",
      options: pbsLineReserveCallTypes,
      dateScope: Object.freeze({ mode: "whole_month" }),
    }),
    defaultAction: "award",
    supportedActions: awardAvoidActions,
  }),
]);

export const pbsSupportedLinePropertyCatalog = Object.freeze([
  ...pbsLineF8PropertyCatalog,
  ...pbsLinePropertyCatalog,
  ...pbsLineAaPropertyCatalog,
  ...pbsLineReservePropertyCatalog,
]);

export const pbsLegacyLinePropertyCatalog = pbsLinePropertyCatalog;
