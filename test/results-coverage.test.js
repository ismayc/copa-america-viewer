import { describe, it, expect, vi } from 'vitest'
import {
  openFootballFinalScore,
  applyResults,
  fetchResults,
  parseCupTxt,
  matchKey,
  normalizeTeam,
  isRealTeam,
  pairKey,
  RESULTS_SOURCE,
} from '../src/services/results.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'

const MATCHES = unscored(PLAYED)
const match1 = MATCHES.find((m) => m.num === 1) // Argentina v Canada, 20 June

describe('openFootballFinalScore (getter for the reconciler)', () => {
  it('returns null without a map, or when the record has no final score', () => {
    expect(openFootballFinalScore(match1, null)).toBeNull()
    const empty = new Map([[matchKey(match1), { home: 'Argentina', away: 'Canada', score: null }]])
    expect(openFootballFinalScore(match1, empty)).toBeNull()
  })

  it('returns an oriented final when the record has a ft score', () => {
    const map = new Map([
      [matchKey(match1), { home: 'Argentina', away: 'Canada', score: { ft: [2, 0] } }],
    ])
    expect(openFootballFinalScore(match1, map)).toEqual({
      home: 'Argentina', away: 'Canada', ft: [2, 0],
    })
  })

  it('reports the extra-time score, not the level 90-minute one', () => {
    // The reconciler compares this against ESPN's final; reporting 0–0 for a tie
    // won in extra time would make the two sources look like they disagree.
    const final = PLAYED.find((m) => m.stage === 'Final')
    const map = new Map([
      [matchKey(final), { home: 'Argentina', away: 'Colombia', score: { ft: [0, 0], et: [1, 0], aet: true } }],
    ])
    expect(openFootballFinalScore(final, map).ft).toEqual([1, 0])
  })
})

describe('parseCupTxt — lines the real file does not contain', () => {
  const line = (s) => parseCupTxt(s)

  it('ignores headings, blank lines and comment-only lines', () => {
    expect(line('').size).toBe(0)
    expect(line('\n\n   \n').size).toBe(0)
    expect(line('= Copa América 2024      # in USA').size).toBe(0)
    expect(line('▪ Matchday 1  |  Thu Jun 20 - Mon Jun 24').size).toBe(0)
    expect(line('Group A  |  Argentina  Peru  Chile  Canada').size).toBe(0)
  })

  it('skips a fixture line naming a month it does not recognise', () => {
    expect(line('Thu Xyz 20 20:00 UTC-4   Argentina  2-0  Canada').size).toBe(0)
  })

  it('reads a fixture line with no venue attached', () => {
    const map = line('Thu Jun 20 20:00 UTC-4   Argentina  2-0  Canada')
    expect(map.size).toBe(1)
    expect([...map.values()][0]).toMatchObject({ home: 'Argentina', away: 'Canada' })
  })

  it('ignores a goals line that follows no fixture', () => {
    expect(line('   (Someone 12’)').size).toBe(0)
  })

  it('attaches a goals line to the fixture above it, once', () => {
    const map = line(
      'Thu Jun 20 20:00 UTC-4   Argentina  2-0  Canada\n' +
        "   (Martínez 49', 88')\n" +
        "   (Nobody 90')\n", // a second list has no fixture to attach to
    )
    const rec = [...map.values()][0]
    expect(rec.g1).toHaveLength(2)
    expect(rec.g2).toEqual([])
  })

  it('reads a stoppage-time goal at the regulation minute it is shown against', () => {
    const map = line(
      'Thu Jun 20 20:00 UTC-4   Argentina  1-0  Canada\n' + "   (Álvarez 90+4')\n",
    )
    expect([...map.values()][0].g1).toEqual([
      { name: 'Álvarez', minute: 90, penalty: false, og: false },
    ])
  })

  it('takes the year it is told to', () => {
    const map = parseCupTxt('Thu Jun 20 20:00 UTC-4   Argentina  2-0  Canada', 2028)
    expect([...map.keys()][0].startsWith('2028-06-20')).toBe(true)
  })
})

