// Detects when a group placing came down to a "soft" tie-breaker — the card
// score or the drawing of lots — i.e. two teams were level through points,
// overall goal difference, overall goals scored AND the head-to-head sub-table,
// so only criteria 7–8 (cards) or 9 (lots) could separate them.
//
// Mirrors the exact clustering in qualification.js's resolveLevelOnPoints: the
// only place cards or lots decide the order is its final branch, where a cluster
// still level on overall GD and goals is sorted by head-to-head, then cards,
// then lots. Two teams equal through head-to-head in that branch were therefore
// split by one of the two.

import { rankGroup, headToHead } from './qualification.js'

// Within a points-level group, mark adjacent pairs that neither overall GD/GF
// nor the head-to-head sub-table could separate.
function markCluster(tied, group, matches, notes) {
  if (tied.length < 2) return
  // Criteria 2–3 first (CONMEBOL order): overall goal difference, then goals.
  const sorted = [...tied].sort((a, b) => b.GD - a.GD || b.GF - a.GF)
  let i = 0
  while (i < sorted.length) {
    let j = i + 1
    while (j < sorted.length && sorted[j].GD === sorted[i].GD && sorted[j].GF === sorted[i].GF) j++
    const cluster = sorted.slice(i, j)
    if (cluster.length > 1) {
      const sub = headToHead(cluster.map((t) => t.name), group, matches)
      const ord = [...cluster].sort(
        (a, b) =>
          sub[b.name].Pts - sub[a.name].Pts ||
          sub[b.name].GD - sub[a.name].GD ||
          sub[b.name].GF - sub[a.name].GF ||
          b.conduct - a.conduct ||
          a.name.localeCompare(b.name),
      )
      for (let k = 0; k + 1 < ord.length; k++) {
        const a = ord[k]
        const b = ord[k + 1]
        const sa = sub[a.name]
        const sb = sub[b.name]
        if (sa.Pts === sb.Pts && sa.GD === sb.GD && sa.GF === sb.GF) {
          const reason = a.conduct !== b.conduct ? 'conduct' : 'lots'
          notes.set(a.name, { reason, vs: b.name })
          notes.set(b.name, { reason, vs: a.name })
        }
      }
    }
    i = j
  }
}

// Map of team name -> { reason: 'conduct' | 'lots', vs: otherTeamName } for any
// team separated from an adjacent team only by cards or by the drawing of lots.
export function softTiebreaks(group, matches) {
  const rows = rankGroup(group, matches)
  const notes = new Map()
  let i = 0
  while (i < rows.length) {
    let j = i + 1
    while (j < rows.length && rows[j].Pts === rows[i].Pts) j++
    if (j - i > 1) markCluster(rows.slice(i, j), group, matches, notes)
    i = j
  }
  return notes
}

export const TIEBREAK_LABEL = {
  conduct: 'disciplinary record (red then yellow cards)',
  // The last CONMEBOL criterion is not a computation at all — see byLots in
  // utils/qualification.js, which stands in for it with a stable alphabetical
  // order so the table stays deterministic.
  lots: 'a drawing of lots',
}
