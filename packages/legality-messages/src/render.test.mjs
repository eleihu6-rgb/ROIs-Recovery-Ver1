import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fillTemplate, loadMessages, renderRuleBody } from './render.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('fillTemplate replaces snake_case placeholders', () => {
  assert.equal(
    fillTemplate('Hello {crew_id} and {paired_crew_id}.', {
      crew_id: '1256',
      paired_crew_id: '1435',
    }),
    'Hello 1256 and 1435.',
  )
})

test('fillTemplate returns null when a placeholder is missing', () => {
  assert.equal(fillTemplate('X {a} {b}', { a: '1' }), null)
})

test('8072 / 7506 / 7509 golden bodies from messages.json', () => {
  const messages = loadMessages(path.join(root, 'messages.json'))
  assert.equal(
    renderRuleBody(messages, '8072', { qualified: '2', min: '0', max: '1' }),
    'Crew count out of range (Current: 2, Allowed: 0\u20131).',
  )
  assert.equal(
    renderRuleBody(messages, '7506', { day: '2024-06-15' }),
    'Multiple check-ins per day (2024-06-15).',
  )
  assert.equal(
    renderRuleBody(messages, '7509', {
      crew_id: '1256',
      paired_crew_id: '1435',
      flight_label: '822',
    }),
    'Crew 1256 and 1435 are co-paired on flight 822.',
  )
})

test('unknown rule returns null', () => {
  const messages = loadMessages(path.join(root, 'messages.json'))
  assert.equal(renderRuleBody(messages, '8002', { x: '1' }), null)
})
