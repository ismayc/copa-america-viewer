import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { TEAMS } from '../src/data/teams.js'
import {
  computeClinch,
  resolveClinchedSlots,
  resolveRunnerUpSlots,
  groupRunnersUp,
  groupWinners,
  newlyClinched,
  clinchHeadline,
  clinchBadge,
  groupPositionBounds,
} from '../src/utils/clinch.js'

const GROUPS = Object.keys(TEAMS)

// Apply a { matchNum: [g1, g2] } map onto a clone of the real schedule.
function withScores(scoreByNum) {
  return MATCHES.map((m) => (scoreByNum[m.num] ? { ...m, score: scoreByNum[m.num] } : m))
}

describe('clinch — within a single group', () => {
  // Group A fixtures: M1 Argentina v Canada, M2 Peru v Chile, M9 Chile v Argentina,
  // M10 Peru v Canada, M17 Argentina v Peru, M18 Canada v Chile.
  it('flags a guaranteed group winner as won-group', () => {
    // Argentina win both their played matches; nobody else can reach 6 points.
    const status = computeClinch(
      withScores({
        1: [3, 0], // Argentina 3–0 Canada
        9: [0, 3], // Chile 0–3 Argentina
        2: [0, 0], // Peru 0–0 Chile
        10: [0, 0], // Peru 0–0 Canada
      }),
    )
    expect(status['Argentina']).toBe('won-group')
    // The other three are still contesting 2nd — never falsely "through" or "out".
    expect(status['Peru']).toBeNull()
    expect(status['Canada']).toBeNull()
    expect(status['Chile']).toBeNull()
  })

  it('flags two teams clear of the field as top2 (through, group order open)', () => {
    // Argentina and Peru both 6 pts; Canada/Chile can reach only 3.
    const status = computeClinch(
      withScores({
        1: [1, 0], // Argentina 1–0 Canada
        9: [0, 1], // Chile 0–1 Argentina
        2: [1, 0], // Peru 1–0 Chile
        10: [1, 0], // Peru 1–0 Canada
      }),
    )
    expect(status['Argentina']).toBe('top2')
    expect(status['Peru']).toBe('top2')
    // Copa has NO best-third route, so being locked out of the top two IS
    // elimination — the same board in the Euro sibling would leave these two
    // alive on a cross-group third-place bound. This is the difference worth
    // asserting: only two teams per group go through, full stop.
    expect(status['Canada']).toBe('eliminated')
    expect(status['Chile']).toBe('eliminated')
  })

  it('flags a team locked into EXACTLY 2nd as the group runner-up (a game still to play)', () => {
    // Argentina win all three → 9 pts, 1st locked. Canada are also done: beat
    // Peru and Chile, lost only to Argentina → 6 pts. The one fixture left
    // (Peru v Chile) can lift neither above 3 — so Canada is pinned to 2nd while
    // a match is still outstanding. 'runner-up', not 'top2'.
    const status = computeClinch(
      withScores({
        1: [3, 0], // Argentina 3–0 Canada
        9: [0, 3], // Chile 0–3 Argentina
        17: [3, 0], // Argentina 3–0 Peru
        10: [0, 3], // Peru 0–3 Canada
        18: [3, 0], // Canada 3–0 Chile
        // M2 Peru v Chile still to play.
      }),
    )
    expect(status['Argentina']).toBe('won-group')
    expect(status['Canada']).toBe('runner-up')
    // Whoever wins the dead rubber tops out at 3 points — both are already out.
    expect(status['Chile']).toBe('eliminated')
    expect(status['Peru']).toBe('eliminated')
  })

  it('treats a live (in-progress) match as undecided, not a final result', () => {
    // Scores that, if all final, clinch the group for Argentina (6 pts; nobody
    // else can reach 6). M9 is Argentina's *current* match, shown LIVE at 0–3.
    const scores = {
      1: [3, 0], // Argentina 3–0 Canada (final)
      2: [0, 0], // Peru 0–0 Chile (final)
      10: [0, 0], // Peru 0–0 Canada (final)
      9: [0, 3], // Chile 0–3 Argentina (LIVE — running score)
    }
    // If the live game were counted as final, Argentina would read "won-group".
    expect(computeClinch(withScores(scores))['Argentina']).toBe('won-group')

    // But while it's live, the result isn't settled — no clinch yet.
    const live = withScores(scores).map((m) =>
      m.num === 9 ? { ...m, live: { clock: "60'", detail: '' } } : m,
    )
    expect(computeClinch(live)['Argentina']).toBeNull()
  })

  it('eliminates a team that has played out its group with nothing left to catch', () => {
    // Group C: Bolivia have played all three and lost the lot — to the United
    // States, to Uruguay and to Panama. With 0 points and no games left they
    // cannot be caught up from below, so they are locked into 4th while the
    // group's other places are still open.
    const status = computeClinch(
      withScores({
        5: [2, 0], // United States 2–0 Bolivia
        14: [2, 0], // Uruguay 2–0 Bolivia
        22: [0, 2], // Bolivia 0–2 Panama
        6: [1, 1], // Uruguay 1–1 Panama
      }),
    )
    expect(status['Bolivia']).toBe('eliminated')
    expect(status['Panama']).toBeNull()
    expect(status['United States']).toBeNull()
    expect(status['Uruguay']).toBeNull()
  })

  it('eliminates on points alone when the group is too open to enumerate exactly', () => {
    // Only three of Group A's six are played, so the scoreline enumeration is
    // over budget and the sound points-only bound has to carry the verdict.
    // Canada have played all three and lost all three; the other three teams are
    // already on 3 points apiece, so no result can lift Canada off the bottom.
    const status = computeClinch(
      withScores({
        1: [3, 0], // Argentina 3–0 Canada
        10: [3, 0], // Peru 3–0 Canada
        18: [0, 3], // Canada 0–3 Chile
        // M2, M9, M17 all still to play.
      }),
    )
    expect(status['Canada']).toBe('eliminated')
    // Everyone else is wide open — the fallback must not over-claim either way.
    expect(status['Argentina']).toBeNull()
    expect(status['Peru']).toBeNull()
    expect(status['Chile']).toBeNull()
  })

  it('does not claim a clinch while a rival can still overtake on points', () => {
    // Only matchday 1 played: far too open for anything to be locked.
    const status = computeClinch(
      withScores({
        1: [1, 0], // Argentina 1–0 Canada
        2: [0, 0], // Peru 0–0 Chile
      }),
    )
    for (const t of TEAMS['A']) expect(status[t.name]).toBeNull()
  })
})

