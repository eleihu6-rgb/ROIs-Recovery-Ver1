import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_MANIFEST = path.join(__dirname, 'rust-bins.json')
const DEFAULT_CARGO = path.resolve(__dirname, '../../rule-engine-rs/Cargo.toml')
const DEFAULT_RELEASE = path.resolve(__dirname, '../../rule-engine-rs/target/release')
const DEFAULT_LIST_HELPER = path.resolve(__dirname, '../../deploy/common/list-rule-engine-bins.mjs')

function readManifest(manifestPath) {
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (!Array.isArray(parsed) || !parsed.length || parsed.some((bin) => typeof bin !== 'string' || !bin)) {
    throw new Error('expected a non-empty JSON array of bin name strings')
  }
  return parsed
}

async function loadRequiredBins(manifestPath, cargoTomlPath) {
  let manifestError
  if (fs.existsSync(manifestPath)) {
    try {
      return readManifest(manifestPath)
    } catch (error) {
      manifestError = error
    }
  } else {
    manifestError = new Error('file not found')
  }

  try {
    const { listRuleEngineBins } = await import(pathToFileURL(DEFAULT_LIST_HELPER).href)
    return listRuleEngineBins(cargoTomlPath)
  } catch (cargoError) {
    throw new Error(
      `rust-bins startup gate could not load required binary names. ` +
        `Manifest ${manifestPath}: ${manifestError.message}; Cargo fallback ${cargoTomlPath}: ${cargoError.message}. ` +
        'Run deploy/sit/deploy.sh --live (or the UAT live deploy) so rust-bins are pushed, ' +
        'or generate the manifest with node deploy/common/generate-rust-bins-manifest.mjs.',
    )
  }
}

export async function assertRustReleaseBins(options = {}) {
  const manifestPath = options.manifestPath ?? DEFAULT_MANIFEST
  const cargoTomlPath = options.cargoTomlPath ?? DEFAULT_CARGO
  const releaseDir = options.releaseDir ?? DEFAULT_RELEASE
  const bins = await loadRequiredBins(manifestPath, cargoTomlPath)
  const missing = []
  for (const bin of bins) {
    const binPath = path.join(releaseDir, bin)
    try {
      fs.accessSync(binPath, fs.constants.X_OK)
    } catch {
      missing.push(bin)
    }
  }
  if (missing.length) {
    throw new Error(
      `rule-engine-rs release binaries missing or not executable under ${releaseDir}: ${missing.join(', ')}. ` +
        'Deploy via deploy/sit/deploy.sh rust-bins, or: cargo build --release --manifest-path rule-engine-rs/Cargo.toml',
    )
  }
  return bins
}
