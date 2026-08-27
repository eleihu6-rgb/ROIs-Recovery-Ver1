import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import type {
  PbsStandingBidContext,
  PbsStandingBidMode,
  PbsStandingCurrentResponse,
  PbsStandingDraftDocument,
  PbsStandingDraftProperty,
  PbsStandingPropertyDefinition,
  PbsSaveStandingDraftRequest,
} from "../../../../packages/contracts/pbs-standing-bids.js";
import {
  parsePreferOffBidValues,
  type PbsPreferOffConfig,
} from "../../../../packages/contracts/pbs-prefer-off.js";
import {
  pbsLineLegacyPropertyCodes,
  type PbsLineMinimumBaseLayoverConfig,
} from "../../../../packages/contracts/pbs-line-bids.js";
import {
  pbsStandingBidContexts,
  pbsStandingLineholderPropertyRegistry,
  pbsStandingLineholderPropertyCodes,
  pbsStandingPeriodCode,
  pbsStandingReservePropertyRegistry,
  pbsStandingReservePropertyCodes,
} from "../../../../packages/contracts/pbs-standing-bids.js";
import type { PbsCurrentPeriod } from "../../../../packages/contracts/pbs-current-period.js";
import {
  pbsBid,
  pbsBidCondition,
  pbsBidGroup,
  pbsBidProperty,
  pbsBidTier,
} from "../../models/index.js";
import {
  LineholderBidServiceError,
  ensureBidTiers,
  normalizeCurrentDraftVersion,
  normalizeTiers,
  parseCurrentDraftBidId,
  parseTierKey,
  requireLineholderPropertyIdentity,
  resolvePropertyCatalogByContext,
  syncBidTiers,
  type CurrentBidTarget,
  type LineholderDraftActor,
  type LineholderPropertyCatalogContext,
} from "../lineholder/shared.js";
import {
  cloneRuleBidValue,
  deserializeRuleBid,
  serializeRuleBid,
  type RuleBidValue,
} from "../lineholder/rule-bid-value.js";
import {
  formatLineDurationCompact,
  loadLineMinimumBaseLayoverConfig,
  normalizeLineDurationPadded,
  parseLineDurationMinutes,
} from "../line/line-minimum-base-layover-config.js";
import {
  loadTimeBetweenFlightsMinimumConfig,
  parseTimeBetweenFlightsDurationMinutes,
  TIME_BETWEEN_FLIGHTS_PROPERTY_CODE,
  validateTimeBetweenFlightsMinimum,
} from "../pairing/time-between-flights-config.js";
import { loadPreferOffConfig } from "../days-off/prefer-off-config.js";
import {
  applyReserveCallTypeOptionsToCatalogContext,
  applyReserveCallTypeOptionsToDraftProperties,
  resolveReserveCallTypeOptions,
  type ReserveCallTypeOptionsResolver,
} from "../reserve/reserve-call-type-options.js";
import type { PbsStandingBidService } from "./types.js";

type Database = ReturnType<typeof drizzle>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type PgPool = Pick<Pool, "query">;
type StandingCatalogContext = LineholderPropertyCatalogContext<PbsStandingPropertyDefinition>;
type StandingWeekday = Extract<RuleBidValue, { type: "date-or-dow-list" }>["daysOfWeek"][number];

const PROPERTY_GROUP_KEY_MAX_LENGTH = 36;
const MAX_STANDING_TIER = 7;
const PREFER_OFF_PROPERTY_CODE = 201;
const STANDING_CURRENT_PERIOD: PbsCurrentPeriod = {
  id: null,
  periodCode: "Standing Bid",
  filiale: null,
  status: "OPEN",
  computedStage: "OPEN",
  bidOpenAt: null,
  bidCloseAt: null,
  canEditBid: true,
  readOnlyReason: null,
};
const RELATIVE_STANDING_RESERVE_DATE_SCOPE_MODES = new Set(["whole_month", "first_half", "second_half"]);
const STANDING_PATTERN_STRENGTHS = new Set(["normal", "strong", "must_try"]);
const STANDING_WEEKDAY_CODES = new Set<StandingWeekday>([
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
]);

const normalizeReserveCallType = (value: string) => value.trim().toUpperCase();

const buildAllowedReserveCallTypeSet = (allowedCallTypes: readonly string[] | undefined) => {
  if (!allowedCallTypes) {
    return null;
  }

  return new Set(allowedCallTypes.map(normalizeReserveCallType).filter(Boolean));
};

const contextByMode: Record<PbsStandingBidMode, PbsStandingBidContext> = {
  lineholder: pbsStandingBidContexts.lineholder,
  reserve: pbsStandingBidContexts.reserve,
};

const propertyRegistryByMode: Record<PbsStandingBidMode, readonly PbsStandingPropertyDefinition[]> = {
  lineholder: pbsStandingLineholderPropertyRegistry,
  reserve: pbsStandingReservePropertyRegistry,
};

const normalizeStandingPropertyGroupKey = (propertyGroupKey?: string | null) => {
  const normalizedKey = propertyGroupKey?.trim() ?? "";

  if (normalizedKey.length === 0 || normalizedKey.length > PROPERTY_GROUP_KEY_MAX_LENGTH) {
    return "";
  }

  return normalizedKey;
};

