#!/usr/bin/env node
/**
 * check-legality-message-coverage.mjs — verify every LIVE recheck rule has a
 * shared alert template body in packages/legality-messages/messages.json.
 *
 * Default (warn-only): prints WARN for missing keys, exit 0.
 * --strict: exit 1 when any rule lacks a body (enable in CI after migration).
 *
 * Rule list source: prefer RULES + ruleCodeOf from legality-recheck-core.mjs.
 * Regex fallback (if import fails due to side effects/deps):
 *   /export const RULES = \[(rule\d+(?:,\s*rule\d+)*)\]/
 *   then extract rule codes with /rule(\d{4})/g
 */
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadMessages } from '../packages/legality-messages/src/render.mjs'

const strict = process.argv.includes('--strict')
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const messages = loadMessages(path.join(root, 'packages/legality-messages/messages.json'))

/** @returns {string[]} */
const loadRequiredRuleCodes = async () => {
  try {
    const { RULES, ruleCodeOf } = await import('../live-server/scripts/legality-recheck-core.mjs')
    return RULES.map(ruleCodeOf)
  } catch (err) {
    console.warn(`WARN: could not import legality-recheck-core.mjs (${err.message}); using regex fallback`)
    const coreText = readFileSync(
      path.join(root, 'live-server/scripts/legality-recheck-core.mjs'),
      'utf8',
    )
    const match = coreText.match(/export const RULES = \[(rule\d+(?:,\s*rule\d+)*)\]/)
    if (!match) throw new Error('regex fallback: export const RULES = [...] not found')
    return [...match[1].matchAll(/rule(\d{4})/g)].map((m) => m[1])
  }
}

const required = await loadRequiredRuleCodes()
const missing = required.filter((code) => !messages.rules?.[code]?.body)

for (const code of missing) {
  console.warn(`WARN: RULES has ${code} but messages.json has no body`)
}
if (missing.length && strict) {
  console.error(`FAIL: ${missing.length} rule(s) lack shared alert templates`)
  process.exit(1)
}
console.log(
  missing.length
    ? `legality-messages coverage: ${required.length - missing.length}/${required.length} (warn-only)`
    : `legality-messages coverage: ${required.length}/${required.length} OK`,
)
