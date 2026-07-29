import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { TEAMS } from '../src/data/teams.js'
import { FINAL_GROUP_RESULTS } from './fixtures/final-group-results.js'
import { GROUP_STAGE_MD3 } from './fixtures/group-stage-md3.js'
import { eliminationStatus, survivingTeams, isAlive } from '../src/utils/eliminationCheck.js'
import { computeClinch } from '../src/utils/clinch.js'

const ALL_NAMES = Object.values(TEAMS).flat().map((t) => t.name)

// Apply a { matchNum: [g1, g2] } map onto a clone of the real schedule. Matches
// left out of the map stay scoreless = "still to play".
function withScores(map) {
  return MATCHES.map((m) => (map[m.num] ? { ...m, score: map[m.num] } : m))
}

// Every group's real final result, from the frozen official fixture.
const REAL_FINAL = Object.assign({}, ...Object.values(FINAL_GROUP_RESULTS).map((r) => r.scores))

describe('eliminationStatus — against the real 2024 group stage', () => {
  it('leaves exactly the eight real quarter-finalists alive', () => {
    const status = eliminationStatus(withScores(REAL_FINAL))
    // The eight who actually reached the quarter-finals, from the committed
    // knockout data rather than restated by hand.
    const realQFTeams = [...new Set(PLAYED.filter((m) => m.stage === 'QF').flatMap((m) => [m.t1, m.t2]))]
    expect(realQFTeams).toHaveLength(8)
    expect(survivingTeams(withScores(REAL_FINAL)).sort()).toEqual([...realQFTeams].sort())
    for (const t of realQFTeams) expect(status[t], t).toBe('alive')
    for (const t of ALL_NAMES.filter((n) => !realQFTeams.includes(n))) {
      expect(status[t], t).toBe('eliminated')
    }
  })

  it('matches the clinch engine: nobody is eliminated here but alive there', () => {
    // The two engines answer different questions off the same enumeration, so
    // they must never contradict each other.
    const matches = withScores(GROUP_STAGE_MD3)
    const elim = eliminationStatus(matches)
    const clinch = computeClinch(matches)
    for (const t of ALL_NAMES) {
      if (clinch[t] === 'eliminated') expect(elim[t], t).toBe('eliminated')
      if (elim[t] === 'alive') expect(clinch[t], t).not.toBe('eliminated')
    }
  })
})

describe('eliminationStatus — mid-tournament verdicts', () => {
  it('keeps a whole group alive while its final matchday is still to play', () => {
    // The frozen mid-tournament snapshot: Groups B–D are complete, Group A has
    // matches 17 and 18 outstanding.
    const status = eliminationStatus(withScores(GROUP_STAGE_MD3))
    for (const t of TEAMS['A'].map((x) => x.name)) expect(status[t], t).toBe('alive')
    // …while the groups that ARE finished already read their real verdicts.
    expect(status['Jamaica']).toBe('eliminated')
    expect(status['Bolivia']).toBe('eliminated')
    expect(status['Costa Rica']).toBe('eliminated')
  })

  it('eliminates a team locked out of the top two with games still to play', () => {
    // Group C: Bolivia have lost all three, so two group matches remain but
    // their fate does not depend on them.
    const status = eliminationStatus(withScores({ 5: [2, 0], 14: [2, 0], 22: [0, 2], 6: [1, 1] }))
    expect(status['Bolivia']).toBe('eliminated')
    for (const t of ['Panama', 'United States', 'Uruguay']) expect(status[t], t).toBe('alive')
  })

  it('eliminates on goal difference, not just on points — the exact check earning its keep', () => {
    // Group A with only Canada v Chile (M18) left. Argentina have won the group
    // on 9. Canada, Peru and Chile can all finish on 3, so a points-only bound
    // would keep Peru alive — but Peru have played out their three games on
    // GD −2, and the only completion that leaves them level on points is a Chile
    // win, which by construction lifts Chile's goal difference above theirs.
    // CONMEBOL puts overall GD immediately after points (the Euro puts
    // head-to-head there first), so this is decided before any H2H comparison.
    const matches = withScores({ 1: [2, 0], 9: [0, 2], 17: [2, 0], 2: [1, 0], 10: [0, 1] })
    const status = eliminationStatus(matches)
    expect(status['Peru']).toBe('eliminated')
    // The other three are genuinely still contesting second place.
    expect(status['Canada']).toBe('alive')
    expect(status['Chile']).toBe('alive')
    expect(status['Argentina']).toBe('alive')
  })
})

describe('eliminationStatus — conservative when it cannot enumerate', () => {
  it('claims nothing on a blank board (scoreline space over budget)', () => {
    // Six unplayed matches per group is far beyond the enumeration budget, so
    // the module must stay silent rather than guess. Never a false elimination.
    const status = eliminationStatus(MATCHES)
    expect(Object.keys(status).sort()).toEqual([...ALL_NAMES].sort())
    for (const t of ALL_NAMES) expect(status[t], t).toBe('alive')
    expect(survivingTeams(MATCHES)).toHaveLength(ALL_NAMES.length)
  })
})

describe('isAlive — single-team helper', () => {
  it('agrees with the full status map, both ways', () => {
    const matches = withScores(REAL_FINAL)
    expect(isAlive(matches, 'Argentina')).toBe(true)
    expect(isAlive(matches, 'Bolivia')).toBe(false)
    // An unknown name has no verdict, so it is not "eliminated" — the helper
    // must not invent one.
    expect(isAlive(matches, 'Nobody FC')).toBe(true)
  })
})
