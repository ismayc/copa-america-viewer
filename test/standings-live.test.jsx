import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { FollowProvider } from '../src/context/follow.jsx'
import Standings from '../src/components/Standings.jsx'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

const renderStandings = (matches) =>
  render(
    <FollowProvider>
      <Standings matches={matches} hideScores={false} clinch={{}} />
    </FollowProvider>,
  )

describe('Standings live (in-progress) markers', () => {
  it('blinks a LIVE marker on the group and a dot on both playing teams', () => {
    // M1 = Argentina v Canada (Group A) — mark it in progress.
    const matches = MATCHES.map((m) =>
      m.num === 1 ? { ...m, live: { clock: "45'" }, score: [1, 0] } : m,
    )
    const { container } = renderStandings(matches)

    const groupA = screen.getByText('Group A').closest('.group-card')
    expect(within(groupA).getByText(/● LIVE/)).toBeInTheDocument()
    // Both teams in the live match get a provisional dot; no other group does.
    expect(container.querySelectorAll('.row-live-dot')).toHaveLength(2)
    expect(screen.getByText('Group B').closest('.group-card').querySelector('.group-live')).toBeNull()
  })

  it('shows no LIVE markers when nothing is in progress', () => {
    const { container } = renderStandings(MATCHES)
    expect(container.querySelector('.group-live')).toBeNull()
    expect(container.querySelectorAll('.row-live-dot')).toHaveLength(0)
  })
})