describe('applyResults — the knockout path', () => {
  it('adopts real team names into a placeholder tie and orients the score to them', () => {
    const qf = MATCHES.find((m) => m.num === 25)
    expect(isRealTeam(qf.t1)).toBe(false) // still "Winner Group A"
    // Nothing to key on yet, so a feed record cannot reach it…
    expect(matchKey(qf)).toBeNull()
    // …but once the tie is drawn, the feed fills in names, score, pens and goals.
    const drawn = MATCHES.map((m) => (m.num === 25 ? { ...m, t1: 'Argentina', t2: 'Ecuador' } : m))
    const key = matchKey(drawn.find((m) => m.num === 25))
    const map = new Map([[key, {
      home: 'Ecuador', away: 'Argentina',
      score: { ft: [1, 1], pens: [2, 4] },
      g1: [{ name: 'Valencia', minute: 35, penalty: false, og: false }],
      g2: [{ name: 'Di María', minute: 35, penalty: false, og: false }],
    }]])
    const out = applyResults(drawn, map).find((m) => m.num === 25)
    // The feed's (home, away) order wins, so both sides follow it.
    expect([out.t1, out.t2]).toEqual(['Ecuador', 'Argentina'])
    expect(out.score).toEqual([1, 1])
    expect(out.pens).toEqual([2, 4])
    expect(out.aet).toBeUndefined()
    expect(out.goals.t1[0].name).toBe('Valencia')
  })

  it('leaves a knockout tie alone when the feed has no score for it yet', () => {
    const drawn = MATCHES.map((m) => (m.num === 25 ? { ...m, t1: 'Argentina', t2: 'Ecuador' } : m))
    const key = matchKey(drawn.find((m) => m.num === 25))
    const map = new Map([[key, { home: 'Argentina', away: 'Ecuador', score: null, g1: [], g2: [] }]])
    const out = applyResults(drawn, map).find((m) => m.num === 25)
    expect(out.score).toBeUndefined()
    expect(out.t1).toBe('Argentina')
  })

  it('returns matches untouched when a record does not match any fixture', () => {
    const map = new Map([['2024-01-01|pair:Nobody|Nowhere', { home: 'Nobody', away: 'Nowhere' }]])
    expect(applyResults(MATCHES, map).find((m) => m.num === 1).score).toBeUndefined()
  })
})

describe('name helpers', () => {
  it('passes empty input through normalizeTeam untouched', () => {
    expect(normalizeTeam('')).toBe('')
    expect(normalizeTeam(undefined)).toBeUndefined()
  })

  it('knows a real team from a placeholder', () => {
    expect(isRealTeam('Argentina')).toBe(true)
    expect(isRealTeam('Winner Group A')).toBe(false)
    expect(isRealTeam('2A')).toBe(false)
  })

  it('builds an order-independent pair key', () => {
    expect(pairKey('Canada', 'Argentina')).toBe(pairKey('Argentina', 'Canada'))
  })
})

describe('records with nothing in them', () => {
  it('reads a scorer line whose home half is blank', () => {
    // OpenFootball writes both halves around a semicolon even when only one side
    // scored, so the empty half has to parse as "no goals" rather than throw.
    const txt = [
      '= Copa América 2024',
      '',
      '▪ Group A',
      '',
      'Thu Jun 20 20:00 UTC-4   Argentina      0-2   Canada  @ Somewhere, Atlanta, Georgia',
      "                 ( ; Davies 49\' David 88\')",
      '',
    ].join('\n')
    const rec = [...parseCupTxt(txt, 2024).values()][0]
    expect(rec.g1).toEqual([])
    expect(rec.g2).toHaveLength(2)
  })

  it('leaves a group match alone when the record carries no score', () => {
    // A fixture line with no result yet: the record exists (so the teams are
    // known) but writing it back would blank the board rather than fill it.
    const base = { num: 1, stage: 'Group', group: 'A', t1: 'Alpha', t2: 'Beta', ko: '2024-06-15T20:00:00Z' }
    const map = new Map([[matchKey(base), { home: 'Alpha', away: 'Beta' }]])
    const [out] = applyResults([base], map)
    expect(out).toBe(base)
  })
})

describe('the source it reads', () => {
  it('points at OpenFootball’s copa.txt, not a JSON feed', () => {
    expect(RESULTS_SOURCE.url).toMatch(/copa-america.*copa\.txt$/)
    expect(RESULTS_SOURCE.url).not.toMatch(/\.json$/)
  })

  it('surfaces a transport failure rather than showing no results', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500 }))
    await expect(fetchResults()).rejects.toThrow(/HTTP 500/)
  })
})
