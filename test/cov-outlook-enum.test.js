import { describe, it, expect } from 'vitest'
import { countIterations, countRemaining } from '../src/utils/outlookEnum.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { TEAMS } from '../src/data/teams.js'

const GROUPS = Object.keys(TEAMS)
const MAX_ITERS = 12_000_000
// Four groups of four: each group has at most 12 distinct reachable outcomes, so
// the cross-group cartesian can never exceed 12^4.
const CEILING = 12 ** GROUPS.length

// Leave the last `openPerGroup` games of every group unplayed; fill the rest.
function withOpenTail(openPerGroup) {
  const open = new Set()
  for (const g of GROUPS) {
    const nums = MATCHES.filter((m) => m.stage === 'Group' && m.group === g)
      .map((m) => m.num)
      .sort((a, b) => a - b)
    for (const n of nums.slice(-openPerGroup)) open.add(n)
  }
  return MATCHES.map((m) =>
    m.stage === 'Group' && !open.has(m.num) ? { ...m, score: [1, 0] } : m,
  )
}

describe('outlookEnum — the adaptive cap never has to fall back', () => {
  it('saturates at the 12^4 ceiling, far below MAX_ITERS', () => {
    // Three open games per group is already enough to saturate the distinct
    // outcome count, so this is the worst case the enumeration ever walks.
    const wide = withOpenTail(3)
    expect(countRemaining(wide)).toBe(3 * GROUPS.length)
    const iters = countIterations(wide)
    expect(iters).toBeLessThanOrEqual(CEILING)
    expect(iters).toBeLessThan(MAX_ITERS)
  })

  it('grows monotonically with the open games and still fits', () => {
    // The Euro sibling's six groups overflow MAX_ITERS here and force chooseCaps
    // to walk the cap down; with four groups that branch is unreachable, which
    // is why it carries a v8-ignore in the source.
    const counts = [1, 2, 3].map((n) => countIterations(withOpenTail(n)))
    expect(counts[0]).toBeLessThan(counts[1])
    expect(counts[1]).toBeLessThan(counts[2])
    for (const c of counts) expect(c).toBeLessThan(MAX_ITERS)
  })
})