describe('resolveClinchedSlots — fill knockout placeholders in the data', () => {
  it('rewrites "Winner Group X" to the clinched winner in every match (so all views agree)', () => {
    const clinch = { Argentina: 'won-group' }
    expect(groupWinners(clinch)).toEqual({ A: 'Argentina' })

    const resolved = resolveClinchedSlots(MATCHES, clinch)
    // M25's first side was the "Winner Group A" placeholder — now the data
    // itself says Argentina, so the bracket AND the detail modal show the same.
    expect(resolved.find((m) => m.num === 25).t1).toBe('Argentina')
    // Unclinched slots untouched.
    expect(resolved.find((m) => m.num === 26).t1).toBe('Winner Group B')
    expect(resolved.some((m) => m.t1 === 'Winner Group A' || m.t2 === 'Winner Group A')).toBe(false)
  })

  it('returns the original array untouched when nothing is clinched', () => {
    expect(resolveClinchedSlots(MATCHES, {})).toBe(MATCHES)
  })
})

describe('resolveRunnerUpSlots — fill the runner-up once a group is fully final', () => {
  // Group A all six matches final: Argentina 9, Canada 6, Chile 3, Peru 0 — so
  // Canada is the unambiguous runner-up (no tie-breaker).
  const groupAFinal = { 1: [2, 0], 9: [0, 2], 17: [2, 0], 10: [0, 2], 18: [2, 0], 2: [0, 2] }

  it('rewrites "Runner-up Group A" to the real team in every match', () => {
    const matches = withScores(groupAFinal)
    expect(groupRunnersUp(matches)).toEqual({ A: 'Canada' })

    const resolved = resolveRunnerUpSlots(matches)
    // M26 = "Winner Group B" vs "Runner-up Group A".
    const m26 = resolved.find((m) => m.num === 26)
    expect(m26.t2).toBe('Canada')
    // Group B isn't final, so its winner slot stays a placeholder.
    expect(m26.t1).toBe('Winner Group B')
    expect(resolved.some((m) => m.t1 === 'Runner-up Group A' || m.t2 === 'Runner-up Group A')).toBe(
      false,
    )
  })

  it('does NOT resolve while any group match is still live (score provisional)', () => {
    const live = withScores(groupAFinal).map((m) =>
      m.num === 17 ? { ...m, live: { clock: "70'", detail: '' } } : m,
    )
    expect(groupRunnersUp(live)).toEqual({})
    expect(resolveRunnerUpSlots(live).find((m) => m.num === 26).t2).toBe('Runner-up Group A')
  })

  it('returns the original array untouched when no group has settled', () => {
    expect(resolveRunnerUpSlots(MATCHES)).toBe(MATCHES)
  })
})

