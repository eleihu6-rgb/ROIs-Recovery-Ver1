import {
  pbsLineAaPropertyCodes,
  pbsSupportedLinePropertyCatalog,
} from "../../../../packages/contracts/pbs-line-bids.js";
import { pbsSupportedDaysOffPropertyCatalog } from "../../../../packages/contracts/pbs-days-off-bids.js";
import {
  pbsReserveLegacyPropertyCodes,
  pbsSupportedReservePropertyCatalog,
} from "../../../../packages/contracts/pbs-reserve-bids.js";

export const TIER_COUNT = 7;

export const LINE_RULES_CSV_HEADER = [
  "Crew_ID",
  "Code_ID",
  "Rule_ID",
  "Rule_Type",
  "Parameters_JSON",
  ...Array.from({ length: TIER_COUNT }, (_, index) => `T${index + 1}_Counter`),
  "Description",
];

export const DAYS_OFF_LINE_RULE_PROPERTY_CODES = new Set([202, 203, 204, 205, 206]);
export const DAYS_OFF_COMMUTER_PATTERN_ALGORITHM_RULE_CODES = new Set([202, 203, 205]);
export const RESERVE_LINE_RULE_PROPERTY_CODES: ReadonlySet<number> = new Set([pbsReserveLegacyPropertyCodes.shortCallType]);

export const LINE_RULE_METADATA = [
  [301, "RESERVE_SHORT_CALL_TYPE", "Short Call Type", "Reserve", "Reserve line-level call type rule for whole-month or date-range reserve call type preferences. Date ranges use {\"mode\":\"date_range\",\"start\":\"YYYY-MM-DD\",\"end\":\"YYYY-MM-DD\"}."],
  [202, "MAX_CONSECUTIVE_DAYS_ON", "Max Consecutive Days On", "DaysOff", "DaysOff rule-level constraint. Parameters_JSON is {\"minDaysOn\":1,\"maxDaysOn\":number,\"minDaysOff\":0,\"maxDaysOff\":0}."],
  [203, "MIN_CONSECUTIVE_DAYS_OFF", "Min Consecutive Days Off", "DaysOff", "DaysOff rule-level constraint. Parameters_JSON is {\"minDaysOn\":1,\"maxDaysOn\":bid month days,\"minDaysOff\":number,\"maxDaysOff\":bid month days}."],
  [204, "MIN_CONSECUTIVE_DAYS_OFF_IN_WINDOW", "Min Consecutive Days Off In Window", "DaysOff", "DaysOff rule-level constraint. Parameters_JSON is {\"minimumDaysOff\":number,\"from\":\"YYYY-MM-DD\",\"to\":\"YYYY-MM-DD\"}."],
  [205, "DAYS_OFF_DAYS_ON_PATTERN", "Days Off / Days On Pattern", "DaysOff", "DaysOff rule-level constraint. Parameters_JSON has minDaysOn, maxDaysOn, minDaysOff, maxDaysOff."],
  [206, "EMPLOYEE_SCHEDULE_PREFERENCE", "Employee Schedule Preference", "DaysOff", "DaysOff rule-level constraint. Parameters_JSON has crewId, optional crewName, relationship, scheduleType, mode, thresholdType, and days."],
  [401, "MAX_CREDIT_WINDOW", "Max Credit Window", "Legacy", "Parameters_JSON uses {\"deltaHours\": integer}."],
  [402, "MIN_CREDIT_WINDOW", "Min Credit Window", "Legacy", "Parameters_JSON uses {\"deltaHours\": integer}."],
  [403, "CLEAR_SCHEDULE_AND_START_NEXT_BID_GROUP", "Clear Schedule and Start Next Bid Group", "Legacy", "Flag rule. Parameters_JSON is {}."],
  [404, "NO_SAME_DAY_PAIRINGS", "No Same Day Pairings", "Legacy", "Flag rule. Parameters_JSON is {}."],
  [405, "WAIVE_NO_SAME_DAY_DUTY_STARTS", "Waive No Same Day Duty Starts", "Legacy", "Flag rule. Parameters_JSON is {}."],
  [406, "FORGET_LINE", "Forget Line", "Legacy", "Stepper rule. Parameters_JSON is {\"operator\":\"=\",\"value\":number}."],
  [407, "MIN_BASE_LAYOVER", "Min Base Layover", "Legacy", "Text duration rule. Parameters_JSON is {\"value\":\"HHH:MM\"}."],
  [408, "COMMUTER_PATTERN", "Commuter Pattern", "Legacy", "Pattern rule. Parameters_JSON has minDaysOff, minDaysOn, maxDaysOn."],
  [409, "MOST_FLYING_IN_LEAST_WORKING_DAYS_CONFIGURED", "Most Flying In Least Working Days (Configured)", "Legacy", "Credit density rule. Parameters_JSON has minimumTotalCredit, maximumWorkingDays, strength."],
  [410, "RESERVE_FLYING_DATE_PATTERN", "Reserve / Flying Date Pattern", "Legacy", "Line reserve/flying pattern. Parameters_JSON has segments and strength."],
  [411, "TARGET_CREDIT_RANGE", "Target Credit Range", "AA", "Range rule. Parameters_JSON is {\"from\":number,\"to\":number}."],
  [412, "MAXIMIZE_CREDIT", "Maximize Credit", "AA", "Flag rule. Parameters_JSON is {}."],
  [413, "MAXIMIZE_INTERNATIONAL_CREDIT", "Maximize International Credit", "AA", "Flag rule. Parameters_JSON is {}."],
  [414, "WORK_BLOCK_SIZE", "Work Block Size", "AA", "Range rule. Parameters_JSON is {\"from\":number,\"to\":number}."],
  [415, "PREFER_CADENCE_ON_DAY_OF_WEEK", "Prefer Cadence on Day-of-Week", "AA", "Select rule. Parameters_JSON is {\"value\":\"Mon\"}."],
  [416, "COMMUTABLE_WORK_BLOCK", "Commutable Work Block", "AA", "Time range rule. Parameters_JSON is {\"from\":\"HH:MM\",\"to\":\"HH:MM\"}."],
  [417, "PAIRING_MIX_IN_WORK_BLOCK", "Pairing Mix in a Work Block", "AA", "Tag list rule. Parameters_JSON is {\"values\":[\"3,1\"]}."],
  [418, "ALLOW_DOUBLE_UP_ON_DATE", "Allow Double-Up on Date", "AA", "Date rule. Parameters_JSON is {\"date\":\"YYYY-MM-DD\",\"operator\":\"=\"}."],
  [419, "ALLOW_MULTIPLE_PAIRINGS", "Allow Multiple Pairings", "AA", "Flag rule. Parameters_JSON is {}."],
  [420, "ALLOW_MULTIPLE_PAIRINGS_ON_DATE", "Allow Multiple Pairings on Date", "AA", "Date rule. Parameters_JSON is {\"date\":\"YYYY-MM-DD\",\"operator\":\"=\"}."],
  [421, "ALLOW_CO_TERMINAL_MIX_IN_WORK_BLOCK", "Allow Co-Terminal Mix in Work Block", "AA", "Flag rule. Parameters_JSON is {}."],
  [422, "CLEAR_BIDS", "Clear Bids", "AA", "Flag rule. Parameters_JSON is {}."],
  [423, "WAIVE_24_HOURS_REST_IN_DOMICILE", "Waive 24 hrs Rest in Domicile", "AA", "Flag rule. Parameters_JSON is {}."],
  [424, "WAIVE_MINIMUM_DOMICILE_REST", "Waive Minimum Domicile Rest", "AA", "Flag rule. Parameters_JSON is {}."],
  [425, "WAIVE_30_HOURS_IN_7_DAYS", "Waive 30 hrs in 7 Days", "AA", "Flag rule. Parameters_JSON is {}."],
  [426, "WAIVE_CARRY_OVER_CREDIT", "Waive Carry-Over Credit", "AA", "Flag rule. Parameters_JSON is {}."],
  [427, "RESERVE", "Reserve", "AA", "Award/Avoid rule. Parameters_JSON is {\"action\":\"award|avoid\",\"scope\":\"whole_bid_month\"}."],
] as const;

