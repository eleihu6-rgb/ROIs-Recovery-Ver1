import { compareCrewScopedRows, type AlgorithmExportScope } from "./export-scope.js";
import { escapeCsvCell } from "./csv.js";
import { LINE_RULES_CSV_HEADER, TIER_COUNT } from "./line-rules-metadata.js";
import type { LineRuleCounterRow, LineRuleExportEntry } from "./line-rules-types.js";

const createCounterRow = (entry: LineRuleExportEntry): LineRuleCounterRow => ({
  crewId: entry.crewId,
  codeId: entry.codeId,
  ruleId: entry.ruleId,
  ruleType: entry.ruleType,
  parametersJson: entry.parametersJson,
  counters: Array.from({ length: TIER_COUNT }, () => 0),
  description: entry.description,
});

const incrementCounter = (
  rowsByKey: Map<string, LineRuleCounterRow>,
  entry: LineRuleExportEntry,
) => {
  if (entry.tier < 1 || entry.tier > TIER_COUNT) {
    return;
  }

  const key = `${entry.crewId}|${entry.codeId}|${entry.ruleId}|${entry.ruleType}|${entry.parametersJson}`;
  const row = rowsByKey.get(key) ?? createCounterRow(entry);

  row.counters[entry.tier - 1] += 1;
  rowsByKey.set(key, row);
};

const compareLineRuleRows = (
  left: LineRuleCounterRow,
  right: LineRuleCounterRow,
  scope?: AlgorithmExportScope,
) => {
  const crewCompare = compareCrewScopedRows(left, right, scope);

  if (crewCompare !== 0) {
    return crewCompare;
  }

  if (left.codeId !== right.codeId) {
    return left.codeId - right.codeId;
  }

  if (left.ruleId !== right.ruleId) {
    return left.ruleId - right.ruleId;
  }

  return left.parametersJson.localeCompare(right.parametersJson);
};

export const serializeLineRuleRowsToCsv = (
  rows: LineRuleCounterRow[],
  scope?: AlgorithmExportScope,
) => {
  const lines = [
    LINE_RULES_CSV_HEADER.join(","),
    ...rows
      .sort((left, right) => compareLineRuleRows(left, right, scope))
      .map((row) => [
        row.crewId,
        row.codeId,
        row.ruleId,
        row.ruleType,
        row.parametersJson,
        ...row.counters,
        row.description,
      ].map(escapeCsvCell).join(",")),
  ];

  return `${lines.join("\n")}\n`;
};

export const buildLineRulesCsvFromEntries = (
  entries: LineRuleExportEntry[],
  scope?: AlgorithmExportScope,
) => {
  const rowsByKey = new Map<string, LineRuleCounterRow>();

  for (const entry of entries) {
    incrementCounter(rowsByKey, entry);
  }

  return serializeLineRuleRowsToCsv(Array.from(rowsByKey.values()), scope);
};
