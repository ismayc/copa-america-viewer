import { describe, it, expect } from 'vitest'
import { MATCHES } from '../src/data/matches.js'
import { TEAMS } from '../src/data/teams.js'
import { computeClinch } from '../src/utils/clinch.js'
import { decideMatch, resolveKnockoutSlots, resolveBracket } from '../src/utils/bracketResolve.js'
import { unscored } from './helpers/tournament.js'
import { FINAL_GROUP_RESULTS } from './fixtures/final-group-results.js'

const GROUPS = Object.keys(TEAMS)
// Copa's knockout slots come in exactly two shapes: a group slot (filled by the
// clinch engine) and a feed slot (filled from a finished tie). There is no
// "3rd Group X/Y/Z" form — that is the Euro's best-thirds race, which this
// format has no equivalent of.
const ANY_PLACEHOLDER = /^(Winner|Runner-up) Group [A-D]$|^(Winner|Loser) Match \d+$/
const ALL_NAMES = new Set(Object.values(TEAMS).flat().map((t) => t.name))

// This edition is finished, so the committed schedule already holds every
// result. Tests about "before anything is played" must ask for a blank board.
const BLANK = unscored()

// A complete, tie-free group stage: a strict 9/6/3/0 hierarchy in every group
// (team index 0 strongest … 3 weakest), so each group's top two are unambiguous
// without invoking a single tie-breaker.
function buildComplete() {
  const score = {}
  for (const g of GROUPS) {
    const idx = Object.fromEntries(TEAMS[g].map((t, k) => [t.name, k]))
    for (const m of BLANK) {
      if (m.stage !== 'Group' || m.group !== g) continue
      score[m.num] = idx[m.t1] < idx[m.t2] ? [1, 0] : [0, 1]
    }
  }
  return BLANK.map((m) => (score[m.num] ? { ...m, score: score[m.num] } : m))
}

describe('decideMatch — winner/loser of a knockout tie', () => {
  it('takes the side with more goals', () => {
    expect(decideMatch({ t1: 'A', t2: 'B', score: [2, 1] })).toEqual({ winner: 'A', loser: 'B' })
    expect(decideMatch({ t1: 'A', t2: 'B', score: [1, 3] })).toEqual({ winner: 'B', loser: 'A' })
  })

  it('breaks a draw on penalties', () => {
    expect(decideMatch({ t1: 'A', t2: 'B', score: [1, 1], pens: [5, 4] })).toEqual({
      winner: 'A', loser: 'B',
    })
    expect(decideMatch({ t1: 'A', t2: 'B', score: [0, 0], pens: [2, 4] })).toEqual({
      winner: 'B', loser: 'A',
    })
  })

  it('returns null when not yet settled (drawn w/o pens, live, voided, unplayed)', () => {
    expect(decideMatch({ t1: 'A', t2: 'B', score: [1, 1] })).toBeNull() // drawn, no shootout yet
    expect(decideMatch({ t1: 'A', t2: 'B', score: [2, 1], live: { clock: "70'" } })).toBeNull()
    expect(decideMatch({ t1: 'A', t2: 'B', score: [2, 1], voided: true })).toBeNull()
    expect(decideMatch({ t1: 'A', t2: 'B' })).toBeNull() // no score
  })

  it('decides the real 2024 shootouts from the committed data', () => {
    const byNum = Object.fromEntries(MATCHES.map((m) => [m.num, m]))
    // Three of the four quarter-finals and the third-place play-off went to
    // penalties at 90 minutes — this edition played extra time in the Final ONLY.
    expect(decideMatch(byNum[25])).toEqual({ winner: 'Argentina', loser: 'Ecuador' })
    expect(decideMatch(byNum[26])).toEqual({ winner: 'Canada', loser: 'Venezuela' })
    expect(decideMatch(byNum[27])).toEqual({ winner: 'Uruguay', loser: 'Brazil' })
    expect(decideMatch(byNum[31])).toEqual({ winner: 'Uruguay', loser: 'Canada' })
    // The Final was won in extra time, with no shootout: `aet` with no `pens`,
    // decided by the score alone.
    expect(byNum[32].aet).toBe(true)
    expect(byNum[32].pens).toBeUndefined()
    expect(decideMatch(byNum[32])).toEqual({ winner: 'Argentina', loser: 'Colombia' })
  })
})

