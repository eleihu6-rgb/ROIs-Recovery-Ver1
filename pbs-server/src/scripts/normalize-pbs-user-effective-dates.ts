import "dotenv/config";
import pg from "pg";
import { z } from "zod";
import {
  expectedPbsUserNormalizationSchema,
  parsePbsUserNormalizationCommand,
} from "./normalize-pbs-user-effective-dates-core.js";
import {
  PBS_USER_EFFECTIVE_DATE_CUTOFF_SQL,
  PBS_USER_EFFECTIVE_DATE_NORMALIZATION_UPDATED_BY,
  PBS_USER_NORMALIZED_EFFECTIVE_DATE_SQL,
  acquirePbsUserEffectiveDateTransactionLock,
  quotePbsUserSqlIdentifier,
} from "./pbs-user-effective-date-normalization.js";

const { Client } = pg;

const normalizationEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PBS_SCHEMA: z.string().min(1),
  PBS_USER_EFFECTIVE_DATE_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
});

type NormalizationSummary = {
  ancientCount: number;
  enabledAncientCount: number;
};

const readSummary = async (
  client: pg.Client,
  quotedSchema: string,
): Promise<NormalizationSummary> => {
  const result = await client.query<{
    ancient_count: number;
    enabled_ancient_count: number;
  }>(`
    select
      count(*) filter (
        where eff_dt < ${PBS_USER_EFFECTIVE_DATE_CUTOFF_SQL}
      )::int as ancient_count,
      count(*) filter (
        where status = 0
          and password_access in ('1', 'Y')
          and portal_access in ('1', 'Y')
          and eff_dt < ${PBS_USER_EFFECTIVE_DATE_CUTOFF_SQL}
      )::int as enabled_ancient_count
    from ${quotedSchema}.pbs_user
  `);

  return {
    ancientCount: result.rows[0]?.ancient_count ?? 0,
    enabledAncientCount: result.rows[0]?.enabled_ancient_count ?? 0,
  };
};

const verifyEnvironment = async (
  client: pg.Client,
  schema: string,
  quotedSchema: string,
): Promise<void> => {
  const identityResult = await client.query<{
    database_name: string;
    database_user: string;
    has_schema_usage: boolean;
    has_table_select: boolean;
    has_table_update: boolean;
  }>(`
    select
      current_database() as database_name,
      current_user as database_user,
      has_schema_privilege(current_user, $1, 'USAGE') as has_schema_usage,
      has_table_privilege(current_user, $2, 'SELECT') as has_table_select,
      has_table_privilege(current_user, $2, 'UPDATE') as has_table_update
  `, [schema, `${schema}.pbs_user`]);
  const identity = identityResult.rows[0];

  if (!identity || identity.database_name !== "rois") {
    throw new Error("PBS user normalization must run against the rois database.");
  }
  if (identity.database_user !== schema) {
    throw new Error(`Database user ${identity.database_user} does not match schema ${schema}.`);
  }
  if (!identity.has_schema_usage || !identity.has_table_select || !identity.has_table_update) {
    throw new Error(`Database user lacks required privileges for ${schema}.pbs_user.`);
  }

  const typeResult = await client.query<{ data_type: string }>(`
    select format_type(attribute.atttypid, attribute.atttypmod) as data_type
    from pg_attribute attribute
    inner join pg_class relation on relation.oid = attribute.attrelid
    inner join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = $1
      and relation.relname = 'pbs_user'
      and attribute.attname = 'eff_dt'
      and not attribute.attisdropped
  `, [schema]);

  if (typeResult.rows[0]?.data_type !== "timestamp with time zone") {
    throw new Error(`${schema}.pbs_user.eff_dt must be timestamp with time zone.`);
  }

  const triggerResult = await client.query<{ trigger_name: string }>(`
    select trigger.tgname as trigger_name
    from pg_trigger trigger
    inner join pg_class relation on relation.oid = trigger.tgrelid
    inner join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = $1
      and relation.relname = 'pbs_user'
      and not trigger.tgisinternal
      and (trigger.tgtype & 16) = 16
  `, [schema]);

  if (triggerResult.rows.length > 0) {
    throw new Error(`${quotedSchema}.pbs_user has unsupported UPDATE triggers.`);
  }
};

