// EXACT quarter-final outlook by full enumeration of remaining GOAL DIFFERENCES.
//
// Walking only win/draw/loss (a single one-goal scoreline per game) collapses
// goal difference — and under CONMEBOL's tie-breakers goal difference is the
// FIRST thing that separates teams level on points, so a W/D/L walk couldn't
// tell whether a second-placed team finishes above or below a rival. We
// therefore enumerate each remaining game's MARGIN over an adaptive range
// (±cap), so the tie-breakers resolve with real proportions.
//
// Tractability: enumerating every margin combination directly is (2·cap+1)^games
// (e.g. 17^8 ≈ 7 billion). Instead we decompose per group — each group's
// remaining games are enumerated locally, and the many margin combinations that
// yield the SAME (winner, runner-up) pair are collapsed into one weighted
// outcome. The cross-group step then iterates the cartesian product of those
// DISTINCT per-group outcomes (small, since only two names matter per group),
// accumulating the product of weights. The reported percentage for a slot is
// weighted-count / total, where total = Π (2·cap+1)^(remaining games in group) —
// i.e. every margin combination counts equally (a combinatorial proportion, NOT
// a forecast).
//
// The collapse is much coarser here than in the Euro sibling, and that is the
// format's doing: with no best-third race, nothing outside (winner, runner-up)
// can affect a quarter-final slot, so a group's third-place profile — which the
// Euro must carry through the whole cartesian — is simply irrelevant.
//
// Conventions:
//  • Goals are taken to equal the margin (win by k → k–0, draw → 0–0). Goal
//    DIFFERENCE is therefore exact; goals-SCORED (the next tie-breaker) follows
//    this convention — a small residual approximation only when teams are level
//    on points AND goal difference.
//  • cap is adaptive: large enough to cover any tie-breaker-relevant margin
//    (≥8, like the clinch engine), but lowered automatically if the distinct-
//    outcome cartesian would be too large to walk.

import { MATCHES } from '../data/matches.js'
import { TEAMS } from '../data/teams.js'
import { rankGroup } from './qualification.js'
import { entryMatches, slotLabels, WINNER_GROUP, RUNNERUP_GROUP } from './slots.js'

const GROUPS = Object.keys(TEAMS)

// Largest distinct-outcome cartesian we'll walk before lowering the cap.
const MAX_ITERS = 12_000_000

function parseSlot(label) {
  const w = WINNER_GROUP.exec(label)
  if (w) return { type: 'winner', group: w[1] }
  const r = RUNNERUP_GROUP.exec(label)
  /* v8 ignore next -- defensive: the slots come from the committed schedule, where every entry-round side is a group winner or runner-up */
  if (!r) return { type: 'other' }
  return { type: 'runner', group: r[1] }
}

const ENTRY = entryMatches(MATCHES).map((m) => ({
  num: m.num,
  sides: slotLabels(m).map(parseSlot),
}))

export const ENTRY_SLOT_LABELS = Object.fromEntries(
  entryMatches(MATCHES).map((m) => [m.num, slotLabels(m)]),
)

const isRemaining = (m) => m.stage === 'Group' && !m.voided && !(Array.isArray(m.score) && !m.live)

export function countRemaining(matches) {
  return matches.filter(isRemaining).length
}

// A scoreline realising a given margin under the goals=margin convention.
const scoreForMargin = (d) => (d > 0 ? [d, 0] : d < 0 ? [0, -d] : [0, 0])

// Margin range to enumerate per game for the PERCENTAGES. A moderate ±8 keeps
// the proportions meaningful (a huge cap would dilute every share with
// unrealistic blow-outs) while still covering the goal-difference swings that
// decide almost every realistic runner-up race. The rare path that needs a
// bigger swing than this isn't lost: the exact "still alive" net
// (eliminationCheck, which uses a clinch-sized cap) catches it and flags it
// "<1%". chooseCaps lowers this only if the cartesian would be too large.
const BASE_CAP = 8
function baseCap() {
  return BASE_CAP
}

// Precompute every group's possible (winner, runner-up) pair at the given margin
// cap, COLLAPSING margin combinations that produce identical pairs into a single
// weighted outcome. Completed groups yield one outcome (weight 1).
function groupOutcomes(matches, cap) {
  const margins = []
  for (let d = -cap; d <= cap; d++) margins.push(d)
  const out = {}
  for (const g of GROUPS) {
    const all = matches.filter((m) => m.stage === 'Group' && m.group === g)
    const played = all.filter((m) => !isRemaining(m) && Array.isArray(m.score))
    const remaining = all.filter(isRemaining)
    const map = new Map()
    const pat = new Array(remaining.length)
    const visit = (i) => {
      if (i === remaining.length) {
        const synthetic = played.concat(
          remaining.map((m, ix) => ({ ...m, score: scoreForMargin(pat[ix]) })),
        )
        const o = rankGroup(g, synthetic)
        const key = `${o[0].name}|${o[1].name}`
        const e = map.get(key)
        if (e) e.weight++
        else map.set(key, { w: o[0].name, r: o[1].name, weight: 1 })
        return
      }
      for (const d of margins) {
        pat[i] = d
        visit(i + 1)
      }
    }
    visit(0)
    out[g] = [...map.values()]
  }
  return out
}

