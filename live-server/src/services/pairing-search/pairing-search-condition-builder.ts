import type {
  PbsPairingBidAction,
  PbsPairingBidQuantifier,
  PbsPairingDraftProperty,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import {
  findPbsPairingRuleConflictInProperties,
  getPbsPairingForcedOrRule,
  getPbsPairingPropertyUsage,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsPairingSearchPreviewProperty } from "../../../../packages/contracts/pbs-search-pairings.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";
import type { PairingSearchConditionContext } from "./pairing-search-condition-context.js";
import { buildCorePreviewCondition } from "./pairing-search-core-conditions.js";
import type { PairingSearchSqlBuilder } from "./pairing-search-sql-builder.js";
import { buildDetailPreviewCondition } from "./pairing-search-detail-conditions.js";
import { buildTimePreviewCondition } from "./pairing-search-time-conditions.js";

const NEGATIVE_DEFAULT_PROPERTY_CODES = new Set([117, 148, 151, 156, 160, 163]);
const ANY_DEFAULT_PROPERTY_CODES = new Set([104, 107, 110, 150, 152, 155, 156]);

const resolvePreviewAction = (
  propertyCode: number,
  action?: PbsPairingBidAction | null,
): PbsPairingBidAction => {
  if (action === "award" || action === "avoid") {
    return action;
  }

  return NEGATIVE_DEFAULT_PROPERTY_CODES.has(propertyCode) ? "avoid" : "award";
};

const resolvePreviewQuantifier = (
  propertyCode: number,
  quantifier?: PbsPairingBidQuantifier | null,
): PbsPairingBidQuantifier | null => {
  if (quantifier === "any" || quantifier === "every") {
    return quantifier;
  }

  return ANY_DEFAULT_PROPERTY_CODES.has(propertyCode) ? "any" : null;
};

export const buildPreviewCondition = (
  property: PbsPairingSearchPreviewProperty,
  liveSchema: string,
  sqlBuilder: PairingSearchSqlBuilder,
  context: PairingSearchConditionContext = {},
) => {
  const intent = resolvePreviewAction(property.propertyCode, property.action);
  const quantifier = resolvePreviewQuantifier(property.propertyCode, property.quantifier);
  const wrapIntent = (positiveClause: string) =>
    intent === "avoid" ? `not (${positiveClause})` : positiveClause;
  const coreCondition = buildCorePreviewCondition(property, liveSchema, sqlBuilder, context);

  if (coreCondition) {
    return wrapIntent(coreCondition);
  }

  const timeCondition = buildTimePreviewCondition(property, liveSchema, sqlBuilder, context);

  if (timeCondition) {
    return wrapIntent(timeCondition);
  }

  const detailCondition = buildDetailPreviewCondition(property, liveSchema, sqlBuilder, quantifier, wrapIntent, context);

  if (detailCondition) {
    return detailCondition;
  }

  throw new LineholderBidServiceError(422, `Search preview is not supported yet for ${property.name}.`);
};

export const parsePreviewTier = (tier: string) => {
  const normalizedTier = tier.trim().toUpperCase();
  const match = normalizedTier.match(/^T([1-9]\d*)$/);

  if (!match) {
    throw new LineholderBidServiceError(400, `Unsupported pairing search tier: ${tier}`);
  }

  return `T${Number.parseInt(match[1], 10)}`;
};

const propertyAppliesToTier = (property: PbsPairingDraftProperty, tier: string) =>
  property.tiers.map(parsePreviewTier).includes(tier);

const getRoot = (parents: number[], index: number): number => {
  if (parents[index] === index) {
    return index;
  }

  parents[index] = getRoot(parents, parents[index]);
  return parents[index];
};

const unionRoots = (parents: number[], left: number, right: number) => {
  const leftRoot = getRoot(parents, left);
  const rightRoot = getRoot(parents, right);

  if (leftRoot !== rightRoot) {
    parents[rightRoot] = leftRoot;
  }
};

const shouldJoinRulePropertiesWithOr = (
  left: PbsPairingDraftProperty,
  right: PbsPairingDraftProperty,
) => {
  if (
    left.propertyCode === right.propertyCode
    && getPbsPairingPropertyUsage(left.propertyCode) === "multi"
  ) {
    return true;
  }

  return getPbsPairingForcedOrRule(left, right) !== null;
};

export const normalizeCurrentRulePreviewProperties = (
  tier: string,
  properties: PbsPairingDraftProperty[],
) => properties
  .filter((property) => propertyAppliesToTier(property, tier))
  .map((property, index) => ({
    ...property,
    rowSeq: property.rowSeq > 0 ? property.rowSeq : index + 1,
    tiers: [tier],
  }));

export const normalizeCriteriaPreviewProperties = (
  properties: PbsPairingDraftProperty[],
) => properties.map((property, index) => ({
  ...property,
  rowSeq: property.rowSeq > 0 ? property.rowSeq : index + 1,
  tiers: ["T1"],
}));

const formatPairingRuleConflictError = (
  conflict: NonNullable<ReturnType<typeof findPbsPairingRuleConflictInProperties>>,
) => {
  if (conflict.type === "duplicate") {
    return `This pairing condition already exists in ${conflict.tier}.`;
  }

  return `${conflict.propertyName} can only be used once in ${conflict.tier}.`;
};

export const buildCurrentRulesCondition = (
  properties: PbsPairingDraftProperty[],
  liveSchema: string,
  sqlBuilder: PairingSearchSqlBuilder,
  context: PairingSearchConditionContext = {},
) => {
  const conflict = findPbsPairingRuleConflictInProperties(properties);

  if (conflict) {
    throw new LineholderBidServiceError(409, formatPairingRuleConflictError(conflict));
  }

  const parents = properties.map((_, index) => index);

  for (let leftIndex = 0; leftIndex < properties.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < properties.length; rightIndex += 1) {
      if (shouldJoinRulePropertiesWithOr(properties[leftIndex], properties[rightIndex])) {
        unionRoots(parents, leftIndex, rightIndex);
      }
    }
  }

  const conditionGroups = new Map<number, string[]>();

  properties.forEach((property, index) => {
    const root = getRoot(parents, index);
    const conditions = conditionGroups.get(root) ?? [];
    conditions.push(buildPreviewCondition(property, liveSchema, sqlBuilder, context));
    conditionGroups.set(root, conditions);
  });

  return Array.from(conditionGroups.values())
    .map((conditions) =>
      conditions.length === 1
        ? `(${conditions[0]})`
        : `(${conditions.map((condition) => `(${condition})`).join(" or ")})`,
    )
    .join(" and ");
};
