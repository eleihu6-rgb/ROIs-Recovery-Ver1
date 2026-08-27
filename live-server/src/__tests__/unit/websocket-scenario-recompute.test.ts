import { describe, expect, it, vi } from 'vitest'

vi.mock('../../config/index.js', () => ({
  env: { JWT_SECRET: 'x'.repeat(40) },
}))

import { scenarioRecomputeChannelParts } from '../../plugins/websocket.js'

describe('scenarioRecomputeChannelParts', () => {
  it('parses a completion channel into airline schema + scenarioId', () => {
    expect(scenarioRecomputeChannelParts('scenario-recompute:f8:623')).toEqual({ schema: 'f8', scenarioId: 623 })
  })

  it('rejects malformed channels', () => {
    expect(scenarioRecomputeChannelParts('scenario-recompute:f8')).toBeNull()
    expect(scenarioRecomputeChannelParts('scenario-recompute::623')).toBeNull()
    expect(scenarioRecomputeChannelParts('scenario-recompute:f8:abc')).toBeNull()
    expect(scenarioRecomputeChannelParts('scenario-recompute:f8:0')).toBeNull()
    expect(scenarioRecomputeChannelParts('other:f8:623')).toBeNull()
  })
})
