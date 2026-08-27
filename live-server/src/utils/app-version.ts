import fs from 'node:fs'
import path from 'node:path'

interface VersionState {
  backend: number
  frontend: number
  rule: number
  pbsBackend: number
  pbsFrontend: number
  gitCommit?: string
  gitCommitShort?: string
  deployedAt?: string
}

const DEFAULT_STATE: VersionState = {
  backend: 230,
  frontend: 439,
  rule: 40,
  pbsBackend: 41,
  pbsFrontend: 86,
}

const versionPath = path.resolve(process.cwd(), 'version.tmp')

const numberOrDefault = (value: unknown, fallback: number): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export const readVersionState = (): VersionState => {
  try {
    const raw = JSON.parse(fs.readFileSync(versionPath, 'utf8')) as Partial<VersionState>
    const state: VersionState = {
      backend: numberOrDefault(raw.backend, DEFAULT_STATE.backend),
      frontend: numberOrDefault(raw.frontend, DEFAULT_STATE.frontend),
      rule: numberOrDefault(raw.rule, DEFAULT_STATE.rule),
      pbsBackend: numberOrDefault(raw.pbsBackend, DEFAULT_STATE.pbsBackend),
      pbsFrontend: numberOrDefault(raw.pbsFrontend, DEFAULT_STATE.pbsFrontend),
    }
    if (typeof raw.gitCommit === 'string' && raw.gitCommit) state.gitCommit = raw.gitCommit
    if (typeof raw.gitCommitShort === 'string' && raw.gitCommitShort) state.gitCommitShort = raw.gitCommitShort
    if (typeof raw.deployedAt === 'string' && raw.deployedAt) state.deployedAt = raw.deployedAt
    return state
  } catch {
    return DEFAULT_STATE
  }
}

export const writeVersionState = (state: VersionState): VersionState => {
  fs.writeFileSync(versionPath, `${JSON.stringify(state, null, 2)}\n`)
  return state
}

export const bumpBackendVersion = (): VersionState => {
  const state = readVersionState()
  return writeVersionState({ ...state, backend: state.backend + 1 })
}

export const formatAppVersion = (state = readVersionState()): string =>
  `Ver:B${state.backend}/F${state.frontend}/R${state.rule}${state.gitCommitShort ? ` @${state.gitCommitShort}` : ''}`

export const formatPbsVersion = (state = readVersionState()): string =>
  `Ver:B${state.pbsBackend}/F${state.pbsFrontend}`
