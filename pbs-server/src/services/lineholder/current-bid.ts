import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PbsComputedPeriodStage, PbsRosterPeriodContext } from "../../../../packages/contracts/pbs-current-period.js";
import { env } from "../../config/index.js";
import {
  pbsBid,
} from "../../models/index.js";
import { formatDashboardDateTimeLabel } from "../dashboard-timezone.js";
import {
  CURRENT_BID_CONTEXT,
  LineholderBidServiceError,
  type CurrentBidTarget,
  type CurrentDraftIdentity,
  type CurrentDraftReference,
  type CurrentPeriodBidContext,
  type LineholderDraftActor,
  type LineholderPeriodContext,
} from "./shared-types.js";

type Database = ReturnType<typeof drizzle>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type CurrentPeriodRow = {
  period_id: string | number | null;
  roster_period_key: string | null;
  period_code: string | null;
  filiale: string | null;
  status: string | null;
  bid_open_at: string | Date | null;
  bid_close_at: string | Date | null;
  base?: string | null;
  zone_id?: string | null;
  rp_start_local?: string | null;
  rp_end_local?: string | null;
};

const deriveFilialeFromPbsSchema = () =>
  env.LIVE_SCHEMA.toUpperCase();

const parseDateValue = (value: string | Date | null | undefined): Date | null => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

export const computePbsPeriodStage = (
  bidOpenAt: Date | null,
  bidCloseAt: Date | null,
  businessNow: Date,
): PbsComputedPeriodStage => {
  if (!bidOpenAt || !bidCloseAt) {
    return "INCOMPLETE";
  }

  if (bidOpenAt > businessNow) {
    return "NOT_OPEN";
  }

  if (bidCloseAt <= businessNow) {
    return "CLOSED";
  }

  return "OPEN";
};

const buildReadOnlyReason = (
  row: CurrentPeriodRow | null,
  businessNow: Date,
): string | null => {
  if (!row?.period_code) {
    return "No bid period is configured.";
  }

  if (!row.base) {
    return "No effective prime base is configured for this roster period. Please contact an administrator.";
  }

  if (!row.zone_id) {
    return "The base timezone is not configured, so this roster period is unavailable.";
  }

  const bidOpenAt = parseDateValue(row.bid_open_at);
  const bidCloseAt = parseDateValue(row.bid_close_at);
  const computedStage = computePbsPeriodStage(bidOpenAt, bidCloseAt, businessNow);

  if (computedStage === "NOT_OPEN" && bidOpenAt) {
    return `Bidding opens at ${formatDashboardDateTimeLabel(bidOpenAt, row.zone_id) ?? "the configured bid open time"}.`;
  }

  if (computedStage === "CLOSED" && bidCloseAt) {
    return `Bidding closed at ${formatDashboardDateTimeLabel(bidCloseAt, row.zone_id) ?? "the configured bid close time"}.`;
  }

  if (computedStage === "INCOMPLETE") {
    return "Bid period window is incomplete.";
  }

  return null;
};

const parseNullableSafeInteger = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed)) {
    throw new LineholderBidServiceError(500, "Loaded PBS identifier is outside the supported range.");
  }

  return parsed;
};

const isValidIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const periodContextError = (
  statusCode: number,
  errorCode: "PERIOD_CONTEXT_REQUIRED" | "PERIOD_NOT_FOUND" | "PERIOD_RANGE_INVALID",
  message: string,
) => new LineholderBidServiceError(statusCode, message, errorCode);

export const assertRosterPeriodContext = (
  period: Pick<LineholderPeriodContext, "rosterPeriodId" | "rosterPeriodKey" | "periodCode" | "rpStartLocal" | "rpEndLocal">,
): void => {
  if (!period.rosterPeriodId || !period.rosterPeriodKey.trim() || !period.periodCode.trim()) {
    throw periodContextError(
      409,
      "PERIOD_CONTEXT_REQUIRED",
      "The current bid is missing a valid roster period. Please contact an administrator.",
    );
  }

  if (
    !isValidIsoDate(period.rpStartLocal)
    || !isValidIsoDate(period.rpEndLocal)
    || period.rpStartLocal > period.rpEndLocal
  ) {
    throw periodContextError(
      409,
      "PERIOD_RANGE_INVALID",
      "The current roster period date range is invalid. Please contact an administrator.",
    );
  }
};

