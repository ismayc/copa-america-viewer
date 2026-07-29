// Shared fixture helpers.
//
// This edition is FINISHED, so src/data/matches.js ships with every result in
// it. That is the one structural difference from the sibling world-cup-viewer,
// whose schedule was naturally score-free because it was built before its
// tournament — and it means a test that wants a pre-tournament board has to ask
// for one explicitly rather than getting it by default.

import { MATCHES } from '../../src/data/matches.js'
import { TEAMS } from '../../src/data/teams.js'

// The committed schedule with every result stripped: the state the app is in
// before a ball is kicked. Knockout sides revert to their drawn placeholders,
// since "Spain" only became the answer to "Winner Group B" by being played.
export function unscored(matches = MATCHES) {
  return matches.map((m) => {
    const { score, pens, aet, goals, live, statusLabel, cards, ...rest } = m
    if (m.label1) return { ...rest, t1: m.label1, t2: m.label2 }
    return rest
  })
}

// The committed schedule with results up to (but not including) match `num`.
// Useful for exercising mid-tournament states without inventing scores.
export function playedUpTo(num, matches = MATCHES) {
  const keep = new Set(matches.filter((m) => m.num <= num).map((m) => m.num))
  return unscored(matches).map((m) => (keep.has(m.num) ? matches.find((x) => x.num === m.num) : m))
}

// Overlay synthetic scores on one group's real fixtures, matching by team pair
// so the caller states results the natural way round.
export function withGroupScores(group, results, matches = MATCHES) {
  return matches.map((m) => {
    if (m.stage !== 'Group' || m.group !== group) return m
    const r = results.find(([h, a]) => (h === m.t1 && a === m.t2) || (h === m.t2 && a === m.t1))
    if (!r) return m
    const [h, , hg, ag] = r
    return { ...m, score: h === m.t1 ? [hg, ag] : [ag, hg] }
  })
}

// Same, but on an otherwise result-free board — so only this group has played.
export function onlyGroupScores(group, results) {
  return withGroupScores(group, results, unscored())
}

export const groupTeams = (g) => TEAMS[g].map((t) => t.name)
