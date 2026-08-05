// Group ranking + qualification using CONMEBOL's official Copa América 2024
// tie-breakers. Criteria, applied to teams level on points:
//   1. Points in all group matches
//   Then, among teams still level, over ALL group matches:
//   2. Goal difference
//   3. Goals scored
//   Then, among teams still level, over matches BETWEEN THEM only:
//   4. Head-to-head points
//   5. Head-to-head goal difference
//   6. Head-to-head goals scored
//   Then:
//   7. Fewest red cards
//   8. Fewest yellow cards
//   9. Drawing of lots
//
// NOTE the order: overall goal difference comes BEFORE head-to-head. That is the
// opposite of the Euro (and of the 2026 World Cup), and it is the single most
// important structural difference between this file and its sibling in
// football-euros-viewer. Getting it backwards silently reorders any group where
// two level teams drew with each other.
//
// Criteria 7–8 are computed BEST-EFFORT from ESPN's card feed, as a single
// `conduct` score (see conductDelta) so that one comparison expresses the
// two-level "reds, then yellows" rule. ESPN can't always tell a second yellow
// from a direct red, and a card-less match scores 0, so treat it as approximate.
//
// Criterion 9 is a drawing of lots, which is an event and not a computation. A
// stable alphabetical order stands in for it so the table is deterministic, and
// the tie-break explainer says outright that the real tie would go to lots.
//
// Only the TOP TWO of each group advance — straight to the quarter-finals. There
// is no best-third qualification (the Euro's `bestThirds` machinery has no
// counterpart here): a group's 3rd and 4th are eliminated.

import { TEAMS } from '../data/teams.js'

const GROUPS = Object.keys(TEAMS)
const GROUP_MATCH_COUNT = 6 // 4 teams => 6 matches per group

// How many teams advance from each group. Four groups of four, top two each —
// the eight quarter-finalists. The single source of truth for the clinch,
// elimination and projection engines, which all import it from here.
export const ADVANCING_PER_GROUP = 2

// Criterion 9 stand-in: CONMEBOL settles a total tie by drawing lots, which no
// viewer can compute. Alphabetical order keeps the table stable and repeatable;
// utils/tiebreakNotes.js surfaces "would have gone to lots" wherever it bites.
export const byLots = (a, b) => a.localeCompare(b)

function blank(team, group) {
  return { ...team, group, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0, conduct: 0 }
}

// Disciplinary score for criteria 7–8 (fewest reds, then fewest yellows), packed
// into ONE number so it slots into the comparator chain like every other
// criterion. A red is worth 100 yellows — far more than the ~20 yellows a side
// can collect in three group games — so the encoding is exactly lexicographic:
// reds decide first, yellows only break a red-count tie. Kept negative so that,
// like every other criterion, higher sorts first.
//
// Best-effort: ESPN's feed flags yellow/red only. A second yellow arrives as a
// red, which CONMEBOL also counts as a dismissal, so that costs nothing; but a
// match with no card data scores 0, so treat the value as an approximation
// rather than gospel.
function conductDelta(cards) {
  if (!Array.isArray(cards)) return 0
  return cards.reduce((s, c) => s + (c.color === 'red' ? -100 : -1), 0)
}

function baseStats(group, matches) {
  const rows = {}
  for (const t of TEAMS[group]) rows[t.name] = blank(t, group)
  for (const m of matches) {
    if (m.stage !== 'Group' || m.group !== group || !m.score || m.voided) continue
    const [g1, g2] = m.score
    const a = rows[m.t1]
    const b = rows[m.t2]
    if (!a || !b) continue
    a.P++; b.P++
    a.GF += g1; a.GA += g2
    b.GF += g2; b.GA += g1
    a.conduct += conductDelta(m.cards?.t1)
    b.conduct += conductDelta(m.cards?.t2)
    if (g1 > g2) { a.W++; b.L++; a.Pts += 3 }
    else if (g1 < g2) { b.W++; a.L++; b.Pts += 3 }
    else { a.D++; b.D++; a.Pts++; b.Pts++ }
  }
  for (const k in rows) rows[k].GD = rows[k].GF - rows[k].GA
  return rows
}

