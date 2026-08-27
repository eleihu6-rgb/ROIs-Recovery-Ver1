import type { ReactNode } from 'react'

export type ActiveSystemItem = 'scheduler' | 'queue-tasks' | 'grafana' | 'prometheus' | 'windmill' | 'data-quality' | 'user-mgmt' | 'profile-mgmt' | 'menu-mgmt' | 'pbs-user-mgmt' | 'dept-mgmt'

export interface SystemToolDefinition {
  item: ActiveSystemItem
  label: string
  description: string
  /** External URL rendered in an iframe. Set to empty string for component-based tools. */
  url: string
  /** Custom React component rendered instead of the iframe when provided. */
  component?: () => ReactNode
}

type SystemToolEnv = Partial<Record<
  'VITE_QUEUE_BOARD_URL' | 'VITE_GRAFANA_URL' | 'VITE_PROMETHEUS_URL' | 'VITE_WINDMILL_URL',
  string
>>

export const DEFAULT_SYSTEM_TOOL_URLS: Record<Exclude<ActiveSystemItem, 'scheduler' | 'data-quality' | 'user-mgmt' | 'profile-mgmt' | 'menu-mgmt' | 'pbs-user-mgmt' | 'dept-mgmt'>, string> = {
  'queue-tasks': '/altair/connector/admin/queues/',
  grafana: '/altair/monitor/grafana/',
  prometheus: '/altair/monitor/prometheus/',
  windmill: '/user/login',
}

const resolveUrl = (value: string | undefined, fallback: string): string => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

export const createSystemToolDefinitions = (env: SystemToolEnv): SystemToolDefinition[] => [
  {
    item: 'scheduler',
    label: 'Scheduler',
    description: 'Central scheduled job controls grouped by service.',
    url: '',
  },
  {
    item: 'queue-tasks',
    label: 'Queue Tasks',
    description: 'Connector queues, repeatable jobs and task execution state.',
    url: resolveUrl(env.VITE_QUEUE_BOARD_URL, DEFAULT_SYSTEM_TOOL_URLS['queue-tasks']),
  },
  {
    item: 'grafana',
    label: 'Grafana',
    description: 'Operational dashboards for metrics and logs.',
    url: resolveUrl(env.VITE_GRAFANA_URL, DEFAULT_SYSTEM_TOOL_URLS.grafana),
  },
  {
    item: 'prometheus',
    label: 'Prometheus',
    description: 'Metrics targets, queries and scrape health.',
    url: resolveUrl(env.VITE_PROMETHEUS_URL, DEFAULT_SYSTEM_TOOL_URLS.prometheus),
  },
  {
    item: 'windmill',
    label: 'Windmill',
    description: 'Scheduled scripts and operational automations.',
    url: resolveUrl(env.VITE_WINDMILL_URL, DEFAULT_SYSTEM_TOOL_URLS.windmill),
  },
]

export const createSystemToolDefinitionsWithCustom = (env: SystemToolEnv): SystemToolDefinition[] => {
  const base = createSystemToolDefinitions(env)
  return [
    ...base,
    {
      item: 'data-quality',
      label: 'Data Quality',
      description: 'Periodic checks for data integrity issues across live DB tables.',
      url: '',
    },
  ]
}

export const SYSTEM_TOOL_DEFINITIONS = createSystemToolDefinitionsWithCustom({
  VITE_QUEUE_BOARD_URL: import.meta.env.VITE_QUEUE_BOARD_URL,
  VITE_GRAFANA_URL: import.meta.env.VITE_GRAFANA_URL,
  VITE_PROMETHEUS_URL: import.meta.env.VITE_PROMETHEUS_URL,
  VITE_WINDMILL_URL: import.meta.env.VITE_WINDMILL_URL,
})
