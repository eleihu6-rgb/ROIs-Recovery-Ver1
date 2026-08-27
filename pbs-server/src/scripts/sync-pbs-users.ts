import "dotenv/config";
import pg from "pg";
import { parseSyncEnv } from "../config/sync-env.js";
import {
  DEDICATED_PBS_ADMIN_USER_CODE,
  buildSelectedColumns,
  isDedicatedPbsAdminUserCode,
  mapSourceUserToPbsUser,
  type SourceUserRow,
} from "./sync-pbs-users-core.js";
import {
  acquirePbsUserEffectiveDateTransactionLock,
  buildPbsUserSourceSelectExpression,
  type PbsUserEffectiveDateSourceType,
} from "./pbs-user-effective-date-normalization.js";

const { Client } = pg;

const isDryRun = process.argv.includes("--dry-run");
const syncEnv = parseSyncEnv(process.env);
const {
  sourceDatabaseUrl,
  targetDatabaseUrl,
  sourceSchema,
  targetSchema,
  crewIdField,
  updatedBy,
  effectiveDateLockTimeoutMs,
} = syncEnv;

const selectedColumns = buildSelectedColumns(crewIdField);

const quoteIdentifier = (value: string) => `"${value}"`;

const logSummary = (summary: Record<string, number>) => {
  console.log("PBS user sync summary:");
  for (const [key, value] of Object.entries(summary)) {
    console.log(`  ${key}: ${value}`);
  }
};

const verifyEffectiveDateColumnType = async (
  client: pg.Client,
  schema: string,
  table: string,
): Promise<PbsUserEffectiveDateSourceType> => {
  const result = await client.query<{ data_type: string }>(`
    select format_type(attribute.atttypid, attribute.atttypmod) as data_type
    from pg_attribute attribute
    inner join pg_class relation on relation.oid = attribute.attrelid
    inner join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = $1
      and relation.relname = $2
      and attribute.attname = 'eff_dt'
      and not attribute.attisdropped
  `, [schema, table]);

  const dataType = result.rows[0]?.data_type;
  if (dataType !== "timestamp with time zone" && dataType !== "timestamp without time zone") {
    throw new Error(`${schema}.${table}.eff_dt must be a PostgreSQL timestamp type.`);
  }

  return dataType;
};

