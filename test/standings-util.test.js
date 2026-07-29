import { describe, it, expect } from 'vitest'
import { computeGroup, groupHasResults, rankGroup } from '../src/utils/standings.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { TEAMS } from '../src/data/teams.js'

const GROUP = 'A'

function withGroupScore(num, score) {
  return MATCHES.map((m) => (m.num === num ? { ...m, score } : m))
}

describe('standings.js surface', () => {
  it('re-exports rankGroup', () => {
    const rows = rankGroup(GROUP, MATCHES)
    expect(rows).toHaveLength(TEAMS[GROUP].length)
  })

  it('computeGroup returns ranked rows for a group', () => {
    const rows = computeGroup(GROUP, MATCHES)
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4])
  })

  it('groupHasResults is false with no scored matches', () => {
    expect(groupHasResults(GROUP, MATCHES)).toBe(false)
  })

  it('groupHasResults is true once a group match is scored', () => {
    const firstGroupMatch = MATCHES.find((m) => m.stage === 'Group' && m.group === GROUP)
    const updated = withGroupScore(firstGroupMatch.num, [1, 0])
    expect(groupHasResults(GROUP, updated)).toBe(true)
  })
})
