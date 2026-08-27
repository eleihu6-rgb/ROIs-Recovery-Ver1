import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const YEG_14_SCENARIOS = [
  { crewId: "8888", label: "Commuter Pattern" },
  { crewId: "13697", label: "Minimum 7 days off in a row" },
  { crewId: "2697", label: "Efficient flying first" },
  { crewId: "2696", label: "Only AM reserve" },
  { crewId: "2440", label: "Weekends off" },
  { crewId: "2377", label: "Half month AM reserve / half month PM reserve" },
  { crewId: "2229", label: "Half month AM reserve / half month flying" },
  { crewId: "2227", label: "Highest credit pairings first then lower ones" },
  { crewId: "2224", label: "Weekend flying only Fri/Sat/Sun/Mon" },
  { crewId: "996", label: "No red eyes, no weekends" },
  { crewId: "572", label: "Weekends off, some flying some reserve" },
  { crewId: "536", label: "AM reserve with Tue/Wed off" },
  { crewId: "383", label: "Only reserve with weekends off" },
  { crewId: "274", label: "No reserve" },
] as const;

type BidType = "DaysOff" | "Pairing" | "Reserve" | "Line";

type BidGroupInput = {
  bidType: BidType;
  propertyCode: number;
  tier: number;
  actionId?: 1 | 2 | null;
  operator?: string | null;
  paramA?: string | null;
  paramB?: string | null;
  paramC?: string | null;
};

type ScenarioConfig = {
  crewId: string;
  label: string;
  groups: BidGroupInput[];
};

type PropertyDefinitionRow = {
  id: string;
  bid_type: BidType;
  property_code: number;
};

type CrewCheckRow = {
  crew_id: string;
  base: string | null;
  seniority_num: number | null;
};

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, "\"\"")}"`;

const parseArgs = () => {
  const periodCodeIndex = process.argv.indexOf("--periodCode");
  const periodCode = periodCodeIndex >= 0
    ? process.argv[periodCodeIndex + 1]?.trim()
    : (process.env.PBS_TEST_PERIOD_CODE ?? "Jun 2026");

  if (!periodCode) {
    throw new Error("periodCode is required. Use --periodCode \"Jun 2026\".");
  }

  return {
    periodCode,
    isWrite: process.argv.includes("--write"),
  };
};

const parsePeriodMonth = (periodCode: string) => {
  const namedMatch = /^([A-Za-z]+)\s+(\d{4})$/.exec(periodCode.trim());
  const months = new Map([
    ["jan", 0],
    ["january", 0],
    ["feb", 1],
    ["february", 1],
    ["mar", 2],
    ["march", 2],
    ["apr", 3],
    ["april", 3],
    ["may", 4],
    ["jun", 5],
    ["june", 5],
    ["jul", 6],
    ["july", 6],
    ["aug", 7],
    ["august", 7],
    ["sep", 8],
    ["sept", 8],
    ["september", 8],
    ["oct", 9],
    ["october", 9],
    ["nov", 10],
    ["november", 10],
    ["dec", 11],
    ["december", 11],
  ]);

  if (!namedMatch) {
    throw new Error(`Unsupported periodCode for scenario dates: ${periodCode}`);
  }

  const monthIndex = months.get(namedMatch[1]!.toLowerCase());

  if (monthIndex == null) {
    throw new Error(`Unsupported period month: ${periodCode}`);
  }

  return {
    year: Number.parseInt(namedMatch[2]!, 10),
    monthIndex,
  };
};

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const buildPeriodDates = (periodCode: string) => {
  const periodMonth = parsePeriodMonth(periodCode);
  const daysInMonth = new Date(Date.UTC(periodMonth.year, periodMonth.monthIndex + 1, 0)).getUTCDate();

  return Array.from({ length: daysInMonth }, (_, index) =>
    toIsoDate(new Date(Date.UTC(periodMonth.year, periodMonth.monthIndex, index + 1))));
};

