import assert from 'node:assert/strict'
import test from 'node:test'
import { publishViolationsUpdated, violationsUpdatedChannel } from '../live-legality-publish.mjs'

test('violationsUpdatedChannel matches WS pSubscribe layout', () => {
  assert.equal(
    violationsUpdatedChannel('f8_sit_live', '103'),
    'violations:f8_sit_live:103',
  )
})

test('publishViolationsUpdated publishes eventId on the channel', async () => {
  const calls = []
  const redis = {
    publish: async (channel, message) => {
      calls.push({ channel, message })
      return 1
    },
  }
  await publishViolationsUpdated(redis, 'f8_sit_live', '103', 1_725_000_000_000)
  assert.deepEqual(calls, [{
    channel: 'violations:f8_sit_live:103',
    message: '1725000000000',
  }])
})
