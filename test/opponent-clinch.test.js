import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { lockedOpponent } from '../src/utils/opponentClinch.js'
import { computeClinch } from '../src/utils/clinch.js'
import { GROUP_STAGE_MD3 } from './fixtures/group-stage-md3.js'
import { FINAL_GROUP_RESULTS } from './fixtures/final-group-results.js'

// A real mid-tournament snapshot: Groups B, C and D complete, Group A with its
// final matchday (Matches 17 and 18) still to play. Captured from the live feed
// so the two-group matchup math is exercised against an authentic configuration.
const snapshot = MATCHES.map((m) =>
  m.stage === 'Group' && GROUP_STAGE_MD3[m.num] ? { ...m, score: GROUP_STAGE_MD3[m.num] } : m,
)

describe('lockedOpponent — knockout opponent clinch', () => {
  const clinch = computeClinch(snapshot)

  it('locks a tie between two settled groups while another is still playing', () => {
    // Uruguay won Group C and Brazil finished second in Group D, so Winner C v
    // Runner-up D (Match 27) is fixed — even though Group A has two games left.
    // Copa needs only those two groups to agree: with no best-third slot, no
    // third group's results can ever redirect this tie. (The Euro sibling has to
    // hold a whole cross-group thirds race open before it can say the same.)
    expect(lockedOpponent(snapshot, 'Uruguay', clinch)).toEqual({
      opponent: 'Brazil',
      matchNum: 27,
    })
    // …and it reads the same from the other side of the tie.
    expect(lockedOpponent(snapshot, 'Brazil', clinch)).toEqual({
      opponent: 'Uruguay',
      matchNum: 27,
    })
  })

  it('locks a winner vs runner-up tie the same way', () => {
    // Colombia won Group D, Panama finished second in Group C → Match 28.
    expect(lockedOpponent(snapshot, 'Colombia', clinch)).toEqual({
      opponent: 'Panama',
      matchNum: 28,
    })
  })

  it('does NOT lock a team whose opposite group is still being played', () => {
    // Venezuela won Group B, but their quarter-final (Match 26) faces Group A's
    // runner-up, and Group A has not finished — so the opponent stays open.
    expect(clinch['Venezuela']).toBe('won-group')
    expect(lockedOpponent(snapshot, 'Venezuela', clinch)).toBeNull()
    // Ecuador (runner-up B) faces Group A's winner in Match 25 — also open.
    expect(lockedOpponent(snapshot, 'Ecuador', clinch)).toBeNull()
  })

  it('does NOT lock a team that has not fixed its own finishing slot', () => {
    // Argentina are through but only as "top2": until Group A's last matchday is
    // played they could still finish either first or second, which are different
    // quarter-finals. Advancing is not the same as knowing where you land.
    expect(clinch['Argentina']).toBe('top2')
    expect(lockedOpponent(snapshot, 'Argentina', clinch)).toBeNull()
    // An eliminated team never has one.
    expect(lockedOpponent(snapshot, 'Jamaica', clinch)).toBeNull()
    // Neither does a name that isn't in the tournament.
    expect(lockedOpponent(snapshot, 'Nobody FC', clinch)).toBeNull()
  })

  it('locks every quarter-final once the whole group stage is final', () => {
    const all = Object.assign({}, ...Object.values(FINAL_GROUP_RESULTS).map((r) => r.scores))
    const done = MATCHES.map((m) => (all[m.num] ? { ...m, score: all[m.num] } : m))
    const c = computeClinch(done)
    // The four real quarter-finals, read back out of the slot map.
    expect(lockedOpponent(done, 'Argentina', c)).toEqual({ opponent: 'Ecuador', matchNum: 25 })
    expect(lockedOpponent(done, 'Venezuela', c)).toEqual({ opponent: 'Canada', matchNum: 26 })
    expect(lockedOpponent(done, 'Uruguay', c)).toEqual({ opponent: 'Brazil', matchNum: 27 })
    expect(lockedOpponent(done, 'Colombia', c)).toEqual({ opponent: 'Panama', matchNum: 28 })
  })

  it('locks nothing before the tournament starts', () => {
    // Called without a precomputed clinch map, so the default argument runs too.
    expect(lockedOpponent(MATCHES, 'Argentina')).toBeNull()
  })
})
