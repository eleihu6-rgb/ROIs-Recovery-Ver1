// deploy/common/list-rule-engine-bins.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Parse workspace-root rule-engine-rs Cargo.toml for [[bin]] names only.
 * Ignores [lib], [package], comments, and does not read py/Cargo.toml.
 */
export function listRuleEngineBins(cargoTomlPath) {
  const text = fs.readFileSync(cargoTomlPath, 'utf8')
  const names = []
  let inBin = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    if (line.startsWith('[')) {
      inBin = line === '[[bin]]'
      continue
    }
    if (!inBin) continue
    const m = /^name\s*=\s*"([^"]+)"\s*$/.exec(line)
    if (m) names.push(m[1])
  }
  const unique = [...new Set(names)].sort()
  if (!unique.length) {
    throw new Error(`no [[bin]] names found in ${cargoTomlPath}`)
  }
  return unique
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const defaultCargo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../rule-engine-rs/Cargo.toml')
  const cargo = process.argv[2] ? path.resolve(process.argv[2]) : defaultCargo
  for (const name of listRuleEngineBins(cargo)) console.log(name)
}
