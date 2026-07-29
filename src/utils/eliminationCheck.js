// EXACT "is this team still mathematically alive?" check — the companion to the
// Outlook's probability view, which deliberately can't answer this.
//
// The Outlook enumerates each remaining game's goal difference only up to a
// moderate cap (±8), because a huge cap would dilute every share with
// unrealistic blow-outs. A team whose only surviving path needs a bigger swing
// than that tallies 0% and vanishes from the Outlook even though it is NOT
// eliminated. This module answers the elimination question objectively instead
// of by proportion: it enumerates each group's remaining SCORELINES up to a
// generous cap — the same exact engine clinch.js uses — and applies the FULL
// CONMEBOL tie-breaker order, so the verdict is exact rather than a
// sound-but-loose bound.
//
// Copa América's format keeps this cheap AND local: only the top two of each
// group advance and there is no best-third race, so a team's fate depends on its
// own group alone. (The Euro sibling has to reason across all six groups here.)
// Early in the stage a group may exceed the budget, in which case we stay silent
// for it — conservative, never a false elimination.

import { TEAMS } from '../data/teams.js'
import { rankGroup, ADVANCING_PER_GROUP } from './qualification.js'
import { goalCap, scorelinesUpTo } from './clinch.js'

const GROUPS = Object.keys(TEAMS)
// Mirrors clinch.js: a group with a small remaining scoreline space is exact;
// anything larger falls back to a conservative "unknown" (claims no elimination).
const SCENARIO_BUDGET = 500000

const isDecided = (m) => m.score && !m.live && !m.voided

// Enumerate every completion of one group's remaining matches (exact scorelines,
// not just W/D/L) and collect each team's set of reachable finishing ranks.
// `feasible` is false when the scoreline space exceeds the budget.
function groupReach(group, matches) {
  const all = matches.filter((m) => m.stage === 'Group' && m.group === group)
  const played = all.filter(isDecided)
  const remaining = all.filter((m) => !isDecided(m))
  const names = TEAMS[group].map((t) => t.name)

  const cap = goalCap(rankGroup(group, played))
  const scorelines = scorelinesUpTo(cap)
  const total = remaining.length === 0 ? 1 : scorelines.length ** remaining.length
  if (total > SCENARIO_BUDGET) return { group, names, feasible: false }

  const ranks = {}
  for (const n of names) ranks[n] = new Set()

  const assign = new Array(remaining.length)
  const visit = (i) => {
    if (i === remaining.length) {
      const synthetic = played.concat(remaining.map((m, ix) => ({ ...m, score: assign[ix] })))
      rankGroup(group, synthetic).forEach((r, ix) => ranks[r.name].add(ix + 1))
      return
    }
    for (const s of scorelines) {
      assign[i] = s
      visit(i + 1)
    }
  }
  visit(0)

  return { group, names, feasible: true, complete: remaining.length === 0, ranks }
}

// Per-team verdict: 'eliminated' | 'alive'. 'alive' means there exists SOME
// completion of the remaining games in which the team finishes in its group's
// top two. Exact when the group is enumerable; otherwise conservative.
export function eliminationStatus(matches) {
  const status = {}
  for (const g of GROUPS) {
    const r = groupReach(g, matches)
    for (const name of r.names) {
      if (!r.feasible) {
        status[name] = 'alive' // too open to enumerate → never over-claim
        continue
      }
      const myRanks = r.ranks[name]
      let alive = false
      for (let rank = 1; rank <= ADVANCING_PER_GROUP; rank++) if (myRanks.has(rank)) alive = true
      status[name] = alive ? 'alive' : 'eliminated'
    }
  }
  return status
}

// Convenience: the set of teams that can still reach the quarter-finals
// (everyone not eliminated, which includes already-qualified teams).
export function survivingTeams(matches) {
  const status = eliminationStatus(matches)
  return Object.keys(status).filter((name) => status[name] !== 'eliminated')
}

// Single-team helper.
export function isAlive(matches, team) {
  return eliminationStatus(matches)[team] !== 'eliminated'
}
