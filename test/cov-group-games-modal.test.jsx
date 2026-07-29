import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import GroupGamesModal from '../src/components/GroupGamesModal.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { DetailContext } from '../src/context/detail.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

// Group A fixtures (num/teams) used to craft scores, live and voided states.
const GROUP_A = MATCHES.filter((m) => m.stage === 'Group' && m.group === 'A')

// The bundled MATCHES kick off in June 2024 — already in the past relative to
// "now", so without a score they read as finished. Push Group A's kickoffs into
// the future so the "upcoming" branches render.
const FUTURE = '2099-06-11T15:00:00-04:00'
const groupAInFuture = () =>
  MATCHES.map((m) => (m.stage === 'Group' && m.group === 'A' ? { ...m, ko: FUTURE } : m))

const renderModal = (props = {}) => {
  const openDetail = vi.fn()
  const onClose = vi.fn()
  const result = render(
    <FollowProvider>
      <DetailContext.Provider value={openDetail}>
        <GroupGamesModal
          group="A"
          matches={MATCHES}
          tz="America/New_York"
          hideScores={false}
          onClose={onClose}
          {...props}
        />
      </DetailContext.Provider>
    </FollowProvider>,
  )
  return { openDetail, onClose, ...result }
}

describe('GroupGamesModal (coverage)', () => {
  it('renders the empty "Results" and full "Still to play" lists for an untouched group', () => {
    // No scores → nothing played (line 183 empty state) and every fixture is
    // upcoming (lines 190-194 list + Upcoming badge on line 65).
    renderModal({ matches: groupAInFuture() })
    expect(screen.getByText('No games played yet.')).toBeInTheDocument()
    expect(screen.getAllByText('Upcoming').length).toBe(GROUP_A.length)
    expect(document.querySelectorAll('.gg-vs').length).toBe(GROUP_A.length)
  })

  it('renders a finished score, a live badge and a voided badge', () => {
    // m1 final, m2 live, m9 voided → covers lines 59 (live), 61 (voided),
    // plus the FT/score paths.
    const matches = MATCHES.map((m) => {
      if (m.num === 1) return { ...m, score: [2, 0] }
      if (m.num === 2) return { ...m, live: { clock: "60'", detail: '' }, score: [1, 1] }
      if (m.num === 9) return { ...m, voided: true, statusLabel: 'Abandoned' }
      return m
    })
    renderModal({ matches })
    expect(screen.getByText('2–0')).toBeInTheDocument()
    expect(screen.getAllByText('FT').length).toBeGreaterThan(0)
    expect(screen.getByText('Abandoned')).toBeInTheDocument()
    // Live badge present.
    expect(document.querySelector('.gg-status')).toBeTruthy()
  })

  it('hides scores in spoiler-free mode and reveals them on click', () => {
    // hideScores → spoiler bar (lines 166-171). A finished match shows the
    // hidden •–• placeholder (line 50) until revealed.
    const matches = MATCHES.map((m) => (m.num === 1 ? { ...m, score: [3, 1] } : m))
    renderModal({ matches, hideScores: true })
    expect(screen.getByText(/Scores hidden in spoiler-free mode/)).toBeInTheDocument()
    expect(document.querySelector('.gg-score-hidden')).toBeTruthy()
    expect(screen.queryByText('3–1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Reveal scores/ }))
    // After reveal the real score shows and the reveal button is gone.
    expect(screen.getByText('3–1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reveal scores/ })).not.toBeInTheDocument()
  })

  it('opens the detail modal (and closes itself) when a fixture row is clicked', () => {
    // Covers the openMatch path: onClose() then openDetail(m).
    const matches = MATCHES.map((m) => (m.num === 1 ? { ...m, score: [1, 0] } : m))
    const { openDetail, onClose } = renderModal({ matches })
    fireEvent.click(screen.getByText('1–0').closest('button'))
    expect(onClose).toHaveBeenCalled()
    expect(openDetail).toHaveBeenCalledTimes(1)
  })

  it('shows the "won-group" knockout section with a confirmed opponent', () => {
    renderModal({
      team: 'Argentina',
      knockout: { status: 'won-group', opponent: 'Ecuador', settled: true, matchNum: 25 },
    })
    // Copa's knockout starts here, so the section names the quarter-final — the
    // Euro sibling's first knockout round is the Round of 16.
    expect(screen.getByText('Quarter-final')).toBeInTheDocument()
    expect(screen.getByText(/as group winners/)).toBeInTheDocument()
    expect(screen.getByText(/will play:/)).toBeInTheDocument()
    expect(screen.getByText(/confirmed/)).toBeInTheDocument()
    expect(screen.getByText('Match 25')).toBeInTheDocument()
  })

  it('shows the "runner-up" knockout wording (line 80)', () => {
    renderModal({ team: 'Argentina', knockout: { status: 'runner-up', opponent: 'Ecuador' } })
    expect(screen.getByText(/as group runners-up/)).toBeInTheDocument()
  })

  it('shows the "top2" knockout wording (line 82)', () => {
    renderModal({ team: 'Argentina', knockout: { status: 'top2', opponent: 'Ecuador' } })
    expect(screen.getByText(/with a top-two finish/)).toBeInTheDocument()
  })

  it('shows a TBD opponent while the other side of the tie is open', () => {
    // No opponent hits the "To be determined" branch and the projected-matchup
    // note. (There is no best-third wording to cover: Copa has no such route,
    // so a qualified team is always a group winner or runner-up.)
    renderModal({ team: 'Argentina', knockout: { status: 'runner-up' } })
    expect(screen.getByText('To be determined')).toBeInTheDocument()
    expect(screen.getByText(/currently projected to play:/)).toBeInTheDocument()
  })

  it('shows a Delayed badge when past kickoff with no live feed or score (line 65)', () => {
    vi.useFakeTimers()
    try {
      const m1 = MATCHES.find((m) => m.num === 1)
      // "now" pinned to kickoff → inside the window but no ESPN clock / score.
      vi.setSystemTime(new Date(m1.ko))
      renderModal()
      expect(screen.getByText('Delayed')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('filters to a single team and shows its three group matches', () => {
    // team set → fixtures filtered; also renders the team head (lines 158-162).
    renderModal({ matches: groupAInFuture(), team: 'Argentina' })
    const head = document.querySelector('.gg-head-team')
    expect(head.textContent).toMatch(/Argentina/)
    // Argentina plays 3 of Group A's matches.
    expect(screen.getAllByText('Upcoming').length).toBe(3)
  })
})
