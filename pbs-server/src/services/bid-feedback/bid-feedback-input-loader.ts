import type { Pool } from "pg";
import {
  pbsDaysOffPropertyRegistry,
  type PbsDaysOffDraftProperty,
  type PbsDaysOffPropertyDefinition,
} from "../../../../packages/contracts/pbs-days-off-bids.js";
import {
  pbsSupportedLinePropertyCatalog,
  type PbsLineDraftProperty,
  type PbsLinePropertyDefinition,
} from "../../../../packages/contracts/pbs-line-bids.js";
import {
  pbsPairingPropertyCatalog,
  type PbsPairingDraftProperty,
  type PbsPairingPropertyDefinition,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import {
  pbsReservePropertyRegistry,
  type PbsReserveDraftProperty,
  type PbsReservePropertyDefinition,
} from "../../../../packages/contracts/pbs-reserve-bids.js";
import {
  pbsStandingBidContexts,
  pbsStandingLineholderPropertyCodes,
  pbsStandingLineholderPropertyRegistry,
  pbsStandingPeriodCode,
  pbsStandingReservePropertyCodes,
  pbsStandingReservePropertyRegistry,
  type PbsStandingDraftProperty,
  type PbsStandingPropertyDefinition,
} from "../../../../packages/contracts/pbs-standing-bids.js";
import type { PbsCurrentPeriod } from "../../../../packages/contracts/pbs-current-period.js";
import type { PbsPreferOffConfig } from "../../../../packages/contracts/pbs-prefer-off.js";
import { pbsBidDefinitionCodes } from "../../../../packages/contracts/pbs-bid-definitions.js";
import { env } from "../../config/index.js";
import { mapDaysOffActionFromId } from "../days-off/days-off-draft-mappers.js";
import {
  CURRENT_BID_CONTEXT,
  LineholderBidServiceError,
  type LineholderDraftActor,
} from "../lineholder/shared.js";
import { deserializeRuleBid } from "../lineholder/rule-bid-value.js";
import { mapLineActionFromId } from "../line/line-draft-property-helpers.js";
import {
  applyPairingBidPreferenceJson,
  deserializePairingDraftBid,
  mapPairingActionFromId,
  mapPairingQuantifier,
} from "../pairing/pairing-bid-normalization.js";
import { buildOccurrenceListBidFromRows, type PairingOccurrenceListRow } from "../pairing/pairing-occurrence-list.js";
import {
  deserializeStandingBidValue,
  mapStandingActionFromId,
} from "../standing-bid/standing-bid-service.js";
import {
  buildPreferOffConfigFromDictionaryRows,
  type PreferOffDictionaryRow,
} from "../days-off/prefer-off-config.js";

export type BidFeedbackInputDrafts = {
  currentPeriod: PbsCurrentPeriod;
  actorContext: {
    base: string | null;
    rank: string | null;
    zoneId: string | null;
  };
  preferOffConfig: PbsPreferOffConfig;
  pairingDraft: {
    draftVersion: number;
    properties: PbsPairingDraftProperty[];
  };
  daysOffDraft: {
    draftVersion: number;
    properties: PbsDaysOffDraftProperty[];
  };
  lineDraft: {
    draftVersion: number;
    properties: PbsLineDraftProperty[];
  };
  reserveDraft: {
    draftVersion: number;
    properties: PbsReserveDraftProperty[];
  };
  standingLineholderDraft: {
    draftVersion: number;
    properties: PbsStandingDraftProperty[];
  };
  standingReserveDraft: {
    draftVersion: number;
    properties: PbsStandingDraftProperty[];
  };
};

type BidFeedbackInputRow = {
  bid_id: string | number;
  bid_context: string;
  period_code: string;
  roster_period_id: string | number | null;
  draft_version: string | number;
  remarks: string | null;
  property_group_key: string | null;
  group_seq: number | null;
  bid_type: string | null;
  legacy_property_code: number | null;
  property_code: number | null;
  property_name: string | null;
  action_id: number | null;
  operator: string | null;
  param_a: string | null;
  param_b: string | null;
  param_c: string | null;
  preference_json: { creditPriority?: "higher" | "lower" } | null;
  all_or_nothing: number | null;
  minimum_n: number | null;
  limit_n: number | null;
  tier: number | null;
  actor_base: string | null;
  actor_rank: string | null;
  actor_zone_id: string | null;
  occurrence_rows?: PairingOccurrenceListRow[] | null;
};

type InputBidKey = "current" | "standingLineholder" | "standingReserve";

type InputBidState = {
  bidId: number;
  draftVersion: number;
  rows: BidFeedbackInputRow[];
};

const DAY_OF_WEEK_PARENT_CODE = "DOW";
const EMPTY_PREFER_OFF_CONFIG: PbsPreferOffConfig = { weekdays: [], weekend: { available: false } };

const pairingCatalogByCode = new Map<number, PbsPairingPropertyDefinition>(
  pbsPairingPropertyCatalog.map((definition) => [definition.propertyCode, definition]),
);
const daysOffCatalogByCode = new Map<number, PbsDaysOffPropertyDefinition>(
  pbsDaysOffPropertyRegistry.map((definition) => [definition.propertyCode, definition]),
);
const lineCatalogByCode = new Map<number, PbsLinePropertyDefinition>(
  pbsSupportedLinePropertyCatalog.map((definition) => [definition.propertyCode, definition]),
);
const reserveCatalogByCode = new Map<number, PbsReservePropertyDefinition>(
  pbsReservePropertyRegistry.map((definition) => [definition.propertyCode, definition]),
);
const standingLineholderCatalogByCode = new Map<number, PbsStandingPropertyDefinition>(
  pbsStandingLineholderPropertyRegistry.map((definition) => [definition.propertyCode, definition]),
);
const standingReserveCatalogByCode = new Map<number, PbsStandingPropertyDefinition>(
  pbsStandingReservePropertyRegistry.map((definition) => [definition.propertyCode, definition]),
);
const validateSchemaName = (schema: string, label: string): string => {
  if (!/^[a-z][a-z0-9_]*$/.test(schema)) {
    throw new Error(`Invalid ${label}: ${schema}`);
  }
  return schema;
};
const pbsSchema = validateSchemaName(env.PBS_SCHEMA, "PBS schema name");
const liveSchema = validateSchemaName(env.LIVE_SCHEMA, "live schema name");

const safeInteger = (value: string | number | null | undefined, fallback = 0): number => {
  if (value === null || value === undefined) return fallback;
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new LineholderBidServiceError(500, "Loaded PBS identifier is outside the supported range.");
  }
  return parsed;
};

