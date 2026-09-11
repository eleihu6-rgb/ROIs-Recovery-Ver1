/**
 * Maps PostgreSQL error codes (https://www.postgresql.org/docs/current/errcodes-appendix.html)
 * to a stable { status, category, message, hint } shape suitable for client rendering.
 *
 * Goals:
 * - Never leak raw database error text (table/column names, query snippets, stack traces)
 * - Give users actionable hints, not "request failed"
 * - Preserve enough structure (status + category) for the UI to branch
 *   (e.g. retry vs. show-validation vs. show-conflict vs. show-permission)
 *
 * The shape is consumed by the frontend http-client wrapper, so adding a new
 * key here only requires the client to be updated once.
 */

export interface PgErrorPayload {
  /** HTTP status to surface to the client (default 500) */
  status: number
  /** Stable, machine-readable category for client branching */
  category:
    | 'validation'
    | 'unauthorized'
    | 'forbidden'
    | 'not_found'
    | 'conflict'
    | 'payload_too_large'
    | 'unprocessable'
    | 'rate_limited'
    | 'unavailable'
    | 'internal'
  /** Human-readable summary, safe to show to the user */
  message: string
  /** Optional next-step hint ("reload and retry", "remove from set X first") */
  hint?: string
  /** PG SQLSTATE, when applicable — useful for debugging but not user-facing */
  sqlState?: string
}

interface PgErrorLike {
  code?: string
  message?: string
  detail?: string
  constraint?: string
  table?: string
  column?: string
}

const getPgError = (err: unknown): PgErrorLike | null => {
  if (!err || typeof err !== 'object') return null
  const e = err as PgErrorLike
  // pg errors expose a `code` (SQLSTATE). node-postgres errors without a code
  // are usually network / driver / programming errors — handled below.
  if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) return e
  return null
}

const statusToCategory = (status: number): PgErrorPayload['category'] => {
  if (status === 400) return 'validation'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 413) return 'payload_too_large'
  if (status === 422) return 'unprocessable'
  if (status === 429) return 'rate_limited'
  if (status === 503) return 'unavailable'
  return 'internal'
}

/**
 * Map a thrown error to a client-safe payload. Falls back to a generic
 * internal-error response if no better category matches.
 */
export const mapPgError = (err: unknown): PgErrorPayload => {
  // 1) Already-mapped domain errors keep their declared status/message
  if (err && typeof err === 'object' && 'statusCode' in err && 'message' in err) {
    const e = err as { statusCode: number; message: string }
    if (typeof e.statusCode === 'number' && typeof e.message === 'string') {
      return {
        status: e.statusCode,
        category: statusToCategory(e.statusCode),
        message: e.message,
      }
    }
  }

  // 2) PG SQLSTATE codes
  const pg = getPgError(err)
  if (pg && pg.code) {
    const mapped = PG_CODE_MAP[pg.code]
    if (mapped) {
      const { status, category, message, hint } = mapped(pg)
      return { status, category, message, hint, sqlState: pg.code }
    }
    // Unknown SQLSTATE — still a PG-side error, surface sqlState for debugging
    return {
      status: 500,
      category: 'internal',
      message: 'The database returned an error that this client does not recognize.',
      hint: 'If this persists, contact your administrator.',
      sqlState: pg.code,
    }
  }

  // 3) Network / pool / driver errors (no SQLSTATE)
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: string }).code
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT') {
      return {
        status: 503,
        category: 'unavailable',
        message: 'The database is unreachable. Check that PostgreSQL is running and the connection settings are correct.',
        hint: 'Verify DATABASE_URL, then retry.',
      }
    }
    if (code === '57P03' || /cannot connect|connection terminated|pool/i.test((err as { message?: string }).message ?? '')) {
      return {
        status: 503,
        category: 'unavailable',
        message: 'Lost connection to the database mid-request. Please retry.',
        hint: 'If this keeps happening, the database may be overloaded.',
      }
    }
  }

  // 4) Fallback — generic 500, but with a clear category so the UI can show
  //    a "something went wrong" panel rather than a misleading "validation" toast.
  return {
    status: 500,
    category: 'internal',
    message: 'An unexpected error occurred while processing your request.',
    hint: 'If the problem persists, contact your administrator with the timestamp.',
  }
}

/**
 * SQLSTATE -> payload.
 * Each entry takes the parsed pg error and returns the bits we want to surface.
 * Never return the raw `pg.message` / `pg.detail` / `pg.constraint` etc. —
 * those leak schema details. If you need to reference them, log them server-side.
 */
