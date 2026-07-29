// Group standings. Ranking (incl. UEFA tie-breakers) lives in qualification.js;
// this module keeps the small surface the Standings UI/tests rely on.

import { rankGroup } from './qualification.js'

export { rankGroup }

// Ordered rows for a group, with full tie-breakers applied.
export function computeGroup(group, matches) {
  return rankGroup(group, matches)
}

// True once at least one match in the group has been scored.
export function groupHasResults(group, matches) {
  return matches.some((m) => m.stage === 'Group' && m.group === group && m.score)
}