const buildScenarioConfigs = (periodCode: string): ScenarioConfig[] => {
  const periodDates = buildPeriodDates(periodCode);
  const midDate = periodDates[15] ?? periodDates[Math.floor(periodDates.length / 2)]!;
  const lastDate = periodDates.at(-1)!;

  return [
    {
      ...YEG_14_SCENARIOS[0],
      groups: [{
        bidType: "Line",
        propertyCode: 408,
        tier: 1,
        operator: "Between",
        paramA: "4",
        paramB: "4",
        paramC: "4",
      }],
    },
    {
      ...YEG_14_SCENARIOS[1],
      groups: [{
        bidType: "DaysOff",
        propertyCode: 203,
        tier: 1,
        operator: "=",
        paramA: "7",
      }],
    },
    {
      ...YEG_14_SCENARIOS[2],
      groups: [{
        bidType: "Line",
        propertyCode: 428,
        tier: 1,
        actionId: 1,
      }],
    },
    {
      ...YEG_14_SCENARIOS[3],
      groups: [{
        bidType: "Reserve",
        propertyCode: 301,
        tier: 1,
        actionId: 1,
        operator: "In",
        paramA: "PRAM",
        paramB: JSON.stringify({ mode: "whole_month" }),
      }],
    },
    {
      ...YEG_14_SCENARIOS[4],
      groups: [{
        bidType: "DaysOff",
        propertyCode: 201,
        tier: 1,
        operator: "In",
        paramA: "Weekends",
      }],
    },
    {
      ...YEG_14_SCENARIOS[5],
      groups: [
        {
          bidType: "Reserve",
          propertyCode: 301,
          tier: 1,
          actionId: 1,
          operator: "In",
          paramA: "PRAM",
          paramB: JSON.stringify({ mode: "first_half" }),
        },
        {
          bidType: "Reserve",
          propertyCode: 301,
          tier: 1,
          actionId: 1,
          operator: "In",
          paramA: "PRPM",
          paramB: JSON.stringify({ mode: "second_half" }),
        },
      ],
    },
    {
      ...YEG_14_SCENARIOS[6],
      groups: [
        {
          bidType: "Reserve",
          propertyCode: 301,
          tier: 1,
          actionId: 1,
          operator: "In",
          paramA: "PRAM",
          paramB: JSON.stringify({ mode: "first_half" }),
        },
        {
          bidType: "Pairing",
          propertyCode: 106,
          tier: 1,
          actionId: 1,
          operator: "Between",
          paramA: midDate,
          paramB: lastDate,
        },
      ],
    },
    {
      ...YEG_14_SCENARIOS[7],
      groups: [
        {
          bidType: "Pairing",
          propertyCode: 105,
          tier: 1,
          actionId: 1,
          operator: ">",
          paramA: "20:00",
        },
        {
          bidType: "Pairing",
          propertyCode: 105,
          tier: 2,
          actionId: 1,
          operator: ">",
          paramA: "25:00",
        },
      ],
    },
    {
      ...YEG_14_SCENARIOS[8],
      groups: [
        {
          bidType: "Pairing",
          propertyCode: 106,
          tier: 1,
          actionId: 1,
          operator: "In",
          paramA: JSON.stringify({ dates: [], daysOfWeek: ["MON", "FRI", "SAT", "SUN"] }),
        },
        {
          bidType: "Pairing",
          propertyCode: 110,
          tier: 1,
          actionId: 2,
          operator: "In",
          paramA: JSON.stringify({ dates: [], daysOfWeek: ["TUE", "WED", "THU"] }),
          paramC: "any",
        },
      ],
    },
    {
      ...YEG_14_SCENARIOS[9],
      groups: [
        {
          bidType: "DaysOff",
          propertyCode: 201,
          tier: 1,
          operator: "In",
          paramA: "Saturday,Sunday",
        },
        {
          bidType: "Pairing",
          propertyCode: 117,
          tier: 1,
          actionId: 2,
          operator: null,
          paramC: "any",
        },
      ],
    },
    {
      ...YEG_14_SCENARIOS[10],
      groups: [{
        bidType: "DaysOff",
        propertyCode: 201,
        tier: 1,
        operator: "In",
        paramA: "Saturday,Sunday",
      }],
    },
    {
      ...YEG_14_SCENARIOS[11],
      groups: [
        {
          bidType: "DaysOff",
          propertyCode: 201,
          tier: 1,
          operator: "In",
          paramA: "Tuesday,Wednesday",
        },
        {
          bidType: "Reserve",
          propertyCode: 301,
          tier: 1,
          actionId: 1,
          operator: "In",
          paramA: "PRAM",
          paramB: JSON.stringify({ mode: "whole_month" }),
        },
      ],
    },
    {
      ...YEG_14_SCENARIOS[12],
      groups: [
        {
          bidType: "Line",
          propertyCode: 427,
          tier: 1,
          actionId: 2,
        },
        {
          bidType: "DaysOff",
          propertyCode: 201,
          tier: 1,
          operator: "In",
          paramA: "Weekends",
        },
      ],
    },
    {
      ...YEG_14_SCENARIOS[13],
      groups: [{
        bidType: "Line",
        propertyCode: 427,
        tier: 1,
        actionId: 1,
      }],
    },
  ];
};

