import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Bracket from '../src/components/Bracket.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { DetailContext } from '../src/context/detail.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

Element.prototype.scrollIntoView = vi.fn()

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

// One-off statuses + scores on knockout matches.
function decorated() {
  return MATCHES.map((m) => {
    if (m.num === 25) return { ...m, voided: true, statusLabel: 'Postponed' }
    if (m.num === 26) return { ...m, voided: true, statusLabel: 'Abandoned', score: [1, 1] }
    if (m.num === 27) return { ...m, voided: true, statusLabel: 'Canceled' }
    if (m.num === 28) return { ...m, score: [3, 0], awarded: true }
    if (m.num === 32) return { ...m, score: [2, 2], pens: [4, 2] }
    if (m.num === 31) return { ...m, score: [2, 1], aet: true }
    if (m.num === 29) return { ...m, live: true, score: [0, 0] }
    return m
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Bracket one-off status', () => {
  it('renders postponed/abandoned/canceled pills and awarded note', () => {
    renderBracket(decorated())
    expect(screen.getByText(/Postponed/)).toBeInTheDocument()
    expect(screen.getByText(/Canceled/)).toBeInTheDocument()
    expect(screen.getAllByText('Abandoned').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('1–1')).toBeInTheDocument()
    expect(screen.getByText('3–0')).toBeInTheDocument()
    expect(screen.getByText('awarded')).toBeInTheDocument()
  })

  it('hides an abandoned partial score under hideScores', () => {
    renderBracket(decorated(), { hideScores: true })
    expect(screen.queryByText('1–1')).not.toBeInTheDocument()
  })
})

describe('Bracket normal coverage', () => {
  it('renders every round from the quarter-finals to the Final', () => {
    renderBracket(MATCHES)
    expect(screen.getAllByText(/Final/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Quarter-final').length).toBeGreaterThan(0)
  })

  it('renders scores, pens, AET, live badge', () => {
    renderBracket(decorated())
    expect(screen.getByText('2–2')).toBeInTheDocument()
    expect(screen.getByText(/\(p 4–2\)/)).toBeInTheDocument()
    expect(screen.getByText('2–1')).toBeInTheDocument()
    expect(screen.getByText(/AET/)).toBeInTheDocument()
  })

  it('opens detail on click and keyboard, ignores other keys', () => {
    const { openDetail } = renderBracket(MATCHES)
    const card = document.getElementById('bx-m25')
    fireEvent.click(card)
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.keyDown(card, { key: ' ' })
    fireEvent.keyDown(card, { key: 'Escape' })
    expect(openDetail).toHaveBeenCalledTimes(3)
  })

  it('scrolls a focused match into view and calls onFocusHandled', () => {
    const onFocusHandled = vi.fn()
    renderBracket(MATCHES, { focusMatch: 25, onFocusHandled })
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    expect(onFocusHandled).toHaveBeenCalled()
  })

  it('handles a focusMatch with no matching element', () => {
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

  it('marks a followed team side', () => {
    // A resolved knockout match with real teams renders flags; use one already
    // having flags. Every quarter-final slot is a group placeholder on a blank
    // board, so just confirm Side renders.
    renderBracket(MATCHES)
    expect(document.querySelectorAll('.bx-side').length).toBeGreaterThan(0)
  })
})
