// deploy/common/__tests__/list-rule-engine-bins.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateRustBinsManifest } from '../generate-rust-bins-manifest.mjs'
import { listRuleEngineBins } from '../list-rule-engine-bins.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test('parses [[bin]] names and ignores [lib] / package name', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rust-bins-'))
  const cargo = path.join(dir, 'Cargo.toml')
  fs.writeFileSync(cargo, `
[package]
name = "rois-rule-engine"
[lib]
name = "rois_rule_engine"
path = "src/lib.rs"
[[bin]]
name = "check-7505"
path = "src/bin/check_7505.rs"
[[bin]]
name = "check-7507"
path = "src/bin/check_7507.rs"
[[bin]]
name = "ruletool"
path = "src/bin/ruletool.rs"
`)
  assert.deepEqual(listRuleEngineBins(cargo), ['check-7505', 'check-7507', 'ruletool'])
})

test('real rule-engine-rs Cargo.toml includes check-7507 and ruletool', () => {
  const cargo = path.resolve(__dirname, '../../../rule-engine-rs/Cargo.toml')
  const bins = listRuleEngineBins(cargo)
  assert.ok(bins.includes('check-7507'))
  assert.ok(bins.includes('ruletool'))
  assert.ok(bins.includes('check-7505'))
  assert.ok(bins.length >= 18)
})

test('generates a JSON manifest from Cargo.toml bins', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rust-bins-manifest-'))
  const cargo = path.join(dir, 'Cargo.toml')
  const manifest = path.join(dir, 'rust-bins.json')
  fs.writeFileSync(cargo, '[[bin]]\nname = "check-7507"\n[[bin]]\nname = "ruletool"\n')

  const bins = generateRustBinsManifest(cargo, manifest)

  assert.deepEqual(bins, ['check-7507', 'ruletool'])
  assert.deepEqual(JSON.parse(fs.readFileSync(manifest, 'utf8')), bins)
})
