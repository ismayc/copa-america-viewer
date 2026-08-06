import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import Bracket from '../src/components/Bracket.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { DetailContext } from '../src/context/detail.js'
import { STAGE_LABELS } from '../src/data/matches.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored, playedUpTo } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

Element.prototype.scrollIntoView = vi.fn()

// Decorate a few knockout matches with scores/pens/aet/live so the score-display
// branches render. (Synthetic: the real tournament had extra time in the Final
// only — see the data tests for that.)
function withScores() {
  return MATCHES.map((m) => {
    if (m.num === 32) return { ...m, score: [1, 1], pens: [4, 2] } // Final w/ pens
    if (m.num === 27) return { ...m, score: [2, 1], aet: true } // QF won in ET
    if (m.num === 25) return { ...m, score: [3, 0] } // plain score
    if (m.num === 26) return { ...m, live: true, score: [0, 0] } // live
    return m
  })
}

const renderBracket = (matches, props = {}) => {
  const openDetail = vi.fn()
  render(
    <FollowProvider>
      <DetailContext.Provider value={openDetail}>
        <Bracket matches={matches} tz="America/New_York" hideScores={false} {...props} />
      </DetailContext.Provider>
    </FollowProvider>,
  )
  return { openDetail }
}

describe('Bracket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders every round from the quarter-finals to the Final', () => {
    renderBracket(MATCHES)
    expect(screen.getAllByText(/Final/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(STAGE_LABELS.QF).length).toBeGreaterThan(0)
    // Copa keeps the third-place play-off (the Euro sibling has none), so the
    // Final column carries it under its own label.
    expect(screen.getByText(STAGE_LABELS['3rd'])).toBeInTheDocument()
    expect(document.getElementById('bx-m31')).toBeInTheDocument()
  })

  it('renders scores, penalties, AET, and the live badge', () => {
    renderBracket(withScores())
    expect(screen.getByText('1–1')).toBeInTheDocument() // final score
    expect(screen.getByText(/\(p 4–2\)/)).toBeInTheDocument() // pens
    expect(screen.getByText('2–1')).toBeInTheDocument() // the tie won in ET
    expect(screen.getByText(/AET/)).toBeInTheDocument()
    expect(screen.getByText('3–0')).toBeInTheDocument() // plain
  })

  it('hides scores when hideScores is set', () => {
    renderBracket(withScores(), { hideScores: true })
    expect(screen.queryByText('3–0')).not.toBeInTheDocument()
  })

  it('opens detail on click and on keyboard activation', () => {
    const { openDetail } = renderBracket(MATCHES)
    const card = document.getElementById('bx-m25')
    fireEvent.click(card)
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.keyDown(card, { key: ' ' })
    fireEvent.keyDown(card, { key: 'Escape' }) // ignored branch
    expect(openDetail).toHaveBeenCalledTimes(3)
  })

  it('expands a semi-final slot into the two feeding quarter-final teams as a potential matchup', () => {
    // SF 29 is fed by quarter-finals 25 and 26. Once those ties have real teams,
    // the SF box should read "TeamA / TeamB" instead of "Winner Match 25".
    // (The quarter-finals themselves are fed by GROUP slots, not by a previous
    // tie — Copa's knockout starts here — so this is the earliest box that can
    // expand at all.)
    const matches = MATCHES.map((m) => {
      if (m.num === 25) return { ...m, t1: 'Argentina', t2: 'Ecuador' }
      if (m.num === 26) return { ...m, t1: 'Venezuela', t2: 'Canada' }
      return m
    })
    renderBracket(matches)
    const m29 = document.getElementById('bx-m29')
    expect(m29.textContent).not.toMatch(/Winner Match/)
    expect(m29.querySelectorAll('.bx-side-feeder').length).toBe(2)
    for (const t of ['Argentina', 'Ecuador', 'Venezuela', 'Canada']) {
      expect(within(m29).getByText(t)).toBeInTheDocument()
    }
    // Each pair joins its two teams with "/"; the two pairs are joined by a single
    // "vs" divider (wide layout, hidden on mobile via CSS).
    expect(m29.querySelectorAll('.bx-side-feeder .bx-slash').length).toBe(2)
    const vs = m29.querySelectorAll('.bx-vs-divider')
    expect(vs.length).toBe(1)
    expect(vs[0].textContent).toBe('vs')
  })

  // The feeder expansion is round-agnostic: a "Winner/Loser Match N" slot shows
  // its pair the moment match N has two real teams. So as each round is played and
  // the next round's teams get confirmed, that next round renders "pair vs pair"
  // exactly like the semi-finals do — with no per-round special-casing. The
  // third-place play-off proves the LOSER side of that too.
  describe('cascades to later rounds as teams are confirmed', () => {
    // SF 29 ← QF 25/26 · Final 32 ← SF 29/30 · 3rd 31 ← the losers of SF 29/30.
    const cases = [
      { round: 'Semi-final', box: 29, feeders: [25, 26] },
      { round: 'Final', box: 32, feeders: [29, 30] },
      { round: 'Third-place play-off', box: 31, feeders: [29, 30] },
    ]
    const teams = ['Argentina', 'Ecuador', 'Venezuela', 'Canada']
    for (const { round, box, feeders } of cases) {
      it(`${round} box shows pair vs pair once its feeders have teams`, () => {
        const matches = MATCHES.map((m) => {
          if (m.num === feeders[0]) return { ...m, t1: teams[0], t2: teams[1] }
          if (m.num === feeders[1]) return { ...m, t1: teams[2], t2: teams[3] }
          return m
        })
        renderBracket(matches)
        const el = document.getElementById(`bx-m${box}`)
        expect(el.querySelectorAll('.bx-side-feeder').length).toBe(2)
        expect(el.querySelector('.bx-vs-divider')).toBeTruthy()
        for (const t of teams) expect(within(el).getByText(t)).toBeInTheDocument()
      })
    }
  })

  it('populates a slot from partial results — no waiting for the whole previous round', () => {
    // Only the feeders for ONE Final side are in: SF 29 has its two teams, but
    // SF 30 is still a placeholder. The ready side shows its candidate pair
    // immediately; the pending side stays a label and there's no divider yet.
    const matches = MATCHES.map((m) =>
      m.num === 29 ? { ...m, t1: 'Argentina', t2: 'Canada' } : m,
    )
    renderBracket(matches)
    const m32 = document.getElementById('bx-m32')
    expect(m32.querySelectorAll('.bx-side-feeder').length).toBe(1) // only the ready side
    expect(within(m32).getByText('Argentina')).toBeInTheDocument()
    expect(within(m32).getByText('Canada')).toBeInTheDocument()
    expect(within(m32).getByText('Winner Match 30')).toBeInTheDocument() // pending side
    expect(m32.querySelector('.bx-vs-divider')).toBeNull()
  })

  it('shows no "vs" divider when only one semi-final side is a resolved pair', () => {
    // Only match 25 resolved → SF 29 has one feeder side and one plain
    // "Winner Match 26" placeholder, so there is no all-four-teams "vs" divider.
    const matches = MATCHES.map((m) =>
      m.num === 25 ? { ...m, t1: 'Argentina', t2: 'Ecuador' } : m,
    )
    renderBracket(matches)
    const m29 = document.getElementById('bx-m29')
    expect(m29.querySelector('.bx-vs-divider')).toBeNull()
    expect(m29.querySelectorAll('.bx-side-feeder').length).toBe(1)
  })

  it('leaves a feed slot as its plain label while the source tie is unresolved', () => {
    // Blank board: the quarter-finals still hold group placeholders, so the
    // semi-final can't expand yet.
    renderBracket(MATCHES)
    const m29 = document.getElementById('bx-m29')
    expect(within(m29).getByText('Winner Match 25')).toBeInTheDocument()
    expect(m29.querySelector('.bx-side-feeder')).toBeNull()
  })

  it('scrolls a focused match into view and calls onFocusHandled', () => {
    const onFocusHandled = vi.fn()
    renderBracket(MATCHES, { focusMatch: 25, onFocusHandled })
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    expect(onFocusHandled).toHaveBeenCalled()
  })

  it('handles a focusMatch that does not exist (no element)', () => {
    const onFocusHandled = vi.fn()
    renderBracket(MATCHES, { focusMatch: 99999, onFocusHandled })
    expect(onFocusHandled).toHaveBeenCalled()
  })

  it('does nothing when focusMatch is null', () => {
    const onFocusHandled = vi.fn()
    renderBracket(MATCHES, { focusMatch: null, onFocusHandled })
    expect(onFocusHandled).not.toHaveBeenCalled()
  })

  it('clears the focus highlight after the timeout', () => {
    vi.useFakeTimers()
    try {
      renderBracket(MATCHES, { focusMatch: 25 })
      const el = document.getElementById('bx-m25')
      expect(el.classList.contains('bx-focus')).toBe(true)
      vi.advanceTimersByTime(2300)
      expect(el.classList.contains('bx-focus')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Bracket — mobile round view', () => {
  let originalMM
  beforeEach(() => {
    vi.clearAllMocks()
    originalMM = window.matchMedia
    // Force the mobile branch (narrow viewport).
    window.matchMedia = (q) => ({
      matches: true,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  })
  afterEach(() => {
    window.matchMedia = originalMM
  })

  it('shows a round selector and only one round at a time (no wide bracket)', () => {
    renderBracket(MATCHES)
    // A pill per round — three of them, since Copa's knockout starts at the QF.
    expect(screen.getByRole('tab', { name: STAGE_LABELS.QF })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: STAGE_LABELS.SF })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: STAGE_LABELS.Final })).toBeInTheDocument()
    expect(screen.getAllByRole('tab').length).toBe(3)
    // Nothing decided yet → defaults to the QF: its matches render, later rounds don't.
    expect(screen.getByRole('tab', { name: STAGE_LABELS.QF }).getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(document.getElementById('bx-m25')).toBeInTheDocument() // QF
    expect(document.getElementById('bx-m29')).toBeNull() // SF hidden
    expect(document.getElementById('bx-m32')).toBeNull() // Final hidden
  })

  it('switches the visible round when a pill is tapped', () => {
    renderBracket(MATCHES)
    fireEvent.click(screen.getByRole('tab', { name: STAGE_LABELS.SF }))
    expect(document.getElementById('bx-m29')).toBeInTheDocument() // SF shown
    expect(document.getElementById('bx-m25')).toBeNull() // QF no longer rendered
  })

  it('puts the third-place play-off alongside the Final, under its own label', () => {
    renderBracket(MATCHES)
    fireEvent.click(screen.getByRole('tab', { name: STAGE_LABELS.Final }))
    expect(document.getElementById('bx-m32')).toBeInTheDocument() // Final
    expect(document.getElementById('bx-m31')).toBeInTheDocument() // third-place
    expect(screen.getByText(STAGE_LABELS['3rd'])).toBeInTheDocument()
  })

  it('opens to the target round when arriving via a focus link', () => {
    renderBracket(MATCHES, { focusMatch: 29 }) // a semi-final
    expect(screen.getByRole('tab', { name: STAGE_LABELS.SF }).getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(document.getElementById('bx-m29')).toBeInTheDocument()
  })
})

describe('Bracket with pieces missing', () => {
  it('leaves a slot blank when the board has no match for it', () => {
    // The bracket lays out every knockout slot from the format, not from the
    // data, so a board that has not published a given match yet must render an
    // empty position rather than throw on the missing record.
    const knockoutless = MATCHES.filter((m) => m.stage === 'Group')
    expect(() => renderBracket(knockoutless)).not.toThrow()
    expect(document.querySelector('.bracket, .bk, .br')).toBeTruthy()
  })

  it('renders on a platform with no matchMedia', () => {
    // The responsive hook is the only thing that touches matchMedia; where it is
    // absent the bracket still has to render at its default width.
    const real = window.matchMedia
    delete window.matchMedia
    try {
      expect(() => renderBracket(MATCHES)).not.toThrow()
      expect(screen.getAllByText(/Final/i).length).toBeGreaterThan(0)
    } finally {
      window.matchMedia = real
    }
  })

  it('highlights a followed team as a bracket side and as a feeder candidate', () => {
    // Mid-tournament: the quarter-finals are played, the semi-finals are still
    // reading "Winner Match 25", so the same team appears twice — once as a
    // resolved side of its own tie and once as a candidate inside the tie it
    // feeds. Following it has to light up both.
    localStorage.setItem('copa:followed', JSON.stringify(['Argentina']))
    try {
      renderBracket(playedUpTo(28))
      expect(document.querySelector('.bx-side.followed')).toBeTruthy()
      expect(document.querySelector('.bx-feeder-team.followed')).toBeTruthy()
    } finally {
      localStorage.clear()
    }
  })
})
