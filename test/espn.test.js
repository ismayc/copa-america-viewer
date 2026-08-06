import { describe, it, expect, vi } from 'vitest'
import { fetchLive, applyLive, espnFinalScore, scoreboardDates, historyDates } from '../src/services/espn.js'
import { pairKey } from '../src/services/results.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

describe('scoreboardDates', () => {
  it('returns the UTC day before/of/after a base instant', () => {
    expect(scoreboardDates(new Date('2024-06-24T12:00:00Z'))).toEqual(['20240623', '20240624', '20240625'])
  })

  it('covers a midnight-ET kickoff under the right UTC date (the late-match lag bug)', () => {
    // 00:00 ET June 24 = 04:00Z June 24 — must include 20240624, which ESPN's
    // default slate was lagging behind.
    expect(scoreboardDates(new Date('2024-06-24T04:00:00Z'))).toContain('20240624')
  })
})

describe('historyDates', () => {
  it('lists distinct UTC dates of already-finished matches, excluding the live window', () => {
    // Base: June 26 noon UTC. Live window (scoreboardDates) = Jun 25/26/27, so
    // those are excluded; earlier match days (Jun 21–24) are the backfill set.
    const dates = historyDates(MATCHES, new Date('2024-06-26T12:00:00Z'))
    expect(dates).toEqual(['20240621', '20240622', '20240623', '20240624'])
  })

  it('skips a fixture that has no kickoff instant yet', () => {
    // Knockout placeholders can reach the board before a date is published; they
    // have no day to backfill from and must not become an "Invalid Date" query.
    const withTbd = [...MATCHES, { num: 999, stage: 'Final', t1: 'TBD', t2: 'TBD' }]
    expect(historyDates(withTbd, new Date('2023-07-01T00:00:00Z'))).toEqual(
      historyDates(MATCHES, new Date('2023-07-01T00:00:00Z')),
    )
  })

  it('is empty before the tournament starts (nothing has kicked off)', () => {
    expect(historyDates(MATCHES, new Date('2024-06-01T00:00:00Z'))).toEqual([])
  })

  it('excludes matches that have not kicked off yet', () => {
    const dates = historyDates(MATCHES, new Date('2024-06-23T12:00:00Z'))
    // Jun 22/23/24 are in the live window; only Jun 21 is older + finished.
    expect(dates).toEqual(['20240621'])
  })
})

const match1 = MATCHES.find((m) => m.num === 1) // Argentina v Canada, 20 June (00:00Z on the 21st)
const instOf = (m) => 'inst:' + new Date(m.ko).getTime()

// Minimal ESPN scoreboard shape (one competition per event).
const event = ({ date, state, clock, home, hs, away, as, details }) => ({
  date,
  status: { displayClock: clock, type: { state, shortDetail: clock, description: state } },
  competitions: [
    {
      competitors: [
        { homeAway: 'home', team: { id: 'H', displayName: home }, score: hs },
        { homeAway: 'away', team: { id: 'A', displayName: away }, score: as },
      ],
      details: details || [],
    },
  ],
})

// One ESPN scoring-play detail (team is 'H' or 'A').
const goal = ({ team, min, name, pen = false, og = false }) => ({
  type: { id: '70', text: 'Goal' },
  clock: { displayValue: `${min}'` },
  team: { id: team },
  scoringPlay: true,
  penaltyKick: pen,
  ownGoal: og,
  shootout: false,
  athletesInvolved: [{ shortName: name, displayName: name }],
})

