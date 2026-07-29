import { describe, it, expect } from 'vitest'
import { parseQuery, matchesSearch } from '../src/utils/search.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { VENUES } from '../src/data/venues.js'

const count = (q) => {
  const p = parseQuery(q)
  return MATCHES.filter((m) => matchesSearch(m, VENUES[m.venue], p)).length
}

describe('parseQuery', () => {
  it('treats bare text as free text', () => {
    expect(parseQuery('Argentina')).toEqual({ free: 'Argentina', tokens: [] })
  })

  it('parses a single scoped token', () => {
    expect(parseQuery('team: Argentina')).toEqual({ free: '', tokens: [{ field: 'team', value: 'Argentina' }] })
  })

  it('parses multiple tokens, with or without spaces after the colon', () => {
    expect(parseQuery('team:Peru city:Arlington')).toEqual({
      free: '',
      tokens: [
        { field: 'team', value: 'Peru' },
        { field: 'city', value: 'Arlington' },
      ],
    })
  })

  it('maps field aliases (venue -> stadium, host -> country)', () => {
    expect(parseQuery('venue: SoFi').tokens[0].field).toBe('stadium')
    expect(parseQuery('host: Brazil').tokens[0].field).toBe('country')
  })
})

describe('matchesSearch counts', () => {
  it('team: Argentina -> 3 group matches', () => {
    // The knockout slots are still placeholders on a blank board, so a team's
    // hits are exactly its three group games.
    expect(count('team: Argentina')).toBe(3)
  })
  it('city: Kansas City -> 2 (two different stadiums, both Kansas City)', () => {
    // Children's Mercy Park is in Kansas City, KS and Arrowhead in Kansas City,
    // MO — a genuine collision this tournament's venue list has to survive.
    expect(count('city: Kansas City')).toBe(2)
  })
  it('country: United States -> all 32 (a single-host tournament)', () => {
    expect(count('country: United States')).toBe(32)
  })
  it('group: C -> 6', () => {
    expect(count('group: C')).toBe(6)
  })
  it('stage: Final -> 1', () => {
    expect(count('stage: Final')).toBe(1)
  })
  it('stadium: SoFi -> 2', () => {
    expect(count('stadium: SoFi')).toBe(2)
  })
  it('stage: 3rd -> 1 (the play-off Copa still plays)', () => {
    expect(count('stage: 3rd')).toBe(1)
  })
  it('combines tokens: team: Canada stage: group -> 3', () => {
    expect(count('team: Canada stage: group')).toBe(3)
  })
  it('stage synonyms work (semi -> SF -> 2)', () => {
    expect(count('stage: semi')).toBe(2)
  })
  it('no-space form team:Peru city:Arlington -> 1', () => {
    expect(count('team:Peru city:Arlington')).toBe(1)
  })
})
