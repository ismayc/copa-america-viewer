import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { TEAMS } from '../src/data/teams.js'
import { groupSlotMap } from '../src/utils/bracket.js'

describe('groupSlotMap', () => {
  const map = groupSlotMap(MATCHES)

  it('maps every group to a Round-of-32 winner and runner-up slot', () => {
    for (const g of Object.keys(TEAMS)) {
      expect(map[g]).toBeTruthy()
      expect(typeof map[g].win).toBe('number')
      expect(typeof map[g].runnerUp).toBe('number')
    }
  })

  it('resolves the documented slots for Group A', () => {
    // M25 = "Winner Group A"; M26 = "Runner-up Group A".
    expect(map['A']).toEqual({ win: 25, runnerUp: 26 })
  })
})