const resolveUniqueStandingPropertyGroupKey = (
  propertyGroupKey: string | undefined,
  usedPropertyGroupKeys: Set<string>,
) => {
  let normalizedKey = normalizeStandingPropertyGroupKey(propertyGroupKey);

  while (!normalizedKey || usedPropertyGroupKeys.has(normalizedKey)) {
    normalizedKey = randomUUID();
  }

  usedPropertyGroupKeys.add(normalizedKey);
  return normalizedKey;
};

const mapStandingActionToId = (action?: PbsStandingDraftProperty["action"] | null) => {
  if (action === "award") {
    return 1;
  }

  if (action === "avoid") {
    return 2;
  }

  return null;
};

export const mapStandingActionFromId = (actionId: number | null): PbsStandingDraftProperty["action"] | null => {
  if (actionId === 1) {
    return "award";
  }

  if (actionId === 2) {
    return "avoid";
  }

  return null;
};

const cloneStandingPropertyDefinition = (
  property: PbsStandingPropertyDefinition,
): PbsStandingPropertyDefinition => ({
  ...property,
  defaultAction: property.defaultAction ?? null,
  supportedActions: property.supportedActions ? [...property.supportedActions] : undefined,
  defaultBid: cloneRuleBidValue(property.defaultBid),
});

const resolveStandingPropertyCatalog = async (
  db: Database,
  mode: PbsStandingBidMode,
): Promise<StandingCatalogContext> =>
  resolvePropertyCatalogByContext(db, {
    bidTypes: mode === "lineholder" ? ["DaysOff", "Pairing", "Line"] : ["Reserve"],
    bidContext: contextByMode[mode],
    propertyRegistry: propertyRegistryByMode[mode],
    clonePropertyDefinition: cloneStandingPropertyDefinition,
    resolveDefinitionBidType: (property) => property.bidType,
  });

const buildEmptyDraft = (bidContext: PbsStandingBidContext): PbsStandingDraftDocument => ({
  draftVersion: 0,
  periodCode: pbsStandingPeriodCode,
  periodId: null,
  bidContext,
  remarks: "",
  properties: [],
});

const loadStandingBid = async (
  db: Pick<Database, "select">,
  actor: LineholderDraftActor,
  bidContext: PbsStandingBidContext,
) => {
  const rows = await db
    .select()
    .from(pbsBid)
    .where(and(
      eq(pbsBid.crewId, actor.crewId),
      eq(pbsBid.periodCode, pbsStandingPeriodCode),
      eq(pbsBid.bidContext, bidContext),
    ))
    .limit(1);

  return rows[0] ?? null;
};

const buildDraftIdentity = (
  bidContext: PbsStandingBidContext,
  bid?: Pick<typeof pbsBid.$inferSelect, "id" | "draftVersion" | "remarks"> | null,
): PbsStandingDraftDocument => ({
  draftKey: bid ? String(bid.id) : undefined,
  bidId: bid?.id,
  periodId: null,
  draftVersion: bid?.draftVersion ?? 0,
  periodCode: pbsStandingPeriodCode,
  bidContext,
  remarks: bid?.remarks ?? "",
  properties: [],
});

const loadDraftProperties = async (
  db: Pick<Database, "select">,
  bidId: number,
  catalogByCode: StandingCatalogContext["catalogByCode"],
  preferOffConfig: PbsPreferOffConfig,
): Promise<PbsStandingDraftProperty[]> => {
  const groupRows = await db
    .select({
      propertyGroupKey: pbsBidGroup.propertyGroupKey,
      groupSeq: pbsBidGroup.groupSeq,
      bidType: pbsBidGroup.bidType,
      legacyPropertyCode: pbsBidGroup.legacyPropertyCode,
      propertyCode: pbsBidProperty.propertyCode,
      operator: pbsBidGroup.operator,
      paramA: pbsBidGroup.paramA,
      paramB: pbsBidGroup.paramB,
      paramC: pbsBidGroup.paramC,
      actionId: pbsBidGroup.actionId,
      tier: pbsBidTier.tier,
    })
    .from(pbsBidGroup)
    .innerJoin(pbsBidTier, eq(pbsBidGroup.tierId, pbsBidTier.id))
    .leftJoin(pbsBidProperty, eq(pbsBidGroup.propertyDefinitionId, pbsBidProperty.id))
    .where(eq(pbsBidGroup.bidId, bidId))
    .orderBy(asc(pbsBidGroup.groupSeq), asc(pbsBidTier.tier));

  const propertiesByKey = new Map<string, PbsStandingDraftProperty>();

  for (const row of groupRows) {
    const propertyCode = row.propertyCode ?? Number(row.legacyPropertyCode);
    const definition = catalogByCode.get(propertyCode);

    if (!definition || definition.bidType !== row.bidType) {
      throw new LineholderBidServiceError(
        409,
        "Standing Bid contains a saved property that is no longer supported.",
      );
    }

    const existingProperty = propertiesByKey.get(row.propertyGroupKey);

    if (!existingProperty) {
      propertiesByKey.set(row.propertyGroupKey, {
        propertyGroupKey: row.propertyGroupKey,
        rowSeq: row.groupSeq,
        bidType: definition.bidType,
        propertyCode,
        name: definition.name,
        action: mapStandingActionFromId(row.actionId),
        bid: deserializeStandingBidValue(
          definition,
          {
            operator: row.operator,
            paramA: row.paramA,
            paramB: row.paramB,
            paramC: row.paramC,
          },
          preferOffConfig,
        ),
        tiers: [`T${row.tier}`],
      });
      continue;
    }

    existingProperty.tiers = normalizeTiers([...existingProperty.tiers, `T${row.tier}`]);
  }

  return Array.from(propertiesByKey.values()).sort((left, right) => left.rowSeq - right.rowSeq);
};

