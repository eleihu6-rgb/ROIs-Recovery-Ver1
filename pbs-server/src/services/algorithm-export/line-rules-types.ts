import { drizzle } from "drizzle-orm/node-postgres";
import type { AlgorithmExportScope } from "./export-scope.js";

type Database = ReturnType<typeof drizzle>;

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type LineRuleGroupRow = {
  crewId: string;
  tier: number;
  propertyGroupKey: string;
  bidType: string | null;
  propertyCode: number | null;
  legacyPropertyCode: number;
  actionId: number | null;
  operator: string | null;
  paramA: string | null;
  paramB: string | null;
  paramC: string | null;
};

export type LineRuleExportEntry = {
  crewId: string;
  codeId: number;
  ruleId: number;
  ruleType: string;
  parametersJson: string;
  description: string;
  tier: number;
};

export type LineRuleSkippedProperty = {
  crewId: string;
  periodCode: string;
  propertyCode: number;
  propertyGroupKey: string;
  reason: string;
};

export type LineRuleCounterRow = {
  crewId: string;
  codeId: number;
  ruleId: number;
  ruleType: string;
  parametersJson: string;
  counters: number[];
  description: string;
};

export type LoadLineRulesCsvOptions = {
  db: Pick<Database, "execute">;
  periodCode: string;
  scope?: AlgorithmExportScope;
  onSkippedProperty?: (event: LineRuleSkippedProperty) => void;
};