export type LineRuleMetadata = {
  ruleId: number;
  ruleType: string;
  name: string;
  source: string;
  parameters: string;
};

export const ruleMetadataById: Map<number, LineRuleMetadata> = new Map(
  LINE_RULE_METADATA.map(([ruleId, ruleType, name, source, parameters]) => [
    ruleId,
    { ruleId, ruleType, name, source, parameters },
  ]),
);

export const getAlgorithmLineRuleMetadata = (
  codeId: number,
  metadata: LineRuleMetadata,
): Pick<LineRuleMetadata, "ruleId" | "ruleType"> => {
  if (DAYS_OFF_COMMUTER_PATTERN_ALGORITHM_RULE_CODES.has(codeId)) {
    return {
      ruleId: 408,
      ruleType: "COMMUTER_PATTERN",
    };
  }

  return {
    ruleId: metadata.ruleId,
    ruleType: metadata.ruleType,
  };
};

export const propertyCatalogByCode = new Map(
  pbsSupportedLinePropertyCatalog.map((property) => [property.propertyCode, property]),
);

export const daysOffPropertyCatalogByCode = new Map(
  pbsSupportedDaysOffPropertyCatalog.map((property) => [property.propertyCode, property]),
);

export const reservePropertyCatalogByCode = new Map(
  pbsSupportedReservePropertyCatalog.map((property) => [property.propertyCode, property]),
);

export { pbsLineAaPropertyCodes };
