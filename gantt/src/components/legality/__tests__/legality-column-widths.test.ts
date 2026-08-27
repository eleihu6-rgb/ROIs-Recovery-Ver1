import { describe, expect, it } from 'vitest'
import {
  LEGALITY_CATALOG_WIDTH_DEFAULT,
  LEGALITY_CATALOG_WIDTH_MAX,
  LEGALITY_CATALOG_WIDTH_MIN,
  LEGALITY_SETS_WIDTH_DEFAULT,
  LEGALITY_SETS_WIDTH_MAX,
  LEGALITY_SETS_WIDTH_MIN,
  applyLegalityColumnDrag,
  clampLegalityCatalogWidth,
  clampLegalitySetsWidth,
} from '../legality-column-widths'

describe('legality column widths', () => {
  it('defaults sit inside clamp ranges', () => {
    expect(LEGALITY_CATALOG_WIDTH_DEFAULT).toBeGreaterThanOrEqual(LEGALITY_CATALOG_WIDTH_MIN)
    expect(LEGALITY_CATALOG_WIDTH_DEFAULT).toBeLessThanOrEqual(LEGALITY_CATALOG_WIDTH_MAX)
    expect(LEGALITY_SETS_WIDTH_DEFAULT).toBeGreaterThanOrEqual(LEGALITY_SETS_WIDTH_MIN)
    expect(LEGALITY_SETS_WIDTH_DEFAULT).toBeLessThanOrEqual(LEGALITY_SETS_WIDTH_MAX)
  })

  it('clamps catalog width to min and max', () => {
    expect(clampLegalityCatalogWidth(100)).toBe(LEGALITY_CATALOG_WIDTH_MIN)
    expect(clampLegalityCatalogWidth(999)).toBe(LEGALITY_CATALOG_WIDTH_MAX)
    expect(clampLegalityCatalogWidth(300.6)).toBe(301)
  })

  it('clamps sets width to min and max', () => {
    expect(clampLegalitySetsWidth(50)).toBe(LEGALITY_SETS_WIDTH_MIN)
    expect(clampLegalitySetsWidth(900)).toBe(LEGALITY_SETS_WIDTH_MAX)
  })

  it('applies drag delta then clamps', () => {
    expect(applyLegalityColumnDrag(220, 40, clampLegalityCatalogWidth)).toBe(260)
    expect(applyLegalityColumnDrag(220, -200, clampLegalityCatalogWidth)).toBe(LEGALITY_CATALOG_WIDTH_MIN)
    expect(applyLegalityColumnDrag(256, 30, clampLegalitySetsWidth)).toBe(286)
    expect(applyLegalityColumnDrag(256, 500, clampLegalitySetsWidth)).toBe(LEGALITY_SETS_WIDTH_MAX)
  })
})
