const identifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export const PBS_USER_EFFECTIVE_DATE_CUTOFF_SQL =
  "timestamptz '0001-01-01 00:00:00+00 AD'";

export const PBS_USER_NORMALIZED_EFFECTIVE_DATE_SQL =
  "timestamptz '1900-01-01 00:00:00+00'";

export const PBS_USER_NORMALIZED_EFFECTIVE_DATE_ISO =
  "1900-01-01T00:00:00.000Z";

export const PBS_USER_EFFECTIVE_DATE_NORMALIZATION_UPDATED_BY =
  "pbs-eff-date-normalization";

export type PbsUserEffectiveDateSourceType =
  | "timestamp with time zone"
  | "timestamp without time zone";

export const quotePbsUserSqlIdentifier = (value: string): string => {
  if (!identifierPattern.test(value)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }

  return `"${value}"`;
};

export const buildPbsUserSourceSelectExpression = (
  column: string,
  effectiveDateType: PbsUserEffectiveDateSourceType,
): string => {
  const quotedColumn = quotePbsUserSqlIdentifier(column);

  if (column !== "eff_dt") {
    return quotedColumn;
  }

  const cutoff = effectiveDateType === "timestamp with time zone"
    ? PBS_USER_EFFECTIVE_DATE_CUTOFF_SQL
    : "timestamp '0001-01-01 00:00:00 AD'";
  const normalizedValue = effectiveDateType === "timestamp with time zone"
    ? PBS_USER_NORMALIZED_EFFECTIVE_DATE_SQL
    : "timestamp '1900-01-01 00:00:00'";

  return `(
    case
      when ${quotedColumn} < ${cutoff}
        then ${normalizedValue}
      else ${quotedColumn}
    end
  )::text as ${quotedColumn}`;
};

export const buildPbsUserEffectiveDateLockName = (schema: string): string =>
  `rois:pbs-user-effective-date:${quotePbsUserSqlIdentifier(schema).slice(1, -1)}`;

type ExecutePbsUserLockSql = (
  text: string,
  values: unknown[],
) => Promise<unknown>;

export const acquirePbsUserEffectiveDateTransactionLock = async (
  execute: ExecutePbsUserLockSql,
  schema: string,
  lockTimeoutMs: number,
): Promise<void> => {
  if (!Number.isInteger(lockTimeoutMs) || lockTimeoutMs <= 0) {
    throw new Error("PBS user effective-date lock timeout must be a positive integer.");
  }

  await execute(
    "select set_config('TimeZone', 'UTC', true)",
    [],
  );
  await execute(
    "select set_config('lock_timeout', $1, true)",
    [`${lockTimeoutMs}ms`],
  );
  await execute(
    "select pg_advisory_xact_lock(hashtextextended($1, 0))",
    [buildPbsUserEffectiveDateLockName(schema)],
  );
};