const trimToNull = (value: string | null | undefined): string | null => {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
};

const trimCodeToNull = (value: string | null | undefined): string | null => {
  const normalized = trimToNull(value)?.toUpperCase() ?? null;
  return normalized;
};

const toTier = (tier: number | null): string | null => {
  if (!Number.isSafeInteger(tier) || tier === null || tier <= 0) return null;
  return `T${tier}`;
};

const sortByRowSeq = <T extends { rowSeq: number }>(properties: T[]): T[] =>
  properties.sort((left, right) => left.rowSeq - right.rowSeq);

const normalizeTiers = (tiers: string[]): string[] =>
  Array.from(new Set(tiers)).sort((left, right) =>
    Number(left.slice(1)) - Number(right.slice(1)));

const buildCurrentPeriodDraftVersion = (states: Map<InputBidKey, InputBidState>): number =>
  states.get("current")?.draftVersion ?? 0;

const collectInputRows = (rows: BidFeedbackInputRow[]): Map<InputBidKey, InputBidState> => {
  const states = new Map<InputBidKey, InputBidState>();
  for (const row of rows) {
    const key = row.bid_context === CURRENT_BID_CONTEXT
      ? "current"
      : row.bid_context === pbsStandingBidContexts.lineholder
        ? "standingLineholder"
        : row.bid_context === pbsStandingBidContexts.reserve
          ? "standingReserve"
          : null;
    if (!key) continue;
    const state = states.get(key) ?? {
      bidId: safeInteger(row.bid_id),
      draftVersion: safeInteger(row.draft_version),
      rows: [],
    };
    state.rows.push(row);
    states.set(key, state);
  }
  return states;
};