describe('fetchLive (parsing ESPN shape)', () => {
  it('prefers the FULL athlete name and keeps in-match penalty goals (Oyarzabal bug)', async () => {
    // Real shape from a Copa América semi: type "Penalty - Scored",
    // penaltyKick true, shootout false, short + full names both present.
    const feed = {
      events: [
        event({
          date: '2024-07-11T00:00Z',
          state: 'in',
          clock: "82'",
          home: 'Uruguay',
          hs: '0',
          away: 'Colombia',
          as: '2',
          details: [
            {
              type: { id: '98', text: 'Penalty - Scored' },
              clock: { displayValue: "22'" },
              team: { id: 'A' },
              scoringPlay: true,
              penaltyKick: true,
              shootout: false,
              athletesInvolved: [{ shortName: 'J. Lerma', displayName: 'Jefferson Lerma' }],
            },
            // A shootout kick must STILL be excluded from the goal list.
            {
              type: { id: '98', text: 'Penalty - Scored' },
              clock: { displayValue: "120'" },
              team: { id: 'A' },
              scoringPlay: true,
              penaltyKick: true,
              shootout: true,
              athletesInvolved: [{ shortName: 'P. Kicker', displayName: 'Pen Kicker' }],
            },
          ],
        }),
      ],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))
    const map = await fetchLive()
    const rec = map.get(pairKey('Uruguay', 'Colombia'))
    expect(rec.goals.away).toEqual([
      { name: 'Jefferson Lerma', minute: 22, extra: undefined, penalty: true, og: false },
    ])
  })

  it('parses live score, clock, and keys by pair + instant; maps ESPN aliases', async () => {
    const feed = {
      events: [
        event({ date: '2024-06-21T00:00Z', state: 'in', clock: "67'", home: 'Argentina', hs: '2', away: 'Canada', as: '1' }),
        // "United States" is our canonical name and must survive untouched — the
        // inherited alias table rewrote it to "USA" and dropped every USA match.
        event({ date: '2024-06-24T00:00Z', state: 'pre', clock: '0\'', home: 'United States', hs: '0', away: 'Bolivia', as: '0' }),
      ],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))

    const map = await fetchLive()

    const rec = map.get(pairKey('Argentina', 'Canada'))
    expect(rec.score).toEqual([2, 1])
    expect(rec.state).toBe('in')
    expect(rec.clock).toBe("67'")
    // Also addressable by kickoff instant.
    expect(map.get('inst:' + new Date('2024-06-21T00:00Z').getTime())).toBe(rec)

    // Name preserved, and a pre-match carries a null score.
    const usa = map.get(pairKey('United States', 'Bolivia'))
    expect(usa.score).toBeNull()
    expect(usa.state).toBe('pre')
  })

  it('throws only when every scoreboard date request fails', async () => {
    // fetchLive now queries a few dates around now (yesterday/today/tomorrow) and
    // merges, so it's best-effort: it rejects only if none of them are reachable.
    global.fetch = vi.fn(async () => ({ ok: false, status: 502 }))
    await expect(fetchLive()).rejects.toThrow(/scoreboard|unreachable/i)
  })

  it('still returns a map when only one date slate responds', async () => {
    const feed = {
      events: [
        event({ date: '2026-06-14T04:00Z', state: 'in', clock: "43'", home: 'Netherlands', hs: '1', away: 'Poland', as: '0' }),
      ],
    }
    let n = 0
    global.fetch = vi.fn(async () => (n++ === 0 ? { ok: true, json: async () => feed } : { ok: false, status: 500 }))
    const map = await fetchLive()
    expect(map.get(pairKey('Netherlands', 'Poland')).score).toEqual([1, 0])
  })
})

