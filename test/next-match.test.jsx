import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import NextMatch from '../src/components/NextMatch.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

const TZ = 'America/New_York'

function renderNM(matches, followedTeams = []) {
  localStorage.setItem('copa:followed', JSON.stringify(followedTeams))
  return render(
    <FollowProvider>
      <NextMatch matches={matches} tz={TZ} />
    </FollowProvider>,
  )
}

describe('NextMatch', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it('shows the tournament-concluded message when there is no match', () => {
    vi.setSystemTime(new Date('2024-08-01T00:00:00Z'))
    renderNM([]) // empty list => no live, no upcoming
    expect(screen.getByText(/tournament has concluded/)).toBeInTheDocument()
  })

  it('crowns the champion (and runners-up) once the Final is decided', () => {
    vi.setSystemTime(new Date('2024-08-01T00:00:00Z'))
    const final = {
      num: 32,
      stage: 'Final',
      t1: 'Argentina',
      t2: 'Colombia',
      venue: 'hardrock',
      ko: '2024-07-14T21:15:00-04:00',
      score: [3, 2],
    }
    renderNM([final])
    expect(screen.getByText('Argentina')).toBeInTheDocument()
    expect(screen.getByText('Copa América champions!')).toBeInTheDocument()
    expect(screen.getByText(/Runners-up:.*Colombia/)).toBeInTheDocument()
  })

  it('falls back to the generic message when the Final is not yet decided', () => {
    vi.setSystemTime(new Date('2024-08-01T00:00:00Z'))
    // Final in the past but no score recorded → no champion to crown.
    const final = { num: 32, stage: 'Final', t1: 'Argentina', t2: 'Colombia', venue: 'hardrock', ko: '2024-07-14T21:15:00-04:00' }
    renderNM([final])
    expect(screen.getByText(/tournament has concluded/)).toBeInTheDocument()
    expect(screen.queryByText('Copa América champions!')).not.toBeInTheDocument()
  })

  it('shows the next upcoming match with a multi-day countdown', () => {
    // Pin before the tournament so the opener is the next match (days > 0).
    vi.setSystemTime(new Date('2024-06-01T12:00:00Z'))
    renderNM(MATCHES)
    expect(screen.getByText('⏱ Next match')).toBeInTheDocument()
    const countdown = screen.getByLabelText('time until kickoff')
    // Days segment present.
    expect(countdown.querySelector('small')).toBeInTheDocument()
    expect(countdown.textContent).toMatch(/d/)
    expect(screen.getByText('vs')).toBeInTheDocument()
  })

  it('prefers a followed team\'s next match and labels it accordingly', () => {
    vi.setSystemTime(new Date('2024-06-01T12:00:00Z'))
    // Follow a team that does not play first, so it differs from upcoming[0].
    renderNM(MATCHES, ['Uruguay'])
    expect(screen.getByText('⭐ Your next match')).toBeInTheDocument()
    // The chosen match involves Denmark.
    expect(screen.getAllByText('Uruguay').length).toBeGreaterThan(0)
  })

  it('renders a live match (followed) with the in-progress state', () => {
    const m = MATCHES[0]
    const live = [{ ...m, live: { clock: "30’" } }]
    vi.setSystemTime(new Date(m.ko))
    renderNM(live, [m.t1])
    expect(screen.getByText('🔴 Live now')).toBeInTheDocument()
    expect(screen.getByText('● in progress')).toBeInTheDocument()
  })

  it('renders a live match not involving a followed team', () => {
    const m = MATCHES[0]
    const live = [{ ...m, live: { clock: "30’" } }]
    vi.setSystemTime(new Date(m.ko))
    renderNM(live) // none followed -> liveMatches[0]
    expect(screen.getByText('🔴 Live now')).toBeInTheDocument()
  })

  it('falls back to a bullet flag for unknown team names', () => {
    const m = { ...MATCHES[0], t1: 'Nowhereland', t2: 'Atlantis', ko: '2024-12-01T15:00:00-04:00' }
    vi.setSystemTime(new Date('2024-11-01T00:00:00Z'))
    renderNM([m])
    expect(screen.getAllByText('•').length).toBe(2)
  })

  it('renders a knockout-stage label', () => {
    const ko = MATCHES.find((x) => x.stage !== 'Group')
    vi.setSystemTime(new Date(new Date(ko.ko).getTime() - 3600 * 1000)) // 1h before
    renderNM([ko])
    // Stage label is the non-group STAGE_LABELS form (no "Group X").
    expect(screen.queryByText(/^Group /)).not.toBeInTheDocument()
  })

  it('jumps to the match day when the day element exists', () => {
    vi.setSystemTime(new Date('2024-06-01T12:00:00Z'))
    const { container } = renderNM(MATCHES)
    // Provide a target element for scrollIntoView.
    const target = document.createElement('div')
    // Recreate the id the component computes.
    // We don't know exact dayKey, so query the jump and stub getElementById.
    const scrollIntoView = vi.fn()
    const orig = document.getElementById
    document.getElementById = vi.fn(() => ({ scrollIntoView }))
    try {
      fireEvent.click(screen.getByText(/Jump to it/))
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    } finally {
      document.getElementById = orig
    }
    expect(container).toBeTruthy()
    target.remove()
  })

  it('jump is a no-op when the day element is missing', () => {
    vi.setSystemTime(new Date('2024-06-01T12:00:00Z'))
    renderNM(MATCHES)
    const orig = document.getElementById
    document.getElementById = vi.fn(() => null)
    try {
      // Should not throw.
      fireEvent.click(screen.getByText(/Jump to it/))
    } finally {
      document.getElementById = orig
    }
  })

  it('ticks the clock on the interval', () => {
    vi.setSystemTime(new Date('2024-06-01T12:00:00Z'))
    renderNM(MATCHES)
    const before = screen.getByLabelText('time until kickoff').textContent
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    const after = screen.getByLabelText('time until kickoff').textContent
    expect(before).not.toBe(after)
  })
})
