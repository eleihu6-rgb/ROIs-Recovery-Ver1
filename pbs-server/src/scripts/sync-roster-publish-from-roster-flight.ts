import "dotenv/config";
import pg from "pg";
import {
  buildRosterPublishDryRunSql,
  buildRosterPublishDuplicateSampleSql,
  buildRosterPublishExecuteSql,
  mapRosterPublishSyncSummary,
  parseRosterPublishSyncArgs,
  parseRosterPublishSyncEnv,
  type RosterPublishDuplicateSample,
} from "./sync-roster-publish-from-roster-flight-core.js";

const { Client } = pg;

const logSummary = (summary: ReturnType<typeof mapRosterPublishSyncSummary>) => {
  console.log("Roster publish sync summary:");
  console.log(`  candidateRows: ${summary.candidateRows}`);
  console.log(`  validRows: ${summary.validRows}`);
  console.log(`  invalidRows: ${summary.invalidRows}`);
  console.log(`  duplicateSkippedRows: ${summary.duplicateSkippedRows}`);
  console.log(`  existingFlightConflictRows: ${summary.existingFlightConflictRows}`);
  console.log(`  plannedInsertRows: ${summary.plannedInsertRows}`);
  console.log(`  plannedUpdateRows: ${summary.plannedUpdateRows}`);
  console.log(`  writableRows: ${summary.writableRows}`);
  console.log(`  affectedRows: ${summary.affectedRows}`);
};

const logDuplicateSamples = (samples: RosterPublishDuplicateSample[]) => {
  if (samples.length === 0) {
    return;
  }

  console.log("Duplicate flight-key samples:");

  for (const sample of samples) {
    console.log(`  fltId=${sample.fltId} crewId=${sample.crewId} rowCount=${sample.rowCount}`);
    console.log(`    rosterIds=${sample.rosterIds.join(",")}`);
    console.log(`    pairingIds=${sample.pairingIds.filter(Boolean).join(",")}`);
    console.log(`    labels=${sample.labels.filter(Boolean).join(" | ")}`);
  }
};

const buildSummaryParams = (
  command: ReturnType<typeof parseRosterPublishSyncArgs>,
  env: ReturnType<typeof parseRosterPublishSyncEnv>,
) => {
  if (command.execute) {
    return [
      command.fromDate,
      command.toDate,
      command.crewId,
      env.updatedBy,
      env.filiale,
    ];
  }

  return [
    command.fromDate,
    command.toDate,
    command.crewId,
  ];
};

const run = async () => {
  const command = parseRosterPublishSyncArgs(process.argv.slice(2));
  const env = parseRosterPublishSyncEnv(process.env);
  const client = new Client({ connectionString: env.databaseUrl });
  const modeLabel = command.execute ? "EXECUTE" : "DRY RUN";

  console.log(`Roster publish sync mode: ${modeLabel}`);
  console.log(`  liveSchema: ${env.liveSchema}`);
  console.log(`  pbsSchema: ${env.pbsSchema}`);
  console.log(`  filiale: ${env.filiale}`);
  console.log(`  periodCode: ${command.periodCode ?? "-"}`);
  console.log(`  fromDate: ${command.fromDate}`);
  console.log(`  toDate: ${command.toDate}`);
  console.log(`  crewId: ${command.crewId ?? "-"}`);

  try {
    await client.connect();

    const summaryResult = await client.query(
      command.execute
        ? buildRosterPublishExecuteSql(env.liveSchema)
        : buildRosterPublishDryRunSql(env.liveSchema),
      buildSummaryParams(command, env),
    );
    const summary = mapRosterPublishSyncSummary(summaryResult.rows[0]);

    logSummary(summary);

    if (command.sampleLimit > 0 && summary.duplicateSkippedRows > 0) {
      const sampleResult = await client.query<RosterPublishDuplicateSample>(
        buildRosterPublishDuplicateSampleSql(env.liveSchema),
        [
          command.fromDate,
          command.toDate,
          command.crewId,
          command.sampleLimit,
        ],
      );

      logDuplicateSamples(sampleResult.rows);
    }
  } finally {
    await client.end();
  }
};

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Roster publish sync failed: ${message}`);
  process.exitCode = 1;
});
