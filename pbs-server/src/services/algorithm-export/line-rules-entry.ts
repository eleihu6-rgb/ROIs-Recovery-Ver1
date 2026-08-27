import type { PbsDaysOffBidValue } from "../../../../packages/contracts/pbs-days-off-bids.js";
import {
  parsePbsLineCreditWindowPreferenceBid,
  pbsLineF8PropertyCodes,
  type PbsLineBidValue,
  type PbsLinePropertyDefinition,
} from "../../../../packages/contracts/pbs-line-bids.js";
import type { PbsReserveBidValue } from "../../../../packages/contracts/pbs-reserve-bids.js";
import { deserializeRuleBid, formatRuleBid } from "../lineholder/rule-bid-value.js";
import {
  DAYS_OFF_LINE_RULE_PROPERTY_CODES,
  RESERVE_LINE_RULE_DATE_SCOPE_MODES,
  RESERVE_LINE_RULE_PROPERTY_CODES,
  daysOffPropertyCatalogByCode,
  getAlgorithmLineRuleMetadata,
  pbsLineAaPropertyCodes,
  propertyCatalogByCode,
  reservePropertyCatalogByCode,
  ruleMetadataById,
} from "./line-rules-metadata.js";
import {
  buildLineRuleParameters,
  compactDateScope,
  stableJsonStringify,
} from "./line-rules-parameters.js";
import type { JsonValue, LineRuleExportEntry, LineRuleGroupRow } from "./line-rules-types.js";

const buildDescription = (definition: PbsLinePropertyDefinition, bid: PbsLineBidValue) =>
  `${definition.name}: ${formatRuleBid(bid)}.`;

const mapExplicitActionFromId = (actionId: number | null): "award" | "avoid" | null => {
  if (actionId === 1) {
    return "award";
  }

  if (actionId === 2) {
    return "avoid";
  }

  return null;
};

const buildReserveRuleEntry = (row: LineRuleGroupRow): LineRuleExportEntry | null => {
  const metadata = ruleMetadataById.get(pbsLineAaPropertyCodes.reserve);

  if (!metadata) {
    return null;
  }

  if (row.operator || row.paramA || row.paramB || row.paramC) {
    return null;
  }

  const action = mapExplicitActionFromId(row.actionId);
  if (!action) {
    return null;
  }

  return {
    crewId: row.crewId,
    codeId: pbsLineAaPropertyCodes.reserve,
    ruleId: pbsLineAaPropertyCodes.reserve,
    ruleType: metadata.ruleType,
    parametersJson: stableJsonStringify({
      action,
      scope: "whole_bid_month",
    }),
    description: action === "avoid"
      ? "No Reserve for the whole bid month."
      : "Award only Reserve for the whole bid month; require the line to be reserve-only.",
    tier: row.tier,
  };
};

const buildCreditWindowPreferenceEntry = (
  row: LineRuleGroupRow,
  deltaHours: number,
): LineRuleExportEntry | null => {
  if (row.operator !== "Json" || !row.paramA) {
    return null;
  }

  let bid: Extract<PbsLineBidValue, { type: "credit-window-preference" }> | null = null;
  try {
    bid = parsePbsLineCreditWindowPreferenceBid(JSON.parse(row.paramA));
  } catch {
    return null;
  }

  if (!bid) {
    return null;
  }

  const moreCredit = bid.direction === "more";
  return {
    crewId: row.crewId,
    codeId: moreCredit ? 401 : 402,
    ruleId: moreCredit ? 401 : 402,
    ruleType: moreCredit ? "MAX_CREDIT_WINDOW" : "MIN_CREDIT_WINDOW",
    parametersJson: stableJsonStringify({ deltaHours }),
    description: moreCredit
      ? `More credit: aim up to ${deltaHours}h above the period credit target, capped at credit max.`
      : `Less credit: aim up to ${deltaHours}h below the period credit target, floored at credit min.`,
    tier: row.tier,
  };
};

