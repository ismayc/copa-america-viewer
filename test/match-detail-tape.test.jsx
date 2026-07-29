import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import MatchDetail from '../src/components/MatchDetail.jsx'
import { FollowProvider } from '../src/context/follow.jsx'

// A finished mini-tournament so both semifinalists have records.
const allMatches = [
  { num: 1, stage: 'Group', group: 'A', t1: 'Uruguay', t2: 'Panama', venue: 'metlife', ko: '2024-06-23T21:00:00-04:00', score: [2, 0] },
  { num: 2, stage: 'Group', group: 'B', t1: 'Colombia', t2: 'Brazil', venue: 'metlife', ko: '2024-06-24T18:00:00-04:00', score: [1, 1] },
  { num: 97, stage: 'QF', t1: 'Uruguay', t2: 'Brazil', venue: 'metlife', ko: '2024-07-04T18:00:00-04:00', score: [1, 1], pens: [4, 3] },
  { num: 98, stage: 'QF', t1: 'Colombia', t2: 'Panama', venue: 'metlife', ko: '2024-07-04T21:00:00-04:00', score: [3, 1], cards: { t1: [{ color: 'yellow' }], t2: [] } },
]
const semi = { num: 101, stage: 'SF', t1: 'Uruguay', t2: 'Colombia', venue: 'attstadium', ko: '2024-07-09T20:00:00-04:00' }

const renderDetail = (props = {}) =>
  render(
    <FollowProvider>
      <MatchDetail match={semi} tz="America/New_York" onClose={vi.fn()} allMatches={allMatches} {...props} />
    </FollowProvider>,
  )

describe('MatchDetail tale of the tape', () => {
  it('shows both teams’ tournament records for an upcoming knockout tie', () => {
    renderDetail()
    expect(screen.getByText('Tournament so far')).toBeInTheDocument()
    // Uruguay 2W (one on pens); Colombia 1W 1D.
    expect(screen.getByText('2–0–0 (1 on pens)')).toBeInTheDocument()
    expect(screen.getByText('1–1–0')).toBeInTheDocument()
    // CONMEBOL's last tie-breaker is a drawing of lots, so — unlike the Euro
    // sibling — there is no ranking row to show as a tie-breaker's value.
    expect(screen.queryByText(/ranking/i)).toBeNull()
    // Card row appears (Colombia has card data) and is flagged best-effort.
    expect(screen.getByText('Cards')).toBeInTheDocument()
    expect(screen.getByText(/best-effort/)).toBeInTheDocument()
  })

  it('a played match shows the records the teams took INTO it, not today’s', () => {
    // Viewing the QF (Jul 10): only the group games (Jun 12/13) predate it —
    // the QF itself must not count toward its own tape.
    renderDetail({ match: allMatches[2] })
    expect(screen.getByText('Going into this match')).toBeInTheDocument()
    expect(screen.queryByText('Tournament so far')).not.toBeInTheDocument()
    expect(screen.getByText('1–0–0')).toBeInTheDocument() // Uruguay: group win only
    expect(screen.getByText('0–1–0')).toBeInTheDocument() // Brazil: group draw only
    expect(screen.queryByText(/on pens/)).not.toBeInTheDocument()
  })

  it('does not render for a group match or a placeholder tie', () => {
    renderDetail({ match: allMatches[0] })
    expect(screen.queryByText('Tournament so far')).not.toBeInTheDocument()
  })

  it('skips placeholder knockout slots (no real teams yet)', () => {
    renderDetail({ match: { ...semi, t1: 'Winner Match 97', t2: 'Winner Match 98' } })
    expect(screen.queryByText('Tournament so far')).not.toBeInTheDocument()
  })

  it('hides the records behind a reveal in spoiler-free mode', () => {
    renderDetail({ hideScores: true })
    expect(screen.queryByText('W–D–L')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('🙈 reveal team records'))
    expect(screen.getByText('W–D–L')).toBeInTheDocument()
  })

  it('renders without the section when allMatches is not provided', () => {
    render(
      <FollowProvider>
        <MatchDetail match={semi} tz="America/New_York" onClose={vi.fn()} />
      </FollowProvider>,
    )
    expect(screen.queryByText('Tournament so far')).not.toBeInTheDocument()
  })
})
