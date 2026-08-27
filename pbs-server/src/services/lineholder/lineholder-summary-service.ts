import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type {
  PbsLineholderCurrentSummaryResponse,
  PbsLineholderSummaryStatistic,
  PbsLineholderSummaryWarning,
} from "../../../../packages/contracts/pbs-lineholder-summary.js";
import {
  pbsBidCondition,
  pbsBidGroup,
  pbsBidTier,
  pbsBidProperty,
} from "../../models/index.js";
import {
  CURRENT_BID_CONTEXT,
  buildDraftIdentity,
  loadExistingBid,
  normalizeTiers,
  resolveCurrentPeriod,
} from "./shared.js";
import {
  buildLineholderSummaryDiagnostics,
  LINEHOLDER_SUMMARY_TIER_LABELS,
} from "./lineholder-summary-diagnostics.js";
import {
  formatLineholderSummaryConditionValue,
  formatLineholderSummaryItemText,
} from "./lineholder-summary-formatters.js";
import { createPbsBusinessClock } from "../business-time/business-clock.js";
import type { PbsLineholderSummaryService } from "./types.js";
import {
  cloneLineholderPeriodContext,
  deserializeLineholderPeriodContext,
  serializeLineholderPeriodContext,
} from "./cache-serialization.js";
import type { PbsCache } from "../../utils/cache.js";

type Database = ReturnType<typeof drizzle>;

const CURRENT_PERIOD_CACHE_TTL_MS = 60_000;
const CURRENT_PERIOD_CACHE_TTL_SECONDS = CURRENT_PERIOD_CACHE_TTL_MS / 1000;
const TIER_LABELS = LINEHOLDER_SUMMARY_TIER_LABELS;

const normalizeBidType = (
  bidType: string | null,
): PbsLineholderCurrentSummaryResponse["summaryItems"][number]["bidType"] => {
  if (bidType === "Pairing" || bidType === "Line" || bidType === "DaysOff" || bidType === "Reserve") {
    return bidType;
  }

  return "Unsupported";
};

const resolveAction = (
  actionId: number | null,
): PbsLineholderCurrentSummaryResponse["summaryItems"][number]["action"] => {
  if (actionId === 1) {
    return "Award";
  }

  if (actionId === 2) {
    return "Avoid";
  }

  return "SetCondition";
};

type CreatePbsLineholderSummaryServiceOptions = {
  db: Database;
  cache?: PbsCache;
};

export const buildLineholderSummaryEditableSource = (
  bidType: PbsLineholderCurrentSummaryResponse["summaryItems"][number]["bidType"],
  propertyGroupKey: string,
  supportedTier: boolean,
): PbsLineholderCurrentSummaryResponse["summaryItems"][number]["editableSource"] => {
  if (!supportedTier || bidType === "Reserve" || bidType === "Unsupported") {
    return undefined;
  }

  return {
    module: bidType,
    propertyGroupKey,
  };
};

