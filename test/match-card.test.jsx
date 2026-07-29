import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import MatchCard from '../src/components/MatchCard.jsx'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { groupSlotMap } from '../src/utils/bracket.js'
import { FollowProvider } from '../src/context/follow.jsx'
import { DetailContext } from '../src/context/detail.js'
import { VENUES } from '../src/data/venues.js'

const SLOT_MAP = groupSlotMap(MATCHES)
const groupMatch = MATCHES.find((m) => m.num === 1) // Argentina v Canada (Group A, the opener)
const knockoutMatch = MATCHES.find((m) => m.stage === 'QF') // placeholder team names (TBD)

function renderCard(props = {}, openDetail = () => {}) {
  return render(
    <FollowProvider>
      <DetailContext.Provider value={openDetail}>
        <MatchCard
          match={groupMatch}
          tz="America/New_York"
          slotMap={SLOT_MAP}
          {...props}
        />
      </DetailContext.Provider>
    </FollowProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  // downloadICS uses URL.createObjectURL which jsdom lacks.
  global.URL.createObjectURL = vi.fn(() => 'blob:fake')
  global.URL.revokeObjectURL = vi.fn()
})

describe('MatchCard rendering states', () => {
  it('renders an upcoming group match with the "v" separator and no badge', () => {
    vi.useFakeTimers()
    try {
      // Pin "now" before kickoff so the time-based status is "upcoming".
      vi.setSystemTime(new Date(new Date(groupMatch.ko).getTime() - 60 * 60 * 1000))
      const { container } = renderCard()
      expect(container.querySelector('.vs')).toHaveTextContent('v')
      expect(screen.getByText('Argentina')).toBeInTheDocument()
      expect(screen.getByText('Canada')).toBeInTheDocument()
      // No live/FT badge for upcoming.
      expect(screen.queryByText('FT')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders a finished match score and AET extra', () => {
    const m = { ...groupMatch, score: [2, 1], aet: true }
    const { container } = renderCard({ match: m })
    expect(container.querySelector('.score')).toHaveTextContent('2–1')
    expect(screen.getByText('AET')).toBeInTheDocument()
    expect(screen.getByLabelText('Full time')).toHaveTextContent('FT')
  })

  it('renders a finished match with penalties (pens take precedence over AET)', () => {
    const m = { ...groupMatch, score: [1, 1], aet: true, pens: [4, 3] }
    renderCard({ match: m })
    expect(screen.getByText(/pens 4–3/)).toBeInTheDocument()
    expect(screen.queryByText('AET')).not.toBeInTheDocument()
  })

  it('renders a score confirmation badge from scoreCheck', () => {
    const m = { ...groupMatch, score: [2, 0], scoreCheck: { agree: true, count: 3 } }
    renderCard({ match: m })
    expect(screen.getByText(/confirmed by 3 sources/)).toBeInTheDocument()
  })

  it('shows the LIVE badge for a match flagged live (no ESPN clock)', () => {
    const m = { ...groupMatch, live: {} }
    renderCard({ match: m })
    expect(screen.getByText('● LIVE')).toBeInTheDocument()
  })

  it('renders an optional per-match note by the kickoff time', () => {
    renderCard({ match: { ...groupMatch, note: 'Delayed start due to weather' } })
    expect(screen.getByText('(Delayed start due to weather)')).toBeInTheDocument()
  })

  it('shows "Delayed" (not LIVE) when past kickoff but no live feed yet', () => {
    vi.useFakeTimers()
    try {
      // "now" is inside the match window but there's no ESPN live flag → the match
      // is past kickoff and not confirmed started, so it reads Delayed, not LIVE.
      vi.setSystemTime(new Date(groupMatch.ko))
      renderCard()
      expect(screen.getByText(/Delayed/)).toBeInTheDocument()
      expect(screen.queryByText('● LIVE')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('MatchCard spoiler mode', () => {
  it('hides the score behind a tap-to-reveal pill and reveals on click', () => {
    const m = { ...groupMatch, score: [3, 0], scoreCheck: { agree: true, count: 2 } }
    const { container } = renderCard({ match: m, hidden: true })
    expect(screen.getByText('tap to reveal')).toBeInTheDocument()
    // ScoreCheck is hidden while the score is hidden.
    expect(screen.queryByText(/confirmed by/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Reveal score'))
    expect(container.querySelector('.score')).toHaveTextContent('3–0')
    expect(screen.getByText(/confirmed by 2 sources/)).toBeInTheDocument()
  })
})

describe('MatchCard team follow + clinch + slot tooltip', () => {
  it('toggles follow state when the star is clicked', () => {
    renderCard()
    const followBtn = screen.getByRole('button', { name: 'Follow Argentina' })
    fireEvent.click(followBtn)
    expect(screen.getByRole('button', { name: 'Unfollow Argentina' })).toBeInTheDocument()
  })

  it('renders a clinch badge for a team', () => {
    renderCard({ clinch: { Argentina: 'won-group' } })
    expect(screen.getByText(/Won group/)).toBeInTheDocument()
  })

  it('shows the eliminated slot tooltip', () => {
    renderCard({ clinch: { Argentina: 'eliminated' } })
    expect(screen.getByText('Argentina').getAttribute('title')).toMatch(
      /Eliminated from Group A/,
    )
  })

  it('renders TBD placeholder team (no flag) for a knockout slot', () => {
    render(
      <FollowProvider>
        <DetailContext.Provider value={() => {}}>
          <MatchCard match={knockoutMatch} tz="America/New_York" slotMap={SLOT_MAP} />
        </DetailContext.Provider>
      </FollowProvider>,
    )
    // Placeholder names have no flag → fallback flag, no follow star, no slot tooltip.
    expect(screen.getByText(knockoutMatch.t1)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Follow/ })).not.toBeInTheDocument()
  })
})

describe('MatchCard potential-matchup (feeder) expansion', () => {
  // A knockout slot ("Winner Match 25") whose source tie has both real teams
  // expands into the candidate pair, mirroring the Bracket — instead of the
  // cryptic placeholder label. Semi-final 29 is fed by quarter-finals 25 and 26,
  // which is the real Copa topology.
  const feederMatch = {
    num: 29,
    stage: 'SF',
    ko: '2024-07-09T20:00:00-04:00',
    venue: knockoutMatch.venue,
    t1: 'Winner Match 25',
    t2: 'Winner Match 26',
  }
  const byNum = {
    25: { num: 25, t1: 'Argentina', t2: 'Ecuador' },
    26: { num: 26, t1: 'Venezuela', t2: 'Canada' },
  }

  function renderFeeder(props = {}) {
    return render(
      <FollowProvider>
        <DetailContext.Provider value={() => {}}>
          <MatchCard match={feederMatch} tz="America/New_York" slotMap={SLOT_MAP} byNum={byNum} {...props} />
        </DetailContext.Provider>
      </FollowProvider>,
    )
  }

  it('expands a resolved feed slot into its candidate pair', () => {
    const { container } = renderFeeder()
    // Both candidate teams of each feeding tie are shown, joined by a slash.
    expect(screen.getByText('Argentina')).toBeInTheDocument()
    expect(screen.getByText('Ecuador')).toBeInTheDocument()
    expect(screen.getByText('Venezuela')).toBeInTheDocument()
    expect(screen.getByText('Canada')).toBeInTheDocument()
    expect(container.querySelectorAll('.feeder-slash').length).toBe(2)
    // The pair carries a descriptive title for the source tie.
    expect(container.querySelector('.feeder-pair').getAttribute('title')).toMatch(
      /Winner of Match 25: Argentina or Ecuador/,
    )
    // The raw placeholder label is never rendered.
    expect(screen.queryByText('Winner Match 25')).not.toBeInTheDocument()
  })

  it('leaves the placeholder label when the source tie is unresolved', () => {
    // No byNum entries → nothing to expand, so the raw label shows.
    render(
      <FollowProvider>
        <DetailContext.Provider value={() => {}}>
          <MatchCard match={feederMatch} tz="America/New_York" slotMap={SLOT_MAP} byNum={{}} />
        </DetailContext.Provider>
      </FollowProvider>,
    )
    expect(screen.getByText('Winner Match 25')).toBeInTheDocument()
    expect(screen.queryByText('Argentina')).not.toBeInTheDocument()
  })
})

describe('MatchCard actions', () => {
  it('toggles the "How to watch" panel and shows both feeds by default', () => {
    renderCard()
    const toggle = screen.getByRole('button', { name: /How to watch/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('English')).toBeInTheDocument()
    expect(screen.getByText('Spanish')).toBeInTheDocument()
  })

  it('shows only the english feed when feed="english"', () => {
    renderCard({ feed: 'english' })
    fireEvent.click(screen.getByRole('button', { name: /How to watch/ }))
    expect(screen.getByText('English')).toBeInTheDocument()
    expect(screen.queryByText('Spanish')).not.toBeInTheDocument()
  })

  it('shows only the spanish feed when feed="spanish"', () => {
    renderCard({ feed: 'spanish' })
    fireEvent.click(screen.getByRole('button', { name: /How to watch/ }))
    expect(screen.getByText('Spanish')).toBeInTheDocument()
    expect(screen.queryByText('English')).not.toBeInTheDocument()
  })

  it('renders the free-over-the-air chip tag', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /How to watch/ }))
    // At least one feed marks a TV channel as free.
    expect(screen.getAllByText('free').length).toBeGreaterThan(0)
  })

  it('downloads an ICS file when "Add to calendar" is clicked', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Add to calendar/ }))
    expect(global.URL.createObjectURL).toHaveBeenCalled()
  })

  it('opens the detail modal via the Details button', () => {
    const openDetail = vi.fn()
    renderCard({}, openDetail)
    fireEvent.click(screen.getByRole('button', { name: /Details/ }))
    expect(openDetail).toHaveBeenCalledWith(groupMatch)
  })
})

describe('MatchCard venue local time', () => {
  it('shows the venue local clock when it differs from the viewer clock', () => {
    // A non-Eastern venue match viewed from New York differs in clock time.
    const pacificMatch = MATCHES.find((m) => {
      const tz = VENUES[m.venue]?.tz
      return tz === 'America/Los_Angeles' || tz === 'America/Vancouver'
    })
    render(
      <FollowProvider>
        <DetailContext.Provider value={() => {}}>
          <MatchCard match={pacificMatch} tz="America/New_York" slotMap={SLOT_MAP} />
        </DetailContext.Provider>
      </FollowProvider>,
    )
    expect(screen.getByText(/local/)).toBeInTheDocument()
  })

  it('omits the venue local clock when viewer tz matches the venue tz', () => {
    // Viewing in the venue's own timezone makes sameClock true.
    const m = MATCHES.find((x) => x.num === 1)
    render(
      <FollowProvider>
        <DetailContext.Provider value={() => {}}>
          <MatchCard match={m} tz={VENUES[m.venue].tz} slotMap={SLOT_MAP} />
        </DetailContext.Provider>
      </FollowProvider>,
    )
    expect(screen.queryByText(/local$/)).not.toBeInTheDocument()
  })
})
