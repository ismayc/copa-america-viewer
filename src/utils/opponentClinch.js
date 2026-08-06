// Knockout-opponent clinch detection.
//
// "Has team X clinched a specific quarter-final opponent?" is more than "has X
// advanced" — it asks whether the opponent is the SAME team in every remaining
// completion of the group stage. Being conservative (only certain once all
// groups finish) under-claims: a matchup can be mathematically locked while
// other groups are still playing — a Winner A v Runner-up B tie locks the moment
// Groups A and B are settled, whatever Groups C and D do.
//
// Copa América's format makes this a two-group question and nothing more. Every
// quarter-final slot is a group winner or a group runner-up (there is no
// best-third slot whose group depends on a cross-group race), so a team is
// handled here once its own finishing slot is fixed, and its opponent is locked
// exactly when the OTHER group's corresponding slot is itself clinched.

import { TEAMS } from '../data/teams.js'
import { MATCHES } from '../data/matches.js'
import { computeClinch } from './clinch.js'
import { entryMatches, slotLabels, WINNER_GROUP, RUNNERUP_GROUP } from './slots.js'

const GROUPS = Object.keys(TEAMS)
// Static entry-round slot labels by match number (the live feed resolves some to
// real team names, so always read the invariant labels from the static schedule).
const ENTRY = entryMatches(MATCHES).map((m) => ({ num: m.num, slots: slotLabels(m) }))

function parseSlot(label) {
  const w = WINNER_GROUP.exec(label)
  if (w) return { type: 'winner', group: w[1] }
  const r = RUNNERUP_GROUP.exec(label)
  /* v8 ignore next -- defensive: the slots come from the committed schedule, where every entry-round side is a group winner or runner-up */
  if (!r) return { type: 'other' }
  return { type: 'runner', group: r[1] }
}

// The locked quarter-final opponent for `team`, or null if it isn't
// mathematically fixed yet. `clinch` may be passed in to avoid recomputing it —
// useful when resolving many teams at once.
export function lockedOpponent(matches, team, clinch = computeClinch(matches)) {
  const status = clinch[team]
  // Only a fixed finishing slot gives a determinate matchup to resolve.
  if (status !== 'won-group' && status !== 'runner-up') return null
  const group = GROUPS.find((g) => TEAMS[g].some((t) => t.name === team))
  /* v8 ignore next -- unreachable: `team` comes from a clinch verdict, which is only ever keyed by a team that is in a group */
  if (!group) return null
  const mySlot = status === 'won-group' ? `Winner Group ${group}` : `Runner-up Group ${group}`

  const match = ENTRY.find((m) => m.slots.includes(mySlot))
  /* v8 ignore next -- unreachable: the status checked above is won-group or runner-up, and every group's winner and runner-up has an entry-round slot */
  if (!match) return null
  const oppLabel = match.slots[0] === mySlot ? match.slots[1] : match.slots[0]
  const slot = parseSlot(oppLabel)
  /* v8 ignore next -- unreachable: parseSlot's 'other' branch is defensive */
  if (slot.type === 'other') return null

  const want = slot.type === 'winner' ? 'won-group' : 'runner-up'
  const opp = TEAMS[slot.group].map((t) => t.name).find((n) => clinch[n] === want)
  return opp ? { opponent: opp, matchNum: match.num } : null
}
