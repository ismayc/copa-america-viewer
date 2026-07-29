import { describe, it, expect } from 'vitest'
import { projectKnockout } from '../src/utils/asItStands.js'
import { MATCHES as PLAYED, STAGE_ORDER } from '../src/data/matches.js'
import { TEAMS } from '../src/data/teams.js'
import { slotLabels, entryMatches, ENTRY_ROUND } from '../src/utils/slots.js'
import { computeQualification } from '../src/utils/qualification.js'
import { unscored, onlyGroupScores, groupTeams } from './helpers/tournament.js'

const MATCHES = unscored(PLAYED)
const GROUPS = Object.keys(TEAMS)

// With only the top two of each group advancing, the entry round is a fixed
// pairing of named slots — there is no cross-group third-place race and so no
// combination table (the Euro sibling needs UEFA's 15-row one here). These tests
// pin that structure and the projection built on it.
describe('the entry round is a closed set of winner/runner-up slots', () => {
  it('feeds every group winner and runner-up into a quarter-final, exactly once', () => {
    const entries = entryMatches(MATCHES)
    expect(ENTRY_ROUND).toBe('QF')
    expect(entries).toHaveLength(4)

    const slots = entries.flatMap((m) => slotLabels(m))
    expect(slots).toHaveLength(8)
    // Every slot names a group position; none is a third-place pool.
    expect(slots.every((s) => /^(Winner|Runner-up) Group [A-D]$/.test(s))).toBe(true)
    expect(slots.some((s) => /3rd/.test(s))).toBe(false)

    for (const g of GROUPS) {
      expect(slots.filter((s) => s === `Winner Group ${g}`)).toHaveLength(1)
      expect(slots.filter((s) => s === `Runner-up Group ${g}`)).toHaveLength(1)
    }
  })

  it('never pairs a group with itself', () => {
    for (const m of entryMatches(MATCHES)) {
      const [a, b] = slotLabels(m).map((s) => s.slice(-1))
      expect(a, `match ${m.num} pairs group ${a} with itself`).not.toBe(b)
    }
  })

  it('has no stage between the group stage and the quarter-finals', () => {
    expect(STAGE_ORDER.indexOf('QF')).toBe(STAGE_ORDER.indexOf('Group') + 1)
  })
})

describe('projectKnockout', () => {
  it('returns a row per group even before a ball is kicked', () => {
    const { perGroup } = projectKnockout(MATCHES)
    expect(Object.keys(perGroup).sort()).toEqual(GROUPS)
    // No "settled" flag is offered: an unplayed group still ranks 1–4 via the
    // lots stand-in, so any such flag would read true here and mean nothing.
    expect(projectKnockout(MATCHES)).not.toHaveProperty('complete')
  })

  it('projects from the current standings of BOTH groups in a tie, however provisional', () => {
    // Only Group A has played. Its winner and runner-up are real; the opponents
    // are whoever currently tops Group B, which is still only the lots stand-in.
    // The projection is a snapshot of "as it stands", not a claim that it's
    // settled — so it names those provisional opponents rather than blanking
    // them, and they must come from the paired group.
    const board = onlyGroupScores('A', [
      ['Argentina', 'Canada', 2, 0],
      ['Argentina', 'Chile', 2, 0],
      ['Argentina', 'Peru', 2, 0],
      ['Canada', 'Chile', 1, 0],
      ['Canada', 'Peru', 1, 0],
      ['Chile', 'Peru', 1, 0],
    ])
    const { perGroup } = projectKnockout(board)
    expect(perGroup.A.first.team).toBe('Argentina')
    expect(perGroup.A.second.team).toBe('Canada')
    // The match numbers are structural, so they are known immediately.
    expect(perGroup.A.first.matchNum).toBe(25)
    expect(perGroup.A.second.matchNum).toBe(26)
    // M25 is "Winner A v Runner-up B", M26 "Winner B v Runner-up A".
    const groupB = groupTeams('B')
    expect(groupB).toContain(perGroup.A.first.opponent)
    expect(groupB).toContain(perGroup.A.second.opponent)
    // And it is genuinely Group B's provisional order, not an arbitrary name.
    const qb = computeQualification(board).groups.B
    expect(perGroup.A.first.opponent).toBe(qb[1].name) // runner-up B
    expect(perGroup.A.second.opponent).toBe(qb[0].name) // winner B
  })

  it('agrees with the standings it is derived from', () => {
    const { perGroup } = projectKnockout(PLAYED)
    const qual = computeQualification(PLAYED)
    for (const g of GROUPS) {
      expect(perGroup[g].first.team).toBe(qual.groups[g][0].name)
      expect(perGroup[g].second.team).toBe(qual.groups[g][1].name)
    }
  })

  it('reproduces the real quarter-final line-up, with both sides of each tie agreeing', () => {
    const { perGroup } = projectKnockout(PLAYED)
    expect(perGroup.A.first).toMatchObject({ team: 'Argentina', opponent: 'Ecuador', matchNum: 25 })
    expect(perGroup.B.first).toMatchObject({ team: 'Venezuela', opponent: 'Canada', matchNum: 26 })
    expect(perGroup.C.first).toMatchObject({ team: 'Uruguay', opponent: 'Brazil', matchNum: 27 })
    expect(perGroup.D.first).toMatchObject({ team: 'Colombia', opponent: 'Panama', matchNum: 28 })

    // Each tie is projected from both ends; the two views must be mirror images.
    const sides = Object.values(perGroup).flatMap((p) => [p.first, p.second])
    for (const s of sides) {
      const other = sides.find((o) => o !== s && o.matchNum === s.matchNum)
      expect(other, `match ${s.matchNum} projected from only one side`).toBeTruthy()
      expect(other.team).toBe(s.opponent)
      expect(other.opponent).toBe(s.team)
    }
  })

  it('reads slot labels from the static schedule, not from resolved live teams', () => {
    // Once a group is decided the live feed rewrites "Winner Group A" to
    // "Argentina", which no longer parses as a slot. The projection must still
    // work — it looks the labels up by match number instead.
    const resolved = PLAYED.map((m) =>
      m.num === 25 ? { ...m, t1: 'Argentina', t2: 'Ecuador', label1: undefined, label2: undefined } : m,
    )
    const { perGroup } = projectKnockout(resolved)
    expect(perGroup.A.first).toMatchObject({ team: 'Argentina', matchNum: 25 })
  })
})