describe('newlyClinched — announce what a result settled (for the email)', () => {
  it('reports a team the latest result pushed over the line, with phrasing', () => {
    // Group A part-played; then M9 (Argentina beat Chile) is the freshly-synced
    // result that wins Argentina the group.
    const before = withScores({ 1: [2, 0], 2: [1, 1], 10: [1, 1] })
    const after = withScores({ 1: [2, 0], 2: [1, 1], 10: [1, 1], 9: [0, 1] })
    const changes = newlyClinched(before, after)
    expect(changes).toContainEqual({ team: 'Argentina', group: 'A', status: 'won-group' })
    expect(clinchHeadline({ team: 'Argentina', group: 'A', status: 'won-group' })).toBe(
      '🥇 Argentina have WON Group A',
    )
    expect(clinchHeadline({ team: 'Venezuela', group: 'B', status: 'runner-up' })).toBe(
      '🥈 Venezuela are THROUGH as Group B RUNNERS-UP',
    )
  })

  it('phrases every status, and falls back rather than dropping an unknown one', () => {
    // Copa's knockout starts at the quarter-finals, so "through" means QF — not
    // the round of 16 the 24-team Euro sibling advances to.
    expect(clinchHeadline({ team: 'Uruguay', group: 'C', status: 'top2' })).toBe(
      '✅ Uruguay are THROUGH to the quarter-finals (top two of Group C)',
    )
    expect(clinchHeadline({ team: 'Bolivia', group: 'C', status: 'eliminated' })).toBe(
      '❌ Bolivia are ELIMINATED from Group C',
    )
    // An unrecognised status still names the team rather than vanishing.
    expect(clinchHeadline({ team: 'Costa Rica', group: 'D', status: 'third' })).toBe(
      'Costa Rica (Group D): third',
    )
  })

  it('does not repeat a clinch that was already true before the result', () => {
    const settled = withScores({ 1: [2, 0], 2: [2, 1], 18: [1, 1], 11: [1, 0] })
    expect(newlyClinched(settled, settled)).toEqual([])
  })
})

describe('clinch — a complete group stage', () => {
  // Build a complete, tie-free group stage with a strict 9/6/3/0 hierarchy in
  // every group (team index 0 strongest … 3 weakest). Copa advances exactly two
  // per group with no cross-group comparison, so every group resolves on its own
  // and the expected picture is the same in all four.
  function buildComplete() {
    const score = {}
    for (const g of GROUPS) {
      const idx = Object.fromEntries(TEAMS[g].map((t, k) => [t.name, k]))
      for (const m of MATCHES) {
        if (m.stage !== 'Group' || m.group !== g) continue
        score[m.num] = idx[m.t1] < idx[m.t2] ? [1, 0] : [0, 1]
      }
    }
    return withScores(score)
  }

  it('matches the final qualification picture for every team', () => {
    const status = computeClinch(buildComplete())
    for (const g of GROUPS) {
      const [first, second, third, fourth] = TEAMS[g].map((t) => t.name)
      expect(status[first]).toBe('won-group')
      expect(status[second]).toBe('runner-up')
      // No best-thirds route in Copa: 3rd is out exactly like 4th.
      expect(status[third]).toBe('eliminated')
      expect(status[fourth]).toBe('eliminated')
    }
  })
})

describe('clinchBadge', () => {
  it('maps each status to a distinct badge, and unknown → null', () => {
    expect(clinchBadge('won-group')).toMatchObject({ cls: 'c-won', label: '🥇', text: 'Won group' })
    expect(clinchBadge('runner-up')).toMatchObject({
      cls: 'c-silver',
      label: '🥈',
      text: 'Group runner-up',
    })
    expect(clinchBadge('top2')).toMatchObject({ cls: 'c-in', text: 'Through' })
    // 'third' is a Euro/World Cup status with no Copa counterpart — if it ever
    // leaks in from a sibling it must NOT render as a qualification badge.
    expect(clinchBadge('third')).toBeNull()
    expect(clinchBadge('eliminated')).toMatchObject({ cls: 'c-out', text: 'Eliminated' })
    expect(clinchBadge(null)).toBeNull()
    expect(clinchBadge(undefined)).toBeNull()
    expect(clinchBadge('weird')).toBeNull()
  })
})

