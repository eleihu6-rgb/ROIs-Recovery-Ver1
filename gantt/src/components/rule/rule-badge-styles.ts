/**
 * Shared badge styling for the Rule module.
 *
 * Restrained, professional palette (Jeppesen/Bloomberg density): taxonomy badges
 * — category, division, usage (PBS/PO/RO/GANTT), Pilot/Cabin — render as ONE quiet
 * neutral chip, because their color carried no meaning and a per-value rainbow made
 * the dense rule table noisy. Color is reserved for Severity, which actually encodes
 * urgency, and is kept soft (tinted background + tinted text) rather than heavy fills.
 *
 * Sizes (text-2xs / text-3xs) are applied at the call site; these constants own only
 * shape + color so the same chip can be used at different densities.
 */

/** Neutral taxonomy chip — category / division / usage / Pilot-Cabin (no semantic color). */
export const TAXONOMY_CHIP =
  'rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 font-semibold text-muted-foreground'

/** Slightly stronger neutral chip for a rule set's primary tag (usage). */
export const TAXONOMY_CHIP_STRONG =
  'rounded border border-border/60 bg-muted px-1.5 py-0.5 font-semibold text-foreground'

/** Soft semantic severity chip — color only where it means urgency. */
export const SEVERITY_CHIP: Record<string, string> = {
  ERROR:   'bg-destructive/10 text-destructive',
  WARNING: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  INFO:    'bg-muted text-muted-foreground',
}

/** Quiet "default rule set" marker — a soft hint of green, not a saturated fill. */
export const DEFAULT_CHIP =
  'rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-emerald-600 dark:text-emerald-400'
