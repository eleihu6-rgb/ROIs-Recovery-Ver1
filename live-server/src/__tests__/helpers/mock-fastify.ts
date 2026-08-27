import { vi } from 'vitest'

/**
 * Creates a mock Fastify instance with mocked db (Drizzle-like) and redis.
 * The db mock uses a chaining pattern where every query-builder method returns `this`,
 * and terminal methods (returning, then, execute) resolve with configurable data.
 */
export const createMockFastify = () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    $dynamic: vi.fn().mockReturnThis(),
    transaction: vi.fn(),
    // Allow array destructuring on the chain result by making it thenable
    then: vi.fn(),
  }

  const mockRedis = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
    setEx: vi.fn().mockResolvedValue('OK'),
    scan: vi.fn().mockResolvedValue({ cursor: 0, keys: [] }),
  }

  return {
    db: mockDb as any,
    redis: mockRedis as any,
    pgPool: {} as any,
    log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as any,
  }
}

/**
 * Helper: make a chainable db mock resolve to specific data.
 * Works for select chains that end without explicit .returning().
 * Usage: mockDbChainResult(fastify.db, [{ id: 1, name: 'test' }])
 */
export const mockDbChainResult = (db: any, data: any[]) => {
  // For select().from().where()... chains, the final awaited value comes from
  // making the chain object thenable.
  db.then.mockImplementation((resolve: any) => resolve(data))
}

/**
 * Helper: make db.returning() resolve to specific data.
 * Used for insert/update/delete chains.
 */
export const mockDbReturning = (db: any, data: any[]) => {
  db.returning.mockResolvedValue(data)
}
