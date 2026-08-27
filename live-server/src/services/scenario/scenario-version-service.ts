import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { scenario } from '../../models/scenario/scenario.js'
import { invalidate, invalidatePattern } from '../../utils/cache.js'
import { engineServerClient } from '../engine-server-client.js'
import { algorithmSnapshotFromPayload, scenarioParameterService } from './scenario-parameter-service.js'

export interface ScenarioVersionRecord {
  version: string
  taskId: string | null
  status: string | null
  archivePath: string | null
  filePath: string | null
  inputPath: string | null
  fileSize: number | null
  checksum: string | null
  executedBy: string | null
  executedAt: string | null
  fileTimestamp: string | null
  algorithmSnapshot?: Record<string, unknown>
  ruleSnapshot?: Record<string, unknown>
}

export interface ScenarioVersionView extends ScenarioVersionRecord {
  isCurrent: boolean
  hasDifferences: boolean
}

export interface ScenarioVersionDiff {
  algorithmParameters: Array<{ path: string; current: unknown; version: unknown }>
  ruleParameters: Array<{ path: string; current: unknown; version: unknown }>
}

export interface ScenarioFilePointer {
  filePaths?: unknown
  taskId?: string | null
  checksum?: string | null
}

const VERSION_RE = /^v(\d+)$/

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

const asStringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null

const asNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export const normalizeScenarioVersions = (value: unknown): ScenarioVersionRecord[] => {
  if (!Array.isArray(value)) return []
  const normalized: Array<ScenarioVersionRecord | null> = value.map((item): ScenarioVersionRecord | null => {
      const row = asRecord(item)
      const version = asStringOrNull(row.version)
      if (!version) return null
      return {
        version,
        taskId: asStringOrNull(row.taskId),
        status: asStringOrNull(row.status),
        archivePath: asStringOrNull(row.archivePath),
        filePath: asStringOrNull(row.filePath),
        inputPath: asStringOrNull(row.inputPath),
        fileSize: asNumberOrNull(row.fileSize),
        checksum: asStringOrNull(row.checksum),
        executedBy: asStringOrNull(row.executedBy),
        executedAt: asStringOrNull(row.executedAt),
        fileTimestamp: asStringOrNull(row.fileTimestamp),
        algorithmSnapshot: asRecord(row.algorithmSnapshot),
        ruleSnapshot: asRecord(row.ruleSnapshot),
      } satisfies ScenarioVersionRecord
    })
  return normalized.filter((item): item is ScenarioVersionRecord => item != null)
}

export const compareVersionsDesc = (a: Pick<ScenarioVersionRecord, 'version'>, b: Pick<ScenarioVersionRecord, 'version'>): number => {
  const an = Number(a.version.match(VERSION_RE)?.[1] ?? -1)
  const bn = Number(b.version.match(VERSION_RE)?.[1] ?? -1)
  if (an !== bn) return bn - an
  return b.version.localeCompare(a.version)
}

export const nextScenarioVersion = (versions: ScenarioVersionRecord[]): string => {
  let max = -1
  for (const item of versions) {
    const n = Number(item.version.match(VERSION_RE)?.[1] ?? -1)
    if (Number.isInteger(n) && n > max) max = n
  }
  return `v${max + 1}`
}

export const isCurrentVersion = (
  version: ScenarioVersionRecord,
  pointer: Pick<ScenarioFilePointer, 'taskId' | 'checksum'>,
): boolean => {
  if (version.taskId && pointer.taskId && version.taskId === pointer.taskId) return true
  return Boolean(version.checksum && pointer.checksum && version.checksum === pointer.checksum)
}

const makeTimestamp = (date = new Date()): string =>
  date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '').replace('T', '_')

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    )
  }
  return value
}

const stableJson = (value: unknown): string => {
  try {
    return JSON.stringify(stableValue(value))
  } catch {
    return String(value)
  }
}

const algorithmSnapshotByCode = (payload: Record<string, unknown>, division?: string | null): Record<string, unknown> => {
  const algorithm = asRecord(payload.algorithm)
  return algorithmSnapshotFromPayload(algorithm, division)
}

const diffRecordMaps = (
  current: Record<string, unknown>,
  version: Record<string, unknown>,
  prefix: string,
): Array<{ path: string; current: unknown; version: unknown }> => {
  const keys = [...new Set([...Object.keys(current), ...Object.keys(version)])].sort()
  return keys
    .filter((key) => stableJson(current[key]) !== stableJson(version[key]))
    .map((key) => ({ path: `${prefix}.${key}`, current: current[key] ?? null, version: version[key] ?? null }))
}

export const buildScenarioVersionRecord = (
  meta: {
    version: string
    taskId: string
    status: string
    filePath: string
    inputPath?: string | null
    archivePath?: string | null
    fileSize: number
    checksum: string
    executedBy?: string | null
    executedAt?: string | null
    fileTimestamp?: string | null
    algorithmSnapshot?: Record<string, unknown>
    ruleSnapshot?: Record<string, unknown>
  },
): ScenarioVersionRecord => {
  const filePath = meta.filePath
  const archivePath = meta.archivePath ?? filePath.replace(/\/output\.gz$/, '')
  const inputPath = meta.inputPath ?? `${archivePath}/input.gz`
  const executedAt = meta.executedAt ?? new Date().toISOString()
  return {
    version: meta.version,
    taskId: meta.taskId,
    status: meta.status,
    archivePath,
    filePath,
    inputPath,
    fileSize: meta.fileSize,
    checksum: meta.checksum,
    executedBy: meta.executedBy ?? null,
    executedAt,
    fileTimestamp: meta.fileTimestamp ?? makeTimestamp(new Date(executedAt)),
    algorithmSnapshot: meta.algorithmSnapshot ?? {
      metaPath: 'algorithm_meta.json',
      argsPath: 'algorithm_args.txt',
      floorRescueRulesPath: 'FLOOR_RESCUE_RULES.json',
    },
    ruleSnapshot: meta.ruleSnapshot ?? {
      path: 'ruleset_parameters.json',
    },
  }
}

