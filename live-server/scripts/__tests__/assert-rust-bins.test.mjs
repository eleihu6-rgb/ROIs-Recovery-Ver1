import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertRustReleaseBins } from '../assert-rust-bins.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function loadDeployedAssert(root) {
  const scripts = path.join(root, 'scripts')
  fs.mkdirSync(scripts)
  const deployedScript = path.join(scripts, 'assert-rust-bins.mjs')
  fs.copyFileSync(path.resolve(__dirname, '../assert-rust-bins.mjs'), deployedScript)
  return import(pathToFileURL(deployedScript).href)
}

test('throws when a Cargo [[bin]] is missing from release dir', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assert-bins-'))
  const cargo = path.join(root, 'Cargo.toml')
  const release = path.join(root, 'release')
  fs.mkdirSync(release)
  fs.writeFileSync(
    cargo,
    `
[[bin]]
name = "check-7507"
[[bin]]
name = "ruletool"
`,
  )
  fs.writeFileSync(path.join(release, 'ruletool'), 'x')
  fs.chmodSync(path.join(release, 'ruletool'), 0o755)
  await assert.rejects(
    assertRustReleaseBins({
      manifestPath: path.join(root, 'missing-rust-bins.json'),
      cargoTomlPath: cargo,
      releaseDir: release,
    }),
    /check-7507/,
  )
})

test('passes from deployed JSON manifest without Cargo.toml', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assert-bins-'))
  const scripts = path.join(root, 'scripts')
  const release = path.join(root, 'release')
  fs.mkdirSync(release)
  const { assertRustReleaseBins: deployedAssert } = await loadDeployedAssert(root)
  fs.writeFileSync(path.join(scripts, 'rust-bins.json'), JSON.stringify(['check-7507', 'ruletool']))
  for (const bin of ['check-7507', 'ruletool']) {
    fs.writeFileSync(path.join(release, bin), 'x')
    fs.chmodSync(path.join(release, bin), 0o755)
  }

  assert.deepEqual(await deployedAssert({ releaseDir: release }), ['check-7507', 'ruletool'])
})

test('deployed JSON manifest reports a missing binary without Cargo.toml', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assert-bins-'))
  const scripts = path.join(root, 'scripts')
  const release = path.join(root, 'release')
  fs.mkdirSync(release)
  const { assertRustReleaseBins: deployedAssert } = await loadDeployedAssert(root)
  fs.writeFileSync(path.join(scripts, 'rust-bins.json'), JSON.stringify(['check-7507', 'ruletool']))
  fs.writeFileSync(path.join(release, 'ruletool'), 'x')
  fs.chmodSync(path.join(release, 'ruletool'), 0o755)

  await assert.rejects(deployedAssert({ releaseDir: release }), /check-7507/)
})

test('wraps manifest and Cargo load failures with deploy guidance', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assert-bins-'))
  const release = path.join(root, 'release')
  fs.mkdirSync(release)
  const { assertRustReleaseBins: deployedAssert } = await loadDeployedAssert(root)

  await assert.rejects(
    deployedAssert({ releaseDir: release }),
    /rust-bins startup gate.*deploy\/sit\/deploy\.sh.*generate-rust-bins-manifest/s,
  )
})