describe('resolveKnockoutSlots — propagate winners up the bracket', () => {
  it('feeds a round’s winners into the next round', () => {
    // Real Copa topology: SF 29 is "Winner Match 25 v Winner Match 26".
    const ms = [
      { num: 25, stage: 'QF', t1: 'Argentina', t2: 'Ecuador', score: [1, 1], pens: [4, 2] },
      { num: 26, stage: 'QF', t1: 'Venezuela', t2: 'Canada', score: [0, 1] },
      { num: 29, stage: 'SF', t1: 'Winner Match 25', t2: 'Winner Match 26' },
    ]
    const r = resolveKnockoutSlots(ms)
    const m29 = r.find((m) => m.num === 29)
    expect([m29.t1, m29.t2]).toEqual(['Argentina', 'Canada'])
  })

  it('routes semi-final winners into the final', () => {
    const ms = [
      { num: 29, stage: 'SF', t1: 'Argentina', t2: 'Canada', score: [2, 0] },
      { num: 30, stage: 'SF', t1: 'Uruguay', t2: 'Colombia', score: [0, 1] },
      { num: 32, stage: 'Final', t1: 'Winner Match 29', t2: 'Winner Match 30' },
    ]
    const r = resolveKnockoutSlots(ms)
    const final = r.find((m) => m.num === 32)
    expect([final.t1, final.t2]).toEqual(['Argentina', 'Colombia'])
  })

  it('routes the beaten semi-finalists into the third-place play-off', () => {
    // The LOSER feed form, which the Euro sibling never exercises — it dropped
    // the third-place play-off after 1980. Copa still plays it, as match 31.
    const ms = [
      { num: 29, stage: 'SF', t1: 'Argentina', t2: 'Canada', score: [2, 0] },
      { num: 30, stage: 'SF', t1: 'Uruguay', t2: 'Colombia', score: [0, 1] },
      { num: 31, stage: '3rd', t1: 'Loser Match 29', t2: 'Loser Match 30' },
    ]
    const third = resolveKnockoutSlots(ms).find((m) => m.num === 31)
    expect([third.t1, third.t2]).toEqual(['Canada', 'Uruguay'])
  })

  it('leaves a slot as a placeholder while its tie is unsettled', () => {
    const ms = [
      { num: 25, stage: 'QF', t1: 'Argentina', t2: 'Ecuador', score: [1, 1] }, // drawn, no pens
      { num: 29, stage: 'SF', t1: 'Winner Match 25', t2: 'Winner Match 26' },
    ]
    const r = resolveKnockoutSlots(ms)
    expect(r.find((m) => m.num === 29).t1).toBe('Winner Match 25')
    // Original array returned untouched when nothing resolves.
    expect(resolveKnockoutSlots(ms)).toEqual(ms)
  })

  it('does NOT advance a LIVE knockout — even one with a leading score — until full time', () => {
    const live = [
      { num: 25, stage: 'QF', t1: 'Argentina', t2: 'Ecuador', score: [1, 2], live: { clock: "70'" } },
      { num: 29, stage: 'SF', t1: 'Winner Match 25', t2: 'Winner Match 26' },
    ]
    const r = resolveKnockoutSlots(live)
    expect(r.find((m) => m.num === 29).t1).toBe('Winner Match 25')
    expect(resolveKnockoutSlots(live)).toEqual(live) // nothing resolved → untouched

    // The instant the SAME score goes final (live cleared), it propagates.
    const finalized = live.map((m) => (m.num === 25 ? { ...m, live: undefined } : m))
    expect(resolveKnockoutSlots(finalized).find((m) => m.num === 29).t1).toBe('Ecuador')
  })
})

