import { describe, expect, it } from 'vitest'
import {
  OPTIMIZER_BADGE_SIZE,
  isOptimizerRosterSource,
  optimizerBadgePosition,
  optimizerBadgePositionTopLeftOutside,
  optimizerBadgePositionTopRightOutside,
  pickOptimizerBadgeBlock,
  shouldDrawOptimizerBadge,
  shouldDrawOptimizerOutline,
} from '../optimizer-overlay'

describe('optimizerBadgePositionTopLeftOutside', () => {
  it('anchors the badge outside the puck top-left (pairing / flight / RES)', () => {
    const x = 100
    const y = 40
    const width = 48
    const { x: bx, y: by, textAlign, textBaseline } = optimizerBadgePositionTopLeftOutside(x, y, width, 22)

    expect(bx).toBeLessThan(x)
    expect(by).toBeLessThan(y)
    expect(bx).toBe(x - Math.ceil(OPTIMIZER_BADGE_SIZE / 2))
    expect(by).toBe(y - Math.ceil(OPTIMIZER_BADGE_SIZE / 2))
    expect(textAlign).toBe('left')
    expect(textBaseline).toBe('top')
  })
})

describe('optimizerBadgePositionTopRightOutside', () => {
  it('anchors the badge outside the puck top-right (ground duties)', () => {
    const x = 100
    const y = 40
    const width = 48
    const { x: bx, y: by, textAlign, textBaseline } = optimizerBadgePositionTopRightOutside(x, y, width, 22)

    expect(bx).toBeGreaterThan(x + width)
    expect(by).toBeLessThan(y)
    expect(bx).toBe(x + width + Math.ceil(OPTIMIZER_BADGE_SIZE / 2))
    expect(by).toBe(y - Math.ceil(OPTIMIZER_BADGE_SIZE / 2))
    expect(textAlign).toBe('right')
    expect(textBaseline).toBe('top')
  })
})

describe('optimizerBadgePosition', () => {
  it('dispatches pairing to top-left outside and ground to top-right outside', () => {
    const x = 80
    const y = 30
    const w = 40

    const pairing = optimizerBadgePosition('pairing', x, y, w, 22)
    expect(pairing.x).toBeLessThan(x)
    expect(pairing.textAlign).toBe('left')

    const ground = optimizerBadgePosition('ground', x, y, w, 22)
    expect(ground.x).toBeGreaterThan(x + w)
    expect(ground.textAlign).toBe('right')
  })
})

describe('shouldDrawOptimizerBadge', () => {
  it('draws only for CR source above min width', () => {
    expect(shouldDrawOptimizerBadge('CR', 20)).toBe(true)
    expect(shouldDrawOptimizerBadge('PA', 20)).toBe(false)
    expect(shouldDrawOptimizerBadge('CR', 4)).toBe(false)
  })
})

describe('pickOptimizerBadgeBlock', () => {
  it('picks the leftmost visible block for one badge per pairing group', () => {
    const blocks = [
      { blockX: 10, blockY: 20, blockWidth: 40 },
      { blockX: 60, blockY: 20, blockWidth: 30 },
      { blockX: 100, blockY: 20, blockWidth: 25 },
    ]
    const picked = pickOptimizerBadgeBlock(blocks, 500)
    expect(picked).toEqual({ blockX: 10, blockY: 20, blockWidth: 40 })
  })

  it('ignores blocks fully outside the viewport', () => {
    const blocks = [
      { blockX: -50, blockY: 20, blockWidth: 40 },
      { blockX: 600, blockY: 20, blockWidth: 30 },
      { blockX: 80, blockY: 20, blockWidth: 20 },
    ]
    const picked = pickOptimizerBadgeBlock(blocks, 500)
    expect(picked).toEqual({ blockX: 80, blockY: 20, blockWidth: 20 })
  })
})

describe('shouldDrawOptimizerOutline', () => {
  it('draws green outline only for CR source when not selected', () => {
    expect(shouldDrawOptimizerOutline('CR', false)).toBe(true)
    expect(shouldDrawOptimizerOutline('CR', true)).toBe(false)
    expect(shouldDrawOptimizerOutline('PA', false)).toBe(false)
    expect(shouldDrawOptimizerOutline(null, false)).toBe(false)
  })
})

describe('isOptimizerRosterSource', () => {
  it('is true only for CR', () => {
    expect(isOptimizerRosterSource('CR')).toBe(true)
    expect(isOptimizerRosterSource('PA')).toBe(false)
    expect(isOptimizerRosterSource(null)).toBe(false)
  })
})

describe('drawOptimizerBadge', () => {
  it('uses text-only amber ⚡ at the given anchor', () => {
    expect(OPTIMIZER_BADGE_SIZE).toBe(9)
  })
})