const buildDaysOffRuleParameters = (bid: PbsDaysOffBidValue): JsonValue | null => {
  if (bid.type === "stepper") {
    return {
      value: bid.value,
    };
  }

  if (bid.type === "stepper-date-range") {
    return {
      from: bid.from,
      minimumDaysOff: bid.value,
      to: bid.to,
    };
  }

  if (bid.type === "days-off-on-pattern") {
    return {
      maxDaysOn: bid.maxDaysOn,
      maxDaysOff: bid.minDaysOff,
      minDaysOff: bid.minDaysOff,
      minDaysOn: bid.minDaysOn,
      ...(bid.dateRange ? { dateRange: bid.dateRange } : {}),
    };
  }

  if (bid.type === "crew-days-off-share") {
    return {
      crewId: bid.employeeNumber,
      relationship: "together",
      scheduleType: "days_off",
      mode: "same_days_off",
      thresholdType: "minimum",
      days: bid.minimumDays,
    };
  }

  if (bid.type === "employee-schedule-preference") {
    const mode = bid.relationship === "apart"
      ? bid.scheduleType === "work" ? "different_pairing" : "opposite_days_off"
      : bid.scheduleType === "work" ? "same_pairing" : "same_days_off";

    return {
      crewId: bid.crewId ?? (bid as { employeeNumber?: string }).employeeNumber ?? "",
      ...(bid.crewName ? { crewName: bid.crewName } : {}),
      relationship: bid.relationship,
      scheduleType: bid.scheduleType,
      mode,
      thresholdType: bid.thresholdType,
      days: bid.days,
    };
  }

  return null;
};

const mapActionFromId = (actionId: number | null): "award" | "avoid" => {
  if (actionId === 2) {
    return "avoid";
  }

  return "award";
};

const normalizeDaysOffRuleParameters = (
  ruleId: number,
  parameters: JsonValue,
  bidMonthDayCount: number,
): JsonValue | null => {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
    return null;
  }

  if (ruleId === 202 && typeof parameters.value === "number") {
    return {
      maxDaysOff: 0,
      maxDaysOn: parameters.value,
      minDaysOff: 0,
      minDaysOn: parameters.value,
    };
  }

  if (ruleId === 203 && typeof parameters.value === "number") {
    return {
      maxDaysOff: parameters.value,
      maxDaysOn: bidMonthDayCount,
      minDaysOff: parameters.value,
      minDaysOn: 1,
    };
  }

  return parameters;
};

const buildDaysOffRuleDescription = (
  ruleId: number,
  definitionName: string,
  parameters: JsonValue,
) => {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
    return `DaysOff rule: ${definitionName}.`;
  }

  if (ruleId === 202) {
    if (typeof parameters.maximumDaysOn === "number") {
      return `DaysOff rule: ${definitionName} is ${parameters.maximumDaysOn}.`;
    }

    if (typeof parameters.value === "number") {
      return `DaysOff rule: ${definitionName} is ${parameters.value}.`;
    }
  }

  if (ruleId === 203) {
    if (typeof parameters.minimumDaysOff === "number") {
      return `DaysOff rule: ${definitionName} is ${parameters.minimumDaysOff}.`;
    }

    if (typeof parameters.value === "number") {
      return `DaysOff rule: ${definitionName} is ${parameters.value}.`;
    }
  }

  if (
    ruleId === 204
    && typeof parameters.minimumDaysOff === "number"
    && typeof parameters.from === "string"
    && typeof parameters.to === "string"
  ) {
    return `DaysOff rule: ${definitionName} is ${parameters.minimumDaysOff} from ${parameters.from} to ${parameters.to}.`;
  }

  if (
    ruleId === 205
    && typeof parameters.minDaysOff === "number"
    && typeof parameters.minDaysOn === "number"
    && typeof parameters.maxDaysOn === "number"
  ) {
    return `DaysOff rule: ${definitionName} requires ${parameters.minDaysOff} days off, ${parameters.minDaysOn}-${parameters.maxDaysOn} days on.`;
  }

  if (
    ruleId === 206
    && typeof parameters.crewId === "string"
    && typeof parameters.days === "number"
  ) {
    const threshold = parameters.thresholdType === "maximum" ? "maximum" : "minimum";
    const relationPhrase = parameters.relationship === "apart" ? "apart from" : "together with";
    const schedulePhrase = parameters.scheduleType === "work" ? "work days" : "days off";

    return `DaysOff rule: ${definitionName} with ${threshold} ${parameters.days} ${schedulePhrase} ${relationPhrase} crew ${parameters.crewId}.`;
  }

  return `DaysOff rule: ${definitionName}.`;
};

