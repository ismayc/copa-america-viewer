import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { FollowProvider } from '../src/context/follow.jsx'
import { DetailContext } from '../src/context/detail.js'
import Standings from '../src/components/Standings.jsx'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { computeClinch } from '../src/utils/clinch.js'
import { GROUP_STAGE_MD3 } from './fixtures/group-stage-md3.js'

const renderStandings = (matches, opener = () => {}, clinch = {}) =>
  render(
    <FollowProvider>
      <DetailContext.Provider value={opener}>
        <Standings matches={matches} tz="America/New_York" hideScores={false} clinch={clinch} />
      </DetailContext.Provider>
    </FollowProvider>,
  )

// Give Group A one finished result so the modal has both a result and upcoming games.
const withGroupAResult = () =>
  MATCHES.map((m) => (m.num === 1 ? { ...m, score: [2, 1] } : m))

// A real mid-tournament snapshot (Groups B, C and D complete, Group A with its
// final matchday still to play). Groups C and D are both settled, so the tie
// between them — Winner C v Runner-up D — is mathematically locked while Group A
// is still being played. Used for the settled-matchup case.
const snapshot = MATCHES.map((m) =>
  m.stage === 'Group' && GROUP_STAGE_MD3[m.num] ? { ...m, score: GROUP_STAGE_MD3[m.num] } : m,
)

describe('Group games pop-up', () => {
  // Pinned between Argentina's first game (M1, Jun 20) and their second (M9,
  // Jun 25): on the real clock every fixture is in the past, so "Still to play"
  // renders empty and the assertion below passes against an unconditional
  // heading rather than against actual upcoming fixtures.
  it('shows only the selected team’s three matches when a team is clicked', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-23T12:00:00Z'))
    try {
      renderStandings(withGroupAResult())

      fireEvent.click(screen.getByRole('button', { name: 'Argentina' }))

      const dialog = screen.getByRole('dialog')
      expect(dialog.querySelector('.gg-head-team')).toHaveTextContent('Argentina')
      // A team plays exactly three group-stage games.
      expect(dialog.querySelectorAll('.gg-fixture')).toHaveLength(3)
      // Played section shows the finished result; still-to-play lists the rest.
      expect(within(dialog).getByText('Results')).toBeInTheDocument()
      expect(within(dialog).getByText('Still to play')).toBeInTheDocument()
      expect(within(dialog).getByText('2–1')).toBeInTheDocument()
      // The section is genuinely populated: M9 and M17 are still ahead.
      const upcoming = dialog.querySelectorAll('.md-section')[1]
      expect(upcoming.querySelectorAll('.gg-fixture')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the whole group’s six matches when the group title is clicked', () => {
    renderStandings(withGroupAResult())

    fireEvent.click(screen.getByRole('button', { name: 'Group A' }))

    const dialog = screen.getByRole('dialog')
    // A four-team group plays six matches in all.
    expect(dialog.querySelectorAll('.gg-fixture')).toHaveLength(6)
  })

  it('clicking a fixture opens the match detail view', () => {
    let opened = null
    renderStandings(withGroupAResult(), (m) => {
      opened = m
    })

    fireEvent.click(screen.getByRole('button', { name: 'Argentina' }))
    const dialog = screen.getByRole('dialog')
    // The finished fixture row (Argentina v Canada) opens its detail.
    fireEvent.click(within(dialog).getByText('2–1').closest('button'))

    expect(opened?.num).toBe(1)
  })

  it('shows a tip describing the team / group click functionality', () => {
    renderStandings(MATCHES)
    const tip = document.querySelector('.standings-tip')
    expect(tip).toBeInTheDocument()
    expect(tip).toHaveTextContent(/click a team name/i)
    expect(tip).toHaveTextContent(/group title/i)
  })

  it('shows the quarter-final matchup for a team that has clinched a place', () => {
    renderStandings(MATCHES, () => {}, { Argentina: 'won-group' })

    fireEvent.click(screen.getByRole('button', { name: 'Argentina' }))
    const ko = document.querySelector('.gg-knockout')
    expect(ko).toBeInTheDocument()
    expect(ko).toHaveTextContent(/Quarter-final/i)
    expect(ko).toHaveTextContent(/qualified for the knockout round/i)
    // The selected team appears in the projected matchup line.
    expect(ko.querySelector('.gg-ko-match')).toHaveTextContent('Argentina')
  })

  it('shows a confirmed (non-provisional) matchup when the opponent is locked', () => {
    // Live snapshot: Uruguay won Group C and Brazil finished second in Group D,
    // so their quarter-final is locked even though Group A is still playing.
    // (It is also the real M27, which Uruguay went on to win on penalties.)
    renderStandings(snapshot, () => {}, computeClinch(snapshot))

    fireEvent.click(screen.getByRole('button', { name: 'Uruguay' }))
    const ko = document.querySelector('.gg-knockout')
    expect(ko).toBeInTheDocument()
    expect(ko.querySelector('.gg-ko-match')).toHaveTextContent('Brazil')
    expect(ko.querySelector('.gg-ko-confirmed')).toBeInTheDocument()
    expect(ko.querySelector('.gg-ko-note')).toBeNull()
  })

  it('keeps the "provisional" note while the opponent can still change', () => {
    renderStandings(MATCHES, () => {}, { Argentina: 'won-group' })

    fireEvent.click(screen.getByRole('button', { name: 'Argentina' }))
    const ko = document.querySelector('.gg-knockout')
    expect(ko).toBeInTheDocument()
    expect(ko.querySelector('.gg-ko-confirmed')).toBeNull()
    expect(ko.querySelector('.gg-ko-note')).toBeInTheDocument()
  })

  it('omits the quarter-final section for a team that has not clinched', () => {
    renderStandings(MATCHES) // empty clinch map

    fireEvent.click(screen.getByRole('button', { name: 'Argentina' }))
    expect(document.querySelector('.gg-knockout')).toBeNull()
  })

  it('shows no knockout section when a group title (no single team) is opened', () => {
    renderStandings(MATCHES, () => {}, { Argentina: 'won-group' })

    fireEvent.click(screen.getByRole('button', { name: 'Group A' }))
    expect(document.querySelector('.gg-knockout')).toBeNull()
  })
})
