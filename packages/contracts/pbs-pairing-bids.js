export const pbsPairingBidRoutes = Object.freeze({
  current: "/pairing-bids/current",
  currentProperties: "/pairing-bids/current/properties",
  currentPropertyByKey: (propertyGroupKey) => `/pairing-bids/current/properties/${propertyGroupKey}`,
  currentFavorites: "/pairing-bids/current/favorites",
  referenceOptions: "/pairing-bids/reference-options",
  efficientFlyingConfig: "/pairing-bids/efficient-flying-config",
  redeyeConfig: "/pairing-bids/redeye-config",
  favoriteByKey: (favoriteKey) => `/pairing-bids/current/favorites/by-key/${favoriteKey}`,
});

const defaultAircraftOptions = Object.freeze(["A319", "A321", "B737", "B787"]);
const comparisonOperators = Object.freeze(["=", "<", ">", "Between"]);
const awardAvoidActions = Object.freeze(["award", "avoid"]);
const anyEveryQuantifiers = Object.freeze(["any", "every"]);

const pairingLengthIsoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const pairingLengthMonthLabels = Object.freeze([
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]);

const formatPairingLengthDate = (value) => {
  if (!pairingLengthIsoDatePattern.test(value)) {
    return null;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${pairingLengthMonthLabels[month - 1]} ${day}, ${year}`;
};

const formatPairingLengthDateList = (dates) => {
  const formattedDates = dates.map(formatPairingLengthDate);

  if (formattedDates.some((date) => date === null)) {
    return null;
  }

  if (formattedDates.length === 1) {
    return formattedDates[0];
  }

  if (formattedDates.length === 2) {
    return `${formattedDates[0]} or ${formattedDates[1]}`;
  }

  return `${formattedDates.slice(0, -1).join("; ")}; or ${formattedDates.at(-1)}`;
};

const formatPairingLengthDayCount = (days) => `${days} ${days === 1 ? "day" : "days"}`;

export const formatPbsPairingLengthSummary = ({
  action,
  dateScope,
  maxDays,
  minDays,
}) => {
  const isOptionalPositiveInteger = (value) => value == null
    || (Number.isSafeInteger(value) && value > 0);

  if (
    (action !== "award" && action !== "avoid")
    || !isOptionalPositiveInteger(minDays)
    || !isOptionalPositiveInteger(maxDays)
    || (minDays == null && maxDays == null)
    || (minDays != null && maxDays != null && minDays > maxDays)
  ) {
    return null;
  }

  const actionLabel = action === "avoid" ? "Avoid" : "Award";
  const lengthPhrase = minDays != null && maxDays != null
    ? minDays === maxDays
      ? formatPairingLengthDayCount(minDays)
      : `${minDays}–${maxDays} days`
    : minDays != null
      ? `at least ${formatPairingLengthDayCount(minDays)}`
      : `up to ${formatPairingLengthDayCount(maxDays)}`;
  let datePhrase = "";

  if (dateScope?.mode === "specific_dates") {
    const dates = Array.isArray(dateScope.dates) ? dateScope.dates : [];
    const formattedDates = dates.length > 0 ? formatPairingLengthDateList(dates) : null;

    if (!formattedDates) {
      return null;
    }

    datePhrase = ` starting on ${formattedDates}`;
  } else if (dateScope?.mode === "date_range") {
    const from = formatPairingLengthDate(dateScope.from);
    const to = formatPairingLengthDate(dateScope.to);

    if (!from || !to || dateScope.to < dateScope.from) {
      return null;
    }

    datePhrase = ` starting from ${from} to ${to}`;
  } else if (dateScope != null) {
    return null;
  }

  return `${actionLabel} pairings ${lengthPhrase} long${datePhrase}`;
};

export const pbsPairingPropertyUsages = Object.freeze({
  multi: "multi",
  single: "single",
});

export const pbsPairingF8PropertyCodes = Object.freeze({
  efficientFlyingFirst: 428,
});

export const pbsPairingPropertyUsageByCode = Object.freeze({
  101: pbsPairingPropertyUsages.multi,
  102: pbsPairingPropertyUsages.multi,
  103: pbsPairingPropertyUsages.multi,
  104: pbsPairingPropertyUsages.multi,
  105: pbsPairingPropertyUsages.single,
  106: pbsPairingPropertyUsages.multi,
  107: pbsPairingPropertyUsages.multi,
  108: pbsPairingPropertyUsages.single,
  109: pbsPairingPropertyUsages.single,
  110: pbsPairingPropertyUsages.multi,
  112: pbsPairingPropertyUsages.multi,
  113: pbsPairingPropertyUsages.single,
  114: pbsPairingPropertyUsages.multi,
  115: pbsPairingPropertyUsages.multi,
  116: pbsPairingPropertyUsages.multi,
  117: pbsPairingPropertyUsages.single,
  118: pbsPairingPropertyUsages.multi,
  119: pbsPairingPropertyUsages.multi,
  120: pbsPairingPropertyUsages.multi,
  121: pbsPairingPropertyUsages.single,
  122: pbsPairingPropertyUsages.single,
  123: pbsPairingPropertyUsages.multi,
  124: pbsPairingPropertyUsages.single,
  125: pbsPairingPropertyUsages.single,
  126: pbsPairingPropertyUsages.multi,
  127: pbsPairingPropertyUsages.single,
  128: pbsPairingPropertyUsages.single,
  129: pbsPairingPropertyUsages.multi,
  130: pbsPairingPropertyUsages.single,
  131: pbsPairingPropertyUsages.multi,
  132: pbsPairingPropertyUsages.multi,
  133: pbsPairingPropertyUsages.multi,
  134: pbsPairingPropertyUsages.multi,
  139: pbsPairingPropertyUsages.multi,
  135: pbsPairingPropertyUsages.multi,
  140: pbsPairingPropertyUsages.multi,
  136: pbsPairingPropertyUsages.single,
  141: pbsPairingPropertyUsages.single,
  137: pbsPairingPropertyUsages.multi,
  138: pbsPairingPropertyUsages.single,
  142: pbsPairingPropertyUsages.single,
  143: pbsPairingPropertyUsages.single,
  144: pbsPairingPropertyUsages.single,
  145: pbsPairingPropertyUsages.single,
  146: pbsPairingPropertyUsages.single,
  147: pbsPairingPropertyUsages.single,
  148: pbsPairingPropertyUsages.single,
  149: pbsPairingPropertyUsages.multi,
  150: pbsPairingPropertyUsages.multi,
  151: pbsPairingPropertyUsages.multi,
  152: pbsPairingPropertyUsages.multi,
  153: pbsPairingPropertyUsages.single,
  154: pbsPairingPropertyUsages.single,
  155: pbsPairingPropertyUsages.multi,
  156: pbsPairingPropertyUsages.multi,
  157: pbsPairingPropertyUsages.single,
  158: pbsPairingPropertyUsages.single,
  159: pbsPairingPropertyUsages.multi,
  160: pbsPairingPropertyUsages.multi,
  161: pbsPairingPropertyUsages.single,
  162: pbsPairingPropertyUsages.single,
  163: pbsPairingPropertyUsages.single,
  164: pbsPairingPropertyUsages.multi,
  165: pbsPairingPropertyUsages.multi,
  166: pbsPairingPropertyUsages.multi,
  167: pbsPairingPropertyUsages.multi,
  168: pbsPairingPropertyUsages.multi,
  428: pbsPairingPropertyUsages.single,
});

export const pbsPairingPropertyCatalog = Object.freeze([
  Object.freeze({
    propertyCode: 101,
    name: "Any Landing In Airport",
    defaultBid: Object.freeze({
      type: "tag-list",
      values: Object.freeze([]),
    }),
    supportedActions: awardAvoidActions,
    supportedQuantifiers: Object.freeze(["any"]),
    defaultQuantifier: "any",
  }),
  Object.freeze({
    propertyCode: 102,
    name: "Pairing Preference",
    defaultBid: Object.freeze({
      type: "pairing-preference",
      pairingIds: Object.freeze([]),
      pairingLabels: Object.freeze([]),
    }),
    supportedActions: awardAvoidActions,
  }),
  Object.freeze({
    propertyCode: 168,
    name: "Airport Preference",
    defaultBid: Object.freeze({
      type: "airport-preference",
      event: "landing",
      locations: Object.freeze([]),
      dateScope: null,
      minimumLayoverDuration: null,
    }),
    supportedActions: awardAvoidActions,
  }),
  Object.freeze({
    propertyCode: pbsPairingF8PropertyCodes.efficientFlyingFirst,
    name: "Efficient Flying First",
    defaultBid: Object.freeze({
      type: "efficient-flying-preference",
      mode: "efficient",
    }),
    defaultAction: "award",
    supportedActions: Object.freeze(["award"]),
  }),
  Object.freeze({
    propertyCode: 103,
    name: "Pairing Check-In / Check-Out Time",
    defaultBid: Object.freeze({
      type: "pairing-check-time",
      timeType: "check_in",
      operator: "Between",
      from: "",
      to: "",
      dateScope: null,
    }),
    supportedActions: awardAvoidActions,
    supportedOperators: comparisonOperators,
  }),
  Object.freeze({
    propertyCode: 104,
    name: "Any/Every Layover In Airport",
    defaultBid: Object.freeze({ type: "tag-list", values: Object.freeze([]) }),
    supportedActions: awardAvoidActions,
    supportedQuantifiers: anyEveryQuantifiers,
    defaultQuantifier: "any",
  }),
  Object.freeze({
    propertyCode: 105,
    name: "Pairing Total Credit",
    defaultBid: Object.freeze({ type: "duration", value: "08:00" }),
    supportedActions: awardAvoidActions,
    supportedOperators: comparisonOperators,
  }),
  Object.freeze({
    propertyCode: 106,
    name: "Departure Date / Day",
    defaultBid: Object.freeze({
      type: "date-or-dow-list",
      dates: Object.freeze([]),
      daysOfWeek: Object.freeze([]),
    }),
    supportedActions: awardAvoidActions,
    supportedOperators: Object.freeze(["In", "Between"]),
  }),
  Object.freeze({
    propertyCode: 107,
    name: "Flight Legs per Duty",
    defaultBid: Object.freeze({
      type: "flight-legs-per-duty",
      operator: "=",
      legs: 2,
      dateScope: null,
    }),
    numericBounds: Object.freeze({ min: 1, max: 8 }),
    supportedActions: awardAvoidActions,
    supportedOperators: Object.freeze(["=", "<", ">", "Between"]),
    supportedQuantifiers: anyEveryQuantifiers,
    defaultQuantifier: "any",
  }),
  Object.freeze({
    propertyCode: 108,
    name: "Total Legs In Pairing",
    defaultBid: Object.freeze({ type: "stepper", value: 2, min: 1, max: 20 }),
    supportedActions: awardAvoidActions,
    supportedOperators: Object.freeze(["=", "<", ">"]),
  }),
  Object.freeze({
    propertyCode: 109,
    name: "Average Daily Credit",
    defaultBid: Object.freeze({ type: "duration", value: "06:00" }),
    supportedActions: awardAvoidActions,
    supportedOperators: comparisonOperators,
  }),
  Object.freeze({
    propertyCode: 110,
    name: "Work Day Preference",
    defaultBid: Object.freeze({
      type: "work-day-preference",
      days: Object.freeze([]),
      dateScope: null,
    }),
    supportedActions: Object.freeze(["award"]),
  }),
  Object.freeze({
    propertyCode: 112,
    name: "Pairing Length",
    defaultBid: Object.freeze({
      type: "pairing-length-preference",
      minDays: null,
      maxDays: null,
      dateScope: null,
      min: 1,
      max: 7,
    }),
    supportedActions: awardAvoidActions,
  }),
  Object.freeze({
    propertyCode: 113,
    name: "TAFB",
    defaultBid: Object.freeze({ type: "stepper", value: 2, min: 1, max: 14 }),
    supportedActions: awardAvoidActions,
    supportedOperators: Object.freeze(["<", ">", "Between"]),
  }),
  Object.freeze({
    propertyCode: 114,
    name: "Any/Every Enroute Check-In Time",
    defaultBid: Object.freeze({ type: "time", value: "16:30" }),
    supportedActions: awardAvoidActions,
    supportedOperators: comparisonOperators,
    supportedQuantifiers: anyEveryQuantifiers,
    defaultQuantifier: "any",
  }),
  Object.freeze({
    propertyCode: 115,
    name: "Any/Every Leg With Employee Number",
    defaultBid: Object.freeze({ type: "tag-list", values: Object.freeze([]) }),
    supportedActions: Object.freeze(["award"]),
    supportedQuantifiers: anyEveryQuantifiers,
    defaultQuantifier: "any",
  }),
  Object.freeze({
    propertyCode: 116,
    name: "Flight Number Preference",
    defaultBid: Object.freeze({
      type: "flight-number-preference",
      flightNumbers: Object.freeze([]),
      dateScope: null,
    }),
    supportedActions: awardAvoidActions,
  }),
  Object.freeze({
    propertyCode: 117,
    name: "Redeye Preference",
    defaultAction: "avoid",
    defaultBid: Object.freeze({
      type: "redeye-preference",
      dateScope: null,
    }),
    supportedActions: awardAvoidActions,
  }),
  Object.freeze({
    propertyCode: 118,
    name: "Any/Every Duty Duration",
    defaultBid: Object.freeze({ type: "duration", value: "11:30", operator: ">" }),
    supportedActions: awardAvoidActions,
    supportedOperators: Object.freeze(["<", ">", "Between"]),
    supportedQuantifiers: anyEveryQuantifiers,
    defaultQuantifier: "any",
  }),
  Object.freeze({
    propertyCode: 119,
    name: "Any/Every Layover Duration",
    defaultBid: Object.freeze({ type: "duration", value: "15:00", operator: ">" }),
    supportedActions: awardAvoidActions,
    supportedOperators: Object.freeze(["<", ">"]),
    supportedQuantifiers: anyEveryQuantifiers,
    defaultQuantifier: "any",
  }),
  Object.freeze({
    propertyCode: 120,
    name: "Any Duty On Time",
    defaultBid: Object.freeze({ type: "time", value: "12:00" }),
    supportedActions: awardAvoidActions,
    supportedOperators: comparisonOperators,
    supportedQuantifiers: Object.freeze(["any"]),
    defaultQuantifier: "any",
  }),
  Object.freeze({
    propertyCode: 121,
    name: "Average Daily Block Time",
    defaultBid: Object.freeze({ type: "duration", value: "06:00", operator: ">" }),
    supportedActions: awardAvoidActions,
    supportedOperators: Object.freeze(["<", ">"]),
  }),
  Object.freeze({
    propertyCode: 122,
    name: "Deadhead Flying",
    defaultAction: "award",
    defaultBid: Object.freeze({ type: "deadhead-flying", mode: "any-deadhead", dateScope: null }),
    supportedActions: awardAvoidActions,
  }),
  Object.freeze({
    propertyCode: 123,
    name: "Any/Every Layover On Date / Day",
    defaultBid: Object.freeze({ type: "date-or-dow-list", dates: Object.freeze([]), daysOfWeek: Object.freeze([]) }),
    supportedActions: awardAvoidActions,
    supportedOperators: Object.freeze(["In", "Between"]),
    supportedQuantifiers: anyEveryQuantifiers,
    defaultQuantifier: "any",
  }),
  Object.freeze({
    propertyCode: 124,
    name: "Total Legs In First Duty",
    defaultBid: Object.freeze({ type: "stepper", value: 2, min: 1, max: 8, operator: ">" }),
    supportedActions: awardAvoidActions,
    supportedOperators: Object.freeze([">", "<"]),
  }),
  Object.freeze({
    propertyCode: 125,
    name: "Credit Per Time Away From Base",
    defaultBid: Object.freeze({ type: "percent-or-duration", unit: "percent", value: "75", operator: ">" }),
    supportedActions: awardAvoidActions,
    supportedOperators: Object.freeze([">", "<"]),
  }),
  Object.freeze({
    propertyCode: 126,
    name: "Any/Every Enroute Check-Out Time",
    defaultBid: Object.freeze({ type: "time", value: "22:30", operator: "<" }),
    supportedActions: awardAvoidActions,
    supportedOperators: Object.freeze(["<", "Between"]),
    supportedQuantifiers: anyEveryQuantifiers,
    defaultQuantifier: "any",
  }),
  Object.freeze({
    propertyCode: 166,
    name: "Any/Every Enroute Check-In Date / Day",
    defaultBid: Object.freeze({ type: "date-or-dow-list", dates: Object.freeze([]), daysOfWeek: Object.freeze([]) }),
    supportedActions: awardAvoidActions,
    supportedOperators: Object.freeze(["In", "Between"]),
    supportedQuantifiers: anyEveryQuantifiers,
    defaultQuantifier: "any",
  }),
  Object.freeze({
    propertyCode: 167,
    name: "Any/Every Enroute Check-Out Date / Day",
    defaultBid: Object.freeze({ type: "date-or-dow-list", dates: Object.freeze([]), daysOfWeek: Object.freeze([]) }),
    supportedActions: awardAvoidActions,
    supportedOperators: Object.freeze(["In", "Between"]),
    supportedQuantifiers: anyEveryQuantifiers,
    defaultQuantifier: "any",
  }),
  Object.freeze({
    propertyCode: 127,
    name: "Pairing Total Block Time",
    defaultBid: Object.freeze({ type: "duration", value: "06:00", operator: ">" }),
    supportedActions: Object.freeze(["award"]),
    supportedOperators: Object.freeze([">", "Between"]),
  }),
  Object.freeze({
    propertyCode: 128,
    name: "Deadhead Day",
    defaultBid: Object.freeze({ type: "flag" }),
    supportedActions: awardAvoidActions,
  }),
  Object.freeze({
    propertyCode: 129,
    name: "Time Between Flights",
    defaultBid: Object.freeze({ type: "duration", value: "", operator: ">" }),
    supportedActions: awardAvoidActions,
    supportedOperators: Object.freeze(["<", "=", ">"]),
    supportedQuantifiers: anyEveryQuantifiers,
    defaultQuantifier: "any",
  }),
  Object.freeze({
    propertyCode: 130,
    name: "Total Legs In Last Duty",
    defaultBid: Object.freeze({ type: "stepper", value: 2, min: 1, max: 8 }),
    supportedActions: Object.freeze(["avoid"]),
    supportedOperators: Object.freeze([">"]),
  }),
  Object.freeze({
    propertyCode: 131,
    name: "Prefer Pairing Length",
    defaultBid: Object.freeze({ type: "stepper", value: 3, min: 1, max: 7 }),
    supportedActions: awardAvoidActions,
    supportedOperators: comparisonOperators,
  }),
  Object.freeze({
    propertyCode: 132,
    name: "Prefer Pairing Length on Date",
    defaultBid: Object.freeze({ type: "stepper-date", value: 2, date: "2025-12-24", min: 1, max: 7 }),
    supportedActions: awardAvoidActions,
    supportedOperators: comparisonOperators,
  }),
  Object.freeze({
    propertyCode: 133,
    name: "Prefer Duty Period",
    defaultBid: Object.freeze({ type: "stepper", value: 3, min: 1, max: 4 }),
  }),
  Object.freeze({
    propertyCode: 134,
    name: "Report Between",
    defaultBid: Object.freeze({ type: "time-range", from: "09:00", to: "18:30" }),
    supportedActions: awardAvoidActions,
    supportedOperators: comparisonOperators,
  }),
  Object.freeze({
    propertyCode: 139,
    name: "Report Between on Date",
    defaultBid: Object.freeze({ type: "time-range-date", from: "18:30", to: "23:30", date: "2025-12-25" }),
    supportedActions: awardAvoidActions,
    supportedOperators: comparisonOperators,
  }),
  Object.freeze({
    propertyCode: 135,
    name: "Release Between",
    defaultBid: Object.freeze({ type: "time-range", from: "16:30", to: "23:30" }),
    supportedActions: awardAvoidActions,
    supportedOperators: comparisonOperators,
  }),
  Object.freeze({
    propertyCode: 140,
    name: "Release Between on Date",
    defaultBid: Object.freeze({ type: "time-range-date", from: "09:30", to: "15:00", date: "2025-12-25" }),
    supportedActions: awardAvoidActions,
    supportedOperators: comparisonOperators,
  }),
  Object.freeze({
    propertyCode: 136,
    name: "Mid-Pairing Report After",
    defaultBid: Object.freeze({ type: "time", value: "16:30" }),
  }),
  Object.freeze({
    propertyCode: 141,
    name: "Mid-Pairing Release Before",
    defaultBid: Object.freeze({ type: "time", value: "22:30" }),
  }),
  Object.freeze({
    propertyCode: 137,
    name: "Prefer Pairing Type",
    defaultBid: Object.freeze({
      type: "select",
      value: "RedEye",
      options: Object.freeze(["RedEye", "IPD", "Prem Transcon", "NIPD", "Rocket", "Regular", "Shuttle", "Charter", "ODAN"]),
    }),
  }),
  Object.freeze({
    propertyCode: 138,
    name: "Maximum TAFB-Credit Ratio",
    defaultBid: Object.freeze({ type: "percent", value: "25.78" }),
    supportedActions: awardAvoidActions,
    supportedOperators: comparisonOperators,
  }),
  Object.freeze({
    propertyCode: 142,
    name: "Minimum Avg Credit per Duty",
    defaultBid: Object.freeze({ type: "duration", value: "06:00", operator: ">" }),
    supportedOperators: Object.freeze([">"]),
  }),
  Object.freeze({
    propertyCode: 143,
    name: "Maximum Duty Time per Duty",
    defaultBid: Object.freeze({ type: "duration", value: "11:30", operator: "<" }),
    supportedOperators: Object.freeze(["<"]),
  }),
  Object.freeze({
    propertyCode: 144,
    name: "Maximum Block per Duty",
    defaultBid: Object.freeze({ type: "duration", value: "06:00", operator: "<" }),
    supportedOperators: Object.freeze(["<"]),
  }),
  Object.freeze({
    propertyCode: 145,
    name: "Minimum Connection Time",
    defaultBid: Object.freeze({ type: "duration", value: "00:45", operator: ">" }),
    supportedOperators: Object.freeze([">"]),
  }),
  Object.freeze({
    propertyCode: 146,
    name: "Maximum Connection Time",
    defaultBid: Object.freeze({ type: "duration", value: "03:00", operator: "<" }),
    supportedOperators: Object.freeze(["<"]),
  }),
  Object.freeze({
    propertyCode: 147,
    name: "Prefer Deadheads",
    defaultBid: Object.freeze({
      type: "select",
      value: "Enabled",
      options: Object.freeze(["Enabled"]),
    }),
  }),
  Object.freeze({
    propertyCode: 148,
    name: "Avoid Deadheads",
    defaultBid: Object.freeze({
      type: "select",
      value: "Enabled",
      options: Object.freeze(["Enabled"]),
    }),
  }),
  Object.freeze({
    propertyCode: 149,
    name: "Co-Terminal / Satellite Airport",
    defaultBid: Object.freeze({
      type: "select",
      value: "",
      options: Object.freeze(["LAX", "JFK", "SNA", "ATL Satellite"]),
    }),
  }),
  Object.freeze({
    propertyCode: 150,
    name: "Layover at City",
    defaultBid: Object.freeze({ type: "tag-list", values: Object.freeze([]) }),
    supportedActions: awardAvoidActions,
    supportedQuantifiers: anyEveryQuantifiers,
    defaultQuantifier: "any",
  }),
  Object.freeze({
    propertyCode: 151,
    name: "Avoid Layover at City",
    defaultBid: Object.freeze({ type: "tag-list", values: Object.freeze([]) }),
    supportedActions: awardAvoidActions,
    supportedQuantifiers: anyEveryQuantifiers,
    defaultQuantifier: "any",
  }),
  Object.freeze({
    propertyCode: 152,
    name: "Layover at City on Date",
    defaultBid: Object.freeze({ type: "tag-list-date", values: Object.freeze([]), date: "" }),
    supportedActions: awardAvoidActions,
    supportedQuantifiers: anyEveryQuantifiers,
    defaultQuantifier: "any",
  }),
  Object.freeze({
    propertyCode: 153,
    name: "Minimum Layover Time",
    defaultBid: Object.freeze({ type: "duration", value: "15:00", operator: ">" }),
    supportedOperators: Object.freeze([">"]),
  }),
  Object.freeze({
    propertyCode: 154,
    name: "Maximum Layover Time",
    defaultBid: Object.freeze({ type: "duration", value: "22:00", operator: "<" }),
    supportedOperators: Object.freeze(["<"]),
  }),
  Object.freeze({
    propertyCode: 155,
    name: "Prefer Landing at City",
    defaultBid: Object.freeze({
      type: "tag-list",
      values: Object.freeze([]),
    }),
    supportedActions: awardAvoidActions,
    supportedQuantifiers: Object.freeze(["any"]),
    defaultQuantifier: "any",
  }),
  Object.freeze({
    propertyCode: 156,
    name: "Avoid Landing at City",
    defaultBid: Object.freeze({
      type: "tag-list",
      values: Object.freeze([]),
    }),
    supportedActions: awardAvoidActions,
    supportedQuantifiers: Object.freeze(["any"]),
    defaultQuantifier: "any",
  }),
  Object.freeze({
    propertyCode: 157,
    name: "Prefer One Landing on First Duty",
    defaultBid: Object.freeze({
      type: "select",
      value: "Enabled",
      options: Object.freeze(["Enabled"]),
    }),
  }),
  Object.freeze({
    propertyCode: 158,
    name: "Prefer One Landing on Last Duty",
    defaultBid: Object.freeze({
      type: "select",
      value: "Enabled",
      options: Object.freeze(["Enabled"]),
    }),
  }),
  Object.freeze({
    propertyCode: 159,
    name: "Prefer Aircraft",
    defaultBid: Object.freeze({
      type: "tag-list",
      values: Object.freeze(["A321"]),
      suggestions: defaultAircraftOptions,
    }),
    supportedActions: awardAvoidActions,
  }),
  Object.freeze({
    propertyCode: 160,
    name: "Avoid Aircraft",
    defaultBid: Object.freeze({
      type: "tag-list",
      values: Object.freeze(["B737"]),
      suggestions: defaultAircraftOptions,
    }),
    supportedActions: awardAvoidActions,
  }),
  Object.freeze({
    propertyCode: 161,
    name: "Maximum Landing per Duty",
    defaultBid: Object.freeze({ type: "stepper", value: 2, min: 1, max: 4 }),
  }),
  Object.freeze({
    propertyCode: 162,
    name: "Prefer Positions Order",
    defaultBid: Object.freeze({
      type: "select",
      value: "04,02,01,03",
      options: Object.freeze(["04,02,01,03", "01,02", "02,01,03,04"]),
    }),
  }),
  Object.freeze({
    propertyCode: 163,
    name: "Month-End Carryover",
    defaultAction: "award",
    defaultBid: Object.freeze({ type: "month-end-carryover", operator: ">", days: null }),
    supportedActions: awardAvoidActions,
    supportedOperators: Object.freeze(["<", "=", ">", "Between"]),
  }),
  Object.freeze({
    propertyCode: 164,
    name: "Departure Time",
    defaultBid: Object.freeze({ type: "time", value: "06:00", operator: ">" }),
    supportedActions: awardAvoidActions,
    supportedOperators: comparisonOperators,
  }),
  Object.freeze({
    propertyCode: 165,
    name: "Work Start Station",
    defaultBid: Object.freeze({ type: "tag-list", values: Object.freeze([]) }),
    supportedActions: awardAvoidActions,
    supportedOperators: Object.freeze(["In"]),
  }),
]);

export const pbsPairingCreditPriorityPropertyCodes = Object.freeze([105, 109, 121, 125, 127]);

export const isPbsPairingCreditPriorityProperty = (propertyCode) =>
  pbsPairingCreditPriorityPropertyCodes.includes(propertyCode);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeTextValue = (value) => String(value ?? "").trim();

const normalizeTextArray = (values) =>
  Array.from(new Set(values.map((value) => normalizeTextValue(value)).filter(Boolean))).sort();

const normalizeUpperTextArray = (values) =>
  normalizeTextArray(values.map((value) => normalizeTextValue(value).toUpperCase()));

const normalizePairingIdsWithLabels = (ids, labels) => {
  const normalizedLabels = Array.isArray(labels)
    ? labels.map((label) => normalizeTextValue(label))
    : [];
  const labelsById = new Map();

  for (const [index, id] of ids.entries()) {
    const normalizedId = normalizeTextValue(id);

    if (normalizedId.length > 0 && !labelsById.has(normalizedId)) {
      labelsById.set(normalizedId, normalizedLabels[index]);
    }
  }

  const entries = Array.from(labelsById.entries()).sort(([left], [right]) => left.localeCompare(right));
  const pairingIds = entries.map(([id]) => id);
  const pairingLabels = entries.map(([, label]) => label).filter(Boolean);

  return {
    pairingIds,
    pairingLabels: pairingLabels.length === pairingIds.length ? pairingLabels : [],
  };
};

const normalizeComparableOperator = (operator) => operator ?? "=";

const normalizeCreditPriority = (value) => value === "higher" || value === "lower" ? value : undefined;

const withCreditPriority = (normalizedBid, sourceBid) => {
  const creditPriority = normalizeCreditPriority(sourceBid.creditPriority);

  return creditPriority ? { ...normalizedBid, creditPriority } : normalizedBid;
};

const normalizeAirportPreferenceDateCondition = (condition) => {
  if (!isRecord(condition)) {
    return undefined;
  }

  if (condition.mode === "specific_dates") {
    const dates = normalizeTextArray(Array.isArray(condition.dates) ? condition.dates : []);
    return dates.length > 0 ? { mode: "specific_dates", dates } : undefined;
  }

  if (condition.mode === "day") {
    const allowedDays = new Set(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
    const daysOfWeek = normalizeUpperTextArray(Array.isArray(condition.daysOfWeek) ? condition.daysOfWeek : [])
      .filter((day) => allowedDays.has(day));
    return daysOfWeek.length > 0 ? { mode: "day", daysOfWeek } : undefined;
  }

  if (condition.mode === "date_range") {
    const from = normalizeTextValue(condition.from);
    const to = normalizeTextValue(condition.to);
    return from.length > 0 || to.length > 0 ? { mode: "date_range", from, to } : undefined;
  }

  return undefined;
};

const normalizeAirportPreferenceNumericCondition = (condition) => {
  if (!isRecord(condition)) {
    return undefined;
  }

  if (condition.operator === "Between") {
    const from = Number(condition.from);
    const to = Number(condition.to);

    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return undefined;
    }

    return {
      operator: "Between",
      from,
      to,
    };
  }

  const operator = condition.operator === "<" || condition.operator === ">" ? condition.operator : "=";
  const value = Number(condition.value);

  if (!Number.isFinite(value)) {
    return undefined;
  }

  return {
    operator,
    value,
  };
};

const normalizeAirportPreferenceDurationCondition = (condition) => {
  if (!isRecord(condition)) {
    return undefined;
  }

  if (condition.operator === "Between") {
    const from = normalizeTextValue(condition.from);
    const to = normalizeTextValue(condition.to);
    return from.length > 0 || to.length > 0 ? { operator: "Between", from, to } : undefined;
  }

  const operator = condition.operator === "<" || condition.operator === ">" ? condition.operator : "=";
  const value = normalizeTextValue(condition.value);
  return value.length > 0 ? { operator, value } : undefined;
};

export const getPbsPairingPropertyUsage = (propertyCode) =>
  pbsPairingPropertyUsageByCode[propertyCode] ?? pbsPairingPropertyUsages.single;

export const normalizePbsPairingBidValueForRules = (bid) => {
  if (!isRecord(bid) || typeof bid.type !== "string") {
    return bid;
  }

  if (bid.type === "stepper" || bid.type === "stepper-date") {
    return {
      type: bid.type,
      value: bid.value,
      date: normalizeTextValue(bid.date),
      operator: normalizeComparableOperator(bid.operator),
    };
  }

  if (bid.type === "flight-legs-per-duty") {
    const dateScope = isRecord(bid.dateScope)
      ? bid.dateScope.mode === "specific_dates"
        ? {
            mode: "specific_dates",
            dates: Array.from(new Set(
              (Array.isArray(bid.dateScope.dates) ? bid.dateScope.dates : [])
                .map(normalizeTextValue)
                .filter(Boolean),
            )),
          }
        : bid.dateScope.mode === "date_range"
          ? {
              mode: "date_range",
              from: normalizeTextValue(bid.dateScope.from),
              to: normalizeTextValue(bid.dateScope.to),
            }
          : null
      : null;

    if (bid.operator === "Between") {
      return {
        type: bid.type,
        operator: "Between",
        from: bid.from,
        to: bid.to,
        dateScope,
      };
    }

    return {
      type: bid.type,
      operator: bid.operator === "<" || bid.operator === ">" ? bid.operator : "=",
      legs: bid.legs,
      dateScope,
    };
  }

  if (bid.type === "stepper-range" || bid.type === "stepper-range-date") {
    return {
      type: bid.type,
      from: bid.from,
      to: bid.to,
      date: normalizeTextValue(bid.date),
    };
  }

  if (bid.type === "stepper-date-range") {
    return {
      type: bid.type,
      value: bid.value,
      from: normalizeTextValue(bid.from),
      to: normalizeTextValue(bid.to),
    };
  }

  if (bid.type === "days-off-on-pattern") {
    return {
      type: bid.type,
      minDaysOff: bid.minDaysOff,
      minDaysOn: bid.minDaysOn,
      maxDaysOn: bid.maxDaysOn,
    };
  }

  if (bid.type === "duration") {
    return withCreditPriority({
      type: bid.type,
      value: normalizeTextValue(bid.value),
      operator: normalizeComparableOperator(bid.operator),
    }, bid);
  }

  if (bid.type === "time" || bid.type === "time-date") {
    return {
      type: bid.type,
      value: normalizeTextValue(bid.value),
      date: normalizeTextValue(bid.date),
      operator: normalizeComparableOperator(bid.operator),
    };
  }

  if (
    bid.type === "time-range"
    || bid.type === "time-range-date"
    || bid.type === "date-range"
    || bid.type === "duration-range"
  ) {
    const normalizedBid = {
      type: bid.type,
      from: normalizeTextValue(bid.from),
      to: normalizeTextValue(bid.to),
      date: normalizeTextValue(bid.date),
    };

    return bid.type === "duration-range" ? withCreditPriority(normalizedBid, bid) : normalizedBid;
  }

  if (bid.type === "time-condition-list") {
    const conditions = Array.isArray(bid.conditions)
      ? bid.conditions
          .map((condition) => {
            if (condition?.operator === "Between") {
              return {
                operator: "Between",
                from: normalizeTextValue(condition.from),
                to: normalizeTextValue(condition.to),
              };
            }

            return {
              operator: normalizeComparableOperator(condition?.operator),
              value: normalizeTextValue(condition?.value),
            };
          })
          .filter((condition) =>
            condition.operator === "Between"
              ? condition.from.length > 0 && condition.to.length > 0
              : condition.value.length > 0,
          )
      : [];

    return {
      type: bid.type,
      conditions,
    };
  }

  if (bid.type === "date-or-dow-list") {
    return {
      type: bid.type,
      dates: normalizeTextArray(Array.isArray(bid.dates) ? bid.dates : []),
      daysOfWeek: normalizeTextArray(Array.isArray(bid.daysOfWeek) ? bid.daysOfWeek : []),
    };
  }

  if (bid.type === "work-day-preference") {
    const dayOrder = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    const daysByWeekday = new Map();

    if (Array.isArray(bid.days)) {
      for (const day of bid.days) {
        if (!isRecord(day) || !dayOrder.includes(day.dayOfWeek) || daysByWeekday.has(day.dayOfWeek)) {
          continue;
        }

        daysByWeekday.set(day.dayOfWeek, {
          dayOfWeek: day.dayOfWeek,
          checkInFrom: normalizeTextValue(day.checkInFrom) || null,
          checkInTo: normalizeTextValue(day.checkInTo) || null,
        });
      }
    }

    const dateScope = bid.dateScope?.mode === "specific_dates"
      ? { mode: "specific_dates", dates: normalizeTextArray(bid.dateScope.dates) }
      : bid.dateScope?.mode === "date_range"
        ? {
            mode: "date_range",
            from: normalizeTextValue(bid.dateScope.from),
            to: normalizeTextValue(bid.dateScope.to),
          }
        : null;

    return {
      type: bid.type,
      days: dayOrder.flatMap((dayOfWeek) => {
        const day = daysByWeekday.get(dayOfWeek);
        return day ? [day] : [];
      }),
      dateScope,
    };
  }

  if (bid.type === "airport-preference") {
    const event = bid.event === "landing" || bid.event === "landing_or_layover"
      ? bid.event
      : "layover";
    const locations = Array.isArray(bid.locations)
      ? Array.from(new Map(bid.locations
        .filter((location) => location && (location.kind === "airport" || location.kind === "city"))
        .map((location) => {
          const code = normalizeTextValue(location.code).toUpperCase();
          return [`${location.kind}:${code}`, { code, kind: location.kind }];
        })
        .filter(([, location]) => location.code.length > 0)).values())
      : [];
    const dateScope = bid.dateScope?.mode === "specific_dates"
      ? { mode: "specific_dates", dates: normalizeTextArray(bid.dateScope.dates) }
      : bid.dateScope?.mode === "date_range"
        ? { mode: "date_range", from: normalizeTextValue(bid.dateScope.from), to: normalizeTextValue(bid.dateScope.to) }
        : null;
    const minimumLayoverDuration = event === "landing"
      ? null
      : normalizeTextValue(bid.minimumLayoverDuration) || null;

    return {
      type: bid.type,
      event,
      locations,
      dateScope,
      minimumLayoverDuration,
    };
  }

  if (bid.type === "select") {
    return {
      type: bid.type,
      value: normalizeTextValue(bid.value),
    };
  }

  if (bid.type === "tag-list" || bid.type === "tag-list-date") {
    return {
      type: bid.type,
      values: normalizeTextArray(Array.isArray(bid.values) ? bid.values : []),
      date: normalizeTextValue(bid.date),
    };
  }

  if (bid.type === "pairing-id-list") {
    const { pairingIds, pairingLabels } = normalizePairingIdsWithLabels(
      Array.isArray(bid.pairingIds) ? bid.pairingIds : [],
      bid.pairingLabels,
    );

    return {
      type: bid.type,
      pairingIds,
      pairingLabels,
    };
  }

  if (bid.type === "pairing-occurrence-list") {
    const occurrences = Array.isArray(bid.occurrences)
      ? bid.occurrences.map((occurrence) => ({
        pairingNumber: normalizeTextValue(occurrence?.pairingNumber).toUpperCase(),
        originDate: normalizeTextValue(occurrence?.originDate),
        pairingId: normalizeTextValue(occurrence?.pairingId),
        occurrenceId: normalizeTextValue(occurrence?.occurrenceId),
      }))
      : [];

    return {
      type: bid.type,
      occurrences,
    };
  }

  if (bid.type === "pairing-preference") {
    const { pairingIds, pairingLabels } = normalizePairingIdsWithLabels(
      Array.isArray(bid.pairingIds) ? bid.pairingIds : [],
      bid.pairingLabels,
    );
    return {
      type: bid.type,
      pairingIds,
      pairingLabels,
    };
  }

  if (bid.type === "pairing-check-time") {
    const timeType = bid.timeType === "check_out" ? "check_out" : "check_in";
    const dateScope = isRecord(bid.dateScope)
      ? bid.dateScope.mode === "specific_dates"
        ? {
            mode: "specific_dates",
            dates: Array.from(new Set(
              (Array.isArray(bid.dateScope.dates) ? bid.dateScope.dates : [])
                .map(normalizeTextValue)
                .filter(Boolean),
            )),
          }
        : bid.dateScope.mode === "specific_date"
          ? {
              mode: "specific_dates",
              dates: [normalizeTextValue(bid.dateScope.date)].filter(Boolean),
            }
          : bid.dateScope.mode === "date_range"
            ? {
                mode: "date_range",
                from: normalizeTextValue(bid.dateScope.from),
                to: normalizeTextValue(bid.dateScope.to),
              }
            : null
      : null;

    if (bid.operator === "Between") {
      return {
        type: bid.type,
        timeType,
        operator: "Between",
        from: normalizeTextValue(bid.from),
        to: normalizeTextValue(bid.to),
        dateScope,
      };
    }

    return {
      type: bid.type,
      timeType,
      operator: bid.operator === "<" || bid.operator === ">" ? bid.operator : "=",
      value: normalizeTextValue(bid.value),
      dateScope,
    };
  }

  if (bid.type === "pairing-length-preference") {
    const normalizeDayValue = (value) => Number.isSafeInteger(value) && value > 0 ? value : null;
    const dateScope = isRecord(bid.dateScope)
      ? bid.dateScope.mode === "specific_dates"
        ? {
            mode: "specific_dates",
            dates: Array.from(new Set(
              (Array.isArray(bid.dateScope.dates) ? bid.dateScope.dates : [])
                .map(normalizeTextValue)
                .filter(Boolean),
            )).sort(),
          }
        : bid.dateScope.mode === "date_range"
          ? {
              mode: "date_range",
              from: normalizeTextValue(bid.dateScope.from),
              to: normalizeTextValue(bid.dateScope.to),
            }
          : null
      : null;

    return {
      type: bid.type,
      minDays: normalizeDayValue(bid.minDays),
      maxDays: normalizeDayValue(bid.maxDays),
      dateScope,
    };
  }

  if (bid.type === "month-end-carryover") {
    const normalizeDayValue = (value) => Number.isSafeInteger(value) && value > 0 ? value : null;

    if (bid.operator === "Between") {
      return {
        type: bid.type,
        operator: "Between",
        from: normalizeDayValue(bid.from),
        to: normalizeDayValue(bid.to),
      };
    }

    return {
      type: bid.type,
      operator: bid.operator === "<" || bid.operator === ">" ? bid.operator : "=",
      days: normalizeDayValue(bid.days),
    };
  }

  if (bid.type === "deadhead-flying") {
    const dateScope = isRecord(bid.dateScope)
      ? bid.dateScope.mode === "specific_dates"
        ? {
            mode: "specific_dates",
            dates: Array.from(new Set(
              (Array.isArray(bid.dateScope.dates) ? bid.dateScope.dates : [])
                .map(normalizeTextValue)
                .filter(Boolean),
            )).sort(),
          }
        : bid.dateScope.mode === "date_range"
          ? {
              mode: "date_range",
              from: normalizeTextValue(bid.dateScope.from),
              to: normalizeTextValue(bid.dateScope.to),
            }
          : null
      : null;

    return {
      type: bid.type,
      mode: bid.mode === "deadhead-only-duty" ? "deadhead-only-duty" : "any-deadhead",
      dateScope,
    };
  }

  if (bid.type === "flight-number-preference") {
    const dateScope = isRecord(bid.dateScope)
      ? bid.dateScope.mode === "specific_dates"
        ? {
            mode: "specific_dates",
            dates: Array.from(new Set(
              (Array.isArray(bid.dateScope.dates) ? bid.dateScope.dates : [])
                .map(normalizeTextValue)
                .filter(Boolean),
            )).sort(),
          }
        : bid.dateScope.mode === "date_range"
          ? {
              mode: "date_range",
              from: normalizeTextValue(bid.dateScope.from),
              to: normalizeTextValue(bid.dateScope.to),
            }
          : null
      : null;

    return {
      type: bid.type,
      flightNumbers: Array.from(
        new Set(
          normalizeTextArray(Array.isArray(bid.flightNumbers) ? bid.flightNumbers : [])
            .map((value) => value.toUpperCase()),
        ),
      ),
      dateScope,
    };
  }

  if (bid.type === "redeye-preference") {
    const dateScope = isRecord(bid.dateScope)
      ? bid.dateScope.mode === "specific_dates"
        ? {
            mode: "specific_dates",
            dates: Array.from(new Set(normalizeTextArray(bid.dateScope.dates))).sort(),
          }
        : bid.dateScope.mode === "date_range"
          ? {
              mode: "date_range",
              from: normalizeTextValue(bid.dateScope.from),
              to: normalizeTextValue(bid.dateScope.to),
            }
          : null
      : null;

    return {
      type: bid.type,
      dateScope,
    };
  }

  if (bid.type === "crew-days-off-share") {
    return {
      type: bid.type,
      employeeNumber: normalizeTextValue(bid.employeeNumber),
      minimumDays: bid.minimumDays,
    };
  }

  if (bid.type === "employee-schedule-preference") {
    const crewId = normalizeTextValue(bid.crewId ?? bid.employeeNumber);
    const crewName = normalizeTextValue(bid.crewName);

    return {
      type: bid.type,
      crewId,
      ...(crewName ? { crewName } : {}),
      relationship: bid.relationship === "apart" ? "apart" : "together",
      scheduleType: bid.scheduleType === "work" ? "work" : "days_off",
      thresholdType: bid.thresholdType === "maximum" ? "maximum" : "minimum",
      days: bid.days,
    };
  }

  if (bid.type === "percent") {
    return {
      type: bid.type,
      value: normalizeTextValue(bid.value),
      operator: normalizeComparableOperator(bid.operator),
    };
  }

  if (bid.type === "percent-range") {
    return {
      type: bid.type,
      from: normalizeTextValue(bid.from),
      to: normalizeTextValue(bid.to),
    };
  }

  if (bid.type === "percent-or-duration") {
    return withCreditPriority({
      type: bid.type,
      unit: bid.unit === "duration" ? "duration" : "percent",
      value: bid.unit === "duration"
        ? normalizeTextValue(bid.value)
        : normalizeTextValue(bid.value).replace(/\s*%$/, ""),
      operator: bid.operator === "<" ? "<" : ">",
    }, bid);
  }

  if (bid.type === "text") {
    return {
      type: bid.type,
      value: normalizeTextValue(bid.value),
    };
  }

  return bid;
};

export const serializePbsPairingBidValueForRules = (bid) =>
  JSON.stringify(normalizePbsPairingBidValueForRules(bid));

export const buildPbsPairingConditionSignature = (property) =>
  [
    property.propertyCode,
    property.action ?? "",
    property.quantifier ?? "",
    serializePbsPairingBidValueForRules(property.bid),
  ].join("|");

const normalizeTierLabel = (tier) => {
  const rawTier = typeof tier === "string"
    ? tier
    : tier?.label ?? tier?.key ?? "";
  const trimmed = normalizeTextValue(rawTier);
  const match = trimmed.match(/^t?(\d+)$/i);

  if (match) {
    return `T${Number.parseInt(match[1], 10)}`;
  }

  return trimmed.toUpperCase();
};

export const getPbsPairingActiveTierLabels = (property) =>
  Array.from(
    new Set(
      (property.tiers ?? [])
        .filter((tier) => typeof tier === "string" || tier.active !== false)
        .map((tier) => normalizeTierLabel(tier))
        .filter(Boolean),
    ),
  ).sort((left, right) => {
    const leftNumber = Number.parseInt(left.replace(/^T/i, ""), 10);
    const rightNumber = Number.parseInt(right.replace(/^T/i, ""), 10);

    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber;
    }

    return left.localeCompare(right);
  });

const getPropertyInputId = (property) =>
  property.propertyGroupKey ?? property.id ?? null;

const getOverlappingTiers = (left, right) => {
  const rightTiers = new Set(getPbsPairingActiveTierLabels(right));

  return getPbsPairingActiveTierLabels(left).filter((tier) => rightTiers.has(tier));
};

export const findPbsPairingRuleConflict = (existingProperties, candidateProperty) => {
  const candidateId = getPropertyInputId(candidateProperty);
  const candidateSignature = buildPbsPairingConditionSignature(candidateProperty);
  const candidateUsage = getPbsPairingPropertyUsage(candidateProperty.propertyCode);

  for (const existingProperty of existingProperties) {
    const existingId = getPropertyInputId(existingProperty);

    if (candidateId !== null && existingId === candidateId) {
      continue;
    }

    const overlappingTiers = getOverlappingTiers(existingProperty, candidateProperty);

    if (overlappingTiers.length === 0) {
      continue;
    }

    if (buildPbsPairingConditionSignature(existingProperty) === candidateSignature) {
      return {
        type: "duplicate",
        tier: overlappingTiers[0],
        propertyCode: candidateProperty.propertyCode,
        propertyName: candidateProperty.name,
      };
    }

    if (
      candidateUsage === pbsPairingPropertyUsages.single
      && existingProperty.propertyCode === candidateProperty.propertyCode
    ) {
      return {
        type: "single-use",
        tier: overlappingTiers[0],
        propertyCode: candidateProperty.propertyCode,
        propertyName: candidateProperty.name,
      };
    }
  }

  return null;
};

export const findPbsPairingRuleConflictInProperties = (properties) => {
  for (let index = 0; index < properties.length; index += 1) {
    const conflict = findPbsPairingRuleConflict(properties.slice(0, index), properties[index]);

    if (conflict) {
      return conflict;
    }
  }

  return null;
};

const getSelectBidValue = (property) =>
  property.bid?.type === "select" ? normalizeTextValue(property.bid.value).toLowerCase() : "";

const pairingLengthBidIncludesOneDay = (property) => {
  if (property.propertyCode !== 112 && property.propertyCode !== 131) {
    return false;
  }

  const bid = property.bid;

  if (!isRecord(bid)) {
    return false;
  }

  if (bid.type === "stepper" || bid.type === "stepper-date") {
    return Number(bid.value) === 1;
  }

  if (bid.type === "stepper-range" || bid.type === "stepper-range-date") {
    return Number(bid.from) <= 1 && Number(bid.to) >= 1;
  }

  if (bid.type === "pairing-length-preference") {
    const hasMin = Number.isSafeInteger(bid.minDays);
    const hasMax = Number.isSafeInteger(bid.maxDays);

    return (hasMin || hasMax)
      && (!hasMin || bid.minDays <= 1)
      && (!hasMax || bid.maxDays >= 1);
  }

  return false;
};

const isOdanPairingType = (property) =>
  property.propertyCode === 137 && getSelectBidValue(property) === "odan";

const hasPropertyCode = (property, propertyCodes) => propertyCodes.includes(property.propertyCode);

export const getPbsPairingForcedOrRule = (leftProperty, rightProperty) => {
  if (
    (isOdanPairingType(leftProperty) && hasPropertyCode(rightProperty, [112, 131]))
    || (isOdanPairingType(rightProperty) && hasPropertyCode(leftProperty, [112, 131]))
  ) {
    return "odan-pairing-length";
  }

  const oneDayPairingLengthProperty = pairingLengthBidIncludesOneDay(leftProperty)
    ? leftProperty
    : pairingLengthBidIncludesOneDay(rightProperty)
      ? rightProperty
      : null;
  const otherProperty = oneDayPairingLengthProperty === leftProperty ? rightProperty : leftProperty;

  if (!oneDayPairingLengthProperty) {
    return null;
  }

  if (hasPropertyCode(otherProperty, [104, 150])) {
    return "one-day-layover-city";
  }

  if (hasPropertyCode(otherProperty, [151])) {
    return "one-day-avoid-layover-city";
  }

  if (hasPropertyCode(otherProperty, [119, 153])) {
    return "one-day-minimum-layover-time";
  }

  if (hasPropertyCode(otherProperty, [119, 154])) {
    return "one-day-maximum-layover-time";
  }

  return null;
};
