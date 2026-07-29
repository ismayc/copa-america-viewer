import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { TEAMS } from '../src/data/teams.js'
import { projectKnockout } from '../src/utils/asItStands.js'

const GROUPS = Object.keys(TEAMS)

// A complete, strictly-ordered group stage so every group resolves cleanly.
function buildComplete() {
  const score = {}
  for (const g of GROUPS) {
    const idx = Object.fromEntries(TEAMS[g].map((t, k) => [t.name, k]))
    for (const m of MATCHES) {
      if (m.stage !== 'Group' || m.group !== g) continue
      score[m.num] = idx[m.t1] < idx[m.t2] ? [1, 0] : [0, 1]
    }
  }
  return MATCHES.map((m) => (score[m.num] ? { ...m, score: score[m.num] } : m))
}

describe('projectKnockout — parseSlot "other" + teamForSide null branch', () => {
  it('handles a quarter-final with a slot label it does not recognise', () => {
    const complete = buildComplete()
    // Inject a quarter-final whose t1 is an unrecognised slot: exercises
    // parseSlot's fallthrough, and makes teamForSide return null when the OTHER
    // side asks who its opponent is.
    const custom = [
      ...complete,
      {
        num: 9999,
        stage: 'QF',
        t1: 'Mystery Slot',
        t2: 'Winner Group A',
        venue: 'sofi',
        ko: '2024-07-04T18:00:00-04:00',
      },
    ]
    const { perGroup } = projectKnockout(custom)
    // Every group still has both projections.
    for (const g of GROUPS) {
      expect(perGroup[g], `group ${g}`).toBeTruthy()
      expect(perGroup[g].first, `group ${g} first`).toBeTruthy()
      expect(perGroup[g].second, `group ${g} second`).toBeTruthy()
    }
    // The injected match claimed Group A's winner slot, and its opponent is an
    // unparseable label — so the projection names the team but no opponent,
    // rather than throwing or inventing one.
    expect(perGroup.A.first.matchNum).toBe(9999)
    expect(perGroup.A.first.team).toBe(TEAMS['A'][0].name)
    expect(perGroup.A.first.opponent).toBeNull()
  })
})

describe('projectKnockout — incomplete data still produces a bracket', () => {
  it('projects from blank standings without throwing', () => {
    const { perGroup } = projectKnockout(MATCHES)
    expect(Object.keys(perGroup)).toHaveLength(GROUPS.length)
    // Both slots exist for every group even before a ball is kicked — rankGroup
    // always returns four ordered rows, so a projection is always available.
    // (There is no "is this settled?" flag here on purpose: it would be true
    // from the start and tell a caller nothing.)
    for (const g of GROUPS) {
      expect(perGroup[g].first).toBeTruthy()
      expect(perGroup[g].second).toBeTruthy()
      expect(typeof perGroup[g].first.matchNum).toBe('number')
    }
  })

  it('has no best-third projection: only two slots per group exist', () => {
    const { perGroup } = projectKnockout(buildComplete())
    for (const g of GROUPS) {
      expect(Object.keys(perGroup[g]).sort()).toEqual(['first', 'second'])
    }
  })
})
