import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listRuleEngineBins } from './list-rule-engine-bins.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_CARGO = path.resolve(__dirname, '../../rule-engine-rs/Cargo.toml')
const DEFAULT_OUTPUT = path.resolve(__dirname, '../../live-server/scripts/rust-bins.json')

export function generateRustBinsManifest(cargoTomlPath = DEFAULT_CARGO, outputPath = DEFAULT_OUTPUT) {
  try {
    const bins = listRuleEngineBins(cargoTomlPath)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, `${JSON.stringify(bins, null, 2)}\n`)
    return bins
  } catch (error) {
    throw new Error(
      `rust-bins manifest generation failed for ${cargoTomlPath}: ${error.message}. ` +
        'Ensure rule-engine-rs/Cargo.toml is present, then rerun this generator or the SIT/UAT live deploy.',
    )
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  generateRustBinsManifest(
    process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_CARGO,
    process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_OUTPUT,
  )
}
