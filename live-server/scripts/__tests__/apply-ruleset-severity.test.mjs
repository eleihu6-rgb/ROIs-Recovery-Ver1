// Proves catalog rule.severity overlays engine-hardcoded severity before persist/preview.
import test from 'node:test'
import assert from 'node:assert/strict'
import { applyRulesetSeverity } from '../legality-recheck-core.mjs'

test('applyRulesetSeverity remaps engine Overridable to Soft when rule.severity=1', () => {
  const rows = [
    { rule_code: '7504', rule_instance: '001', severity: 2, message: 'engine' },
    { rule_code: '1001', rule_instance: '001', severity: 1, message: 'engine soft' },
  ]
  applyRulesetSeverity(rows, [
    { function: 7504, instance: '001', severity: 1 },
    { function: 1001, instance: '001', severity: 3 },
  ])
  assert.equal(rows[0].severity, 1)
  assert.equal(rows[1].severity, 3)
})

test('applyRulesetSeverity leaves unknown rules unchanged', () => {
  const rows = [{ rule_code: '9999', rule_instance: '001', severity: 2 }]
  applyRulesetSeverity(rows, [{ function: 7504, instance: '001', severity: 1 }])
  assert.equal(rows[0].severity, 2)
})

test('resolveRulesetRules SQL selects severity (source contract)', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const source = fs.readFileSync(path.resolve(import.meta.dirname, '../legality-recheck-core.mjs'), 'utf8')
  assert.match(source, /r\.severity::int as severity/)
  assert.match(source, /return applyRulesetSeverity\(all, setRules\)/)
})
