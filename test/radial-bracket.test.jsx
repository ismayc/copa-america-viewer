import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RadialBracket from '../src/components/RadialBracket.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { DetailContext } from '../src/context/detail.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { TEAMS } from '../src/data/teams.js'
import { computeClinch } from '../src/utils/clinch.js'
import { resolveBracket } from '../src/utils/bracketResolve.js'

const GROUPS = Object.keys(TEAMS)
const ALL = new Set(Object.values(TEAMS).flat().map((t) => t.name))

// A clean 9/6/3/0 group stage so the quarter-finals resolve unambiguously.
function buildComplete() {
  const score = {}
  for (const g of GROUPS) {
    const idx = Object.fromEntries(TEAMS[g].map((t, k) => [t.name, k]))
    for (const m of MATCHES) {
      if (m.stage !== 'Group' || m.group !== g) continue
      score[m.num] = idx[m.t1] < idx[m.t2] ? [1, 0] : [0, 1]
    }
  }
  return MATCHES.map((m) => (score[m.num] ? { ...m, score: score[m.num] } : m))
}

// Play the whole bracket through (home advances; one shootout) to a champion.
function playedBracket() {
  let cur = buildComplete()
  const clinch = computeClinch(cur)
  cur = resolveBracket(cur, clinch)
  for (let pass = 0; pass < 10; pass++) {
    let changed = false
    cur = cur.map((m) => {
      if (m.stage === 'Group' || Array.isArray(m.score)) return m
      if (!ALL.has(m.t1) || !ALL.has(m.t2)) return m
      changed = true
      return m.num === 25 ? { ...m, score: [1, 1], pens: [4, 2] } : { ...m, score: [1, 0] }
    })
    cur = resolveBracket(cur, clinch)
    if (!changed) break
  }
  return cur
}

const renderRB = (matches) => {
  const openDetail = vi.fn()
  const utils = render(
    <FollowProvider>
      <DetailContext.Provider value={openDetail}>
        <RadialBracket matches={matches} />
      </DetailContext.Provider>
    </FollowProvider>,
  )
  return { ...utils, openDetail }
}