const normalizeLegacyStandingWeekday = (
  value: string | null,
  preferOffConfig: PbsPreferOffConfig,
): StandingWeekday | null => {
  const normalizedValue = value?.trim().toUpperCase() ?? "";
  const weekdayCode = preferOffConfig.weekdays.find((weekday) =>
    weekday.code === normalizedValue
    || weekday.code === normalizedValue.slice(0, 3)
    || weekday.name.toUpperCase() === normalizedValue
    || weekday.name.slice(0, 3).toUpperCase() === normalizedValue)?.code;

  return weekdayCode && STANDING_WEEKDAY_CODES.has(weekdayCode as StandingWeekday)
    ? weekdayCode as StandingWeekday
    : null;
};

export const deserializeStandingBidValue = (
  definition: PbsStandingPropertyDefinition,
  serialized: {
    operator: string | null;
    paramA: string | null;
    paramB: string | null;
    paramC: string | null;
  },
  preferOffConfig: PbsPreferOffConfig,
): RuleBidValue => {
  if (
    definition.propertyCode === PREFER_OFF_PROPERTY_CODE
    && definition.defaultBid.type === "tag-list"
    && serialized.operator === "In"
    && serialized.paramA
  ) {
    try {
      const legacyBid = JSON.parse(serialized.paramA) as {
        dates?: unknown;
        daysOfWeek?: unknown;
      };

      if (Array.isArray(legacyBid.dates) || Array.isArray(legacyBid.daysOfWeek)) {
        const dates = Array.isArray(legacyBid.dates)
          ? legacyBid.dates.filter((date): date is string => typeof date === "string")
          : [];
        const weekdays = Array.isArray(legacyBid.daysOfWeek)
          ? legacyBid.daysOfWeek.flatMap((value) => {
              if (typeof value !== "string") {
                return [];
              }

              const weekdayCode = normalizeLegacyStandingWeekday(value, preferOffConfig);
              const weekdayName = preferOffConfig.weekdays.find((weekday) =>
                weekday.code === weekdayCode)?.name;
              return weekdayName ? [weekdayName] : [value];
            })
          : [];

        return {
          ...definition.defaultBid,
          values: [...dates, ...weekdays],
        };
      }
    } catch {
      // Current tag-list payloads are not JSON and use the normal deserializer below.
    }
  }

  if (
    (
      definition.propertyCode === pbsStandingLineholderPropertyCodes.dayOfWeekOff
      || definition.propertyCode === pbsStandingReservePropertyCodes.reserveDayOfWeekOff
    )
    && definition.defaultBid.type === "date-or-dow-list"
    && serialized.operator === "="
  ) {
    const weekdayCode = normalizeLegacyStandingWeekday(serialized.paramA, preferOffConfig);

    return {
      ...definition.defaultBid,
      dates: [],
      daysOfWeek: weekdayCode ? [weekdayCode] : [],
    };
  }

  return deserializeRuleBid(definition, serialized);
};

const isRelativeStandingReserveDateScope = (
  dateScope: Extract<RuleBidValue, { type: "reserve-call-type-date-scope" }>["dateScope"],
) => RELATIVE_STANDING_RESERVE_DATE_SCOPE_MODES.has(dateScope.mode);

const validateStandingReserveDateScope = (
  dateScope: Extract<RuleBidValue, { type: "reserve-call-type-date-scope" }>["dateScope"],
  propertyName: string,
) => {
  if (!isRelativeStandingReserveDateScope(dateScope)) {
    throw new LineholderBidServiceError(400, `${propertyName} cannot use specific dates in Standing Bid.`);
  }
};

const disallowStandingDateBoundBid = (bid: RuleBidValue, propertyName: string) => {
  if (
    bid.type === "date"
    || bid.type === "date-range"
    || bid.type === "stepper-date"
    || bid.type === "stepper-range-date"
    || bid.type === "time-date"
    || bid.type === "time-range-date"
    || bid.type === "tag-list-date"
    || bid.type === "pairing-id-list"
    || bid.type === "pairing-occurrence-list"
  ) {
    throw new LineholderBidServiceError(400, `${propertyName} is not valid for Standing Bid.`);
  }

  if (bid.type === "stepper-date-range" && (bid.from.length > 0 || bid.to.length > 0)) {
    throw new LineholderBidServiceError(400, `${propertyName} is not valid for Standing Bid.`);
  }

  if (bid.type === "date-or-dow-list" && bid.dates.length > 0) {
    throw new LineholderBidServiceError(400, `${propertyName} cannot use specific dates in Standing Bid.`);
  }

  if (
    bid.type !== "reserve-call-type-date-scope"
    && bid.type !== "reserve-flying-date-pattern"
    && "dateScope" in bid
    && bid.dateScope != null
  ) {
    throw new LineholderBidServiceError(400, `${propertyName} cannot use specific dates in Standing Bid.`);
  }
};