describe('applyLive (overlay onto the merged schedule)', () => {
  it('overlays a live score oriented to our team order and sets match.live', () => {
    // ESPN reports Canada as home — our order is (Argentina, Canada).
    const map = new Map([
      [pairKey('Argentina', 'Canada'), { home: 'Canada', away: 'Argentina', score: [1, 2], state: 'in', clock: "67'", detail: '2nd Half' }],
    ])
    const merged = applyLive(MATCHES, map)
    const m = merged.find((x) => x.num === 1)
    expect(m.score).toEqual([2, 1]) // flipped to (Argentina, Canada)
    expect(m.live).toEqual({ clock: "67'", detail: '2nd Half' })
    expect(m.liveSource).toBe(true)
  })

  it('defers to OpenFootball on score, but still overlays ESPN cards/subs (the missing-cards bug)', () => {
    // OpenFootball carries the final score + goals, but never cards/subs. A
    // finished match must keep OpenFootball's score yet gain ESPN's card timeline.
    const withScore = MATCHES.map((m) => (m.num === 1 ? { ...m, score: [0, 0] } : m))
    const map = new Map([
      [
        pairKey('Argentina', 'Canada'),
        {
          home: 'Argentina',
          away: 'Canada',
          score: [2, 1],
          state: 'post',
          clock: 'FT',
          cards: { home: [{ name: 'C. Montes', minute: 40, color: 'yellow' }], away: [] },
          subs: { home: [], away: [{ minute: 75, names: ['Player'] }] },
        },
      ],
    ])
    const m = applyLive(withScore, map).find((x) => x.num === 1)
    expect(m.score).toEqual([0, 0]) // OpenFootball wins the score
    expect(m.live).toBeUndefined() // not flagged live
    // ESPN home = Argentina = our t1, so cards/subs map straight through.
    expect(m.cards.t1).toEqual([{ name: 'C. Montes', minute: 40, color: 'yellow' }])
    expect(m.subs.t2).toEqual([{ minute: 75, names: ['Player'] }])
  })

  it('orients overlaid cards when ESPN home/away is the reverse of our order', () => {
    const withScore = MATCHES.map((m) => (m.num === 1 ? { ...m, score: [2, 1] } : m))
    // ESPN home = Canada (our t2): the away card belongs to Argentina (our t1).
    const map = new Map([
      [
        pairKey('Argentina', 'Canada'),
        {
          home: 'Canada',
          away: 'Germany',
          score: [1, 2],
          state: 'post',
          cards: { home: [{ name: 'SA Player', minute: 20, color: 'yellow' }], away: [{ name: 'MX Player', minute: 30, color: 'red' }] },
          subs: { home: [], away: [] },
        },
      ],
    ])
    const m = applyLive(withScore, map).find((x) => x.num === 1)
    expect(m.cards.t1).toEqual([{ name: 'MX Player', minute: 30, color: 'red' }])
    expect(m.cards.t2).toEqual([{ name: 'SA Player', minute: 20, color: 'yellow' }])
  })

  it('resolves a knockout placeholder by kickoff instant and overlays its score', () => {
    const ko = MATCHES.find((m) => m.num === 25) // quarter-final, placeholder teams
    const map = new Map([
      [instOf(ko), { home: 'Argentina', away: 'Ecuador', score: [1, 0], state: 'in', clock: "30'", detail: '1st Half' }],
    ])
    const merged = applyLive(MATCHES, map)
    const m = merged.find((x) => x.num === 25)
    expect(m.t1).toBe('Argentina')
    expect(m.t2).toBe('Ecuador')
    expect(m.score).toEqual([1, 0])
    expect(m.live.clock).toBe("30'")
  })

  it('returns the input unchanged when there is no live data', () => {
    expect(applyLive(MATCHES, null)).toBe(MATCHES)
    expect(applyLive(MATCHES, new Map())).toBe(MATCHES)
  })

  it('parses cards and preserves stoppage-time minutes, oriented to our order', async () => {
    // ESPN home = Canada (our t2), so events on team 'A' are Argentina's (our t1).
    const feed = {
      events: [
        event({
          date: '2024-06-21T00:00Z', state: 'in', clock: "45'+2'",
          home: 'Canada', hs: '0', away: 'Argentina', as: '1',
          details: [
            { type: { text: 'Goal' }, clock: { displayValue: "45'+2'" }, team: { id: 'A' }, scoringPlay: true, athletesInvolved: [{ shortName: 'J. Quiñones' }] },
            { type: { text: 'Yellow Card' }, clock: { displayValue: "40'" }, team: { id: 'A' }, yellowCard: true, athletesInvolved: [{ shortName: 'C. Montes' }] },
          ],
        }),
      ],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))
    const m = applyLive(MATCHES, await fetchLive()).find((x) => x.num === 1)

    expect(m.goals.t1).toEqual([{ name: 'J. Quiñones', minute: 45, extra: 2, penalty: false, og: false }])
    expect(m.cards.t1).toEqual([{ name: 'C. Montes', minute: 40, extra: undefined, color: 'yellow' }])
    // ...and the live label uses ESPN's shortDetail (so "HT"/"FT" show, not the clock).
    expect(m.live.clock).toBe("45'+2'")
  })

  it('parses goal events and orients the scorer timeline to our team order', async () => {
    // ESPN home = Canada (away in our order), so goals must be flipped.
    const feed = {
      events: [
        event({
          date: '2024-06-21T00:00Z', state: 'in', clock: "31'",
          home: 'Canada', hs: '0', away: 'Argentina', as: '1',
          details: [goal({ team: 'A', min: 9, name: 'J. Quiñones' })],
        }),
      ],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))
    const map = await fetchLive()

    const m = applyLive(MATCHES, map).find((x) => x.num === 1) // our order: Germany v Hungary
    expect(m.score).toEqual([1, 0])
    expect(m.goals.t1).toEqual([{ name: 'J. Quiñones', minute: 9, penalty: false, og: false }])
    expect(m.goals.t2).toEqual([])
  })
})