// Head-to-head sub-table among exactly the given (tied) team names.
export function headToHead(names, group, matches) {
  const set = new Set(names)
  const sub = {}
  for (const n of names) sub[n] = { Pts: 0, GD: 0, GF: 0 }
  for (const m of matches) {
    if (m.stage !== 'Group' || m.group !== group || !m.score) continue
    if (!set.has(m.t1) || !set.has(m.t2)) continue
    const [g1, g2] = m.score
    sub[m.t1].GF += g1; sub[m.t2].GF += g2
    sub[m.t1].GD += g1 - g2; sub[m.t2].GD += g2 - g1
    if (g1 > g2) sub[m.t1].Pts += 3
    else if (g1 < g2) sub[m.t2].Pts += 3
    else { sub[m.t1].Pts++; sub[m.t2].Pts++ }
  }
  return sub
}

// Order teams that are level on points per CONMEBOL's criteria: overall goal
// difference and goals scored FIRST, and only then the head-to-head sub-table
// among whatever teams are still exactly level.
function resolveLevelOnPoints(tied, group, matches) {
  /* v8 ignore next -- unreachable: the sole caller below only calls this when tied.length > 1 */
  if (tied.length === 1) return tied

  // Criteria 2–3: overall goal difference, then overall goals scored.
  const sorted = [...tied].sort((a, b) => b.GD - a.GD || b.GF - a.GF)

  const out = []
  let i = 0
  while (i < sorted.length) {
    let j = i + 1
    while (j < sorted.length && sorted[j].GD === sorted[i].GD && sorted[j].GF === sorted[i].GF) j++
    const cluster = sorted.slice(i, j)
    if (cluster.length > 1) {
      // Criteria 4–6, on a sub-table of only these still-level teams, then the
      // card score, then the stand-in for the drawing of lots.
      const sub = headToHead(cluster.map((t) => t.name), group, matches)
      out.push(
        ...[...cluster].sort(
          (a, b) =>
            sub[b.name].Pts - sub[a.name].Pts ||
            sub[b.name].GD - sub[a.name].GD ||
            sub[b.name].GF - sub[a.name].GF ||
            b.conduct - a.conduct ||
            byLots(a.name, b.name),
        ),
      )
    } else {
      out.push(...cluster)
    }
    i = j
  }
  return out
}

export function rankGroup(group, matches) {
  const rows = Object.values(baseStats(group, matches))
  // Criterion 1: points. Then break ties among teams level on points with the
  // CONMEBOL order (overall goal difference BEFORE head-to-head).
  rows.sort((a, b) => b.Pts - a.Pts)

  const ordered = []
  let i = 0
  while (i < rows.length) {
    let j = i + 1
    while (j < rows.length && rows[j].Pts === rows[i].Pts) j++
    const tied = rows.slice(i, j)
    ordered.push(...(tied.length > 1 ? resolveLevelOnPoints(tied, group, matches) : tied))
    i = j
  }
  return ordered.map((r, idx) => ({ ...r, rank: idx + 1 }))
}

export function groupComplete(group, matches) {
  return (
    matches.filter((m) => m.stage === 'Group' && m.group === group && m.score).length >=
    GROUP_MATCH_COUNT
  )
}

// Full tournament qualification picture. Simpler than the Euro's: with no
// cross-group thirds race, every group is independent and its own completion is
// all that matters.
export function computeQualification(matches) {
  const groups = {}
  const completion = {}
  for (const g of GROUPS) {
    groups[g] = rankGroup(g, matches)
    completion[g] = groupComplete(g, matches)
  }
  const allComplete = GROUPS.every((g) => completion[g])
  return { groups, completion, allComplete }
}

// Per-row qualification status for the standings UI.
// 'in'  = advances (top two of the group)
// 'out' = eliminated
// null  = group still in progress, so nothing is settled by position alone.
export function rowStatus(row, group, qual) {
  if (!qual.completion[group]) return null // group still in progress
  return row.rank <= ADVANCING_PER_GROUP ? 'in' : 'out'
}
