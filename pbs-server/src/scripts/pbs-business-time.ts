import "dotenv/config";
import pg from "pg";
import {
  PBS_BUSINESS_TIME_ANCHOR_KEY,
  PBS_BUSINESS_TIME_ANCHOR_REAL_KEY,
  PBS_BUSINESS_TIME_KEYS,
  PBS_BUSINESS_TIME_MODE_KEY,
  buildPbsBusinessTimeStatus,
  buildPbsBusinessTimeUpdates,
  parsePbsBusinessTimeArgs,
  type PbsBusinessTimeConfig,
} from "./pbs-business-time-core.js";

const { Client } = pg;

const UPDATED_BY = "pbs-business-time-cli";

const asSafeIdentifier = (value: string): string => {
  if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
    throw new Error(`Invalid database schema identifier: ${value}`);
  }

  return value.toLowerCase();
};

const liveSchema = () =>
  asSafeIdentifier(process.env.LIVE_SCHEMA || "f8");

const requireDatabaseUrl = () => {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  return databaseUrl;
};

const ensureBusinessTimeConfig = async (client: pg.Client, schema: string) => {
  await client.query(`
    create table if not exists ${schema}.dictionary (
      id bigint generated always as identity primary key,
      created_by varchar(30) not null default 'system',
      created_at timestamptz not null default now(),
      updated_by varchar(30) not null default 'system',
      updated_at timestamptz not null default now(),
      parent_code varchar(40),
      code varchar(100),
      name varchar(500),
      idx smallint,
      code_value varchar(50)
    )
  `);
  await client.query(`create index if not exists idx_dictionary_parent on ${schema}.dictionary (parent_code)`);
  await client.query(`create index if not exists idx_dictionary_code on ${schema}.dictionary (code)`);
  await client.query(`
    insert into ${schema}.dictionary (parent_code, code, name, idx)
    select null, 'SYS_PARAM', 'System Parameters / 系统参数', 1
    where not exists (
      select 1
      from ${schema}.dictionary
      where parent_code is null
        and code = 'SYS_PARAM'
    )
  `);
  await client.query(`
    update ${schema}.dictionary dictionary
    set name = seed.name,
        idx = seed.idx,
        code_value = case
          when dictionary.code = $2 and coalesce(dictionary.code_value, '') = '' then seed.code_value
          else dictionary.code_value
        end,
        updated_by = $5,
        updated_at = now()
    from (values
      ($1::varchar, $2::varchar, 'PBS business time mode / PBS业务时间模式'::varchar, 101::smallint, 'ROLLING'::varchar),
      ($1::varchar, $3::varchar, 'PBS business time anchor / PBS业务时间锚点'::varchar, 102::smallint, ''::varchar),
      ($1::varchar, $4::varchar, 'PBS real time anchor for business time / PBS业务时间对应真实锚点'::varchar, 103::smallint, ''::varchar)
    ) seed(parent_code, code, name, idx, code_value)
    where dictionary.parent_code = seed.parent_code
      and dictionary.code = seed.code
  `, [
    "SYS_PARAM",
    PBS_BUSINESS_TIME_MODE_KEY,
    PBS_BUSINESS_TIME_ANCHOR_KEY,
    PBS_BUSINESS_TIME_ANCHOR_REAL_KEY,
    UPDATED_BY,
  ]);
  await client.query(`
    insert into ${schema}.dictionary (parent_code, code, name, idx, code_value, created_by, updated_by)
    select seed.parent_code, seed.code, seed.name, seed.idx, seed.code_value, $5, $5
    from (values
      ($1::varchar, $2::varchar, 'PBS business time mode / PBS业务时间模式'::varchar, 101::smallint, 'ROLLING'::varchar),
      ($1::varchar, $3::varchar, 'PBS business time anchor / PBS业务时间锚点'::varchar, 102::smallint, ''::varchar),
      ($1::varchar, $4::varchar, 'PBS real time anchor for business time / PBS业务时间对应真实锚点'::varchar, 103::smallint, ''::varchar)
    ) seed(parent_code, code, name, idx, code_value)
    where not exists (
      select 1
      from ${schema}.dictionary dictionary
      where dictionary.parent_code = seed.parent_code
        and dictionary.code = seed.code
    )
  `, [
    "SYS_PARAM",
    PBS_BUSINESS_TIME_MODE_KEY,
    PBS_BUSINESS_TIME_ANCHOR_KEY,
    PBS_BUSINESS_TIME_ANCHOR_REAL_KEY,
    UPDATED_BY,
  ]);
};

