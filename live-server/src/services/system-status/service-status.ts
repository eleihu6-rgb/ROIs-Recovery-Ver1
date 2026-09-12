import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Repo root, found by walking up from the process cwd for the rust-bins
 * manifest. Avoids `import.meta` (this package builds to CommonJS) and works
 * whether live-server is launched from the repo root or from live-server/.
 */
function findRepoRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 6; i += 1) {
    if (fs.existsSync(path.join(dir, 'live-server', 'scripts', 'rust-bins.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

const ROOT = findRepoRoot()

export type ServiceState = 'up' | 'down' | 'warn' | 'off'

export interface ServiceDefinition {
  name: string
  port: number
  health?: string
  altPort?: number
  mandatory: boolean
  tcpOnly?: boolean
  note?: string
}

export interface ServiceEntry extends ServiceDefinition {
  state: ServiceState
  livePort: number
  detail: string
}

export interface RustBinsStatus {
  state: 'up' | 'down' | 'unknown'
  total: number
  missing: string[]
  detail: string
}

/**
 * The services the Altair Gantt needs — single source of truth in
 * `live-server/scripts/services.json`, shared with the root CLI
 * (`scripts/check-services.mjs`) and this endpoint. Mandatory = the app cannot
 * do its job without it; optional entries are reported but never fail the
 * overall status.
 */
export const SERVICES_MANIFEST = path.join(ROOT, 'live-server', 'scripts', 'services.json')

let cachedTable: ServiceDefinition[] | null = null

/** Loaded lazily so a missing/broken manifest degrades one endpoint, not the server. */
export function serviceTable(): ServiceDefinition[] {
  if (cachedTable) return cachedTable
  const parsed = JSON.parse(fs.readFileSync(SERVICES_MANIFEST, 'utf8'))
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`services manifest is empty or not an array: ${SERVICES_MANIFEST}`)
  }
  cachedTable = parsed as ServiceDefinition[]
  return cachedTable
}

const TIMEOUT_MS = 1500
const HOST = '127.0.0.1'

export function tcpOpen(port: number, host = HOST, timeoutMs = TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    let settled = false
    const finish = (open: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(timeoutMs)
    socket.on('connect', () => finish(true))
    socket.on('timeout', () => finish(false))
    socket.on('error', () => finish(false))
  })
}

async function httpStatus(port: number, healthPath: string, host = HOST): Promise<number | null> {
  try {
    const response = await fetch(`http://${host}:${port}${healthPath}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return response.status
  } catch {
    return null
  }
}

export async function checkServiceTable(host = HOST): Promise<ServiceEntry[]> {
  const entries: ServiceEntry[] = []
  for (const service of serviceTable()) {
    const ports = [service.port, ...(service.altPort ? [service.altPort] : [])]
    let livePort: number | null = null
    for (const port of ports) {
      if (await tcpOpen(port, host)) {
        livePort = port
        break
      }
    }
    if (livePort === null) {
      entries.push({ ...service, state: service.mandatory ? 'down' : 'off', livePort: service.port, detail: 'no listener' })
      continue
    }
    if (service.tcpOnly) {
      entries.push({ ...service, state: 'up', livePort, detail: 'tcp open' })
      continue
    }
    const status = await httpStatus(livePort, service.health ?? '/', host)
    if (status === null) {
      entries.push({ ...service, state: 'warn', livePort, detail: 'port open, no HTTP answer' })
      continue
    }
    if (status >= 200 && status < 400) {
      entries.push({ ...service, state: 'up', livePort, detail: `HTTP ${status}` })
      continue
    }
    entries.push({
      ...service,
      state: service.mandatory ? 'down' : 'warn',
      livePort,
      detail: `HTTP ${status}`,
    })
  }
  return entries
}

/** The Rust rule-engine release binaries the legality flow shells out to. */
export function checkRustBins(): RustBinsStatus {
  const manifestPath = path.join(ROOT, 'live-server', 'scripts', 'rust-bins.json')
  const releaseDir = path.join(ROOT, 'rule-engine-rs', 'target', 'release')
  let bins: string[]
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    if (!Array.isArray(parsed)) throw new Error('manifest is not an array')
    bins = parsed.filter((bin): bin is string => typeof bin === 'string')
  } catch (error) {
    return { state: 'unknown', total: 0, missing: [], detail: `manifest unreadable: ${(error as Error).message}` }
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
    state: missing.length === 0 ? 'up' : 'down',
    total: bins.length,
    missing,
    detail: missing.length === 0
      ? `${bins.length}/${bins.length} executables present`
      : `${missing.length}/${bins.length} missing (${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ', …' : ''})`,
  }
}
