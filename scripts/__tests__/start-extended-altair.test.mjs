import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createServiceSpecs,
  getRuleEngineMode,
  parseArgs,
} from '../start-extended-altair.mjs'

test('parseArgs enables dry run and check-only flags', () => {
  const parsed = parseArgs(['--dry-run', '--check-only'])

  assert.equal(parsed.dryRun, true)
  assert.equal(parsed.checkOnly, true)
})

test('createServiceSpecs returns the extended altair services in order', () => {
  const services = createServiceSpecs('/repo')

  // ai-server is excluded: it is owned by the com.rois.ai-server LaunchAgent
  assert.deepEqual(
    services.map((service) => service.name),
    ['gantt', 'live-server', 'altair-server'],
  )
  assert.equal(services[0].cwd, '/repo/gantt')
  assert.deepEqual(services[0].args, ['run', 'dev'])
  assert.equal(services[1].cwd, '/repo/live-server')
  assert.equal(services[2].cwd, '/repo/altair-server')
})

test('getRuleEngineMode requires explicit command when port 3001 is not already up', async () => {
  const mode = await getRuleEngineMode({
    env: {},
    isPortOpen: async () => false,
  })

  assert.deepEqual(mode, {
    kind: 'missing',
    message:
      'rule-engine:3001 is not listening and RULE_ENGINE_START_CMD is not set.',
  })
})

test('getRuleEngineMode accepts existing rule-engine listener', async () => {
  const mode = await getRuleEngineMode({
    env: {},
    isPortOpen: async () => true,
  })

  assert.deepEqual(mode, {
    kind: 'listening',
    port: 3001,
  })
})

test('getRuleEngineMode uses explicit RULE_ENGINE_START_CMD when provided', async () => {
  const mode = await getRuleEngineMode({
    env: { RULE_ENGINE_START_CMD: 'python /tmp/rule-engine.py' },
    isPortOpen: async () => false,
  })

  assert.equal(mode.kind, 'spawn')
  assert.equal(mode.command, 'python /tmp/rule-engine.py')
})