const logSummary = (
  environment: string,
  schema: string,
  summary: NormalizationSummary,
): void => {
  console.log("PBS user effective-date normalization:");
  console.log(`  environment: ${environment}`);
  console.log(`  schema: ${schema}`);
  console.log(`  BC rows: ${summary.ancientCount}`);
  console.log(`  enabled BC rows: ${summary.enabledAncientCount}`);
};

const run = async (): Promise<void> => {
  const command = parsePbsUserNormalizationCommand(process.argv.slice(2));
  const parsedEnv = normalizationEnvSchema.parse(process.env);
  const expectedSchema = expectedPbsUserNormalizationSchema(command.environment);

  if (parsedEnv.PBS_SCHEMA !== expectedSchema) {
    throw new Error(
      `PBS_SCHEMA ${parsedEnv.PBS_SCHEMA} does not match ${command.environment} (${expectedSchema}).`,
    );
  }

  const quotedSchema = quotePbsUserSqlIdentifier(expectedSchema);
  const client = new Client({ connectionString: parsedEnv.DATABASE_URL });
  let transactionStarted = false;

  try {
    await client.connect();
    await verifyEnvironment(client, expectedSchema, quotedSchema);
    const initialSummary = await readSummary(client, quotedSchema);
    logSummary(command.environment, expectedSchema, initialSummary);

    if (!command.apply) {
      console.log("  mode: read-only");
      return;
    }

    await client.query("begin");
    transactionStarted = true;
    await acquirePbsUserEffectiveDateTransactionLock(
      (text, values) => client.query(text, values),
      expectedSchema,
      parsedEnv.PBS_USER_EFFECTIVE_DATE_LOCK_TIMEOUT_MS,
    );

    const lockedSummary = await readSummary(client, quotedSchema);
    if (lockedSummary.ancientCount !== command.expectedCount) {
      throw new Error(
        `Expected ${command.expectedCount} BC rows, found ${lockedSummary.ancientCount}.`,
      );
    }

    await client.query(`
      create temporary table pbs_user_effective_date_before
      on commit drop
      as
      select *
      from ${quotedSchema}.pbs_user
      where eff_dt < ${PBS_USER_EFFECTIVE_DATE_CUTOFF_SQL}
    `);

    const updateResult = await client.query(`
      update ${quotedSchema}.pbs_user
      set
        eff_dt = ${PBS_USER_NORMALIZED_EFFECTIVE_DATE_SQL},
        updated_at = now(),
        updated_by = $1
      where eff_dt < ${PBS_USER_EFFECTIVE_DATE_CUTOFF_SQL}
    `, [PBS_USER_EFFECTIVE_DATE_NORMALIZATION_UPDATED_BY]);

    if ((updateResult.rowCount ?? 0) !== lockedSummary.ancientCount) {
      throw new Error("Updated row count does not match the locked BC row count.");
    }

    const protectedChangeResult = await client.query<{ changed_count: number }>(`
      select count(*)::int as changed_count
      from ${quotedSchema}.pbs_user current_user_row
      inner join pbs_user_effective_date_before previous_user_row
        on previous_user_row.id = current_user_row.id
      where (
        to_jsonb(current_user_row) - array['eff_dt', 'updated_at', 'updated_by']::text[]
      ) is distinct from (
        to_jsonb(previous_user_row) - array['eff_dt', 'updated_at', 'updated_by']::text[]
      )
    `);

    if ((protectedChangeResult.rows[0]?.changed_count ?? 0) !== 0) {
      throw new Error("Protected PBS user fields changed during normalization.");
    }

    const remainingSummary = await readSummary(client, quotedSchema);
    if (remainingSummary.ancientCount !== 0) {
      throw new Error(`BC effective dates remain after update: ${remainingSummary.ancientCount}.`);
    }

    await client.query("commit");
    transactionStarted = false;

    const committedSummary = await readSummary(client, quotedSchema);
    if (committedSummary.ancientCount !== 0) {
      throw new Error(`BC effective dates remain after commit: ${committedSummary.ancientCount}.`);
    }

    console.log(`  updated rows: ${updateResult.rowCount ?? 0}`);
    console.log("  result: PASS");
  } catch (error) {
    if (transactionStarted) {
      await client.query("rollback");
    }
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
};

void run().catch((error) => {
  console.error("PBS user effective-date normalization failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
