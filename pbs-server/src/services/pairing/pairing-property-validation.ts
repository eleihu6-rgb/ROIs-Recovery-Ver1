import {
  pbsPairingPropertyCatalog,
  type PbsPairingBidAction,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import { isIsoDateInPeriod } from "../lineholder/date-utils.js";

type PairingPropertyPayload = {
  propertyCode: number;
  action?: PbsPairingBidAction | null;
  quantifier?: "any" | "every" | null;
  bid: {
    type: string;
    operator?: unknown;
    event?: unknown;
    locations?: unknown;
    dateScope?: unknown;
    timeType?: unknown;
    mode?: unknown;
    minimumLayoverDuration?: unknown;
    from?: unknown;
    to?: unknown;
    value?: unknown;
    legs?: unknown;
    days?: unknown;
    minDays?: unknown;
    maxDays?: unknown;
    min?: unknown;
    max?: unknown;
    values?: unknown;
    flightNumbers?: unknown;
    dates?: unknown;
    daysOfWeek?: unknown;
    unit?: unknown;
  };
};

const PAIRING_CHECK_IN_TIME_PROPERTY_CODE = 103;
const FLIGHT_LEGS_PER_DUTY_PROPERTY_CODE = 107;
const PAIRING_TOTAL_CREDIT_PROPERTY_CODE = 105;
const PAIRING_DEPARTING_ON_PROPERTY_CODE = 106;
const PAIRING_DEPARTURE_TIME_PROPERTY_CODE = 164;
const PAIRING_AVERAGE_DAILY_CREDIT_PROPERTY_CODE = 109;
const PAIRING_AVERAGE_DAILY_BLOCK_TIME_PROPERTY_CODE = 121;
const PAIRING_CREDIT_PER_TIME_AWAY_FROM_BASE_PROPERTY_CODE = 125;
const PAIRING_DUTY_ON_DATE_OR_DAY_PROPERTY_CODE = 110;
const PAIRING_LENGTH_PROPERTY_CODE = 112;
const PAIRING_TAFB_PROPERTY_CODE = 113;
const PAIRING_LEG_WITH_EMPLOYEE_NUMBER_PROPERTY_CODE = 115;
const FLIGHT_NUMBER_PREFERENCE_PROPERTY_CODE = 116;
const REDEYE_PREFERENCE_PROPERTY_CODE = 117;
const PAIRING_DUTY_DURATION_PROPERTY_CODE = 118;
const PAIRING_LAYOVER_DURATION_PROPERTY_CODE = 119;
const PAIRING_ANY_ENROUTE_CHECK_IN_TIME_PROPERTY_CODE = 114;
const PAIRING_ANY_ENROUTE_CHECK_IN_DATE_OR_DAY_PROPERTY_CODE = 166;
const PAIRING_ANY_DUTY_ON_TIME_PROPERTY_CODE = 120;
const DEADHEAD_FLYING_PROPERTY_CODE = 122;
const PAIRING_LAYOVER_ON_DATE_OR_DAY_PROPERTY_CODE = 123;
const PAIRING_TOTAL_LEGS_IN_FIRST_DUTY_PROPERTY_CODE = 124;
const PAIRING_ANY_ENROUTE_CHECK_OUT_TIME_PROPERTY_CODE = 126;
const PAIRING_ANY_ENROUTE_CHECK_OUT_DATE_OR_DAY_PROPERTY_CODE = 167;
const PAIRING_TOTAL_BLOCK_TIME_PROPERTY_CODE = 127;
const TIME_BETWEEN_FLIGHTS_PROPERTY_CODE = 129;
const PAIRING_TOTAL_LEGS_IN_LAST_DUTY_PROPERTY_CODE = 130;
const MONTH_END_CARRYOVER_PROPERTY_CODE = 163;
const PAIRING_AIRPORT_PREFERENCE_PROPERTY_CODE = 168;
const EFFICIENT_FLYING_PROPERTY_CODE = 428;

const pairingPropertyDefinitionByCode = new Map(
  pbsPairingPropertyCatalog.map((property) => [property.propertyCode, property]),
);

const hasInvalidCheckInTimeBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_CHECK_IN_TIME_PROPERTY_CODE && property.bid.type !== "pairing-check-time";

const hasInvalidEfficientFlyingBid = (property: PairingPropertyPayload) =>
  property.propertyCode === EFFICIENT_FLYING_PROPERTY_CODE
  && (
    property.bid.type !== "efficient-flying-preference"
    || (property.bid.mode !== "efficient" && property.bid.mode !== "inefficient")
    || Object.keys(property.bid).some((key) => key !== "type" && key !== "mode")
    || property.quantifier != null
  );

const hasInvalidTotalCreditBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_TOTAL_CREDIT_PROPERTY_CODE
  && property.bid.type !== "duration"
  && property.bid.type !== "duration-range";

const hasInvalidAverageDailyCreditBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_AVERAGE_DAILY_CREDIT_PROPERTY_CODE
  && property.bid.type !== "duration"
  && property.bid.type !== "duration-range";

const hasInvalidAverageDailyBlockTimeBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_AVERAGE_DAILY_BLOCK_TIME_PROPERTY_CODE
  && property.bid.type !== "duration";

const hasUnsupportedAverageDailyBlockTimeOperator = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_AVERAGE_DAILY_BLOCK_TIME_PROPERTY_CODE
  && property.bid.type === "duration"
  && property.bid.operator !== "<"
  && property.bid.operator !== ">";

const hasInvalidTafbBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_TAFB_PROPERTY_CODE
  && property.bid.type !== "stepper"
  && property.bid.type !== "stepper-range";

const hasUnsupportedTafbEqualsOperator = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_TAFB_PROPERTY_CODE
  && property.bid.type === "stepper"
  && property.bid.operator === "=";

const hasInvalidDutyDurationBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_DUTY_DURATION_PROPERTY_CODE
  && property.bid.type !== "duration"
  && property.bid.type !== "duration-range";

const hasUnsupportedDutyDurationEqualsOperator = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_DUTY_DURATION_PROPERTY_CODE
  && property.bid.type === "duration"
  && property.bid.operator === "=";

const hasInvalidDutyDurationQuantifier = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_DUTY_DURATION_PROPERTY_CODE
  && property.quantifier !== "any"
  && property.quantifier !== "every";

const hasInvalidLayoverDurationBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_LAYOVER_DURATION_PROPERTY_CODE
  && property.bid.type !== "duration";

const hasUnsupportedLayoverDurationEqualsOperator = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_LAYOVER_DURATION_PROPERTY_CODE
  && property.bid.type === "duration"
  && property.bid.operator === "=";

const hasInvalidLayoverDurationQuantifier = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_LAYOVER_DURATION_PROPERTY_CODE
  && property.quantifier !== "any"
  && property.quantifier !== "every";

const hasInvalidTimeBetweenFlightsBid = (property: PairingPropertyPayload) =>
  property.propertyCode === TIME_BETWEEN_FLIGHTS_PROPERTY_CODE
  && (
    property.bid.type !== "duration"
    || !isValidDuration(property.bid.value)
    || (property.bid.operator !== "<" && property.bid.operator !== "=" && property.bid.operator !== ">")
  );

const hasInvalidTimeBetweenFlightsQuantifier = (property: PairingPropertyPayload) =>
  property.propertyCode === TIME_BETWEEN_FLIGHTS_PROPERTY_CODE
  && property.quantifier !== "any"
  && property.quantifier !== "every";

const hasInvalidAnyEnrouteCheckInTimeBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_ANY_ENROUTE_CHECK_IN_TIME_PROPERTY_CODE
  && property.bid.type !== "time"
  && property.bid.type !== "time-range";

const hasInvalidAnyEnrouteCheckInTimeQuantifier = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_ANY_ENROUTE_CHECK_IN_TIME_PROPERTY_CODE
  && property.quantifier !== "any"
  && property.quantifier !== "every";

const hasInvalidAnyDutyOnTimeBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_ANY_DUTY_ON_TIME_PROPERTY_CODE
  && property.bid.type !== "time"
  && property.bid.type !== "time-range";

const hasInvalidDepartureTimeBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_DEPARTURE_TIME_PROPERTY_CODE
  && property.bid.type !== "time"
  && property.bid.type !== "time-range";

const hasInvalidAnyDutyOnTimeQuantifier = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_ANY_DUTY_ON_TIME_PROPERTY_CODE
  && property.quantifier !== "any";

const hasInvalidAnyEnrouteCheckOutTimeBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_ANY_ENROUTE_CHECK_OUT_TIME_PROPERTY_CODE
  && property.bid.type !== "time"
  && property.bid.type !== "time-range";

const hasUnsupportedAnyEnrouteCheckOutTimeOperator = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_ANY_ENROUTE_CHECK_OUT_TIME_PROPERTY_CODE
  && property.bid.type === "time"
  && property.bid.operator !== "<";

const hasInvalidAnyEnrouteCheckOutTimeQuantifier = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_ANY_ENROUTE_CHECK_OUT_TIME_PROPERTY_CODE
  && property.quantifier !== "any"
  && property.quantifier !== "every";

const hasInvalidDepartingOnBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_DEPARTING_ON_PROPERTY_CODE
  && property.bid.type !== "date-or-dow-list"
  && property.bid.type !== "date-range";

const hasInvalidDutyOnDateOrDayBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_DUTY_ON_DATE_OR_DAY_PROPERTY_CODE
  && property.bid.type !== "work-day-preference";

const hasInvalidWorkDayPreference = (property: PairingPropertyPayload) => {
  if (property.propertyCode !== PAIRING_DUTY_ON_DATE_OR_DAY_PROPERTY_CODE) {
    return false;
  }

  if (
    property.quantifier != null
    || property.bid.type !== "work-day-preference"
    || !Array.isArray(property.bid.days)
    || property.bid.days.length === 0
  ) {
    return true;
  }

  const weekdays = new Set<string>();
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  for (const day of property.bid.days) {
    if (!isRecord(day) || typeof day.dayOfWeek !== "string") {
      return true;
    }
    const checkInFrom = typeof day.checkInFrom === "string" ? day.checkInFrom : null;
    const checkInTo = typeof day.checkInTo === "string" ? day.checkInTo : null;
    if (
      weekdays.has(day.dayOfWeek)
      || (checkInFrom != null && !timePattern.test(checkInFrom))
      || (checkInTo != null && !timePattern.test(checkInTo))
      || (checkInFrom != null && checkInTo != null && checkInFrom === checkInTo)
    ) {
      return true;
    }
    weekdays.add(day.dayOfWeek);
  }

  const dateScope = property.bid.dateScope;
  if (dateScope == null) return false;
  if (!isRecord(dateScope)) return true;
  if (dateScope.mode === "specific_dates") {
    return !Array.isArray(dateScope.dates)
      || dateScope.dates.length === 0
      || dateScope.dates.some((date) => typeof date !== "string" || !isValidIsoDate(date));
  }

  return dateScope.mode !== "date_range"
    || typeof dateScope.from !== "string"
    || typeof dateScope.to !== "string"
    || !isValidIsoDate(dateScope.from)
    || !isValidIsoDate(dateScope.to)
    || dateScope.to < dateScope.from;
};

const hasInvalidPairingLengthBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_LENGTH_PROPERTY_CODE
  && property.bid.type !== "pairing-length-preference"
  && property.bid.type !== "stepper"
  && property.bid.type !== "stepper-range";

const hasInvalidLayoverOnDateOrDayBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_LAYOVER_ON_DATE_OR_DAY_PROPERTY_CODE
  && property.bid.type !== "date-or-dow-list"
  && property.bid.type !== "date-range";

const hasInvalidLayoverOnDateOrDayQuantifier = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_LAYOVER_ON_DATE_OR_DAY_PROPERTY_CODE
  && property.quantifier !== "any"
  && property.quantifier !== "every";

const isDateOrDowBid = (property: PairingPropertyPayload) =>
  property.bid.type === "date-or-dow-list"
  || property.bid.type === "date-range";

const hasInvalidEnrouteCheckInDateOrDayBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_ANY_ENROUTE_CHECK_IN_DATE_OR_DAY_PROPERTY_CODE
  && !isDateOrDowBid(property);

const hasInvalidEnrouteCheckOutDateOrDayBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_ANY_ENROUTE_CHECK_OUT_DATE_OR_DAY_PROPERTY_CODE
  && !isDateOrDowBid(property);

const hasInvalidEnrouteCheckInDateOrDayQuantifier = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_ANY_ENROUTE_CHECK_IN_DATE_OR_DAY_PROPERTY_CODE
  && property.quantifier !== "any"
  && property.quantifier !== "every";

const hasInvalidEnrouteCheckOutDateOrDayQuantifier = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_ANY_ENROUTE_CHECK_OUT_DATE_OR_DAY_PROPERTY_CODE
  && property.quantifier !== "any"
  && property.quantifier !== "every";

const hasInvalidTotalLegsInFirstDutyBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_TOTAL_LEGS_IN_FIRST_DUTY_PROPERTY_CODE
  && property.bid.type !== "stepper";

const hasUnsupportedTotalLegsInFirstDutyOperator = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_TOTAL_LEGS_IN_FIRST_DUTY_PROPERTY_CODE
  && property.bid.type === "stepper"
  && property.bid.operator !== ">"
  && property.bid.operator !== "<";

const hasInvalidTotalLegsInLastDutyBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_TOTAL_LEGS_IN_LAST_DUTY_PROPERTY_CODE
  && property.bid.type !== "stepper";

const hasUnsupportedTotalLegsInLastDutyOperator = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_TOTAL_LEGS_IN_LAST_DUTY_PROPERTY_CODE
  && property.bid.type === "stepper"
  && property.bid.operator !== ">";

const hasInvalidTotalLegsInLastDutyQuantifier = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_TOTAL_LEGS_IN_LAST_DUTY_PROPERTY_CODE
  && property.quantifier !== null
  && property.quantifier !== undefined;

const hasInvalidTotalBlockTimeBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_TOTAL_BLOCK_TIME_PROPERTY_CODE
  && property.bid.type !== "duration"
  && property.bid.type !== "duration-range";

const hasUnsupportedTotalBlockTimeOperator = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_TOTAL_BLOCK_TIME_PROPERTY_CODE
  && property.bid.type === "duration"
  && property.bid.operator !== ">";

const hasInvalidCreditPerTimeAwayFromBaseBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_CREDIT_PER_TIME_AWAY_FROM_BASE_PROPERTY_CODE
  && property.bid.type !== "percent-or-duration";

const hasUnsupportedCreditPerTimeAwayFromBaseOperator = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_CREDIT_PER_TIME_AWAY_FROM_BASE_PROPERTY_CODE
  && property.bid.type === "percent-or-duration"
  && property.bid.operator !== ">"
  && property.bid.operator !== "<";

const hasInvalidCreditPerTimeAwayFromBaseUnit = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_CREDIT_PER_TIME_AWAY_FROM_BASE_PROPERTY_CODE
  && property.bid.type === "percent-or-duration"
  && property.bid.unit !== "percent"
  && property.bid.unit !== "duration";

const hasInvalidCreditPerTimeAwayFromBasePercentValue = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_CREDIT_PER_TIME_AWAY_FROM_BASE_PROPERTY_CODE
  && property.bid.type === "percent-or-duration"
  && property.bid.unit === "percent"
  && (
    typeof property.bid.value !== "string"
    || !/^[+-]?(?:\d+|\d*\.\d+)$/.test(property.bid.value.trim().replace(/\s*%$/, ""))
  );

const hasInvalidCreditPerTimeAwayFromBaseDurationValue = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_CREDIT_PER_TIME_AWAY_FROM_BASE_PROPERTY_CODE
  && property.bid.type === "percent-or-duration"
  && property.bid.unit === "duration"
  && (
    typeof property.bid.value !== "string"
    || !/^\d{1,3}:\d{2}$/.test(property.bid.value.trim())
    || Number.parseInt(property.bid.value.trim().split(":")[1] ?? "", 10) >= 60
  );

const hasInvalidLegWithEmployeeNumberBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_LEG_WITH_EMPLOYEE_NUMBER_PROPERTY_CODE
  && property.bid.type !== "tag-list";

const hasEmptyListBid = (property: PairingPropertyPayload) =>
  !("values" in property.bid)
  || !Array.isArray(property.bid.values)
  || property.bid.values.filter((value) => typeof value === "string" && value.trim().length > 0).length === 0;

const hasEmptyLegWithEmployeeNumberBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_LEG_WITH_EMPLOYEE_NUMBER_PROPERTY_CODE
  && property.bid.type === "tag-list"
  && hasEmptyListBid(property);

const hasInvalidLegWithEmployeeNumberQuantifier = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_LEG_WITH_EMPLOYEE_NUMBER_PROPERTY_CODE
  && property.quantifier !== "any"
  && property.quantifier !== "every";

const hasInvalidFlightNumberPreferenceBid = (property: PairingPropertyPayload) => {
  if (property.propertyCode !== FLIGHT_NUMBER_PREFERENCE_PROPERTY_CODE) {
    return false;
  }

  if (property.bid.type !== "flight-number-preference") {
    return true;
  }

  if (property.quantifier != null) {
    return true;
  }

  const { flightNumbers, dateScope } = property.bid;

  if (!Array.isArray(flightNumbers)
    || flightNumbers.length === 0
    || flightNumbers.some((value) => typeof value !== "string" || value.trim().length === 0)) {
    return true;
  }

  if (dateScope == null) {
    return false;
  }

  if (!isRecord(dateScope)) {
    return true;
  }

  return dateScope.mode === "specific_dates"
    ? !Array.isArray(dateScope.dates)
      || dateScope.dates.length === 0
      || dateScope.dates.some((date) => typeof date !== "string" || !isValidIsoDate(date))
    : dateScope.mode === "date_range"
      ? !isValidIsoDate(dateScope.from) || !isValidIsoDate(dateScope.to) || dateScope.to < dateScope.from
      : true;
};

const hasInvalidRedeyePreferenceBid = (property: PairingPropertyPayload) => {
  if (property.propertyCode !== REDEYE_PREFERENCE_PROPERTY_CODE) {
    return false;
  }

  if (property.bid.type !== "redeye-preference") {
    return true;
  }

  const { dateScope } = property.bid;
  if (dateScope == null) {
    return false;
  }

  if (!isRecord(dateScope)) {
    return true;
  }

  return dateScope.mode === "specific_dates"
    ? !Array.isArray(dateScope.dates)
      || dateScope.dates.length === 0
      || dateScope.dates.some((date) => !isValidIsoDate(date))
    : dateScope.mode === "date_range"
      ? !isValidIsoDate(dateScope.from) || !isValidIsoDate(dateScope.to) || dateScope.to < dateScope.from
      : true;
};

const hasInvalidRedeyePreferenceQuantifier = (property: PairingPropertyPayload) => {
  if (property.propertyCode !== REDEYE_PREFERENCE_PROPERTY_CODE) {
    return false;
  }

  return property.quantifier != null;
};

const hasInvalidDeadheadFlyingBid = (property: PairingPropertyPayload) => {
  if (property.propertyCode !== DEADHEAD_FLYING_PROPERTY_CODE) {
    return false;
  }

  if (property.bid.type !== "deadhead-flying") {
    return true;
  }

  if (Object.keys(property.bid).some((key) => !["type", "mode", "dateScope"].includes(key))) {
    return true;
  }

  if (property.bid.mode !== "any-deadhead" && property.bid.mode !== "deadhead-only-duty") {
    return true;
  }

  const dateScope = property.bid.dateScope;
  if (dateScope == null) {
    return false;
  }

  if (!isRecord(dateScope)) {
    return true;
  }

  if (dateScope.mode === "specific_dates") {
    return Object.keys(dateScope).some((key) => !["mode", "dates"].includes(key))
      || !Array.isArray(dateScope.dates)
      || dateScope.dates.length === 0
      || dateScope.dates.some((date) => !isValidIsoDate(date));
  }

  return Object.keys(dateScope).some((key) => !["mode", "from", "to"].includes(key))
    || dateScope.mode !== "date_range"
    || !isValidIsoDate(dateScope.from)
    || !isValidIsoDate(dateScope.to)
    || dateScope.to < dateScope.from;
};

const hasInvalidDeadheadFlyingQuantifier = (property: PairingPropertyPayload) =>
  property.propertyCode === DEADHEAD_FLYING_PROPERTY_CODE
  && property.quantifier != null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isValidIsoDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

const hasInvalidPairingCheckTimeDateScope = (property: PairingPropertyPayload) => {
  if (property.propertyCode !== PAIRING_CHECK_IN_TIME_PROPERTY_CODE || property.bid.dateScope == null) {
    return false;
  }

  const condition = property.bid.dateScope;
  if (!isRecord(condition)) {
    return true;
  }

  if (condition.mode === "specific_dates") {
    return !Array.isArray(condition.dates)
      || condition.dates.length === 0
      || condition.dates.some((date) => !isValidIsoDate(date));
  }

  return condition.mode !== "date_range"
    || !isValidIsoDate(condition.from)
    || !isValidIsoDate(condition.to)
    || condition.to < condition.from;
};

const hasInvalidFlightLegsPerDutyBid = (property: PairingPropertyPayload) => {
  if (property.propertyCode !== FLIGHT_LEGS_PER_DUTY_PROPERTY_CODE) {
    return false;
  }

  if (property.bid.type !== "flight-legs-per-duty") {
    return true;
  }

  const bounds = pairingPropertyDefinitionByCode.get(
    FLIGHT_LEGS_PER_DUTY_PROPERTY_CODE,
  )?.numericBounds ?? { min: 1, max: 8 };
  const isValidLegCount = (value: unknown) =>
    typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= bounds.min
    && value <= bounds.max;

  if (property.bid.operator === "Between") {
    return !isValidLegCount(property.bid.from)
      || !isValidLegCount(property.bid.to)
      || property.bid.legs != null
      || (typeof property.bid.from === "number"
        && typeof property.bid.to === "number"
        && property.bid.from > property.bid.to);
  }

  return property.bid.operator !== "<"
    && property.bid.operator !== "="
    && property.bid.operator !== ">"
    || !isValidLegCount(property.bid.legs)
    || property.bid.from != null
    || property.bid.to != null;
};

const hasInvalidFlightLegsPerDutyQuantifier = (property: PairingPropertyPayload) =>
  property.propertyCode === FLIGHT_LEGS_PER_DUTY_PROPERTY_CODE
  && property.quantifier !== "any"
  && property.quantifier !== "every";

const hasInvalidFlightLegsPerDutyDateScope = (property: PairingPropertyPayload) => {
  if (property.propertyCode !== FLIGHT_LEGS_PER_DUTY_PROPERTY_CODE || property.bid.dateScope == null) {
    return false;
  }

  const condition = property.bid.dateScope;
  if (!isRecord(condition)) {
    return true;
  }

  if (condition.mode === "specific_dates") {
    return !Array.isArray(condition.dates)
      || condition.dates.length === 0
      || condition.dates.some((date) => !isValidIsoDate(date));
  }

  return condition.mode !== "date_range"
    || !isValidIsoDate(condition.from)
    || !isValidIsoDate(condition.to)
    || condition.to < condition.from;
};

const isValidDuration = (value: unknown): value is string =>
  typeof value === "string"
  && /^\d{1,3}:\d{2}$/.test(value.trim())
  && Number.parseInt(value.trim().split(":")[1] ?? "", 10) < 60;

const getPairingLengthBounds = () => {
  const defaultBid = pairingPropertyDefinitionByCode.get(PAIRING_LENGTH_PROPERTY_CODE)?.defaultBid;

  if (isRecord(defaultBid) && defaultBid.type === "pairing-length-preference") {
    return {
      min: typeof defaultBid.min === "number" ? defaultBid.min : 1,
      max: typeof defaultBid.max === "number" ? defaultBid.max : 7,
    };
  }

  return { min: 1, max: 7 };
};

const isAirportPreferenceBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_AIRPORT_PREFERENCE_PROPERTY_CODE
  && property.bid.type === "airport-preference";

const hasInvalidAirportPreferenceBid = (property: PairingPropertyPayload) =>
  property.propertyCode === PAIRING_AIRPORT_PREFERENCE_PROPERTY_CODE
  && property.bid.type !== "airport-preference";

const hasInvalidAirportPreferenceEvent = (property: PairingPropertyPayload) =>
  isAirportPreferenceBid(property)
  && property.bid.event !== "landing"
  && property.bid.event !== "layover"
  && property.bid.event !== "landing_or_layover";

const hasInvalidAirportPreferenceLocations = (property: PairingPropertyPayload) =>
  isAirportPreferenceBid(property)
  && (
    !Array.isArray(property.bid.locations)
    || property.bid.locations.length === 0
    || property.bid.locations.some((value) => !isRecord(value)
      || (value.kind !== "airport" && value.kind !== "city")
      || typeof value.code !== "string" || value.code.trim().length !== 3)
  );

const hasInvalidAirportPreferenceDateScope = (property: PairingPropertyPayload) => {
  if (!isAirportPreferenceBid(property) || property.bid.dateScope == null) {
    return false;
  }

  const condition = property.bid.dateScope;

  if (!isRecord(condition)) {
    return true;
  }

  if (condition.mode === "specific_dates") {
    return !Array.isArray(condition.dates)
      || condition.dates.length === 0
      || condition.dates.some((date) => !isValidIsoDate(date));
  }

  if (condition.mode === "date_range") {
    const from = condition.from;
    const to = condition.to;

    if (!isValidIsoDate(from) || !isValidIsoDate(to)) {
      return true;
    }

    return to < from;
  }

  return true;
};

const hasEventDateOutsidePeriod = (property: PairingPropertyPayload, periodCode?: string) => {
  const isPairingLength = property.propertyCode === PAIRING_LENGTH_PROPERTY_CODE;
  if (
    property.propertyCode !== PAIRING_CHECK_IN_TIME_PROPERTY_CODE
    && property.propertyCode !== FLIGHT_LEGS_PER_DUTY_PROPERTY_CODE
    && property.propertyCode !== PAIRING_DUTY_ON_DATE_OR_DAY_PROPERTY_CODE
    && property.propertyCode !== PAIRING_AIRPORT_PREFERENCE_PROPERTY_CODE
    && property.propertyCode !== FLIGHT_NUMBER_PREFERENCE_PROPERTY_CODE
    && property.propertyCode !== REDEYE_PREFERENCE_PROPERTY_CODE
    && property.propertyCode !== DEADHEAD_FLYING_PROPERTY_CODE
    && !isPairingLength
  ) {
    return false;
  }

  const condition = property.bid.dateScope;
  if (condition == null) {
    return false;
  }

  if (!isRecord(condition)) {
    return true;
  }

  if (!periodCode) {
    return !isPairingLength;
  }

  if (condition.mode === "specific_dates" && Array.isArray(condition.dates)) {
    return condition.dates.some((date) => typeof date !== "string" || !isIsoDateInPeriod(date, periodCode));
  }

  return condition.mode !== "date_range"
    || typeof condition.from !== "string"
    || typeof condition.to !== "string"
    || !isIsoDateInPeriod(condition.from, periodCode)
    || !isIsoDateInPeriod(condition.to, periodCode);
};

const hasInvalidAirportPreferenceLayoverDuration = (property: PairingPropertyPayload) => {
  if (!isAirportPreferenceBid(property) || property.bid.minimumLayoverDuration == null) {
    return false;
  }

  return property.bid.event === "landing"
    || typeof property.bid.minimumLayoverDuration !== "string"
    || !isValidDuration(property.bid.minimumLayoverDuration);
};

const hasInvalidPairingLengthDays = (property: PairingPropertyPayload) => {
  if (property.propertyCode !== PAIRING_LENGTH_PROPERTY_CODE || property.bid.type !== "pairing-length-preference") {
    return false;
  }

  const bounds = getPairingLengthBounds();
  const minDays = property.bid.minDays;
  const maxDays = property.bid.maxDays;
  const hasMin = minDays !== null && minDays !== undefined;
  const hasMax = maxDays !== null && maxDays !== undefined;
  const isValidDay = (value: unknown) =>
    typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= bounds.min
    && value <= bounds.max;

  return (!hasMin && !hasMax)
    || (hasMin && !isValidDay(minDays))
    || (hasMax && !isValidDay(maxDays))
    || (hasMin && hasMax && typeof minDays === "number" && typeof maxDays === "number" && minDays > maxDays);
};

const hasInvalidPairingLengthDateScope = (property: PairingPropertyPayload) => {
  if (
    property.propertyCode !== PAIRING_LENGTH_PROPERTY_CODE
    || property.bid.type !== "pairing-length-preference"
    || property.bid.dateScope == null
  ) {
    return false;
  }

  const dateScope = property.bid.dateScope;

  if (!isRecord(dateScope)) {
    return true;
  }

  if (dateScope.mode === "specific_dates") {
    return !Array.isArray(dateScope.dates)
      || dateScope.dates.length === 0
      || dateScope.dates.some((date) => !isValidIsoDate(date));
  }

  if (dateScope.mode !== "date_range") {
    return true;
  }

  return !isValidIsoDate(dateScope.from)
    || !isValidIsoDate(dateScope.to)
    || dateScope.to < dateScope.from;
};

const hasInvalidMonthEndCarryoverBid = (property: PairingPropertyPayload) => {
  if (property.propertyCode !== MONTH_END_CARRYOVER_PROPERTY_CODE) {
    return false;
  }

  if (property.bid.type !== "month-end-carryover") {
    return true;
  }

  const isPositiveInteger = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0;

  if (property.bid.operator === "Between") {
    return !isPositiveInteger(property.bid.from)
      || !isPositiveInteger(property.bid.to)
      || (typeof property.bid.from === "number"
        && typeof property.bid.to === "number"
        && property.bid.from > property.bid.to);
  }

  return property.bid.operator !== "<"
    && property.bid.operator !== "="
    && property.bid.operator !== ">"
    || !isPositiveInteger(property.bid.days);
};

const hasInvalidMonthEndCarryoverQuantifier = (property: PairingPropertyPayload) =>
  property.propertyCode === MONTH_END_CARRYOVER_PROPERTY_CODE
  && property.quantifier != null;

const hasInvalidDateRange = (property: PairingPropertyPayload) =>
  (property.propertyCode === PAIRING_DEPARTING_ON_PROPERTY_CODE
    || property.propertyCode === PAIRING_LAYOVER_ON_DATE_OR_DAY_PROPERTY_CODE
    || property.propertyCode === PAIRING_ANY_ENROUTE_CHECK_IN_DATE_OR_DAY_PROPERTY_CODE
    || property.propertyCode === PAIRING_ANY_ENROUTE_CHECK_OUT_DATE_OR_DAY_PROPERTY_CODE)
  && property.bid.type === "date-range"
  && typeof property.bid.from === "string"
  && typeof property.bid.to === "string"
  && (!/^\d{4}-\d{2}-\d{2}$/.test(property.bid.from)
    || !/^\d{4}-\d{2}-\d{2}$/.test(property.bid.to)
    || property.bid.to < property.bid.from);

export const validatePairingPropertyPayload = (
  property: PairingPropertyPayload,
  periodCode?: string,
): string | null => {
  const definition = pairingPropertyDefinitionByCode.get(property.propertyCode);
  const supportedActions = definition?.supportedActions ?? [];

  if (
    supportedActions.length > 0
    && (property.action === null || property.action === undefined || !supportedActions.includes(property.action))
  ) {
    return "Pairing Mode is required.";
  }

  if (hasInvalidCheckInTimeBid(property)) return "Pairing Check-In / Check-Out Time requires pairing-check-time bid.";
  if (hasInvalidEfficientFlyingBid(property)) return "Efficient Flying First requires Efficient or Inefficient flying.";
  if (hasInvalidPairingCheckTimeDateScope(property)) return "Pairing Check-In / Check-Out Time date scope is invalid.";
  if (hasInvalidFlightLegsPerDutyBid(property)) return "Flight Legs per Duty is invalid.";
  if (hasInvalidFlightLegsPerDutyQuantifier(property)) return "Flight Legs per Duty requires Any or Every.";
  if (hasInvalidFlightLegsPerDutyDateScope(property)) return "Flight Legs per Duty date scope is invalid.";
  if (hasInvalidTotalCreditBid(property)) return "Pairing Total Credit requires duration bid.";
  if (hasInvalidAverageDailyCreditBid(property)) return "Average Daily Credit requires duration bid.";
  if (hasInvalidAverageDailyBlockTimeBid(property)) return "Average Daily Block Time requires duration bid.";
  if (hasUnsupportedAverageDailyBlockTimeOperator(property)) return "Average Daily Block Time supports < or > only.";
  if (hasInvalidTafbBid(property)) return "TAFB requires a day value.";
  if (hasUnsupportedTafbEqualsOperator(property)) return "TAFB supports <, >, or Between only.";
  if (hasInvalidDutyDurationBid(property)) return "Any/Every Duty Duration requires duration bid.";
  if (hasUnsupportedDutyDurationEqualsOperator(property)) return "Any/Every Duty Duration supports <, >, or Between only.";
  if (hasInvalidDutyDurationQuantifier(property)) return "Any/Every Duty Duration requires Any or Every.";
  if (hasInvalidLayoverDurationBid(property)) return "Any/Every Layover Duration requires duration bid.";
  if (hasUnsupportedLayoverDurationEqualsOperator(property)) return "Any/Every Layover Duration supports < or > only.";
  if (hasInvalidLayoverDurationQuantifier(property)) return "Any/Every Layover Duration requires Any or Every.";
  if (hasInvalidTimeBetweenFlightsBid(property)) return "Time Between Flights requires a duration and <, =, or > comparison.";
  if (hasInvalidTimeBetweenFlightsQuantifier(property)) return "Time Between Flights requires Any or Every.";
  if (hasInvalidAnyEnrouteCheckInTimeBid(property)) return "Any/Every Enroute Check-In Time requires time bid.";
  if (hasInvalidAnyEnrouteCheckInTimeQuantifier(property)) return "Any/Every Enroute Check-In Time requires Any or Every.";
  if (hasInvalidAnyDutyOnTimeBid(property)) return "Any Duty On Time requires time bid.";
  if (hasInvalidDepartureTimeBid(property)) return "Departure Time requires time bid.";
  if (hasInvalidAnyDutyOnTimeQuantifier(property)) return "Any Duty On Time requires Any.";
  if (hasInvalidAnyEnrouteCheckOutTimeBid(property)) return "Any/Every Enroute Check-Out Time requires time bid.";
  if (hasUnsupportedAnyEnrouteCheckOutTimeOperator(property)) return "Any/Every Enroute Check-Out Time supports < or Between only.";
  if (hasInvalidAnyEnrouteCheckOutTimeQuantifier(property)) return "Any/Every Enroute Check-Out Time requires Any or Every.";
  if (hasInvalidDepartingOnBid(property)) return "Departure Date / Day requires date-or-dow bid.";
  if (hasInvalidDutyOnDateOrDayBid(property)) return "Work Day Preference requires work-day-preference bid.";
  if (hasInvalidWorkDayPreference(property)) return "Work Day Preference is invalid.";
  if (hasInvalidPairingLengthBid(property)) return "Pairing Length requires pairing-length bid.";
  if (hasInvalidPairingLengthDays(property)) return "Pairing Length days are invalid.";
  if (hasInvalidPairingLengthDateScope(property)) return "Pairing Length date scope is invalid.";
  if (hasInvalidMonthEndCarryoverBid(property)) return "Month-End Carryover is invalid.";
  if (hasInvalidMonthEndCarryoverQuantifier(property)) return "Month-End Carryover does not support Any or Every.";
  if (hasInvalidLayoverOnDateOrDayBid(property)) return "Any/Every Layover On Date / Day requires date-or-dow bid.";
  if (hasInvalidLayoverOnDateOrDayQuantifier(property)) return "Any/Every Layover On Date / Day requires Any or Every.";
  if (hasInvalidEnrouteCheckInDateOrDayBid(property)) return "Any/Every Enroute Check-In Date / Day requires date-or-dow bid.";
  if (hasInvalidEnrouteCheckOutDateOrDayBid(property)) return "Any/Every Enroute Check-Out Date / Day requires date-or-dow bid.";
  if (hasInvalidEnrouteCheckInDateOrDayQuantifier(property)) return "Any/Every Enroute Check-In Date / Day requires Any or Every.";
  if (hasInvalidEnrouteCheckOutDateOrDayQuantifier(property)) return "Any/Every Enroute Check-Out Date / Day requires Any or Every.";
  if (hasInvalidTotalLegsInFirstDutyBid(property)) return "Total Legs In First Duty requires number bid.";
  if (hasUnsupportedTotalLegsInFirstDutyOperator(property)) return "Total Legs In First Duty supports < or > only.";
  if (hasInvalidTotalLegsInLastDutyBid(property)) return "Total Legs In Last Duty requires number bid.";
  if (hasUnsupportedTotalLegsInLastDutyOperator(property)) return "Total Legs In Last Duty supports > only.";
  if (hasInvalidTotalLegsInLastDutyQuantifier(property)) return "Total Legs In Last Duty does not support Any or Every.";
  if (hasInvalidAirportPreferenceBid(property)) return "Airport Preference requires airport-preference bid.";
  if (hasInvalidAirportPreferenceEvent(property)) return "Airport Preference requires Landing, Layover, or Both.";
  if (hasInvalidAirportPreferenceLocations(property)) return "Airport Preference requires at least one airport or city.";
  if (hasInvalidAirportPreferenceDateScope(property)) return "Airport Preference date scope is invalid.";
  if (hasInvalidFlightNumberPreferenceBid(property)) return "Flight Number Preference is invalid.";
  if (hasInvalidRedeyePreferenceBid(property)) return "Redeye Preference is invalid.";
  if (hasInvalidRedeyePreferenceQuantifier(property)) return "Redeye Preference does not support Any or Every.";
  if (hasInvalidDeadheadFlyingBid(property)) return "Deadhead Flying is invalid.";
  if (hasInvalidDeadheadFlyingQuantifier(property)) return "Deadhead Flying does not support Any or Every.";
  if (hasEventDateOutsidePeriod(property, periodCode)) {
    return property.propertyCode === PAIRING_LENGTH_PROPERTY_CODE
      ? "Pairing Length start dates must be within the current bid period."
      : property.propertyCode === REDEYE_PREFERENCE_PROPERTY_CODE
        ? "Redeye Preference flight dates must be within the current bid period."
        : property.propertyCode === DEADHEAD_FLYING_PROPERTY_CODE
          ? "Deadhead Flying flight dates must be within the current bid period."
        : "Event dates must be within the current bid period.";
  }
  if (hasInvalidAirportPreferenceLayoverDuration(property)) return "Airport Preference layover duration is invalid.";
  if (hasInvalidTotalBlockTimeBid(property)) return "Pairing Total Block Time requires duration bid.";
  if (hasUnsupportedTotalBlockTimeOperator(property)) return "Pairing Total Block Time supports > or Between only.";
  if (hasInvalidCreditPerTimeAwayFromBaseBid(property)) return "Credit Per Time Away From Base requires percent or duration bid.";
  if (hasInvalidCreditPerTimeAwayFromBaseUnit(property)) return "Credit Per Time Away From Base requires percent or duration bid.";
  if (hasUnsupportedCreditPerTimeAwayFromBaseOperator(property)) return "Credit Per Time Away From Base supports < or > only.";
  if (hasInvalidCreditPerTimeAwayFromBasePercentValue(property)) return "Credit Per Time Away From Base percent value is invalid.";
  if (hasInvalidCreditPerTimeAwayFromBaseDurationValue(property)) return "Credit Per Time Away From Base duration value is invalid.";
  if (hasInvalidLegWithEmployeeNumberBid(property)) return "Any/Every Leg With Employee Number requires crew id list bid.";
  if (hasEmptyLegWithEmployeeNumberBid(property)) return "Any/Every Leg With Employee Number requires at least one crew id.";
  if (hasInvalidLegWithEmployeeNumberQuantifier(property)) return "Any/Every Leg With Employee Number requires Any or Every.";
  if (hasInvalidDateRange(property)) {
    return `${
      property.propertyCode === PAIRING_LAYOVER_ON_DATE_OR_DAY_PROPERTY_CODE
          ? "Any/Every Layover On Date / Day"
          : property.propertyCode === PAIRING_ANY_ENROUTE_CHECK_IN_DATE_OR_DAY_PROPERTY_CODE
            ? "Any/Every Enroute Check-In Date / Day"
            : property.propertyCode === PAIRING_ANY_ENROUTE_CHECK_OUT_DATE_OR_DAY_PROPERTY_CODE
              ? "Any/Every Enroute Check-Out Date / Day"
              : "Departure Date / Day"
    } date range end date must be on or after start date.`;
  }

  return null;
};
