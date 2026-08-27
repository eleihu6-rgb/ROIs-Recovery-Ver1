import type { Pool, QueryResultRow } from "pg";
import { pbsReserveLegacyPropertyCodes } from "../../../../packages/contracts/pbs-reserve-bids.js";
import type { LineholderDraftActor } from "../lineholder/shared.js";

type PgPool = Pick<Pool, "query">;

export type ReserveCallTypeDictionaryRow = QueryResultRow & {
  code: string | null;
  codeValue: string | null;
};

type CrewReserveScopeRow = QueryResultRow & {
  division: string | null;
  rank: string | null;
};

type ReserveCallTypeBid = {
  type: "reserve-call-type-date-scope";
  callType: string;
  options: string[];
};

type CatalogPropertyWithBid = {
  propertyCode: number;
  defaultBid: unknown;
};

type DraftPropertyWithBid = {
  propertyCode: number;
  bid: unknown;
};

export type ReserveCallTypeOptionContext = {
  division: string | null;
  rank: string | null;
  options: string[];
};

export type ReserveCallTypeOptionsResolver = (
  actor: LineholderDraftActor,
) => Promise<ReserveCallTypeOptionContext>;

type ResolveReserveCallTypeOptionsArgs = {
  actor: LineholderDraftActor;
  liveSchema: string;
  pbsSchema: string;
  pgPool: PgPool;
};

const validateSchemaName = (schemaName: string, label: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
    throw new Error(`Invalid ${label}: ${schemaName}`);
  }

  return schemaName;
};

const normalizeCode = (value: string | null | undefined) => {
  const normalized = value?.trim().toUpperCase() ?? "";

  return normalized.length > 0 ? normalized : null;
};

const extractCallTypeFromDictionaryRow = (row: ReserveCallTypeDictionaryRow) => {
  const firstConfiguredValue = normalizeCode(row.codeValue?.split("|")[0]);

  if (firstConfiguredValue) {
    return firstConfiguredValue;
  }

  const normalizedCode = normalizeCode(row.code);

  return normalizedCode && !/^[PC]_/.test(normalizedCode) ? normalizedCode : null;
};

const isReserveCallTypeBid = (bid: unknown): bid is ReserveCallTypeBid => (
  typeof bid === "object"
  && bid !== null
  && "type" in bid
  && bid.type === "reserve-call-type-date-scope"
  && "callType" in bid
  && typeof bid.callType === "string"
  && "options" in bid
  && Array.isArray(bid.options)
);

export const resolveReserveCallTypeGroupPrefix = (division: string | null | undefined) => {
  const normalizedDivision = normalizeCode(division);

  if (normalizedDivision === "P" || normalizedDivision === "C") {
    return `${normalizedDivision}_`;
  }

  return null;
};

export const filterReserveCallTypeOptionsForCrew = (
  rows: readonly ReserveCallTypeDictionaryRow[],
  division: string | null | undefined,
) => {
  const groupPrefix = resolveReserveCallTypeGroupPrefix(division);

  if (!groupPrefix) {
    return [];
  }

  const uniqueOptions = new Set<string>();

  for (const row of rows) {
    const dictionaryCode = normalizeCode(row.code);

    if (!dictionaryCode?.startsWith(groupPrefix)) {
      continue;
    }

    const callType = extractCallTypeFromDictionaryRow(row);

    if (callType) {
      uniqueOptions.add(callType);
    }
  }

  return Array.from(uniqueOptions);
};

export const applyReserveCallTypeOptionsToCatalogContext = <
  TProperty extends CatalogPropertyWithBid,
  TContext extends {
    catalog: TProperty[];
    catalogByCode: Map<number, TProperty>;
  },
>(
  context: TContext,
  options: readonly string[],
): TContext => {
  const updateProperty = (property: TProperty): TProperty => {
    if (
      property.propertyCode !== pbsReserveLegacyPropertyCodes.shortCallType
      || !isReserveCallTypeBid(property.defaultBid)
    ) {
      return property;
    }

    const allowedOptions = [...options];
    const defaultCallType = allowedOptions.includes(property.defaultBid.callType)
      ? property.defaultBid.callType
      : allowedOptions[0] ?? "";

    return {
      ...property,
      defaultBid: {
        ...property.defaultBid,
        callType: defaultCallType,
        options: allowedOptions,
      },
    };
  };

  const catalog = context.catalog.map(updateProperty);
  const catalogByCode = new Map<number, TProperty>(
    Array.from(context.catalogByCode.entries()).map(([propertyCode, property]) => [
      propertyCode,
      updateProperty(property),
    ]),
  );

  for (const property of catalog) {
    catalogByCode.set(property.propertyCode, property);
  }

  return {
    ...context,
    catalog,
    catalogByCode,
  };
};

export const applyReserveCallTypeOptionsToDraftProperties = <
  TProperty extends DraftPropertyWithBid,
>(
  properties: readonly TProperty[],
  options: readonly string[],
): TProperty[] => properties.map((property) => {
  if (
    property.propertyCode !== pbsReserveLegacyPropertyCodes.shortCallType
    || !isReserveCallTypeBid(property.bid)
  ) {
    return property;
  }

  return {
    ...property,
    bid: {
      ...property.bid,
      options: [...options],
    },
  };
});

export const resolveReserveCallTypeOptions = async ({
  actor,
  liveSchema,
  pbsSchema,
  pgPool,
}: ResolveReserveCallTypeOptionsArgs): Promise<ReserveCallTypeOptionContext> => {
  const schema = validateSchemaName(liveSchema, "live schema name");
  const pbsSchemaName = validateSchemaName(pbsSchema, "PBS schema name");
  const [scopeResult, dictionaryResult] = await Promise.all([
    pgPool.query<CrewReserveScopeRow>(`
      with actor as (
        select $1::varchar as crew_id, $2::varchar as user_code
      )
      select
        nullif(upper(btrim(coalesce(
          crew.division,
          crew_rank_row.division,
          rank_definition.division,
          pbs_user.division
        ))), '')::varchar as "division",
        nullif(upper(btrim(crew_rank_row.rank)), '')::varchar as "rank"
      from actor
      left join ${schema}.crew crew
        on crew.crew_id = actor.crew_id
      left join ${pbsSchemaName}.pbs_user pbs_user
        on pbs_user.crew_id = actor.crew_id
          and pbs_user.user_code = actor.user_code
      left join lateral (
        select crew_rank.rank, crew_rank.division
        from ${schema}.crew_rank crew_rank
        where crew_rank.crew_id = actor.crew_id
          and crew_rank.eff_dt <= now()
          and (crew_rank.exp_dt is null or crew_rank.exp_dt > now())
        order by crew_rank.eff_dt desc
        limit 1
      ) crew_rank_row on true
      left join ${schema}.rank rank_definition
        on upper(rank_definition.rank) = upper(crew_rank_row.rank)
      limit 1
    `, [actor.crewId, actor.userCode]),
    pgPool.query<ReserveCallTypeDictionaryRow>(`
      select
        nullif(upper(btrim(code)), '')::varchar as "code",
        nullif(btrim(code_value), '')::varchar as "codeValue"
      from ${schema}.dictionary
      where parent_code = 'RES_CALL_TYPE'
      order by idx asc nulls last, code asc
    `),
  ]);
  const scope = scopeResult.rows[0] ?? { division: null, rank: null };

  return {
    division: scope.division,
    rank: scope.rank,
    options: filterReserveCallTypeOptionsForCrew(dictionaryResult.rows, scope.division),
  };
};
