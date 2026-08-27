export const DEFAULT_PAIRING_ZONE_ID = "UTC";

export const buildUtcTimestampToLocalDateExpression = ({
  timestampExpression,
  zoneExpression,
}: {
  timestampExpression: string;
  zoneExpression: string;
}) => `((${timestampExpression} at time zone '${DEFAULT_PAIRING_ZONE_ID}') at time zone ${zoneExpression})::date`;

export const buildUtcTimestampToLocalTimeExpression = ({
  timestampExpression,
  zoneExpression,
}: {
  timestampExpression: string;
  zoneExpression: string;
}) => `((${timestampExpression} at time zone '${DEFAULT_PAIRING_ZONE_ID}') at time zone ${zoneExpression})::time`;

export const buildPairingStartUtcExpression = ({
  pairingAlias = "p",
  schema,
  segmentAlias = "period_segment",
}: {
  pairingAlias?: string;
  schema: string;
  segmentAlias?: string;
}) => `coalesce(
  (
    select min(coalesce(${segmentAlias}.duty_sch_str_dt_utc, ${segmentAlias}.brief_start_utc, ${segmentAlias}.sch_str_dt_utc))
    from ${schema}.pairing_segment ${segmentAlias}
    where ${segmentAlias}.pairing_id = ${pairingAlias}.id
      and ${segmentAlias}.is_deleted = 0
  ),
  ${pairingAlias}.sch_str_dt_utc
)`;

export const buildPairingLocalOriginDateExpression = ({
  pairingAlias = "p",
  schema,
  segmentAlias,
  startExpression,
  zoneExpression,
}: {
  pairingAlias?: string;
  schema: string;
  segmentAlias?: string;
  startExpression?: string;
  zoneExpression: string;
}) => buildUtcTimestampToLocalDateExpression({
  timestampExpression: startExpression ?? buildPairingStartUtcExpression({ pairingAlias, schema, segmentAlias }),
  zoneExpression,
});

export const buildActorZoneCte = ({
  actorBasePlaceholder,
  defaultZonePlaceholder,
  schema,
}: {
  actorBasePlaceholder: string;
  defaultZonePlaceholder: string;
  schema: string;
}) => `
  actor_zone as (
    select coalesce(tz.name, ${defaultZonePlaceholder}::text) as zone_id
    from (select ${actorBasePlaceholder}::varchar as base) actor_base
    left join ${schema}.airport airport
      on airport.airport = actor_base.base
    left join pg_timezone_names tz
      on tz.name = nullif(btrim(airport.zone_id), '')
  )
`;
