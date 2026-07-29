import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { enumerateOutlook, countRemaining, countIterations, ENTRY_SLOT_LABELS } from '../src/utils/outlookEnum.js'
import { GROUP_STAGE_MD3 } from './fixtures/group-stage-md3.js'

// Snapshot has Groups B, C and D done and Group A on its final matchday, so two
// games remain (Matches 17 and 18). Small and fast, while still enumerating real
// goal differences into the quarter-final slots.
const reduced = MATCHES.map((m) =>
  m.stage === 'Group' && GROUP_STAGE_MD3[m.num] ? { ...m, score: GROUP_STAGE_MD3[m.num] } : m,
)

// Fixed margin cap so the weighted space is deterministic: Group A has two games
// left, so the space is (2·CAP+1)^2 equally-weighted margin combinations.
const CAP = 5
const SPACE = (2 * CAP + 1) ** 2 // 11^2 = 121

describe('outlook enumeration (exact, goal-difference)', () => {
  it('reports the remaining-games count', () => {
    expect(countRemaining(reduced)).toBe(2) // Group A's final matchday
    expect(countIterations(reduced)).toBeGreaterThan(0)
  })

  it('enumerates the full weighted margin space; every slot sums to the total', () => {
    const { total, cap, perMatch } = enumerateOutlook(reduced, null, CAP)
    expect(cap).toBe(CAP)
    expect(total).toBe(SPACE)
    for (const num of Object.keys(ENTRY_SLOT_LABELS)) {
      for (const side of perMatch[num]) {
        const sum = side.candidates.reduce((s, c) => s + c.count, 0)
        expect(sum).toBe(total) // a fully-resolvable bracket fills every slot
      }
    }
  })

  it('locks a slot fed by a completed group (Winner Group B → Match 26)', () => {
    const { perMatch } = enumerateOutlook(reduced, null, CAP)
    // Group B is complete in the snapshot, so its winner fills Match 26 in 100%
    // of outcomes regardless of Group A's remaining margins…
    expect(perMatch[26][0].locked).toBeTruthy()
    // …while the other side of that tie is Group A's runner-up, still open.
    expect(perMatch[26][1].locked).toBeFalsy()
  })

  it('gives exact rational shares and reports progress to completion', () => {
    let lastDone = 0
    let lastTotal = 0
    const { perMatch, total } = enumerateOutlook(
      reduced,
      (done, t) => {
        lastDone = done
        lastTotal = t
      },
      CAP,
    )
    expect(lastDone).toBe(lastTotal) // final progress callback fires at 100%
    // Every candidate share is an exact count/total fraction.
    for (const side of perMatch[25]) {
      for (const c of side.candidates) {
        expect(Number.isInteger(c.count)).toBe(true)
        expect(c.pct).toBeCloseTo(c.count / total, 12)
      }
    }
  })
})