const normalizeStandingBidValue = (bid: RuleBidValue): RuleBidValue => {
  if (bid.type !== "minimum-base-layover") {
    return cloneRuleBidValue(bid);
  }

  const normalizedDuration = normalizeLineDurationPadded(bid.minimumDuration);

  return {
    ...bid,
    minimumDuration: normalizedDuration ?? bid.minimumDuration.trim(),
  };
};

const validateStandingMinimumBaseLayover = (
  bid: RuleBidValue,
  propertyName: string,
  config: PbsLineMinimumBaseLayoverConfig | null | undefined,
  isGrandfathered: boolean,
) => {
  if (bid.type !== "minimum-base-layover") {
    throw new LineholderBidServiceError(400, `${propertyName} uses an unsupported Standing Bid value.`);
  }

  const durationMinutes = parseLineDurationMinutes(bid.minimumDuration);

  if (durationMinutes === null) {
    throw new LineholderBidServiceError(400, `${propertyName} must use HH:MM.`);
  }

  if (isGrandfathered) {
    return;
  }

  if (!config?.available) {
    throw new LineholderBidServiceError(400, `${propertyName} configuration is unavailable.`);
  }

  const minimumMinutes = parseLineDurationMinutes(config.minDuration);

  if (minimumMinutes === null || minimumMinutes <= 0) {
    throw new LineholderBidServiceError(400, `${propertyName} configuration is unavailable.`);
  }

  if (durationMinutes < minimumMinutes) {
    throw new LineholderBidServiceError(
      400,
      `${propertyName} must be at least ${formatLineDurationCompact(config.minDuration)}.`,
    );
  }
};

const validateStandingPreferOff = (
  bid: RuleBidValue,
  propertyName: string,
  preferOffConfig: PbsPreferOffConfig,
) => {
  if (bid.type !== "tag-list") {
    throw new LineholderBidServiceError(400, `${propertyName} uses an unsupported Standing Bid value.`);
  }

  const parsed = parsePreferOffBidValues(bid.values, preferOffConfig);

  if (
    parsed.mode === "specific_dates"
    || parsed.mode === "date_range"
    || parsed.mode === "mixed"
  ) {
    throw new LineholderBidServiceError(400, `${propertyName} cannot use specific dates in Standing Bid.`);
  }

  if (
    parsed.invalidValues.length > 0
    || !parsed.isTimeWindowValid
    || (parsed.mode !== "days_of_week" && parsed.mode !== "weekends")
  ) {
    throw new LineholderBidServiceError(400, `${propertyName} requires a valid recurring day selection.`);
  }

  if (parsed.mode === "weekends" && !preferOffConfig.weekend.available) {
    throw new LineholderBidServiceError(400, `${propertyName} weekend configuration is unavailable.`);
  }
};

