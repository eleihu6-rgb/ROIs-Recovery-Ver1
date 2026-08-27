import process from "node:process";

import pg from "pg";

import { buildPreviewCondition } from "../dist/services/pairing-search/pairing-search-condition-builder.js";
import { createPairingSearchSqlBuilder } from "../dist/services/pairing-search/pairing-search-sql-builder.js";
import { generatedSqlPreflightCases } from "../dist/services/pairing-search/generated-sql-preflight-cases.js";
import { generatedSqlPreflightExemptions } from "../dist/services/pairing-search/generated-sql-preflight-exemptions.js";
import { generatedSqlPreflightManifest } from "../dist/services/pairing-search/generated-sql-preflight-manifest.js";

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;
const requiredEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
};
const requireIdentifier = (name) => {
  const value = requiredEnv(name);
  if (!IDENTIFIER_PATTERN.test(value)) throw new Error(`Invalid PostgreSQL identifier in ${name}.`);
  return value;
};

const databaseUrl = requiredEnv("DATABASE_URL");
const liveSchema = requireIdentifier("LIVE_SCHEMA");
const pbsSchema = requireIdentifier("PBS_SCHEMA");
const coveredCodes = new Set(generatedSqlPreflightManifest.map((entry) => entry.propertyCode));
const exemptionCodes = new Set();
const today = new Date().toISOString().slice(0, 10);

for (const exemption of generatedSqlPreflightExemptions) {
  if (
    exemptionCodes.has(exemption.propertyCode)
    || !exemption.reason.trim()
    || !exemption.owner.trim()
    || !/^\d{4}-\d{2}-\d{2}$/.test(exemption.expiresOn)
    || exemption.expiresOn < today
    || coveredCodes.has(exemption.propertyCode)
  ) {
    throw new Error(`Invalid generated SQL exemption for property ${exemption.propertyCode}.`);
  }
  exemptionCodes.add(exemption.propertyCode);
}

const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  await client.query("begin read only");

  const catalog = await client.query(
    `select property_code, property_name
     from ${pbsSchema}.pbs_bid_property
     where bid_type = 'Pairing'
       and is_active = 1
     order by property_code`,
  );
  const activeCodes = new Set(catalog.rows.map((row) => Number(row.property_code)));
  for (const row of catalog.rows) {
    const code = Number(row.property_code);
    if (!coveredCodes.has(code) && !exemptionCodes.has(code)) {
      throw new Error(`Active Pairing property ${code} (${row.property_name}) has no generated SQL preflight case or exemption.`);
    }
  }
  for (const code of exemptionCodes) {
    if (!activeCodes.has(code)) throw new Error(`Generated SQL exemption ${code} is not active in the remote catalog.`);
  }

  for (const preflightCase of generatedSqlPreflightCases) {
    if (preflightCase.expected.kind !== "sql") continue;
    const sqlBuilder = createPairingSearchSqlBuilder();
    const condition = buildPreviewCondition(
      preflightCase.property,
      liveSchema,
      sqlBuilder,
      preflightCase.context,
    );
    const registeredCtes = sqlBuilder.renderCtes();

    try {
      const factsJoin = preflightCase.context.useCurrentRulesFacts
        ? `cross join lateral (
            select
              null::timestamp as check_in_local,
              null::timestamp as check_out_local,
              '[]'::jsonb as duty_counts,
              '[]'::jsonb as airport_events
          ) facts`
        : "";
      await client.query(
        `explain ${registeredCtes ? `with ${registeredCtes}` : ""}
         select p.id from ${liveSchema}.pairing p ${factsJoin} where ${condition} limit 1`,
        sqlBuilder.params,
      );
      console.log(`PASS ${preflightCase.id} property=${preflightCase.propertyCode}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`FAIL ${preflightCase.id} property=${preflightCase.propertyCode}: ${message}`);
    }
  }

  await client.query("rollback");
  console.log(`PASS pbs-server generated SQL preflight (${generatedSqlPreflightCases.length} cases).`);
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    // The connection may have failed before a transaction existed.
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Generated SQL preflight failed: ${message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
