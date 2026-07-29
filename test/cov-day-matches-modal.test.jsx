import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DayMatchesModal from '../src/components/DayMatchesModal.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { DetailContext } from '../src/context/detail.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

const GROUP_MATCH = MATCHES.find((m) => m.stage === 'Group')

const renderModal = (props = {}) => {
  const openDetail = vi.fn()
  const onClose = vi.fn()
  const result = render(
    <FollowProvider>
      <DetailContext.Provider value={openDetail}>
        <DayMatchesModal
          matches={[GROUP_MATCH]}
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

describe('DayMatchesModal (coverage)', () => {
  it('renders the "vs" placeholder and an Upcoming badge for a future match (lines 52 + 72)', () => {
    // The bundled match is in the past, so push its kickoff into the future to
    // get the upcoming (no-score) branch.
    const m = { ...GROUP_MATCH, ko: '2099-06-11T15:00:00-04:00' }
    renderModal({ matches: [m] })
    expect(document.querySelector('.gg-vs')).toBeTruthy()
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
  })

  it('renders a live badge and a voided badge (lines 66 + 68)', () => {
    const live = { ...GROUP_MATCH, num: 9001, live: { clock: "70'", detail: '' }, score: [1, 0] }
    const voided = { ...GROUP_MATCH, num: 9002, voided: true, statusLabel: 'Postponed' }
    renderModal({ matches: [live, voided] })
    expect(screen.getByText('Postponed')).toBeInTheDocument()
    expect(document.querySelector('.dm-status')).toBeTruthy()
  })

  it('renders a finished score and the FT badge', () => {
    const m = { ...GROUP_MATCH, score: [3, 2] }
    renderModal({ matches: [m] })
    expect(screen.getByText('3–2')).toBeInTheDocument()
    expect(screen.getByText('FT')).toBeInTheDocument()
  })

  it('hides scores in spoiler-free mode and reveals on click (lines 49-50 + 107-112)', () => {
    const m = { ...GROUP_MATCH, score: [2, 1] }
    renderModal({ matches: [m], hideScores: true })
    expect(screen.getByText(/Scores hidden in spoiler-free mode/)).toBeInTheDocument()
    expect(document.querySelector('.gg-score-hidden')).toBeTruthy()
    expect(screen.queryByText('2–1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Reveal scores/ }))
    expect(screen.getByText('2–1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reveal scores/ })).not.toBeInTheDocument()
  })

  it('opens detail (and closes itself) when a row is clicked', () => {
    const m = { ...GROUP_MATCH, score: [1, 0] }
    const { openDetail, onClose } = renderModal({ matches: [m] })
    fireEvent.click(screen.getByText('1–0').closest('button'))
    expect(onClose).toHaveBeenCalled()
    expect(openDetail).toHaveBeenCalledTimes(1)
  })

  it('renders the "Schedule" title and "0 matches" for an empty day', () => {
    renderModal({ matches: [] })
    expect(screen.getByText('Schedule')).toBeInTheDocument()
    expect(screen.getByText(/0 matches/)).toBeInTheDocument()
  })

  it('expands resolved knockout slots into their candidate pairs (lines 45 + 67)', () => {
    const feeder = {
      ...GROUP_MATCH,
      num: 29,
      stage: 'SF',
      t1: 'Winner Match 25',
      t2: 'Winner Match 26',
    }
    const byNum = {
      25: { num: 25, t1: 'Argentina', t2: 'Ecuador' },
      26: { num: 26, t1: 'Venezuela', t2: 'Canada' },
    }
    renderModal({ matches: [feeder], byNum })
    // Both sides expand to their potential matchup rather than the raw label.
    expect(screen.getByText('Argentina')).toBeInTheDocument()
    expect(screen.getByText('Ecuador')).toBeInTheDocument()
    expect(screen.getByText('Venezuela')).toBeInTheDocument()
    expect(screen.getByText('Canada')).toBeInTheDocument()
    expect(document.querySelectorAll('.feeder-slash').length).toBe(2)
    expect(screen.queryByText('Winner Match 25')).not.toBeInTheDocument()
  })

  it('shows a Delayed badge when past kickoff with no live feed or score (line 88)', () => {
    vi.useFakeTimers()
    try {
      // "now" pinned to kickoff → inside the window but no ESPN clock / score.
      vi.setSystemTime(new Date(GROUP_MATCH.ko))
      renderModal({ matches: [{ ...GROUP_MATCH, num: 9003 }] })
      expect(screen.getByText('Delayed')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