const syncUsers = async () => {
  const sourceClient = new Client({ connectionString: sourceDatabaseUrl });
  const targetClient = new Client({ connectionString: targetDatabaseUrl });
  let targetTransactionStarted = false;

  const summary = {
    inserted: 0,
    updated: 0,
    deactivated: 0,
    skippedDedicatedAdmin: 0,
    skippedMissingCrewId: 0,
  };

  try {
    await sourceClient.connect();
    await targetClient.connect();
    const sourceEffectiveDateType = await verifyEffectiveDateColumnType(
      sourceClient,
      sourceSchema,
      "users",
    );
    const targetEffectiveDateType = await verifyEffectiveDateColumnType(
      targetClient,
      targetSchema,
      "pbs_user",
    );
    if (targetEffectiveDateType !== "timestamp with time zone") {
      throw new Error(`${targetSchema}.pbs_user.eff_dt must be timestamp with time zone.`);
    }

    if (!isDryRun) {
      await targetClient.query("begin");
      targetTransactionStarted = true;
      await acquirePbsUserEffectiveDateTransactionLock(
        (text, values) => targetClient.query(text, values),
        targetSchema,
        effectiveDateLockTimeoutMs,
      );
    }

    const sourceUsersResult = await sourceClient.query<SourceUserRow>(`
      select ${selectedColumns.map((column) =>
        buildPbsUserSourceSelectExpression(column, sourceEffectiveDateType)
      ).join(", ")}
      from ${quoteIdentifier(sourceSchema)}.${quoteIdentifier("users")}
      order by ${quoteIdentifier("user_code")}
    `);

    if (sourceUsersResult.rows.length === 0) {
      throw new Error("Source users query returned zero rows. Aborting to avoid deactivating every PBS account.");
    }

    const targetUsersResult = await targetClient.query<{ user_code: string }>(`
      select user_code
      from ${quoteIdentifier(targetSchema)}.${quoteIdentifier("pbs_user")}
    `);

    const existingUserCodes = new Set(targetUsersResult.rows.map((row) => row.user_code));
    const sourceUserCodes: string[] = [];

    for (const row of sourceUsersResult.rows) {
      if (isDedicatedPbsAdminUserCode(row.user_code)) {
        summary.skippedDedicatedAdmin += 1;
        continue;
      }

      const mappedUser = mapSourceUserToPbsUser(row, crewIdField);

      if (!mappedUser) {
        summary.skippedMissingCrewId += 1;
        continue;
      }

      const {
        crewId,
        userCode,
        userName,
        passwordHash,
        branchCode,
        pyAbbr,
        gender,
        tel,
        effDt,
        expDt,
        adActive,
        email,
        status,
        isAdmin,
        passwordAccess,
        portalAccess,
        appAccess,
        isFirstLogin,
        interfaceUserId,
      } = mappedUser;

      sourceUserCodes.push(userCode);

      if (existingUserCodes.has(userCode)) {
        summary.updated += 1;
      } else {
        summary.inserted += 1;
      }

      if (isDryRun) {
        continue;
      }

      await targetClient.query(
        `
          insert into ${quoteIdentifier(targetSchema)}.${quoteIdentifier("pbs_user")} (
            created_by,
            updated_by,
            crew_id,
            user_code,
            user_name,
            password_hash,
            branch_code,
            py_abbr,
            gender,
            tel,
            eff_dt,
            exp_dt,
            ad_active,
            status,
            is_admin,
            interface_user_id,
            password_access,
            portal_access,
            app_access,
            is_first_login,
            email,
            last_login_at,
            last_login_ip,
            failed_login_count,
            locked_until,
            password_changed_at,
            token_version
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, null, null, 0, null, null, 0)
          on conflict (user_code) do update
          set
            updated_by = excluded.updated_by,
            updated_at = now(),
            crew_id = excluded.crew_id,
            user_name = excluded.user_name,
            password_hash = excluded.password_hash,
            branch_code = excluded.branch_code,
            py_abbr = excluded.py_abbr,
            gender = excluded.gender,
            tel = excluded.tel,
            eff_dt = excluded.eff_dt,
            exp_dt = excluded.exp_dt,
            ad_active = excluded.ad_active,
            status = excluded.status,
            is_admin = excluded.is_admin,
            interface_user_id = excluded.interface_user_id,
            password_access = excluded.password_access,
            portal_access = excluded.portal_access,
            app_access = excluded.app_access,
            is_first_login = excluded.is_first_login,
            email = excluded.email,
            user_code = excluded.user_code
        `,
        [
          updatedBy,
          updatedBy,
          crewId,
          userCode,
          userName,
          passwordHash,
          branchCode,
          pyAbbr,
          gender,
          tel,
          effDt,
          expDt,
          adActive,
          status,
          isAdmin,
          interfaceUserId,
          passwordAccess,
          portalAccess,
          appAccess,
          isFirstLogin,
          email,
        ],
      );
    }

    const userCodesToKeep = Array.from(new Set(sourceUserCodes));

    if (userCodesToKeep.length === 0) {
      throw new Error("No users produced a valid crew_id mapping. Aborting to avoid deactivating every PBS account.");
    }

    if (!isDryRun) {
      const deactivateResult = await targetClient.query<{ user_code: string }>(
        `
          update ${quoteIdentifier(targetSchema)}.${quoteIdentifier("pbs_user")}
          set
            status = 1,
            password_access = 'N',
            portal_access = 'N',
            app_access = 'N',
            updated_by = $2,
            updated_at = now()
          where
            user_code <> all($1::varchar[])
            and lower(user_code) <> $3
            and (
              status = 0
              or password_access = 'Y'
              or portal_access = 'Y'
              or app_access = 'Y'
            )
          returning user_code
        `,
        [userCodesToKeep, updatedBy, DEDICATED_PBS_ADMIN_USER_CODE],
      );

      summary.deactivated = deactivateResult.rowCount ?? 0;

      // Enrich pbs_user with crew-derived division (base/rank are queried live from
      // crew_base / crew_rank on demand, no longer denormalized).
      await targetClient.query(
        `
          update ${quoteIdentifier(targetSchema)}.${quoteIdentifier("pbs_user")} pu
          set
            division = c.division,
            updated_by = $2,
            updated_at = now()
          from ${quoteIdentifier(sourceSchema)}.${quoteIdentifier("crew")} c
          where pu.crew_id = c.crew_id
            and pu.division is distinct from c.division
        `,
        [updatedBy],
      );
    }

    if (targetTransactionStarted) {
      await targetClient.query("commit");
      targetTransactionStarted = false;
    }

    logSummary(summary);

    if (isDryRun) {
      console.log("Dry run only. No database changes were written.");
    }
  } catch (error) {
    if (targetTransactionStarted) {
      await targetClient.query("rollback");
      targetTransactionStarted = false;
    }
    throw error;
  } finally {
    await Promise.allSettled([sourceClient.end(), targetClient.end()]);
  }
};

void syncUsers().catch((error) => {
  console.error("PBS user sync failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