const validateStandingBidValue = (
  property: PbsStandingDraftProperty,
  definition: PbsStandingPropertyDefinition,
  minimumBaseLayoverConfig: PbsLineMinimumBaseLayoverConfig | null | undefined,
  minimumTimeBetweenFlightsConfig: Awaited<ReturnType<typeof loadTimeBetweenFlightsMinimumConfig>> | null,
  preferOffConfig: PbsPreferOffConfig,
  isGrandfatheredMinimumBaseLayover = false,
  isGrandfatheredTimeBetweenFlights = false,
  allowedReserveCallTypes?: readonly string[],
) => {
  const label = definition.name;
  const bid = property.bid;
  const allowedReserveCallTypeSet = buildAllowedReserveCallTypeSet(allowedReserveCallTypes);

  disallowStandingDateBoundBid(bid, label);

  if (definition.propertyCode === pbsLineLegacyPropertyCodes.minBaseLayover) {
    validateStandingMinimumBaseLayover(
      bid,
      label,
      minimumBaseLayoverConfig,
      isGrandfatheredMinimumBaseLayover,
    );
  }

  if (definition.propertyCode === PREFER_OFF_PROPERTY_CODE) {
    validateStandingPreferOff(bid, label, preferOffConfig);
  }

  if (definition.propertyCode === TIME_BETWEEN_FLIGHTS_PROPERTY_CODE) {
    const message = validateTimeBetweenFlightsMinimum(
      property,
      minimumTimeBetweenFlightsConfig,
      isGrandfatheredTimeBetweenFlights,
    );
    if (message) throw new LineholderBidServiceError(400, message);
  }

  if (definition.defaultBid.type !== bid.type) {
    throw new LineholderBidServiceError(400, `${label} uses an unsupported Standing Bid value.`);
  }

  if (
    definition.propertyCode === 427
    && (property.action !== "award" && property.action !== "avoid")
  ) {
    throw new LineholderBidServiceError(400, "Reserve requires Award or Avoid.");
  }

  if (bid.type === "select") {
    if (!bid.options.includes(bid.value)) {
      throw new LineholderBidServiceError(400, `${label} must use a valid option.`);
    }
  } else if (bid.type === "tag-list" && bid.values.length === 0) {
    throw new LineholderBidServiceError(400, `${label} requires at least one value.`);
  } else if (bid.type === "time-condition-list" && bid.conditions.length === 0) {
    throw new LineholderBidServiceError(400, `${label} requires at least one time condition.`);
  } else if (bid.type === "date-or-dow-list" && bid.daysOfWeek.length === 0) {
    throw new LineholderBidServiceError(400, `${label} requires at least one day of week.`);
  } else if (bid.type === "stepper") {
    if (
      (bid.min !== undefined && bid.value < bid.min)
      || (bid.max !== undefined && bid.value > bid.max)
    ) {
      throw new LineholderBidServiceError(400, `${label} is outside the allowed range.`);
    }
  } else if (bid.type === "stepper-range") {
    if (bid.to < bid.from) {
      throw new LineholderBidServiceError(400, `${label} range end must be on or after start.`);
    }

    if (
      (bid.min !== undefined && bid.from < bid.min)
      || (bid.max !== undefined && bid.to > bid.max)
    ) {
      throw new LineholderBidServiceError(400, `${label} is outside the allowed range.`);
    }
  } else if (bid.type === "days-off-on-pattern") {
    if (bid.minDaysOff < 1 || bid.minDaysOn < 1 || bid.maxDaysOn < bid.minDaysOn) {
      throw new LineholderBidServiceError(400, `${label} must use a valid days off / days on pattern.`);
    }
  } else if (bid.type === "reserve-call-type-date-scope") {
    if (bid.callType.trim().length === 0 || !bid.options.includes(bid.callType)) {
      throw new LineholderBidServiceError(400, `${label} must use a valid reserve call type.`);
    }

    if (
      allowedReserveCallTypeSet
      && !allowedReserveCallTypeSet.has(normalizeReserveCallType(bid.callType))
    ) {
      throw new LineholderBidServiceError(400, `${label} must use a valid reserve call type.`);
    }

    validateStandingReserveDateScope(bid.dateScope, label);
  } else if (bid.type === "reserve-flying-date-pattern") {
    if (bid.segments.length === 0 || bid.segments.length > 4 || !STANDING_PATTERN_STRENGTHS.has(bid.strength)) {
      throw new LineholderBidServiceError(400, `${label} must use a valid reserve / flying pattern.`);
    }

    for (const segment of bid.segments) {
      validateStandingReserveDateScope(segment.dateScope, label);

      if (
        segment.workType === "reserve"
        && (
          !bid.callTypeOptions.includes(segment.callType)
          || (
            allowedReserveCallTypeSet
            && !allowedReserveCallTypeSet.has(normalizeReserveCallType(segment.callType))
          )
        )
      ) {
        throw new LineholderBidServiceError(400, `${label} must use a valid reserve call type.`);
      }
    }
  }

  if (property.tiers.length === 0) {
    throw new LineholderBidServiceError(400, `${label} requires at least one tier.`);
  }

  for (const tier of property.tiers) {
    const parsedTier = parseTierKey(tier);

    if (parsedTier.number > MAX_STANDING_TIER) {
      throw new LineholderBidServiceError(400, "Standing Bid supports T1-T7 only.");
    }
  }
};

const normalizeStandingDraftProperty = (
  property: PbsStandingDraftProperty,
  rowSeq: number,
  catalogByCode: StandingCatalogContext["catalogByCode"],
  minimumBaseLayoverConfig: PbsLineMinimumBaseLayoverConfig | null | undefined,
  minimumTimeBetweenFlightsConfig: Awaited<ReturnType<typeof loadTimeBetweenFlightsMinimumConfig>> | null,
  preferOffConfig: PbsPreferOffConfig,
  isGrandfatheredMinimumBaseLayover = false,
  isGrandfatheredTimeBetweenFlights = false,
  allowedReserveCallTypes?: readonly string[],
): PbsStandingDraftProperty => {
  const definition = catalogByCode.get(property.propertyCode);

  if (!definition) {
    throw new LineholderBidServiceError(400, `Unsupported Standing Bid property code: ${property.propertyCode}`);
  }

  if (property.bidType && property.bidType !== definition.bidType) {
    throw new LineholderBidServiceError(400, `${definition.name} has an invalid Standing Bid type.`);
  }

  const shouldApplyDefaultAction = property.propertyCode !== 427;
  const normalizedProperty: PbsStandingDraftProperty = {
    propertyGroupKey: normalizeStandingPropertyGroupKey(property.propertyGroupKey) || undefined,
    rowSeq,
    bidType: definition.bidType,
    propertyCode: property.propertyCode,
    name: definition.name,
    action: property.action ?? (shouldApplyDefaultAction ? definition.defaultAction ?? null : null),
    bid: normalizeStandingBidValue(property.bid),
    tiers: normalizeTiers(property.tiers),
  };

  if (
    normalizedProperty.action
    && definition.supportedActions
    && !definition.supportedActions.includes(normalizedProperty.action)
  ) {
    throw new LineholderBidServiceError(400, `${definition.name} does not support ${normalizedProperty.action}.`);
  }

  validateStandingBidValue(
    normalizedProperty,
    definition,
    minimumBaseLayoverConfig,
    minimumTimeBetweenFlightsConfig,
    preferOffConfig,
    isGrandfatheredMinimumBaseLayover,
    isGrandfatheredTimeBetweenFlights,
    allowedReserveCallTypes,
  );
  return normalizedProperty;
};