const buildPropertyKey = (bidType: BidType, propertyCode: number) => `${bidType}:${propertyCode}`;

const loadPropertyDefinitionIds = async (
  client: pg.Client,
  schema: string,
  configs: ScenarioConfig[],
) => {
  const propertyCodes = Array.from(new Set(configs.flatMap((config) => config.groups.map((group) => group.propertyCode))));
  const result = await client.query<PropertyDefinitionRow>(
    `
      select id::varchar, bid_type, property_code
      from ${quoteIdentifier(schema)}.pbs_bid_property
      where is_active = 1
        and property_code = any($1::integer[])
    `,
    [propertyCodes],
  );
  const ids = new Map<string, string>();

  for (const row of result.rows) {
    ids.set(buildPropertyKey(row.bid_type, row.property_code), row.id);
  }

  for (const config of configs) {
    for (const group of config.groups) {
      const key = buildPropertyKey(group.bidType, group.propertyCode);

      if (!ids.has(key)) {
        throw new Error(`Missing pbs_bid_property for ${key}.`);
      }
    }
  }

  return ids;
};

const checkYegCrew = async (client: pg.Client, liveSchema: string, pbsSchema: string) => {
  const crewIds = YEG_14_SCENARIOS.map((scenario) => scenario.crewId);
  const result = await client.query<CrewCheckRow>(
    `
      select
        c.crew_id::varchar,
        u.base::varchar,
        c.seniority_num::integer
      from ${quoteIdentifier(liveSchema)}.crew c
      left join ${quoteIdentifier(pbsSchema)}.pbs_user u
        on u.crew_id = c.crew_id::varchar
      where c.crew_id::varchar = any($1::varchar[])
      order by c.seniority_num asc nulls last, c.crew_id
    `,
    [crewIds],
  );
  const found = new Set(result.rows.map((row) => row.crew_id));
  const missing = crewIds.filter((crewId) => !found.has(crewId));
  const nonYeg = result.rows.filter((row) => row.base !== "YEG");

  return {
    rows: result.rows,
    missing,
    nonYeg,
  };
};

const deleteExistingCurrentBids = async (
  client: pg.Client,
  schema: string,
  crewIds: readonly string[],
  periodCode: string,
) => {
  const bidIdsResult = await client.query<{ id: string }>(
    `
      select id::varchar
      from ${quoteIdentifier(schema)}.pbs_bid
      where period_code = $2
        and bid_context = 'Current'
        and (
          crew_id = any($1::varchar[])
          or created_by = 'codex-yeg-14-seed'
          or remarks like 'YEG 14 algorithm export test:%'
        )
    `,
    [crewIds, periodCode],
  );
  const bidIds = bidIdsResult.rows.map((row) => row.id);

  if (bidIds.length === 0) {
    return 0;
  }

  await client.query(
    `delete from ${quoteIdentifier(schema)}.pbs_bid_group where bid_id = any($1::bigint[])`,
    [bidIds],
  );
  await client.query(
    `delete from ${quoteIdentifier(schema)}.pbs_bid_day_off where bid_id = any($1::bigint[])`,
    [bidIds],
  );
  await client.query(
    `delete from ${quoteIdentifier(schema)}.pbs_bid_tier where bid_id = any($1::bigint[])`,
    [bidIds],
  );
  await client.query(
    `delete from ${quoteIdentifier(schema)}.pbs_bid where id = any($1::bigint[])`,
    [bidIds],
  );

  return bidIds.length;
};

