import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CostErrorBanner } from '@/components/cost/cost-error-banner'
import {
  COST_ERROR_CATEGORY_META,
  costCode,
  toNormalizedCostError,
  type NormalizedCostError,
} from '@/types/cost-library'

afterEach(cleanup)

const baseError: NormalizedCostError = {
  status: 409,
  category: 'conflict',
  message: 'This record is referenced by other data and cannot be deleted.',
  hint: 'Remove the references to "cost_set_member" first, then retry.',
  sqlState: '23503',
  retryable: false,
}

describe('toNormalizedCostError', () => {
  it('returns a normalized shape from a thrown axios-style error with category+hint+sqlState', () => {
    const out = toNormalizedCostError({
      status: 503,
      category: 'unavailable',
      hint: 'Verify DATABASE_URL, then retry.',
      sqlState: '08006',
      message: 'The database connection has failed.',
    })
    expect(out).toEqual<NormalizedCostError>({
      status: 503,
      category: 'unavailable',
      message: 'The database connection has failed.',
      hint: 'Verify DATABASE_URL, then retry.',
      sqlState: '08006',
      retryable: true,
    })
  })

  it('falls back to status → category when category is missing', () => {
    expect(toNormalizedCostError({ status: 401, message: 'No token' }).category).toBe('unauthorized')
    expect(toNormalizedCostError({ status: 403, message: 'Forbidden' }).category).toBe('forbidden')
    expect(toNormalizedCostError({ status: 404, message: 'Not found' }).category).toBe('not_found')
    expect(toNormalizedCostError({ status: 409, message: 'Conflict' }).category).toBe('conflict')
    expect(toNormalizedCostError({ status: 422, message: 'Unprocessable' }).category).toBe('unprocessable')
    expect(toNormalizedCostError({ status: 429, message: 'Too many' }).category).toBe('rate_limited')
    expect(toNormalizedCostError({ status: 503, message: 'Down' }).category).toBe('unavailable')
  })

  it('returns "unavailable" when status is 0 (network failure)', () => {
    const out = toNormalizedCostError({ status: 0, message: 'Network Error' })
    expect(out.category).toBe('unavailable')
    expect(out.retryable).toBe(true)
  })

  it('falls back to "internal" for unknown categories / statuses', () => {
    expect(toNormalizedCostError({ status: 418, message: 'I am a teapot' }).category).toBe('internal')
    expect(toNormalizedCostError({ status: 500, message: 'Oops', category: 'unknown-bucket' }).category).toBe('internal')
  })

  it('extracts category/hint/sqlState from axios response.data.data envelope', () => {
    const out = toNormalizedCostError({
      message: 'msg',
      response: { status: 409, data: { data: { category: 'conflict', hint: 'try again', sqlState: '23505' } } },
    })
    expect(out.category).toBe('conflict')
    expect(out.hint).toBe('try again')
    expect(out.sqlState).toBe('23505')
  })

  it('coerces null/undefined to a stable "unavailable" payload', () => {
    expect(toNormalizedCostError(null).category).toBe('unavailable')
    expect(toNormalizedCostError(undefined).category).toBe('unavailable')
    expect(toNormalizedCostError('a string').category).toBe('unavailable')
  })

  it('retryable flag follows the category meta table', () => {
    for (const [cat, meta] of Object.entries(COST_ERROR_CATEGORY_META)) {
      const out = toNormalizedCostError({ category: cat, status: 0, message: 'x' })
      expect(out.retryable).toBe(meta.retryable)
    }
  })

  it('falls back to "An unexpected error occurred." when message is empty', () => {
    const out = toNormalizedCostError({ status: 500, message: '' })
    expect(out.message).toMatch(/unexpected error/i)
  })
})

describe('CostErrorBanner', () => {
  it('renders the category label, status code, and SQLSTATE', () => {
    render(<CostErrorBanner error={baseError} testIdPrefix="t" />)
    expect(screen.getByTestId('t-category')).toHaveTextContent('Conflict')
    expect(screen.getByTestId('t-status')).toHaveTextContent('HTTP 409')
    expect(screen.getByTestId('t-sqlstate')).toHaveTextContent('SQLSTATE 23503')
    expect(screen.getByTestId('t-message')).toHaveTextContent(baseError.message)
    expect(screen.getByTestId('t-hint')).toHaveTextContent(/cost_set_member/)
  })

  it('omits the hint testid when no hint is provided', () => {
    render(<CostErrorBanner error={{ ...baseError, hint: undefined }} testIdPrefix="t" />)
    expect(screen.queryByTestId('t-hint')).toBeNull()
  })

  it('hides the Retry button when the error is non-retryable', () => {
    render(<CostErrorBanner error={baseError} onRetry={() => undefined} testIdPrefix="t" />)
    expect(screen.queryByTestId('t-retry')).toBeNull()
  })

  it('shows the Retry button when the error is retryable and invokes the callback', () => {
    const onRetry = vi.fn()
    render(
      <CostErrorBanner
        error={{ ...baseError, category: 'unavailable', status: 503, retryable: true }}
        onRetry={onRetry}
        testIdPrefix="t"
      />,
    )
    fireEvent.click(screen.getByTestId('t-retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows the Dismiss button and invokes the callback', () => {
    const onDismiss = vi.fn()
    render(<CostErrorBanner error={baseError} onDismiss={onDismiss} testIdPrefix="t" />)
    fireEvent.click(screen.getByTestId('t-dismiss'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('exposes category + retryable via data attributes for CSS / E2E selectors', () => {
    render(<CostErrorBanner error={baseError} testIdPrefix="t" />)
    const banner = screen.getByTestId('t')
    expect(banner).toHaveAttribute('data-category', 'conflict')
    expect(banner).toHaveAttribute('data-retryable', 'false')
    expect(banner).toHaveAttribute('role', 'alert')
  })
})

describe('costCode (preserved from original types)', () => {
  it('formats as typeCode/instanceNo (zero-padded)', () => {
    expect(costCode({ typeCode: 42, instanceNo: 1 } as never)).toBe('42/001')
    expect(costCode({ typeCode: 42, instanceNo: 7 } as never)).toBe('42/007')
    expect(costCode({ typeCode: 9999, instanceNo: 123 } as never)).toBe('9999/123')
  })
})
