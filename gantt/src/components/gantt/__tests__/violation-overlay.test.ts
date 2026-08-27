import { describe, it, expect } from 'vitest'
import { violationBadgePosition, VIOLATION_BADGE_SIZE } from '../violation-overlay'

/**
 * Regression: the violation "!" badge used to be anchored to the puck's
 * top-right corner (`x + width - 14`, `y + 2`), where it overlapped the
 * edge-anchored time / airport text. It must now sit in the geometric
 * center of the puck. These assertions would have caught the old
 * top-right placement.
 */
describe('violationBadgePosition', () => {
  it('centers the badge in the puck rect (both axes)', () => {
    const x = 100
    const y = 40
    const width = 60
    const height = 20

    const { x: bx, y: by } = violationBadgePosition(x, y, width, height)

    // Badge center == puck center on both axes.
    const badgeCenterX = bx + VIOLATION_BADGE_SIZE / 2
    const badgeCenterY = by + VIOLATION_BADGE_SIZE / 2
    expect(badgeCenterX).toBe(x + width / 2)
    expect(badgeCenterY).toBe(y + height / 2)
  })

  it('does NOT place the badge at the old top-right corner', () => {
    const x = 100
    const y = 40
    const width = 60
    const height = 20

    const { x: bx, y: by } = violationBadgePosition(x, y, width, height)

    // Old (buggy) placement that overlapped right-edge text.
    expect(bx).not.toBe(x + width - 14)
    expect(by).not.toBe(y + 2)

    // New placement stays clear of the right edge.
    expect(bx + VIOLATION_BADGE_SIZE).toBeLessThan(x + width)
  })

  it('keeps the badge fully inside narrow pucks', () => {
    const x = 0
    const y = 0
    const width = 16 // minimal-puck width
    const height = 20

    const { x: bx, y: by } = violationBadgePosition(x, y, width, height)

    expect(bx).toBeGreaterThanOrEqual(x)
    expect(by).toBeGreaterThanOrEqual(y)
    expect(bx + VIOLATION_BADGE_SIZE).toBeLessThanOrEqual(x + width)
    expect(by + VIOLATION_BADGE_SIZE).toBeLessThanOrEqual(y + height)
  })
})
