import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";

import { buildPreviewCondition } from "./pairing-search-condition-builder.js";
import { createPairingSearchSqlBuilder } from "./pairing-search-sql-builder.js";
import { generatedSqlPreflightCases } from "./generated-sql-preflight-cases.js";
import {
  generatedSqlPreflightManifest,
  type GeneratedSqlPreflightHandler,
} from "./generated-sql-preflight-manifest.js";

const HANDLER_FILES: Record<GeneratedSqlPreflightHandler, string> = {
  core: "src/services/pairing-search/pairing-search-core-conditions.ts",
  time: "src/services/pairing-search/pairing-search-time-conditions.ts",
  detail: "src/services/pairing-search/pairing-search-detail-conditions.ts",
};

const extractDispatcherCodes = (handler: GeneratedSqlPreflightHandler): number[] => {
  const filePath = resolve(process.cwd(), HANDLER_FILES[handler]);
  const sourceFile = ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const codes = new Set<number>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isSwitchStatement(node)
      && node.expression.getText(sourceFile) === "property.propertyCode"
    ) {
      for (const clause of node.caseBlock.clauses) {
        if (ts.isCaseClause(clause) && ts.isNumericLiteral(clause.expression)) {
          codes.add(Number.parseInt(clause.expression.text, 10));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return [...codes].sort((left, right) => left - right);
};

const assertSameNumbers = (label: string, actual: number[], expected: number[]): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected [${expected.join(", ")}], received [${actual.join(", ")}].`);
  }
};

const assertSameStrings = (label: string, actual: string[], expected: string[]): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected [${expected.join(", ")}], received [${actual.join(", ")}].`);
  }
};

export const runGeneratedSqlStructureAudit = (): void => {
  const manifestCodes = new Map<GeneratedSqlPreflightHandler, number[]>();

  for (const handler of Object.keys(HANDLER_FILES) as GeneratedSqlPreflightHandler[]) {
    const actualCodes = extractDispatcherCodes(handler);
    const expectedCodes = generatedSqlPreflightManifest
      .filter((entry) => entry.handler === handler)
      .map((entry) => entry.propertyCode)
      .sort((left, right) => left - right);
    assertSameNumbers(`${handler} dispatcher manifest`, actualCodes, expectedCodes);
    manifestCodes.set(handler, expectedCodes);
  }

  const allManifestCodes = [...manifestCodes.values()].flat();
  if (new Set(allManifestCodes).size !== allManifestCodes.length) {
    throw new Error("A Pairing property code is assigned to more than one generated SQL handler.");
  }

  const expectedCaseIds = generatedSqlPreflightManifest
    .flatMap((entry) => entry.requiredCaseIds)
    .sort();
  const actualCaseIds = generatedSqlPreflightCases.map((entry) => entry.id).sort();
  assertSameStrings("registry case ids", actualCaseIds, expectedCaseIds);

  for (const preflightCase of generatedSqlPreflightCases) {
    const sqlBuilder = createPairingSearchSqlBuilder();

    if (preflightCase.expected.kind === "error") {
      try {
        buildPreviewCondition(
          preflightCase.property,
          "f8",
          sqlBuilder,
          preflightCase.context,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!preflightCase.expected.messagePattern.test(message)) throw error;
        continue;
      }
      throw new Error(`${preflightCase.id} was expected to reject its fixture.`);
    }

    const condition = buildPreviewCondition(
      preflightCase.property,
      "f8",
      sqlBuilder,
      preflightCase.context,
    );
    if (!condition.trim()) {
      throw new Error(`${preflightCase.id} generated an empty SQL condition.`);
    }
    if (/\)\s+airport_events\s+order\s+by\s+s\./is.test(condition)) {
      throw new Error(`${preflightCase.id} contains a UNION-level ORDER BY that references branch alias s.`);
    }

    const placeholders = [...condition.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
    const highestPlaceholder = placeholders.length > 0 ? Math.max(...placeholders) : 0;
    if (highestPlaceholder !== sqlBuilder.params.length) {
      throw new Error(
        `${preflightCase.id} generated ${highestPlaceholder} placeholders for ${sqlBuilder.params.length} parameters.`,
      );
    }
  }
};
