import { describe, expect, it } from 'vitest'

import { createSystemToolDefinitions, DEFAULT_SYSTEM_TOOL_URLS } from '@/config/system-tools'

describe('system tool definitions', () => {
  it('uses deployment-safe same-origin defaults', () => {
    const tools = createSystemToolDefinitions({})

    const externalTools = tools.filter((tool) => tool.url)
    expect(Object.fromEntries(externalTools.map((tool) => [tool.item, tool.url]))).toEqual(DEFAULT_SYSTEM_TOOL_URLS)
    expect(tools.find((tool) => tool.item === 'scheduler')?.url).toBe('')
  })

  it('allows Vite environment overrides', () => {
    const tools = createSystemToolDefinitions({
      VITE_QUEUE_BOARD_URL: '/custom/queues/',
      VITE_GRAFANA_URL: 'https://ops.example.com/grafana/',
    })

    expect(tools.find((tool) => tool.item === 'queue-tasks')?.url).toBe('/custom/queues/')
    expect(tools.find((tool) => tool.item === 'grafana')?.url).toBe('https://ops.example.com/grafana/')
    expect(tools.find((tool) => tool.item === 'prometheus')?.url).toBe('/altair/monitor/prometheus/')
  })
})