const normalizeStandingDraftRequest = (
  request: PbsSaveStandingDraftRequest,
  catalogByCode: StandingCatalogContext["catalogByCode"],
  minimumBaseLayoverConfig: PbsLineMinimumBaseLayoverConfig | null | undefined,
  minimumTimeBetweenFlightsConfig: Awaited<ReturnType<typeof loadTimeBetweenFlightsMinimumConfig>> | null,
  preferOffConfig: PbsPreferOffConfig,
  grandfatheredDurationByKey: ReadonlyMap<string, string> = new Map(),
  grandfatheredTimeBetweenFlightsByKey: ReadonlyMap<string, number> = new Map(),
  allowedReserveCallTypes?: readonly string[],
): PbsStandingDraftDocument => {
  const expectedContext = contextByMode[request.mode];

  if (request.draft.bidContext !== expectedContext) {
    throw new LineholderBidServiceError(400, "Standing Bid mode and draft context do not match.");
  }

  const usedPropertyGroupKeys = new Set<string>();
  const incomingKeyCounts = new Map<string, number>();
  for (const property of request.draft.properties) {
    const key = normalizeStandingPropertyGroupKey(property.propertyGroupKey);
    if (key) incomingKeyCounts.set(key, (incomingKeyCounts.get(key) ?? 0) + 1);
  }
  const draftProperties = allowedReserveCallTypes
    ? applyReserveCallTypeOptionsToDraftProperties(request.draft.properties, allowedReserveCallTypes)
    : request.draft.properties;
  const normalizedProperties = draftProperties
    .map((property, index) => {
      const key = normalizeStandingPropertyGroupKey(property.propertyGroupKey);
      const normalizedDuration = property.bid.type === "minimum-base-layover"
        ? normalizeLineDurationPadded(property.bid.minimumDuration)
        : null;
      const isGrandfathered = Boolean(
        key
        && incomingKeyCounts.get(key) === 1
        && normalizedDuration
        && grandfatheredDurationByKey.get(key) === normalizedDuration,
      );
      const timeBetweenFlightsDuration = property.propertyCode === TIME_BETWEEN_FLIGHTS_PROPERTY_CODE
        && property.bid.type === "duration"
        ? parseTimeBetweenFlightsDurationMinutes(property.bid.value)
        : null;
      const isGrandfatheredTimeBetweenFlights = Boolean(
        key
        && incomingKeyCounts.get(key) === 1
        && timeBetweenFlightsDuration !== null
        && grandfatheredTimeBetweenFlightsByKey.get(key) === timeBetweenFlightsDuration,
      );

      return normalizeStandingDraftProperty(
        property,
        property.rowSeq > 0 ? property.rowSeq : index + 1,
        catalogByCode,
        minimumBaseLayoverConfig,
        minimumTimeBetweenFlightsConfig,
        preferOffConfig,
        isGrandfathered,
        isGrandfatheredTimeBetweenFlights,
        allowedReserveCallTypes,
      );
    })
    .sort((left, right) => left.rowSeq - right.rowSeq)
    .map((property, index) => ({
      ...property,
      propertyGroupKey: resolveUniqueStandingPropertyGroupKey(property.propertyGroupKey, usedPropertyGroupKeys),
      rowSeq: index + 1,
    }));

  return {
    draftKey: request.draft.draftKey,
    bidId: request.draft.bidId,
    periodId: null,
    draftVersion: normalizeCurrentDraftVersion(request.draft.draftVersion),
    periodCode: pbsStandingPeriodCode,
    bidContext: expectedContext,
    remarks: request.draft.remarks?.trim() ?? "",
    properties: normalizedProperties,
  };
};

const findStandingBidByReference = async (
  tx: Pick<Transaction, "select">,
  actor: LineholderDraftActor,
  bidContext: PbsStandingBidContext,
  draft: Pick<PbsStandingDraftDocument, "draftKey" | "bidId">,
) => {
  const bidId = parseCurrentDraftBidId(draft);

  if (bidId === null) {
    return null;
  }

  const rows = await tx
    .select()
    .from(pbsBid)
    .where(and(
      eq(pbsBid.id, bidId),
      eq(pbsBid.crewId, actor.crewId),
      eq(pbsBid.periodCode, pbsStandingPeriodCode),
      eq(pbsBid.bidContext, bidContext),
    ))
    .limit(1);

  if (!rows[0]) {
    throw new LineholderBidServiceError(404, "Standing Bid draft not found.");
  }

  return rows[0];
};