describe('espnFinalScore (getter for the reconciler)', () => {
  it('returns an oriented final only once the match is post', () => {
    const inProgress = new Map([
      [pairKey('Argentina', 'Canada'), { home: 'Germany', away: 'Hungary', score: [1, 0], state: 'in' }],
    ])
    expect(espnFinalScore(match1, inProgress)).toBeNull()

    const done = new Map([
      [pairKey('Argentina', 'Canada'), { home: 'Germany', away: 'Hungary', score: [2, 1], state: 'post' }],
    ])
    expect(espnFinalScore(match1, done)).toEqual({ home: 'Germany', away: 'Hungary', ft: [2, 1] })
  })
})

describe('the scoreboard normalizer against a sparse event', () => {
  // ESPN omits fields freely: a fixture with no kickoff instant, an event with
  // no clock, a card with only a short name, a substitution, a detail belonging
  // to neither side. None of these is exceptional, and each has its own fallback.
  const HOME_ID = '10'
  const AWAY_ID = '20'

  const sparseEvent = (over = {}) => ({
    // no `id` — the uid is the fallback handle for the summary endpoint
    uid: 's:600~e:900',
    competitions: [
      {
        competitors: [
          { homeAway: 'home', team: { id: HOME_ID, displayName: 'Alpha' }, score: '1' },
          { homeAway: 'away', team: { id: AWAY_ID, displayName: 'Beta' }, score: '1' },
        ],
        // status lives on the competition here, not on the event
        status: { type: { state: 'in' } },
        details: [
          // A shootout kick is not part of the 90 minutes.
          { shootout: true, scoringPlay: true, team: { id: HOME_ID }, athletesInvolved: [{ displayName: 'Spot Kick' }] },
          // A detail belonging to neither competitor.
          { scoringPlay: true, team: { id: '999' }, athletesInvolved: [{ displayName: 'Nobody' }] },
          // A goal with no clock at all and no athlete named.
          { scoringPlay: true, team: { id: HOME_ID } },
          // A yellow card whose player only has a short name.
          { yellowCard: true, team: { id: AWAY_ID }, clock: { displayValue: "31'" }, athletesInvolved: [{ shortName: 'B. Short' }] },
          // A red card.
          { redCard: true, team: { id: AWAY_ID }, clock: { displayValue: "88'+2'" }, athletesInvolved: [{ displayName: 'Sent Off' }] },
          // A substitution, with one unnamed player among them.
          { type: { text: 'Substitution' }, team: { id: HOME_ID }, clock: { displayValue: "60'" }, athletesInvolved: [{ displayName: 'On' }, {}] },
          // An event of no interest at all.
          { type: { text: 'Corner' }, team: { id: HOME_ID } },
          // …and one that does not even say what kind of event it is.
          { team: { id: HOME_ID } },
        ],
      },
    ],
    ...over,
  })

  const readOne = async (event) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ events: [event] }) })))
    const map = await fetchLive(undefined, ['20260101'])
    return [...map.values()][0]
  }

  it('falls back through every missing field on the event', async () => {
    const rec = await readOne(sparseEvent())
    expect(rec.id).toBe('s:600~e:900') // uid stood in for the missing id
    expect(rec.state).toBe('in') // read off the competition's status
    expect(rec.clock).toBe('') // no shortDetail and no displayClock
    expect(rec.detail).toBe('')
    expect(rec.instant).toBeNull() // no date to anchor it to

    // The shootout kick and the third-party detail are both left out.
    expect(rec.goals.home.map((g) => g.name)).toEqual([''])
    expect(rec.goals.home[0].minute).toBeNull()
    expect(rec.goals.home[0].extra).toBeUndefined()

    // A short name stands in when there is no display name.
    expect(rec.cards.away.map((c) => c.name)).toEqual(['B. Short', 'Sent Off'])
    expect(rec.cards.away.map((c) => c.color)).toEqual(['yellow', 'red'])
    expect(rec.cards.away[1]).toMatchObject({ minute: 88, extra: 2 })

    // The unnamed substitute is dropped from the list rather than blank-padded.
    expect(rec.subs.home).toEqual([{ minute: 60, extra: undefined, names: ['On'] }])
  })

  it('treats an event carrying no status at all as not yet started', async () => {
    // Neither the event nor its competition says anything about status, which is
    // how a fixture published well ahead of kickoff arrives. Reading it as "pre"
    // keeps it off the live overlay instead of promoting a 0–0 to in-progress.
    const bare = sparseEvent()
    delete bare.competitions[0].status
    const rec = await readOne(bare)
    expect(rec.state).toBe('pre')
  })

  it('keys a dated event by its instant as well as by the pairing', async () => {
    const rec = await readOne(sparseEvent({ date: '2026-01-01T15:00:00Z' }))
    expect(rec.instant).toBe(Date.parse('2026-01-01T15:00:00Z'))
  })

  // Two teams the edition actually fields, so the overlay recognises them as
  // real names it may write onto a placeholder slot.
  const realPair = PLAYED.find((m) => m.stage === 'Group')

  it('adopts ESPN’s teams and order for a knockout placeholder', () => {
    // A bracket slot still reading a feeder label has no teams of its own, so
    // the feed's naming and its home/away order are taken as they come.
    const placeholder = {
      num: 500,
      stage: 'QF',
      t1: 'Winner Match 5',
      t2: 'Winner Match 6',
      ko: '2027-07-01T15:00:00Z',
    }
    const rec = {
      id: 'e500',
      home: realPair.t1,
      away: realPair.t2,
      state: 'post',
      score: [2, 0],
      goals: { home: [], away: [] },
      cards: { home: [], away: [] },
      subs: { home: [], away: [] },
      clock: 'FT',
      detail: 'Full Time',
    }
    // A placeholder has no real pairing to key on, so the overlay finds its
    // record by kickoff instant instead.
    const key = 'inst:' + Date.parse(placeholder.ko)
    const [out] = applyLive([placeholder], new Map([[key, rec]]))
    expect(out.t1).toBe(realPair.t1)
    expect(out.t2).toBe(realPair.t2)
    expect(out.score).toEqual([2, 0])
  })

  it('leaves a placeholder side alone when the feed has no real name for it', () => {
    // Half-published knockout: ESPN knows one side and is still carrying its own
    // placeholder for the other, which must not be written onto the board.
    const placeholder = {
      num: 501,
      stage: 'QF',
      t1: 'Winner Match 7',
      t2: 'Winner Match 8',
      ko: '2027-07-02T15:00:00Z',
    }
    const rec = {
      id: 'e501',
      home: realPair.t1,
      away: 'Winner Match 8',
      state: 'post',
      score: [1, 0],
      goals: { home: [], away: [] },
      cards: { home: [], away: [] },
      subs: { home: [], away: [] },
      clock: 'FT',
      detail: 'Full Time',
    }
    const key = 'inst:' + Date.parse(placeholder.ko)
    const [out] = applyLive([placeholder], new Map([[key, rec]]))
    expect(out.t1).toBe(realPair.t1)
    expect(out.t2).toBe('Winner Match 8') // untouched
  })

  it('leaves the HOME placeholder side alone too', () => {
    // The mirror image of the case above: the side ESPN has resolved is the away
    // one. Each side is written independently, so neither guards the other.
    const placeholder = {
      num: 502,
      stage: 'QF',
      t1: 'Winner Match 9',
      t2: 'Winner Match 10',
      ko: '2027-07-03T15:00:00Z',
    }
    const rec = {
      id: 'e502',
      home: 'Winner Match 9',
      away: realPair.t2,
      state: 'post',
      score: [0, 3],
      goals: { home: [], away: [] },
      cards: { home: [], away: [] },
      subs: { home: [], away: [] },
      clock: 'FT',
      detail: 'Full Time',
    }
    const key = 'inst:' + Date.parse(placeholder.ko)
    const [out] = applyLive([placeholder], new Map([[key, rec]]))
    expect(out.t1).toBe('Winner Match 9') // untouched
    expect(out.t2).toBe(realPair.t2)
  })
})
