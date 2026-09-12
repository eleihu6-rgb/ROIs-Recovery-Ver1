#!/usr/bin/env node
// Mandatory-service health check for the Altair dev stack.
//
// Answers "which of the services the Gantt needs are actually up?" in one
// command, without depending on any of them being up (so it still reports the
// truth when the whole stack is down). Checks three layers per service:
//   1. the TCP port is listening;
//   2. the HTTP health endpoint answers 2xx (when one is known);
//   3. the Rust rule-engine release binaries exist and are executable.
//
// Usage:
//   node scripts/check-services.mjs            # human table, exit 1 on failure
//   node scripts/check-services.mjs --json     # machine-readable
//   node scripts/check-services.mjs --host 127.0.0.1

import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Single source of truth, shared with the live-server endpoint
 * (live-server/src/services/system-status → GET /api/system/services).
 */
const SERVICES_MANIFEST = path.join(ROOT, 'live-server', 'scripts', 'services.json')

function loadServices() {
  const parsed = JSON.parse(fs.readFileSync(SERVICES_MANIFEST, 'utf8'))
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`services manifest is empty or not an array: ${SERVICES_MANIFEST}`)
  }
  return parsed
}

const SERVICES = loadServices()

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const hostArg = args.indexOf('--host')
const HOST = hostArg >= 0 ? args[hostArg + 1] : '127.0.0.1'
const TIMEOUT_MS = 2500

const ok = (s) => `\u2713 ${s}` // ✓
const bad = (s) => `\u2717 ${s}` // ✗

function tcpOpen(port, host = HOST) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    let done = false
    const finish = (open) => {
      if (done) return
      done = true
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(TIMEOUT_MS)
    socket.on('connect', () => finish(true))
    socket.on('timeout', () => finish(false))
    socket.on('error', () => finish(false))
  })
}

async function httpStatus(port, healthPath, host = HOST) {
  try {
    const res = await fetch(`http://${host}:${port}${healthPath}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return res.status
  } catch {
    return null
  }
}

async function checkService(service) {
  const ports = [service.port, ...(service.altPort ? [service.altPort] : [])]
  let livePort = null
  for (const port of ports) {
    if (await tcpOpen(port)) {
      livePort = port
      break
    }
  }
  if (livePort === null) {
    return { ...service, status: service.mandatory ? 'down' : 'off', port: service.port, detail: 'no listener' }
  }
  if (service.tcpOnly) {
    return { ...service, status: 'up', port: livePort, detail: 'tcp open' }
  }
  const status = await httpStatus(livePort, service.health ?? '/')
  if (status === null) {
    return { ...service, status: 'warn', port: livePort, detail: 'port open, no HTTP answer' }
  }
  if (status >= 200 && status < 400) {
    return { ...service, status: 'up', port: livePort, detail: `HTTP ${status}` }
  }
  return {
    ...service,
    status: service.mandatory ? 'down' : 'warn',
    port: livePort,
    detail: `HTTP ${status}`,
  }
}

function checkRustBins() {
  const manifestPath = path.join(ROOT, 'live-server', 'scripts', 'rust-bins.json')
  const releaseDir = path.join(ROOT, 'rule-engine-rs', 'target', 'release')
  let bins = []
  try {
    bins = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    return { status: 'unknown', missing: [], total: 0, detail: `manifest unreadable: ${error.message}` }
  }
  const missing = bins.filter((bin) => {
    try {
      fs.accessSync(path.join(releaseDir, bin), fs.constants.X_OK)
      return false
    } catch {
      return true
    }
  })
  return {
    status: missing.length === 0 ? 'up' : 'down',
    missing,
    total: bins.length,
    detail: missing.length === 0
      ? `${bins.length}/${bins.length} executables present`
      : `${missing.length}/${bins.length} missing (${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ', …' : ''})`,
  }
}

function checkLiveServerDetail() {
  // Best-effort: only meaningful when live-server is up.
  return fetch(`http://${HOST}:3000/api/health/detail`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    .then(async (res) => ({ httpStatus: res.status, body: await res.json().catch(() => null) }))
    .catch(() => null)
}

async function main() {
  const services = []
  for (const service of SERVICES) {
    services.push(await checkService(service))
  }
  const rustBins = checkRustBins()
  const liveDetail = await checkLiveServerDetail()
  const checks = liveDetail?.body?.data?.checks ?? null

  const failed = [
    ...services.filter((s) => s.status === 'down').map((s) => s.name),
    ...(rustBins.status === 'down' ? ['rust-bins'] : []),
    ...(checks && Object.values(checks).some((v) => v !== 'ok') ? ['database/redis'] : []),
  ]
  const okAll = failed.length === 0

  if (asJson) {
    console.log(JSON.stringify({ ok: okAll, host: HOST, services, rustBins, liveServerChecks: checks }, null, 2))
    process.exit(okAll ? 0 : 1)
  }

  console.log(`\nMandatory service status (host ${HOST})`)
  console.log('─'.repeat(64))
  const label = (s) => `${s.mandatory ? '' : '[optional] '}${s.name}:${s.port}`
  for (const s of services) {
    const mark = s.status === 'up' ? ok('UP  ') : s.status === 'warn' ? '! ' + s.status.toUpperCase() : bad(s.status.toUpperCase())
    console.log(`${mark.padEnd(10)} ${label(s).padEnd(28)} ${s.detail}`)
  }
  const rustMark = rustBins.status === 'up' ? ok('UP  ') : rustBins.status === 'down' ? bad('DOWN') : '?  '
  console.log(`${rustMark.padEnd(10)} ${'rust release bins'.padEnd(28)} ${rustBins.detail}`)
  if (checks) {
    for (const [name, value] of Object.entries(checks)) {
      console.log(`${(value === 'ok' ? ok('UP  ') : bad('DOWN')).padEnd(10)} ${('live-server ' + name).padEnd(28)} ${value}`)
    }
  }
  console.log('─'.repeat(64))
  console.log(okAll
    ? ok('All mandatory services are up.')
    : bad(`Down: ${failed.join(', ')}`))
  process.exit(okAll ? 0 : 1)
}

main().catch((error) => {
  console.error(`check-services failed: ${error?.stack ?? error}`)
  process.exit(2)
})
