// Official FINAL group results and finishing orders for CONMEBOL Copa América
// 2024, frozen so the standings / tie-breaker engine can't silently drift from
// the real outcome — the results parallel of official-kickoffs.js.
//
// `scores` restates the committed result for each of a group's six matches, so a
// silent rewrite of src/data/matches.js fails here too. `order` is the official
// finishing order as CONMEBOL's final group tables published it: the top two of
// each group went to the quarter-finals, and 3rd/4th were eliminated (there is no
// best-third race in this format, so every position is settled inside its group).
//
// test/final-standings.test.js replays `scores` through rankGroup and asserts the
// finishing order matches `order` exactly — so a tie-breaker regression is caught
// against the real tournament rather than against a synthetic case. Group B is the
// one that matters most: Ecuador and Mexico both finished on 4 points and were
// separated by goal difference, which is CONMEBOL's FIRST tie-breaker and the
// Euro's third — exactly the inversion this app had to get right.
//
// CONMEBOL tie-breakers in effect: points → goal difference → goals scored →
// head-to-head → fewest reds → fewest yellows → drawing of lots.

export const FINAL_GROUP_RESULTS = {
  A: {
    scores: { 1: [2, 0], 2: [0, 0], 9: [0, 1], 10: [0, 1], 17: [2, 0], 18: [0, 0] },
    order: ['Argentina', 'Canada', 'Chile', 'Peru'],
  },
  B: {
    scores: { 3: [1, 0], 4: [1, 2], 11: [1, 0], 12: [3, 1], 19: [0, 0], 20: [0, 3] },
    order: ['Venezuela', 'Ecuador', 'Mexico', 'Jamaica'],
  },
  C: {
    scores: { 5: [2, 0], 6: [3, 1], 13: [2, 1], 14: [5, 0], 21: [0, 1], 22: [1, 3] },
    order: ['Uruguay', 'Panama', 'United States', 'Bolivia'],
  },
  D: {
    scores: { 7: [2, 1], 8: [0, 0], 15: [1, 4], 16: [3, 0], 23: [2, 1], 24: [1, 1] },
    order: ['Colombia', 'Brazil', 'Costa Rica', 'Paraguay'],
  },
}

// The quarter-final line-up, taken from the committed schedule's own t1/t2 —
// which came from ESPN's structure, NOT from rankGroup. That makes it an
// INDEPENDENT anchor for the orders above: `order` is what our engine produces
// from `scores`, and if it were wrong the pairings it implies would not match
// these real ones. final-standings.test.js asserts exactly that, which is what
// keeps this fixture from being a restatement of the code it tests.
export const OFFICIAL_QF = {
  25: ['Argentina', 'Ecuador'],
  26: ['Venezuela', 'Canada'],
  27: ['Uruguay', 'Brazil'],
  28: ['Colombia', 'Panama'],
}
