import { describe, it, expect } from 'vitest'
import { rowStatus, ADVANCING_PER_GROUP } from '../src/utils/qualification.js'

// rowStatus is pure: it consumes a row {rank,name} + a synthetic `qual`
// ({completion}). Exercise every branch directly.
function qual({ complete = true } = {}) {
  return { completion: { A: complete } }
}

describe('rowStatus — every branch', () => {
  it('null while the group is still in progress', () => {
    expect(rowStatus({ rank: 1, name: 'X' }, 'A', qual({ complete: false }))).toBeNull()
    // …at every rank, not just the top: nothing is decided until the group is.
    expect(rowStatus({ rank: 4, name: 'X' }, 'A', qual({ complete: false }))).toBeNull()
  })

  it("'in' for the top two", () => {
    expect(ADVANCING_PER_GROUP).toBe(2)
    expect(rowStatus({ rank: 1, name: 'X' }, 'A', qual())).toBe('in')
    expect(rowStatus({ rank: 2, name: 'X' }, 'A', qual())).toBe('in')
  })

  it("'out' for third and fourth", () => {
    // Copa has no best-third route, so there is no provisional/confirmed
    // third-place tier for a rank-3 row to sit in: once the group is complete,
    // third is simply out. (The Euro sibling needs 'best3' / 'out3' here, and
    // has to look at every other group's table to pick between them.)
    expect(rowStatus({ rank: 3, name: 'X' }, 'A', qual())).toBe('out')
    expect(rowStatus({ rank: 4, name: 'X' }, 'A', qual())).toBe('out')
  })

  it('needs nothing beyond its own group to answer', () => {
    // The whole cross-group apparatus (allComplete, a best-8 set) is absent by
    // design — passing it must not change the verdict.
    const withNoise = { completion: { A: true }, allComplete: false, best8: new Set(['X']) }
    expect(rowStatus({ rank: 3, name: 'X' }, 'A', withNoise)).toBe('out')
  })
})