const insertScenarioConfig = async (
  client: pg.Client,
  schema: string,
  periodCode: string,
  config: ScenarioConfig,
  propertyDefinitionIds: Map<string, string>,
) => {
  const bidResult = await client.query<{ id: string }>(
    `
      insert into ${quoteIdentifier(schema)}.pbs_bid (
        created_by,
        updated_by,
        crew_id,
        period_code,
        bid_context,
        total_tiers,
        status,
        last_modified_at,
        remarks
      )
      values ('codex-yeg-14-seed', 'codex-yeg-14-seed', $1, $2, 'Current', 7, 'DRAFT', now(), $3)
      returning id::varchar
    `,
    [config.crewId, periodCode, `YEG 14 algorithm export test: ${config.label}`],
  );
  const bidId = bidResult.rows[0]!.id;
  const usedTiers = Array.from(new Set(config.groups.map((group) => group.tier))).sort((left, right) => left - right);
  const tierIds = new Map<number, string>();

  for (const tier of usedTiers) {
    const totalGroups = config.groups.filter((group) => group.tier === tier).length;
    const tierResult = await client.query<{ id: string }>(
      `
        insert into ${quoteIdentifier(schema)}.pbs_bid_tier (
          created_by,
          updated_by,
          bid_id,
          tier,
          total_groups,
          is_active
        )
        values ('codex-yeg-14-seed', 'codex-yeg-14-seed', $1, $2, $3, 1)
        returning id::varchar
      `,
      [bidId, tier, totalGroups],
    );

    tierIds.set(tier, tierResult.rows[0]!.id);
  }

  for (const [index, group] of config.groups.entries()) {
    const tierId = tierIds.get(group.tier);

    if (!tierId) {
      throw new Error(`Missing tier ${group.tier} for crew ${config.crewId}.`);
    }

    await client.query(
      `
        insert into ${quoteIdentifier(schema)}.pbs_bid_group (
          created_by,
          updated_by,
          tier_id,
          bid_id,
          group_seq,
          property_group_key,
          bid_type,
          action_id,
          property_id,
          property_definition_id,
          operator,
          param_a,
          param_b,
          param_c,
          total_conditions
        )
        values (
          'codex-yeg-14-seed',
          'codex-yeg-14-seed',
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          0
        )
      `,
      [
        tierId,
        bidId,
        index + 1,
        `yeg14-${config.crewId}-${String(index + 1).padStart(2, "0")}`,
        group.bidType,
        group.actionId ?? null,
        group.propertyCode,
        propertyDefinitionIds.get(buildPropertyKey(group.bidType, group.propertyCode)),
        group.operator ?? null,
        group.paramA ?? null,
        group.paramB ?? null,
        group.paramC ?? null,
      ],
    );
  }
};

const main = async () => {
  const { periodCode, isWrite } = parseArgs();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const pbsSchema = process.env.PBS_SCHEMA?.trim() || "f8_pbs";
  const liveSchema = pbsSchema.replace(/_pbs$/i, "");

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const configs = buildScenarioConfigs(periodCode);
  const client = new Client({ connectionString: databaseUrl });

  await client.connect();

  try {
    const crewCheck = await checkYegCrew(client, liveSchema, pbsSchema);

    console.log("YEG 14 scenario seed");
    console.log(`  periodCode: ${periodCode}`);
    console.log(`  mode: ${isWrite ? "write" : "dry-run"}`);
    console.log(`  pbs schema: ${pbsSchema}`);
    console.log(`  live schema: ${liveSchema}`);
    console.log(`  live crew found: ${crewCheck.rows.length}`);

    if (crewCheck.missing.length > 0) {
      console.log(`  missing live crew: ${crewCheck.missing.join(", ")}`);
    }

    if (crewCheck.nonYeg.length > 0) {
      console.log(`  non-YEG crew: ${crewCheck.nonYeg.map((row) => `${row.crew_id}:${row.base ?? "null"}`).join(", ")}`);
    }

    for (const [index, config] of configs.entries()) {
      console.log(`  ${index + 1}. ${config.crewId} - ${config.label}`);
    }

    const propertyDefinitionIds = await loadPropertyDefinitionIds(client, pbsSchema, configs);

    if (!isWrite) {
      console.log("Dry-run complete. Re-run with --write to apply changes.");
      return;
    }

    await client.query("begin");

    const deletedBidCount = await deleteExistingCurrentBids(
      client,
      pbsSchema,
      configs.map((config) => config.crewId),
      periodCode,
    );

    for (const config of configs) {
      await insertScenarioConfig(client, pbsSchema, periodCode, config, propertyDefinitionIds);
    }

    await client.query("commit");

    console.log(`Applied YEG 14 scenario seed. Deleted ${deletedBidCount} existing Current bids and inserted ${configs.length} bids.`);
  } catch (error) {
    if (isWrite) {
      await client.query("rollback").catch(() => undefined);
    }

    throw error;
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error("YEG 14 scenario seed failed:");
  console.error(error);
  process.exitCode = 1;
});
