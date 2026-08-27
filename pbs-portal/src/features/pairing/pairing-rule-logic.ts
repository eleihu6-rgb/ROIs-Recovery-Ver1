import {
  buildPbsPairingConditionSignature,
  findPbsPairingRuleConflict,
  getPbsPairingActiveTierLabels,
  getPbsPairingForcedOrRule,
  getPbsPairingPropertyUsage,
  type PbsPairingRuleConflict,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import { buildExistingPairingBidSummary } from "@/features/pairing/pairing-existing-bid-summary";
import type {
  PairingAvailableProperty,
  PairingExistingProperty,
  PairingSearchCriteriaItem,
} from "@/features/pairing/types";

type PairingRuleSourceProperty =
  | PairingAvailableProperty
  | PairingExistingProperty
  | PairingSearchCriteriaItem;

export type PairingRuleExpressionCondition = {
  key: string;
  fallbackText: string;
  property: PairingExistingProperty;
};

export type PairingRuleExpressionClause = {
  key: string;
  conditions: PairingRuleExpressionCondition[];
};

export type PairingRuleExpressionTier = {
  tier: string;
  clauses: PairingRuleExpressionClause[];
};

type TranslationResolver = (key: string) => string;

const buildPairingRuleConditionFallbackText = (property: PairingExistingProperty) => {
  const summary = buildExistingPairingBidSummary(property);

  return `${property.name}: ${summary.kind === "text" ? summary.value : summary.headline}`;
};

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

const shouldJoinWithOr = (
  left: PairingExistingProperty,
  right: PairingExistingProperty,
) => {
  if (
    left.propertyCode === right.propertyCode
    && getPbsPairingPropertyUsage(left.propertyCode) === "multi"
  ) {
    return true;
  }

  return getPbsPairingForcedOrRule(left, right) !== null;
};

const compareTierLabels = (left: string, right: string) => {
  const leftNumber = Number.parseInt(left.replace(/^T/i, ""), 10);
  const rightNumber = Number.parseInt(right.replace(/^T/i, ""), 10);

  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return left.localeCompare(right);
};

export const buildPairingRuleExpressionTiers = (
  properties: PairingExistingProperty[],
): PairingRuleExpressionTier[] => {
  const byTier = new Map<string, PairingExistingProperty[]>();

  for (const property of properties) {
    for (const tier of getPbsPairingActiveTierLabels(property)) {
      const tierProperties = byTier.get(tier) ?? [];
      tierProperties.push(property);
      byTier.set(tier, tierProperties);
    }
  }

  return Array.from(byTier.entries()).sort(([left], [right]) => compareTierLabels(left, right)).map(([tier, tierProperties]) => {
    const parents = tierProperties.map((_, index) => index);

    for (let leftIndex = 0; leftIndex < tierProperties.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < tierProperties.length; rightIndex += 1) {
        if (shouldJoinWithOr(tierProperties[leftIndex], tierProperties[rightIndex])) {
          unionRoots(parents, leftIndex, rightIndex);
        }
      }
    }

    const clausesByRoot = new Map<number, PairingRuleExpressionCondition[]>();

    tierProperties.forEach((property, index) => {
      const root = getRoot(parents, index);
      const clauseConditions = clausesByRoot.get(root) ?? [];
      clauseConditions.push({
        fallbackText: buildPairingRuleConditionFallbackText(property),
        key: `${tier}-${property.id}-${buildPbsPairingConditionSignature(property)}`,
        property,
      });
      clausesByRoot.set(root, clauseConditions);
    });

    return {
      tier,
      clauses: Array.from(clausesByRoot.entries()).map(([root, conditions]) => ({
        key: `${tier}-${root}`,
        conditions,
      })),
    };
  });
};

export const findPairingPropertyRuleConflict = (
  existingProperties: PairingExistingProperty[],
  candidateProperty: PairingRuleSourceProperty,
): PbsPairingRuleConflict | null => findPbsPairingRuleConflict(existingProperties, candidateProperty);

export const formatPairingRuleConflictMessage = (
  conflict: PbsPairingRuleConflict,
  t: TranslationResolver,
) => {
  if (conflict.type === "duplicate") {
    return `${t("pairing.message.duplicateConditionError")} ${conflict.tier}.`;
  }

  return `${conflict.propertyName} ${t("pairing.message.singleUseConditionError")} ${conflict.tier}.`;
};