describe('groupWinners', () => {
  it('maps only won-group teams to their group letter', () => {
    const winners = groupWinners({
      Argentina: 'won-group',
      Uruguay: 'won-group',
      Mexico: 'top2',
      Bolivia: 'eliminated',
    })
    // Argentina→A, Uruguay→C; top2/eliminated excluded.
    expect(winners).toEqual({ A: 'Argentina', C: 'Uruguay' })
  })
  it('returns an empty object when nothing is clinched', () => {
    expect(groupWinners({})).toEqual({})
    expect(groupWinners(null)).toEqual({})
  })
})

describe('resolveClinchedSlots — leaves runner-up slots alone', () => {
  it('fills only the clinched Winner Group X slot, not the runner-up slots', () => {
    const resolved = resolveClinchedSlots(MATCHES, {
      Argentina: 'won-group',
      Ecuador: 'won-group',
    })
    const find = (num) => resolved.find((m) => m.num === num)
    expect(find(25).t1).toBe('Argentina') // Winner Group A
    expect(find(26).t1).toBe('Ecuador') // Winner Group B
    // Runner-up placeholders are untouched.
    expect(find(25).t2).toBe('Runner-up Group B')
    expect(find(26).t2).toBe('Runner-up Group A')
  })
})

describe('groupPositionBounds', () => {
  it('reads 1–4 for every team while nothing has been played (points fallback)', () => {
    // Six remaining games per group is far over the scoreline budget, so every
    // bound comes from the sound points-only pass — and with no results at all,
    // every position is genuinely open.
    const bounds = groupPositionBounds(MATCHES)
    for (const g of GROUPS) {
      for (const t of TEAMS[g]) expect(bounds[t.name]).toEqual({ best: 1, worst: 4 })
    }
  })

  it('is exact (goal difference and head-to-head included) when the group is enumerable', () => {
    // Group A with two games left (M2 Peru v Chile, M9 Chile v Argentina — an
    // enumerable fan-out): Canada played all three for 1 point, Argentina beat
    // Canada and Peru, Chile beat Canada, Peru drew Canada.
    const bounds = groupPositionBounds(
      withScores({ 1: [2, 0], 10: [1, 1], 18: [0, 1], 17: [1, 0] }),
    )
    expect(bounds['Argentina']).toEqual({ best: 1, worst: 2 })
    expect(bounds['Chile']).toEqual({ best: 1, worst: 3 })
    expect(bounds['Peru']).toEqual({ best: 2, worst: 4 })
    expect(bounds['Canada']).toEqual({ best: 3, worst: 4 })
  })

  it('locks every position once a group is complete — straight from the real results', () => {
    // The committed 2024 data: Group A finished Argentina 9, Canada 4, Chile 2,
    // Peru 1 — every finish locked to its real final position.
    const bounds = groupPositionBounds(PLAYED)
    expect(bounds['Argentina']).toEqual({ best: 1, worst: 1 })
    expect(bounds['Canada']).toEqual({ best: 2, worst: 2 })
    expect(bounds['Chile']).toEqual({ best: 3, worst: 3 })
    expect(bounds['Peru']).toEqual({ best: 4, worst: 4 })
  })
})

describe('newlyClinched — detects new verdicts and upgrades', () => {
  it('reports a newly eliminated team', () => {
    // Bolivia lose to the United States, then to Uruguay and Panama — three
    // defeats, no games left, so the last result locks them into 4th.
    const before = withScores({ 5: [2, 0], 6: [1, 1] })
    const after = withScores({ 5: [2, 0], 6: [1, 1], 14: [2, 0], 22: [0, 2] })
    const changes = newlyClinched(before, after)
    expect(changes).toContainEqual({ team: 'Bolivia', group: 'C', status: 'eliminated' })
  })

  it('reports an upgrade from top2 to won-group', () => {
    // before: Argentina & Peru both through (top2). after: Argentina has won it.
    const before = withScores({ 1: [1, 0], 9: [0, 1], 2: [1, 0], 10: [1, 0] })
    const after = withScores({ 1: [3, 0], 9: [0, 3], 2: [0, 0], 10: [0, 0] })
    expect(computeClinch(before)['Argentina']).toBe('top2')
    const changes = newlyClinched(before, after)
    expect(changes).toContainEqual({ team: 'Argentina', group: 'A', status: 'won-group' })
  })
})
