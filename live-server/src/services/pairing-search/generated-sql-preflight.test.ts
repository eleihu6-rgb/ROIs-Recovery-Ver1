import { test } from "vitest";

import { runGeneratedSqlStructureAudit } from "./generated-sql-preflight-audit.js";

test("all generated Pairing SQL handlers and registered variants pass structural audit", () => {
  runGeneratedSqlStructureAudit();
});
