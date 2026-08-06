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

  it('ignores an entry-round side that names neither a group winner nor a runner-up', () => {
    // The entry round is where the groups feed in, so both its sides normally
    // read "Winner/Runner-up Group X". A side carrying anything else — a feeder
    // from another tie, a name a refresh resolved early — belongs to no group
    // and must simply not be filed under one.
    const odd = { num: 9001, stage: 'QF', label1: 'Winner Match 5', label2: 'Runner-up Group B' }
    const only = groupSlotMap([odd])
    expect(only).toEqual({ B: { win: null, runnerUp: 9001 } })
  })

  it('resolves the documented slots for Group A', () => {
    // M25 = "Winner Group A"; M26 = "Runner-up Group A".
    expect(map['A']).toEqual({ win: 25, runnerUp: 26 })
  })
})
