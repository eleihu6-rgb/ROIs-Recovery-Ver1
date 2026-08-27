import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const rosterWorker = readFileSync('src/workers/roster-inbound-worker.ts', 'utf8')
const groundWorker = readFileSync('src/workers/roster-ground-inbound-worker.ts', 'utf8')

describe('inbound import workers stamp source=IMP', () => {
  it('roster-inbound-worker inserts source IMP (not PA)', () => {
    expect(rosterWorker).toMatch(/source[^_a-z]/)
    expect(rosterWorker).toContain("'IMP'")
    expect(rosterWorker).not.toContain("'PA'")
  })
  it('roster-ground-inbound-worker inserts source IMP (not PA)', () => {
    expect(groundWorker).toContain("'IMP'")
    expect(groundWorker).not.toContain("'PA'")
  })
})
