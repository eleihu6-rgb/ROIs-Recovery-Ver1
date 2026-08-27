import { useEffect, useRef } from 'react'
import { useShellStore } from '@/stores/shell-store'
import type { ActiveModule, KnownModule } from '@/stores/shell-store'

export const URL_BASE = '/altair' as const

const STATIC_PATH_TO_MODULE: Record<string, KnownModule> = {
  live: 'live',
  scenario: 'scenario',
  data: 'data',
  legality: 'legality',
  system: 'system',
  regression: 'regression',
  pbs: 'pbs',
  dev: 'dev',
  help: 'help',
  release: 'release',
}

const STATIC_MODULE_TO_PATH: Partial<Record<KnownModule, string>> = {
  dashboard: `${URL_BASE}/`,
  live: `${URL_BASE}/live`,
  scenario: `${URL_BASE}/scenario`,
  data: `${URL_BASE}/data`,
  legality: `${URL_BASE}/legality`,
  system: `${URL_BASE}/system`,
  regression: `${URL_BASE}/regression`,
  pbs: `${URL_BASE}/pbs`,
  dev: `${URL_BASE}/dev`,
  help: `${URL_BASE}/help`,
  release: `${URL_BASE}/release`,
}

const positiveInteger = (value: string): boolean => /^[1-9]\d*$/.test(value)

export const pathToModule = (pathname: string): ActiveModule => {
  if (pathname !== URL_BASE && !pathname.startsWith(`${URL_BASE}/`)) {
    return 'dashboard'
  }

  const suffix = pathname.slice(URL_BASE.length).replace(/^\/+|\/+$/g, '')
  if (!suffix) return 'dashboard'

  const parts = suffix.split('/')
  if (parts[0] === 'scenario' && parts.length === 2 && positiveInteger(parts[1])) {
    return `scenario-gantt:${parts[1]}`
  }
  if (parts[0] === 'scenario' && parts.length === 4 && parts[2] === 'version' && positiveInteger(parts[1]) && /^v\d+$/.test(parts[3])) {
    return `scenario-gantt:${parts[1]}@${parts[3]}`
  }

  if (parts.length === 1 && parts[0] in STATIC_PATH_TO_MODULE) {
    return STATIC_PATH_TO_MODULE[parts[0]]
  }

  return 'dashboard'
}

export const moduleToPath = (module: ActiveModule): string => {
  if (module.startsWith('scenario-gantt:')) {
    const raw = module.slice('scenario-gantt:'.length)
    const [id, version] = raw.split('@', 2)
    if (!positiveInteger(id)) return `${URL_BASE}/`
    return version && /^v\d+$/.test(version)
      ? `${URL_BASE}/scenario/${id}/version/${version}`
      : `${URL_BASE}/scenario/${id}`
  }

  return STATIC_MODULE_TO_PATH[module as KnownModule] ?? `${URL_BASE}/`
}

export const useUrlSync = (): void => {
  const activeModule = useShellStore((s) => s.activeModule)
  const setModule = useShellStore((s) => s.setModule)
  const firstModuleEffectRef = useRef(true)

  useEffect(() => {
    const applyCurrentPath = (): void => {
      const nextModule = pathToModule(window.location.pathname)
      setModule(nextModule)
    }

    applyCurrentPath()
    window.addEventListener('popstate', applyCurrentPath)
    return () => window.removeEventListener('popstate', applyCurrentPath)
  }, [setModule])

  useEffect(() => {
    if (firstModuleEffectRef.current) {
      firstModuleEffectRef.current = false
      return
    }
    const nextPath = moduleToPath(activeModule)
    if (window.location.pathname === nextPath) return
    window.history.pushState(null, '', nextPath)
  }, [activeModule])
}