const mapCurrentPeriodRow = (
  row: CurrentPeriodRow | null | undefined,
  businessNow: Date,
): LineholderPeriodContext => {
  if (!row) {
    throw periodContextError(
      404,
      "PERIOD_NOT_FOUND",
      "No current bid roster period is configured. Please contact an administrator.",
    );
  }

  const rosterPeriodId = parseNullableSafeInteger(row.period_id);
  const rosterPeriodKey = row.roster_period_key?.trim() ?? "";
  const periodCode = row.period_code?.trim() ?? "";
  const rpStartLocal = row.rp_start_local?.trim() ?? "";
  const rpEndLocal = row.rp_end_local?.trim() ?? "";

  assertRosterPeriodContext({
    rosterPeriodId: rosterPeriodId ?? 0,
    rosterPeriodKey,
    periodCode,
    rpStartLocal,
    rpEndLocal,
  });

  const bidOpenAt = parseDateValue(row.bid_open_at);
  const bidCloseAt = parseDateValue(row.bid_close_at);
  const computedStage = computePbsPeriodStage(bidOpenAt, bidCloseAt, businessNow);
  const readOnlyReason = buildReadOnlyReason(row, businessNow);

  return {
    rosterPeriodId: rosterPeriodId ?? 0,
    rosterPeriodKey,
    periodCode,
    filiale: row.filiale,
    status: row.status,
    computedStage,
    bidOpenAt,
    bidCloseAt,
    base: row.base ?? null,
    zoneId: row.zone_id ?? null,
    timezoneLabel: row.base ? `${row.base} Local Time` : null,
    rpStartLocal,
    rpEndLocal,
    canEditBid: readOnlyReason === null,
    readOnlyReason,
  };
};