export const createPbsLineholderSummaryService = ({
  db,
  cache,
}: CreatePbsLineholderSummaryServiceOptions): PbsLineholderSummaryService => {
  const businessClock = createPbsBusinessClock({ db });
  let currentPeriodCache: {
    crewId: string;
    expiresAt: number;
    value: Awaited<ReturnType<typeof resolveCurrentPeriod>>;
  } | null = null;

  const getCurrentPeriod = async (actor: Parameters<PbsLineholderSummaryService["getCurrentSummary"]>[0]) => {
    if (cache) {
      const period = await cache.getOrSet(
        cache.key("period", "current", "v3", actor.crewId),
        CURRENT_PERIOD_CACHE_TTL_SECONDS,
        async () => resolveCurrentPeriod(db, actor, await businessClock.getBusinessNow()),
        {
          serialize: serializeLineholderPeriodContext,
          deserialize: deserializeLineholderPeriodContext,
        },
      );

      return cloneLineholderPeriodContext(period);
    }

    const now = Date.now();
    if (currentPeriodCache?.crewId === actor.crewId && currentPeriodCache.expiresAt > now) {
      return cloneLineholderPeriodContext(currentPeriodCache.value);
    }

    const period = await resolveCurrentPeriod(db, actor, await businessClock.getBusinessNow());
    currentPeriodCache = {
      crewId: actor.crewId,
      expiresAt: now + CURRENT_PERIOD_CACHE_TTL_MS,
      value: cloneLineholderPeriodContext(period),
    };

    return cloneLineholderPeriodContext(period);
  };

  return {
  async getCurrentSummary(actor): Promise<PbsLineholderCurrentSummaryResponse> {
    const period = await getCurrentPeriod(actor);
    const existingBid = await loadExistingBid(db, actor, period);

    const statisticsByTier = new Map<string, PbsLineholderSummaryStatistic>(TIER_LABELS.map((label) => [label, {
      tier: label,
      totalItems: 0,
      pairingCount: 0,
      lineCount: 0,
      daysOffCount: 0,
    }]));

    if (!existingBid) {
      const statistics = TIER_LABELS.map((label) => statisticsByTier.get(label)!);

      return {
        ...buildDraftIdentity(period),
        periodCode: period.periodCode,
        bidContext: CURRENT_BID_CONTEXT,
        statistics,
        summaryItems: [],
        diagnostics: buildLineholderSummaryDiagnostics({
          statistics,
          summaryItems: [],
        }),
      };
    }

    const [ruleRows, conditionRows] = await Promise.all([
      db
        .select({
          groupId: pbsBidGroup.id,
          bidType: pbsBidGroup.bidType,
          groupSeq: pbsBidGroup.groupSeq,
          propertyGroupKey: pbsBidGroup.propertyGroupKey,
          tier: pbsBidTier.tier,
          actionId: pbsBidGroup.actionId,
          legacyPropertyCode: pbsBidGroup.legacyPropertyCode,
          propertyCode: pbsBidProperty.propertyCode,
          propertyName: pbsBidProperty.propertyName,
          operator: pbsBidGroup.operator,
          paramA: pbsBidGroup.paramA,
          paramB: pbsBidGroup.paramB,
          paramC: pbsBidGroup.paramC,
        })
        .from(pbsBidGroup)
        .innerJoin(pbsBidTier, eq(pbsBidGroup.tierId, pbsBidTier.id))
        .leftJoin(pbsBidProperty, eq(pbsBidGroup.propertyDefinitionId, pbsBidProperty.id))
        .where(eq(pbsBidGroup.bidId, existingBid.id))
        .orderBy(asc(pbsBidGroup.bidType), asc(pbsBidGroup.groupSeq), asc(pbsBidTier.tier)),
      db
        .select({
          groupId: pbsBidCondition.groupId,
          nodeSeq: pbsBidCondition.nodeSeq,
          connector: pbsBidCondition.andOrOr,
          legacyPropertyCode: pbsBidCondition.legacyPropertyCode,
          propertyCode: pbsBidProperty.propertyCode,
          propertyName: pbsBidProperty.propertyName,
          operator: pbsBidCondition.operator,
          paramA: pbsBidCondition.paramA,
          paramB: pbsBidCondition.paramB,
          paramC: pbsBidCondition.paramC,
        })
        .from(pbsBidCondition)
        .leftJoin(pbsBidProperty, eq(pbsBidCondition.propertyDefinitionId, pbsBidProperty.id))
        .where(eq(pbsBidCondition.bidId, existingBid.id))
        .orderBy(asc(pbsBidCondition.groupId), asc(pbsBidCondition.nodeSeq)),
    ]);

    const conditionsByGroupId = new Map<number, PbsLineholderCurrentSummaryResponse["summaryItems"][number]["conditions"]>();

    for (const row of conditionRows) {
      const value = formatLineholderSummaryConditionValue(row.operator, row.paramA, row.paramB, row.paramC);
      const conditionLabel = row.propertyName ?? `Property ${row.propertyCode ?? row.legacyPropertyCode}`;
      const conditions = conditionsByGroupId.get(row.groupId) ?? [];

      conditions.push({
        id: `condition-${row.groupId}-${row.nodeSeq}`,
        label: conditionLabel,
        operator: row.operator ?? undefined,
        value,
        connector: row.connector === "AND" ? "AND" : undefined,
      });
      conditionsByGroupId.set(row.groupId, conditions);
    }

    const summaryItems = new Map<string, PbsLineholderCurrentSummaryResponse["summaryItems"][number]>();
    const unsupportedTierWarnings = new Map<string, PbsLineholderSummaryWarning>();

    for (const row of ruleRows) {
      const tierLabel = `T${row.tier}`;
      const stats = statisticsByTier.get(tierLabel);
      const bidType = normalizeBidType(row.bidType);

      if (stats) {
        stats.totalItems += 1;

        if (bidType === "Pairing") {
          stats.pairingCount += 1;
        } else if (bidType === "Line") {
          stats.lineCount += 1;
        } else if (bidType === "DaysOff") {
          stats.daysOffCount += 1;
        } else if (bidType === "Reserve") {
          stats.reserveCount = (stats.reserveCount ?? 0) + 1;
        } else if (bidType === "Unsupported") {
          stats.unsupportedItemCount = (stats.unsupportedItemCount ?? 0) + 1;
        }
      } else {
        unsupportedTierWarnings.set(tierLabel, {
          code: "unsupportedTier",
          message: `Legacy bid data contains ${tierLabel}, which is outside the current T1-T7 bid review range.`,
          tier: tierLabel,
        });
      }

      const summaryKey = `${bidType}:${row.propertyGroupKey}`;
      const existingSummary = summaryItems.get(summaryKey);

      if (existingSummary) {
        existingSummary.tiers = normalizeTiers([...existingSummary.tiers, tierLabel]);
        if (!stats) {
          existingSummary.warningCode = "unsupportedTier";
          existingSummary.editableSource = undefined;
        }
        continue;
      }

      const label = row.propertyName ?? `Property ${row.propertyCode ?? row.legacyPropertyCode}`;
      const action = resolveAction(row.actionId);
      const propertyCode = row.propertyCode ?? Number(row.legacyPropertyCode);
      const formatted = formatLineholderSummaryItemText({
        bidType,
        action,
        propertyCode,
        label,
        operator: row.operator,
        paramA: row.paramA,
        paramB: row.paramB,
        paramC: row.paramC,
      });
      const warningCode = !stats
        ? "unsupportedTier"
        : formatted.isReviewOnly
          ? "unsupportedProperty"
          : undefined;

      summaryItems.set(summaryKey, {
        id: `${bidType}-${row.propertyGroupKey}`.toLowerCase(),
        groupKey: row.propertyGroupKey,
        bidType,
        action,
        label,
        bid: formatted.value,
        operator: row.operator ?? undefined,
        value: formatted.value,
        readableText: formatted.readableText,
        tiers: [tierLabel],
        conditions: conditionsByGroupId.get(row.groupId) ?? [],
        source: "currentDraft",
        warningCode,
        editableSource: formatted.isReviewOnly
          ? undefined
          : buildLineholderSummaryEditableSource(bidType, row.propertyGroupKey, Boolean(stats)),
      });
    }

    const statistics = TIER_LABELS.map((label) => statisticsByTier.get(label)!);
    const finalSummaryItems = Array.from(summaryItems.values());
    const warnings = Array.from(unsupportedTierWarnings.values());

    return {
      ...buildDraftIdentity(period, existingBid),
      periodCode: existingBid.periodCode,
      bidContext: CURRENT_BID_CONTEXT,
      statistics,
      summaryItems: finalSummaryItems,
      warnings,
      diagnostics: buildLineholderSummaryDiagnostics({
        statistics,
        summaryItems: finalSummaryItems,
        warnings,
      }),
    };
  },
  };
};
