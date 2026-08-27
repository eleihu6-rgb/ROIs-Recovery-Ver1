#!/usr/bin/env node
/**
 * check-legality-help-coverage.mjs — find Legality rules in the rule template
 * that have NO Help topic, and rules whose documented name drifted from the
 * template.
 *
 * Template of truth: sql/seed/07-rule.sql (baseline) + sql/migration/*rule*.sql
 * (incremental inserts, e.g. rule 1001). Help coverage: the RULE_DOCS keys +
 * thin topic wrappers in gantt/src/components/help/topics/legality/.
 *
 * Comparison is by FUNCTION number (the seed's instance codes differ from the
 * workset instances Help documents, e.g. seed 7505/001 vs Help 7505/002).
 *
 * Run before/while refreshing Help (see the online-help-writing skill):
 *   node scripts/check-legality-help-coverage.mjs
 *
 * Advisory: not every template rule needs a Help topic — only the Flight-Deck
 * rules in the F8 workset do (PO/PBS/ground rules legitimately have none).
 * Exit 1 when a template function has no Help topic (an agent should verify and
 * fill Flight-Deck gaps); exit 0 otherwise.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── 1. Template rules: fn -> name (seed + rule migrations) ───────────────────
const template = new Map() // fn (string) -> name
// Value tuple inside a rule INSERT: fn, 'inst', 'type', 'name', …
const FN_TUPLE = /,\s*([0-9]{4}),\s*'([0-9]{3})',\s*'[^']*',\s*'([^']+)'/g

const seedText = readFileSync(join(ROOT, 'sql/seed/07-rule.sql'), 'utf8')
for (const m of seedText.matchAll(FN_TUPLE)) {
  const fn = m[1]
  if (!template.has(fn)) template.set(fn, m[3])
}

const migrationDir = join(ROOT, 'sql/migration')
let migrationFiles = []
try { migrationFiles = readdirSync(migrationDir).filter((f) => /rule|legality/i.test(f) && f.endsWith('.sql')) } catch { /* no migrations dir */ }
for (const file of migrationFiles) {
  const text = readFileSync(join(migrationDir, file), 'utf8')
  for (const m of text.matchAll(FN_TUPLE)) {
    // Skip `where rule_id = …` guard fragments, not value lists.
    if (text.slice(Math.max(0, m.index - 140), m.index).includes('rule_id')) continue
    const fn = m[1]
    if (!template.has(fn)) template.set(fn, m[3])
  }
}

// ── 2. Help coverage: fn -> documented name (RULE_DOCS + wrappers) ───────────
const covered = new Map() // fn -> name
const ruleDocPath = join(ROOT, 'gantt/src/components/help/topics/legality/_rule-doc.tsx')
const ruleDoc = readFileSync(ruleDocPath, 'utf8')
for (const m of ruleDoc.matchAll(/'(\d{4})\/\d{3}':\s*\{[^}]*?name:\s*'([^']+)'/gms)) {
  if (!covered.has(m[1])) covered.set(m[1], m[2])
}
const wrapperDir = join(ROOT, 'gantt/src/components/help/topics/legality')
try {
  for (const file of readdirSync(wrapperDir).filter((f) => /^legality-\d+\.tsx$/.test(f))) {
    const text = readFileSync(join(wrapperDir, file), 'utf8')
    for (const m of text.matchAll(/<RuleDoc\s+id="(\d{4})\/\d{3}"/g)) {
      if (!covered.has(m[1])) covered.set(m[1], '')
    }
  }
} catch { /* no wrapper dir */ }

// ── 3. Compare ───────────────────────────────────────────────────────────────
let gaps = 0
let drifted = 0
console.log(`Template rule functions: ${template.size}  |  Help-covered functions: ${covered.size}`)
console.log()
for (const [fn, name] of [...template.entries()].sort()) {
  const docName = covered.get(fn)
  if (docName === undefined) {
    gaps++
    console.log(`GAP    ${fn}  ${name}   (no Help topic)`)
  } else if (docName && docName.trim() !== name.trim()) {
    drifted++
    console.log(`DRIFT  ${fn}  Help says "${docName.trim()}" vs template "${name.trim()}"`)
  }
}
for (const [fn] of covered) {
  if (!template.has(fn)) console.log(`EXTRA  ${fn}  (Help topic for a function not in the template — verify still current)`)
}
console.log()
if (gaps > 0) {
  console.log(`✗ ${gaps} template rule function(s) have no Help topic — verify; add topics for Flight-Deck rules in the F8 workset (see _rule-doc RULE_DOCS pattern).`)
  process.exitCode = 1
} else if (drifted > 0) {
  console.log(`✗ ${drifted} rule name(s) drifted — update the Help topics to the current template name.`)
  process.exitCode = 1
} else {
  console.log('✓ Every template rule function has a Help topic and matches.')
}
