type ScenarioRunHealthOverall = 'healthy' | 'unhealthy'
type ScenarioRunServiceStatus = 'healthy' | 'unhealthy' | 'unreachable'
type ScenarioRunServiceKey = 'engine' | 'pbs'

interface ScenarioRunServiceHealth {
  key: ScenarioRunServiceKey
  label: string
  healthy: boolean
  status: ScenarioRunServiceStatus
  detail: string
  latencyMs: number | null
}

interface ScenarioRunHealth {
  overall: ScenarioRunHealthOverall
  checkedAt: string
  services: ScenarioRunServiceHealth[]
}

import { env } from '../../config/env.js'

const SERVICES: Array<{ key: ScenarioRunServiceKey; label: string; url: string }> = [
  { key: 'engine', label: 'Engine Server', url: `${env.ENGINE_SERVER_URL}/health` },
  { key: 'pbs', label: 'PBS Server', url: `${env.PBS_SERVER_URL}/api/health` },
]

const HEALTH_CACHE_MS = 10_000
let cachedHealth: { expiresAt: number; value: ScenarioRunHealth } | null = null
let inFlightHealth: Promise<ScenarioRunHealth> | null = null

async function checkService(
  key: ScenarioRunServiceKey,
  label: string,
  url: string,
): Promise<ScenarioRunServiceHealth> {
  const start = Date.now()
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(3000) })
    const latencyMs = Date.now() - start
    const healthy = resp.ok
    return {
      key,
      label,
      healthy,
      status: healthy ? 'healthy' : 'unhealthy',
      detail: healthy ? 'ok' : `HTTP ${resp.status}`,
      latencyMs,
    }
  } catch (err) {
    return {
      key,
      label,
      healthy: false,
      status: 'unreachable',
      detail: err instanceof Error ? err.message : 'unreachable',
      latencyMs: null,
    }
  }
}

export async function getScenarioRunHealth(): Promise<ScenarioRunHealth> {
  if (cachedHealth && cachedHealth.expiresAt > Date.now()) return cachedHealth.value
  if (inFlightHealth) return inFlightHealth

  inFlightHealth = (async () => {
    const services = await Promise.all(
      SERVICES.map((s) => checkService(s.key, s.label, s.url)),
    )
    const overall: ScenarioRunHealthOverall = services.every((s) => s.healthy) ? 'healthy' : 'unhealthy'
    const value: ScenarioRunHealth = {
      overall,
      checkedAt: new Date().toISOString(),
      services,
    }
    cachedHealth = { expiresAt: Date.now() + HEALTH_CACHE_MS, value }
    return value
  })()
  try {
    return await inFlightHealth
  } finally {
    inFlightHealth = null
  }
}
