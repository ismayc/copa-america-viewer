import { describe, it, expect, vi } from 'vitest'
import { fetchLive, applyLive, espnFinalScore } from '../src/services/espn.js'
import { pairKey } from '../src/services/results.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

const match1 = MATCHES.find((m) => m.num === 1) // Argentina v Canada
const instOf = (m) => 'inst:' + new Date(m.ko).getTime()

describe('fetchLive — substitutions, unknown teams, and pens', () => {
  it('parses substitution details into per-side names', async () => {
    const feed = {
      events: [
        {
          date: '2024-06-21T00:00Z',
          status: { type: { state: 'in', shortDetail: "70'", description: '2nd Half' } },
          competitions: [
            {
              competitors: [
                { homeAway: 'home', team: { id: 'H', displayName: 'Argentina' }, score: '1' },
                { homeAway: 'away', team: { id: 'A', displayName: 'Canada' }, score: '0' },
              ],
              details: [
                {
                  type: { text: 'Substitution' },
                  clock: { displayValue: "70'" },
                  team: { id: 'H' },
                  athletesInvolved: [{ shortName: 'In Player' }, { displayName: 'Out Player' }],
                },
                // a detail with an unknown team id -> side is null, skipped
                {
                  type: { text: 'Goal' },
                  clock: { displayValue: "10'" },
                  team: { id: 'ZZ' },
                  scoringPlay: true,
                  athletesInvolved: [{ shortName: 'Ghost' }],
                },
                // a shootout kick -> skipped
                {
                  type: { text: 'Goal - Penalty' },
                  clock: { displayValue: "120'" },
                  team: { id: 'H' },
                  scoringPlay: true,
                  shootout: true,
                  athletesInvolved: [{ shortName: 'PK Taker' }],
                },
              ],
            },
          ],
        },
      ],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))
    const map = await fetchLive()
    const rec = map.get(pairKey('Argentina', 'Canada'))
    expect(rec.subs.home).toEqual([{ minute: 70, extra: undefined, names: ['In Player', 'Out Player'] }])
    // ghost goal (unknown team) and shootout kick were both skipped
    expect(rec.goals.home).toEqual([])
    expect(rec.goals.away).toEqual([])
  })

  it('skips events without two real competitors', async () => {
    const feed = {
      events: [
        // no competitions
        { date: '2024-06-21T00:00Z', status: { type: { state: 'in' } } },
        // competition without a competitors array
        { date: '2024-06-21T00:00Z', competitions: [{ competitors: null }] },
        // missing away team object
        {
          date: '2024-06-21T00:00Z',
          competitions: [
            {
              competitors: [
                { homeAway: 'home', team: { id: 'H', displayName: 'Argentina' }, score: '1' },
                { homeAway: 'away', team: null, score: '0' },
              ],
            },
          ],
        },
      ],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))
    const map = await fetchLive()
    expect(map.size).toBe(0)
  })

  it('reads shootout scores and falls back to comp.status / displayClock', async () => {
    const feed = {
      events: [
        {
          date: '2024-07-15T01:15Z',
          // status only on the competition, with displayClock fallback
          competitions: [
            {
              status: { displayClock: "120'", type: { state: 'post' } },
              competitors: [
                { homeAway: 'home', team: { id: 'H', displayName: 'Argentina' }, score: '3', shootoutScore: '4' },
                { homeAway: 'away', team: { id: 'A', displayName: 'Colombia' }, score: '3', shootoutScore: '2' },
              ],
              details: [],
            },
          ],
        },
      ],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))
    const map = await fetchLive()
    const rec = map.get(pairKey('Argentina', 'Colombia'))
    expect(rec.pens).toEqual([4, 2])
    expect(rec.clock).toBe("120'")
    expect(rec.state).toBe('post')
  })
})

describe('applyLive — knockout name resolution on pre/no-score records', () => {
  it('resolves placeholder names from a pre-match ESPN record without writing a score', () => {
    const ko = MATCHES.find((m) => m.num === 25) // placeholder teams
    const map = new Map([
      [instOf(ko), { home: 'Argentina', away: 'Ecuador', score: null, state: 'pre', clock: '', detail: '' }],
    ])
    const m = applyLive(MATCHES, map).find((x) => x.num === 25)
    expect(m.t1).toBe('Argentina')
    expect(m.t2).toBe('Ecuador')
    expect(m.score).toBeUndefined()
    expect(m.live).toBeUndefined()
  })

  it('leaves a placeholder untouched when ESPN also has only placeholders', () => {
    const ko = MATCHES.find((m) => m.num === 25)
    const before = ko
    const map = new Map([
      [instOf(ko), { home: '2A', away: '2B', score: null, state: 'pre', clock: '', detail: '' }],
    ])
    const m = applyLive(MATCHES, map).find((x) => x.num === 25)
    expect(m).toBe(before) // same reference — nothing changed
  })

  it('leaves a real-team pre-match untouched (no score yet)', () => {
    const map = new Map([
      [pairKey('Argentina', 'Canada'), { home: 'Germany', away: 'Hungary', score: null, state: 'pre', clock: '', detail: '' }],
    ])
    const m = applyLive(MATCHES, map).find((x) => x.num === 1)
    expect(m).toBe(match1)
  })
})

describe('espnFinalScore', () => {
  it('returns null without a matching record', () => {
    expect(espnFinalScore(match1, new Map())).toBeNull()
  })
})
