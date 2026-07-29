import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScoreCheck from '../src/components/ScoreCheck.jsx'

describe('ScoreCheck', () => {
  it('renders nothing without a scoreCheck', () => {
    const { container } = render(<ScoreCheck match={{ num: 1 }} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the full agree label by default', () => {
    render(<ScoreCheck match={{ scoreCheck: { agree: true, count: 3 } }} />)
    const el = screen.getByText('✓ confirmed by 3 sources')
    expect(el).toHaveAttribute('aria-label', 'Final score confirmed by 3 independent sources')
    expect(el).toHaveClass('score-check')
  })

  it('shows the compact agree form', () => {
    render(<ScoreCheck match={{ scoreCheck: { agree: true, count: 2 } }} compact />)
    expect(screen.getByText('✓2')).toBeInTheDocument()
  })

  it('shows the full disagree warning', () => {
    render(<ScoreCheck match={{ scoreCheck: { agree: false, count: 2 } }} />)
    const el = screen.getByText('⚠ sources disagree on this score')
    expect(el).toHaveAttribute('aria-label', 'Sources report different final scores')
    expect(el).toHaveClass('score-check-warn')
  })

  it('shows the compact disagree form', () => {
    render(<ScoreCheck match={{ scoreCheck: { agree: false, count: 3 } }} compact />)
    expect(screen.getByText('⚠')).toBeInTheDocument()
  })
})
