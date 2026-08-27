import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const versionFile = path.join(repoRoot, 'live-server', 'version.tmp')

const DEFAULT_STATE = {
  backend: 230,
  frontend: 439,
  rule: 40,
  pbsBackend: 41,
  pbsFrontend: 86,
}

const normalizeState = (value) => {
  const source = value && typeof value === 'object' ? value : {}
  const state = {
    backend: Number.isFinite(Number(source.backend)) ? Number(source.backend) : DEFAULT_STATE.backend,
    frontend: Number.isFinite(Number(source.frontend)) ? Number(source.frontend) : DEFAULT_STATE.frontend,
    rule: Number.isFinite(Number(source.rule)) ? Number(source.rule) : DEFAULT_STATE.rule,
    pbsBackend: Number.isFinite(Number(source.pbsBackend)) ? Number(source.pbsBackend) : DEFAULT_STATE.pbsBackend,
    pbsFrontend: Number.isFinite(Number(source.pbsFrontend)) ? Number(source.pbsFrontend) : DEFAULT_STATE.pbsFrontend,
  }
  if (typeof source.gitCommit === 'string' && source.gitCommit) state.gitCommit = source.gitCommit
  if (typeof source.gitCommitShort === 'string' && source.gitCommitShort) state.gitCommitShort = source.gitCommitShort
  if (typeof source.deployedAt === 'string' && source.deployedAt) state.deployedAt = source.deployedAt
  return state
}

export const readVersionState = () => {
  try {
    const raw = fs.readFileSync(versionFile, 'utf8')
    return normalizeState(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export const writeVersionState = (state) => {
  const next = normalizeState(state)
  fs.mkdirSync(path.dirname(versionFile), { recursive: true })
  fs.writeFileSync(versionFile, `${JSON.stringify(next, null, 2)}\n`)
  return next
}

export const bumpVersionState = (moduleName) => {
  const state = readVersionState()
  const next = { ...state }

  switch (moduleName) {
    case 'backend':
    case 'live-server':
    case 'connector-server':
      next.backend += 1
      break
    case 'frontend':
    case 'gantt':
    case 'vite':
      next.frontend += 1
      break
    case 'rule':
    case 'rule-engine':
      next.rule += 1
      break
    case 'pbs-backend':
    case 'pbs-server':
      next.pbsBackend += 1
      break
    case 'pbs-frontend':
    case 'pbs-portal':
      next.pbsFrontend += 1
      break
    default:
      throw new Error(`Unknown version module: ${moduleName}`)
  }

  return writeVersionState(next)
}

export const formatAppVersion = (state = readVersionState()) =>
  `Ver:B${state.backend}/F${state.frontend}/R${state.rule}${state.gitCommitShort ? ` @${state.gitCommitShort}` : ''}`

export const formatPbsVersion = (state = readVersionState()) =>
  `Ver:B${state.pbsBackend}/F${state.pbsFrontend}`

const print = (state) => {
  console.log(formatAppVersion(state))
  console.log(formatPbsVersion(state))
}

const command = process.argv[2]
if (command === 'init') {
  print(writeVersionState(readVersionState()))
} else if (command === 'read') {
  print(writeVersionState(readVersionState()))
} else if (command === 'bump') {
  print(bumpVersionState(process.argv[3]))
}