const validateLiveSchema = (value: string): string => {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid live schema name: ${value}`);
  }
  return value;
};

const buildCurrentPeriodCte = (actor: Pick<LineholderDraftActor, "crewId">, businessNow: Date) => {
  const filiale = deriveFilialeFromPbsSchema();
  const schema = sql.raw(validateLiveSchema(env.LIVE_SCHEMA));

  return sql`
    with automatic_candidates as (
      select
        period.id::text as period_id,
        period.roster_period::varchar as roster_period_key,
        period.pbs_period_code::varchar as period_code,
        ${filiale}::varchar as filiale,
        period.pbs_status::varchar as status,
        period.pbs_bid_open_at at time zone effective_base.zone_id as bid_open_at,
        period.pbs_bid_close_at at time zone effective_base.zone_id as bid_close_at,
        effective_base.base,
        effective_base.zone_id,
        to_char(period.rp_start, 'YYYY-MM-DD') as rp_start_local,
        to_char(period.rp_end, 'YYYY-MM-DD') as rp_end_local,
        period.id as period_sort_id,
        case
          when effective_base.zone_id is null
            or period.pbs_bid_open_at is null
            or period.pbs_bid_close_at is null
          then 3
          when period.pbs_bid_open_at at time zone effective_base.zone_id <= ${businessNow}
            and period.pbs_bid_close_at at time zone effective_base.zone_id > ${businessNow}
          then 0
          when period.pbs_bid_close_at at time zone effective_base.zone_id <= ${businessNow}
          then 1
          when period.pbs_bid_open_at at time zone effective_base.zone_id > ${businessNow}
          then 2
          else 3
        end as sort_rank
      from ${schema}.roster_period period
      left join lateral (
        select crew_base.base, airport.zone_id
        from ${schema}.crew_base crew_base
        join ${schema}.airport airport
          on upper(airport.airport) = upper(crew_base.base)
        join pg_timezone_names timezone
          on timezone.name = airport.zone_id
        where crew_base.crew_id = ${actor.crewId}
          and crew_base.is_prime_base = 1
          and crew_base.eff_dt < ((period.rp_start::date + 1)::timestamp at time zone airport.zone_id)
          and (
            crew_base.exp_dt is null
            or crew_base.exp_dt >= (period.rp_start::date::timestamp at time zone airport.zone_id)
          )
        order by crew_base.eff_dt desc, crew_base.id desc
        limit 1
      ) effective_base on true
      where period.pbs_period_code is not null
        and nullif(period.pbs_period_code, '') is not null
    ),
    current_period as (
      select
        period_id,
        roster_period_key,
        period_code,
        filiale,
        status,
        bid_open_at,
        bid_close_at,
        base,
        zone_id,
        rp_start_local,
        rp_end_local,
        period_sort_id
      from automatic_candidates
      order by
        sort_rank asc,
        case when sort_rank in (0, 1) then bid_close_at end desc nulls last,
        case when sort_rank = 2 then bid_open_at end asc nulls last,
        period_sort_id desc
      limit 1
    )
  `;
};

export const resolveCurrentPeriod = async (
  db: Pick<Database, "execute">,
  actor: Pick<LineholderDraftActor, "crewId">,
  businessNow = new Date(),
): Promise<LineholderPeriodContext> => {
  const result = await db.execute<CurrentPeriodRow>(sql`
    ${buildCurrentPeriodCte(actor, businessNow)}
    select
      current_period.period_id::text as period_id,
      current_period.roster_period_key::varchar as roster_period_key,
      current_period.period_code::varchar as period_code,
      current_period.filiale::varchar as filiale,
      current_period.status::varchar as status,
      current_period.bid_open_at as bid_open_at,
      current_period.bid_close_at as bid_close_at
      , current_period.base as base
      , current_period.zone_id as zone_id
      , current_period.rp_start_local as rp_start_local
      , current_period.rp_end_local as rp_end_local
    from current_period
  `);

  return mapCurrentPeriodRow(result.rows[0], businessNow);
};

export const toPbsCurrentPeriod = (period: LineholderPeriodContext): PbsRosterPeriodContext => ({
  id: period.rosterPeriodId,
  rosterPeriodId: period.rosterPeriodId,
  rosterPeriodKey: period.rosterPeriodKey,
  periodCode: period.periodCode,
  filiale: period.filiale,
  status: period.status,
  computedStage: period.computedStage,
  bidOpenAt: period.bidOpenAt?.toISOString() ?? null,
  bidCloseAt: period.bidCloseAt?.toISOString() ?? null,
  base: period.base,
  zoneId: period.zoneId,
  timezoneLabel: period.timezoneLabel,
  rpStartLocal: period.rpStartLocal,
  rpEndLocal: period.rpEndLocal,
  canEditBid: period.canEditBid,
  readOnlyReason: period.readOnlyReason,
});

export const assertCurrentPeriodCanEdit = (
  period: LineholderPeriodContext,
  targetPeriodCode = period.periodCode,
): void => {
  if (targetPeriodCode.trim() !== period.periodCode) {
    throw new LineholderBidServiceError(409, `Current bid period changed to ${period.periodCode}. Please refresh before saving again.`);
  }

  if (!period.canEditBid) {
    throw new LineholderBidServiceError(423, period.readOnlyReason ?? `Bidding is not open for ${period.periodCode}.`);
  }
};

export const buildDraftIdentity = (
  period: LineholderPeriodContext,
  bid?: Pick<typeof pbsBid.$inferSelect, "id" | "periodCode" | "rosterPeriodId" | "draftVersion"> | null,
): CurrentDraftIdentity => {
  if (!bid) {
    return {
      periodId: period.rosterPeriodId,
      draftVersion: 0,
      periodCode: period.periodCode,
    };
  }

  if (bid.rosterPeriodId !== period.rosterPeriodId) {
    throw periodContextError(
      409,
      "PERIOD_CONTEXT_REQUIRED",
      "The current draft is not linked to the active roster period. Please refresh and try again.",
    );
  }

  return {
    draftKey: String(bid.id),
    bidId: bid.id,
    periodId: bid.rosterPeriodId,
    draftVersion: bid.draftVersion,
    periodCode: bid.periodCode,
  };
};

export const normalizeCurrentDraftVersion = (draftVersion: number | null | undefined): number => {
  if (
    typeof draftVersion !== "number"
    || !Number.isSafeInteger(draftVersion)
    || draftVersion < 0
  ) {
    throw new LineholderBidServiceError(400, "Current draft version is required.");
  }

  return draftVersion;
};

export const parseCurrentDraftBidId = (reference: CurrentDraftReference): number | null => {
  if (typeof reference.bidId === "number" && Number.isSafeInteger(reference.bidId) && reference.bidId > 0) {
    return reference.bidId;
  }

  const draftKey = reference.draftKey?.trim();

  if (!draftKey) {
    return null;
  }

  if (!/^[1-9]\d*$/.test(draftKey)) {
    throw new LineholderBidServiceError(400, "Invalid current draft key.");
  }

  const bidId = Number.parseInt(draftKey, 10);

  if (!Number.isSafeInteger(bidId)) {
    throw new LineholderBidServiceError(400, "Invalid current draft key.");
  }

  return bidId;
};

export const loadExistingBid = async (
  db: Pick<Database, "select">,
  actor: LineholderDraftActor,
  period: LineholderPeriodContext,
): Promise<typeof pbsBid.$inferSelect | null> => {
  const rows = await db
    .select()
    .from(pbsBid)
    .where(and(
      eq(pbsBid.crewId, actor.crewId),
      eq(pbsBid.rosterPeriodId, period.rosterPeriodId),
      eq(pbsBid.bidContext, CURRENT_BID_CONTEXT),
    ))
    .limit(1);

  return rows[0] ?? null;
};

export const loadCurrentBidByReference = async (
  db: Pick<Database, "select">,
  actor: LineholderDraftActor,
  period: LineholderPeriodContext,
  reference: CurrentDraftReference = {},
): Promise<typeof pbsBid.$inferSelect | null> => {
  const bidId = parseCurrentDraftBidId(reference);

  if (bidId !== null) {
    const rows = await db
      .select()
      .from(pbsBid)
      .where(and(
        eq(pbsBid.id, bidId),
        eq(pbsBid.crewId, actor.crewId),
        eq(pbsBid.bidContext, CURRENT_BID_CONTEXT),
      ))
      .limit(1);

    if (!rows[0]) {
      throw new LineholderBidServiceError(404, "Current draft not found.");
    }

    if (rows[0].rosterPeriodId !== period.rosterPeriodId) {
      throw periodContextError(
        409,
        "PERIOD_CONTEXT_REQUIRED",
        "The current draft is not linked to the active roster period. Please refresh and try again.",
      );
    }

    return rows[0];
  }

  assertCurrentPeriodCanEdit(period, reference.periodCode?.trim() || period.periodCode);
  return loadExistingBid(db, actor, period);
};

type EnsureCurrentBidOptions = {
  remarks?: string;
  expectedDraftVersion?: number;
  bumpDraftVersion?: boolean;
};

export const ensureCurrentBid = async (
  tx: Transaction,
  actor: LineholderDraftActor,
  period: LineholderPeriodContext,
  periodCode: string,
  now: Date,
  options: EnsureCurrentBidOptions = {},
) => {
  const nextRemarks = typeof options.remarks === "string" ? options.remarks : undefined;
  const shouldBumpDraftVersion = options.bumpDraftVersion ?? true;
  const expectedDraftVersion = options.expectedDraftVersion;

  assertCurrentPeriodCanEdit(period, periodCode);

  const baseConditions = [
    eq(pbsBid.crewId, actor.crewId),
    eq(pbsBid.rosterPeriodId, period.rosterPeriodId),
    eq(pbsBid.bidContext, CURRENT_BID_CONTEXT),
  ];
  const updateConditions = expectedDraftVersion === undefined
    ? baseConditions
    : [...baseConditions, eq(pbsBid.draftVersion, expectedDraftVersion)];

  const updatedBids = await tx
    .update(pbsBid)
    .set({
      rosterPeriodId: period.rosterPeriodId,
      lastModifiedAt: now,
      ...(shouldBumpDraftVersion ? { draftVersion: sql`${pbsBid.draftVersion} + 1` } : {}),
      status: "DRAFT",
      ...(nextRemarks !== undefined ? { remarks: nextRemarks } : {}),
      updatedBy: actor.userCode,
      updatedAt: now,
    })
    .where(and(...updateConditions))
    .returning({
      id: pbsBid.id,
      rosterPeriodId: pbsBid.rosterPeriodId,
      draftVersion: pbsBid.draftVersion,
    });

  const existingBid = updatedBids[0];

  if (existingBid) {
    return {
      draftKey: String(existingBid.id),
      bidId: existingBid.id,
      periodId: existingBid.rosterPeriodId,
      draftVersion: existingBid.draftVersion,
      periodCode,
    };
  }

  if (expectedDraftVersion !== undefined) {
    const staleBids = await tx
      .select({ id: pbsBid.id })
      .from(pbsBid)
      .where(and(...baseConditions))
      .limit(1);

    if (staleBids[0]) {
      throw new LineholderBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
    }

    if (expectedDraftVersion !== 0) {
      throw new LineholderBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
    }
  }

  const insertedBids = await tx
    .insert(pbsBid)
    .values({
      crewId: actor.crewId,
      periodCode,
      rosterPeriodId: period.rosterPeriodId,
      bidContext: CURRENT_BID_CONTEXT,
      lastModifiedAt: now,
      draftVersion: shouldBumpDraftVersion ? 1 : 0,
      totalTiers: 0,
      status: "DRAFT",
      ...(nextRemarks !== undefined ? { remarks: nextRemarks } : {}),
      createdBy: actor.userCode,
      updatedBy: actor.userCode,
      updatedAt: now,
    })
    .returning({
      id: pbsBid.id,
      rosterPeriodId: pbsBid.rosterPeriodId,
      draftVersion: pbsBid.draftVersion,
    });

  const insertedBid = insertedBids[0];

  if (!insertedBid) {
    throw new LineholderBidServiceError(500, "Unable to create the current Lineholder draft.");
  }

  return {
    draftKey: String(insertedBid.id),
    bidId: insertedBid.id,
    periodId: insertedBid.rosterPeriodId,
    draftVersion: insertedBid.draftVersion,
    periodCode,
  };
};

export const ensureCurrentBidByReference = async (
  tx: Transaction,
  actor: LineholderDraftActor,
  period: LineholderPeriodContext,
  reference: CurrentDraftReference,
  now: Date,
  options: EnsureCurrentBidOptions = {},
): Promise<CurrentBidTarget> => {
  const bidId = parseCurrentDraftBidId(reference);
  const nextRemarks = typeof options.remarks === "string" ? options.remarks : undefined;
  const shouldBumpDraftVersion = options.bumpDraftVersion ?? true;
  const expectedDraftVersion = options.expectedDraftVersion;
  const targetPeriodCode = reference.periodCode?.trim() || period.periodCode;

  assertCurrentPeriodCanEdit(period, targetPeriodCode);

  if (bidId !== null) {
    const baseConditions = [
      eq(pbsBid.id, bidId),
      eq(pbsBid.crewId, actor.crewId),
      eq(pbsBid.bidContext, CURRENT_BID_CONTEXT),
      eq(pbsBid.rosterPeriodId, period.rosterPeriodId),
    ];
    const updateConditions = expectedDraftVersion === undefined
      ? baseConditions
      : [...baseConditions, eq(pbsBid.draftVersion, expectedDraftVersion)];

    const updatedBids = await tx
      .update(pbsBid)
      .set({
        lastModifiedAt: now,
        ...(shouldBumpDraftVersion ? { draftVersion: sql`${pbsBid.draftVersion} + 1` } : {}),
        status: "DRAFT",
        ...(nextRemarks !== undefined ? { remarks: nextRemarks } : {}),
        updatedBy: actor.userCode,
        updatedAt: now,
      })
      .where(and(...updateConditions))
      .returning({
        id: pbsBid.id,
        periodCode: pbsBid.periodCode,
        rosterPeriodId: pbsBid.rosterPeriodId,
        draftVersion: pbsBid.draftVersion,
      });

    const updatedBid = updatedBids[0];

    if (!updatedBid) {
      const staleBids = await tx
        .select({ id: pbsBid.id })
        .from(pbsBid)
        .where(and(...baseConditions))
        .limit(1);

      if (staleBids[0] && expectedDraftVersion !== undefined) {
        throw new LineholderBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
      }

      throw new LineholderBidServiceError(404, "Current draft not found.");
    }

    return {
      draftKey: String(updatedBid.id),
      bidId: updatedBid.id,
      periodId: updatedBid.rosterPeriodId,
      draftVersion: updatedBid.draftVersion,
      periodCode: updatedBid.periodCode,
    };
  }

  return ensureCurrentBid(tx, actor, period, targetPeriodCode, now, options);
};

type CurrentPeriodBidRow = {
  period_id: string | null;
  roster_period_key: string | null;
  period_code: string | null;
  filiale: string | null;
  status: string | null;
  bid_open_at: string | Date | null;
  bid_close_at: string | Date | null;
  base: string | null;
  zone_id: string | null;
  rp_start_local: string | null;
  rp_end_local: string | null;
  bid_id: string | null;
  bid_period_code: string | null;
  bid_roster_period_id: string | null;
  bid_draft_version: number | null;
  bid_remarks: string | null;
};

export const loadCurrentPeriodAndExistingBid = async (
  db: Pick<Database, "execute" | "select">,
  actor: LineholderDraftActor,
  businessNow = new Date(),
): Promise<CurrentPeriodBidContext> => {
  const result = await db.execute<CurrentPeriodBidRow>(sql`
    ${buildCurrentPeriodCte(actor, businessNow)}
    select
      current_period.period_id::text as period_id,
      current_period.roster_period_key::varchar as roster_period_key,
      current_period.period_code::varchar as period_code,
      current_period.filiale::varchar as filiale,
      current_period.status::varchar as status,
      current_period.bid_open_at as bid_open_at,
      current_period.bid_close_at as bid_close_at,
      current_period.base as base,
      current_period.zone_id as zone_id,
      current_period.rp_start_local as rp_start_local,
      current_period.rp_end_local as rp_end_local,
      current_bid.bid_id::text as bid_id,
      current_bid.bid_period_code::varchar as bid_period_code,
      current_bid.bid_roster_period_id::text as bid_roster_period_id,
      current_bid.bid_draft_version::integer as bid_draft_version,
      current_bid.bid_remarks::varchar as bid_remarks
    from current_period
    left join lateral (
      select
        ${pbsBid.id}::text as bid_id,
        ${pbsBid.periodCode}::varchar as bid_period_code,
        ${pbsBid.rosterPeriodId}::text as bid_roster_period_id,
        ${pbsBid.draftVersion}::integer as bid_draft_version,
        ${pbsBid.remarks}::varchar as bid_remarks
      from ${pbsBid}
      where ${pbsBid.crewId} = ${actor.crewId}
        and ${pbsBid.bidContext} = ${CURRENT_BID_CONTEXT}
        and ${pbsBid.rosterPeriodId} = current_period.period_id::bigint
      order by
        ${pbsBid.id} asc
      limit 1
    ) current_bid on true
  `);
  const row = result.rows[0];

  const period = mapCurrentPeriodRow(row, businessNow);
  const bidId = parseNullableSafeInteger(row.bid_id);

  if (bidId === null || row.bid_draft_version === null) {
    return {
      period,
      existingBid: null,
    };
  }

  const bidRosterPeriodId = parseNullableSafeInteger(row.bid_roster_period_id);

  if (bidRosterPeriodId !== period.rosterPeriodId) {
    throw periodContextError(
      409,
      "PERIOD_CONTEXT_REQUIRED",
      "The current draft is not linked to the active roster period. Please refresh and try again.",
    );
  }

  return {
    period,
    existingBid: {
      id: bidId,
      periodCode: row.bid_period_code ?? period.periodCode,
      rosterPeriodId: bidRosterPeriodId,
      draftVersion: row.bid_draft_version,
      remarks: row.bid_remarks,
    },
  };
};