const ensureStandingBid = async (
  tx: Transaction,
  actor: LineholderDraftActor,
  draft: PbsStandingDraftDocument,
  now: Date,
): Promise<CurrentBidTarget> => {
  const expectedDraftVersion = draft.draftVersion;
  const referencedBid = await findStandingBidByReference(tx, actor, draft.bidContext, draft);
  const targetBid = referencedBid ?? await loadStandingBid(tx, actor, draft.bidContext);

  if (!targetBid) {
    if (expectedDraftVersion !== 0) {
      throw new LineholderBidServiceError(409, "Standing Bid draft has changed. Please refresh before saving again.");
    }

    const insertedRows = await tx
      .insert(pbsBid)
      .values({
        crewId: actor.crewId,
        periodCode: pbsStandingPeriodCode,
        rosterPeriodId: null,
        bidContext: draft.bidContext,
        draftVersion: 1,
        status: "DRAFT",
        remarks: draft.remarks,
        lastModifiedAt: now,
        createdBy: actor.userCode,
        updatedBy: actor.userCode,
        updatedAt: now,
      })
      .returning({
        id: pbsBid.id,
        draftVersion: pbsBid.draftVersion,
      });
    const insertedBid = insertedRows[0];

    if (!insertedBid) {
      throw new LineholderBidServiceError(500, "Unable to create Standing Bid draft.");
    }

    return {
      draftKey: String(insertedBid.id),
      bidId: insertedBid.id,
      periodId: null,
      periodCode: pbsStandingPeriodCode,
      draftVersion: insertedBid.draftVersion,
    };
  }

  const updatedRows = await tx
    .update(pbsBid)
    .set({
      rosterPeriodId: null,
      periodCode: pbsStandingPeriodCode,
      draftVersion: sql`${pbsBid.draftVersion} + 1`,
      status: "DRAFT",
      remarks: draft.remarks,
      lastModifiedAt: now,
      updatedBy: actor.userCode,
      updatedAt: now,
    })
    .where(and(
      eq(pbsBid.id, targetBid.id),
      eq(pbsBid.crewId, actor.crewId),
      eq(pbsBid.periodCode, pbsStandingPeriodCode),
      eq(pbsBid.bidContext, draft.bidContext),
      eq(pbsBid.draftVersion, expectedDraftVersion),
    ))
    .returning({
      id: pbsBid.id,
      draftVersion: pbsBid.draftVersion,
    });
  const updatedBid = updatedRows[0];

  if (!updatedBid) {
    throw new LineholderBidServiceError(409, "Standing Bid draft has changed. Please refresh before saving again.");
  }

  return {
    draftKey: String(updatedBid.id),
    bidId: updatedBid.id,
    periodId: null,
    periodCode: pbsStandingPeriodCode,
    draftVersion: updatedBid.draftVersion,
  };
};

const replaceStandingDraftProperties = async (
  tx: Transaction,
  targetBid: CurrentBidTarget,
  actor: LineholderDraftActor,
  properties: PbsStandingDraftProperty[],
  propertyIdentityByCode: StandingCatalogContext["propertyIdentityByCode"],
  now: Date,
) => {
  await tx.execute(sql`
    delete from ${pbsBidCondition}
    where ${pbsBidCondition.groupId} in (
      select ${pbsBidGroup.id}
      from ${pbsBidGroup}
      where ${pbsBidGroup.bidId} = ${targetBid.bidId}
    )
  `);
  await tx
    .delete(pbsBidGroup)
    .where(eq(pbsBidGroup.bidId, targetBid.bidId));

  const tierNumbers = Array.from(new Set(
    properties.flatMap((property) => property.tiers.map((tier) => parseTierKey(tier).number)),
  )).sort((left, right) => left - right);
  const tierIdByNumber = await ensureBidTiers(tx, targetBid.bidId, tierNumbers, actor, now);

  for (const property of properties) {
    const propertyIdentity = requireLineholderPropertyIdentity(
      property.propertyCode,
      propertyIdentityByCode,
      property.bidType ?? "Standing",
    );
    const serializedBid = serializeRuleBid(property.bid);
    const actionId = mapStandingActionToId(property.action);

    await tx.insert(pbsBidGroup).values(property.tiers.map((tier) => {
      const tierNumber = parseTierKey(tier).number;
      const tierId = tierIdByNumber.get(tierNumber);

      if (!tierId) {
        throw new LineholderBidServiceError(500, "Unable to resolve Standing Bid tier.");
      }

      return {
        tierId,
        bidId: targetBid.bidId,
        groupSeq: property.rowSeq,
        propertyGroupKey: property.propertyGroupKey ?? randomUUID(),
        bidType: property.bidType,
        actionId,
        legacyPropertyCode: propertyIdentity.propertyCode,
        propertyDefinitionId: propertyIdentity.propertyDefinitionId,
        operator: serializedBid.operator,
        paramA: serializedBid.paramA,
        paramB: serializedBid.paramB,
        paramC: serializedBid.paramC,
        totalConditions: 0,
        createdBy: actor.userCode,
        updatedBy: actor.userCode,
        updatedAt: now,
      };
    }));
  }

  await syncBidTiers(tx, targetBid.bidId, actor, now);
};

const buildResponse = async (
  db: Database,
  actor: LineholderDraftActor,
  lineholderCatalog: StandingCatalogContext,
  reserveCatalog: StandingCatalogContext,
  preloadedPreferOffConfig?: PbsPreferOffConfig,
): Promise<PbsStandingCurrentResponse> => {
  const [lineholderBid, reserveBid, preferOffConfig] = await Promise.all([
    loadStandingBid(db, actor, pbsStandingBidContexts.lineholder),
    loadStandingBid(db, actor, pbsStandingBidContexts.reserve),
    preloadedPreferOffConfig ?? loadPreferOffConfig(db),
  ]);
  const [lineholderProperties, reserveProperties] = await Promise.all([
    lineholderBid
      ? loadDraftProperties(db, lineholderBid.id, lineholderCatalog.catalogByCode, preferOffConfig)
      : Promise.resolve([]),
    reserveBid
      ? loadDraftProperties(db, reserveBid.id, reserveCatalog.catalogByCode, preferOffConfig)
      : Promise.resolve([]),
  ]);

  return {
    currentPeriod: STANDING_CURRENT_PERIOD,
    lineholderDraft: lineholderBid
      ? { ...buildDraftIdentity(pbsStandingBidContexts.lineholder, lineholderBid), properties: lineholderProperties }
      : buildEmptyDraft(pbsStandingBidContexts.lineholder),
    preferOffConfig,
    reserveDraft: reserveBid
      ? { ...buildDraftIdentity(pbsStandingBidContexts.reserve, reserveBid), properties: reserveProperties }
      : buildEmptyDraft(pbsStandingBidContexts.reserve),
    propertyCatalog: {
      lineholder: lineholderCatalog.catalog,
      reserve: reserveCatalog.catalog,
    },
  };
};

