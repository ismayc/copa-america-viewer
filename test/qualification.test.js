import { describe, it, expect } from 'vitest'
import {
  rankGroup,
  computeQualification,
  groupComplete,
  rowStatus,
  ADVANCING_PER_GROUP,
  byLots,
} from '../src/utils/qualification.js'
import { TEAMS } from '../src/data/teams.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored, onlyGroupScores, groupTeams } from './helpers/tournament.js'

// This edition is finished, so the committed schedule ships with every result in
// it. Tie-breaker tests need a board they control, so they build one from an
// unscored schedule; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

// Group A — Argentina, Canada, Chile, Peru — is the workhorse for the
// tie-breaker cases. Real fixtures: M1 ARG v CAN, M2 PER v CHI, M9 CHI v ARG,
// M10 PER v CAN, M17 ARG v PER, M18 CAN v CHI.
const scoreA = (results) => onlyGroupScores('A', results)

describe('rankGroup — CONMEBOL tie-breakers', () => {
  it('orders by points when points are distinct', () => {
    const rows = rankGroup('A', scoreA([
      ['Argentina', 'Canada', 2, 0],
      ['Argentina', 'Chile', 3, 0],
      ['Argentina', 'Peru', 1, 0],
      ['Canada', 'Chile', 2, 1],
      ['Peru', 'Canada', 0, 1],
      ['Chile', 'Peru', 2, 0],
    ]))
    expect(rows.map((r) => r.name)).toEqual(['Argentina', 'Canada', 'Chile', 'Peru'])
    expect(rows[0].Pts).toBe(9)
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4])
  })

  // THE signature difference from the sibling Euro viewer. CONMEBOL applies
  // OVERALL goal difference before head-to-head; UEFA does the reverse. Get this
  // backwards and any group where two level teams met is silently misordered.
  it('applies OVERALL goal difference BEFORE head-to-head', () => {
    const rows = rankGroup('A', scoreA([
      ['Canada', 'Argentina', 1, 0], // H2H: Canada beat Argentina
      ['Argentina', 'Chile', 5, 0],
      ['Argentina', 'Peru', 5, 0], // …but Argentina run up a far better overall GD
      ['Canada', 'Chile', 1, 0],
      ['Peru', 'Canada', 1, 0],
      ['Chile', 'Peru', 1, 0],
    ]))
    const arg = rows.find((r) => r.name === 'Argentina')
    const can = rows.find((r) => r.name === 'Canada')
    expect([arg.Pts, can.Pts]).toEqual([6, 6])
    expect(arg.GD).toBeGreaterThan(can.GD)
    // Argentina first despite losing the head-to-head. Under UEFA's order Canada
    // would be first — that inversion is the whole point of this test.
    expect(rows.slice(0, 2).map((r) => r.name)).toEqual(['Argentina', 'Canada'])
  })

  it('falls to head-to-head only once points, GD and goals are all level', () => {
    const rows = rankGroup('A', scoreA([
      ['Peru', 'Argentina', 1, 0], // H2H: Peru beat Argentina
      ['Argentina', 'Canada', 1, 0],
      ['Argentina', 'Chile', 1, 0],
      ['Canada', 'Chile', 1, 0],
      ['Peru', 'Canada', 1, 0],
      ['Chile', 'Peru', 1, 0],
    ]))
    const [first, second] = rows
    expect([first.Pts, first.GD, first.GF]).toEqual([second.Pts, second.GD, second.GF])
    expect([first.name, second.name]).toEqual(['Peru', 'Argentina'])
  })

  // Argentina and Canada finish identical on points, GD and goals scored, and
  // drew head-to-head — so only the disciplinary record and then a drawing of
  // lots are left. The tests below share this board.
  const DEAD_EVEN = [
    ['Argentina', 'Canada', 0, 0], // head-to-head draw
    ['Chile', 'Argentina', 0, 1],
    ['Argentina', 'Peru', 0, 1],
    ['Canada', 'Chile', 1, 0],
    ['Peru', 'Canada', 1, 0],
    ['Peru', 'Chile', 1, 0],
  ]

  // Attach cards inside the Argentina–Canada match, whichever way round the real
  // fixture lists the two sides.
  const withCards = (perTeam) =>
    scoreA(DEAD_EVEN).map((m) => {
      const isPair =
        m.stage === 'Group' && m.group === 'A' &&
        [m.t1, m.t2].includes('Argentina') && [m.t1, m.t2].includes('Canada')
      if (!isPair) return m
      const side = (team) => (m.t1 === team ? 't1' : 't2')
      const cards = {}
      for (const [team, list] of Object.entries(perTeam)) cards[side(team)] = list
      return { ...m, cards }
    })

  it('breaks a dead-even tie by a drawing of lots when no cards are recorded', () => {
    const rows = rankGroup('A', scoreA(DEAD_EVEN))
    const arg = rows.find((r) => r.name === 'Argentina')
    const can = rows.find((r) => r.name === 'Canada')
    expect([arg.Pts, arg.GD, arg.GF]).toEqual([can.Pts, can.GD, can.GF])
    expect(arg.conduct).toBe(can.conduct)
    // Nothing computable is left, so the stable stand-in for the draw applies.
    expect(arg.rank).toBeLessThan(can.rank)
    expect(byLots('Argentina', 'Canada')).toBeLessThan(0)
  })

  it('uses the disciplinary record before the drawing of lots', () => {
    const rows = rankGroup('A', withCards({ Argentina: [{ color: 'yellow' }] }))
    const arg = rows.find((r) => r.name === 'Argentina')
    const can = rows.find((r) => r.name === 'Canada')
    expect([arg.Pts, arg.GD, arg.GF]).toEqual([can.Pts, can.GD, can.GF]) // still level on goals
    expect(arg.conduct).toBe(-1)
    expect(can.conduct).toBe(0)
    // One yellow is enough to reverse the order the lots stand-in produced above.
    expect(can.rank).toBeLessThan(arg.rank)
  })

  it('counts red cards ahead of any number of yellows', () => {
    // CONMEBOL ranks fewest reds first, and only then fewest yellows. A single
    // red must therefore lose to five yellows — which a naive one-point-per-card
    // score would get backwards.
    const rows = rankGroup('A', withCards({
      Argentina: [{ color: 'red' }],
      Canada: Array.from({ length: 5 }, () => ({ color: 'yellow' })),
    }))
    const arg = rows.find((r) => r.name === 'Argentina')
    const can = rows.find((r) => r.name === 'Canada')
    expect(arg.conduct).toBe(-100)
    expect(can.conduct).toBe(-5)
    expect(can.rank).toBeLessThan(arg.rank)
  })

  it('with no results, ranks all four teams 1–4 by the lots stand-in', () => {
    const rows = rankGroup('A', [])
    expect(rows.map((r) => r.name)).toEqual(['Argentina', 'Canada', 'Chile', 'Peru'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4])
    expect(rows.every((r) => r.Pts === 0)).toBe(true)
  })

  it('ignores a voided match', () => {
    const board = scoreA([['Argentina', 'Canada', 3, 0]]).map((m) =>
      m.stage === 'Group' && m.group === 'A' && m.score ? { ...m, voided: true } : m,
    )
    expect(rankGroup('A', board).every((r) => r.P === 0)).toBe(true)
  })
})

