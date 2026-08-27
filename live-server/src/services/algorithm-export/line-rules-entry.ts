import type { PbsDaysOffBidValue } from "../../../../packages/contracts/pbs-days-off-bids.js";
import {
  parsePbsLineCreditWindowPreferenceBid,
  type PbsLineBidValue,
  type PbsLinePropertyDefinition,
} from "../../../../packages/contracts/pbs-line-bids.js";
import {
  deserializeRuleBid,
  formatRuleBid,
  type RuleBidValue,
  type RulePropertyDefinition,
  type SerializedBid,
} from "../lineholder/rule-bid-value.js";
import {
  DAYS_OFF_LINE_RULE_PROPERTY_CODES,
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
  stableJsonStringify,
} from "./line-rules-parameters.js";
import {
  classifyReserveDateScope,
  type StandardReserveLineDateScope,
} from "./reserve-export-classification.js";
import type { JsonValue, LineRuleExportEntry, LineRuleGroupRow } from "./line-rules-types.js";

const buildDescription = (definition: PbsLinePropertyDefinition, bid: PbsLineBidValue) =>
  `${definition.name}: ${formatLineRuleBid(bid)}.`;

const deserializeLineRuleBid = (
  definition: PbsLinePropertyDefinition,
  serialized: SerializedBid,
): PbsLineBidValue => {
  const fallback = definition.defaultBid;

  if (fallback.type === "minimum-base-layover") {
    return {
      ...fallback,
      minimumDuration: serialized.paramA ?? fallback.minimumDuration,
    };
  }

  if (fallback.type === "credit-window-preference") {
    if (serialized.operator !== "Json" || !serialized.paramA) {
      return fallback;
    }

    try {
      const parsed: unknown = JSON.parse(serialized.paramA);
      return parsed
        && typeof parsed === "object"
        && "type" in parsed
        && parsed.type === "credit-window-preference"
        && "direction" in parsed
        && (parsed.direction === "more" || parsed.direction === "less")
        ? { type: "credit-window-preference", direction: parsed.direction }
        : fallback;
    } catch {
      return fallback;
    }
  }

  return deserializeRuleBid(
    definition as unknown as RulePropertyDefinition<RuleBidValue>,
    serialized,
  ) as PbsLineBidValue;
};

const formatLineRuleBid = (bid: PbsLineBidValue): string => {
  if (bid.type === "minimum-base-layover") {
    return `Minimum ${bid.minimumDuration}`;
  }

  if (bid.type === "credit-window-preference") {
    return bid.direction === "more" ? "More credit" : "Less credit";
  }

  return formatRuleBid(bid as RuleBidValue);
};

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

const buildMinimumBaseLayoverEntry = (row: LineRuleGroupRow): LineRuleExportEntry | null => {
  const match = row.paramA?.match(/^(\d{1,3}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isSafeInteger(hours) || minutes < 0 || minutes > 59) {
    return null;
  }

  const minHours = hours + minutes / 60;
  return {
    crewId: row.crewId,
    codeId: 403,
    ruleId: 403,
    ruleType: "MIN_BASE_LAYOVER",
    parametersJson: stableJsonStringify({ minHours }),
    description: `Min Base Layover: at least ${minHours}h at home base between pairings (system minimum 13h).`,
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
      minDaysOn: 1,
    };
  }

  if (ruleId === 203 && typeof parameters.value === "number") {
    return {
      maxDaysOff: bidMonthDayCount,
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

const mapActionFromId = (actionId: number | null): "award" | "avoid" => {
  if (actionId === 2) {
    return "avoid";
  }

  return "award";
};

const buildReserveShortCallTypeDescription = (
  action: "award" | "avoid",
  callType: string,
  dateScope: StandardReserveLineDateScope,
) => {
  const actionText = action === "avoid" ? "Avoid" : "Award";

  if (dateScope.mode === "whole_month") {
    return `${actionText} Reserve Short Call Type ${callType} for whole month.`;
  }

  return `${actionText} Reserve Short Call ${callType} for ${dateScope.start}..${dateScope.end}.`;
};

const buildReserveLineRuleEntry = (
  row: LineRuleGroupRow,
  periodStartDate: string,
  periodEndDate: string,
): LineRuleExportEntry | null => {
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

  if (bid.type !== "reserve-call-type-date-scope") {
    return null;
  }

  const classification = classifyReserveDateScope(bid.dateScope, periodStartDate, periodEndDate);

  if (classification.target !== "line_rules") {
    return null;
  }

  const action = mapActionFromId(row.actionId);

  return {
    crewId: row.crewId,
    codeId: ruleId,
    ruleId,
    ruleType: metadata.ruleType,
    parametersJson: JSON.stringify({
      action,
      callType: bid.callType,
      dateScope: classification.dateScope,
    }),
    description: buildReserveShortCallTypeDescription(
      action,
      bid.callType,
      classification.dateScope,
    ),
    tier: row.tier,
  };
};

export const buildLineRuleEntry = (
  row: LineRuleGroupRow,
  rosterPeriodDayCount: number,
  creditWindowDeltaHours: number | null = null,
  periodStartDate = "",
  periodEndDate = "",
): LineRuleExportEntry | null => {
  const ruleId = row.propertyCode ?? row.legacyPropertyCode;
  const definition = propertyCatalogByCode.get(ruleId);
  const metadata = ruleMetadataById.get(ruleId);

  if (row.bidType === "DaysOff") {
    return buildDaysOffLineRuleEntry(row, rosterPeriodDayCount);
  }

  if (row.bidType === "Reserve") {
    return buildReserveLineRuleEntry(row, periodStartDate, periodEndDate);
  }

  if (ruleId === pbsLineAaPropertyCodes.reserve) {
    return buildReserveRuleEntry(row);
  }

  if (ruleId === 407) {
    return buildMinimumBaseLayoverEntry(row);
  }

  if (ruleId === 429) {
    return creditWindowDeltaHours === null
      ? null
      : buildCreditWindowPreferenceEntry(row, creditWindowDeltaHours);
  }

  if (!definition || !metadata) {
    return null;
  }

  const bid = deserializeLineRuleBid(definition, {
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