// Tally the distinct-outcome cartesian size and the weighted total for a cap.
function atCap(matches, cap) {
  const go = groupOutcomes(matches, cap)
  let iters = 1
  let total = 1
  for (const g of GROUPS) {
    iters *= go[g].length
    total *= go[g].reduce((s, o) => s + o.weight, 0)
  }
  return { cap, go, iters, total }
}

// Use fixedCap verbatim (tests), else pick the largest adaptive cap whose
// distinct-outcome cartesian stays within MAX_ITERS (floor of 3).
//
// With four groups of four the cartesian cannot overflow: each group has at most
// 12 distinct reachable outcomes, so the whole product tops out at 12^4 = 20,736
// — three orders of magnitude below MAX_ITERS, even from a completely unplayed
// board. The loop therefore always returns on its first pass here, and the
// walk-down-to-3 fallback is unreachable. It is kept because it is the correct
// behaviour for a bigger field (the Euro sibling's six groups DO overflow), and
// because a future edition could expand. test/cov-outlook-enum.test.js asserts
// the ceiling that makes it unreachable, so if that stops holding the ignore
// below is the thing to remove first.
function chooseCaps(matches, fixedCap) {
  if (fixedCap != null) return atCap(matches, fixedCap)
  let last = null
  for (let cap = baseCap(matches); cap >= 3; cap--) {
    last = atCap(matches, cap)
    /* v8 ignore next -- unreachable with 4 groups of 4: the first pass is always within MAX_ITERS, so the loop never comes round again; see the note above */
    if (last.iters <= MAX_ITERS) return last
  }
  /* v8 ignore start -- unreachable with 4 groups of 4; see the note above */
  return last
  /* v8 ignore stop */
}

// Size of the distinct-outcome cartesian we actually walk, at the adaptive cap —
// for the progress display / "too big" gate.
export function countIterations(matches) {
  return chooseCaps(matches).iters
}

// Enumerate all distinct per-group outcome combinations and tally each
// quarter-final slot, weighted by how many margin combinations each represents.
// Returns { total, remaining, cap, perMatch } where perMatch[num] = [sideDist,
// sideDist], a sideDist = { locked: team|null, candidates: [{team, count, pct}]
// (desc) }. `fixedCap` forces a specific cap (used by the correctness tests).
export function enumerateOutlook(matches, onProgress, fixedCap) {
  const remaining = countRemaining(matches)
  const { cap, go, iters, total } = chooseCaps(matches, fixedCap)
  const order = GROUPS

  const counts = {}
  for (const m of ENTRY) counts[m.num] = [new Map(), new Map()]

  const idx = new Array(order.length).fill(0)
  const W = {}
  const R = {}
  let done = 0
  const STEP = 50000

  for (;;) {
    let weight = 1
    for (let gi = 0; gi < order.length; gi++) {
      const o = go[order[gi]][idx[gi]]
      W[order[gi]] = o.w
      R[order[gi]] = o.r
      weight *= o.weight
    }

    for (const m of ENTRY) {
      for (let side = 0; side < 2; side++) {
        const s = m.sides[side]
        // Every entry-round side is a group winner or runner-up (parseSlot
        // above), and every group contributes an outcome naming both, so there
        // is always a team here.
        const team = s.type === 'winner' ? W[s.group] : R[s.group]
        const mp = counts[m.num][side]
        mp.set(team, (mp.get(team) || 0) + weight)
      }
    }

    done++
    /* v8 ignore next -- unreachable in this edition: the heartbeat fires every 50,000 combinations, and four groups of four never produce that many; the final onProgress below is the only one this tournament reaches */
    if (onProgress && done % STEP === 0) onProgress(done, iters)

    let k = order.length - 1
    while (k >= 0) {
      idx[k]++
      if (idx[k] < go[order[k]].length) break
      idx[k] = 0
      k--
    }
    if (k < 0) break
  }
  if (onProgress) onProgress(iters, iters)

  const perMatch = {}
  for (const m of ENTRY) {
    perMatch[m.num] = counts[m.num].map((mp) => {
      const candidates = [...mp.entries()]
        .map(([team, count]) => ({ team, count, pct: count / total }))
        .sort((a, b) => b.count - a.count)
      const locked = candidates.length === 1 && candidates[0].count === total ? candidates[0].team : null
      return { locked, candidates }
    })
  }
  return { total, remaining, cap, perMatch }
}