describe('RadialBracket', () => {
  it('renders the ring structure and trophy before any results', () => {
    const { container } = renderRB(MATCHES)
    expect(container.querySelector('.rb-svg')).toBeTruthy()
    expect(screen.getByText('🏆')).toBeInTheDocument()
    // Copa still plays a third-place play-off (the Euro dropped it in 1980), and
    // it hangs below the trophy rather than sitting in the ring.
    expect(screen.getByText(/Third place/)).toBeInTheDocument()
    // Connectors for the whole tree are drawn.
    expect(container.querySelectorAll('.rb-line').length).toBeGreaterThan(15)
    // A clickable matchup group + match-number label for all 8 knockout matches
    // (4 QF + 2 SF + the play-off + the Final).
    expect(container.querySelectorAll('.rb-matchup.rb-click').length).toBe(8)
    expect(container.querySelectorAll('.rb-mnum').length).toBe(8)
    expect(screen.getByText('M25')).toBeInTheDocument()
    // Pre-knockout there's no champion crown yet.
    expect(screen.queryByText('👑')).toBeNull()
  })

  it('fills flags with country-name tooltips and crowns the champion once played', () => {
    const { container } = renderRB(playedBracket())
    // Each flag node carries an SVG <title> = the country name (hover tooltip).
    const titles = [...container.querySelectorAll('title')].map((t) => t.textContent)
    expect(titles.some((t) => /^Argentina/.test(t))).toBe(true)
    expect(titles.some((t) => /^Ecuador/.test(t))).toBe(true)
    // The champion is crowned, and a "Champion: …" title is present.
    expect(screen.getByText('👑')).toBeInTheDocument()
    expect(titles.some((t) => /^Champion: /.test(t))).toBe(true)
    // The champion's name lights up under the (glowing) trophy.
    expect(screen.getByText(/— Champions$/)).toBeInTheDocument()
    expect(container.querySelector('.rb-trophy-won')).toBeTruthy()
  })

  it('pins the final (M32) above the trophy and the play-off (M31) below it', () => {
    const { container } = renderRB(playedBracket())
    const num = (label) =>
      [...container.querySelectorAll('.rb-mnum')].find((t) => t.textContent === label)
    // viewBox centre is y=500; the final's number must sit above it…
    expect(num('M32')).toBeTruthy()
    expect(parseFloat(num('M32').getAttribute('y'))).toBeLessThan(500)
    // …and the third-place play-off hangs below.
    expect(num('M31')).toBeTruthy()
    expect(parseFloat(num('M31').getAttribute('y'))).toBeGreaterThan(500)
  })

  it('opens the match detail when a flag is clicked', () => {
    const { container, openDetail } = renderRB(playedBracket())
    const node = container.querySelector('.rb-node.rb-click')
    expect(node).toBeTruthy()
    fireEvent.click(node)
    expect(openDetail).toHaveBeenCalledTimes(1)
  })

  it('shows scores on played matches, hides them in spoiler-free mode, and blinks a live dot', () => {
    // Played bracket → scores present; mark one Round-of-16 tie live.
    const played = playedBracket().map((m) => (m.num === 25 ? { ...m, live: { clock: "70'" } } : m))
    const { container, rerender } = renderRB(played)
    expect(container.querySelectorAll('.rb-score').length).toBeGreaterThan(0)
    expect(container.querySelector('.rb-live-dot')).toBeTruthy() // M25 is in play
    // Spoiler-free: scores hidden (the live dot, a status not a score, remains).
    rerender(
      <FollowProvider>
        <DetailContext.Provider value={() => {}}>
          <RadialBracket matches={played} hideScores />
        </DetailContext.Provider>
      </FollowProvider>,
    )
    expect(container.querySelectorAll('.rb-score').length).toBe(0)
    expect(container.querySelector('.rb-live-dot')).toBeTruthy()
  })

  it('opens the match detail when a matchup group (its bracket join / number) is clicked', () => {
    const { container, openDetail } = renderRB(playedBracket())
    const group = container.querySelector('.rb-matchup.rb-click')
    expect(group).toBeTruthy()
    fireEvent.click(group)
    expect(openDetail).toHaveBeenCalledTimes(1)
  })

  it('labels the rounds down the top seam and shows kickoff times on unplayed ties', () => {
    const { container } = renderRB(MATCHES)
    // Only two seam labels: this bracket starts at the quarter-finals, so there
    // is no Round-of-16 ring to name.
    for (const label of ['QUARTER-FINALS', 'SEMI-FINALS']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.queryByText(/ROUND OF 16/)).toBeNull()
    // Every knockout tie is unplayed → each of the 8 shows its kickoff time.
    expect(container.querySelectorAll('.rb-time').length).toBe(8)
    // A played bracket swaps times for scores.
    const done = renderRB(playedBracket())
    expect(done.container.querySelectorAll('.rb-time').length).toBe(0)
  })

  it('spotlights matches playing today with a halo', () => {
    vi.useFakeTimers()
    try {
      // "Today" = the semi-finals' first day → M49 gets a halo, M50 (next day) doesn't.
      vi.setSystemTime(new Date('2024-07-09T10:00:00+02:00'))
      const { container } = renderRB(MATCHES)
      expect(container.querySelectorAll('.rb-halo').length).toBe(1)
      // A quiet day → no halos anywhere.
      const quiet = renderRB(MATCHES.map((m) => ({ ...m })))
      vi.setSystemTime(new Date('2024-08-01T10:00:00+02:00'))
      quiet.rerender(
        <FollowProvider>
          <DetailContext.Provider value={() => {}}>
            <RadialBracket matches={MATCHES.map((m) => ({ ...m }))} />
          </DetailContext.Provider>
        </FollowProvider>,
      )
      expect(quiet.container.querySelectorAll('.rb-halo').length).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('dims eliminated teams while the tournament is on, none once it is over', () => {
    // Play everything up to (not including) the semis: the four beaten
    // quarter-finalists fade, the four semi-finalists stay vivid.
    let cur = buildComplete()
    const clinch = computeClinch(cur)
    cur = resolveBracket(cur, clinch)
    for (let pass = 0; pass < 10; pass++) {
      cur = cur.map((m) => {
        if (m.stage === 'Group' || Array.isArray(m.score)) return m
        if ([29, 30, 31, 32].includes(m.num)) return m
        if (!ALL.has(m.t1) || !ALL.has(m.t2)) return m
        return { ...m, score: [1, 0] }
      })
      cur = resolveBracket(cur, clinch)
    }
    const { container } = renderRB(cur)
    expect(container.querySelectorAll('.rb-node.out').length).toBe(4)
    // Fully played → the race is over; the finished bracket stays vivid.
    const done = renderRB(playedBracket())
    expect(done.container.querySelectorAll('.rb-node.out').length).toBe(0)
  })

  it('lights the champion’s golden trail once the Final is decided', () => {
    const { container } = renderRB(playedBracket())
    // The champion's route: QF → SF → Final = 3 matchups. (The third-place
    // play-off is never on it — the champion by definition never played it.)
    expect(container.querySelectorAll('.rb-matchup.champ-trail').length).toBe(3)
    expect(container.querySelectorAll('.rb-node.on-trail').length).toBeGreaterThan(0)
    // No trail while the Final is unplayed.
    const pending = renderRB(MATCHES)
    expect(pending.container.querySelectorAll('.champ-trail').length).toBe(0)
  })
})