const PG_CODE_MAP: Record<string, (pg: PgErrorLike) => Omit<PgErrorPayload, 'sqlState'>> = {
  // Class 23 — Integrity Constraint Violation
  '23503': (pg) => ({
    status: 409,
    category: 'conflict',
    message: 'This record is referenced by other data and cannot be deleted or changed.',
    hint: pg.table
      ? `Remove the references to "${pg.table}" first, then retry.`
      : 'Remove the references first, then retry.',
  }),
  '23505': (_pg) => ({
    status: 409,
    category: 'conflict',
    message: 'A record with the same key already exists.',
    hint: 'Choose a different name or identifier.',
  }),
  '23502': (pg) => ({
    status: 400,
    category: 'validation',
    message: pg.column
      ? `The field "${pg.column}" is required but was not provided.`
      : 'A required field was not provided.',
  }),
  '23514': (_pg) => ({
    status: 400,
    category: 'validation',
    message: 'One of the field values violates a database constraint.',
    hint: 'Check the field ranges (e.g. positive numbers, valid enums) and retry.',
  }),
  '23504': (_pg) => ({
    status: 409,
    category: 'conflict',
    message: 'A required parent record is missing.',
    hint: 'Reload the page; the parent record may have been removed.',
  }),

  // Class 22 — Data Exception
  '22P02': (_pg) => ({
    status: 400,
    category: 'validation',
    message: 'One of the inputs is not in the expected format (e.g. number expected, got text).',
  }),
  '22001': (_pg) => ({
    status: 400,
    category: 'validation',
    message: 'One of the text fields is longer than the column allows.',
  }),
  '22003': (_pg) => ({
    status: 400,
    category: 'validation',
    message: 'A numeric value is outside the allowed range.',
  }),
  '22P03': (_pg) => ({
    status: 400,
    category: 'validation',
    message: 'The provided value is not a valid representation (bad UUID/JSON syntax, etc.).',
  }),

  // Class 40 — Transaction Rollback
  '40001': (_pg) => ({
    status: 503,
    category: 'unavailable',
    message: 'The database detected a concurrent update conflict. Please retry.',
    hint: 'Another user may have saved a newer version of this record.',
  }),
  '40P01': (_pg) => ({
    status: 503,
    category: 'unavailable',
    message: 'Database deadlock detected. Please retry.',
  }),

  // Class 08 — Connection Exception
  '08000': (_pg) => ({
    status: 503,
    category: 'unavailable',
    message: 'Database connection error. Please retry.',
  }),
  '08003': (_pg) => ({
    status: 503,
    category: 'unavailable',
    message: 'The database connection was lost.',
  }),
  '08006': (_pg) => ({
    status: 503,
    category: 'unavailable',
    message: 'The database connection has failed.',
  }),

  // Class 53 — Insufficient Resources
  '53300': (_pg) => ({
    status: 503,
    category: 'unavailable',
    message: 'The database is out of resources. Please try again later.',
  }),
  '53400': (_pg) => ({
    status: 503,
    category: 'unavailable',
    message: 'Configuration limit reached on the database.',
  }),

  // Class 42 — Syntax Error / undefined object (developer error)
  '42P01': (_pg) => ({
    status: 500,
    category: 'internal',
    message: 'A database table is missing.',
    hint: 'This is a server-side configuration issue. Please contact your administrator.',
  }),
  '42703': (_pg) => ({
    status: 500,
    category: 'internal',
    message: 'A database column is missing.',
    hint: 'This is a server-side configuration issue. Please contact your administrator.',
  }),

  // Class 55 — Object Not In Prerequisite State
  '55P03': (_pg) => ({
    status: 409,
    category: 'conflict',
    message: 'The database is not accepting writes right now (likely read-only or in recovery).',
    hint: 'Wait a moment, then retry. If this persists, contact your administrator.',
  }),

  // Class 57 — Operator Intervention
  '57014': (_pg) => ({
    status: 503,
    category: 'unavailable',
    message: 'The database query was cancelled (likely due to a timeout).',
    hint: 'Try a narrower request, or retry when the system is less busy. If this keeps happening, the timeout setting may need to be increased.',
  }),
  '57P01': (_pg) => ({
    status: 503,
    category: 'unavailable',
    message: 'The database administrator has shut the database down.',
  }),
  '57P02': (_pg) => ({
    status: 503,
    category: 'unavailable',
    message: 'The database is starting up. Please retry shortly.',
  }),
  '57P03': (_pg) => ({
    status: 503,
    category: 'unavailable',
    message: 'Cannot connect to the database right now. Please retry shortly.',
  }),
}

/** Helper to check if a thrown value looks like a PG SQLSTATE error. */
export const isPgError = (err: unknown, code?: string): boolean => {
  if (!getPgError(err)) return false
  if (!code) return true
  return (err as PgErrorLike).code === code
}