const buildDaysOffLineRuleEntry = (
  row: LineRuleGroupRow,
  bidMonthDayCount: number,
): LineRuleExportEntry | null => {
  const ruleId = row.propertyCode ?? row.legacyPropertyCode;

  if (!DAYS_OFF_LINE_RULE_PROPERTY_CODES.has(ruleId)) {
    return null;
  }

  const metadata = ruleMetadataById.get(ruleId);
  const definition = daysOffPropertyCatalogByCode.get(ruleId);

  if (!metadata || !definition) {
    return null;
  }

  const bid = deserializeRuleBid(definition, {
    operator: row.operator,
    paramA: row.paramA,
    paramB: row.paramB,
    paramC: row.paramC,
  });
  const rawParameters = buildDaysOffRuleParameters(bid);
  const parameters = rawParameters ? normalizeDaysOffRuleParameters(ruleId, rawParameters, bidMonthDayCount) : null;
  const algorithmMetadata = getAlgorithmLineRuleMetadata(ruleId, metadata);

  if (!parameters) {
    return null;
  }

  return {
    crewId: row.crewId,
    codeId: ruleId,
    ruleId: algorithmMetadata.ruleId,
    ruleType: algorithmMetadata.ruleType,
    parametersJson: stableJsonStringify(parameters),
    description: buildDaysOffRuleDescription(ruleId, definition.name, rawParameters),
    tier: row.tier,
  };
};

const isReserveLineRuleBid = (
  bid: PbsReserveBidValue,
): bid is Extract<PbsReserveBidValue, { type: "reserve-call-type-date-scope" }> =>
  bid.type === "reserve-call-type-date-scope"
  && RESERVE_LINE_RULE_DATE_SCOPE_MODES.has(bid.dateScope.mode);

const buildReservePreferenceDescription = (
  action: "award" | "avoid",
  callType: string,
  dateScope: Extract<PbsReserveBidValue, { type: "reserve-call-type-date-scope" }>["dateScope"],
) => {
  const actionText = action === "avoid" ? "Avoid" : "Award";
  const scopeText = dateScope.mode === "date_range"
    ? `${dateScope.from} to ${dateScope.to}`
    : dateScope.mode.replace(/_/g, " ");

  return `${actionText} Reserve Preference ${callType} for ${scopeText}.`;
};

const buildReserveLineRuleEntry = (row: LineRuleGroupRow): LineRuleExportEntry | null => {
  const ruleId = row.propertyCode ?? row.legacyPropertyCode;

  if (!RESERVE_LINE_RULE_PROPERTY_CODES.has(ruleId)) {
    return null;
  }

  const metadata = ruleMetadataById.get(ruleId);
  const definition = reservePropertyCatalogByCode.get(ruleId);

  if (!metadata || !definition) {
    return null;
  }

  const bid = deserializeRuleBid(definition, {
    operator: row.operator,
    paramA: row.paramA,
    paramB: row.paramB,
    paramC: row.paramC,
  });

  if (!isReserveLineRuleBid(bid)) {
    return null;
  }

  const action = mapActionFromId(row.actionId);

  return {
    crewId: row.crewId,
    codeId: ruleId,
    ruleId,
    ruleType: metadata.ruleType,
    parametersJson: stableJsonStringify({
      action,
      callType: bid.callType,
      dateScope: compactDateScope(bid.dateScope),
    }),
    description: buildReservePreferenceDescription(action, bid.callType, bid.dateScope),
    tier: row.tier,
  };
};

export const buildLineRuleEntry = (
  row: LineRuleGroupRow,
  bidMonthDayCount: number,
  creditWindowDeltaHours: number | null = null,
): LineRuleExportEntry | null => {
  const ruleId = row.propertyCode ?? row.legacyPropertyCode;
  const definition = propertyCatalogByCode.get(ruleId);
  const metadata = ruleMetadataById.get(ruleId);

  if (row.bidType === "DaysOff") {
    return buildDaysOffLineRuleEntry(row, bidMonthDayCount);
  }

  if (row.bidType === "Reserve" || RESERVE_LINE_RULE_PROPERTY_CODES.has(ruleId)) {
    return buildReserveLineRuleEntry(row);
  }

  if (ruleId === pbsLineF8PropertyCodes.creditWindowPreference) {
    return creditWindowDeltaHours === null
      ? null
      : buildCreditWindowPreferenceEntry(row, creditWindowDeltaHours);
  }

  if (ruleId === pbsLineAaPropertyCodes.reserve) {
    return buildReserveRuleEntry(row);
  }

  if (!definition || !metadata) {
    return null;
  }

  const bid = deserializeRuleBid(definition, {
    operator: row.operator,
    paramA: row.paramA,
    paramB: row.paramB,
    paramC: row.paramC,
  });

  return {
    crewId: row.crewId,
    codeId: ruleId,
    ruleId,
    ruleType: metadata.ruleType,
    parametersJson: stableJsonStringify(buildLineRuleParameters(bid)),
    description: buildDescription(definition, bid),
    tier: row.tier,
  };
};