const loadBidRows = async (
  pgPool: Pick<Pool, "query">,
  actor: LineholderDraftActor,
  currentPeriod: PbsCurrentPeriod,
  rosterPeriodId: number,
): Promise<BidFeedbackInputRow[]> => {
  const result = await pgPool.query<BidFeedbackInputRow>(
    `
      with bid_feedback_actor_identity as (
        select
          $1::varchar as crew_id,
          $2::varchar as user_code,
          nullif(btrim($8::varchar), '') as current_base,
          nullif(btrim($9::varchar), '') as current_zone_id,
          $10::date as rp_start_local,
          $11::date as rp_end_local
      ),
      bid_feedback_actor_context as (
        select
          coalesce(nullif(btrim(crew_base.base), ''), actor.current_base) as actor_base,
          nullif(btrim(crew_rank.rank), '') as actor_rank,
          coalesce(base_tz.name, actor.current_zone_id) as actor_zone_id
        from bid_feedback_actor_identity actor
        left join lateral (
          select cb.base
          from ${liveSchema}.crew_base cb
          left join ${liveSchema}.airport cb_airport
            on upper(btrim(cb_airport.airport)) = upper(btrim(cb.base))
          where cb.crew_id = actor.crew_id
            and cb.eff_dt < ((actor.rp_end_local + 1)::timestamp at time zone coalesce(nullif(btrim(cb_airport.zone_id), ''), actor.current_zone_id, 'UTC'))
            and (
              cb.exp_dt is null
              or cb.exp_dt >= (actor.rp_start_local::timestamp at time zone coalesce(nullif(btrim(cb_airport.zone_id), ''), actor.current_zone_id, 'UTC'))
            )
          order by cb.is_prime_base desc, cb.eff_dt desc, cb.id desc
          limit 1
        ) crew_base on true
        left join lateral (
          select cr.rank
          from ${liveSchema}.crew_rank cr
          where cr.crew_id = actor.crew_id
            and cr.eff_dt < ((actor.rp_end_local + 1)::timestamp at time zone 'UTC')
            and (
              cr.exp_dt is null
              or cr.exp_dt >= (actor.rp_start_local::timestamp at time zone 'UTC')
            )
          order by cr.eff_dt desc, cr.id desc
          limit 1
        ) crew_rank on true
        left join ${liveSchema}.airport base_airport
          on upper(btrim(base_airport.airport)) = upper(btrim(coalesce(nullif(btrim(crew_base.base), ''), actor.current_base)))
        left join pg_timezone_names base_tz
          on base_tz.name = nullif(btrim(base_airport.zone_id), '')
        limit 1
      ),
      bid_feedback_target_bids as (
        select
          bid.id,
          bid.bid_context,
          bid.period_code,
          bid.roster_period_id,
          bid.draft_version,
          bid.remarks
        from ${pbsSchema}.pbs_bid bid
        where bid.crew_id = $1
          and (
            (bid.bid_context = $3 and bid.roster_period_id = $4)
            or (bid.period_code = $5 and bid.bid_context in ($6, $7))
          )
      ),
      bid_feedback_pairing_occurrences as (
        select
          occurrence.bid_id,
          occurrence.property_group_key,
          jsonb_agg(
            jsonb_build_object(
              'propertyGroupKey', occurrence.property_group_key,
              'tier', occurrence.tier,
              'pairingNumber', occurrence.pairing_number,
              'originDate', occurrence.origin_date::text,
              'pairingId', occurrence.pairing_id,
              'occurrenceId', occurrence.occurrence_id
            )
            order by occurrence.tier, occurrence.pairing_number, occurrence.origin_date
          ) as occurrence_rows
        from ${pbsSchema}.pbs_bid_pairing_occurrence occurrence
        join bid_feedback_target_bids bid
          on bid.id = occurrence.bid_id
         and bid.bid_context = $3
        where occurrence.is_deleted = 0
        group by occurrence.bid_id, occurrence.property_group_key
      ),
      bid_feedback_input_rows as (
        select
          bid.id as bid_id,
          bid.bid_context,
          bid.period_code,
          bid.roster_period_id,
          bid.draft_version,
          bid.remarks,
          bid_group.property_group_key,
          bid_group.group_seq,
          bid_group.bid_type,
          bid_group.property_id as legacy_property_code,
          property.property_code,
          property.property_name,
          bid_group.action_id,
          bid_group.operator,
          bid_group.param_a,
          bid_group.param_b,
          bid_group.param_c,
          bid_group.preference_json,
          bid_group.all_or_nothing,
          bid_group.minimum_n,
          bid_group.limit_n,
          tier.tier,
          actor_context.actor_base,
          actor_context.actor_rank,
          actor_context.actor_zone_id,
          coalesce(pairing_occurrences.occurrence_rows, '[]'::jsonb) as occurrence_rows
        from bid_feedback_target_bids bid
        cross join bid_feedback_actor_context actor_context
        left join ${pbsSchema}.pbs_bid_group bid_group
          on bid_group.bid_id = bid.id
        left join ${pbsSchema}.pbs_bid_tier tier
          on tier.id = bid_group.tier_id
        left join ${pbsSchema}.pbs_bid_property property
          on property.id = bid_group.property_definition_id
        left join bid_feedback_pairing_occurrences pairing_occurrences
          on pairing_occurrences.bid_id = bid.id
         and pairing_occurrences.property_group_key = bid_group.property_group_key
      )
      select *
      from bid_feedback_input_rows
      order by bid_context, group_seq, tier
    `,
    [
      actor.crewId,
      actor.userCode,
      CURRENT_BID_CONTEXT,
      rosterPeriodId,
      pbsStandingPeriodCode,
      pbsStandingBidContexts.lineholder,
      pbsStandingBidContexts.reserve,
      currentPeriod.base ?? null,
      currentPeriod.zoneId ?? null,
      currentPeriod.rpStartLocal ?? null,
      currentPeriod.rpEndLocal ?? null,
    ],
  );
  return result.rows;
};