describe('computeQualification', () => {
  it('has four groups and nothing complete before a ball is kicked', () => {
    const q = computeQualification(MATCHES)
    expect(Object.keys(q.groups)).toHaveLength(4)
    expect(q.allComplete).toBe(false)
    expect(Object.values(q.completion).every((c) => c === false)).toBe(true)
  })

  it('every group has its four teams ranked 1–4', () => {
    const q = computeQualification(MATCHES)
    for (const g of Object.keys(TEAMS)) {
      expect(q.groups[g].map((r) => r.rank)).toEqual([1, 2, 3, 4])
      expect(q.groups[g].map((r) => r.name).sort()).toEqual([...groupTeams(g)].sort())
    }
  })

  it('flags completion per group and overall', () => {
    const scored = MATCHES.map((m) =>
      m.stage === 'Group' && m.group === 'A' ? { ...m, score: [1, 0] } : m,
    )
    const q = computeQualification(scored)
    expect(q.completion.A).toBe(true)
    expect(q.completion.B).toBe(false)
    expect(q.allComplete).toBe(false)
    expect(computeQualification(PLAYED).allComplete).toBe(true)
  })

  it('exposes no best-thirds machinery — only the top two of each group advance', () => {
    const q = computeQualification(PLAYED)
    expect(ADVANCING_PER_GROUP).toBe(2)
    expect(q).not.toHaveProperty('thirds')
    expect(q).not.toHaveProperty('bestThirds')
    // Four groups × two = the eight quarter-finalists.
    const advancing = Object.values(q.groups).flatMap((rows) => rows.slice(0, ADVANCING_PER_GROUP))
    expect(advancing).toHaveLength(8)
  })

  it('reproduces the real Copa América 2024 group results from the committed data', () => {
    const q = computeQualification(PLAYED)
    const topTwo = Object.fromEntries(
      Object.entries(q.groups).map(([g, rows]) => [g, [rows[0].name, rows[1].name]]),
    )
    expect(topTwo).toEqual({
      A: ['Argentina', 'Canada'],
      B: ['Venezuela', 'Ecuador'],
      C: ['Uruguay', 'Panama'],
      D: ['Colombia', 'Brazil'],
    })
    // Ecuador and Mexico both finished Group B on 4 points; Ecuador advanced on
    // goal difference. That is CONMEBOL's order doing real work on real data.
    const b = q.groups.B
    const ecu = b.find((r) => r.name === 'Ecuador')
    const mex = b.find((r) => r.name === 'Mexico')
    expect(ecu.Pts).toBe(mex.Pts)
    expect(ecu.GD).toBeGreaterThan(mex.GD)
    expect(ecu.rank).toBeLessThan(mex.rank)
  })
})

describe('rowStatus', () => {
  it('says nothing until the group is complete, then in/out by position', () => {
    const qual = { completion: { A: false }, allComplete: false }
    expect(rowStatus({ rank: 1 }, 'A', qual)).toBeNull()
    const done = { completion: { A: true }, allComplete: false }
    expect(rowStatus({ rank: 1 }, 'A', done)).toBe('in')
    expect(rowStatus({ rank: 2 }, 'A', done)).toBe('in')
    expect(rowStatus({ rank: 3 }, 'A', done)).toBe('out')
    expect(rowStatus({ rank: 4 }, 'A', done)).toBe('out')
  })
})

describe('groupComplete', () => {
  it('is true only once all six group matches are scored', () => {
    const aMatches = MATCHES.filter((m) => m.stage === 'Group' && m.group === 'A')
    expect(aMatches).toHaveLength(6)
    expect(groupComplete('A', [])).toBe(false)
    const five = aMatches.slice(0, 5).map((m) => ({ ...m, score: [1, 0] }))
    expect(groupComplete('A', five)).toBe(false)
    expect(groupComplete('A', aMatches.map((m) => ({ ...m, score: [1, 0] })))).toBe(true)
  })
})
