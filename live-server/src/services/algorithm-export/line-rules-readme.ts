import {
  DAYS_OFF_COMMUTER_PATTERN_ALGORITHM_RULE_CODES,
  LINE_RULE_METADATA,
} from "./line-rules-metadata.js";

export const buildLineRulesReadme = () => [
  "# LINE_RULES.csv Rule ID Reference",
  "",
  "This file documents the rule identifiers exported by PBS algorithm export.",
  "LINE_RULES.csv contains rule-level constraints used when constructing a full line. Some source rules may come from the DaysOff tab when they cannot be represented as concrete date rows in DAYSOFF.csv.",
  "",
  "## CSV Columns",
  "",
  "| Column | Description |",
  "| --- | --- |",
  "| Crew_ID | PBS bid crew id. |",
  "| Code_ID | Source PBS property code from the portal configuration. Use this for tracing the exported row back to the original bid rule. |",
  "| Rule_ID | Algorithm rule id used for parsing. Some source Code_ID values are remapped to the algorithm's requested Rule_ID. |",
  "| Rule_Type | Stable uppercase algorithm rule type. |",
  "| Parameters_JSON | Stable JSON payload for algorithm parsing. |",
  "| T1_Counter ... T7_Counter | Number of times the same crew/rule/params appears in each tier. |",
  "| Description | Human-readable full sentence for debugging; algorithms should not parse it. |",
  "",
  "## Rule IDs",
  "",
  "The table below lists exported source Code_ID values. Code_ID 202, 203, and 205 are exported as Rule_ID 408 / Rule_Type COMMUTER_PATTERN. Portal property 407 is exported as the algorithm's Rule_ID 403 / Rule_Type MIN_BASE_LAYOVER. Property 428 is a Pairing preference and is exported through PAIRING_SCORE.csv. Property 429 is exported as Rule_ID 401 / 402.",
  "",
  "| Code_ID | Default Rule_ID | Default Rule_Type | UI Name | Source | Parameters_JSON |",
  "| --- | --- | --- | --- | --- | --- |",
  ...LINE_RULE_METADATA
    .map(([ruleId, ruleType, name, source, parameters]) => {
      const isCommuterRule = DAYS_OFF_COMMUTER_PATTERN_ALGORITHM_RULE_CODES.has(ruleId);
      const algorithmRuleId = ruleId === 407 ? 403 : isCommuterRule ? 408 : ruleId;
      const algorithmRuleType = ruleId === 407 ? "MIN_BASE_LAYOVER" : isCommuterRule ? "COMMUTER_PATTERN" : ruleType;
      const algorithmParameters = ruleId === 407
        ? "Parameters_JSON is {\"minHours\":number}."
        : parameters;
      return `| ${ruleId} | ${algorithmRuleId} | ${algorithmRuleType} | ${name} | ${source} | ${algorithmParameters.replace(/\|/g, "\\|")} |`;
    }),
  "",
  "## Reserve Notes",
  "",
  "Whole-month Reserve call type structure from the Reserve tab is exported as Rule_ID 301 when the date scope is whole_month.",
  "First-half, second-half, date-range, and specific-date Reserve call type requests remain in RESERVE_SCORE.csv.",
  "Reserve / Flying Date Pattern remains exported as Rule_ID 410.",
  "Line Reserve is exported as Rule_ID 427 with action award or avoid for the whole bid month.",
  "",
].join("\n");
