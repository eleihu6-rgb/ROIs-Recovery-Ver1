import test from "node:test";

import { runGeneratedSqlStructureAudit } from "./generated-sql-preflight-audit.js";

test("generated Pairing SQL registry covers the registered builder variants", () => {
  runGeneratedSqlStructureAudit();
});