const occurrenceRowsByPropertyKey = (rows: PairingOccurrenceListRow[]) => {
  const rowsByKey = new Map<string, PairingOccurrenceListRow[]>();
  for (const row of rows) {
    const rowsForKey = rowsByKey.get(row.propertyGroupKey) ?? [];
    rowsForKey.push(row);
    rowsByKey.set(row.propertyGroupKey, rowsForKey);
  }
  return rowsByKey;
};

const occurrenceRowsFromInputRows = (rows: BidFeedbackInputRow[]): PairingOccurrenceListRow[] => {
  const result: PairingOccurrenceListRow[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    for (const occurrence of row.occurrence_rows ?? []) {
      const propertyGroupKey = String(occurrence.propertyGroupKey ?? "");
      const tier = Number(occurrence.tier);
      const pairingNumber = String(occurrence.pairingNumber ?? "");
      const originDate = String(occurrence.originDate ?? "");
      const pairingId = String(occurrence.pairingId ?? "");
      const occurrenceId = occurrence.occurrenceId === null || occurrence.occurrenceId === undefined
        ? null
        : String(occurrence.occurrenceId);
      if (!propertyGroupKey || !Number.isSafeInteger(tier) || !pairingNumber || !originDate || !pairingId) {
        continue;
      }
      const key = `${propertyGroupKey}|${tier}|${pairingNumber}|${originDate}|${pairingId}|${occurrenceId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        propertyGroupKey,
        tier,
        pairingNumber,
        originDate,
        pairingId,
        occurrenceId,
      });
    }
  }

  return result;
};

const loadStandingPreferOffConfig = async (
  pgPool: Pick<Pool, "query">,
): Promise<PbsPreferOffConfig> => {
  const result = await pgPool.query<PreferOffDictionaryRow>(
    `
      select
        parent_code::varchar as "parentCode",
        code::varchar as code,
        name::varchar as name,
        code_value::varchar as "codeValue",
        idx::int as idx
      from ${liveSchema}.dictionary
      where parent_code in ($1, $2)
      order by parent_code, coalesce(idx, 0), code
    `,
    [DAY_OF_WEEK_PARENT_CODE, pbsBidDefinitionCodes.weekendParent],
  );

  return buildPreferOffConfigFromDictionaryRows(result.rows);
};

const buildPairingProperties = (
  rows: BidFeedbackInputRow[],
  occurrenceRows: PairingOccurrenceListRow[],
): PbsPairingDraftProperty[] => {
  const properties = new Map<string, PbsPairingDraftProperty>();
  const occurrencesByKey = occurrenceRowsByPropertyKey(occurrenceRows);
  for (const row of rows) {
    if (row.bid_type !== "Pairing" || !row.property_group_key || row.group_seq === null) continue;
    const propertyCode = row.property_code ?? row.legacy_property_code;
    const tier = toTier(row.tier);
    if (!propertyCode || !tier) continue;
    const definition = pairingCatalogByCode.get(propertyCode);
    if (!definition) continue;
    const existing = properties.get(row.property_group_key);
    if (!existing) {
      properties.set(row.property_group_key, {
        propertyGroupKey: row.property_group_key,
        rowSeq: row.group_seq,
        propertyCode,
        name: row.property_name ?? definition.name,
        action: mapPairingActionFromId(row.action_id),
        quantifier: mapPairingQuantifier(row.param_c) ?? definition.defaultQuantifier ?? null,
        bid: applyPairingBidPreferenceJson(
          propertyCode,
          buildOccurrenceListBidFromRows(occurrencesByKey.get(row.property_group_key) ?? [])
            ?? deserializePairingDraftBid(definition, {
              operator: row.operator,
              paramA: row.param_a,
              paramB: row.param_b,
              paramC: row.param_c,
            }),
          row.preference_json,
        ),
        tiers: [tier],
      });
      continue;
    }
    existing.tiers = normalizeTiers([...existing.tiers, tier]);
  }
  return sortByRowSeq(Array.from(properties.values()));
};

const buildDaysOffProperties = (rows: BidFeedbackInputRow[]): PbsDaysOffDraftProperty[] => {
  const properties = new Map<string, PbsDaysOffDraftProperty>();
  for (const row of rows) {
    if (row.bid_type !== "DaysOff" || !row.property_group_key || row.group_seq === null) continue;
    const propertyCode = row.property_code ?? row.legacy_property_code;
    const tier = toTier(row.tier);
    if (!propertyCode || !tier) continue;
    const definition = daysOffCatalogByCode.get(propertyCode);
    if (!definition) continue;
    const existing = properties.get(row.property_group_key);
    if (!existing) {
      properties.set(row.property_group_key, {
        propertyGroupKey: row.property_group_key,
        rowSeq: row.group_seq,
        propertyCode,
        name: row.property_name ?? definition.name,
        action: mapDaysOffActionFromId(propertyCode, row.action_id),
        bid: deserializeRuleBid(definition, {
          operator: row.operator,
          paramA: row.param_a,
          paramB: row.param_b,
          paramC: row.param_c,
        }),
        tiers: [tier],
        allOrNothing: row.all_or_nothing === 1,
        minimumN: row.minimum_n ?? null,
        maximumN: row.limit_n ?? null,
      });
      continue;
    }
    existing.tiers = normalizeTiers([...existing.tiers, tier]);
  }
  return sortByRowSeq(Array.from(properties.values()));
};

const buildLineProperties = (rows: BidFeedbackInputRow[]): PbsLineDraftProperty[] => {
  const properties = new Map<string, PbsLineDraftProperty>();
  for (const row of rows) {
    if (row.bid_type !== "Line" || !row.property_group_key || row.group_seq === null) continue;
    const propertyCode = row.property_code ?? row.legacy_property_code;
    const tier = toTier(row.tier);
    if (!propertyCode || !tier) continue;
    const definition = lineCatalogByCode.get(propertyCode);
    if (!definition) continue;
    const existing = properties.get(row.property_group_key);
    if (!existing) {
      properties.set(row.property_group_key, {
        propertyGroupKey: row.property_group_key,
        rowSeq: row.group_seq,
        propertyCode,
        name: row.property_name ?? definition.name,
        action: mapLineActionFromId(row.action_id),
        bid: deserializeRuleBid(definition, {
          operator: row.operator,
          paramA: row.param_a,
          paramB: row.param_b,
          paramC: row.param_c,
        }),
        tiers: [tier],
      });
      continue;
    }
    existing.tiers = normalizeTiers([...existing.tiers, tier]);
  }
  return sortByRowSeq(Array.from(properties.values()));
};

const buildReserveProperties = (rows: BidFeedbackInputRow[]): PbsReserveDraftProperty[] => {
  const properties = new Map<string, PbsReserveDraftProperty>();
  for (const row of rows) {
    if (row.bid_type !== "Reserve" || !row.property_group_key || row.group_seq === null) continue;
    const propertyCode = row.property_code ?? row.legacy_property_code;
    const tier = toTier(row.tier);
    if (!propertyCode || !tier) continue;
    const definition = reserveCatalogByCode.get(propertyCode);
    if (!definition) continue;
    const existing = properties.get(row.property_group_key);
    if (!existing) {
      properties.set(row.property_group_key, {
        propertyGroupKey: row.property_group_key,
        rowSeq: row.group_seq,
        propertyCode,
        name: row.property_name ?? definition.name,
        bid: deserializeRuleBid(definition, {
          operator: row.operator,
          paramA: row.param_a,
          paramB: row.param_b,
          paramC: row.param_c,
        }),
        tiers: [tier],
      });
      continue;
    }
    existing.tiers = normalizeTiers([...existing.tiers, tier]);
  }
  return sortByRowSeq(Array.from(properties.values()));
};

const buildStandingProperties = (
  rows: BidFeedbackInputRow[],
  catalogByCode: ReadonlyMap<number, PbsStandingPropertyDefinition>,
  preferOffConfig: PbsPreferOffConfig,
): PbsStandingDraftProperty[] => {
  const properties = new Map<string, PbsStandingDraftProperty>();
  for (const row of rows) {
    if (!row.bid_type || !row.property_group_key || row.group_seq === null) continue;
    const propertyCode = row.property_code ?? row.legacy_property_code;
    const tier = toTier(row.tier);
    if (!propertyCode || !tier) continue;
    const definition = catalogByCode.get(propertyCode);
    if (!definition || definition.bidType !== row.bid_type) {
      throw new LineholderBidServiceError(
        409,
        "Standing Bid contains a saved property that is no longer supported.",
      );
    }
    const existing = properties.get(row.property_group_key);
    if (!existing) {
      properties.set(row.property_group_key, {
        propertyGroupKey: row.property_group_key,
        rowSeq: row.group_seq,
        bidType: definition.bidType,
        propertyCode,
        name: row.property_name ?? definition.name,
        action: mapStandingActionFromId(row.action_id),
        bid: deserializeStandingBidValue(
          definition,
          {
            operator: row.operator,
            paramA: row.param_a,
            paramB: row.param_b,
            paramC: row.param_c,
          },
          preferOffConfig,
        ),
        tiers: [tier],
      });
      continue;
    }
    existing.tiers = normalizeTiers([...existing.tiers, tier]);
  }
  return sortByRowSeq(Array.from(properties.values()));
};

const standingRowNeedsPreferOffConfig = (
  row: BidFeedbackInputRow,
  catalogByCode: ReadonlyMap<number, PbsStandingPropertyDefinition>,
): boolean => {
  if (!row.bid_type || !row.property_group_key || row.group_seq === null) return false;
  const propertyCode = row.property_code ?? row.legacy_property_code;
  const tier = toTier(row.tier);
  if (!propertyCode || !tier) return false;
  const definition = catalogByCode.get(propertyCode);
  if (!definition || definition.bidType !== row.bid_type) {
    throw new LineholderBidServiceError(
      409,
      "Standing Bid contains a saved property that is no longer supported.",
    );
  }

  return (
    definition.defaultBid.type === "tag-list"
    && row.operator === "In"
    && Boolean(row.param_a)
  ) || (
    (
      definition.propertyCode === pbsStandingLineholderPropertyCodes.dayOfWeekOff
      || definition.propertyCode === pbsStandingReservePropertyCodes.reserveDayOfWeekOff
    )
    && definition.defaultBid.type === "date-or-dow-list"
    && row.operator === "="
  );
};

const standingRowsNeedPreferOffConfig = (
  rows: BidFeedbackInputRow[],
  catalogByCode: ReadonlyMap<number, PbsStandingPropertyDefinition>,
): boolean => rows.some((row) => standingRowNeedsPreferOffConfig(row, catalogByCode));

const daysOffRowsNeedPreferOffConfig = (rows: BidFeedbackInputRow[]): boolean =>
  rows.some((row) => {
    if (row.bid_type !== "DaysOff" || !row.property_group_key || row.group_seq === null) return false;
    const propertyCode = row.property_code ?? row.legacy_property_code;
    const definition = propertyCode ? daysOffCatalogByCode.get(propertyCode) : undefined;
    return definition?.propertyCode === 201
      && definition.defaultBid.type === "tag-list"
      && row.operator === "In"
      && Boolean(trimToNull(row.param_a));
  });

const validateStandingRowsSupported = (
  rows: BidFeedbackInputRow[],
  catalogByCode: ReadonlyMap<number, PbsStandingPropertyDefinition>,
): void => {
  for (const row of rows) {
    if (!row.bid_type || !row.property_group_key || row.group_seq === null) continue;
    const propertyCode = row.property_code ?? row.legacy_property_code;
    const tier = toTier(row.tier);
    if (!propertyCode || !tier) continue;
    const definition = catalogByCode.get(propertyCode);
    if (!definition || definition.bidType !== row.bid_type) {
      throw new LineholderBidServiceError(
        409,
        "Standing Bid contains a saved property that is no longer supported.",
      );
    }
  }
};

const buildActorContext = (
  rows: BidFeedbackInputRow[],
  currentPeriod: PbsCurrentPeriod,
): BidFeedbackInputDrafts["actorContext"] => {
  const contextRow = rows.find((row) =>
    trimToNull(row.actor_base) || trimToNull(row.actor_rank) || trimToNull(row.actor_zone_id));

  return {
    base: trimCodeToNull(contextRow?.actor_base) ?? trimCodeToNull(currentPeriod.base),
    rank: trimCodeToNull(contextRow?.actor_rank),
    zoneId: trimToNull(contextRow?.actor_zone_id) ?? trimToNull(currentPeriod.zoneId),
  };
};

export const loadBidFeedbackInputs = async ({
  actor,
  currentPeriod,
  pgPool,
}: {
  actor: LineholderDraftActor;
  currentPeriod: PbsCurrentPeriod;
  pgPool: Pick<Pool, "query">;
}): Promise<BidFeedbackInputDrafts> => {
  const rosterPeriodId = currentPeriod.rosterPeriodId ?? currentPeriod.id;
  if (!rosterPeriodId) {
    throw new LineholderBidServiceError(409, "The current Bid Period is not configured.");
  }
  const rows = await loadBidRows(pgPool, actor, currentPeriod, rosterPeriodId);
  const states = collectInputRows(rows);
  const currentRows = states.get("current")?.rows ?? [];
  const standingLineholderRows = states.get("standingLineholder")?.rows ?? [];
  const standingReserveRows = states.get("standingReserve")?.rows ?? [];
  const currentDraftVersion = buildCurrentPeriodDraftVersion(states);
  const occurrenceRows = occurrenceRowsFromInputRows(currentRows);
  const pairingProperties = buildPairingProperties(currentRows, occurrenceRows);
  const daysOffProperties = buildDaysOffProperties(currentRows);
  const lineProperties = buildLineProperties(currentRows);
  const reserveProperties = buildReserveProperties(currentRows);
  const hasCurrentProperties = pairingProperties.length > 0
    || daysOffProperties.length > 0
    || lineProperties.length > 0
    || reserveProperties.length > 0;
  validateStandingRowsSupported(standingLineholderRows, standingLineholderCatalogByCode);
  validateStandingRowsSupported(standingReserveRows, standingReserveCatalogByCode);
  const needsStandingProperties = !hasCurrentProperties;
  const needsPreferOffConfig = daysOffRowsNeedPreferOffConfig(currentRows) || (needsStandingProperties && (
    standingRowsNeedPreferOffConfig(standingLineholderRows, standingLineholderCatalogByCode)
    || standingRowsNeedPreferOffConfig(standingReserveRows, standingReserveCatalogByCode)
  ));
  const preferOffConfig = needsPreferOffConfig
    ? await loadStandingPreferOffConfig(pgPool)
    : EMPTY_PREFER_OFF_CONFIG;

  return {
    currentPeriod,
    actorContext: buildActorContext(rows, currentPeriod),
    preferOffConfig,
    pairingDraft: {
      draftVersion: currentDraftVersion,
      properties: pairingProperties,
    },
    daysOffDraft: {
      draftVersion: currentDraftVersion,
      properties: daysOffProperties,
    },
    lineDraft: {
      draftVersion: currentDraftVersion,
      properties: lineProperties,
    },
    reserveDraft: {
      draftVersion: currentDraftVersion,
      properties: reserveProperties,
    },
    standingLineholderDraft: {
      draftVersion: states.get("standingLineholder")?.draftVersion ?? 0,
      properties: needsStandingProperties
        ? buildStandingProperties(standingLineholderRows, standingLineholderCatalogByCode, preferOffConfig)
        : [],
    },
    standingReserveDraft: {
      draftVersion: states.get("standingReserve")?.draftVersion ?? 0,
      properties: needsStandingProperties
        ? buildStandingProperties(standingReserveRows, standingReserveCatalogByCode, preferOffConfig)
        : [],
    },
  };
};
