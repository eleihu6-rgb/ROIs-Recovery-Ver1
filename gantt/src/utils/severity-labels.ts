/**
 * Severity → user-facing label (single source of truth).
 *
 * Severity is stored two ways across the app and BOTH render the same business
 * vocabulary — defined by enforcement, not log-levels (ERROR/WARNING/INFO read like
 * software errors, which they are not):
 *
 *   Hard         — an inviolable limit; breaching it makes the roster non-compliant
 *                  and blocks publish.                       (code 'ERROR' / numeric 3)
 *   Overridable  — a real limit a planner may knowingly accept with a recorded
 *                  justification.                            (code 'WARNING' / numeric 2)
 *   Soft         — advisory / best-practice / computed value; never blocks.
 *                                                            (code 'INFO' / numeric 1)
 *
 * This is DISPLAY-ONLY: the stored codes ('ERROR'/'WARNING'/'INFO') and numeric
 * severities (1–3) are unchanged, so the rule engine, live `rule_violation` data and
 * all logic keyed on them keep working. Render through these helpers everywhere a
 * severity is shown so the wording stays consistent across every surface.
 */

/** Rule-config string code → display label. */
export const RULE_SEVERITY_LABELS: Record<string, string> = {
  ERROR: 'Hard',
  WARNING: 'Overridable',
  INFO: 'Soft',
}

/** Live-violation numeric severity (1–3) → display label. */
export const VIOLATION_SEVERITY_LABELS: Record<number, string> = {
  1: 'Soft',
  2: 'Overridable',
  3: 'Hard',
}

/** Severity dropdown choices, highest → lowest; `code` is the stored value. */
export const SEVERITY_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'ERROR', label: RULE_SEVERITY_LABELS.ERROR },
  { code: 'WARNING', label: RULE_SEVERITY_LABELS.WARNING },
  { code: 'INFO', label: RULE_SEVERITY_LABELS.INFO },
]

/** Label for a rule-config string code (falls back to the raw code). */
export const severityLabelFromCode = (code: string): string =>
  RULE_SEVERITY_LABELS[code] ?? code

/** Label for a numeric live-violation severity (falls back to the hardest tier). */
export const severityLabelFromNum = (n: number): string =>
  VIOLATION_SEVERITY_LABELS[n] ?? 'Hard'
