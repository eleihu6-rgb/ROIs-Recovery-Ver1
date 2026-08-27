import { z } from 'zod'

export interface PaginationQuery {
  page: number
  pageSize: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  // 0 = no limit (return all); positive = page size
  pageSize: z.coerce.number().int().min(0).max(10000).default(20),
})

export const paginate = <T>(
  query: PaginationQuery,
  items: T[],
  total: number,
): PaginatedResult<T> => ({
  items,
  total,
  page: query.page,
  pageSize: query.pageSize,
  totalPages: query.pageSize > 0 ? Math.ceil(total / query.pageSize) : 1,
})
