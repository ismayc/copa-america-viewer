import { describe, it, expect } from 'vitest'
import { crossCheck } from '../src/services/reconcile.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

const match1 = MATCHES.find((m) => m.num === 1)
const src = (name, rec) => ({ name, score: () => rec })

describe('crossCheck — reportsAgree orientation branches', () => {
  it('disagrees when a flipped (home==away) orientation does not match', () => {
    // b.home === a.away path: a Germany-home [2,1] vs b South-Africa-home [2,1]
    // flips to compare a.ft[0]===b.ft[1] (2 vs 1) -> disagree.
    const sources = [
      src('A', { home: 'Germany', away: 'Hungary', ft: [2, 1] }),
      src('B', { home: 'Hungary', away: 'Germany', ft: [2, 1] }),
    ]
    expect(crossCheck(match1, sources).agree).toBe(false)
  })

  it('treats entirely different teams as not in conflict (agree stays true)', () => {
    const sources = [
      src('A', { home: 'Germany', away: 'Hungary', ft: [2, 1] }),
      src('B', { home: 'Denmark', away: 'Croatia', ft: [9, 9] }), // unrelated -> no conflict
    ]
    const cc = crossCheck(match1, sources)
    expect(cc.count).toBe(2)
    expect(cc.agree).toBe(true)
  })
})
