/**
 * Test Data Generator.
 *
 * Provides deterministic test data for seeding and assertions.
 * All data is generated without external dependencies.
 */

/** Generate a unique test identifier */
export function testId(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

/** Generate a random date within a range */
export function randomDate(start: Date, end: Date): Date {
  const ms = start.getTime() + Math.random() * (end.getTime() - start.getTime())
  return new Date(ms)
}

/** Generate a date string in YYYY-MM-DD format */
export function dateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

/** Generate a datetime string in ISO format */
export function isoStr(d: Date): string {
  return d.toISOString()
}

/** Test crew data generator */
export function createTestCrew(overrides: Partial<TestCrew> = {}): TestCrew {
  const suffix = Math.random().toString(36).substring(2, 6)
  return {
    userCode: `TEST${suffix}`,
    userName: `Test Crew ${suffix}`,
    rank: 'CA',
    base: 'YVR',
    status: 'active',
    ...overrides,
  }
}

export interface TestCrew {
  userCode: string
  userName: string
  rank: string
  base: string
  status: string
}

/** Test pairing data generator */
export function createTestPairing(overrides: Partial<TestPairing> = {}): TestPairing {
  const id = Math.floor(Math.random() * 90000) + 10000
  const startDate = new Date()
  startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 30))
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + Math.floor(Math.random() * 3) + 1)

  return {
    id,
    pairingLabel: `P-${id}`,
    fleet: 'B38M',
    assignment: 'DOM',
    schStrDtUtc: isoStr(startDate),
    schEndDtUtc: isoStr(endDate),
    isFull: true,
    composition: [],
    ...overrides,
  }
}

export interface TestPairing {
  id: number
  pairingLabel: string
  fleet: string
  assignment: string
  schStrDtUtc: string
  schEndDtUtc: string
  isFull: boolean
  composition: Array<{ rank: string; plan: number; fill: number }>
}

/** Test login credentials for known test accounts */
export const TEST_ACCOUNTS = {
  admin: { userCode: 'admin', password: '123456' },
  user01: { userCode: 'user01', password: '123456' },
  user02: { userCode: 'user02', password: '123456' },
  // Demo planner users (created via live-server/scripts/create-demo-users.cjs)
  jen: { userCode: 'Jen', password: 'Our2027' },
  mat: { userCode: 'Mat', password: 'Our2027' },
  ryan: { userCode: 'Ryan', password: 'Our2027' },
  qiang: { userCode: 'Qiang', password: 'Our2027' },
  sameer: { userCode: 'Sameer', password: 'Our2027' },
} as const