const dictionaryExists = async (client: pg.Client, schema: string) => {
  const result = await client.query<{ table_name: string | null }>(
    "select to_regclass($1)::text as table_name",
    [`${schema}.dictionary`],
  );

  return Boolean(result.rows[0]?.table_name);
};

const loadBusinessTimeConfig = async (client: pg.Client, schema: string): Promise<PbsBusinessTimeConfig> => {
  if (!(await dictionaryExists(client, schema))) {
    return {
      mode: "ROLLING",
      anchor: "",
      anchorReal: "",
    };
  }

  const result = await client.query<{ code: string; code_value: string | null }>(`
    select code, code_value
    from ${schema}.dictionary
    where parent_code = 'SYS_PARAM'
      and code = any($1::varchar[])
  `, [PBS_BUSINESS_TIME_KEYS]);
  const values = new Map(result.rows.map((row) => [row.code, row.code_value ?? ""]));

  return {
    mode: values.get(PBS_BUSINESS_TIME_MODE_KEY) || "ROLLING",
    anchor: values.get(PBS_BUSINESS_TIME_ANCHOR_KEY) ?? "",
    anchorReal: values.get(PBS_BUSINESS_TIME_ANCHOR_REAL_KEY) ?? "",
  };
};

const printStatus = (status: ReturnType<typeof buildPbsBusinessTimeStatus>) => {
  console.log("PBS business time status:");
  console.log(`  source: ${status.source}`);
  console.log(`  mode: ${status.mode}`);
  console.log(`  businessNow: ${status.businessNowIso}`);
  console.log(`  realNow: ${status.realNowIso}`);
  console.log(`  anchor: ${status.anchor || "(empty)"}`);
  console.log(`  anchorReal: ${status.anchorReal || "(empty)"}`);

  for (const warning of status.warnings) {
    console.log(`  warning: ${warning}`);
  }
};

const applyUpdates = async (
  client: pg.Client,
  schema: string,
  updates: ReturnType<typeof buildPbsBusinessTimeUpdates>,
) => {
  for (const update of updates) {
    await client.query(`
      update ${schema}.dictionary
      set code_value = $1,
          updated_by = $2,
          updated_at = now()
      where parent_code = 'SYS_PARAM'
        and code = $3
    `, [update.codeValue, UPDATED_BY, update.code]);
  }
};

const run = async () => {
  const command = parsePbsBusinessTimeArgs(process.argv.slice(2));
  const client = new Client({ connectionString: requireDatabaseUrl() });
  const realNow = new Date();
  const schema = liveSchema();

  try {
    await client.connect();

    if (command.action === "status") {
      printStatus(buildPbsBusinessTimeStatus(await loadBusinessTimeConfig(client, schema), realNow));
      return;
    }

    await client.query("begin");

    try {
      await ensureBusinessTimeConfig(client, schema);
      await applyUpdates(client, schema, buildPbsBusinessTimeUpdates(command, realNow));
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    if (command.action === "clear") {
      console.log("PBS business time override cleared. PBS will use the real current time.");
    } else {
      console.log(`PBS business time set from input ${command.input}.`);
    }

    printStatus(buildPbsBusinessTimeStatus(await loadBusinessTimeConfig(client, schema), new Date()));
  } finally {
    await client.end();
  }
};

void run().catch((error) => {
  console.error("PBS business time script failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