describe('resolveBracket — full pipeline', () => {
  it('leaves all knockout placeholders intact before anything is played', () => {
    expect(resolveBracket(BLANK, {})).toBe(BLANK)
  })

  it('fills the entire quarter-final round once the group stage is complete', () => {
    const complete = buildComplete()
    const clinch = computeClinch(complete)
    const resolved = resolveBracket(complete, clinch)
    const qf = resolved.filter((m) => m.stage === 'QF')
    expect(qf).toHaveLength(4)
    for (const m of qf) {
      expect(ANY_PLACEHOLDER.test(m.t1)).toBe(false)
      expect(ANY_PLACEHOLDER.test(m.t2)).toBe(false)
    }
  })

  it('plays a full bracket end-to-end (incl. a shootout) to a single champion', () => {
    const clinch = computeClinch(buildComplete())
    let cur = resolveBracket(buildComplete(), clinch)

    // Repeatedly: assign a result to every ready-but-unplayed knockout tie, then
    // re-resolve so winners feed the next round. Match 25 and a semi-final go to
    // penalties, exercising the shootout path.
    for (let pass = 0; pass < 10; pass++) {
      let changed = false
      cur = cur.map((m) => {
        if (m.stage === 'Group' || Array.isArray(m.score)) return m
        if (!ALL_NAMES.has(m.t1) || !ALL_NAMES.has(m.t2)) return m
        changed = true
        if (m.num === 25 || m.num === 29) return { ...m, score: [1, 1], pens: [4, 2] }
        return { ...m, score: [1, 0] } // home side advances
      })
      cur = resolveBracket(cur, clinch)
      if (!changed) break
    }

    // Eight knockout matches: 4 QF + 2 SF + the third-place play-off + the Final.
    const ko = cur.filter((m) => m.stage !== 'Group')
    expect(ko).toHaveLength(8)
    for (const m of ko) {
      expect(ALL_NAMES.has(m.t1), `M${m.num} t1`).toBe(true)
      expect(ALL_NAMES.has(m.t2), `M${m.num} t2`).toBe(true)
    }
    expect(decideMatch(cur.find((m) => m.stage === 'Final'))).not.toBeNull()
    // The play-off resolved too, from the LOSER feeds rather than the winners.
    expect(decideMatch(cur.find((m) => m.stage === '3rd'))).not.toBeNull()
  })

  it('propagates REAL quarter-final winners through the bracket (frozen group results)', () => {
    const scores = Object.assign({}, ...Object.values(FINAL_GROUP_RESULTS).map((r) => r.scores))
    const seeded = BLANK.map((m) => (scores[m.num] ? { ...m, score: scores[m.num] } : m))
    const clinch = computeClinch(seeded)
    let cur = resolveBracket(seeded, clinch)

    // Knockout sim on the REAL group outcome: home side advances, except M25,
    // which goes to a shootout to exercise the penalty path.
    for (let pass = 0; pass < 10; pass++) {
      let changed = false
      cur = cur.map((m) => {
        if (m.stage === 'Group' || Array.isArray(m.score)) return m
        if (!ALL_NAMES.has(m.t1) || !ALL_NAMES.has(m.t2)) return m
        changed = true
        return m.num === 25 ? { ...m, score: [1, 1], pens: [4, 2] } : { ...m, score: [1, 0] }
      })
      cur = resolveBracket(cur, clinch)
      if (!changed) break
    }

    const byNum = Object.fromEntries(cur.map((m) => [m.num, m]))
    // The real group stage sends Argentina (winner A) against Ecuador (runner-up
    // B) in M25 and Venezuela (winner B) against Canada (runner-up A) in M26 —
    // and SF 29 is "Winner Match 25 v Winner Match 26", so the two meet there.
    expect([byNum[25].t1, byNum[25].t2]).toEqual(['Argentina', 'Ecuador'])
    expect([byNum[26].t1, byNum[26].t2]).toEqual(['Venezuela', 'Canada'])
    expect([byNum[29].t1, byNum[29].t2]).toEqual(['Argentina', 'Venezuela'])
    // …and the two beaten semi-finalists drop into the third-place play-off.
    expect([byNum[31].t1, byNum[31].t2]).toEqual(['Venezuela', 'Colombia'])

    for (const m of cur.filter((x) => x.stage !== 'Group')) {
      expect(ALL_NAMES.has(m.t1) && ALL_NAMES.has(m.t2), `M${m.num}`).toBe(true)
    }
    expect(decideMatch(byNum[32])).not.toBeNull()
  })
})
