import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyResults, matchKey, fetchResults, parseCupTxt } from '../src/services/results.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'

// This edition is finished, so the committed schedule ships with every result in
// it. These tests exercise the merge that fills a BLANK board from the feed.
const MATCHES = unscored(PLAYED)

// Match 1 is Argentina v Canada in Atlanta on 20 June 2024.
const M1_KEY = '2024-06-20|pair:' + ['Argentina', 'Canada'].sort().join('|')
const FINAL_KEY = '2024-07-14|pair:' + ['Argentina', 'Colombia'].sort().join('|')

const here = dirname(fileURLToPath(import.meta.url))
const SNAPSHOT = readFileSync(resolve(here, 'fixtures/copa-txt-snapshot.txt'), 'utf8')

describe('results merge (applyResults)', () => {
  it('returns the input unchanged when there are no results', () => {
    expect(applyResults(MATCHES, null)).toBe(MATCHES)
    expect(applyResults(MATCHES, new Map())).toBe(MATCHES)
  })

  it('keys a match by its kickoff date and team pair', () => {
    expect(matchKey(MATCHES.find((m) => m.num === 1))).toBe(M1_KEY)
  })

  it('has no key for a knockout tie whose sides are still placeholders', () => {
    // copa.txt carries no match numbers, so the pair is the only thing to key
    // on — and an undrawn tie has no pair yet.
    expect(matchKey(MATCHES.find((m) => m.stage === 'Final'))).toBeNull()
    // …but the real, played Final does have one.
    expect(matchKey(PLAYED.find((m) => m.stage === 'Final'))).toBe(FINAL_KEY)
  })

  it('merges a group score oriented to our team order', () => {
    const map = new Map([[M1_KEY, { home: 'Canada', away: 'Argentina', score: { ft: [0, 2] } }]])
    const merged = applyResults(MATCHES, map)
    const m = merged.find((x) => x.num === 1) // our order: Argentina v Canada
    expect(m.score).toEqual([2, 0]) // flipped to match (Argentina, Canada)
  })

  it('does NOT write a reversed score when the record home matches neither team', () => {
    // A normalization gap could leave rec.home as a name that is neither of ours.
    // Bare-equality orientation would treat it as the away team and write the
    // score backwards; it must skip instead.
    const map = new Map([
      [M1_KEY, { home: 'La Albiceleste', away: 'Les Rouges', score: { ft: [3, 1] } }],
    ])
    const merged = applyResults(MATCHES, map)
    expect(merged.find((m) => m.num === 1).score).toBeUndefined() // skipped, not reversed
  })

  it('records a shootout WITHOUT extra time, which is the CONMEBOL shape', () => {
    // At Copa América 2024 a level tie outside the Final went straight to
    // penalties at 90 minutes — so `pens` with no `aet` is the correct record,
    // not an omission.
    const drawn = MATCHES.map((m) => (m.num === 32 ? { ...m, t1: 'Argentina', t2: 'Colombia' } : m))
    const map = new Map([
      [FINAL_KEY, { home: 'Argentina', away: 'Colombia', score: { ft: [2, 2], pens: [4, 2] } }],
    ])
    const final = applyResults(drawn, map).find((m) => m.stage === 'Final')
    expect(final.score).toEqual([2, 2])
    expect(final.pens).toEqual([4, 2])
    expect(final.aet).toBeUndefined()
  })

  it('uses the extra-time score for a knockout decided in ET (no shootout)', () => {
    // OpenFootball reports ft = the level 90-minute score and et = the decisive
    // ET score. Using ft alone would leave the tie — and the rest of the bracket
    // — unresolved.
    const drawn = MATCHES.map((m) => (m.num === 32 ? { ...m, t1: 'Argentina', t2: 'Colombia' } : m))
    const map = new Map([
      [FINAL_KEY, { home: 'Argentina', away: 'Colombia', score: { ft: [0, 0], et: [1, 0], aet: true } }],
    ])
    const final = applyResults(drawn, map).find((m) => m.stage === 'Final')
    expect(final.score).toEqual([1, 0]) // ET result, not the level 90-minute score
    expect(final.aet).toBe(true)
    expect(final.pens).toBeUndefined()
  })

  it('does not mutate the static MATCHES array', () => {
    const before = MATCHES.find((m) => m.num === 1)
    const map = new Map([[M1_KEY, { home: 'Argentina', away: 'Canada', score: { ft: [1, 0] } }]])
    applyResults(MATCHES, map)
    expect(MATCHES.find((m) => m.num === 1)).toBe(before)
    expect(before.score).toBeUndefined()
  })
})

describe('fetchResults (parsing copa.txt)', () => {
  it('reads the real file: scores, shootouts and the extra-time Final', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, text: async () => SNAPSHOT }))
    const map = await fetchResults()
    expect(map.size).toBe(32)

    // A plain group result.
    expect(map.get(M1_KEY).score).toEqual({ ft: [2, 0] })

    // A shootout: the headline score on the line is the SHOOTOUT tally and the
    // bracketed pair is the level 90-minute score. Reading them the other way
    // round is the classic mis-parse.
    const qf = map.get('2024-07-06|pair:' + ['Uruguay', 'Brazil'].sort().join('|'))
    expect(qf.score.ft).toEqual([0, 0])
    expect(qf.score.pens).toEqual([4, 2])
    expect(qf.score.aet).toBeUndefined() // straight to penalties at 90

    // The Final, where the headline score IS the decisive one after extra time.
    const final = map.get(FINAL_KEY)
    expect(final.score.ft).toEqual([0, 0])
    expect(final.score.et).toEqual([1, 0])
    expect(final.score.aet).toBe(true)
    expect(final.score.pens).toBeUndefined()
  })

  it('attributes a lone goal list to the side that actually scored', async () => {
    // When only one team scores, the file writes a single list with no ";" — and
    // it belongs to the scorer, not to team 1. Splitting naively hands every goal
    // to the wrong side.
    const map = parseCupTxt(SNAPSHOT)
    const onlyAwayScored = [...map.values()].find((r) => r.score.ft[0] === 0 && r.score.ft[1] > 0)
    expect(onlyAwayScored.g1).toEqual([])
    expect(onlyAwayScored.g2).toHaveLength(onlyAwayScored.score.ft[1])
  })

  it('parses every match’s goals to exactly its scoreline', async () => {
    for (const rec of parseCupTxt(SNAPSHOT).values()) {
      const [h, a] = rec.score.et || rec.score.ft
      const label = `${rec.home} v ${rec.away}`
      // A shootout's kicks are not goals, so the goal lists match the 90/ET score.
      expect(rec.g1.length, `${label} home goals`).toBe(h)
      expect(rec.g2.length, `${label} away goals`).toBe(a)
    }
  })

  it('marks penalties and own goals', () => {
    const goals = [...parseCupTxt(SNAPSHOT).values()].flatMap((r) => [...r.g1, ...r.g2])
    expect(goals.some((g) => g.penalty)).toBe(true)
    expect(goals.some((g) => g.og)).toBe(true)
    expect(goals.every((g) => typeof g.name === 'string' && g.name.length > 0)).toBe(true)
    expect(goals.every((g) => Number.isInteger(g.minute))).toBe(true)
  })

  it('throws on a non-OK response', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 503 }))
    await expect(fetchResults()).rejects.toThrow(/503/)
  })

  it('throws rather than returning an empty map when the body is not the feed', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, text: async () => '<html>404</html>' }))
    await expect(fetchResults()).rejects.toThrow(/no readable fixtures/)
  })
})
