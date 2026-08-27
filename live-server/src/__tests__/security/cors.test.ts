import { describe, it, expect, beforeAll } from 'vitest'

// env.ts (imported transitively by config/cors.ts) requires DATABASE_URL.
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'

// Loaded in beforeAll (after env is set) — avoids top-level await (CJS build).
let parseCorsOrigins: typeof import('../../config/cors.js')['parseCorsOrigins']
let resolveCorsOrigin: typeof import('../../config/cors.js')['resolveCorsOrigin']

beforeAll(async () => {
  const mod = await import('../../config/cors.js')
  parseCorsOrigins = mod.parseCorsOrigins
  resolveCorsOrigin = mod.resolveCorsOrigin
})

describe('parseCorsOrigins', () => {
  it('parses a comma-separated list, trimming and dropping empties', () => {
    expect(parseCorsOrigins('http://a.com, http://b.com ,, http://c.com')).toEqual([
      'http://a.com',
      'http://b.com',
      'http://c.com',
    ])
  })

  it('returns an empty array for a blank value', () => {
    expect(parseCorsOrigins('   ')).toEqual([])
  })
})

describe('resolveCorsOrigin', () => {
  it('allows localhost allowlist in dev', () => {
    expect(resolveCorsOrigin('http://localhost:5173', false)).toEqual(['http://localhost:5173'])
  })

  it('rejects wildcard "*" in production-like env', () => {
    expect(() => resolveCorsOrigin('*', true)).toThrow(/explicit allowlist/)
  })

  it('rejects reflect-all "true" in production-like env', () => {
    expect(() => resolveCorsOrigin('true', true)).toThrow(/explicit allowlist/)
  })

  it('rejects an empty allowlist in production-like env', () => {
    expect(() => resolveCorsOrigin('', true)).toThrow(/explicit allowlist/)
  })

  it('allows an explicit allowlist in production-like env', () => {
    expect(resolveCorsOrigin('https://app.example.com', true)).toEqual(['https://app.example.com'])
  })
})
