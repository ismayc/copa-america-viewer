import { describe, it, expect } from 'vitest'
import { parseQuery, matchesSearch } from '../src/utils/search.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { VENUES } from '../src/data/venues.js'

const groupMatch = MATCHES.find((m) => m.stage === 'Group')
const venueOf = (m) => VENUES[m.venue]

describe('parseQuery', () => {
  it('returns free text only when there are no field markers', () => {
    expect(parseQuery('Denmark')).toEqual({ free: 'Denmark', tokens: [] })
  })

  it('handles empty/undefined input', () => {
    expect(parseQuery(undefined)).toEqual({ free: '', tokens: [] })
  })

  it('parses scoped field tokens', () => {
    const { tokens } = parseQuery('team: Germany city: Dallas')
    expect(tokens).toContainEqual({ field: 'team', value: 'Germany' })
    expect(tokens).toContainEqual({ field: 'city', value: 'Dallas' })
  })

  it('treats an unknown field as free text', () => {
    const { free, tokens } = parseQuery('bogus: value')
    expect(tokens).toEqual([])
    expect(free).toContain('value')
  })

  it('keeps leading free text before the first marker', () => {
    const { free, tokens } = parseQuery('azteca city: Dallas')
    expect(free).toBe('azteca')
    expect(tokens).toContainEqual({ field: 'city', value: 'Dallas' })
  })
})

describe('matchesSearch — token fields', () => {
  const v = venueOf(groupMatch)

  const run = (m, parsed) => matchesSearch(m, venueOf(m), parsed)

  it('matches a team token', () => {
    expect(run(groupMatch, { tokens: [{ field: 'team', value: groupMatch.t1.slice(0, 3) }], free: '' })).toBe(true)
  })

  it('matches a city token', () => {
    expect(run(groupMatch, { tokens: [{ field: 'city', value: v.city }], free: '' })).toBe(true)
  })

  it('matches a stadium token', () => {
    expect(run(groupMatch, { tokens: [{ field: 'stadium', value: v.name.slice(0, 4) }], free: '' })).toBe(true)
  })

  it('matches a region token', () => {
    expect(run(groupMatch, { tokens: [{ field: 'region', value: v.region }], free: '' })).toBe(true)
  })

  it('matches a country token, incl. United States synonyms', () => {
    // Every venue is in the United States — this edition had a single host.
    const usMatch = MATCHES.find((m) => VENUES[m.venue]?.country === 'United States')
    expect(usMatch).toBeTruthy()
    expect(matchesSearch(usMatch, VENUES[usMatch.venue], { tokens: [{ field: 'country', value: 'america' }], free: '' })).toBe(true)
    expect(matchesSearch(usMatch, VENUES[usMatch.venue], { tokens: [{ field: 'country', value: 'brazil' }], free: '' })).toBe(false)
  })

  it('matches a group token (stripping the "group " prefix)', () => {
    expect(run(groupMatch, { tokens: [{ field: 'group', value: `group ${groupMatch.group}` }], free: '' })).toBe(true)
  })

  it('matches a stage token via synonym', () => {
    expect(run(groupMatch, { tokens: [{ field: 'stage', value: 'gs' }], free: '' })).toBe(true)
  })

  it('matches a stage token via the label fallback', () => {
    // "group" stage's label includes "stage" — exercise the label .includes path
    // for a value not in STAGE_SYN.
    expect(run(groupMatch, { tokens: [{ field: 'stage', value: 'stage' }], free: '' })).toBe(true)
  })

  it('returns true for an unknown field (default switch case)', () => {
    expect(run(groupMatch, { tokens: [{ field: 'nope', value: 'x' }], free: '' })).toBe(true)
  })

  it('returns false when a token does not match', () => {
    expect(run(groupMatch, { tokens: [{ field: 'team', value: 'zzzzz' }], free: '' })).toBe(false)
  })
})

describe('matchesSearch — free text', () => {
  it('matches against the combined haystack', () => {
    expect(matchesSearch(groupMatch, venueOf(groupMatch), { tokens: [], free: groupMatch.t1.toLowerCase() })).toBe(true)
  })

  it('fails when free text is absent from the haystack', () => {
    expect(matchesSearch(groupMatch, venueOf(groupMatch), { tokens: [], free: 'zzzzz-nope' })).toBe(false)
  })

  it('builds the haystack with a group fragment when present', () => {
    expect(matchesSearch(groupMatch, venueOf(groupMatch), { tokens: [], free: `group ${groupMatch.group}`.toLowerCase() })).toBe(true)
  })

  it('handles a knockout match (no group) in the haystack', () => {
    const ko = MATCHES.find((m) => m.stage !== 'Group')
    expect(matchesSearch(ko, venueOf(ko), { tokens: [], free: '' })).toBe(true)
  })
})
