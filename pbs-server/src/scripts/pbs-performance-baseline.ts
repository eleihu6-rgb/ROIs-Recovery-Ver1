import dotenv from "dotenv";
import { Pool } from "pg";
import {
  formatPerformanceBaselineReport,
  parsePerformanceBaselineConfig,
  runPbsPerformanceBaseline,
  toErrorMessage,
} from "./pbs-performance-baseline-core.js";

dotenv.config();

const main = async (): Promise<void> => {
  const config = parsePerformanceBaselineConfig(process.env, process.argv.slice(2));
  const pool = new Pool({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
  });

  try {
    const summary = await runPbsPerformanceBaseline(config, {
      db: pool,
    });

    console.log(formatPerformanceBaselineReport(summary));

    if (!summary.ok) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
};

main().catch((error: unknown) => {
  console.error(
    `PBS performance baseline failed: ${toErrorMessage(error, [
      process.env.DATABASE_URL ?? "",
      process.env.JWT_SECRET ?? "",
    ])}`,
  );
  process.exitCode = 1;
});
