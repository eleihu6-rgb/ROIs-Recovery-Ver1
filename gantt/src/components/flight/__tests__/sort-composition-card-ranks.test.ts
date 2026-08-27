import { describe, expect, it } from 'vitest'
import { sortCompositionCardRanks } from '../sort-composition-card-ranks'

describe('sortCompositionCardRanks', () => {
  it('orders CA, FO, IFD, FA regardless of input order', () => {
    expect(sortCompositionCardRanks(['FA', 'CA', 'IFD', 'FO'])).toEqual(['CA', 'FO', 'IFD', 'FA'])
  })

  it('keeps unknown ranks after known ones, A–Z', () => {
    expect(sortCompositionCardRanks(['FA', 'PU', 'CA', 'CC'])).toEqual(['CA', 'FA', 'CC', 'PU'])
  })
})
