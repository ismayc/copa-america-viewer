import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { projectKnockout } from '../src/utils/asItStands.js'

// Regression: once a group is clinched, the live feed resolves its quarter-final
// slot label ("Winner Group A") to the real team ("Argentina"). projectKnockout
// must read the slot structure from the STATIC schedule by match number, or it
// loses that winner's 1st projection (it came back null).
describe('projectKnockout — resolved winner slot labels', () => {
  it('still projects every group when quarter-final winner slots are resolved to real teams', () => {
    // Resolve the winner side of each quarter-final the way the live feed would
    // once those groups are decided.
    const resolved = MATCHES.map((m) => {
      if (m.num === 25) return { ...m, t1: 'Argentina' } // was "Winner Group A"
      if (m.num === 27) return { ...m, t1: 'Uruguay' } // was "Winner Group C"
      if (m.num === 28) return { ...m, t1: 'Colombia' } // was "Winner Group D"
      return m
    })
    const { perGroup } = projectKnockout(resolved)

    // No group's projections are lost…
    for (const g of Object.keys(perGroup)) {
      expect(perGroup[g].first, `group ${g} first`).toBeTruthy()
      expect(perGroup[g].second, `group ${g} second`).toBeTruthy()
    }
    // …and every winner slot still points at its quarter-final, resolved or not.
    expect(perGroup.A.first.matchNum).toBe(25)
    expect(perGroup.B.first.matchNum).toBe(26) // never resolved — the control
    expect(perGroup.C.first.matchNum).toBe(27)
    expect(perGroup.D.first.matchNum).toBe(28)
    // The runner-up slots are the crossed pairings, and survive too.
    expect(perGroup.B.second.matchNum).toBe(25)
    expect(perGroup.A.second.matchNum).toBe(26)
    expect(perGroup.D.second.matchNum).toBe(27)
    expect(perGroup.C.second.matchNum).toBe(28)
  })
})