type CreatePbsStandingBidServiceOptions = {
  db: Database;
  liveSchema?: string;
  pbsSchema?: string;
  pgPool?: PgPool;
  reserveCallTypeOptionsResolver?: ReserveCallTypeOptionsResolver;
};

export const createPbsStandingBidService = ({
  db,
  liveSchema,
  pbsSchema,
  pgPool,
  reserveCallTypeOptionsResolver,
}: CreatePbsStandingBidServiceOptions): PbsStandingBidService => {
  const loadReserveCallTypeContext: ReserveCallTypeOptionsResolver = async (actor) => {
    if (reserveCallTypeOptionsResolver) {
      return reserveCallTypeOptionsResolver(actor);
    }

    if (!pgPool || !liveSchema || !pbsSchema) {
      return { division: null, rank: null, options: [] };
    }

    return resolveReserveCallTypeOptions({ actor, pgPool, liveSchema, pbsSchema });
  };

  const loadCatalogs = async (actor: LineholderDraftActor) => {
    const [lineholderCatalog, reserveCatalog, reserveCallTypeContext] = await Promise.all([
      resolveStandingPropertyCatalog(db, "lineholder"),
      resolveStandingPropertyCatalog(db, "reserve"),
      loadReserveCallTypeContext(actor),
    ]);

    return {
      lineholderCatalog,
      reserveCatalog: applyReserveCallTypeOptionsToCatalogContext(reserveCatalog, reserveCallTypeContext.options),
      allowedReserveCallTypes: reserveCallTypeContext.options,
    };
  };

  return {
    async getCurrentStandingBid(actor) {
      const { lineholderCatalog, reserveCatalog } = await loadCatalogs(actor);

      return buildResponse(db, actor, lineholderCatalog, reserveCatalog);
    },

    async saveStandingDraft(actor, request) {
      const { lineholderCatalog, reserveCatalog, allowedReserveCallTypes } = await loadCatalogs(actor);
      const targetCatalog = request.mode === "lineholder" ? lineholderCatalog : reserveCatalog;
      const needsMinimumBaseLayoverConfig = request.draft.properties.some((property) =>
        property.propertyCode === pbsLineLegacyPropertyCodes.minBaseLayover);
      const needsMinimumTimeBetweenFlightsConfig = request.draft.properties.some((property) =>
        property.propertyCode === TIME_BETWEEN_FLIGHTS_PROPERTY_CODE);
      const [minimumBaseLayoverConfig, minimumTimeBetweenFlightsConfig, preferOffConfig] = await Promise.all([
        needsMinimumBaseLayoverConfig ? loadLineMinimumBaseLayoverConfig(db) : Promise.resolve(null),
        needsMinimumTimeBetweenFlightsConfig
          ? loadTimeBetweenFlightsMinimumConfig(db)
          : Promise.resolve(null),
        loadPreferOffConfig(db),
      ]);
      const existingStandingBid = await loadStandingBid(
        db,
        actor,
        contextByMode[request.mode],
      );
      const existingProperties = existingStandingBid
        ? await loadDraftProperties(db, existingStandingBid.id, targetCatalog.catalogByCode, preferOffConfig)
        : [];
      const grandfatheredDurationByKey = new Map<string, string>(
        existingProperties.flatMap((property) => {
          if (property.bid.type !== "minimum-base-layover" || !property.propertyGroupKey) return [];
          const duration = normalizeLineDurationPadded(property.bid.minimumDuration);
          return duration ? [[property.propertyGroupKey, duration] as const] : [];
        }),
      );
      const grandfatheredTimeBetweenFlightsByKey = new Map<string, number>(
        existingProperties.flatMap((property) => {
          if (
            property.propertyCode !== TIME_BETWEEN_FLIGHTS_PROPERTY_CODE
            || property.bid.type !== "duration"
            || !property.propertyGroupKey
          ) return [];
          const duration = parseTimeBetweenFlightsDurationMinutes(property.bid.value);
          return duration === null ? [] : [[property.propertyGroupKey, duration] as const];
        }),
      );
      const normalizedDraft = normalizeStandingDraftRequest(
        request,
        targetCatalog.catalogByCode,
        minimumBaseLayoverConfig,
        minimumTimeBetweenFlightsConfig,
        preferOffConfig,
        grandfatheredDurationByKey,
        grandfatheredTimeBetweenFlightsByKey,
        request.mode === "reserve" ? allowedReserveCallTypes : undefined,
      );
      const now = new Date();

      await db.transaction(async (tx) => {
        const targetBid = await ensureStandingBid(tx, actor, normalizedDraft, now);

        await replaceStandingDraftProperties(
          tx,
          targetBid,
          actor,
          normalizedDraft.properties,
          targetCatalog.propertyIdentityByCode,
          now,
        );
      });

      return buildResponse(db, actor, lineholderCatalog, reserveCatalog, preferOffConfig);
    },
  };
};