export const scenarioVersionService = {
  versionsFor(row: ScenarioFilePointer): ScenarioVersionView[] {
    return normalizeScenarioVersions(row.filePaths)
      .sort(compareVersionsDesc)
      .map((version) => ({
        ...version,
        isCurrent: isCurrentVersion(version, row),
        hasDifferences: false,
      }))
  },

  nextVersionFor(row: ScenarioFilePointer): string {
    return nextScenarioVersion(normalizeScenarioVersions(row.filePaths))
  },

  async appendVersion(
    fastify: FastifyInstance,
    scenarioId: number,
    version: ScenarioVersionRecord,
  ): Promise<void> {
    await fastify.db
      .update(scenario)
      .set({
        filePaths: sql`coalesce(${scenario.filePaths}, '[]'::jsonb) || ${JSON.stringify([version])}::jsonb`,
      })
      .where(eq(scenario.id, scenarioId))
  },

  async clearAllVersionFiles(
    fastify: FastifyInstance,
    scenarioId: number,
    token: string,
    airline: string,
  ): Promise<void> {
    await engineServerClient.deleteScenarioVersionFiles({ scenarioId, token, airline })
    await fastify.db
      .update(scenario)
      .set({ filePaths: [] })
      .where(eq(scenario.id, scenarioId))
    await Promise.all([
      invalidate(fastify.redis, `scenario:${scenarioId}`),
      invalidatePattern(fastify.redis, `scenario:list:*`),
    ])
  },

  async removeVersion(
    fastify: FastifyInstance,
    scenarioId: number,
    version: string,
    token: string,
    airline: string,
  ): Promise<void> {
    const [row] = await fastify.db
      .select({ filePaths: scenario.filePaths, taskId: scenario.taskId, checksum: scenario.checksum })
      .from(scenario)
      .where(eq(scenario.id, scenarioId))
      .limit(1)
    if (!row) throw new Error('Scenario not found')
    const versions = normalizeScenarioVersions(row.filePaths)
    const target = versions.find((item) => item.version === version)
    if (!target) throw new Error('Version not found')
    if (isCurrentVersion(target, row)) throw new Error('Current version must be removed through Remove Optimization Result')
    await engineServerClient.deleteScenarioVersionFiles({ scenarioId, version, token, airline })
    await fastify.db
      .update(scenario)
      .set({ filePaths: versions.filter((item) => item.version !== version) })
      .where(eq(scenario.id, scenarioId))
    await Promise.all([
      invalidate(fastify.redis, `scenario:${scenarioId}`),
      invalidatePattern(fastify.redis, `scenario:list:*`),
    ])
  },

  async diffFor(
    fastify: FastifyInstance,
    scenarioId: number,
    version: string,
    token: string,
    airline: string,
  ): Promise<ScenarioVersionDiff> {
    const [rulesRaw] = await Promise.all([
      engineServerClient.fetchVersionFile(scenarioId, version, 'ruleset_parameters.json', token, airline),
    ])
    const snapshot = JSON.parse(rulesRaw.toString('utf-8')) as Record<string, unknown>
    const division = await scenarioParameterService.getDivision(fastify, scenarioId)
    const currentPayload = await scenarioParameterService.getEffectiveAlgorithmPayload(fastify, scenarioId)
    const currentAlgorithm = algorithmSnapshotFromPayload(currentPayload, division)
    const versionAlgorithm = algorithmSnapshotByCode(snapshot, division)
    const algorithmParameters = diffRecordMaps(currentAlgorithm, versionAlgorithm, 'algorithm')

    let currentRules: Array<{ ruleId: string; paramJson: unknown }> = []
    if (fastify.pgPool) {
      const result = await fastify.pgPool.query<{ rule_id: string; param_json: unknown }>(
        `select rs.rule_id::text, r.param_json
           from rule_set rs
           join rule r on r.rule_id = rs.rule_id
          where rs.workset_id = $1
          order by rs.id`,
        [Number((await scenarioServiceRulesetId(fastify, scenarioId)) ?? 103)],
      )
      currentRules = result.rows.map((row) => ({ ruleId: row.rule_id, paramJson: row.param_json }))
    }
    const archivedRules = Array.isArray(asRecord(snapshot).rules)
      ? asRecord(snapshot).rules as Array<Record<string, unknown>>
      : []
    const currentRuleMap = Object.fromEntries(currentRules.map((rule) => [rule.ruleId, rule.paramJson]))
    const versionRuleMap = Object.fromEntries(
      archivedRules.map((rule) => [String(rule.ruleId ?? ''), rule.paramJson]),
    )
    const ruleParameters = diffRecordMaps(currentRuleMap, versionRuleMap, 'rules')
    return { algorithmParameters, ruleParameters }
  },
}

const scenarioServiceRulesetId = async (fastify: FastifyInstance, scenarioId: number): Promise<number | null> => {
  const result = await fastify.pgPool.query<{ ruleset_id: string | number }>(
    'select ruleset_id from scenario where id = $1',
    [scenarioId],
  )
  return result.rows[0]?.ruleset_id == null ? null : Number(result.rows[0].ruleset_id)
}
