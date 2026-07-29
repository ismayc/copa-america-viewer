import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import LiveBadge from '../src/components/LiveBadge.jsx'
import NextMatch from '../src/components/NextMatch.jsx'
import Standings from '../src/components/Standings.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { fetchLive, applyLive } from '../src/services/espn.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

describe('LiveBadge — delayed', () => {
  it('shows an amber "⏸ Delayed" badge (not the red clock) for a delayed match', () => {
    render(<LiveBadge match={{ live: { clock: 'Delay', detail: 'Delayed', delayed: true } }} />)
    const badge = screen.getByText(/⏸ Delayed/)
    expect(badge).toHaveClass('badge-delayed')
    expect(badge).toHaveAttribute('title', 'Delayed')
  })

  it('defaults the title to "Delayed" when no detail is present', () => {
    render(<LiveBadge match={{ live: { delayed: true } }} />)
    expect(screen.getByText(/⏸ Delayed/)).toHaveAttribute('title', 'Delayed')
  })

  it('still renders the red running clock for a normal live match', () => {
    render(<LiveBadge match={{ live: { clock: "45'", detail: 'First Half' } }} />)
    expect(screen.getByText(/● 45/)).toHaveClass('badge-live')
  })
})

describe('NextMatch — delayed', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ matches: [] }) }))
  })

  it('labels a delayed current match "Delayed", not "in progress"', () => {
    const m = { ...MATCHES[0], live: { clock: 'Delay', detail: 'Delayed', delayed: true }, score: [1, 0] }
    render(
      <FollowProvider>
        <NextMatch matches={[m]} tz="America/New_York" />
      </FollowProvider>,
    )
    // Appears in both the label and the countdown slot.
    expect(screen.getAllByText('⏸ Delayed').length).toBe(2)
    expect(screen.queryByText('● in progress')).not.toBeInTheDocument()
  })
})

describe('Standings — delayed group', () => {
  it('shows amber "⏸ DELAYED" + delayed dots for a group whose match is paused', () => {
    // M9 = Chile v Argentina (Group A) — mark it delayed.
    const matches = MATCHES.map((m) => (m.num === 9 ? { ...m, live: { delayed: true }, score: [1, 0] } : m))
    const { container } = render(
      <FollowProvider>
        <Standings matches={matches} hideScores={false} clinch={{}} />
      </FollowProvider>,
    )
    const groupA = screen.getByText('Group A').closest('.group-card')
    expect(within(groupA).getByText(/⏸ DELAYED/)).toBeInTheDocument()
    expect(within(groupA).queryByText(/● LIVE/)).toBeNull()
    expect(container.querySelectorAll('.row-live-dot.delayed')).toHaveLength(2)
  })
})

describe('espn — STATUS_DELAYED flows through to m.live.delayed', () => {
  const type = { state: 'in', name: 'STATUS_DELAYED', description: 'Delayed', shortDetail: 'Delay' }
  const event = {
    date: '2024-06-21T00:00Z',
    status: { type },
    competitions: [
      {
        status: { type },
        competitors: [
          { homeAway: 'home', team: { id: '1', displayName: 'Argentina' }, score: '1' },
          { homeAway: 'away', team: { id: '2', displayName: 'Canada' }, score: '0' },
        ],
      },
    ],
  }
  const fra = MATCHES.find(
    (m) => (m.t1 === 'Argentina' && m.t2 === 'Canada') || (m.t1 === 'Canada' && m.t2 === 'Argentina'),
  )

  it('flags a delayed match via fetchLive + applyLive', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ events: [event] }) }))
    const map = await fetchLive()
    const [out] = applyLive([fra], map)
    expect(out.live.delayed).toBe(true)
  })

  it('suppresses an ESPN "Delayed" within 5 minutes of kickoff (match is just starting late)', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ events: [event] }) }))
    const map = await fetchLive()
    const ko = new Date(fra.ko).getTime()
    // 2 minutes after the scheduled hour: still pre-match — no badge, no score.
    const [early] = applyLive([fra], map, ko + 2 * 60 * 1000)
    expect(early.live).toBeUndefined()
    expect(early.score).toBeUndefined()
    // 5 minutes after: the delay is real — badge shows.
    const [late] = applyLive([fra], map, ko + 5 * 60 * 1000)
    expect(late.live.delayed).toBe(true)
  })

  it('never suppresses a suspension, even right after kickoff', async () => {
    const susType = { state: 'in', name: 'STATUS_SUSPENDED', description: 'Suspended', shortDetail: 'Susp' }
    const susEvent = {
      ...event,
      status: { type: susType },
      competitions: [{ ...event.competitions[0], status: { type: susType } }],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ events: [susEvent] }) }))
    const map = await fetchLive()
    const ko = new Date(fra.ko).getTime()
    const [out] = applyLive([fra], map, ko + 60 * 1000)
    expect(out.live.delayed).toBe(true)
    expect(out.live.label).toBe('Suspended')
  })
})
