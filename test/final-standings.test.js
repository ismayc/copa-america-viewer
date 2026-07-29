import { describe, it, expect } from 'vitest'
import { MATCHES } from '../src/data/matches.js'
import { TEAMS } from '../src/data/teams.js'
import { rankGroup } from '../src/utils/qualification.js'
import { computeClinch } from '../src/utils/clinch.js'
import { resolveBracket } from '../src/utils/bracketResolve.js'
import { unscored } from './helpers/tournament.js'
import { FINAL_GROUP_RESULTS, OFFICIAL_QF } from './fixtures/final-group-results.js'

// Only the frozen group results are known here — the knockout sides must be
// DERIVED, not read back off the committed schedule, or the test proves nothing.
function fromGroupResultsOnly() {
  const scores = Object.assign({}, ...Object.values(FINAL_GROUP_RESULTS).map((r) => r.scores))
  const matches = unscored().map((m) => (scores[m.num] ? { ...m, score: scores[m.num] } : m))
  return resolveBracket(matches, computeClinch(matches))
}

// Replays each group's verified final result through the ranking engine and
// asserts the official finishing order — so a tie-breaker regression can't
// quietly send the wrong team into the knockouts.
describe('final group standings — locked against official results', () => {
  const groups = Object.entries(FINAL_GROUP_RESULTS)

  it('guards all four groups', () => {
    expect(groups.map(([g]) => g).sort()).toEqual(Object.keys(TEAMS).sort())
  })

  for (const [group, rec] of groups) {
    it(`Group ${group} finishes in the official order`, () => {
      // The locked scores must reference exactly that group's six matches.
      const groupNums = MATCHES.filter((m) => m.stage === 'Group' && m.group === group)
        .map((m) => m.num)
        .sort((a, b) => a - b)
      expect(Object.keys(rec.scores).map(Number).sort((a, b) => a - b)).toEqual(groupNums)

      const matches = MATCHES.map((m) =>
        rec.scores[m.num] ? { ...m, score: rec.scores[m.num] } : m,
      )
      expect(rankGroup(group, matches).map((r) => r.name)).toEqual(rec.order)
    })
  }

  it('separates Ecuador and Mexico on goal difference, CONMEBOL’s first tie-breaker', () => {
    // Both finished Group B on 4 points. Under UEFA's order head-to-head would be
    // consulted first — they drew 0–0, so it settles nothing and the answer would
    // come out the same by luck. This asserts the criterion that actually did it.
    const rows = rankGroup('B', MATCHES)
    const ecu = rows.find((r) => r.name === 'Ecuador')
    const mex = rows.find((r) => r.name === 'Mexico')
    expect(ecu.Pts).toBe(mex.Pts)
    expect(ecu.GD).toBeGreaterThan(mex.GD)
    expect(rows.map((r) => r.name)).toEqual(FINAL_GROUP_RESULTS.B.order)
  })
})

// The independent check on the orders above. OFFICIAL_QF comes from the
// committed schedule's own t1/t2 — ESPN's structure, never rankGroup's output —
// so deriving the same pairings from nothing but the group scores is what proves
// the finishing orders are right rather than merely self-consistent.
describe('quarter-final line-up — locked against the official bracket', () => {
  it('resolves to the official quarter-final matchups from the group results alone', () => {
    const byNum = Object.fromEntries(fromGroupResultsOnly().map((m) => [m.num, m]))
    for (const [num, pair] of Object.entries(OFFICIAL_QF)) {
      expect([byNum[num].t1, byNum[num].t2], `QF match ${num}`).toEqual(pair)
    }
  })

  it('leaves no placeholder in the quarter-finals once the group stage is complete', () => {
    for (const m of fromGroupResultsOnly().filter((m) => m.stage === 'QF')) {
      expect(/Group|3rd|Match/.test(`${m.t1} ${m.t2}`), `unresolved QF M${m.num}`).toBe(false)
    }
  })

  it('sends exactly the eight real quarter-finalists through, and nobody else', () => {
    // Four groups × top two. There is no best-third route in this format, so a
    // third-placed team appearing here would mean the engine invented one.
    const resolved = fromGroupResultsOnly()
    const through = resolved.filter((m) => m.stage === 'QF').flatMap((m) => [m.t1, m.t2])
    expect(through.sort()).toEqual(Object.values(OFFICIAL_QF).flat().sort())
    expect(new Set(through).size).toBe(8)
    const thirdsAndFourths = Object.values(FINAL_GROUP_RESULTS).flatMap((r) => r.order.slice(2))
    for (const t of thirdsAndFourths) expect(through, `${t} should be eliminated`).not.toContain(t)
  })
})
