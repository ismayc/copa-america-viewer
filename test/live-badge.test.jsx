import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LiveBadge from '../src/components/LiveBadge.jsx'

describe('LiveBadge', () => {
  it('renders nothing when the match is not live', () => {
    const { container } = render(<LiveBadge match={{ num: 1 }} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the live clock and detail when present', () => {
    render(<LiveBadge match={{ live: { clock: "45’", detail: 'HT' } }} />)
    const badge = screen.getByRole('status')
    expect(badge).toHaveTextContent("45’")
    expect(badge).toHaveAttribute('aria-label', 'Live, HT')
    expect(badge).toHaveAttribute('title', 'HT')
    expect(badge).toHaveClass('badge-live')
  })

  // Spoiler-free mode: a minute that later reads "ET" or "90+3'" gives away a long or close match.
  it('shows only LIVE, with no clock or detail in the label or tooltip, when scores are hidden', () => {
    render(<LiveBadge match={{ live: { clock: "ET 105’", detail: 'ET 105’ - Extra Time' } }} hideScores />)
    const badge = screen.getByRole('status')
    expect(badge).toHaveTextContent(/^● LIVE$/)
    expect(badge).toHaveAttribute('aria-label', 'Live')
    expect(badge).toHaveAttribute('title', 'Live')
  })

  it('keeps the delayed word but drops its detail when scores are hidden', () => {
    render(<LiveBadge match={{ live: { delayed: true, label: 'Suspended', detail: "Suspended at 90+3’" } }} hideScores />)
    const badge = screen.getByRole('status')
    expect(badge).toHaveTextContent('Suspended')
    expect(badge).toHaveAttribute('title', 'Suspended')
  })

  it('falls back to LIVE text and default labels when clock/detail are missing', () => {
    render(<LiveBadge match={{ live: {} }} className="custom" />)
    const badge = screen.getByRole('status')
    expect(badge).toHaveTextContent('LIVE')
    expect(badge).toHaveAttribute('aria-label', 'Live')
    expect(badge).toHaveAttribute('title', 'Live')
    expect(badge).toHaveClass('custom')
  })
})
