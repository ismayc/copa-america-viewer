// "As it stands" — project the quarter-finals from the CURRENT group standings,
// so each group can show where its 1st and 2nd would land right now.
//
// With only the top two advancing, this is direct: every entry-round slot names
// a specific group's winner or runner-up, so the projection is a lookup into the
// live standings with no cross-group race to resolve. (The Euro sibling needs
// UEFA's third-place combination table plus a bipartite fallback here; Copa
// América has no equivalent, so neither does this file.)

import { MATCHES } from '../data/matches.js'
import { TEAMS } from '../data/teams.js'
import { computeQualification } from './qualification.js'
import { entryMatches, slotLabels, WINNER_GROUP, RUNNERUP_GROUP } from './slots.js'

const GROUPS = Object.keys(TEAMS)

// The slot labels ("Winner Group A") are invariant, but the LIVE matches we're
// handed have clinched winners already resolved to real teams (e.g. "Winner
// Group A" → "Argentina") — which would no longer parse as a slot. So read each
// entry-round match's slot labels from the STATIC schedule, by match number.
const ENTRY_SLOTS = new Map(entryMatches(MATCHES).map((m) => [m.num, slotLabels(m)]))

function parseSlot(label) {
  let m = WINNER_GROUP.exec(label)
  if (m) return { type: 'winner', group: m[1] }
  m = RUNNERUP_GROUP.exec(label)
  if (m) return { type: 'runner', group: m[1] }
  return { type: 'other', label }
}

// Returns { perGroup } where perGroup[g] = {
//   first / second: { team, opponent, matchNum } | null
// }.
//
// There is deliberately no "is the projection settled?" flag. rankGroup always
// returns four ordered rows — an unplayed group just orders by the drawing-of-
// lots stand-in — so "every side has a team" is true before a ball is kicked and
// would tell a caller nothing. A caller that needs to know whether a projection
// is final should ask computeQualification().completion for the groups involved,
// which is the question it actually means.
export function projectKnockout(matches) {
  const qual = computeQualification(matches)
  const first = {}
  const second = {}
  for (const g of GROUPS) {
    first[g] = qual.groups[g]?.[0] || null
    second[g] = qual.groups[g]?.[1] || null
  }

  // Every entry-round side, with its parsed slot, indexed by match.
  const sides = []
  for (const m of entryMatches(matches)) {
    const [t1, t2] = ENTRY_SLOTS.get(m.num) || slotLabels(m)
    sides.push({ matchNum: m.num, sideIdx: 0, slot: parseSlot(t1) })
    sides.push({ matchNum: m.num, sideIdx: 1, slot: parseSlot(t2) })
  }
  const byMatch = new Map()
  for (const s of sides) {
    if (!byMatch.has(s.matchNum)) byMatch.set(s.matchNum, [])
    byMatch.get(s.matchNum).push(s)
  }

  const teamForSide = (s) => {
    /* v8 ignore next -- unreachable: every entry match pushes exactly two sides, so opponentOf's find() always returns the sibling */
    if (!s) return null
    if (s.slot.type === 'winner') return first[s.slot.group]
    if (s.slot.type === 'runner') return second[s.slot.group]
    return null
  }
  const opponentOf = (s) => teamForSide((byMatch.get(s.matchNum) || []).find((o) => o !== s))

  const perGroup = {}
  for (const g of GROUPS) perGroup[g] = { first: null, second: null }

  for (const s of sides) {
    if (s.slot.type === 'other') continue
    const opp = opponentOf(s)
    const key = s.slot.type === 'winner' ? 'first' : 'second'
    const table = s.slot.type === 'winner' ? first : second
    perGroup[s.slot.group][key] = {
      team: table[s.slot.group]?.name || null,
      opponent: opp?.name || null,
      matchNum: s.matchNum,
    }
  }
  return { perGroup }
}
