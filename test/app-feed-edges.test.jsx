import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { fetchResults, pairKey } from '../src/services/results.js'
import { fetchLive } from '../src/services/espn.js'

// Three states the two feeds can leave the app in that a scoreboard payload
// cannot express, so they are driven by stubbing the services outright:
//   • the OpenFootball request was ABORTED (superseded by another load), which
//     must not be reported as a failure,
//   • the by-date ESPN backfill is the only source that still has a final —
//     the rolling live window has aged it out,
//   • both feeds answered and there is simply nothing played yet.
// Everything else about the feeds is exercised against real payloads in
// app-coverage.test.jsx.
vi.mock('../src/services/results.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchResults: vi.fn(async () => new Map()) }
})
vi.mock('../src/services/espn.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchLive: vi.fn(async () => new Map()) }
})

// This edition is finished, so the committed schedule ships every result — a
// board with nothing played is the only one on which "no results yet" and a
// single backfilled final mean anything.
vi.mock('../src/data/matches.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    MATCHES: actual.MATCHES.map((m) => {
      const { score, pens, aet, goals, live, statusLabel, cards, ...rest } = m
      return m.label1 ? { ...rest, t1: m.label1, t2: m.label2 } : rest
    }),
  }
})

const { MATCHES } = await vi.importActual('../src/data/matches.js')

const App = (await import('../src/App.jsx')).default

// A finished ESPN record for the opener, in the shape fetchLive returns.
const played = MATCHES.find((m) => m.stage === 'Group')
const finalRec = {
  id: 'e1',
  home: played.t1,
  away: played.t2,
  state: 'post',
  score: [2, 0],
  goals: { home: [], away: [] },
  cards: { home: [], away: [] },
  subs: { home: [], away: [] },
  clock: 'FT',
  detail: 'Full Time',
  instant: Date.parse(played.ko),
}

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ events: [] }) }))
  window.history.replaceState(null, '', '/')
  localStorage.clear()
  fetchResults.mockReset()
  fetchResults.mockResolvedValue(new Map())
  fetchLive.mockReset()
  fetchLive.mockResolvedValue(new Map())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App — what the two feeds can leave behind', () => {
  it('stays quiet when the results request was aborted rather than failing', () => {
    fetchResults.mockRejectedValue(
      Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }),
    )
    render(<App />)
    return waitFor(() => {
      expect(fetchResults).toHaveBeenCalled()
      expect(screen.queryByText(/Couldn’t reach results feed/)).toBeNull()
    })
  })

  it('still reports a genuine results failure', async () => {
    fetchResults.mockRejectedValue(new Error('offline'))
    render(<App />)
    expect(await screen.findByText(/Couldn’t reach results feed/)).toBeInTheDocument()
  })

  it('says so plainly when both feeds answer and nothing has been played', async () => {
    render(<App />)
    expect(await screen.findByText(/No results yet/)).toBeInTheDocument()
  })

  it('counts the by-date backfill as a source when the live window no longer has the match', async () => {
    // ESPN drops a match from its rolling scoreboard after a couple of days, so
    // the live map comes back without it while the by-date backfill still has
    // the final. The score has to be confirmed from the backfill rather than
    // dropping to "1 source".
    fetchLive.mockImplementation(async (_signal, dates) =>
      dates ? new Map([[pairKey(finalRec.home, finalRec.away), finalRec]]) : new Map(),
    )
    render(<App />)
    // The backfilled final reaches the board: the results bar counts it.
    expect(await screen.findByText(/1 match with scores/)).toBeInTheDocument()
  })
})
